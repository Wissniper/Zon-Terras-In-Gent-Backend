import Terras from "../models/terrasModel.js";
import Restaurant from "../models/restaurantModel.js";
import Event from "../models/eventModel.js";
import { Request, Response } from "express";

/**
 * GET /api/search/terrasen
 * Aggregation pipeline with filters:
 *   ?q=korenmarkt              — full-text search on name
 *   ?sunnyOnly=true            — only terrassen with intensity > 50
 *   ?minIntensity=60           — minimum intensity
 *   ?maxIntensity=100          — maximum intensity
 *   ?lat=51.05&lng=3.72&radius=1  — within radius (km)
 */
export const searchTerrasen = async (req: Request, res: Response) => {
  try {
    const { q, sunnyOnly, minIntensity, maxIntensity, lat, lng, radius } = req.query;

    const pipeline: any[] = [];

    // Geo filter (must be first if used)
    if (lat && lng && radius) {
      pipeline.push({
        $geoNear: {
          near: { type: "Point", coordinates: [Number(lng), Number(lat)] },
          distanceField: "distance",
          maxDistance: Number(radius) * 1000,
          spherical: true,
        },
      });
    }

    // Match stage
    const match: any = {};

    if (q) {
      match.name = { $regex: q as string, $options: "i" };
    }

    if (sunnyOnly === "true") {
      match.intensity = { $gt: 50 };
    } else {
      const intensityFilter: any = {};
      if (minIntensity) intensityFilter.$gte = Number(minIntensity);
      if (maxIntensity) intensityFilter.$lte = Number(maxIntensity);
      if (Object.keys(intensityFilter).length > 0) {
        match.intensity = intensityFilter;
      }
    }

    // Only add $match if we have any filters to apply
    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    // Join latest cached sun data
    pipeline.push({
      $lookup: {
        // We link terassen to sun data via locationRef (terras _id) en locationType ("Terras")
        from: "sundatas",
        let: { refId: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$locationRef", "$$refId"] },
            { $eq: ["$locationType", "Terras"] },
          ]}}},
          { $sort: { dateTime: -1 } },
          { $limit: 1 },
        ],
        as: "latestSunData",
      },
    });

    pipeline.push({
      // latestSunData is an array because of the $lookup, but we know we limited it to 1 result, so we take the first element
      $addFields: {
        latestSunData: { $arrayElemAt: ["$latestSunData", 0] },
      },
    });

    // Sort by intensity descending
    pipeline.push({ $sort: { intensity: -1 } });

    // If we have any filters, use the aggregation pipeline. Otherwise, just find all and sort
    const terrasen = pipeline.length > 0
      ? await Terras.aggregate(pipeline)
      : await Terras.find().sort({ intensity: -1 });

    res.status(200).json(terrasen);
  } catch (error) {
    res.status(500).json({ message: "Error searching terrasen", error });
  }
};

/**
 * GET /api/search/restaurants
 * Aggregation pipeline with filters:
 *   ?q=pizza                   — full-text search on name
 *   ?cuisine=italian           — filter by cuisine
 *   ?minRating=3&maxRating=5   — range query on rating
 *   ?minIntensity=50           — minimum sun intensity
 *   ?maxIntensity=100          — maximum sun intensity
 *   ?lat=51.05&lng=3.72&radius=1  — within radius (km)
 */
export const searchRestaurants = async (req: Request, res: Response) => {
  try {
    const { q, cuisine, minRating, maxRating, minIntensity, maxIntensity, lat, lng, radius } = req.query;

    const pipeline: any[] = [];

    // Geo filter
    if (lat && lng && radius) {
      pipeline.push({
        $geoNear: {
          near: { type: "Point", coordinates: [Number(lng), Number(lat)] },
          distanceField: "distance",
          maxDistance: Number(radius) * 1000,
          spherical: true,
        },
      });
    }

    // Match stage
    const match: any = {};

    if (q) {
      match.name = { $regex: q as string, $options: "i" };
    }

    if (cuisine) {
      match.cuisine = { $regex: cuisine as string, $options: "i" };
    }

    const ratingFilter: any = {};
    if (minRating) ratingFilter.$gte = Number(minRating);
    if (maxRating) ratingFilter.$lte = Number(maxRating);
    if (Object.keys(ratingFilter).length > 0) {
      match.rating = ratingFilter;
    }

    const intensityFilter: any = {};
    if (minIntensity) intensityFilter.$gte = Number(minIntensity);
    if (maxIntensity) intensityFilter.$lte = Number(maxIntensity);
    if (Object.keys(intensityFilter).length > 0) {
      match.intensity = intensityFilter;
    }

    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    // Join latest cached sun data
    pipeline.push({
      $lookup: {
        from: "sundatas",
        let: { refId: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$locationRef", "$$refId"] },
            { $eq: ["$locationType", "Restaurant"] },
          ]}}},
          { $sort: { dateTime: -1 } },
          { $limit: 1 },
        ],
        as: "latestSunData",
      },
    });

    pipeline.push({
      $addFields: {
        latestSunData: { $arrayElemAt: ["$latestSunData", 0] },
      },
    });

    pipeline.push({ $sort: { rating: -1 } });

    const restaurants = pipeline.length > 0
      ? await Restaurant.aggregate(pipeline)
      : await Restaurant.find().sort({ rating: -1 });

    res.status(200).json(restaurants);
  } catch (error) {
    res.status(500).json({ message: "Error searching restaurants", error });
  }
};

/**
 * GET /api/search/events
 * Filters:
 *   ?q=jazz                    — full-text search on title
 *   ?date=2026-03-07           — events active on this date
 *   ?lat=51.05&lng=3.72&radius=1  — within radius (km)
 */
export const searchEvents = async (req: Request, res: Response) => {
  try {
    const { q, date, lat, lng, radius } = req.query;

    const pipeline: any[] = [];

    // Geo filter
    if (lat && lng && radius) {
      pipeline.push({
        $geoNear: {
          near: { type: "Point", coordinates: [Number(lng), Number(lat)] },
          distanceField: "distance",
          maxDistance: Number(radius) * 1000,
          spherical: true,
        },
      });
    }

    // Match stage
    const match: any = {};

    if (q) {
      match.title = { $regex: q as string, $options: "i" };
    }

    if (date) {
      const day = new Date(date as string);
      day.setHours(0, 0, 0, 0);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      match.date_start = { $lt: nextDay };
      match.date_end = { $gte: day };
    }

    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    pipeline.push({ $sort: { date_start: 1 } });

    const events = pipeline.length > 0
      ? await Event.aggregate(pipeline)
      : await Event.find().sort({ date_start: 1 });

    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({ message: "Error searching events", error });
  }
};

/**
 * GET /api/search/nearby/:lat/:lng/:radius
 * Find ALL entities (terrasen, restaurants, events) within radius (km).
 */
export const searchNearby = async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.params.lat as string);
    const lng = parseFloat(req.params.lng as string);
    const radius = parseFloat(req.params.radius as string);

    if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
      return res.status(400).json({ message: "Invalid lat, lng, or radius" });
    }

    const geoQuery = {
      location: {
        $nearSphere: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: radius * 1000,
        },
      },
    };

    const [terrasen, restaurants, events] = await Promise.all([
      Terras.find(geoQuery),
      Restaurant.find(geoQuery),
      Event.find(geoQuery),
    ]);

    res.status(200).json({
      terrasen,
      restaurants,
      events,
      counts: {
        terrasen: terrasen.length,
        restaurants: restaurants.length,
        events: events.length,
        total: terrasen.length + restaurants.length + events.length,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error searching nearby", error });
  }
};
