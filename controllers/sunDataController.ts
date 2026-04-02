import { isValidObjectId } from "mongoose";
import SunData from "../models/sunDataModel.js";
import Terras from "../models/terrasModel.js";
import Restaurant from "../models/restaurantModel.js";
import Event from "../models/eventModel.js";
import { Request, Response } from "express";
import { calculateSunData, getCloudFactor } from "../services/sunService.js";
import { fetchWeatherData } from "../services/weatherService.js";

function buildIdQuery(id: string | string[]) {
  const val = Array.isArray(id) ? id[0] : id;
  return isValidObjectId(val) ? { _id: val } : { uuid: val };
}

const CACHE_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

/** Helper: get or create cached sun data for a location, recalculating if stale (>15 min) */
async function getOrCreateCache(
  locationRef: any,
  locationType: "Terras" | "Restaurant" | "Event",
  lat: number,
  lng: number,
  dateTime: Date,
) {
  const cacheDate = new Date(dateTime);
  cacheDate.setMinutes(0, 0, 0);

  const cached = await SunData.findOne({ locationRef, locationType, dateTime: cacheDate });

  const isStale = !cached || (Date.now() - new Date((cached as any).updatedAt ?? cached.dateTime).getTime()) > CACHE_MAX_AGE_MS;

  if (!isStale) return cached;

  // Ensure fresh weather data is available, then recalculate
  await fetchWeatherData(lat, lng);
  const cloudFactor = await getCloudFactor(lat, lng);
  const sun = calculateSunData(dateTime, lat, lng, cloudFactor);

  const sunFields = {
    locationRef,
    locationType,
    dateTime: cacheDate,
    intensity: sun.intensity,
    azimuth: sun.position.azimuth,
    altitude: sun.position.altitude,
    goldenHour: sun.goldenHour,
  };

  if (cached) {
    await SunData.updateOne({ _id: cached._id }, { $set: sunFields });
    return { ...cached.toObject(), ...sunFields };
  }

  return await SunData.create(sunFields);
}

/**
 * GET /api/sun/:lat/:lng/:time
 * Calculate sun position for given coordinates and time.
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

    const cloudFactor = await getCloudFactor(latitude, longitude);
    const sun = calculateSunData(dateTime, latitude, longitude, cloudFactor);

    const responseData = {
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
      ]
    };

    res.format({
      'application/json': () => res.status(200).json(responseData),
      'text/html': () => res.render('sun/display', responseData),
      'default': () => res.status(406).send('Not Acceptable')
    });
  } catch (error) {
    res.status(500).json({ message: "Error calculating sun position", error });
  }
};

/** Factory for entity-specific sun data handlers */
function createGetSunForEntity(config: {
  model: any;
  paramName: string;
  locationType: "Terras" | "Restaurant" | "Event";
  responseKey: string;
  nameField: string;
  selfPrefix: string;
  entityPrefix: string;
}) {
  return async (req: Request, res: Response) => {
    try {
      const entity = await config.model.findOne(buildIdQuery(req.params[config.paramName]));
      if (!entity) {
        return res.status(404).json({ message: `${config.locationType} not found` });
      }

      const [lng, lat] = entity.location.coordinates;
      const timeParam = req.query.time as string;
      const dateTime = timeParam ? new Date(timeParam) : new Date();

      if (isNaN(dateTime.getTime())) {
        return res.status(400).json({ message: "Invalid time format" });
      }

      const cached = await getOrCreateCache(entity._id, config.locationType, lat, lng, dateTime);

      const responseData = {
        [config.responseKey]: { uuid: entity.uuid, name: entity[config.nameField], address: entity.address },
        sunData: cached,
        links: [
          { rel: "self", href: `${config.selfPrefix}${entity.uuid}` },
          { rel: config.responseKey, href: `${config.entityPrefix}${entity.uuid}` },
        ],
      };

      res.format({
        'application/json': () => res.status(200).json(responseData),
        'text/html': () => res.render('sun/display', responseData),
        'default': () => res.status(406).send('Not Acceptable')
      });
    } catch (error) {
      res.status(500).json({ message: `Error fetching sun data for ${config.responseKey}`, error });
    }
  };
}

export const getSunForTerras = createGetSunForEntity({
  model: Terras, paramName: "terrasId", locationType: "Terras",
  responseKey: "terras", nameField: "name",
  selfPrefix: "/api/sun/terras/", entityPrefix: "/api/terrasen/",
});

export const getSunForRestaurant = createGetSunForEntity({
  model: Restaurant, paramName: "restaurantId", locationType: "Restaurant",
  responseKey: "restaurant", nameField: "name",
  selfPrefix: "/api/sun/restaurant/", entityPrefix: "/api/restaurants/",
});

export const getSunForEvent = createGetSunForEntity({
  model: Event, paramName: "eventId", locationType: "Event",
  responseKey: "event", nameField: "title",
  selfPrefix: "/api/sun/event/", entityPrefix: "/api/events/",
});

/**
 * GET /api/sun/cache/:locationType/:locationId
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

    const plural = locationType === "Terras" ? "terrasen" : locationType.toLowerCase() + 's';

    const responseData = {
      count: data.length,
      sunData: data,
      links: [
        { rel: "self", href: `/api/sun/cache/${locationType}/${locationId}` },
        { rel: "location", href: `/api/${plural}/${locationId}` }
      ]
    };

    res.format({
      'application/json': () => res.status(200).json(responseData),
      'text/html': () => res.render('sun/list', responseData),
      'default': () => res.status(406).send('Not Acceptable')
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching cached sun data", error });
  }
};

/**
 * POST /api/sun/batch
 * Get sun data for multiple locations in a single request.
 *
 * Request body: { locations: [{ lat, lng, time }] }
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

    const responseData = {
      count: results.length,
      results: results,
      links: [{ rel: "self", href: "/api/sun/batch" }]
    };

    res.format({
      'application/json': () => res.status(200).json(responseData),
      'text/html': () => res.render('sun/batch', responseData),
      'default': () => res.status(406).send('Not Acceptable')
    });
  } catch (error) {
    res.status(500).json({ message: "Error processing batch sun data request", error });
  }
};
