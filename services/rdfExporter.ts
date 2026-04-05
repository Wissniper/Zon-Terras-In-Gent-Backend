import { TERRAS_CONTEXT, EVENT_CONTEXT, RESTAURANT_CONTEXT, SUNDATA_CONTEXT } from "../contexts/jsonld.js";

const BASE_IRI = "http://api.sun-seeker.be";

/**
 * Generates N-Triples for a given entity document.
 */
export function docToTriples(entityType: string, doc: any): string[] {
    let baseUri = `${BASE_IRI}/${entityType}/${doc.uuid}`;
    const triples: string[] = [];

    // Correct base URI according to IRI Strategy for special types
    if (entityType === "sundata" && doc.locationUuid) {
        baseUri = `${BASE_IRI}/sun/${doc.locationType.toLowerCase()}/${doc.locationUuid}/${new Date(doc.dateTime).getTime()}`;
    } else if (entityType === "weather") {
        const [lng, lat] = doc.location.coordinates;
        baseUri = `${BASE_IRI}/weather/${new Date(doc.timestamp).getTime()}/${lng}/${lat}`;
    }

    // Basic Type Declaration
    let typeUri = "";
    switch (entityType) {
        case "terras": typeUri = "http://api.sun-seeker.be/vocab#Terras"; break;
        case "restaurant": typeUri = "https://schema.org/Restaurant"; break;
        case "event": typeUri = "https://schema.org/Event"; break;
        case "sundata": typeUri = "http://api.sun-seeker.be/vocab#SunData"; break;
        case "weather": typeUri = "http://api.sun-seeker.be/vocab#Weather"; break;
    }
    if (typeUri) triples.push(`<${baseUri}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${typeUri}> .`);

    // Helper to format literals
    const lit = (val: any) => typeof val === "string" ? `"${val.replace(/"/g, '\\"')}"` : `"${val}"`;
    const dtLit = (val: any, type: string) => `"${val}"^^<http://www.w3.org/2001/XMLSchema#${type}>`;

    // Common properties
    if (doc.uuid) triples.push(`<${baseUri}> <http://purl.org/dc/terms/identifier> ${lit(doc.uuid)} .`);
    if (doc.osmUri) triples.push(`<${baseUri}> <http://www.w3.org/2002/07/owl#sameAs> <${doc.osmUri}> .`);
    if (doc.name || doc.title) triples.push(`<${baseUri}> <https://schema.org/name> ${lit(doc.name || doc.title)} .`);
    if (doc.address) triples.push(`<${baseUri}> <https://schema.org/address> ${lit(doc.address)} .`);
    if (doc.url) triples.push(`<${baseUri}> <https://schema.org/url> <${doc.url}> .`);
    
    // Geometry
    if (doc.location && doc.location.coordinates) {
        const [lng, lat] = doc.location.coordinates;
        const wkt = `POINT(${lng} ${lat})`;
        triples.push(`<${baseUri}> <http://www.opengis.net/ont/geosparql#hasGeometry> <${baseUri}#geometry> .`);
        triples.push(`<${baseUri}#geometry> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.opengis.net/ont/geosparql#Point> .`);
        triples.push(`<${baseUri}#geometry> <http://www.opengis.net/ont/geosparql#asWKT> "${wkt}"^^<http://www.opengis.net/ont/geosparql#wktLiteral> .`);
    }

    // Type specific
    if (entityType === "terras") {
        if (doc.description) triples.push(`<${baseUri}> <https://schema.org/description> ${lit(doc.description)} .`);
        if (doc.intensity !== undefined) triples.push(`<${baseUri}> <http://api.sun-seeker.be/vocab#sunIntensity> ${dtLit(doc.intensity, "integer")} .`);
    }

    if (entityType === "restaurant") {
        if (doc.cuisine) triples.push(`<${baseUri}> <https://schema.org/servesCuisine> ${lit(doc.cuisine)} .`);
        if (doc.rating !== undefined) triples.push(`<${baseUri}> <https://schema.org/aggregateRating> ${dtLit(doc.rating, "decimal")} .`);
        if (doc.phone) triples.push(`<${baseUri}> <https://schema.org/telephone> ${lit(doc.phone)} .`);
        if (doc.openingHours) triples.push(`<${baseUri}> <https://schema.org/openingHours> ${lit(doc.openingHours)} .`);
        if (doc.takeaway !== undefined) triples.push(`<${baseUri}> <http://api.sun-seeker.be/vocab#offersTakeaway> ${dtLit(doc.takeaway, "boolean")} .`);
    }

    if (entityType === "event") {
        if (doc.date_start) triples.push(`<${baseUri}> <https://schema.org/startDate> ${dtLit(new Date(doc.date_start).toISOString(), "dateTime")} .`);
        if (doc.date_end) triples.push(`<${baseUri}> <https://schema.org/endDate> ${dtLit(new Date(doc.date_end).toISOString(), "dateTime")} .`);
    }

    if (entityType === "sundata") {
        if (doc.intensity !== undefined) triples.push(`<${baseUri}> <http://api.sun-seeker.be/vocab#sunIntensity> ${dtLit(doc.intensity, "integer")} .`);
        if (doc.azimuth !== undefined) triples.push(`<${baseUri}> <http://api.sun-seeker.be/vocab#solarAzimuth> ${dtLit(doc.azimuth, "decimal")} .`);
        if (doc.altitude !== undefined) triples.push(`<${baseUri}> <http://api.sun-seeker.be/vocab#solarAltitude> ${dtLit(doc.altitude, "decimal")} .`);
        if (doc.dateTime) triples.push(`<${baseUri}> <https://schema.org/dateCreated> ${dtLit(new Date(doc.dateTime).toISOString(), "dateTime")} .`);
    }

    return triples;
}

/**
 * Service to export all collections as RDF.
 */
export async function exportAllToRdf(models: Record<string, any>): Promise<string> {
    let allTriples: string[] = [];
    
    for (const [name, model] of Object.entries(models)) {
        const docs = await model.find({ isDeleted: { $ne: true } });
        for (const doc of docs) {
            allTriples = allTriples.concat(docToTriples(name.toLowerCase(), doc.toObject()));
        }
    }
    
    return allTriples.join("\n");
}
