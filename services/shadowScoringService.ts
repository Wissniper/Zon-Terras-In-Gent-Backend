// @ts-ignore
import SunCalc from "suncalc3";
import mongoose from "mongoose";
import ShadowScore from "../models/shadowScoreModel.js";

export interface Building {
  polygon: [number, number][]; // [lng, lat] vertices
  height: number;              // metres
  cx: number;                  // centroid longitude (precomputed)
  cy: number;                  // centroid latitude  (precomputed)
  halfWidth: number;           // max distance from centroid to any vertex, metres (precomputed)
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const GHENT_BBOX = "51.0,3.65,51.1,3.75";
const MAX_SHADOW_DIST = 200; // metres — buildings beyond this cannot meaningfully shadow a terras

export function resolveHeight(tags: Record<string, string> = {}): number {
  if (tags.height) {
    const h = parseFloat(tags.height);
    if (!isNaN(h)) return h;
  }
  if (tags["building:levels"]) {
    const l = parseFloat(tags["building:levels"]);
    if (!isNaN(l)) return l * 3.5;
  }
  // Most tag-less OSM "type=house" in Ghent are 2-3 storey rowhouses (~10m).
  // Going higher systematically over-shadows terraces in dense neighbourhoods.
  return 10;
}

export async function fetchGhentBuildings(): Promise<Building[]> {
  // [timeout:90] causes Overpass to sanitize output and avoid truncated responses on large bboxes
  const query = `[out:json][timeout:90];way["building"](${GHENT_BBOX});out geom tags;`;
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "User-Agent": "ZonTerrasInGent/1.0",
    },
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const raw = await res.text();
  let data: { elements: any[] };
  try {
    data = JSON.parse(raw);
  } catch {
    // Strip control characters that sometimes appear in OSM tag values
    const sanitized = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    data = JSON.parse(sanitized);
  }

  return data.elements
    .filter((el: any) => Array.isArray(el.geometry) && el.geometry.length >= 3)
    .map((el: any) => {
      const polygon: [number, number][] = el.geometry.map((pt: any) => [pt.lon, pt.lat] as [number, number]);
      const height = resolveHeight(el.tags ?? {});

      // Precompute centroid
      const cx = polygon.reduce((s, [x]) => s + x, 0) / polygon.length;
      const cy = polygon.reduce((s, [, y]) => s + y, 0) / polygon.length;

      // Precompute half-width: max distance from centroid to any vertex, in metres
      const halfWidth = Math.max(...polygon.map(([lng, lat]) => {
        const dx = (lng - cx) * 111320 * Math.cos((cy * Math.PI) / 180);
        const dy = (lat - cy) * 111320;
        return Math.sqrt(dx * dx + dy * dy);
      }));

      return { polygon, height, cx, cy, halfWidth };
    });
}

function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Returns the fraction of the terras NOT in shadow (1.0 = fully in sun, 0.0 = fully in shadow).
 *
 * Shadow algorithm (shadow-axis bounding box):
 *   For each nearby building B, project all its vertices onto two axes:
 *     - along:  the shadow direction  (shadowSin, shadowCos)
 *     - perp:   perpendicular to shadow (-shadowCos, shadowSin)
 *   This gives the building's actual silhouette width (perpMin..perpMax) and depth
 *   (alongMin..alongMax) as seen from the sun.
 *
 *   The shadow region (footprint + strip behind it) occupies:
 *     along ∈ [alongMin, alongMax + shadowLength]
 *     perp  ∈ [perpMin, perpMax]
 *
 *   Points on the sun-facing side of the building have along < alongMin and are
 *   correctly excluded. Including [alongMin, alongMax] is necessary so that a
 *   terras tucked against / partly under a building's footprint is recognised
 *   as shadowed.
 */
