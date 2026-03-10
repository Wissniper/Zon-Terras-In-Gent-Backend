const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";

export interface OverpassElement {
  type: "node" | "way";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// Haal elementen op via de Overpass API (met retry bij timeout)
export async function fetchOverpass(query: string, label: string): Promise<OverpassElement[]> {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      const response = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429 || response.status === 504) {
        console.warn(`[${label}] Attempt ${attempt}/${MAX_RETRIES}: ${response.status}, retrying in 30s...`);
        await new Promise(r => setTimeout(r, 30_000));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.elements as OverpassElement[];
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.warn(`[${label}] Attempt ${attempt}/${MAX_RETRIES}: request timeout, retrying in 30s...`);
        await new Promise(r => setTimeout(r, 30_000));
        continue;
      }
      throw err;
    }
  }

  throw new Error("Overpass API: max retries exceeded");
}

// Coördinaten uit een node of way (center)
export function getCoords(el: OverpassElement): { lat: number; lng: number } | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat === undefined || lng === undefined) return null;
  return { lat, lng };
}

// Bouw een adresstring uit OSM tags
export function buildAddress(tags: Record<string, string>): string {
  const street = tags["addr:street"] || "";
  const number = tags["addr:housenumber"] || "";
  const city = tags["addr:city"] || "Gent";

  if (street && number) return `${street} ${number}, ${city}`;
  if (street) return `${street}, ${city}`;
  return city;
}

// Haversine afstand in meters
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
export function findDuplicates<T extends { name: string; lat: number; lng: number }>(items: T[]): Set<number> {
  const DEDUP_THRESHOLD_M = 50;
  const skip = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (skip.has(i)) continue;

    for (let j = i + 1; j < items.length; j++) {
      if (skip.has(j)) continue;

      if (items[i].name.toLowerCase() !== items[j].name.toLowerCase()) continue;

      const dist = haversineDistance(items[i].lat, items[i].lng, items[j].lat, items[j].lng);

      if (dist <= DEDUP_THRESHOLD_M) {
        skip.add(j);
      }
    }
  }

  return skip;
}
