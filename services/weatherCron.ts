import cron from "node-cron";
import { fetchWeatherData } from "./weatherService.js";
import Terras from "../models/terrasModel.js";
import Restaurant from "../models/restaurantModel.js";
import Event from "../models/eventModel.js";

// Rond coördinaten af naar een raster van ~500m
// Zo worden nabijgelegen locaties gegroepeerd en maken we minder API calls
const GRID_PRECISION = 3; // 3 decimalen ≈ 111m
// ~500 is diagonaal van 111m x 111m grid

function roundCoord(val: number): number {
  return parseFloat(val.toFixed(GRID_PRECISION));
}

// Haal alle unieke (afgeronde) locaties op uit de database
async function getUniqueLocations(): Promise<{ lat: number; lng: number }[]> {
  const [terrasen, restaurants, events] = await Promise.all([
    Terras.find({ isDeleted: { $ne: true } }).select("location").lean(), // lean zorgt voor plain JS objecten i.p.v. Mongoose documenten en is sneller als we alleen lezen
    Restaurant.find({ isDeleted: { $ne: true } }).select("location").lean(),
    Event.find({ isDeleted: { $ne: true } }).select("location").lean(),
  ]);

  const seen = new Set<string>();
  const locations: { lat: number; lng: number }[] = [];

  for (const doc of [...terrasen, ...restaurants, ...events]) {
    const coords = doc.location?.coordinates;
    if (!coords || coords.length < 2) continue;

    const lng = roundCoord(coords[0]);
    const lat = roundCoord(coords[1]);
    const key = `${lat},${lng}`;

    if (!seen.has(key)) {
      seen.add(key);
      locations.push({ lat, lng });
    }
  }

  return locations;
}

// Start een cron job die elke 15 minuten weerdata ophaalt
// voor alle locaties waar terrassen en restaurants staan
export function startWeatherCron() {
  cron.schedule("*/15 * * * *", async () => {
    try {
      const locations = await getUniqueLocations();

      if (locations.length === 0) {
        console.log("[WeatherCron] No locations found in database, skipping");
        return;
      }

      console.log(`[WeatherCron] Fetching weather for ${locations.length} locations at ${new Date().toISOString()}`);

      // Sequentieel ophalen om rate limits te respecteren
      for (const { lat, lng } of locations) {
        try {
          await fetchWeatherData(lat, lng);
        } catch (err) {
          console.error(`[WeatherCron] Failed for ${lat},${lng}:`, err);
        }
      }

      console.log("[WeatherCron] Weather data updated successfully");
    } catch (error) {
      console.error("[WeatherCron] Error:", error);
    }
  });

  console.log("[WeatherCron] Scheduled weather fetch every 15 minutes");
}
