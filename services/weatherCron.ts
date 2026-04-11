import cron from "node-cron";
import { fetchWeatherData } from "./weatherService.js";
import { syncTerrasData } from "./terrasDataFetcher.js";
import { syncRestaurantData } from "./restaurantDataFetcher.js";
import { syncEventData } from "./eventDataFetcher.js";
import { calculateSunData, getCloudFactor } from "./sunService.js";
import Terras from "../models/terrasModel.js";
import Restaurant from "../models/restaurantModel.js";
import Event from "../models/eventModel.js";

// Rond coördinaten af naar een raster van ~111m
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

// Half a grid cell in degrees — used to find all documents that round to a given grid point
const COORD_EPSILON = 0.0005;

/**
 * Berekent de huidige zonintensiteit voor een locatie en schrijft die terug
 * naar alle Terras-, Restaurant- en Event-documenten op die locatie.
 */
async function updateIntensityForLocation(lat: number, lng: number): Promise<void> {
  const cloudFactor = await getCloudFactor(lat, lng);
  const { intensity } = calculateSunData(new Date(), lat, lng, cloudFactor);

  // Zoek alle documenten waarvan de (afgeronde) coördinaten overeenkomen met dit grid-punt
  const coordQuery = {
    "location.coordinates.0": { $gte: lng - COORD_EPSILON, $lte: lng + COORD_EPSILON },
    "location.coordinates.1": { $gte: lat - COORD_EPSILON, $lte: lat + COORD_EPSILON },
  };

  await Promise.all([
    Terras.updateMany({ ...coordQuery, isDeleted: { $ne: true } }, { $set: { intensity } }),
    Restaurant.updateMany({ ...coordQuery, isDeleted: { $ne: true } }, { $set: { intensity } }),
    Event.updateMany({ ...coordQuery, isDeleted: { $ne: true } }, { $set: { intensity } }),
  ]);
}

// Start cron jobs:
// - Weerdata + intensiteit: elke 15 minuten
export function startWeatherCron() {
  cron.schedule("*/15 * * * *", async () => {
    try {
      const locations = await getUniqueLocations();

      if (locations.length === 0) {
        console.log("[WeatherCron] No locations found, skipping");
        return;
      }

      console.log(`[WeatherCron] Fetching weather for ${locations.length} locations at ${new Date().toISOString()}`);

      // Sequentieel ophalen om rate limits te respecteren
      for (const { lat, lng } of locations) {
        try {
          await fetchWeatherData(lat, lng);
          await updateIntensityForLocation(lat, lng);
        } catch (err) {
          console.error(`[WeatherCron] Failed for ${lat},${lng}:`, err);
        }
      }

      console.log("[WeatherCron] Weather data and intensities updated");
    } catch (error) {
      console.error("[Cron] Error:", error);
    }
  });

  console.log("[Cron] Scheduled weather + sun update every 15 minutes");

  // Terras + restaurant sync: elke maandag om 03:00 's nachts
  cron.schedule("0 3 * * 1", async () => {
    try {
      console.log("[TerrasCron] Syncing terras data from Overpass API");
      const terrasResult = await syncTerrasData();
      console.log(`[TerrasCron] Done: ${terrasResult.total} elements, ${terrasResult.unique} unique, ${terrasResult.created} new, ${terrasResult.updated} updated, ${terrasResult.duplicatesSkipped} duplicates skipped`);

      console.log("[RestaurantCron] Syncing restaurant data from Overpass API");
      const restResult = await syncRestaurantData();
      console.log(`[RestaurantCron] Done: ${restResult.total} elements, ${restResult.unique} unique, ${restResult.created} new, ${restResult.updated} updated, ${restResult.duplicatesSkipped} duplicates skipped`);
    } catch (error) {
      console.error("[DataSyncCron] Error:", error);
    }
  });

  console.log("[Cron] Scheduled terras + restaurant data sync every Monday at 03:00");

  // Event sync: elke dag om 04:00
  cron.schedule("0 4 * * *", async () => {
    try {
      console.log("[EventCron] Syncing event data from Stad Gent API");
      const result = await syncEventData();
      console.log(`[EventCron] Done: ${result.total} records, ${result.parsed} parsed, ${result.created} new, ${result.updated} updated, ${result.skipped} skipped`);
    } catch (error) {
      console.error("[EventCron] Error:", error);
    }
  });

  console.log("[Cron] Scheduled event data sync every day at 04:00");

  // Direct bij startup data ophalen als collecties leeg zijn
  Promise.all([Terras.countDocuments(), Restaurant.countDocuments(), Event.countDocuments()]).then(async ([terrasCount, restCount, eventCount]) => {
    if (terrasCount === 0) {
      console.log("[TerrasCron] Empty collection, fetching initial data");
      try {
        const result = await syncTerrasData();
        console.log(`[TerrasCron] Initial sync: ${result.unique} terrasen imported (${result.duplicatesSkipped} duplicates skipped)`);
      } catch (error) {
        console.error("[TerrasCron] Initial sync failed:", error);
      }
    }

    if (restCount === 0) {
      console.log("[RestaurantCron] Empty collection, fetching initial data");
      try {
        const result = await syncRestaurantData();
        console.log(`[RestaurantCron] Initial sync: ${result.unique} restaurants imported (${result.duplicatesSkipped} duplicates skipped)`);
      } catch (error) {
        console.error("[RestaurantCron] Initial sync failed:", error);
      }
    }

    if (eventCount === 0) {
      console.log("[EventCron] Empty collection, fetching initial data");
      try {
        const result = await syncEventData();
        console.log(`[EventCron] Initial sync: ${result.parsed} events imported (${result.skipped} skipped)`);
      } catch (error) {
        console.error("[EventCron] Initial sync failed:", error);
      }
    }
  });
}
