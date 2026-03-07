import { fetchWeatherApi } from "openmeteo";
import Weather from "../models/weatherModel.js";

export const fetchWeatherData = async (lat: number, lng: number) => {

    //controleren of het nodig is om nieuwe data op te halen:
    //(kan wrs beter, eerder een voorlopige oplossing moest het nodig zijn)
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const current = await Weather.findOne({
        "location.coordinates": [lng, lat],
        timestamp: { $gte: hourAgo }
    });

    if (current) {
        return current;
    }

    const params = {
        latitude: lat,
        longitude: lng,
        hourly: ["temperature_2m", "wind_speed_10m", "uv_index", "cloud_cover"],
        timezone: "auto"
    }

    const url = "https://api.open-meteo.com/v1/forecast";
    const responses = await fetchWeatherApi(url, params);

    const response = responses[0];
    const hourly = response.hourly()!;

    const temp = hourly.variables(0)!.valuesArray()![0];
    const wind = hourly.variables(1)!.valuesArray()![0];
    const uvIndex = hourly.variables(2)!.valuesArray()![0];
    const cloudCover = hourly.variables(3)!.valuesArray()![0];

    const cloudFactor = cloudCover * 0.8;

    const weatherEntry = new Weather({
        timestamp: new Date(),
        temp,
        cloudCover,
        cloudFactor,
        uvIndex,
        wind,
        location: { coordinates: [lng, lat] }
    });

    return await weatherEntry.save();

};