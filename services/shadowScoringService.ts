// @ts-ignore
import SunCalc from "suncalc3";
import mongoose from "mongoose";
import ShadowScore from "../models/shadowScoreModel.js";

export interface Building {
  polygon: [number, number][]; // [lng, lat] vertices
  height: number;              // metres
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const GHENT_BBOX = "51.0,3.65,51.1,3.75";

export function resolveHeight(tags: Record<string, string> = {}): number {
  if (tags.height) {
    const h = parseFloat(tags.height);
    if (!isNaN(h)) return h;
  }
  if (tags["building:levels"]) {
    const l = parseFloat(tags["building:levels"]);
    if (!isNaN(l)) return l * 3.5;
  }
  return 10;
}

export async function fetchGhentBuildings(): Promise<Building[]> {
  const query = `[out:json];way["building"](${GHENT_BBOX});out body geom;`;
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = (await res.json()) as { elements: any[] };
  return data.elements
    .filter((el: any) => Array.isArray(el.geometry) && el.geometry.length > 0)
    .map((el: any) => ({
      polygon: el.geometry.map((pt: any) => [pt.lon, pt.lat] as [number, number]),
      height: resolveHeight(el.tags ?? {}),
    }));
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

export function computeShadowScore(
  terrasLat: number,
  terrasLng: number,
  datetime: Date,
  buildings: Building[]
): number {
  const pos = (SunCalc as any).getPosition(datetime, terrasLat, terrasLng);
  if (pos.altitude <= 0) return 1.0;

  const latRad = (terrasLat * Math.PI) / 180;
  const shadowPolygons: [number, number][][] = [];

  for (const building of buildings) {
    const shadowLength = building.height / Math.tan(pos.altitude);
    const shadowDir = pos.azimuth + Math.PI;
    const dLat = shadowLength / 111320;
    const dLng = shadowLength / (111320 * Math.cos(latRad));
    const shadowPoly = building.polygon.map(
      ([lng, lat]) =>
        [lng + dLng * Math.sin(shadowDir), lat + dLat * Math.cos(shadowDir)] as [number, number]
    );
    shadowPolygons.push(shadowPoly);
  }

  // 5 sample points: centre + ±0.5 m offset (0.5 / 111320 ≈ 0.0000045°)
  const d = 0.5 / 111320;
  const samples: [number, number][] = [
    [terrasLng, terrasLat],
    [terrasLng, terrasLat + d],
    [terrasLng, terrasLat - d],
    [terrasLng + d, terrasLat],
    [terrasLng - d, terrasLat],
  ];

  let clearCount = 0;
  for (const sample of samples) {
    if (!shadowPolygons.some((poly) => pointInPolygon(sample, poly))) clearCount++;
  }
  return clearCount / 5;
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
