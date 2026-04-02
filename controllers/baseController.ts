import { Model, Document } from "mongoose";
import { Request, Response } from "express";

//helper:
const resourcePlurals: Record<string, string> = {
  terras: "terrasen",
  event: "events",
  restaurant: "restaurants",
  sundata: "sun" ///api/sun
};

// Factory: GET / — haal alle items op (filtert soft-deleted items uit)
export function createGetAll<T extends Document>(
  model: Model<T>,
  defaultSort: Record<string, 1 | -1> = {}
) {
  return async (req: Request, res: Response) => {
    try {
      const items = await model.find({ isDeleted: { $ne: true } }).sort(defaultSort);
      const resource = model.modelName.toLowerCase();
      const plural = resourcePlurals[resource] || `${resource}s`;

      const responseData = {
        count: items.length,
        [plural]: items,
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

// Factory: GET /:id — haal één item op (filtert soft-deleted items uit)
export function createGetById<T extends Document>(model: Model<T>) {
  return async (req: Request, res: Response) => {
    try {
      const item = await model.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
      if (!item) {
        return res.status(404).json({ message: `${model.modelName} not found` });
      }
      const resource = model.modelName.toLowerCase();
      const plural = resourcePlurals[resource] || `${resource}s`;

      const responseData = {
        [resource]: item,
        
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

// Factory: POST / — maak een nieuw item aan
export function createOne<T extends Document>(model: Model<T>) {
  return async (req: Request, res: Response) => {
    try {
      const item = new model(req.body);
      const saved = await item.save();
      res.status(201).json(saved);
    } catch (error: any) {
      if (error.name === "ValidationError") {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: `Error creating ${model.modelName}`, error });
    }
  };
}

// Factory: PUT /:id — overschrijf een item volledig
export function updateOne<T extends Document>(model: Model<T>) {
  return async (req: Request, res: Response) => {
    try {
      const { _id, isDeleted, deletedAt, ...body } = req.body;
      const item = await model.findOneAndReplace(
        { _id: req.params.id, isDeleted: { $ne: true } },
        body,
        { new: true, runValidators: true }
      );
      if (!item) {
        return res.status(404).json({ message: `${model.modelName} not found` });
      }
      res.status(200).json(item);
    } catch (error: any) {
      if (error.name === "ValidationError") {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: `Error updating ${model.modelName}`, error });
    }
  };
}

// Factory: PATCH /:id — update een item gedeeltelijk
export function patchOne<T extends Document>(model: Model<T>) {
  return async (req: Request, res: Response) => {
    try {
      const { _id, isDeleted, deletedAt, ...body } = req.body;
      const item = await model.findOneAndUpdate(
        { _id: req.params.id, isDeleted: { $ne: true } },
        { $set: body },
        { new: true, runValidators: true }
      );
      if (!item) {
        return res.status(404).json({ message: `${model.modelName} not found` });
      }
      res.status(200).json(item);
    } catch (error: any) {
      if (error.name === "ValidationError") {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: `Error patching ${model.modelName}`, error });
    }
  };
}

// Factory: DELETE /:id — soft delete (markeer als verwijderd, data blijft bewaard)
// onCascade callback verwijdert afhankelijke resources
export function softDelete<T extends Document>(
  model: Model<T>,
  onCascade?: (id: string) => Promise<void>
) {
  return async (req: Request, res: Response) => {
    try {
      const item = await model.findOneAndUpdate(
        { _id: req.params.id, isDeleted: { $ne: true } },
        { isDeleted: true, deletedAt: new Date() },
        { new: true }
      );
      if (!item) {
        return res.status(404).json({ message: `${model.modelName} not found` });
      }
      if (onCascade) await onCascade(req.params.id as string);
      res.status(200).json({ message: `${model.modelName} deleted`, item });
    } catch (error) {
      res.status(500).json({ message: `Error deleting ${model.modelName}`, error });
    }
  };
}

// Factory: DELETE /:id — hard delete (verwijder volledig uit de database)
// onCascade callback verwijdert afhankelijke resources
export function hardDelete<T extends Document>(
  model: Model<T>,
  onCascade?: (id: string) => Promise<void>
) {
  return async (req: Request, res: Response) => {
    try {
      const item = await model.findByIdAndDelete(req.params.id);
      if (!item) {
        return res.status(404).json({ message: `${model.modelName} not found` });
      }
      if (onCascade) await onCascade(req.params.id as string);
      res.status(200).json({ message: `${model.modelName} permanently deleted` });
    } catch (error) {
      res.status(500).json({ message: `Error deleting ${model.modelName}`, error });
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

// Helper: bouw een range filter object
export function buildRangeFilter(min?: string, max?: string) {
  const filter: any = {};
  if (min) filter.$gte = Number(min);
  if (max) filter.$lte = Number(max);
  return Object.keys(filter).length > 0 ? filter : null;
}
