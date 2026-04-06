# Data Seeding Scripts

Scripts to populate the database with real-world data from external APIs. All scripts are **idempotent** — they use upsert operations so running them multiple times won't create duplicates.

## Prerequisites

- MongoDB running (local or remote)
- `.env` file configured (see `.env.example`)

## Scripts

### Restaurants

```bash
npm run seed:restaurants
```

- **Source:** [Overpass API](https://overpass-api.de) (OpenStreetMap)
- **Query:** All `amenity=restaurant` nodes/ways within Gent's administrative boundary
- **Target collection:** `restaurants`
- **Unique key:** `osmUri` (e.g. `https://www.openstreetmap.org/node/12345`)
- **Mapped fields:** name, address, cuisine, phone, website, openingHours, takeaway, location (GeoJSON)
- **Defaults on insert:** `intensity: 0`, `rating: 0`, `isDeleted: false`

### Terrassen

```bash
npm run seed:terrassen
```

- **Source:** [Overpass API](https://overpass-api.de) (OpenStreetMap)
- **Query:** All `amenity=cafe|bar|pub` nodes/ways within Gent's administrative boundary
- **Target collection:** `terras`
- **Unique key:** `osmUri`
- **Mapped fields:** name, description, address, url, location (GeoJSON)
- **Defaults on insert:** `intensity: 0`, `isDeleted: false`

### Events

```bash
npm run seed:events
```

- **Source:** [Stad Gent Open Data API](https://data.stad.gent) — dataset `toeristische-evenementen-visit-gent`
- **Pagination:** Fetches all pages (100 records per page)
- **Target collection:** `events`
- **Unique key:** `eventUri` (external event identifier or generated from title + date)
- **Mapped fields:** title, description, address, url, date_start, date_end, location (GeoJSON)
- **Defaults on insert:** `intensity: 0`, `isDeleted: false`
- **Skips:** Records without geo coordinates or with invalid dates

## Environment Variables

| Variable | Default | Used by |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/zon-terras-gent` | All |
| `OVERPASS_URL` | `https://overpass-api.de/api/interpreter` | Restaurants, Terrassen |
| `STADGENT_EVENTS_URL` | `https://data.stad.gent/api/explore/v2.1/catalog/datasets/toeristische-evenementen-visit-gent/records` | Events |

## Output

Each script logs progress and a final summary:

```
[SeedRestaurants] Received 245 elements from Overpass.
[SeedRestaurants] Done! 230 inserted, 0 updated, 15 skipped.
```

- **inserted** — new records created
- **updated** — existing records modified (data changed since last run)
- **skipped** — elements without a name, coordinates, or other required fields
