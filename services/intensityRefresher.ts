import { calculateSunData, getCloudFactor } from "./sunService.js";

/**
 * Recompute the `intensity` field on each item using the *current* sun
 * position + freshest cloud factor for that location. Mutates in place.
 *
 * Why this exists:
 * The Terras / Restaurant / Event documents carry a cached `intensity` field
 * that's only refreshed by the hourly weather cron OR lazily when someone
 * hits `GET /api/sun/<entity>/:id` (which calls `getOrCreateCache`). Between
 * those touches the value is stale by up to 60 minutes, which causes the
 * search/list endpoints to disagree with the per-entity sun endpoint.
 *
 * This helper closes the gap: callers get a fresh intensity computed from
 * `sin(altitude_now) * (1 - cloudFactor/100) * shadowScore` per item, with
 * `cloudFactor` looked up at most once per ~111m grid cell per request.
 */
export async function recomputeIntensities(items: any[]): Promise<void> {
  if (!items || items.length === 0) return;
  const now = new Date();

  // Cache cloudFactor lookups by ~111m grid (3 decimal degrees) so 500 nearby
  // terraces don't trigger 500 weather queries.
  const cfCache = new Map<string, number | undefined>();

  for (const it of items) {
    const coords = it?.location?.coordinates;
    if (!coords || coords.length < 2) continue;

    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;

    let cf: number | undefined;
    if (cfCache.has(key)) {
      cf = cfCache.get(key);
    } else {
      cf = await getCloudFactor(lat, lng);
      cfCache.set(key, cf);
    }

    const sun = calculateSunData(now, lat, lng, cf);
    const isNight = sun.position.altitude <= 0;
    const shadowScore = typeof it.shadowScore === "number" ? it.shadowScore : 1.0;

    it.intensity = isNight ? 0 : Math.round(sun.intensity * shadowScore);
    if (isNight) it.isNight = true;
  }
}
