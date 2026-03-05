// @ts-ignore
import SunCalc from "suncalc3";
import SunData from "../models/sunDataModel.js";
import Terras from "../models/terrasModel.js";
import { Request, Response } from "express";

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

    const position = SunCalc.getPosition(dateTime, latitude, longitude);
    const times = SunCalc.getSunTimes(dateTime, latitude, longitude);

    // Raw intensity based on altitude (0 at horizon, 100 at zenith)
    const altitudeDegrees = position.altitude * (180 / Math.PI);
    const intensity = Math.max(0, Math.min(100, Math.round(altitudeDegrees / 90 * 100)));

    res.status(200).json({
      latitude,
      longitude,
      dateTime: dateTime.toISOString(),
      position: {
        azimuth: position.azimuth,
        altitude: position.altitude,
        azimuthDegrees: position.azimuth * (180 / Math.PI),
        altitudeDegrees,
        distance: position.distance,
        parallacticAngle: position.parallacticAngle,
      },
      intensity,
      sunTimes: {
        solarNoon: times.solarNoon?.value,
        sunriseStart: times.sunriseStart?.value,
        sunriseEnd: times.sunriseEnd?.value,
        sunsetStart: times.sunsetStart?.value,
        sunsetEnd: times.sunsetEnd?.value,
        goldenHourDawnStart: times.goldenHourDawnStart?.value,
        goldenHourDawnEnd: times.goldenHourDawnEnd?.value,
        goldenHourDuskStart: times.goldenHourDuskStart?.value,
        goldenHourDuskEnd: times.goldenHourDuskEnd?.value,
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
 * Get sun data for a specific terras using its stored coordinates.
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

    // Round to the hour for cache key
    const cacheDate = new Date(dateTime);
    cacheDate.setMinutes(0, 0, 0);

    // Check cache
    let cached = await SunData.findOne({ terrasId: terras._id, dateTime: cacheDate });

    if (!cached) {
      const position = SunCalc.getPosition(dateTime, lat, lng);

      const altitudeDegrees = position.altitude * (180 / Math.PI);
      const intensity = Math.max(0, Math.min(100, Math.round(altitudeDegrees / 90 * 100)));

      cached = await SunData.create({
        terrasId: terras._id,
        dateTime: cacheDate,
        intensity,
        azimuth: position.azimuth,
        altitude: position.altitude,
      });
    }

    res.status(200).json({
      terras: { id: terras._id, name: terras.name, address: terras.address },
      sunData: cached,
      links: [
        { rel: "self", href: `/api/sun/terras/${terras._id}` },
        { rel: "terras", href: `/api/terrasen/${terras._id}` },
      ],
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching sun data for terras", error });
  }
};

/**
 * GET /api/sun/cache/:terrasId
 * Get all cached sun data entries for a terras.
 */
export const getCachedSunData = async (req: Request, res: Response) => {
  try {
    const data = await SunData.find({ terrasId: req.params.terrasId }).sort({ dateTime: -1 });
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: "Error fetching cached sun data", error });
  }
};
