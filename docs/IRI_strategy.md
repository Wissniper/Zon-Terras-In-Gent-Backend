# Internationalized Resource Identifier (IRI) Strategy

For our internal data to be queryable in QLever alongside OSM, every MongoDB entity needs a stable, globally unique **IRI**.

## Base URI
We use `http://sun-seeker.be/` as our internal base URI for resources.

## Entity IRI Patterns

| Entity | IRI Pattern | Notes |
| --- | --- | --- |
| **Terras** | `http://sun-seeker.be/terras/{uuid}` | `uuid` is generated on creation. |
| **Restaurant** | `http://sun-seeker.be/restaurant/{uuid}` | Linked to Ghent's restaurant dataset. |
| **Event** | `http://sun-seeker.be/event/{uuid}` | May also refer to external `eventUri` via `schema:sameAs`. |
| **Weather** | `http://sun-seeker.be/weather/{timestamp}/{longitude}/{latitude}` | Snapshot of weather at a specific time and place. |
| **SunData** | `http://sun-seeker.be/sun/{locationType}/{locationUuid}/{timestamp}` | Calculated sun position for a specific location at a given time. |

## Implementation Details
- **UUIDs**: We use version 4 UUIDs to ensure uniqueness.
- **JSON-LD**: These IRIs are used as the `@id` in our JSON-LD responses.
- **Mappings**: External identifiers (like Gent Open Data identifiers) should be mapped to these stable internal IRIs.

