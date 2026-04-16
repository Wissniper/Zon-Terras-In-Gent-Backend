import { fetchWeatherApi } from "openmeteo";
import Weather from "../models/weatherModel.js";

/**
 * Haal weerdata op voor een locatie.
 * Checkt eerst of er recente data in de cache zit (< 15 min oud).
 * Zo niet, haalt het verse data op van Open-Meteo en slaat het op in MongoDB.
 */
export const fetchWeatherData = async (lat: number, lng: number) => {
    // Check of er recente data is (minder dan 15 minuten oud)
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

    const cached = await Weather.findOne({
        "location.coordinates": [lng, lat],
        timestamp: { $gte: fifteenMinAgo },
    });

    if (cached) {
        return cached;
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,uv_index,cloud_cover&timezone=auto`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.current) throw new Error("Geen actuele data beschikbaar");

    const temperature = data.current.temperature_2m;
    const windspeed = data.current.wind_speed_10m; 
    const uvIndex = data.current.uv_index;
    const cloudCover = data.current.cloud_cover;

    // cloudFactor: vermenigvuldig cloudCover met 0.8 om de impact op zonintensiteit te berekenen.
    // Bv. 50% bewolking = 40% reductie van de zonintensiteit.
    const cloudFactor = cloudCover * 0.8;

    const weatherEntry = new Weather({
        timestamp: new Date(),
        temperature,
        cloudCover,
        cloudFactor,
        uvIndex,
        windspeed,
        location: { type: "Point", coordinates: [lng, lat] },
    });

    return await weatherEntry.save();
};
