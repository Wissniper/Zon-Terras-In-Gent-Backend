import Terras from "../models/terrasModel.js";
import { fetchOverpass, getCoords, buildAddress, findDuplicates, OverpassElement } from "./overpassFetcher.js";

const OVERPASS_QUERY = `[out:json][timeout:120];
area[name="Gent"]["admin_level"="8"]->.a;
(
  node["amenity"~"^(cafe|bar|pub)$"](area.a);
  way["amenity"~"^(cafe|bar|pub)$"](area.a);
);
out center body;`;

interface ParsedTerras {
  osmId: number;
  name: string;
  description: string;
  address: string;
  url: string;
  lat: number;
  lng: number;
}

function parseElement(el: OverpassElement): ParsedTerras | null {
  const tags = el.tags || {};
  if (!tags.name) return null;

  const coords = getCoords(el);
  if (!coords) return null;

  return {
    osmId: el.id,
    name: tags.name,
    description: tags.description || "",
    address: buildAddress(tags),
    url: tags.website || tags["contact:website"] || "",
    lat: coords.lat,
    lng: coords.lng,
  };
}

export async function syncTerrasData() {
  const elements = await fetchOverpass(OVERPASS_QUERY, "TerrasFetcher");

  const parsed: ParsedTerras[] = [];
  for (const el of elements) {
    const t = parseElement(el);
    if (t) parsed.push(t);
  }

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
