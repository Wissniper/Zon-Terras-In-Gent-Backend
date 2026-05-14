import { isValidObjectId } from "mongoose";
import SunData from "../models/sunDataModel.js";
import Terras from "../models/terrasModel.js";
import Restaurant from "../models/restaurantModel.js";
import Event from "../models/eventModel.js";
import { Request, Response } from "express";
import { calculateSunData, getCloudFactor } from "../services/sunService.js";
import { SUNDATA_CONTEXT, toLd } from "../contexts/jsonld.js";
import { getNearestShadowScore } from "../services/shadowScoringService.js";
import { refreshShadowScores } from "../services/sunScoreService.js";
import { loadRecentWeather, nearestCloudFactor, computeIntensity } from "../services/intensityRefresher.js";

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

  // Read cloud factor from the cache (kept fresh by the hourly weather cron).
  // Don't trigger an external API fetch per request — it serializes the
  // request behind a slow network call and the cron handles refresh anyway.
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

  // Note: we deliberately do NOT mirror sun.intensity onto the entity's own
  // `intensity` field here. The entity field is "raw, no shadow"; per-request
  // endpoints apply shadow at read time via recomputeIntensities or
  // getNearestShadowScore. Mirroring here would be a wasted write.

  // Upsert atomically — avoids a TOCTOU race where two concurrent misses both
  // try to insert and the second trips the unique index on
  // (locationRef, locationType, dateTime).
  return await SunData.findOneAndUpdate(
    { locationRef, locationType, dateTime: cacheDate },
    { $set: sunFields },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
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
      
    };

    res.format({
      'application/ld+json': () => res.status(200).json({
        "@context": SUNDATA_CONTEXT,
        "@type": "zt:SunData",
        "@id": `/api/sun/${lat}/${lng}/${time}`,
        ...responseData,
      }),
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

      // Cache write is a side-effect (kept so /api/sun/cache/* still works and
      // SunData rows accumulate for the JSON-LD timeline). The RESPONSE
      // intensity is computed via the same primitive that /api/search/* uses,
      // so the leaderboard, discover list, popup and detail page can never
      // disagree on the same (id, time) pair.
      const cached = await getOrCreateCache(entity._id, config.locationType, lat, lng, dateTime);
      const cachedPlain = typeof (cached as any).toObject === "function"
        ? (cached as any).toObject()
        : cached;

      let shadowScore = 1.0;
      if (config.locationType === "Terras") {
        shadowScore = await getNearestShadowScore(entity._id, dateTime);
      }

      const weatherPoints = await loadRecentWeather();
      const live = computeIntensity(weatherPoints, lat, lng, dateTime, shadowScore);
      const adjustedIntensity = live.intensity;

      const responseData = {
        [config.responseKey]: { uuid: entity.uuid, name: entity[config.nameField], address: entity.address, intensity: adjustedIntensity },
        sunData: {
          ...cachedPlain,
          dateTime: dateTime.toISOString(),
          intensity: adjustedIntensity,
          shadowScore,
          azimuth: live.sun.position.azimuth,
          altitude: live.sun.position.altitude,
          goldenHour: live.sun.goldenHour,
          isNight: live.isNight,
          cloudFactor: live.cloudFactor ?? null,
        },
      };

      const selfHref = `${config.selfPrefix}${entity.uuid}`;
      res.format({
        'application/ld+json': () => res.status(200).json({
          "@context": SUNDATA_CONTEXT,
          "@type": "zt:SunData",
          "@id": selfHref,
          ...responseData,
        }),
        'application/json': () => res.status(200).json(responseData),
        'text/html': () => res.render('sun/display', responseData),
        'default': () => res.status(406).send('Not Acceptable')
      });
    } catch (error: any) {
      console.error("DEBUG INTERNAL ERROR:", error.message, error.stack);
      res.status(500).json({
        message: `Error fetching sun data for ${config.responseKey}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

export const triggerShadowScoreRefresh = async (req: Request, res: Response) => {
  res.status(202).json({ message: "Shadow score refresh started" });
  refreshShadowScores().catch((err) => console.error("[refresh] failed:", err.message));
};

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

    // Resolve UUID to ObjectId for the locationRef query
    const modelMap: Record<string, any> = { Terras, Restaurant, Event };
    const model = modelMap[locationType];
    const entity = await model.findOne(buildIdQuery(locationId));
    const refId = entity ? entity._id : locationId;

    const data = await SunData.find({
      locationRef: refId,
      locationType,
    }).sort({ dateTime: -1 });

    const responseData = {
      count: data.length,
      sunData: data,
    
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
    // validateSunBatch already enforces shape, item types, and array size cap.
    const locations = req.body.locations as { lat: number; lng: number; time: string }[];

    if (locations.length === 0) {
      const responseData = { count: 0, results: [] as object[] };
      return res.format({
        'application/json': () => res.status(200).json(responseData),
        'text/html': () => res.render('sun/batch', responseData),
        'default': () => res.status(406).send('Not Acceptable'),
      });
    }

    // Bulk-load weather once, then nearest-neighbour lookup per location.
    // Same path /api/search/* uses, so intensities here match the rest of
    // the app for nearby entities (cloud-factor-aware, but no shadow score —
    // the batch endpoint takes raw coords, not entity refs).
    const weatherPoints = await loadRecentWeather();

    const results = locations.map(loc => {
      const dateTime = loc.time === "now" ? new Date() : new Date(loc.time);
      if (isNaN(dateTime.getTime())) {
        return { error: `Invalid time format for location (${loc.lat}, ${loc.lng})` };
      }
      const cf = nearestCloudFactor(weatherPoints, loc.lat, loc.lng);
      const sun = calculateSunData(dateTime, loc.lat, loc.lng, cf);
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
