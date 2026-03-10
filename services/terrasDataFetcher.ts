import Terras from "../models/terrasModel.js";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Overpass query: alle cafés, bars en pubs in Gent (nodes + ways met center coördinaat)
const OVERPASS_QUERY = `[out:json][timeout:120];
area[name="Gent"]["admin_level"="8"]->.a;
(
  node["amenity"~"^(cafe|bar|pub)$"](area.a);
  way["amenity"~"^(cafe|bar|pub)$"](area.a);
);
out center body;`;

interface OverpassElement {
  type: "node" | "way";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface ParsedTerras {
  osmId: number;
  name: string;
  description: string;
  address: string;
  url: string;
  lat: number;
  lng: number;
}

// Haal alle elementen op via de Overpass API (met retry bij timeout)
async function fetchOverpassTerras(): Promise<OverpassElement[]> {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      const response = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429 || response.status === 504) {
        console.warn(`[TerrasFetcher] Attempt ${attempt}/${MAX_RETRIES}: ${response.status}, retrying in 30s...`);
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
        console.warn(`[TerrasFetcher] Attempt ${attempt}/${MAX_RETRIES}: request timeout, retrying in 30s...`);
        await new Promise(r => setTimeout(r, 30_000));
        continue;
      }
      throw err;
    }
  }

  throw new Error("Overpass API: max retries exceeded");
}

// Bouw een adresstring uit OSM tags
function buildAddress(tags: Record<string, string>): string {
  const street = tags["addr:street"] || "";
  const number = tags["addr:housenumber"] || "";
  const city = tags["addr:city"] || "Gent";

  if (street && number) return `${street} ${number}, ${city}`;
  if (street) return `${street}, ${city}`;
  return city;
}

// Parse een Overpass element naar ons terras formaat
function parseElement(el: OverpassElement): ParsedTerras | null {
  const tags = el.tags || {};

  // Naam is vereist
  if (!tags.name) return null;

  // Coördinaten: node heeft lat/lon, way heeft center.lat/center.lon
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat === undefined || lng === undefined) return null;

  return {
    osmId: el.id,
    name: tags.name,
    description: tags.description || "",
    address: buildAddress(tags),
    url: tags.website || tags["contact:website"] || "",
    lat,
    lng,
  };
}

// Deduplicatie: twee terrasen met dezelfde naam binnen 50m zijn duplicaten
function findDuplicates(items: ParsedTerras[]): Set<number> {
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

// Haversine afstand in meters
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => deg * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Sync terrasen van Overpass naar MongoDB
export async function syncTerrasData() {
  const elements = await fetchOverpassTerras();

  // Parse en filter elementen zonder naam of coördinaten
  const parsed: ParsedTerras[] = [];
  for (const el of elements) {
    const t = parseElement(el);
    if (t) parsed.push(t);
  }

  // Dedupliceer op naam + nabijheid
  const duplicates = findDuplicates(parsed);
  const unique = parsed.filter((_, i) => !duplicates.has(i));

  let created = 0;
  let updated = 0;

  for (const t of unique) {
    const result = await Terras.updateOne(
      { identifier: t.osmId },
      {
        $set: {
          name: t.name,
          description: t.description,
          address: t.address,
          url: t.url,
          identifier: t.osmId,
          location: {
            type: "Point",
            coordinates: [t.lng, t.lat],
          },
        },
        $setOnInsert: {
          intensity: 0,
          isDeleted: false,
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount > 0) created++;
    else if (result.modifiedCount > 0) updated++;
  }

  return {
    total: elements.length,
    parsed: parsed.length,
    duplicatesSkipped: duplicates.size,
    unique: unique.length,
    created,
    updated,
  };
}
