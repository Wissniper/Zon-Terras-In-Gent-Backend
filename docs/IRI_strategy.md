# Internationalized Resource Identifier (IRI) Strategy

For our internal data to be queryable in QLever alongside OSM, every MongoDB entity needs a stable, globally unique **IRI**.

## Base URI
We use `http://api.sun-seeker.be/` as our internal base URI for resources.

## Entity IRI Patterns

| Entity | IRI Pattern | Notes |
| --- | --- | --- |
| **Terras** | `http://api.sun-seeker.be/terras/{uuid}` | `uuid` is generated on creation. `osmUri` (owl:sameAs) links to OSM. |
| **Restaurant** | `http://api.sun-seeker.be/restaurant/{uuid}` | Linked to Ghent's restaurant dataset and OSM via `osmUri`. |
| **Event** | `http://api.sun-seeker.be/event/{uuid}` | May also refer to external `eventUri` via `schema:sameAs`. |
| **Weather** | `http://api.sun-seeker.be/weather/{timestamp}/{longitude}/{latitude}` | Snapshot of weather at a specific time and place. |
| **SunData** | `http://api.sun-seeker.be/sun/{locationType}/{locationUuid}/{timestamp}` | Calculated sun position for a specific location at a given time. |

## Implementation Details
- **UUIDs**: We use version 4 UUIDs to ensure uniqueness. The API supports fetching resources via this UUID.
- **Federation**: The `osmUri` field stores the absolute URI to the OpenStreetMap entity (e.g., `https://www.openstreetmap.org/node/12345`). In JSON-LD, this is mapped to `owl:sameAs`.
- **JSON-LD**: These IRIs are used as the `@id` in our JSON-LD responses.
