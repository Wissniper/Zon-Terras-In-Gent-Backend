import { Request, Response } from "express";
import Gent3dTile from "../models/gent3dTileModel.js";

/**
 * GET /api/gent3d
 * List all tiles. Optional query params:
 *   ?status=done|pending|error|downloading|skipped
 *   ?year=2013
 */
export const getAllTiles = async (req: Request, res: Response) => {
  try {
    const filter: Record<string, any> = {};

    if (req.query.status) {
      filter.downloadStatus = req.query.status;
    }
    if (req.query.year) {
      filter.year = parseInt(req.query.year as string, 10);
    }

    const tiles = await Gent3dTile.find(filter).sort({ vaknummer: 1 });

    const responseData = {
      count: tiles.length,
      tiles,
    };

    res.format({
      "application/json": () => res.status(200).json(responseData),
      default:            () => res.status(200).json(responseData),
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching Gent 3D tiles", error });
  }
};

/**
 * GET /api/gent3d/:vaknummer
 * Get a single tile by its vaknummer (e.g. "099_193").
 */
export const getTileByVaknummer = async (req: Request, res: Response) => {
  try {
    const tile = await Gent3dTile.findOne({ vaknummer: req.params.vaknummer });

    if (!tile) {
      return res.status(404).json({ message: "Tile not found" });
    }

    res.format({
      "application/json": () => res.status(200).json({ tile }),
      default:            () => res.status(200).json({ tile }),
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching Gent 3D tile", error });
  }
};
