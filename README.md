# Sun Seeker — Backend API

A production REST API that tells you which outdoor café terraces in Ghent are sunny **right now** — or at any moment over the next two days. Sun position is computed astronomically, then adjusted for live cloud cover and the shadow cast by surrounding buildings. Built with Node.js, TypeScript, Express, and MongoDB; deployed on Oracle Cloud at **[api.sun-seeker.be](https://api.sun-seeker.be)**.

> **Authors:** Wisdom Ononiba, Yoanna Oosterlinck — University Ghent, 2026

---

## What it does

Finding a sunny terrace in Ghent is surprisingly hard — a small shift in sun position can put you in shadow behind a church tower. This API solves that by combining four signals:

- **Astronomical sun position** for any coordinate using suncalc3 (azimuth, altitude, golden hour)
- **Cloud cover** from Open-Meteo, refreshed hourly into a Mongo cache and broadcast over WebSocket
- **Building shadows** computed from OpenStreetMap geometry — every terras gets a shadow score per hour for 48 hours, refreshed every 6 hours
- **Time travel** — every list and search endpoint accepts `?time=ISO8601`, so the frontend timeline can answer "where will the sun be at 18:30?" without N+1 backend roundtrips

The result: one number per terras, between 0 and 100, that already accounts for sky position × clouds × buildings.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (LTS) |
| Language | TypeScript 5 (ESM, `"type": "module"`) |
| Framework | Express 5 |
| Database | MongoDB + Mongoose (with 2dsphere indexes) |
| Sun calculations | suncalc3 |
| Weather | Open-Meteo (no API key) |
| Geo data | Overpass API + QLever SPARQL (OpenStreetMap) |
| Event data | Stad Gent Open Data SPARQL + REST |
| Live updates | Socket.io (server pushes `weather_update` events) |
| Linked data | JSON-LD content negotiation, N-Triples export |
| View engine | Pug (HTML fallback for content-negotiated responses) |
| Scheduling | node-cron |
| Testing | Jest + ts-jest + mongodb-memory-server |
| Process manager | systemd |
| Reverse proxy | NGINX with Let's Encrypt SSL |
| Hosting | Oracle Cloud (Ubuntu 24.04) |
| CI/CD | GitHub Actions |

---

## Architecture

```
Browser / Frontend
       │
       ▼
  NGINX (443/80)          ← SSL termination, HTTP→HTTPS redirect
  api.sun-seeker.be
       │
       ▼
  Node.js : 3000          ← Express + Socket.io (systemd service)
       │
       ├── MongoDB         ← Terraces, restaurants, events, weather, sun, shadows
       ├── Open-Meteo      ← Weather + cloud cover (hourly cron, 15-min cache)
       ├── Overpass API    ← OSM building geometry for shadow scoring
       ├── QLever SPARQL   ← OSM cafés, bars, restaurants (Mondays 03:00)
       └── Stad Gent       ← Tourist events SPARQL + geo REST (daily 04:00)
```

---

## Key features

### Time-aware intensity

The `Terras`, `Restaurant`, and `Event` documents store a cached `intensity` field, but every list/search endpoint recomputes it on the fly:

```
GET /api/search/terrasen?time=2026-05-10T18:30:00Z
GET /api/terrasen?time=2026-05-10T18:30:00Z
GET /api/sun/terras/<uuid>?time=2026-05-10T18:30:00Z
```

`services/intensityRefresher.ts` does ONE bulk weather query, picks the nearest cloud factor in memory per item, then computes `sin(altitude) × cloudFactor × shadowScore` at the requested time. This is what lets the frontend `SunTimeline` scrub through 48 hours without flooding the backend.

### Shadow scoring

`services/shadowScoringService.ts` fetches all building footprints inside Ghent's bounding box from Overpass, then for each terras and each hour of the next 48 hours computes what fraction of a 3×3 sample grid sits outside any building's shadow cone (projected along the sun azimuth). Scores are stored in the `shadowscores` collection, indexed `(terrasRef, timestamp)`, and the cron in `services/sunScoreService.ts` refreshes them every 6 hours.

`getNearestShadowScore(terrasId, datetime)` picks the bracketing-or-nearest record so any timestamp inside the 48-hour window resolves in O(log n).

### JSON-LD content negotiation

Every endpoint that returns an entity supports content negotiation:

| `Accept` header | Response |
|---|---|
| `application/ld+json` | JSON-LD with Schema.org + Hydra context |
| `application/json` | Plain JSON |
| `text/html` | Pug-rendered page |

Collections come back as `hydra:Collection` with `hydra:member` and link relations. Every Mongoose `save` and `findOneAndUpdate` triggers `services/rdfExporter.ts` which appends N-Triples to `data/export.nt` — the full graph can also be dumped on demand via `npm run export-rdf`.

### Bounding-box queries

Every list and search endpoint accepts `?north=&south=&east=&west=` and adds a `$geoWithin` filter. The frontend uses this to avoid downloading the whole city when only a viewport is visible.

---

## API endpoints

Base URL: `https://api.sun-seeker.be`

### Terraces

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/terrasen` | List, with `?time=`, `?north/south/east/west=`, sorted by intensity |
| `GET` | `/api/terrasen/:id` | Single terrace + linked events + current shadow score |

### Restaurants

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/restaurants` | List with bbox + filter support |
| `GET` | `/api/restaurants/:id` | Single restaurant + linked events |

### Events

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/events` | List events |
| `GET` | `/api/events/today` | Active today (or `?date=YYYY-MM-DD`) |
| `GET` | `/api/events/with-terrasen` | Events joined to nearest terraces (≤ 100 m) |
| `GET` | `/api/events/:id` | Single event + venue (terras or restaurant) |

### Sun data

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sun/:lat/:lng/:time` | Sun position + intensity for any coordinate |
| `GET` | `/api/sun/terras/:id?time=` | Time-aware sun + shadow for one terras |
| `GET` | `/api/sun/restaurant/:id?time=` | Time-aware sun for one restaurant |
| `GET` | `/api/sun/event/:id?time=` | Time-aware sun for one event |
| `GET` | `/api/sun/cache/:type/:id` | Raw cached sun records |
| `POST` | `/api/sun/batch` | Sun data for many `{lat,lng,time}` in one call |
| `POST` | `/api/sun/refresh-shadow-scores` | Trigger an out-of-band shadow refresh (202 Accepted) |

### Search

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/search/terrasen` | `?q&sunnyOnly&minIntensity&maxIntensity&time&lat&lng&radius&north&south&east&west` |
| `GET` | `/api/search/restaurants` | Same params + `?cuisine` |
| `GET` | `/api/search/events` | `?q&date&lat&lng&radius&bbox` |
| `GET` | `/api/search/semantic` | "Events at an Italian restaurant with intensity > 80" via Mongo aggregation |
| `GET` | `/api/search/nearby/:lat/:lng/:radius` | All entity types within radius (km) |

### Weather

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/weather/:lat/:lng` | Current weather (hits Open-Meteo or 15-min cache) |
| `GET` | `/api/weather/by-location` | Today's weather rows for exact coordinates |
| `GET` | `/api/weather/in-radius` | Today's weather within radius (km) |

### Real-time

A Socket.io connection on the same port broadcasts `weather_update` whenever the hourly weather cron finishes. The frontend uses this to invalidate its TanStack Query cache.

---

## Cron schedule

| Job | Cadence | What it does |
|---|---|---|
| Weather + intensity refresh | `0 * * * *` (hourly) | Pull weather for unique gridded locations, recompute `intensity` per doc, emit Socket event |
| Shadow score refresh | `0 */6 * * *` (every 6 h) | Re-fetch Ghent buildings, recompute 48 h of scores per terras |
| Terrace + restaurant sync | `0 3 * * 1` (Mon 03:00) | Re-import OSM cafés/bars/pubs/restaurants via QLever SPARQL |
| Event sync | `0 4 * * *` (daily 04:00) | Re-import Stad Gent tourist events via SPARQL + geo REST |

All crons also self-trigger at startup if the relevant collection is empty.

---

## Local development

**Requirements:** Node.js 20+, MongoDB running locally

```bash
git clone https://github.com/Wissniper/Zon-Terras-In-Gent-Backend
cd Zon-Terras-In-Gent-Backend
npm install
cp .env.example .env   # MONGODB_URI, FRONTEND_URL, optional SPARQL/OVERPASS overrides
npm run dev            # nodemon + ts-node, hot reload
```

### Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with hot reload |
| `npm run build` | TypeScript → `dist/`, copy `views/` and `public/`, prune dev deps |
| `npm start` | Run compiled `dist/app.js` |
| `npm test` | Jest suite (uses `mongodb-memory-server`, no real DB needed) |
| `npm run seed:terrassen` | Seed terraces from Overpass |
| `npm run seed:restaurants` | Seed restaurants from Overpass |
| `npm run seed:events` | Seed events from Visit Gent REST API |
| `npm run export-rdf` | Dump full graph to `data/full_dump.nt` |

---

## Deployment

The app runs on Oracle Cloud (Ubuntu 24.04) as a systemd service behind NGINX.

### Continuous deployment

Every push to `main` auto-deploys via GitHub Actions:

1. SSH into the server
2. Pull, `npm run build`
3. `sudo systemctl restart sun-seeker-api`

### Manual deploy

```bash
ssh oracle-sun-seeker-vm
cd /home/ubuntu/sun-seeker-backend
git pull && npm run build
sudo systemctl restart sun-seeker-api
```

### Required GitHub Actions secrets

| Secret | Value |
|---|---|
| `SSH_PRIVATE_KEY` | Private key for the `ubuntu` user |
| `SSH_HOST` | Server IP or hostname |
| `SSH_USER` | `ubuntu` |
| `SSH_HOST_KEY` | Output of `ssh-keyscan -t ecdsa <host>` |

---

## Project structure

```
├── app.ts                       # Express + Socket.io entry point
├── routes/                      # Route definitions
├── controllers/                 # Request handlers
│   ├── baseController.ts        # CRUD factories + bbox/geo helpers
│   ├── terrasController.ts      # Terras list w/ shadow-aware aggregation
│   ├── searchController.ts      # Time-aware search endpoints
│   └── …
├── models/                      # Mongoose schemas
│   ├── terrasModel.ts
│   ├── restaurantModel.ts
│   ├── eventModel.ts
│   ├── sunDataModel.ts          # Per-hour sun cache
│   ├── shadowScoreModel.ts      # 48-h shadow grid per terras
│   └── weatherModel.ts
├── services/                    # Business logic + external integrations
│   ├── sunService.ts            # suncalc3 wrapper + cloud factor
│   ├── intensityRefresher.ts    # Bulk-weather, time-aware recompute
│   ├── shadowScoringService.ts  # Building footprints → per-point shadow grid
│   ├── sunScoreService.ts       # 6-hourly shadow refresh cron
│   ├── weatherCron.ts           # Hourly weather + intensity update
│   ├── weatherService.ts        # Open-Meteo client w/ 15-min cache
│   ├── terrasDataFetcher.ts     # QLever SPARQL → Terras
│   ├── restaurantDataFetcher.ts # QLever SPARQL → Restaurant
│   ├── eventDataFetcher.ts      # Stad Gent SPARQL + geo REST → Event
│   ├── sparqlFetcher.ts         # Generic SPARQL POST helper
│   └── rdfExporter.ts           # N-Triples generator + triplestore sync
├── middleware/validation.ts     # express-validator chains
├── contexts/jsonld.ts           # Schema.org + Hydra contexts
├── views/                       # Pug templates (HTML content negotiation)
├── scripts/seed/                # One-off seeders
└── tests/                       # Jest suites (≥ 246 tests)
```

---

## License

Academic project — University Ghent, 2026.
