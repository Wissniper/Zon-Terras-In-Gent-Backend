import { calculateSunData } from "./sunService.js";
import Weather from "../models/weatherModel.js";
import { haversineDistance } from "./geoUtils.js";

/**
 * Recompute the `intensity` field on each item using the *current* sun
 * position + freshest cloud factor for that location. Mutates in place.
 *
 * Why this exists:
 * The Terras / Restaurant / Event documents carry a cached `intensity` field
 * that's only refreshed by the hourly weather cron OR lazily when someone
 * hits `GET /api/sun/<entity>/:id`. Between those touches the value is stale
 * by up to 60 minutes, which causes the search/list endpoints to disagree
 * with the per-entity sun endpoint.
 *
 * Performance: the naive approach (one `$near` weather query per item) was
 * fast locally but timed out behind nginx in production with hundreds of
 * items. Instead we do ONE bulk query for all recent weather points, then
 * pick the nearest in memory per item — O(W × N) JS instead of N geo queries.
 */

// Match getCloudFactor's `$near` $maxDistance — measured in metres, geodesic.
// Degree-Euclidean was anisotropic at 51° lat (~630 m E-W, ~1000 m N-S) and
// caused the list endpoint to silently drop cloud factor for terraces near
// the threshold while /api/sun/* still found one via $near.
const CLOUD_LOOKUP_RADIUS_M = 1000;

interface WeatherPoint {
  lng: number;
  lat: number;
  cloudFactor: number;
}

export async function loadRecentWeather(): Promise<WeatherPoint[]> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const docs = await Weather.find(
    { timestamp: { $gte: oneHourAgo } },
    { "location.coordinates": 1, cloudFactor: 1 },
  ).lean();
  return docs
    .filter((d) => d.location?.coordinates && d.location.coordinates.length >= 2)
    .map((d) => ({
      lng: Number(d.location!.coordinates![0]),
      lat: Number(d.location!.coordinates![1]),
      cloudFactor: Number(d.cloudFactor),
    }));
}

export function nearestCloudFactor(points: WeatherPoint[], lat: number, lng: number): number | undefined {
  if (points.length === 0) return undefined;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = haversineDistance(lat, lng, points[i].lat, points[i].lng);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx >= 0 && bestDist < CLOUD_LOOKUP_RADIUS_M ? points[bestIdx].cloudFactor : undefined;
}

/**
 * Single source of truth for intensity math. Every endpoint that returns an
 * `intensity` to the frontend (leaderboard, discover list, terras detail,
 * map popup, marker enrichment) MUST go through this function so the four
 * surfaces never disagree.
 *
 * Formula: round(sin(altitude) * 100 * (1 - cloudFactor/100) * shadowScore),
 * clamped to 0 when altitude <= 0 (night).
 */
export function computeIntensity(
  weatherPoints: WeatherPoint[],
  lat: number,
  lng: number,
  when: Date,
  shadowScore: number = 1.0,
): {
  intensity: number;
  shadowScore: number;
  cloudFactor: number | undefined;
  isNight: boolean;
  sun: ReturnType<typeof calculateSunData>;
} {
  const cf = nearestCloudFactor(weatherPoints, lat, lng);
  const sun = calculateSunData(when, lat, lng, cf);
  const isNight = sun.position.altitude <= 0;
  const intensity = isNight ? 0 : Math.round(sun.intensity * shadowScore);
  return { intensity, shadowScore, cloudFactor: cf, isNight, sun };
}

export async function recomputeIntensities(items: any[], targetTime?: Date): Promise<void> {
  if (!items || items.length === 0) return;
  const when = targetTime ?? new Date();
  const weatherPoints = await loadRecentWeather();

  for (const it of items) {
    const coords = it?.location?.coordinates;
    if (!coords || coords.length < 2) continue;

    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    const shadowScore = typeof it.shadowScore === "number" ? it.shadowScore : 1.0;

    const r = computeIntensity(weatherPoints, lat, lng, when, shadowScore);
    it.intensity = r.intensity;
    if (r.isNight) it.isNight = true;
  }
}
