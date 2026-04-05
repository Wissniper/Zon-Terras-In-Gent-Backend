import Restaurant from "../models/restaurantModel.js";
import { fetchSparql, SparqlBinding } from "./sparqlFetcher.js";
import { findDuplicates } from "./geoUtils.js";

const QLEVER_ENDPOINT = process.env.QLEVER_OSM_ENDPOINT || "https://qlever.dev/api/osm-planet";

/**
 * SPARQL query: haal restaurants op in Gent via QLever (OSM als RDF).
 * Vereist: naam, geo
 * Optioneel: adres, cuisine, beschrijving, telefoon, website, openingsuren
 */
const RESTAURANT_QUERY = `
  PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
  PREFIX geo: <http://www.opengis.net/ont/geosparql#>
  PREFIX geof: <http://www.opengis.net/def/function/geosparql/>

  SELECT ?osm ?name ?geo ?street ?housenumber ?city ?cuisine ?description ?phone ?website ?openingHours WHERE {
    ?osm osmkey:amenity "restaurant" ;
         osmkey:name ?name ;
         geo:hasGeometry/geo:asWKT ?geo .
    FILTER(geof:latitude(?geo) > 50.99 && geof:latitude(?geo) < 51.12 && geof:longitude(?geo) > 3.64 && geof:longitude(?geo) < 3.82)
    OPTIONAL { ?osm osmkey:addr:street ?street }
    OPTIONAL { ?osm osmkey:addr:housenumber ?housenumber }
    OPTIONAL { ?osm osmkey:addr:city ?city }
    OPTIONAL { ?osm osmkey:cuisine ?cuisine }
    OPTIONAL { ?osm osmkey:description ?description }
    OPTIONAL { ?osm osmkey:phone ?phone }
    OPTIONAL { ?osm <https://www.openstreetmap.org/wiki/Key:contact:phone> ?phone }
    OPTIONAL { ?osm osmkey:website ?website }
    OPTIONAL { ?osm <https://www.openstreetmap.org/wiki/Key:contact:website> ?website }
    OPTIONAL { ?osm osmkey:opening_hours ?openingHours }
  }
`;

interface ParsedRestaurant {
  osmUri: string;
  name: string;
  address: string;
  cuisine: string;
  phone?: string;
  website?: string;
  openingHours?: string;
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

function parseBinding(b: SparqlBinding): ParsedRestaurant | null {
  if (!b.osm || !b.name || !b.geo) return null;

  const coords = parseWkt(b.geo.value);
  if (!coords) return null;

  return {
    osmUri: b.osm.value,
    name: b.name.value,
    address: buildAddress(b),
    cuisine: b.cuisine?.value || "restaurant",
    phone: b.phone?.value,
    website: b.website?.value,
    openingHours: b.openingHours?.value,
    lat: coords.lat,
    lng: coords.lng,
  };
}

export async function syncRestaurantData() {
  const bindings = await fetchSparql(RESTAURANT_QUERY, QLEVER_ENDPOINT);

  const parsed: ParsedRestaurant[] = [];
  for (const b of bindings) {
    const r = parseBinding(b);
    if (r) parsed.push(r);
  }

  const duplicates = findDuplicates(parsed as any);
  const unique = parsed.filter((_, i) => !duplicates.has(i));

  let created = 0;
  let updated = 0;

  for (const r of unique) {
    const result = await Restaurant.updateOne(
      { osmUri: r.osmUri },
      {
        $set: {
          name: r.name,
          address: r.address,
          cuisine: r.cuisine,
          osmUri: r.osmUri,
          phone: r.phone || "",
          website: r.website || "",
          openingHours: r.openingHours || "",
          location: {
            type: "Point",
            coordinates: [r.lng, r.lat],
          },
        },
        $setOnInsert: {
          intensity: 0,
          rating: 0,
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
    duplicatesSkipped: duplicates.size,
    unique: unique.length,
    created,
    updated,
  };
}
