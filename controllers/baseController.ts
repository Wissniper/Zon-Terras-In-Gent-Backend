import { Model, Document } from "mongoose";
import { Request, Response } from "express";

//helper:
const resourcePlurals: Record<string, string> = {
  terras: "terrassen",
  event: "events",
  restaurant: "restaurants",
  sundata: "sun" ///api/sun
};

// Factory: genereer een getAll handler voor een Mongoose model
export function createGetAll<T extends Document>(
  model: Model<T>,
  defaultSort: Record<string, 1 | -1> = {}
) {
  return async (req: Request, res: Response) => {
    try {
      const items = await model.find().sort(defaultSort);
      const resource = model.modelName.toLowerCase();

      const plural = resourcePlurals[resource] || `${resource}s`;

      const responseData = {
        count: items.length,
        [plural]: items,
        links: [{ rel: "self", href: `/api/${plural}` }]
      };

      res.format({
       
        'application/json': () => res.status(200).json(responseData),
        'text/html': () => res.render(`${plural}/list`, responseData),
        'default': () => res.status(406).send('Not Acceptable')

      });
    } catch (error) {
      res.status(500).json({ message: `Error fetching ${model.modelName}`, error });
    }
  };
}

// Factory: genereer een getById handler voor een Mongoose model
export function createGetById<T extends Document>(model: Model<T>) {
  return async (req: Request, res: Response) => {
    try {
      const item = await model.findById(req.params.id);
      if (!item) {
        return res.status(404).json({ message: `${model.modelName} not found` });
      }
      const resource = model.modelName.toLowerCase();
      const plural = resourcePlurals[resource] || `${resource}s`;
      const id = item._id;

      const responseData = {
        [resource]: item,
        links: [
          { rel: "self", href: `/api/${plural}/${item._id}` },
          { rel: "collection", href: `/api/${plural}` },
          { rel: "sun", href: `/api/sun/${resource}/${item._id}` } 
        ]
      };

      res.format({

        'application/json': () => res.status(200).json(responseData),
        'text/html': () => res.render(`${plural}/detail`, responseData),
        'default': () => res.status(406).send('Not Acceptable')
      });
      
    } catch (error) {
      res.status(500).json({ message: `Error fetching ${model.modelName}`, error });
    }
  };
}

// Helper: bouw een $geoNear pipeline stage
export function buildGeoStage(lat: string, lng: string, radius: string) {
  return {
    $geoNear: {
      near: { type: "Point", coordinates: [Number(lng), Number(lat)] },
      distanceField: "distance",
      maxDistance: Number(radius) * 1000,
      spherical: true,
    },
  };
}

// Helper: bouw $lookup + $addFields stages om de laatste zondata op te halen
export function buildSunDataLookup(locationType: string) {
  return [
    {
      $lookup: {
        from: "sundatas",
        let: { refId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$locationRef", "$$refId"] },
                  { $eq: ["$locationType", locationType] },
                ],
              },
            },
          },
          { $sort: { dateTime: -1 } },
          { $limit: 1 },
        ],
        as: "latestSunData",
      },
    },
    {
      $addFields: {
        latestSunData: { $arrayElemAt: ["$latestSunData", 0] },
      },
    },
  ];
}

// Helper: bouw een intensity range filter object
export function buildRangeFilter(min?: string, max?: string) {
  const filter: any = {};
  if (min) filter.$gte = Number(min);
  if (max) filter.$lte = Number(max);
  return Object.keys(filter).length > 0 ? filter : null;
}
