import { TERRAS_CONTEXT, EVENT_CONTEXT, RESTAURANT_CONTEXT, SUNDATA_CONTEXT } from "../contexts/jsonld.js";
import fs from "fs/promises";
import path from "path";

const BASE_IRI = "http://api.sun-seeker.be";
const EXPORT_FILE = path.join(process.cwd(), "data", "export.nt");

/**
 * Voegt triples toe aan een lokaal .nt bestand (gesimuleerde triplestore sync)
 */
export async function syncToTriplestore(triples: string[]) {
    try {
        await fs.mkdir(path.dirname(EXPORT_FILE), { recursive: true });
        // We gebruiken 'a' (append) om triples toe te voegen aan het einde van het bestand
        await fs.appendFile(EXPORT_FILE, triples.join("\n") + "\n");
        console.log(`[RDFSync] Synced ${triples.length} triples to ${EXPORT_FILE}`);
    } catch (error) {
        console.error("[RDFSync] Error syncing to triplestore:", error);
    }
}

/**
 * Generates N-Triples for a given entity document based on its type and properties:
 * - Constructs a base URI using the entity type and UUID (or special IRI strategy for sundata/weather).
 * - Adds rdf:type triple based on the entity type.
 * - Maps document properties to RDF predicates according to the JSON-LD contexts.
 * - Handles geometry as WKT literals.
 * - Returns an array of RDF triples as strings.
 * 
 * Example output for a Terras document:
 * <http://api.sun-seeker.be/terras/123e4567-e89b-12d3-a456-426614174000> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://api.sun-seeker.be/vocab#Terras> .
 * <http://api.sun-seeker.be/terras/123e4567-e89b-12d3-a456-426614174000> <http://purl.org/dc/terms/identifier> "123e4567-e89b-12d3-a456-426614174000" .
 * <http://api.sun-seeker.be/terras/123e4567-e89b-12d3-a456-426614174000> <https://schema.org/name> "Café de Zon" .
 * <http://api.sun-seeker.be/terras/123e4567-e89b-12d3-a456-426614174000> <https://schema.org/address> "Korenmarkt 1, Gent" .
 * <http://api.sun-seeker.be/terras/123e4567-e89b-12d3-a456-426614174000> <http://www.opengis.net/ont/geosparql#hasGeometry> <http://api.sun-seeker.be/terras/123e4567-e89b-12d3-a456-426614174000#geometry> .
 * <http://api.sun-seeker.be/terras/123e4567-e89b-12d3-a456-426614174000#geometry> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.opengis.net/ont/geosparql#Point> .
 * <http://api.sun-seeker.be/terras/123e4567-e89b-12d3-a456-426614174000#geometry> <http://www.opengis.net/ont/geosparql#asWKT> "POINT(3.72 51.05)"^^<http://www.opengis.net/ont/geosparql#wktLiteral> .
 * <http://api.sun-seeker.be/terras/123e4567-e89b-12d3-a456-426614174000> <http://api.sun-seeker.be/vocab#sunIntensity> "3"^^<http://www.w3.org/2001/XMLSchema#integer> .
 */
export function docToTriples(entityType: string, doc: any): string[] {
    const typePlurals: Record<string, string> = {
        terras: "terrasen",
        restaurant: "restaurants",
        event: "events",
        weather: "weather",
        sundata: "sun"
    };
    const plural = typePlurals[entityType] || `${entityType}s`;
    let baseUri = `${BASE_IRI}/${plural}/${doc.uuid}`;
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
        if (doc.locationRef && doc.locationType) {
            const venuePlural = typePlurals[doc.locationType.toLowerCase()] || `${doc.locationType.toLowerCase()}s`;
            const venueUri = `${BASE_IRI}/${venuePlural}/${doc.locationRef}`;
            triples.push(`<${baseUri}> <https://schema.org/location> <${venueUri}> .`);
        }
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
