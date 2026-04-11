import mongoose from "mongoose";
import dotenv from "dotenv";
import Terras from "../../models/terrasModel.js";

dotenv.config();

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";

const OVERPASS_QUERY = `
[out:json][timeout:60];
area["name"="Gent"]["boundary"="administrative"]->.gent;
(
  node["amenity"~"^(cafe|bar|pub)$"](area.gent);
  way["amenity"~"^(cafe|bar|pub)$"](area.gent);
);
out center;
`;

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function parseElement(el: OverpassElement) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!lat || !lon) return null;

  const tags = el.tags || {};
  const name = tags.name;
  if (!name) return null;

  const street = tags["addr:street"] || "";
  const housenumber = tags["addr:housenumber"] || "";
  const city = tags["addr:city"] || "Gent";
  let address = city;
  if (street && housenumber) address = `${street} ${housenumber}, ${city}`;
  else if (street) address = `${street}, ${city}`;

  return {
    osmUri: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    name,
    description: tags.description || "",
    address,
    url: tags.website || tags["contact:website"] || "",
    lat,
    lon,
  };
}

async function seedTerrassen() {
  console.log("[SeedTerrassen] Starting terrassen seeding via Overpass API...");

  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/zon-terras-db");
    console.log("[SeedTerrassen] Connected to MongoDB.");

    console.log("[SeedTerrassen] Querying Overpass API for cafés, bars, and pubs in Gent...");
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
    });

    if (!response.ok) {
      throw new Error(`Overpass API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const elements: OverpassElement[] = data.elements || [];
    console.log(`[SeedTerrassen] Received ${elements.length} elements from Overpass.`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const el of elements) {
      const parsed = parseElement(el);
      if (!parsed) {
        skipped++;
        continue;
      }

      const result = await Terras.updateOne(
        { osmUri: parsed.osmUri },
        {
          $set: {
            name: parsed.name,
            description: parsed.description,
            address: parsed.address,
            url: parsed.url,
            osmUri: parsed.osmUri,
            location: {
              type: "Point",
              coordinates: [parsed.lon, parsed.lat],
            },
          },
          $setOnInsert: {
            intensity: 0,
            isDeleted: false,
          },
        },
        { upsert: true },
      );

      if (result.upsertedCount > 0) inserted++;
      else if (result.modifiedCount > 0) updated++;
      else skipped++;
    }

    console.log(`[SeedTerrassen] Done! ${inserted} inserted, ${updated} updated, ${skipped} skipped.`);
  } catch (error) {
    console.error("[SeedTerrassen] Error:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seedTerrassen();
