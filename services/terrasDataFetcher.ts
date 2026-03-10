import Terras from "../models/terrasModel.js";

const API_URL = "https://data.stad.gent/api/explore/v2.1/catalog/datasets/cafes-gent/records";
const PAGE_SIZE = 100;

interface CafeRecord {
  objectid: number;
  identifier: number;
  name_nl: string;
  description_nl?: string;
  address: string;
  url?: string;
  geo_point_2d: { lat: number; lon: number };
}

// Haal alle cafés op van data.stad.gent (paginated)
async function fetchAllCafes(): Promise<CafeRecord[]> {
  const allRecords: CafeRecord[] = [];
  let offset = 0;

  while (true) {
    const url = `${API_URL}?limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const records = data.results as CafeRecord[];

    if (!records || records.length === 0) break;

    allRecords.push(...records);

    if (records.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRecords;
}

// Sync cafés van data.stad.gent naar de Terras collectie in MongoDB
// Gebruikt upsert op identifier, zodat bestaande records geüpdatet worden
export async function syncTerrasData() {
  const cafes = await fetchAllCafes();
  let created = 0;
  let updated = 0;

  for (const cafe of cafes) {
    if (!cafe.geo_point_2d) continue;

    const result = await Terras.updateOne(
      { identifier: cafe.identifier },
      {
        $set: {
          name: cafe.name_nl,
          description: cafe.description_nl || "",
          address: `${cafe.address}, Gent`,
          url: cafe.url || "",
          identifier: cafe.identifier,
          location: {
            type: "Point",
            coordinates: [cafe.geo_point_2d.lon, cafe.geo_point_2d.lat],
          },
        },
        // Zet intensity alleen bij een nieuw document (niet overschrijven als de cron het al berekend heeft)
        $setOnInsert: {
          intensity: 0,
        },
      },
      { upsert: true }
    );

    if (result.upsertedCount > 0) created++;
    else if (result.modifiedCount > 0) updated++;
  }

  return { total: cafes.length, created, updated };
}
