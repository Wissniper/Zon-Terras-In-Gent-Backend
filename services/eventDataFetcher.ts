import Event from "../models/eventModel.js";

const API_URL = process.env.STADGENT_EVENTS_URL || "https://data.stad.gent/api/explore/v2.1/catalog/datasets/toeristische-evenementen-visit-gent/records";
const PAGE_SIZE = 100;

interface GentEventRecord {
  event: string;
  name_nl: string;
  description_nl?: string;
  url?: string;
  date_start: string;
  date_end: string;
  ctcname_nl?: string;
  address?: string;
  postal?: string;
  local?: string;
  country?: string;
  geo?: { lat: number; lon: number };
}

interface ParsedEvent {
  eventUri: string;
  title: string;
  description: string;
  url: string;
  address: string;
  date_start: Date;
  date_end: Date;
  lat: number;
  lng: number;
}

function buildAddress(record: GentEventRecord): string {
  const parts: string[] = [];
  if (record.address) parts.push(record.address);
  if (record.postal && record.local) parts.push(`${record.postal} ${record.local}`);
  else if (record.local) parts.push(record.local);
  return parts.join(", ") || record.ctcname_nl || "Gent";
}

function parseRecord(record: GentEventRecord): ParsedEvent | null {
  if (!record.name_nl || !record.geo) return null;

  const dateStart = new Date(record.date_start);
  const dateEnd = new Date(record.date_end);
  if (isNaN(dateStart.getTime()) || isNaN(dateEnd.getTime())) return null;

  return {
    eventUri: record.event,
    title: record.name_nl,
    description: record.description_nl || "",
    url: record.url || "",
    address: buildAddress(record),
    date_start: dateStart,
    date_end: dateEnd,
    lat: record.geo.lat,
    lng: record.geo.lon,
  };
}

async function fetchAllRecords(): Promise<GentEventRecord[]> {
  const allRecords: GentEventRecord[] = [];
  let offset = 0;

  while (true) {
    const url = `${API_URL}?limit=${PAGE_SIZE}&offset=${offset}`;
    console.log(`[EventFetcher] Fetching offset=${offset}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Stad Gent API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const records: GentEventRecord[] = data.results || [];
    allRecords.push(...records);

    if (records.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRecords;
}

export async function syncEventData() {
  const records = await fetchAllRecords();

  const parsed: ParsedEvent[] = [];
  for (const record of records) {
    const e = parseRecord(record);
    if (e) parsed.push(e);
  }

  let created = 0;
  let updated = 0;

  for (const e of parsed) {
    const result = await Event.updateOne(
      { title: e.title, date_start: e.date_start },
      {
        $set: {
          title: e.title,
          description: e.description,
          address: e.address,
          url: e.url,
          date_start: e.date_start,
          date_end: e.date_end,
          location: {
            type: "Point",
            coordinates: [e.lng, e.lat],
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
    total: records.length,
    parsed: parsed.length,
    skipped: records.length - parsed.length,
    created,
    updated,
  };
}
