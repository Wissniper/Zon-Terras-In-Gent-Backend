import Terras from "../models/terrasModel.js";
import SunData from "../models/sunDataModel.js";
import Event from "../models/eventModel.js";
import ShadowScore from "../models/shadowScoreModel.js";
import { Request, Response } from "express";
import { createOne, updateOne, patchOne, softDelete } from "./baseController.js";
import { toLd, toCollectionLd } from "../contexts/jsonld.js";
import { isValidObjectId } from "mongoose";
import { getNearestShadowScore } from "../services/shadowScoringService.js";
import { recomputeIntensities } from "../services/intensityRefresher.js";
// @ts-ignore
import SunCalc from "suncalc3";

/**
 * GET /api/terrasen — list endpoint enriched with current-hour shadow score.
 *
 * Uses a single aggregation to fetch the most recent shadow score (≤ now) per terras,
 * then adjusts intensity = baseIntensity * shadowScore. Avoids N+1 lookups.
 */
export const getAllTerrasen = async (req: Request, res: Response) => {
  try {
    const filter: any = { isDeleted: { $ne: true } };
    if (req.query) {
      Object.entries(req.query).forEach(([key, value]) => {
        if (key === 'name' && typeof value === 'string') {
          filter[key] = { $regex: value, $options: 'i' };
        } else {
          filter[key] = value;
        }
      });
    }

    const terrassen = await Terras.find(filter).sort({ intensity: -1 });
    const now = new Date();

    // One aggregation: latest score ≤ now per terras
    const scoreRows = await ShadowScore.aggregate([
      { $match: { timestamp: { $lte: now } } },
      { $sort: { timestamp: -1 } },
      { $group: { _id: "$terrasRef", score: { $first: "$score" }, timestamp: { $first: "$timestamp" } } },
    ]);
    const scoreMap = new Map<string, number>(
      scoreRows.map((r: any) => [r._id.toString(), r.score])
    );

    const enriched = terrassen.map((t: any) => {
      const obj = t.toObject();
      const shadowScore = scoreMap.get(t._id.toString()) ?? 1.0;
      return {
        ...obj,
        intensity: 0,           // placeholder — recomputeIntensities fills this in
        shadowScore,
        shadowPct: Math.round((1 - shadowScore) * 100),
        isNight: false,
        links: [
          { rel: "self", href: `/api/terrasen/${obj.uuid}` },
          { rel: "collection", href: "/api/terrasen" },
          { rel: "sun", href: `/api/sun/terras/${obj.uuid}` },
        ],
      };
    });

    // ONE bulk weather lookup for the whole batch (instead of N $near queries).
    await recomputeIntensities(enriched);
    // recomputeIntensities sets isNight=true on nighttime rows; reflect that in shadowPct.
    for (const e of enriched) {
      if (e.isNight) e.shadowPct = 100;
    }
    enriched.sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0));

    const responseData = { count: enriched.length, terrasen: enriched };

    res.format({
      'application/ld+json': () => res.status(200).json(
        toCollectionLd("terras", enriched, "/api/terrasen")
      ),
      'application/json': () => res.status(200).json(responseData),
      'text/html': () => res.render('terrasen/list', responseData),
      'default': () => res.status(406).send('Not Acceptable')
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching Terras", error });
  }
};

export const getTerrasById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const query = isValidObjectId(id) ? { _id: id } : { uuid: id };
    const terras = await Terras.findOne({ ...query, isDeleted: { $ne: true } });
    
    if (!terras) {
      return res.status(404).json({ message: "Terras not found" });
    }

    // Haal events op die aan dit terras gekoppeld zijn
    const events = await Event.find({
      locationRef: terras.uuid,
      locationType: "terras",
      isDeleted: { $ne: true }
    }).sort({ date_start: 1 });

    const now = new Date();
    const [lng, lat] = terras.location.coordinates;
    const sunPos = (SunCalc as any).getPosition(now, lat, lng);
    const isNight = sunPos.altitude <= 0;
    const shadowScore = await getNearestShadowScore(terras._id, now);
    const shadowPct = isNight ? 100 : Math.round((1 - shadowScore) * 100);

    const selfHref = `/api/terrasen/${terras.uuid}`;
    const responseData = {
      terras: terras,
      events: events,
      shadowScore,
      shadowPct,
      isNight,
      links: [
        { rel: "self", href: selfHref },
        { rel: "collection", href: "/api/terrasen" },
        { rel: "sun", href: `/api/sun/terras/${terras.uuid}` }
      ]
    };

    res.format({
      'application/ld+json': () => res.status(200).json(
        toLd("terras", terras.toObject(), selfHref)
      ),
      'application/json': () => res.status(200).json(responseData),
      'text/html': () => res.render('terrasen/detail', responseData),
      'default': () => res.status(406).send('Not Acceptable')
    });

  } catch (error) {
    res.status(500).json({ message: "Error fetching Terras", error });
  }
};
export const createTerras = createOne(Terras);
export const updateTerras = updateOne(Terras);
export const patchTerras = patchOne(Terras);

// Soft delete: terras wordt onzichtbaar maar data blijft bewaard
// Cascade: verwijder alle gekoppelde zondata
export const deleteTerras = softDelete(Terras, async (id) => {
  const terras = await Terras.findOne(
    isValidObjectId(id) ? { _id: id } : { uuid: id }
  );
  if (terras) {
    await SunData.deleteMany({ locationRef: terras._id, locationType: "Terras" });
  }
});
