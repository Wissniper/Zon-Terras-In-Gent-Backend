import { Request, Response } from "express";
import fs from "fs";
import path from "path";
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

/**
 * GET /api/gent3d/:vaknummer/file
 * Stream the downloaded ZIP from disk, or redirect to Stad Gent as fallback.
 */
export const getTileFile = async (req: Request, res: Response) => {
  try {
    const tile = await Gent3dTile.findOne({ vaknummer: req.params.vaknummer });

    if (!tile) {
      return res.status(404).json({ message: "Tile not found" });
    }

    if (tile.downloadStatus === "done" && tile.localPath && fs.existsSync(tile.localPath)) {
      return res.download(tile.localPath);
    }

    if (tile.downloadUrl) {
      return res.redirect(302, tile.downloadUrl);
    }

    return res.status(404).json({ message: "File not available" });
  } catch (error) {
    res.status(500).json({ message: "Error serving Gent 3D tile file", error });
  }
};

/**
 * GET /api/gent3d/:vaknummer/glb
 * Serve the processed GLB file from disk.
 */
export const getGlbFile = async (req: Request, res: Response) => {
  try {
    const { vaknummer } = req.params;
    const tile = await Gent3dTile.findOne({ vaknummer });

    if (!tile) {
      return res.status(404).json({ message: "Tile not found" });
    }

    let glbPath = tile.glbPath;

    // Fallback: If glbPath is missing from DB, try to find it on disk using naming convention
    if (!glbPath) {
      const xStr = tile.xCoord.toString().padStart(6, "0");
      const yStr = tile.yCoord.toString().padStart(6, "0");
      const pattern = `${xStr}_${yStr}`; // e.g. "103000_192000"
      
      const allowedDir = path.resolve("public/tiles");
      if (fs.existsSync(allowedDir)) {
        const files = fs.readdirSync(allowedDir);
        // Look for building (Geb_) or terrain (Trn_)
        const match = files.find(f => f.includes(pattern) && f.endsWith(".glb"));
        
        if (match) {
          glbPath = path.join("public/tiles", match);
          // Auto-repair the DB
          tile.glbPath = glbPath;
          await tile.save();
        }
      }
    }

    if (!glbPath) {
      return res.status(404).json({ message: "GLB file not yet processed or found on disk" });
    }

    const resolvedPath = path.resolve(glbPath);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: "GLB file record exists but file is missing from disk" });
    }

    // Security: Ensure path is within the public/tiles directory
    const allowedDir = path.resolve("public/tiles");
    if (!resolvedPath.startsWith(allowedDir)) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.setHeader("Content-Type", "model/gltf-binary");
    return res.sendFile(resolvedPath);
  } catch (error) {
    res.status(500).json({ message: "Error serving GLB file", error });
  }
};
