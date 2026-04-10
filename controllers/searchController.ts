import Terras from "../models/terrasModel.js";
import Restaurant from "../models/restaurantModel.js";
import Event from "../models/eventModel.js";
import { Request, Response } from "express";
import { buildGeoStage, buildSunDataLookup, buildRangeFilter } from "./baseController.js";
import { toCollectionLd } from "../contexts/jsonld.js";

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
      
    };

    res.format({
      'application/ld+json': () => res.status(200).json(
        toCollectionLd("terras", terrasen, req.originalUrl)
      ),
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
      
    };

    res.format({
      'application/ld+json': () => res.status(200).json(
        toCollectionLd("restaurant", restaurants, req.originalUrl)
      ),
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
     
    };

    res.format({
      'application/ld+json': () => res.status(200).json(
        toCollectionLd("event", events, req.originalUrl)
      ),
      'application/json': () => res.status(200).json(responseData),
      'text/html': () => res.render('events/list', responseData),
      'default': () => res.status(406).send('Not Acceptable')
    });
  } catch (error) {
    res.status(500).json({ message: "Error searching events", error });
  }
};

/**
 * GET /api/search/semantic
 *   ?cuisine=italian
 *   ?minIntensity=80
 *   ?type=restaurant (of terras)
 * 
 * "Vind alle events bij een Italiaans restaurant met zon-intensiteit > 80"
 */
export const searchSemantic = async (req: Request, res: Response) => {
  try {
    const { cuisine, minIntensity, type } = req.query;

    const pipeline: any[] = [];

    // 1. Start bij Events
    pipeline.push({ $match: { isDeleted: { $ne: true } } });

    // 2. Filter op locationType als meegegeven
    if (type) {
      pipeline.push({ $match: { locationType: (type as string).toLowerCase() } });
    }

    // 3. Join met Restaurants (voor cuisine en intensity)
    pipeline.push({
      $lookup: {
        from: "restaurants",
        localField: "locationRef",
        foreignField: "uuid",
        as: "venueRestaurant"
      }
    });

    // 4. Join met Terrassen (voor intensity)
    pipeline.push({
      $lookup: {
        from: "terras", // Let op: collectienaam in MongoDB is vaak kleine letter meervoud
        localField: "locationRef",
        foreignField: "uuid",
        as: "venueTerras"
      }
    });

    // 5. Voeg een veld toe dat de gevonden venue bevat
    pipeline.push({
      $addFields: {
        venue: {
          $cond: {
            if: { $eq: ["$locationType", "restaurant"] },
            then: { $arrayElemAt: ["$venueRestaurant", 0] },
            else: { $arrayElemAt: ["$venueTerras", 0] }
          }
        }
      }
    });

    // 6. Filter op de eigenschappen van de venue
    const venueMatch: any = { "venue.isDeleted": { $ne: true } };
    
    if (cuisine) {
      venueMatch["venue.cuisine"] = { $regex: cuisine as string, $options: "i" };
    }
    
    if (minIntensity) {
      venueMatch["venue.intensity"] = { $gte: Number(minIntensity) };
    }

    pipeline.push({ $match: venueMatch });

    // 7. Sorteer op datum
    pipeline.push({ $sort: { date_start: 1 } });

    // 8. Schoon de output op (verwijder tijdelijke join velden)
    pipeline.push({
      $project: {
        venueRestaurant: 0,
        venueTerras: 0
      }
    });

    const results = await Event.aggregate(pipeline);

    const responseData = {
      count: results.length,
      events: results,
      links: [
        { rel: "self", href: req.originalUrl },
        { rel: "events", href: "/api/events" }
      ]
    };

    res.format({
      'application/ld+json': () => res.status(200).json(
        toCollectionLd("event", results, req.originalUrl)
      ),
      'application/json': () => res.status(200).json(responseData),
      'text/html': () => res.render('events/list', responseData),
      'default': () => res.status(406).send('Not Acceptable')
    });
  } catch (error) {
    res.status(500).json({ message: "Error performing semantic search", error });
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
