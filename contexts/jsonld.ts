/**
 * JSON-LD @context definitions for all entity types.
 * Maps model fields to standard vocabularies (Schema.org, Dublin Core, GeoJSON-LD)
 * and a custom namespace (zt:) for domain-specific properties.
 */

const BASE_CONTEXT = {
  schema: "https://schema.org/",
  dcterms: "http://purl.org/dc/terms/",
  owl: "http://www.w3.org/2002/07/owl#",
  geojson: "https://purl.org/geojson/vocab#",
  hydra: "http://www.w3.org/ns/hydra/core#",
  zt: "http://api.sun-seeker.be/vocab#",

  uuid: "dcterms:identifier",
  osmUri: { "@id": "owl:sameAs", "@type": "@id" },
  name: "schema:name",
  description: "schema:description",
  address: "schema:address",
  url: "schema:url",
  location: "geojson:geometry",
  coordinates: "geojson:coordinates",
  intensity: "zt:sunIntensity",
  createdAt: { "@id": "dcterms:created", "@type": "schema:DateTime" },
  updatedAt: { "@id": "dcterms:modified", "@type": "schema:DateTime" },
};

export const TERRAS_CONTEXT = {
  ...BASE_CONTEXT,
  Terras: "zt:Terras",
};

export const RESTAURANT_CONTEXT = {
  ...BASE_CONTEXT,
  cuisine: "schema:servesCuisine",
  phone: "schema:telephone",
  website: "schema:url",
  openingHours: "schema:openingHours",
  takeaway: "zt:offersTakeaway",
};

export const EVENT_CONTEXT = {
  ...BASE_CONTEXT,
  title: "schema:name",
  date_start: { "@id": "schema:startDate", "@type": "schema:DateTime" },
  date_end: { "@id": "schema:endDate", "@type": "schema:DateTime" },
  eventUri: { "@id": "schema:sameAs", "@type": "@id" },
  locationRef: { "@id": "schema:location", "@type": "@id" },
};

export const SUNDATA_CONTEXT = {
  schema: "https://schema.org/",
  zt: "http://api.sun-seeker.be/vocab#",

  SunData: "zt:SunData",
  locationRef: { "@id": "zt:locationRef", "@type": "@id" },
  locationType: "zt:locationType",
  dateTime: { "@id": "schema:dateCreated", "@type": "schema:DateTime" },
  intensity: "zt:sunIntensity",
  azimuth: "zt:solarAzimuth",
  altitude: "zt:solarAltitude",
  goldenHour: "zt:goldenHour",
  dawnStart: { "@id": "zt:dawnStart", "@type": "schema:DateTime" },
  dawnEnd: { "@id": "zt:dawnEnd", "@type": "schema:DateTime" },
  duskStart: { "@id": "zt:duskStart", "@type": "schema:DateTime" },
  duskEnd: { "@id": "zt:duskEnd", "@type": "schema:DateTime" },
};

// Map model names to their @context and @type
const CONTEXT_MAP: Record<string, { context: object; type: string }> = {
  terras: { context: TERRAS_CONTEXT, type: "zt:Terras" },
  restaurant: { context: RESTAURANT_CONTEXT, type: "schema:Restaurant" },
  event: { context: EVENT_CONTEXT, type: "schema:Event" },
};

/** Wrap a single entity document in JSON-LD */
export function toLd(resource: string, doc: object, selfHref: string) {
  const mapping = CONTEXT_MAP[resource];
  if (!mapping) return doc;
  return {
    "@context": mapping.context,
    "@type": mapping.type,
    "@id": selfHref,
    ...doc,
  };
}

/** Wrap a collection response in JSON-LD */
export function toCollectionLd(resource: string, items: object[], selfHref: string) {
  const mapping = CONTEXT_MAP[resource];
  if (!mapping) return items;
  return {
    "@context": mapping.context,
    "@type": "hydra:Collection",
    "@id": selfHref,
    "hydra:totalItems": items.length,
    "hydra:member": items.map((item: any) => ({
      "@type": mapping.type,
      "@id": `/api/${resource === "terras" ? "terrasen" : resource + "s"}/${item.uuid}`,
      ...item,
    })),
  };
}
