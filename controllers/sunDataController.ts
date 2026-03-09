// @ts-ignore
import SunCalc from "suncalc3";
import SunData from "../models/sunDataModel.js";
import Terras from "../models/terrasModel.js";
import Restaurant from "../models/restaurantModel.js";
import Event from "../models/eventModel.js";
import Weather from "../models/weatherModel.js";
import { Request, Response } from "express";

/** Helper: calculate sun data for given coordinates and time */
function calculateSunData(dateTime: Date, lat: number, lng: number, cloudFactor?: number) {
  const position = SunCalc.getPosition(dateTime, lat, lng);
  const times = SunCalc.getSunTimes(dateTime, lat, lng);

  const altitudeDegrees = position.altitude * (180 / Math.PI);
  // Bereken de ruwe intensiteit op basis van de zonhoogte
  let intensity = Math.max(0, Math.min(100, Math.round(altitudeDegrees / 90 * 100)));

  // Pas de cloudFactor toe als die beschikbaar is.
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

/** Helper: haal de meest recente cloudFactor op voor een locatie */
async function getCloudFactor(lat: number, lng: number): Promise<number | undefined> {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
  const weather = await Weather.findOne({
    "location.coordinates": [lng, lat],
    timestamp: { $gte: fifteenMinAgo },
  });
  return weather?.cloudFactor as number | undefined;
}

/** Helper: get or create cached sun data for a location */
async function getOrCreateCache(
  locationRef: any,
  locationType: "Terras" | "Restaurant" | "Event",
  lat: number,
  lng: number,
  dateTime: Date,
) {
  const cacheDate = new Date(dateTime);
  cacheDate.setMinutes(0, 0, 0);

  let cached = await SunData.findOne({ locationRef, locationType, dateTime: cacheDate });

  if (!cached) {
    // Haal de cloudFactor op uit de weerdata cache
    const cloudFactor = await getCloudFactor(lat, lng);
    const sun = calculateSunData(dateTime, lat, lng, cloudFactor);

    cached = await SunData.create({
      locationRef,
      locationType,
      dateTime: cacheDate,
      intensity: sun.intensity,
      azimuth: sun.position.azimuth,
      altitude: sun.position.altitude,
      goldenHour: sun.goldenHour,
    });
  }

  return cached;
}

/**
 * GET /api/sun/:lat/:lng/:time
 * Calculate sun position for given coordinates and time.
 * If time is "now", uses current time.
 */
export const getSunPosition = async (req: Request, res: Response) => {
  try {
    const lat = req.params.lat as string;
    const lng = req.params.lng as string;
    const time = req.params.time as string;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ message: "Invalid latitude or longitude" });
    }

    const dateTime = time === "now" ? new Date() : new Date(time);
    if (isNaN(dateTime.getTime())) {
      return res.status(400).json({ message: "Invalid time format. Use ISO 8601 or 'now'" });
    }

    // Haal cloudFactor op als er weerdata beschikbaar is
    const cloudFactor = await getCloudFactor(latitude, longitude);
    const sun = calculateSunData(dateTime, latitude, longitude, cloudFactor);

    res.status(200).json({
      latitude,
      longitude,
      dateTime: dateTime.toISOString(),
      position: {
        azimuth: sun.position.azimuth,
        altitude: sun.position.altitude,
        azimuthDegrees: sun.position.azimuth * (180 / Math.PI),
        altitudeDegrees: sun.position.altitude * (180 / Math.PI),
      },
      intensity: sun.intensity,
      cloudFactor: sun.cloudFactor,
      goldenHour: sun.goldenHour,
      sunTimes: {
        solarNoon: sun.times.solarNoon?.value,
        sunriseStart: sun.times.sunriseStart?.value,
        sunriseEnd: sun.times.sunriseEnd?.value,
        sunsetStart: sun.times.sunsetStart?.value,
        sunsetEnd: sun.times.sunsetEnd?.value,
      },
      links: [
        { rel: "self", href: `/api/sun/${lat}/${lng}/${time}` },
      ],
    });
  } catch (error) {
    res.status(500).json({ message: "Error calculating sun position", error });
  }
};

/**
 * GET /api/sun/terras/:terrasId
 * Get sun data for a specific terras.
 * Optionally accepts ?time= query param (defaults to now).
 */