export function computeShadowScore(
  terrasLat: number,
  terrasLng: number,
  datetime: Date,
  buildings: Building[]
): number {
  const pos = (SunCalc as any).getPosition(datetime, terrasLat, terrasLng);
  if (pos.altitude <= 0) return 1.0; // night — shadow score irrelevant, intensity already 0

  const latRad = (terrasLat * Math.PI) / 180;
  const metersToLat = 1 / 111320;
  const metersToLng = 1 / (111320 * Math.cos(latRad));

  // OSM places café/restaurant nodes INSIDE their host building's footprint.
  // The terras's outdoor seating is on the sidewalk just outside that wall, not
  // under the building's own roof. Find any building that contains the terras
  // point and exclude it so the host building does not shadow its own terras.
  // The centroid pre-filter (halfWidth in metres) avoids running pointInPolygon
  // against all 95k Ghent buildings.
  let containingId = -1;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const dcx = (b.cx - terrasLng) / metersToLng;
    const dcy = (b.cy - terrasLat) / metersToLat;
    if (Math.sqrt(dcx * dcx + dcy * dcy) > b.halfWidth) continue;
    if (pointInPolygon([terrasLng, terrasLat], b.polygon)) {
      containingId = i;
      break;
    }
  }

  const shadowDir = pos.azimuth + Math.PI; // shadow falls opposite to sun
  const shadowSin = Math.sin(shadowDir);
  const shadowCos = Math.cos(shadowDir);

  // 9 sample points on a 3×3 grid covering a 1 m × 1 m area around the terras centre.
  // Tight grid keeps samples on the actual terras footprint instead of drifting into
  // adjacent buildings on narrow Ghent sidewalks. Still gives non-binary scores when
  // a shadow boundary cuts across the terras.
  const offsets = [-0.5, 0, 0.5]; // metres
  const samples: [number, number][] = [];
  for (const dxM of offsets) {
    for (const dyM of offsets) {
      samples.push([
        terrasLng + dxM * metersToLng,
        terrasLat + dyM * metersToLat,
      ]);
    }
  }

  let clearCount = 0;

  for (const sample of samples) {
    let inShadow = false;

    for (let bi = 0; bi < buildings.length; bi++) {
      if (bi === containingId) continue;
      const b = buildings[bi];
      // --- Fast distance pre-filter ---
      const dcx = (b.cx - sample[0]) / metersToLng;
      const dcy = (b.cy - sample[1]) / metersToLat;
      if (Math.sqrt(dcx * dcx + dcy * dcy) > MAX_SHADOW_DIST + b.halfWidth) continue;

      // Shadow length capped to avoid absurd values at dawn/dusk
      const shadowLength = Math.min(b.height / Math.tan(pos.altitude), MAX_SHADOW_DIST);

      // --- Project all building vertices onto (along, perp) axes ---
      // Vectors are relative to building centroid, in metres.
      let alongMin = Infinity, alongMax = -Infinity;
      let perpMin  = Infinity, perpMax  = -Infinity;
      for (const [vlng, vlat] of b.polygon) {
        const vx = (vlng - b.cx) / metersToLng;
        const vy = (vlat - b.cy) / metersToLat;
        const along =  vx * shadowSin + vy * shadowCos;
        const perp  = -vx * shadowCos + vy * shadowSin;
        if (along < alongMin) alongMin = along;
        if (along > alongMax) alongMax = along;
        if (perp  < perpMin)  perpMin  = perp;
        if (perp  > perpMax)  perpMax  = perp;
      }

      // --- Project sample point onto same axes ---
      const sx = (sample[0] - b.cx) / metersToLng;
      const sy = (sample[1] - b.cy) / metersToLat;
      const sAlong =  sx * shadowSin + sy * shadowCos;
      const sPerp  = -sx * shadowCos + sy * shadowSin;

      // Shadow region = building footprint + strip extending shadowLength behind it.
      // Start at alongMin (sun-facing edge of footprint) so points inside the
      // footprint are correctly counted as shadowed.
      if (
        sAlong >= alongMin &&
        sAlong <= alongMax + shadowLength &&
        sPerp  >= perpMin &&
        sPerp  <= perpMax
      ) {
        inShadow = true;
        break;
      }
    }

    if (!inShadow) clearCount++;
  }

  return clearCount / samples.length;
}

export async function getNearestShadowScore(
  terrasId: mongoose.Types.ObjectId,
  datetime: Date
): Promise<number> {
  const [before, after] = await Promise.all([
    ShadowScore.findOne({ terrasRef: terrasId, timestamp: { $lte: datetime } }).sort({ timestamp: -1 }),
    ShadowScore.findOne({ terrasRef: terrasId, timestamp: { $gt: datetime } }).sort({ timestamp: 1 }),
  ]);

  if (!before && !after) return 1.0;
  if (!before) return after!.score;
  if (!after) return before.score;

  const diffBefore = datetime.getTime() - before.timestamp.getTime();
  const diffAfter = after.timestamp.getTime() - datetime.getTime();
  return diffBefore <= diffAfter ? before.score : after.score;
}
