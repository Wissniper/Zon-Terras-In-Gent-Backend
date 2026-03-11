import Terras from "../models/terrasModel.js";
import Restaurant from "../models/restaurantModel.js";
import Event from "../models/eventModel.js";
import { Request, Response } from "express";
import { buildGeoStage, buildSunDataLookup, buildRangeFilter } from "./baseController.js";

/**
 * GET /api/search/terrasen
 *   ?q=korenmarkt              — zoek op naam
 *   ?sunnyOnly=true            — alleen terrasen met intensity > 50
 *   ?minIntensity=60           — minimum intensity
 *   ?maxIntensity=100          — maximum intensity
 *   ?lat=51.05&lng=3.72&radius=1  — binnen straal (km)
 */
export const searchTerrasen = async (req: Request, res: Response) => {
  try {
    const { q, sunnyOnly, minIntensity, maxIntensity, lat, lng, radius } = req.query;

    const pipeline: any[] = [];

    if (lat && lng && radius) {
      pipeline.push(buildGeoStage(lat as string, lng as string, radius as string));
    }

    const match: any = { isDeleted: { $ne: true } };

    if (q) {
      match.name = { $regex: q as string, $options: "i" };
    }

    if (sunnyOnly === "true") {
      match.intensity = { $gt: 50 };
    } else {
      const intensityRange = buildRangeFilter(minIntensity as string, maxIntensity as string);
      if (intensityRange) match.intensity = intensityRange;
    }

    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    pipeline.push(...buildSunDataLookup("Terras"));
    pipeline.push({ $sort: { intensity: -1 } });

    const terrasen = await Terras.aggregate(pipeline);

    const responseData = {
      count: terrasen.length, 
      terrasen: terrasen,
      links: [
          { rel: "self", href: req.originalUrl },
          { rel: "collection", href: "/api/terrasen" }
      ]
    };

    res.format({
      'application/json': () => res.status(200).json(responseData),
      'text/html': () => res.render('terrasen/list', responseData),
      'default': () => res.status(406).send('Not Acceptable')
    });
  } catch (error) {
    res.status(500).json({ message: "Error searching terrasen", error });
  }
};

/**
 * GET /api/search/restaurants
 *   ?q=pizza                   — zoek op naam
 *   ?cuisine=italian           — filter op keuken
 *   ?minRating=3&maxRating=5   — bereik op rating
 *   ?minIntensity=50           — minimum zonintensiteit
 *   ?maxIntensity=100          — maximum zonintensiteit
 *   ?lat=51.05&lng=3.72&radius=1  — binnen straal (km)
 */
export const searchRestaurants = async (req: Request, res: Response) => {
  try {
    const { q, cuisine, minRating, maxRating, minIntensity, maxIntensity, lat, lng, radius } = req.query;

    const pipeline: any[] = [];

    if (lat && lng && radius) {
      pipeline.push(buildGeoStage(lat as string, lng as string, radius as string));
    }

    const match: any = { isDeleted: { $ne: true } };

    if (q) {
      match.name = { $regex: q as string, $options: "i" };
    }

    if (cuisine) {
      match.cuisine = { $regex: cuisine as string, $options: "i" };
    }

    const ratingRange = buildRangeFilter(minRating as string, maxRating as string);
    if (ratingRange) match.rating = ratingRange;

    const intensityRange = buildRangeFilter(minIntensity as string, maxIntensity as string);
    if (intensityRange) match.intensity = intensityRange;

    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    pipeline.push(...buildSunDataLookup("Restaurant"));
    pipeline.push({ $sort: { rating: -1 } });

    const restaurants = await Restaurant.aggregate(pipeline);

    const responseData = {
      count: restaurants.length, 
      restaurants: restaurants, 
      links: [
          { rel: "self", href: req.originalUrl }, 
          { rel: "collection", href: "/api/restaurants" } 
      ]
    };

    res.format({
      'application/json': () => res.status(200).json(responseData),
      'text/html': () => res.render('restaurants/list', responseData),
      'default': () => res.status(406).send('Not Acceptable')
    });
  } catch (error) {
    res.status(500).json({ message: "Error searching restaurants", error });
  }
};

/**
 * GET /api/search/events
 *   ?q=jazz                    — zoek op titel
 *   ?date=2026-03-07           — events actief op deze datum
 *   ?lat=51.05&lng=3.72&radius=1  — binnen straal (km)
 */
export const searchEvents = async (req: Request, res: Response) => {
  try {
    const { q, date, lat, lng, radius } = req.query;

    const pipeline: any[] = [];

    if (lat && lng && radius) {
      pipeline.push(buildGeoStage(lat as string, lng as string, radius as string));
    }

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

    const events = await Event.aggregate(pipeline);

    const responseData = {
      count: events.length, 
      events: events, 
      links: [
          { rel: "self", href: req.originalUrl }, 
          { rel: "collection", href: "/api/events" } 
      ]
    };

    res.format({
      'application/json': () => res.status(200).json(responseData),
      'text/html': () => res.render('events/list', responseData),
      'default': () => res.status(406).send('Not Acceptable')
    });
  } catch (error) {
    res.status(500).json({ message: "Error searching events", error });
  }
};

/**
 * GET /api/search/nearby/:lat/:lng/:radius
 * Vind ALLE entiteiten (terrasen, restaurants, events) binnen straal (km).
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
      Terras.find({ ...geoQuery, isDeleted: { $ne: true } }),
      Restaurant.find({ ...geoQuery, isDeleted: { $ne: true } }),
      Event.find(geoQuery),
    ]);

    const responseData = {
      counts: {
        terrasen: terrasen.length,
        restaurants: restaurants.length,
        events: events.length,
        total: terrasen.length + restaurants.length + events.length,
      },
      data: {
        terrasen: terrasen,
        restaurants: restaurants,
        events: events,
      },
      links: [
        { rel: "self", href: `/api/search/nearby/${lat}/${lng}/${radius}` },
        { rel: "terrasen", href: "/api/terrasen" },
        { rel: "restaurants", href: "/api/restaurants" },
        { rel: "events", href: "/api/events" }
      ]
    };
    

  res.format({
    'application/json': () => res.status(200).json(responseData),
    'text/html': () => res.render('search/nearby', responseData),
    'default': () => res.status(406).send('Not Acceptable')
    });
  } catch (error) {
    res.status(500).json({ message: "Error searching nearby", error });
  }
};
