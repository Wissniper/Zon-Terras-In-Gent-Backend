// @ts-ignore
import SunCalc from "suncalc3";
import Weather from "../models/weatherModel.js";

// Bereken zonpositie, intensiteit en golden hour voor een locatie en tijdstip
export function calculateSunData(dateTime: Date, lat: number, lng: number, cloudFactor?: number) {
  const position = SunCalc.getPosition(dateTime, lat, lng);
  const times = SunCalc.getSunTimes(dateTime, lat, lng);

  let intensity = Math.max(0, Math.min(100, Math.round(Math.sin(position.altitude) * 100)));

  // cloudFactor = cloudCover * 0.8 (bv. 50% bewolking = 40% reductie)
  if (cloudFactor !== undefined && cloudFactor > 0) {
    intensity = Math.max(0, Math.round(intensity * (1 - cloudFactor / 100)));
  }

  return {
    position,
    times,
    intensity,
    cloudFactor: cloudFactor ?? null,
    goldenHour: {
      dawnStart: times.goldenHourDawnStart?.value,
      dawnEnd: times.goldenHourDawnEnd?.value,
      duskStart: times.goldenHourDuskStart?.value,
      duskEnd: times.goldenHourDuskEnd?.value,
    },
  };
}

// Haal de meest recente cloudFactor op voor een locatie
export async function getCloudFactor(lat: number, lng: number): Promise<number | undefined> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const weather = await Weather.findOne({
    "location.coordinates": [lng, lat],
    timestamp: { $gte: oneHourAgo },
  });
  return weather?.cloudFactor as number | undefined;
}
