import { calculateSunData } from "./sunService.js";
import Weather from "../models/weatherModel.js";

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

// Squared-degree distance below which we consider two points "co-located".
// 0.009° ≈ 1 km, matches the previous `$near` $maxDistance: 1000 constraint.
const ONE_KM_SQ_DEG = 0.009 ** 2;

interface WeatherPoint {
  lng: number;
  lat: number;
  cloudFactor: number;
}

async function loadRecentWeather(): Promise<WeatherPoint[]> {
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

function nearestCloudFactor(points: WeatherPoint[], lat: number, lng: number): number | undefined {
  if (points.length === 0) return undefined;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const dLng = points[i].lng - lng;
    const dLat = points[i].lat - lat;
    const d = dLng * dLng + dLat * dLat;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestDist < ONE_KM_SQ_DEG ? points[bestIdx].cloudFactor : undefined;
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

    const cf = nearestCloudFactor(weatherPoints, lat, lng);
    const sun = calculateSunData(when, lat, lng, cf);
    const isNight = sun.position.altitude <= 0;
    const shadowScore = typeof it.shadowScore === "number" ? it.shadowScore : 1.0;

    it.intensity = isNight ? 0 : Math.round(sun.intensity * shadowScore);
    if (isNight) it.isNight = true;
  }
}
