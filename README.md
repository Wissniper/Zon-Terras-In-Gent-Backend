# Terras Sun-Seeker — Backend API

A production REST API that tells you which outdoor café terraces in Ghent, Belgium are currently sunny. Built with Node.js, TypeScript, Express, and MongoDB, deployed on Oracle Cloud at **[api.sun-seeker.be](https://api.sun-seeker.be)**.

> **Authors:** Wisdom Ononiba, Yoanna Oosterlinck — University Ghent, 2026

---

## What it does

Finding a sunny terrace in Ghent is surprisingly hard — a small shift in sun position can put you in shadow behind a church tower. This API solves that by:

- Calculating real-time sun position and intensity for any coordinate using astronomical algorithms (suncalc3)
- Syncing terrace, restaurant, and event data from OpenStreetMap (Overpass API) and the City of Ghent open data platform
- Fetching weather and cloud cover from Open-Meteo every 15 minutes via a background cron job
- Exposing a clean REST API consumed by the React frontend

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (LTS) |
| Language | TypeScript 5 |
| Framework | Express 5 |
| Database | MongoDB + Mongoose |
| Sun calculations | suncalc3 |
| Weather | Open-Meteo (no API key required) |
| Geo data | Overpass API (OpenStreetMap) |
| Event data | Stad Gent Open Data API + SPARQL |
| Scheduling | node-cron |
| Testing | Jest + ts-jest |
| Process manager | systemd |
| Reverse proxy | NGINX with SSL termination |
| SSL | Let's Encrypt (auto-renewing) |
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
  Node.js : 3000          ← Express app (systemd service)
       │
       ├── MongoDB         ← Terraces, restaurants, events, weather cache
       ├── Open-Meteo      ← Weather + cloud cover (cron every 15 min)
       ├── Overpass API    ← OSM terrace + restaurant data (cron Monday 03:00)
       └── Stad Gent API   ← Tourist events (cron daily 04:00)
```

---

## API endpoints

Base URL: `https://api.sun-seeker.be`

### Terraces

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/terrasen` | List all terraces |
| `GET` | `/api/terrasen/:id` | Get a single terrace |
| `POST` | `/api/terrasen` | Create a terrace |
| `PUT` | `/api/terrasen/:id` | Replace a terrace |
| `PATCH` | `/api/terrasen/:id` | Update a terrace |
| `DELETE` | `/api/terrasen/:id` | Delete a terrace |

### Restaurants

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/restaurants` | List all restaurants |
| `GET` | `/api/restaurants/:id` | Get a single restaurant |
| `POST` | `/api/restaurants` | Create a restaurant |
| `PUT` | `/api/restaurants/:id` | Replace a restaurant |
| `PATCH` | `/api/restaurants/:id` | Update a restaurant |
| `DELETE` | `/api/restaurants/:id` | Delete a restaurant |

### Events

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/events` | List all events |
| `GET` | `/api/events/today` | Events happening today |
| `GET` | `/api/events/with-terrasen` | Events linked to a terrace |
| `GET` | `/api/events/:id` | Get a single event |
| `PUT` | `/api/events/:id` | Replace an event |
| `PATCH` | `/api/events/:id` | Update an event |
| `DELETE` | `/api/events/:id` | Delete an event |

### Sun data

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sun/:lat/:lng/:time` | Sun position + intensity for coordinates (`time` = ISO 8601 or `now`) |
| `GET` | `/api/sun/terras/:terrasId` | Sun data for a specific terrace |
| `GET` | `/api/sun/restaurant/:restaurantId` | Sun data for a specific restaurant |
| `GET` | `/api/sun/event/:eventId` | Sun data for a specific event |
| `GET` | `/api/sun/cache/:locationType/:locationId` | Cached sun data (`locationType`: `Terras`, `Restaurant`, `Event`) |
| `POST` | `/api/sun/batch` | Batch sun data for multiple locations |

### Weather

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/weather/:lat/:lng` | Current weather for coordinates |
| `GET` | `/api/weather/by-location` | Weather filtered by location |
| `GET` | `/api/weather/in-radius` | Weather for all locations within radius |

### Search

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/search/terrasen` | Search terraces by name or sun score |
| `GET` | `/api/search/restaurants` | Search restaurants |
| `GET` | `/api/search/events` | Search events |
| `GET` | `/api/search/semantic` | Semantic/SPARQL-powered search |
| `GET` | `/api/search/nearby/:lat/:lng/:radius` | Find all locations within radius (metres) |

---

## Local development

**Requirements:** Node.js 20+, MongoDB running locally

```bash
git clone https://github.com/Wissniper/Zon-Terras-In-Gent-Backend
cd Zon-Terras-In-Gent-Backend
npm install
cp .env.example .env   # fill in your values
npm run dev            # starts with nodemon + ts-node
```

### Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with hot reload (nodemon + ts-node) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled output (`dist/app.js`) |
| `npm test` | Run Jest test suite |
| `npm run seed:terrassen` | Seed terrace data from Overpass API |
| `npm run seed:restaurants` | Seed restaurant data from Overpass API |
| `npm run seed:events` | Seed event data from Stad Gent API |
| `npm run export-rdf` | Export data as RDF/N-Triples |

---

## Deployment

The app runs on Oracle Cloud (Ubuntu 24.04) as a systemd service behind NGINX.

### Continuous deployment

Every push to `main` automatically deploys to the server via GitHub Actions:

1. Connects to the server over SSH
2. Pulls the latest code
3. Runs `npm run build` (TypeScript compile)
4. Restarts the systemd service

### Manual deploy

```bash
ssh oracle-sun-seeker-vm
cd /home/ubuntu/sun-seeker-backend
git pull
npm run build
sudo systemctl restart sun-seeker-api
```

### Required GitHub Actions secrets

| Secret | Value |
|---|---|
| `SSH_PRIVATE_KEY` | Private key for the `ubuntu` user on the server |
| `SSH_HOST` | Server IP or hostname |
| `SSH_USER` | `ubuntu` |
| `SSH_HOST_KEY` | Server's ECDSA host key (get it with `ssh-keyscan -t ecdsa <host>`) |

---

## Project structure

```
├── app.ts                  # Express app entry point
├── routes/                 # Route definitions
│   ├── terrasRoutes.ts
│   ├── restaurantRoutes.ts
│   ├── eventRoutes.ts
│   ├── sunDataRoutes.ts
│   ├── searchRoutes.ts
│   └── weatherRoutes.ts
├── controllers/            # Request handlers
├── models/                 # Mongoose schemas
├── services/               # Business logic + external API clients
│   ├── weatherCron.ts      # Scheduled data sync jobs
│   ├── sunService.ts       # Sun position calculations
│   ├── weatherService.ts   # Open-Meteo integration
│   ├── terrasDataFetcher.ts
│   ├── restaurantDataFetcher.ts
│   └── eventDataFetcher.ts
├── middleware/             # Express middleware (validation)
├── contexts/               # JSON-LD context definitions
├── scripts/                # One-off data scripts
└── tests/                  # Jest test suites
```

---

## License

Academic project — University Ghent, 2026.
