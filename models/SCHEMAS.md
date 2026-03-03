# Database Schema's - Zon-Terras-In-Gent

Dit document beschrijft de 5 Mongoose-schema's die nodig zijn voor de "Terras Sun-Seeker" applicatie, zoals gespecificeerd in `terras-specifics.pdf`.

## 1. Terras (Café)
**Doel:** De kern-resource van de applicatie. Bevat locatiedata van cafés/bars met een terras.
*   **Velden:** `naam`, `locatie` (GeoJSON Point), `identifier` (Visit Gent ID), `beschrijving`, `actueleIntensiteit` (0-100).
*   **Rationale:** Sectie 3.2 vereist snelle filtering op zon-intensiteit (`db.terrassen.find({ intensity: { $gt: 80 } })`).

## 2. Schaduw/Zondata Cache (SunData)
**Doel:** Opslaan van berekende schaduwdata per uur om zware 3D-berekeningen te voorkomen.
*   **Velden:** `terrasId` (Ref), `datumTijd`, `intensiteit`, `azimuth`, `altitude`.
*   **Rationale:** Sectie 1.1.2 vereist: "Cache shadows in MongoDB per uur/locatie".

## 3. Weerdata (Weather)
**Doel:** Caching van weergegevens van Open-Meteo om API-limieten te respecteren.
*   **Velden:** `timestamp`, `temperatuur`, `cloudCover`, `uvIndex`, `windSnelheid`.
*   **Rationale:** Sectie 1.2.1 vereist een cron job die data elke 15 min ophaalt en opslaat in MongoDB.

## 4. Toeristisch Evenement (Event)
**Doel:** Opslaan van evenementen van Visit Gent om ze op de kaart te tonen nabij terrassen.
*   **Velden:** `titel`, `locatie` (GeoJSON Point), `datumTijd`, `beschrijving`, `categorie`.
*   **Rationale:** Sectie 1.3.1 en 4 vermelden MongoDB opslag voor toeristische evenementen.

## 5. Restaurant
**Doel:** Opslaan van eetgelegenheden in de buurt van terrassen (apart van cafés).
*   **Velden:** `naam`, `locatie` (GeoJSON Point), `rating` (0-5 sterren), `osmId` (OpenStreetMap ID).
*   **Rationale:** Sectie 1.4 en 3.7 specificeren aparte markers en data-accumulatie voor restaurants via Overpass API.
