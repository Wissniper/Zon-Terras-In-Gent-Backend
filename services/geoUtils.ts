// Haversine afstand in meters
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => deg * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Deduplicatie: items met dezelfde naam binnen 50m zijn duplicaten
export function findDuplicates<
  T extends { name: string; lat: number; lng: number },
>(items: T[]): Set<number> {
  const DEDUP_THRESHOLD_M = 50;
  const skip = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (skip.has(i)) continue;

    for (let j = i + 1; j < items.length; j++) {
      if (skip.has(j)) continue;

      if (items[i].name.toLowerCase() !== items[j].name.toLowerCase()) continue;

      const dist = haversineDistance(
        items[i].lat,
        items[i].lng,
        items[j].lat,
        items[j].lng,
      );

      if (dist <= DEDUP_THRESHOLD_M) {
        skip.add(j);
      }
    }
  }

  return skip;
}
