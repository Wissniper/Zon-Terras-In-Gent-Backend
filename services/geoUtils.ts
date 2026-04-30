import proj4 from "proj4";

// Lambert 72 definition (EPSG:31370)
const LAMBERT72 = "+proj=lcc +lat_1=51.16666723333333 +lat_2=49.8333339 +lat_0=90 +lon_0=4.367486666666667 +x_0=150000.013 +y_0=5400088.438 +ellps=intl +towgs84=-106.869,52.2978,-103.724,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs";
const WGS84 = "EPSG:4326";

/**
 * Convert Lambert 72 (x, y) to WGS84 (lat, lng)
 */
export function lambert72ToWgs84(x: number, y: number): [number, number] {
  const [lng, lat] = proj4(LAMBERT72, WGS84, [x, y]);
  return [lat, lng];
}

/**
 * Convert WGS84 (lat, lng) to Lambert 72 (x, y)
 */
export function wgs84ToLambert72(lat: number, lng: number): [number, number] {
  const [x, y] = proj4(WGS84, LAMBERT72, [lng, lat]);
  return [x, y];
}

/**
 * Calculate relative position of a coordinate compared to a tile's anchor
 * e.g. tile "099_193" starts at X=99000, Y=193000
 */
export function getRelativePosition(lat: number, lng: number, anchorVaknummer: string): [number, number] {
  const [targetX, targetY] = wgs84ToLambert72(lat, lng);
  const parts = anchorVaknummer.split("_");
  const baseX = parseInt(parts[0], 10) * 1000;
  const baseY = parseInt(parts[1], 10) * 1000;
  return [targetX - baseX, targetY - baseY];
}

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
