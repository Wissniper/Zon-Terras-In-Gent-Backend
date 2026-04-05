# Overpass QL vs QLever/SPARQL

## Why the architecture changed

Overpass QL was initially chosen for direct OpenStreetMap (OSM) querying without managing infrastructure. However, public Overpass APIs became a bottleneck due to strict rate limits, query timeouts, and aggressive throttling. QLever, using SPARQL over an RDF extraction of OSM data, was adopted to eliminate these operational constraints and provide a more flexible, reliable query layer for our API.

## Performance and operational comparison

_Note: Based on operational experience, not academic benchmarks._

- **Reliability:** Public Overpass endpoints frequently fail under repeated API use. Self-hosted QLever provides stable, predictable responses.
- **Rate Limits:** Overpass imposes strict rate limitations that break API functionality. QLever operates without these external constraints.
- **Latency:** Overpass latency is highly variable; QLever offers consistent latency for our specific datasets.
- **Query flexibility:** Overpass QL is specialized but rigid. SPARQL is a standard, highly expressive graph query language.
- **Maintainability:** SPARQL is standardized and readable. The RDF model allows for future data federation.

## OSM-to-RDF mapping path

To use QLever, raw OSM data is converted to queryable RDF triples via this pipeline:

1. **Extraction:** Download raw OSM data (e.g., PBF) for the target region.
2. **Filtering:** Retain only relevant entities (e.g., restaurants, terraces).
3. **Mapping:** Convert elements to subject-predicate-object triples.
4. **Loading:** Build optimized QLever indexes from the RDF data.
5. **API:** Expose SPARQL endpoints to the application.

**Conceptual Mapping:**

- **Subjects:** OSM nodes, ways, and relations become unique RDF resources (IRIs).
- **Predicates/Objects:** Tags (e.g., `amenity=restaurant`) become properties and values.
- **Geometry:** Spatial data is converted to Well-Known Text (WKT) and linked via `geo:asWKT`.

## Implementation notes

- **Geometry Translation:** Raw OSM ways just reference nodes; a translation layer must resolve these into explicit geometries (like WKT polygons) for QLever.
- **Tag Conventions:** Complex OSM tags (semicolon-separated values, prefixes like `disused:`) require specific mapping conventions to be queryable in SPARQL.
- **Schema Design:** Simplifying property paths during mapping significantly improves API query speed.
- **Indexing:** QLever performance relies on pre-computed indexes; clean, filtered RDF preparation is critical.

## Trade-off

The primary cost is the added complexity of the preprocessing pipeline (extract, convert, index, host) compared to simple HTTP GETs to Overpass. This is outweighed by absolute control, reliability, and extensibility.
