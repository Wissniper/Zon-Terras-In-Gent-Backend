import { fetchWeatherApi } from "openmeteo";
import Weather from "../models/weatherModel.js";

/**
 * Haal weerdata op voor een locatie.
 * Checkt eerst of er recente data in de cache zit (< 15 min oud).
 * Zo niet, haalt het verse data op van Open-Meteo en slaat het op in MongoDB.
 */
export const fetchWeatherData = async (lat: number, lng: number) => {
    // Check of er recente data is (minder dan 15 minuten oud)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const cached = await Weather.findOne({
        "location.coordinates": [lng, lat],
        timestamp: { $gte: oneHourAgo },
    });

    if (cached) {
        return cached;
    }

    // Haal verse data op van Open-Meteo
    const params = {
        latitude: lat,
        longitude: lng,
        hourly: ["temperature_2m", "wind_speed_10m", "uv_index", "cloud_cover"],
        timezone: "auto",
    };

    const url = process.env.OPENMETEO_URL || "https://api.open-meteo.com/v1/forecast";
    const responses = await fetchWeatherApi(url, params);

    const response = responses[0];
    const hourly = response.hourly()!;

    // Haal de waarden op voor het huidige uur (index 0)
    const temperature = hourly.variables(0)!.valuesArray()![0];
    const windspeed = hourly.variables(1)!.valuesArray()![0];
    const uvIndex = hourly.variables(2)!.valuesArray()![0];
    const cloudCover = hourly.variables(3)!.valuesArray()![0];

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