export const getSunForTerras = async (req: Request, res: Response) => {
  try {
    const terras = await Terras.findById(req.params.terrasId);
    if (!terras) {
      return res.status(404).json({ message: "Terras not found" });
    }

    const [lng, lat] = terras.location.coordinates;
    const timeParam = req.query.time as string;
    const dateTime = timeParam ? new Date(timeParam) : new Date();

    if (isNaN(dateTime.getTime())) {
      return res.status(400).json({ message: "Invalid time format" });
    }

    const cached = await getOrCreateCache(terras._id, "Terras", lat, lng, dateTime);

    res.status(200).json({
      terras: { id: terras._id, name: terras.name, address: terras.address },
      sunData: cached,
      links: [
        { rel: "self", href: `/api/sun/terras/${terras._id}` },
        { rel: "terras", href: `/api/terrassen/${terras._id}` },
      ],
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching sun data for terras", error });
  }
};

/**
 * GET /api/sun/restaurant/:restaurantId
 * Get sun data for a specific restaurant.
 * Optionally accepts ?time= query param (defaults to now).
 */
export const getSunForRestaurant = async (req: Request, res: Response) => {
  try {
    const restaurant = await Restaurant.findById(req.params.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const [lng, lat] = restaurant.location.coordinates;
    const timeParam = req.query.time as string;
    const dateTime = timeParam ? new Date(timeParam) : new Date();

    if (isNaN(dateTime.getTime())) {
      return res.status(400).json({ message: "Invalid time format" });
    }

    const cached = await getOrCreateCache(restaurant._id, "Restaurant", lat, lng, dateTime);

    res.status(200).json({
      restaurant: { id: restaurant._id, name: restaurant.name, address: restaurant.address },
      sunData: cached,
      links: [
        { rel: "self", href: `/api/sun/restaurant/${restaurant._id}` },
        { rel: "restaurant", href: `/api/restaurants/${restaurant._id}` },
      ],
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching sun data for restaurant", error });
  }
};

/**
 * GET /api/sun/event/:eventId
 * Get sun data for a specific event.
 * Optionally accepts ?time= query param (defaults to now).
 */
export const getSunForEvent = async (req: Request, res: Response) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const [lng, lat] = event.location.coordinates;
    const timeParam = req.query.time as string;
    const dateTime = timeParam ? new Date(timeParam) : new Date();

    if (isNaN(dateTime.getTime())) {
      return res.status(400).json({ message: "Invalid time format" });
    }

    const cached = await getOrCreateCache(event._id, "Event", lat, lng, dateTime);

    res.status(200).json({
      event: { id: event._id, name: event.title, address: event.address },
      sunData: cached,
      links: [
        { rel: "self", href: `/api/sun/event/${event._id}` },
        { rel: "event", href: `/api/events/${event._id}` },
      ],
    });

  } catch (error) {
    res.status(500).json({ message: "Error fetching sun data for event", error });
  }
};


/**
 * GET /api/sun/cache/:locationType/:locationId
 * Get all cached sun data entries for a location.
 */
export const getCachedSunData = async (req: Request, res: Response) => {
  try {
    const { locationType, locationId } = req.params as { locationType: string; locationId: string };
    const validTypes = ["Terras", "Restaurant", "Event"];
    if (!validTypes.includes(locationType)) {
      return res.status(400).json({ message: "Invalid locationType. Use: Terras, Restaurant, or Event" });
    }

    const data = await SunData.find({
      locationRef: locationId,
      locationType,
    }).sort({ dateTime: -1 });

    const plural = locationType === "Terras" ? "terrassen" : locationType.toLowerCase() + 's';

    res.status(200).json({
      count: data.length,
      sunData: data,
      links: [
        { rel: "self", href: `/api/sun/cache/${locationType}/${locationId}` },
        { rel: "location", href: `/api/${plural}/${locationId}` }
      ]
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching cached sun data", error });
  }
};


/** * GET /api/sun/batch
 * Get sun data for multiple locations in a single request.
 * Expects JSON body with array of { lat, lng, time } objects.
 * 
 * Example request body:
 * {
 *   "locations": [
 *     { "lat": 51.05, "lng": 3.73, "time": "2024-06-01T12:00:00Z" },
 *     { "lat": 51.05, "lng": 3.73, "time": "now" }
 *   ]
 * }
 */
export const getSunBatch = async (req: Request, res: Response) => {
  try {
    const locations = req.body.locations as { lat: number; lng: number; time: string }[];
    if (!Array.isArray(locations)) {
      return res.status(400).json({ message: "Invalid request body. Expected { locations: [{ lat, lng, time }] }" });
    }

    const results = locations.map(loc => {
      const dateTime = new Date(loc.time);
      if (isNaN(dateTime.getTime())) {
        return { error: `Invalid time format for location (${loc.lat}, ${loc.lng})` };
      }
      const sun = calculateSunData(dateTime, loc.lat, loc.lng);
      return {
        latitude: loc.lat,
        longitude: loc.lng,
        dateTime: dateTime.toISOString(),
        position: {
          azimuth: sun.position.azimuth,
          altitude: sun.position.altitude,
          azimuthDegrees: sun.position.azimuth * (180 / Math.PI),
          altitudeDegrees: sun.position.altitude * (180 / Math.PI),
        },
        intensity: sun.intensity,
        goldenHour: sun.goldenHour,
      };
    });

    res.status(200).json({
      count: results.length,
      results: results,
      links: [
        { rel: "self", href: "/api/sun/batch" }
      ]
    });
  } catch (error) {
    res.status(500).json({ message: "Error processing batch sun data request", error });
  }
};