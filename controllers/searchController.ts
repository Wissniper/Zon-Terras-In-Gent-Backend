import Terras from "../models/terrasModel.js";
import Restaurant from "../models/restaurantModel.js";
import Event from "../models/eventModel.js";
import { Request, Response } from "express";
import { buildGeoStage, buildSunDataLookup, buildRangeFilter, parseBboxFromQuery, buildBboxFilter } from "./baseController.js";
import { toCollectionLd } from "../contexts/jsonld.js";
import { recomputeIntensities } from "../services/intensityRefresher.js";
import { getNearestShadowScoresBulk } from "../services/shadowScoringService.js";

const MAX_LIMIT = 500;

function paginate<T>(items: T[], q: Request["query"]): T[] {
  const skipRaw = Number(q.skip);
  const limitRaw = Number(q.limit);
  const skip = Number.isFinite(skipRaw) && skipRaw > 0 ? Math.floor(skipRaw) : 0;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_LIMIT) : MAX_LIMIT;
  return items.slice(skip, skip + limit);
}

/**
 * GET /api/search/terrasen
 *   ?q=korenmarkt              — zoek op naam
 *   ?sunnyOnly=true            — alleen terrasen met intensity > 50
 *   ?minIntensity=60           — minimum intensity
 *   ?maxIntensity=100          — maximum intensity
 *   ?lat=51.05&lng=3.72&radius=1  — binnen straal (km)
 *   ?north=51.10&south=51.00&east=3.80&west=3.65  — viewport bbox
 */
export const searchTerrasen = async (req: Request, res: Response) => {
  try {
    const { q, sunnyOnly, minIntensity, maxIntensity, lat, lng, radius, time } = req.query;
    const bbox = parseBboxFromQuery(req.query);

    // Optional `?time=ISO8601` — when supplied, intensities are recomputed at
    // that target time so /search/* matches the time-aware leaderboard.
    const targetTime = (() => {
      if (typeof time !== "string" || !time) return undefined;
      const t = new Date(time);
      return Number.isNaN(t.getTime()) ? undefined : t;
    })();

    const pipeline: any[] = [];

    if (lat && lng && radius) {
      pipeline.push(buildGeoStage(lat as string, lng as string, radius as string));
    }

    const match: any = { isDeleted: { $ne: true } };

    if (bbox) {
      Object.assign(match, buildBboxFilter(bbox));
    }

    if (q) {
      match.name = { $regex: q as string, $options: "i" };
    }

    // NOTE: intensity filters (sunnyOnly / minIntensity / maxIntensity) are
    // applied AFTER recomputeIntensities() — filtering on the stored value
    // here would filter on stale data.

    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    pipeline.push(...buildSunDataLookup("Terras"));

    const terrasen = await Terras.aggregate(pipeline);

    // Bracketing nearest shadow score per terras — matches getNearestShadowScore
    // used by /api/sun/terras/:id, so search and the per-terras endpoint agree.
    const shadowCutoff = targetTime ?? new Date();
    const shadowMap = await getNearestShadowScoresBulk(
      terrasen.map((t: any) => t._id),
      shadowCutoff,
    );
    for (const t of terrasen) {
      t.shadowScore = shadowMap.get(t._id.toString()) ?? 1.0;
    }

    // Replace the cached `intensity` with a fresh sin(altitude) × cloudFactor × shadowScore.
    await recomputeIntensities(terrasen, targetTime);

    // Apply intensity filters now that values are fresh.
    let filtered = terrasen;
    if (sunnyOnly === "true") {
      filtered = filtered.filter((t: any) => (t.intensity ?? 0) > 50);
    } else {
      const minI = minIntensity ? Number(minIntensity) : null;
      const maxI = maxIntensity ? Number(maxIntensity) : null;
      if (minI != null) filtered = filtered.filter((t: any) => (t.intensity ?? 0) >= minI);
      if (maxI != null) filtered = filtered.filter((t: any) => (t.intensity ?? 0) <= maxI);
    }
    filtered.sort((a: any, b: any) => (b.intensity ?? 0) - (a.intensity ?? 0));

    const total = filtered.length;
    const paged = paginate(filtered, req.query);

    const responseData = {
      count: total,
      terrasen: paged,
    };

    res.format({
      'application/ld+json': () => res.status(200).json(
        toCollectionLd("terras", paged, req.originalUrl, total)
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
 *   ?minIntensity=50           — minimum zonintensiteit
 *   ?maxIntensity=100          — maximum zonintensiteit
 *   ?lat=51.05&lng=3.72&radius=1  — binnen straal (km)
 *   ?north=51.10&south=51.00&east=3.80&west=3.65  — viewport bbox
 */
export const searchRestaurants = async (req: Request, res: Response) => {
  try {
    const { q, cuisine, minIntensity, maxIntensity, lat, lng, radius, time } = req.query;
    const bbox = parseBboxFromQuery(req.query);

    const targetTime = (() => {
      if (typeof time !== "string" || !time) return undefined;
      const t = new Date(time);
      return Number.isNaN(t.getTime()) ? undefined : t;
    })();

    const pipeline: any[] = [];

    if (lat && lng && radius) {
      pipeline.push(buildGeoStage(lat as string, lng as string, radius as string));
    }

    const match: any = { isDeleted: { $ne: true } };

    if (bbox) {
      Object.assign(match, buildBboxFilter(bbox));
    }

    if (q) {
      match.name = { $regex: q as string, $options: "i" };
    }

    if (cuisine) {
      match.cuisine = { $regex: cuisine as string, $options: "i" };
    }

    // intensity filters applied post-recompute (see recomputeIntensities below).

    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    pipeline.push(...buildSunDataLookup("Restaurant"));

    const restaurants = await Restaurant.aggregate(pipeline);

    await recomputeIntensities(restaurants, targetTime);

    let filtered = restaurants;
    const minI = minIntensity ? Number(minIntensity) : null;
    const maxI = maxIntensity ? Number(maxIntensity) : null;
    if (minI != null) filtered = filtered.filter((r: any) => (r.intensity ?? 0) >= minI);
    if (maxI != null) filtered = filtered.filter((r: any) => (r.intensity ?? 0) <= maxI);
    filtered.sort((a: any, b: any) => (b.intensity ?? 0) - (a.intensity ?? 0));

    const total = filtered.length;
    const paged = paginate(filtered, req.query);

    const responseData = {
      count: total,
      restaurants: paged,
    };

    res.format({
      'application/ld+json': () => res.status(200).json(
        toCollectionLd("restaurant", paged, req.originalUrl, total)
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
 *   ?north=51.10&south=51.00&east=3.80&west=3.65  — viewport bbox
 */
export const searchEvents = async (req: Request, res: Response) => {
  try {
    const { q, date, lat, lng, radius } = req.query;
    const bbox = parseBboxFromQuery(req.query);

    const pipeline: any[] = [];

    if (lat && lng && radius) {
      pipeline.push(buildGeoStage(lat as string, lng as string, radius as string));
    }

    const match: any = { isDeleted: { $ne: true } };

    if (bbox) {
      Object.assign(match, buildBboxFilter(bbox));
    }

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

    const total = events.length;
    const paged = paginate(events, req.query);

    const responseData = {
      count: total,
      events: paged,
    };

    res.format({
      'application/ld+json': () => res.status(200).json(
        toCollectionLd("event", paged, req.originalUrl, total)
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
