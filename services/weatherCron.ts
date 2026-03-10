import cron from "node-cron";
import { fetchWeatherData } from "./weatherService.js";
import { calculateSunData, getCloudFactor } from "./sunService.js";
import { syncTerrasData } from "./terrasDataFetcher.js";
import { syncRestaurantData } from "./restaurantDataFetcher.js";
import Terras from "../models/terrasModel.js";
import Restaurant from "../models/restaurantModel.js";
import Event from "../models/eventModel.js";
import SunData from "../models/sunDataModel.js";

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

// Bereken zondata voor alle entiteiten en update hun intensity veld + SunData cache
async function updateSunDataForAll() {
  const now = new Date();
  const cacheDate = new Date(now);
  cacheDate.setMinutes(0, 0, 0);

  // Haal alle actieve entiteiten op met hun locatie
  const [terrasen, restaurants, events] = await Promise.all([
    Terras.find({ isDeleted: { $ne: true } }).lean(),
    Restaurant.find({ isDeleted: { $ne: true } }).lean(),
    Event.find({ isDeleted: { $ne: true } }).lean(),
  ]);

  const entities: { id: any; type: "Terras" | "Restaurant" | "Event"; coords: number[] }[] = [
    ...terrasen.map(t => ({ id: t._id, type: "Terras" as const, coords: t.location?.coordinates })),
    ...restaurants.map(r => ({ id: r._id, type: "Restaurant" as const, coords: r.location?.coordinates })),
    ...events.map(e => ({ id: e._id, type: "Event" as const, coords: e.location?.coordinates })),
  ];

  let updated = 0;

  for (const entity of entities) {
    if (!entity.coords || entity.coords.length < 2) continue;

    const [lng, lat] = entity.coords;

    try {
      const cloudFactor = await getCloudFactor(lat, lng);
      const sun = calculateSunData(now, lat, lng, cloudFactor);

      // Upsert in SunData cache
      await SunData.findOneAndUpdate(
        { locationRef: entity.id, locationType: entity.type, dateTime: cacheDate },
        {
          locationRef: entity.id,
          locationType: entity.type,
          dateTime: cacheDate,
          intensity: sun.intensity,
          azimuth: sun.position.azimuth,
          altitude: sun.position.altitude,
          goldenHour: sun.goldenHour,
        },
        { upsert: true }
      );

      // Update intensity veld op de entiteit zelf
      if (entity.type === "Terras") {
        await Terras.updateOne({ _id: entity.id }, { intensity: sun.intensity });
      } else if (entity.type === "Restaurant") {
        await Restaurant.updateOne({ _id: entity.id }, { intensity: sun.intensity });
      } else {
        await Event.updateOne({ _id: entity.id }, { intensity: sun.intensity });
      }

      updated++;
    } catch (err) {
      console.error(`[SunCron] Failed for ${entity.type} ${entity.id}:`, err);
    }
  }

  return updated;
}

// Start cron jobs:
// - Weerdata: elke 15 minuten
// - Zondata: elke 15 minuten (na weerdata, zodat cloudFactor up-to-date is)
export function startWeatherCron() {
  cron.schedule("*/15 * * * *", async () => {
    try {
      // Stap 1: weerdata ophalen
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
        } catch (err) {
          console.error(`[WeatherCron] Failed for ${lat},${lng}:`, err);
        }
      }

      console.log("[WeatherCron] Weather data updated");

      // Stap 2: zondata herberekenen met verse weerdata
      const count = await updateSunDataForAll();
      console.log(`[SunCron] Updated sun data for ${count} entities`);
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

  // Direct bij startup data ophalen als collecties leeg zijn
  Promise.all([Terras.countDocuments(), Restaurant.countDocuments()]).then(async ([terrasCount, restCount]) => {
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
  });
}
