import Terras from "../models/terrasModel.js";
import { fetchSparql, SparqlBinding } from "./sparqlFetcher.js";
import { findDuplicates } from "./geoUtils.js";
import { docToTriples, syncToTriplestore } from "./rdfExporter.js";

const QLEVER_ENDPOINT = process.env.QLEVER_OSM_ENDPOINT || "https://qlever.dev/api/osm-planet";

const GENT_BBOX = { latMin: 50.99, latMax: 51.12, lngMin: 3.64, lngMax: 3.82 };

function isInGent(lat: number, lng: number): boolean {
  return lat > GENT_BBOX.latMin && lat < GENT_BBOX.latMax &&
         lng > GENT_BBOX.lngMin && lng < GENT_BBOX.lngMax;
}

/**
 * SPARQL query: haal cafés, bars en pubs op in Gent via QLever (OSM als RDF).
 * Vereist: naam, geo
 * Optioneel: adres, beschrijving, website
 */
const TERRAS_QUERY = `
  PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
  PREFIX geo: <http://www.opengis.net/ont/geosparql#>
  PREFIX geof: <http://www.opengis.net/def/function/geosparql/>

  SELECT ?osm ?name ?geo ?street ?housenumber ?city ?description ?website WHERE {
    ?osm osmkey:amenity ?amenity ;
         osmkey:name ?name ;
         geo:hasGeometry/geo:asWKT ?geo .
    FILTER(?amenity IN ("cafe", "bar", "pub"))
    FILTER(geof:latitude(?geo) > 50.99 && geof:latitude(?geo) < 51.12 && geof:longitude(?geo) > 3.64 && geof:longitude(?geo) < 3.82)
    OPTIONAL { ?osm osmkey:addr:street ?street }
    OPTIONAL { ?osm osmkey:addr:housenumber ?housenumber }
    OPTIONAL { ?osm osmkey:addr:city ?city }
    OPTIONAL { ?osm osmkey:description ?description }
    OPTIONAL { ?osm osmkey:website ?website }
    OPTIONAL { ?osm <https://www.openstreetmap.org/wiki/Key:contact:website> ?website }
  }
`;

interface ParsedTerras {
  osmUri: string;
  name: string;
  description: string;
  address: string;
  url: string;
  lat: number;
  lng: number;
}

/** Parse WKT "POINT(lon lat)" naar coördinaten */
function parseWkt(wkt: string): { lat: number; lng: number } | null {
  const match = wkt.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!match) return null;
  return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
}

function buildAddress(b: SparqlBinding): string {
  const street = b.street?.value || "";
  const number = b.housenumber?.value || "";
  const city = b.city?.value || "Gent";
  if (street && number) return `${street} ${number}, ${city}`;
  if (street) return `${street}, ${city}`;
  return city;
}

function parseBinding(b: SparqlBinding): ParsedTerras | null {
  if (!b.osm || !b.name || !b.geo) return null;

  const coords = parseWkt(b.geo.value);
  if (!coords) return null;

  return {
    osmUri: b.osm.value,
    name: b.name.value,
    description: b.description?.value || "",
    address: buildAddress(b),
    url: b.website?.value || "",
    lat: coords.lat,
    lng: coords.lng,
  };
}

export async function syncTerrasData() {
  const bindings = await fetchSparql(TERRAS_QUERY, QLEVER_ENDPOINT);

  const parsed: ParsedTerras[] = [];
  for (const b of bindings) {
    const t = parseBinding(b);
    if (t && isInGent(t.lat, t.lng)) parsed.push(t);
  }

  const duplicates = findDuplicates(parsed as any);
  const unique = parsed.filter((_, i) => !duplicates.has(i));

  let created = 0;
  let updated = 0;

  for (const t of unique) {
    const result = await Terras.updateOne(
      { osmUri: t.osmUri },
      {
        $set: {
          name: t.name,
          description: t.description,
          address: t.address,
          url: t.url,
          osmUri: t.osmUri,
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

    if (result.upsertedCount > 0 || result.modifiedCount > 0) {
      if (result.upsertedCount > 0) created++;
      else updated++;

      // Handmatige RDF sync omdat updateOne geen hooks triggert
      const updatedDoc = await Terras.findOne({ osmUri: t.osmUri });
      if (updatedDoc) {
        const triples = docToTriples('terras', updatedDoc.toObject());
        await syncToTriplestore(triples);
      }
    }
  }

  return {
    total: bindings.length,
    parsed: parsed.length,
    duplicatesSkipped: duplicates.size,
    unique: unique.length,
    created,
    updated,
  };
}
