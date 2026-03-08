import cron from "node-cron";
import { fetchWeatherData } from "./weatherService.js";

// Standaard coördinaten voor Gent centrum
const GENT_LAT = 51.05;
const GENT_LNG = 3.72;

// Start een cron job die elke 15 minuten weerdata ophaalt van Open-Meteo
// en opslaat in MongoDB. Dit zorgt ervoor dat we altijd recente weerdata
// beschikbaar hebben zonder dat een gebruiker erop moet wachten.
//
// Cron expressie: elke 15 minuten (0, 15, 30, 45 van elk uur)
export function startWeatherCron() {
  cron.schedule("*/15 * * * *", async () => {
    try {
      console.log(`[WeatherCron] Fetching weather data at ${new Date().toISOString()}`);
      await fetchWeatherData(GENT_LAT, GENT_LNG);
      console.log("[WeatherCron] Weather data updated successfully");
    } catch (error) {
      console.error("[WeatherCron] Error fetching weather data:", error);
    }
  });

  console.log("[WeatherCron] Scheduled weather fetch every 15 minutes");
}
