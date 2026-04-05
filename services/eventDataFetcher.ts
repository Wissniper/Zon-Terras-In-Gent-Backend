import Event from "../models/eventModel.js";
import Terras from "../models/terrasModel.js";
import Restaurant from "../models/restaurantModel.js";
import { fetchSparql, SparqlBinding } from "./sparqlFetcher.js";

/**
 * Zoek een terras of restaurant op basis van coördinaten (max 10 meter afstand)
 */
async function findVenue(lat: number, lng: number): Promise<{ ref: string; type: "terras" | "restaurant" } | null> {
  // Zoek eerst een terras
  const terras = await Terras.findOne({
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: 10, // meters
      },
    },
    isDeleted: { $ne: true },
  });
  if (terras) return { ref: (terras as any).uuid, type: "terras" };

  // Zoek dan een restaurant
  const restaurant = await Restaurant.findOne({
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: 10, // meters
      },
    },
    isDeleted: { $ne: true },
  });
  if (restaurant) return { ref: (restaurant as any).uuid, type: "restaurant" };

  return null;
}

/**
 * SPARQL query: haal events op uit Stad Gent Linked Open Data.
 *
 * Structuur in de LOD graaf:
 *   Event → schema:name (meertalig, we filteren op "nl")
 *         → schema:startDate, schema:endDate
 *         → schema:description (optioneel, "nl")
 *         → schema:url (optioneel)
 *         → schema:location → Place → schema:contactPoint → PostalAddress
 *              → schema:streetAddress, schema:addressLocality, schema:postalCode
 *
 * Geen lat/long beschikbaar in de LOD — coördinaten worden opgehaald via de
 * Stad Gent REST API en gematcht op eventUri.
 */

const SPARQL_ENDPOINT = process.env.SPARQL_STAD_GENT_ENDPOINT || "https://stad.gent/sparql";
const REST_API_URL = process.env.STADGENT_EVENTS_URL || "https://data.stad.gent/api/explore/v2.1/catalog/datasets/toeristische-evenementen-visit-gent/records";
const PAGE_SIZE = 100;

const EVENTS_QUERY = `
  PREFIX schema: <http://schema.org/>

  SELECT DISTINCT ?event ?name ?desc ?url ?startDate ?endDate ?street ?locality ?postal
  WHERE {
    ?event a schema:Event ;
           schema:name ?name ;
           schema:startDate ?startDate ;
           schema:endDate ?endDate ;
           schema:location ?place .
    ?place schema:contactPoint ?cp .
    ?cp schema:streetAddress ?street ;
        schema:addressLocality ?locality ;
        schema:postalCode ?postal .
    OPTIONAL { ?event schema:description ?desc . FILTER(LANG(?desc) = "nl") }
    OPTIONAL { ?event schema:url ?url }
    FILTER(LANG(?name) = "nl")
  }
`;

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

// Haal geo-coördinaten op via de REST API, geïndexeerd op eventUri
interface GeoRecord { lat: number; lon: number }

async function fetchGeoMap(): Promise<Map<string, GeoRecord>> {
  const geoMap = new Map<string, GeoRecord>();
  let offset = 0;

  while (true) {
    const url = `${REST_API_URL}?limit=${PAGE_SIZE}&offset=${offset}&select=event,geo`;
    console.log(`[EventFetcher] Fetching geo data offset=${offset}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Stad Gent REST API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const records = data.results || [];

    for (const r of records) {
      if (r.event && r.geo) {
        geoMap.set(r.event, r.geo);
      }
    }

    if (records.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`[EventFetcher] Loaded geo for ${geoMap.size} events`);
  return geoMap;
}

function buildAddress(b: SparqlBinding): string {
  const parts: string[] = [];
  if (b.street) parts.push(b.street.value);
  if (b.postal && b.locality) parts.push(`${b.postal.value} ${b.locality.value}`);
  else if (b.locality) parts.push(b.locality.value);
  return parts.join(", ") || "Gent";
}

function parseBinding(b: SparqlBinding, geo: GeoRecord | undefined): ParsedEvent | null {
  if (!b.name || !b.startDate || !b.endDate) return null;
  if (!geo) return null; // skip events zonder coördinaten

  const dateStart = new Date(b.startDate.value);
  const dateEnd = new Date(b.endDate.value);
  if (isNaN(dateStart.getTime()) || isNaN(dateEnd.getTime())) return null;

  return {
    eventUri: b.event.value,
    title: b.name.value,
    description: b.desc?.value || "",
    url: b.url?.value || "",
    address: buildAddress(b),
    date_start: dateStart,
    date_end: dateEnd,
    lat: geo.lat,
    lng: geo.lon,
  };
}

export async function syncEventData() {
  // Haal LOD data en geo-coördinaten parallel op
  const [bindings, geoMap] = await Promise.all([
    fetchSparql(EVENTS_QUERY, SPARQL_ENDPOINT),
    fetchGeoMap(),
  ]);

  const parsed: ParsedEvent[] = [];
  const seen = new Set<string>();

  for (const b of bindings) {
    const uri = b.event?.value;
    const e = parseBinding(b, uri ? geoMap.get(uri) : undefined);
    if (!e) continue;
    // Dedup: SPARQL kan duplicaten geven door meerdere OPTIONAL matches
    if (seen.has(e.eventUri)) continue;
    seen.add(e.eventUri);
    parsed.push(e);
  }

  let created = 0;
  let updated = 0;

  for (const e of parsed) {
    const venue = await findVenue(e.lat, e.lng);
    const result = await Event.updateOne(
      { eventUri: e.eventUri },
      {
        $set: {
          title: e.title,
          description: e.description,
          address: e.address,
          url: e.url,
          eventUri: e.eventUri,
          date_start: e.date_start,
          date_end: e.date_end,
          location: {
            type: "Point",
            coordinates: [e.lng, e.lat],
          },
          locationRef: venue?.ref,
          locationType: venue?.type,
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
    total: bindings.length,
    parsed: parsed.length,
    skipped: bindings.length - parsed.length,
    created,
    updated,
  };
}
