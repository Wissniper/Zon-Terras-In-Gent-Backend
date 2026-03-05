# Terras Sun-Seeker: Zonoverzicht voor Gentse Terrassen

**Wisdom Ononiba, Yoanna Oosterlinck** — Februari 2026

## Probleemstelling

In Gent is een zonnig terras vinden lastig. Een kleine verschuiving in zonpositie maakt het verschil tussen zon of schaduw door kerktorens en gebouwen. Studenten en terrasgangers lopen vaak vergeefs.

## Doelstelling

Terras Sun-Seeker toont real-time welke Gentse caféterrassen zonnig zijn. Helpt studenten, remote workers en fotografen de juiste plek te vinden.

Kaart met lichtintensiteit of kleurcodes: geel voor zon, blauw voor schaduw. Sun-Dial toont zonvoorspelling vooruit in de tijd.

## Doelgroep

- **Student bij Korenmarkt**: zonnig café tijdens pauze.
- **Remote worker hittegolf**: schaduwrijke terrassen.
- **Fotograaf**: golden hour notificaties.

---

## 1. Eigen API

De API maakt het mogelijk om data-updates dynamisch en schaalbaar te beheren.

- **Endpoints** voor real-time zondata per locatie (terras, restaurant, event), met parameters zoals locatie, tijdstip en lichtintensiteit (bijv. `GET /api/sun/:lat/:lng/:time`).
- **Golden Hour** data per locatie: dawn/dusk start- en eindtijden, ideaal voor fotografen en terrasgangers.
- **Zondata per entiteit**: `GET /api/sun/terras/:id`, `GET /api/sun/restaurant/:id` — met caching in MongoDB per uur.
- **Weerdata-integratie** via externe bronnen zoals Open-Meteo (geen key nodig, gratis voor non-commercial).
- **Event listeners** via WebSockets (Socket.io) voor automatische updates bij zonpositie- of bewolkingswijzigingen.

### Setup stappen

1. `npx tsc --init; npm i express typescript @types/express @types/node ts-node nodemon mongoose socket.io @types/socket.io suncalc3`
2. Maak `.env`: `MONGODB_URI=mongodb://localhost:27017/terras`, `OPENMETEO_URL=https://api.open-meteo.com`

### Sun API endpoints

| Endpoint | Beschrijving |
|---|---|
| `GET /api/sun/:lat/:lng/:time` | Zonpositie + golden hour voor coördinaten (`time` = ISO 8601 of `now`) |
| `GET /api/sun/terras/:terrasId` | Zondata voor een terras (optioneel `?time=`) |
| `GET /api/sun/restaurant/:restaurantId` | Zondata voor een restaurant (optioneel `?time=`) |
| `GET /api/sun/cache/:locationType/:locationId` | Gecachte zondata (locationType: `Terras`, `Restaurant`, `Event`) |

### Suncalc libraries (3 alternatieven)

- **Primary**: suncalc3 (`npm i suncalc3`) – lichtgewicht, accuraat; Pros: geen deps; Cons: basis; https://www.npmjs.com/package/suncalc3
- **Alt1**: SunCalc.js (GitHub clone) – vanilla JS; Pros: no build; Cons: outdated; https://github.com/mourner/suncalc
- **Alt2**: NOAA Solar API – HTTP calls; Pros: officieel; Cons: rate limits; https://gml.noaa.gov/grad/solcalc/

### Weer APIs (3 alternatieven)

- **Primary**: Open-Meteo (`https://api.open-meteo.com/v1/forecast?latitude=51.05&longitude=3.72&current_weather=true`) – gratis, no key; Pros: high-res; Cons: non-comm > 10k/day
- **Alt1**: OpenWeatherMap free tier – key nodig; Pros: veel data; Cons: 60 calls/min; https://openweathermap.org/api
- **Alt2**: Tomorrow.io free – 5-daags forecast; Pros: hyperlocal; Cons: limits; https://www.tomorrow.io/weather-api/

### 1.1 3D-modellering Data

#### 1.1.1 Accumuleren van 3D-gegevens

Download CSV van Gent 3D blocks (1km² tiles, OBJ/GLTF): https://data.stad.gent/explore/dataset/gent-in-3d/table. Script: fetch CSV, download tiles.

**Alternatieven:**
- **Alt1**: Stad.Gent API v2 – JSON export; Pros: direct; Cons: incompleet.
- **Alt2**: OpenDataSoft – export CSV/GeoJSON; Pros: filters; Cons: size limits; https://gent.opendatasoft.com

#### 1.1.2 Verwerking van 3D-gegevens

Node script met Three.js voor shadow raycasting: `npm i three`. Cache shadows in MongoDB per uur/locatie.

```javascript
const THREE = require('three');
// Load OBJ, raycast from sun position
```

### 1.2 Weerdata

#### 1.2.1 Accumuleren van weerdata

Cron job (node-cron): fetch Open-Meteo elke 15min, store in MongoDB.

#### 1.2.2 Verwerking van weerdata

Bereken cloud factor: `cloudCover * 0.8` op intensity.

### 1.3 Toeristische evenementen data

#### 1.3.1 Accumuleren van toeristische evenementen data

SPARQL/REST van https://data.stad.gent/api/datasets/toeristische-evenementen-visit-gent. Fetch top 50 events.

