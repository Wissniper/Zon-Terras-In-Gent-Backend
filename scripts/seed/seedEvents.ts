import mongoose from "mongoose";
import dotenv from "dotenv";
import Event from "../../models/eventModel.js";

dotenv.config();

const REST_API_URL = process.env.STADGENT_EVENTS_URL
  || "https://data.stad.gent/api/explore/v2.1/catalog/datasets/toeristische-evenementen-visit-gent/records";
const PAGE_SIZE = 100;

interface EventRecord {
  event?: string;
  naam?: string;
  omschrijving?: string;
  url?: string;
  startdatum?: string;
  einddatum?: string;
  straat?: string;
  gemeente?: string;
  postcode?: string;
  geo?: { lat: number; lon: number };
}

function parseRecord(record: EventRecord) {
  const title = record.naam;
  if (!title) return null;

  const dateStart = record.startdatum ? new Date(record.startdatum) : null;
  const dateEnd = record.einddatum ? new Date(record.einddatum) : null;
  if (!dateStart || !dateEnd || isNaN(dateStart.getTime()) || isNaN(dateEnd.getTime())) return null;

  const geo = record.geo;
  if (!geo || !geo.lat || !geo.lon) return null;

  const street = record.straat || "";
  const postal = record.postcode || "";
  const city = record.gemeente || "Gent";
  let address = city;
  if (street && postal) address = `${street}, ${postal} ${city}`;
  else if (street) address = `${street}, ${city}`;

  return {
    externalId: record.event || `${title}-${dateStart.toISOString()}`,
    title,
    description: record.omschrijving || "",
    url: record.url || "",
    address,
    date_start: dateStart,
    date_end: dateEnd,
    lat: geo.lat,
    lon: geo.lon,
  };
}

async function fetchAllEvents(): Promise<EventRecord[]> {
  const allRecords: EventRecord[] = [];
  let offset = 0;

  while (true) {
    const url = `${REST_API_URL}?limit=${PAGE_SIZE}&offset=${offset}`;
    console.log(`[SeedEvents] Fetching page offset=${offset}...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Visit Gent API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const records = data.results || [];
    allRecords.push(...records);

    if (records.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRecords;
}

async function seedEvents() {
  console.log("[SeedEvents] Starting event seeding via Visit Gent API...");

  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/zon-terras-gent");
    console.log("[SeedEvents] Connected to MongoDB.");

    const records = await fetchAllEvents();
    console.log(`[SeedEvents] Fetched ${records.length} total records.`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const record of records) {
      const parsed = parseRecord(record);
      if (!parsed) {
        skipped++;
        continue;
      }

      const result = await Event.updateOne(
        { eventUri: parsed.externalId },
        {
          $set: {
            title: parsed.title,
            description: parsed.description,
            address: parsed.address,
            url: parsed.url,
            eventUri: parsed.externalId,
            date_start: parsed.date_start,
            date_end: parsed.date_end,
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

    console.log(`[SeedEvents] Done! ${inserted} inserted, ${updated} updated, ${skipped} skipped.`);
  } catch (error) {
    console.error("[SeedEvents] Error:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seedEvents();