**Alternatieven:**
- **Alt1**: VisitGent RSS; Pros: simpel; Cons: unstructured.
- **Alt2**: Eventbrite API Gent; Pros: tickets; Cons: key.

#### 1.3.2 Verwerking van toeristische evenementen data

Filter events nabij terrassen, mark op map.

### 1.4 Restaurant data

#### 1.4.1 Accumuleren van restaurant data

Via Overpass API (OpenStreetMap): https://overpass-api.de/api/interpreter

```python
import requests
overpass_url = "http://overpass-api.de/api/interpreter"
overpass_query = """
[out:json][timeout:25];
area[name="Gent"]->.a;
(node["amenity"="restaurant"](area.a););
out;
"""
response = requests.get(overpass_url, params={'data': overpass_query})
restaurants = response.json()
```

**Alternatieven:**
- **Alt2**: Yelp API; Pros: reviews; Cons: US-focus; https://yelp.com
- **Alt3**: VisitGent terraces list; Pros: lokaal; Cons: statisch; https://visit.gent.be/en/covered-outdoor-cafes-gent

#### 1.4.2 Verwerking van restaurant data

Parse lat/lng, ratings; enrich met sun data.

---

## 2. Backend-frontend communicatie

Gebruik Express API endpoints voor data, WebSockets voor real-time updates. React frontend maakt API calls en luistert naar socket events.

- API calls via Axios: `axios.get('/api/sun/$lat/$lng/$time')`
- WebSocket setup met Socket.io-client: `const socket = io(); socket.on('sunUpdate', data => ...)`
- Error handling: try-catch, retries met exponential backoff.

---

## 3. Client-side: De React-frontend

De React-frontend wordt gebruikt om continu data op te vragen en te visualiseren.

- Interactieve kaart met Leaflet + dynamische schaduwen.
- **Future-Sun-Slider** component (SVG bars per uur).
- **Zoek- en filterfunctie** ("zonnige terrassen >80%").
- Async via TanStack Query / Socket.io.

**Setup:**
```bash
npx create-vite@latest terras-client --template react-ts
cd terras-client
npm i leaflet react-leaflet @tanstack/react-query axios socket.io-client tailwindcss leaflet-shadow-simulator
```

### Map libraries (3 alternatieven)

- **Primary**: Leaflet + leaflet-shadow-simulator (`npm i leaflet-shadow-simulator`); Pros: licht, gratis; https://github.com/ted-piotrowski/leaflet-shadow-simulator
- **Alt1**: Mapbox GL JS – 3D shadows; Pros: mooi; Cons: key/billing.
- **Alt2**: OpenLayers – extensible; Pros: features; Cons: complex.

### 3.1 Interactie en visualisatie

- Island 3D-moddellering - Rond Gent is het leeg.
- Lege ruimte rond de model opvullen met legende, Future-Sun-Slider, filter-mogelijkheden, info per locatie, weerdata, zoekbalk.
- Zonsintensiteit via heatmap (leaflet-shadow-simulator).
- Schaduwrendering via leaflet-shadow-simulator.
- Future-Sun-Slider: SVG cirkeldiagram met kleur per intensiteit.

### 3.2 Zoek- en filterfunctie

`useState` voor filters, query API met params. Zoeken enkel voor terrassen, evenementen, restaurants.

Zoeken op:
- Naam terras
- Zonscore (intensiteit)
- Weercondities (bv. "alleen zonnige terrassen")
- Evenementen nabij terras
- Restaurant rating

```typescript
const [filter, setFilter] = useState({ sunnyOnly: false });
const { data: sunData } = useQuery(['sun', lat, lng, time, filter], fetchSun);
```

Zoeken via MongoDB queries in API, bv. `db.terrassen.find({ intensity: { $gt: 80 } })`. Locaties zijn server-side gefilterd op basis van intensiteit, evenementen, ratings.

### 3.3 Asynchrone communicatie

TanStack Query: `useQuery(['sun', lat, lng], fetchSun)` met polling. WebSockets: `socket.on('sunUpdate', data => setSunData(data))` voor real-time updates.

### 3.4 Shadow rendering

Integreer ShadeMap:

```typescript
import ShadeMap from 'leaflet-shadow-simulator';
const shadeMap = new ShadeMap({ date: new Date(), color: '#01112f' }).addTo(map);
```

### 3.5 Future-Sun-Slider component

SVG circle met hourly arcs, kleur per intensity.

### 3.6 Weerdata-integratie

Floating weather widget met huidige condities (UV-index, wind, temp) via Open-Meteo API.

### 3.7 Kaartelementen

Markers voor:
- **Terrassen**: kleur op basis van zonintensiteit.
- **Evenementen**: iconen voor nabijheid.
- **Restaurants**: sterren-rating.

Popup met details bij klikken: naam, intensiteit, weerdata, evenementen.
Legende met kleurcodes, iconen, filteropties.

### 3.8 Client-side optimalisaties

- **Caching**: TanStack Query.
- **Refresh**: polling 5min.
- **Lazy**: React.lazy voor modals.
- **Progressieve rendering**: skeletons tijdens laden.

---

## 4. Implementatie

- **API**: Node.js + TypeScript + Express + MongoDB.
- **Client**: React + TypeScript + Leaflet.
- **Database**: MongoDB voor zondata, evenementen, restaurants.
- **Versiebeheer**: GitHub + CI/CD (GitHub Actions).