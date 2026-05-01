import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import Gent3dTile from "../models/gent3dTileModel.js";

dotenv.config();

const TILES_DIR = path.resolve("public/tiles");
const MONGO_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/zon-terras-db";

async function sync() {
  console.log("[Gent3D-Sync] Starting DB sync with disk...");
  
  try {
    await mongoose.connect(MONGO_URI);
    console.log("[Gent3D-Sync] Connected to MongoDB.");

    if (!fs.existsSync(TILES_DIR)) {
      console.error(`[Gent3D-Sync] Tiles directory not found: ${TILES_DIR}`);
      return;
    }

    const files = fs.readdirSync(TILES_DIR).filter(f => f.endsWith(".glb"));
    console.log(`[Gent3D-Sync] Found ${files.length} GLB files on disk.`);

    let updated = 0;

    for (const file of files) {
      // Extract coordinates from "Geb_099000_193000_..." or "Trn_..."
      const match = file.match(/(?:Geb|Trn)_(\d{6})_(\d{6})/);
      if (!match) continue;

      const xCoord = parseInt(match[1], 10);
      const yCoord = parseInt(match[2], 10);

      // Find the tile by coordinates
      const tile = await Gent3dTile.findOne({ xCoord, yCoord });
      
      if (tile) {
        const glbPath = path.join("public/tiles", file);
        if (tile.glbPath !== glbPath) {
          tile.glbPath = glbPath;
          await tile.save();
          updated++;
        }
      }
    }

    console.log(`[Gent3D-Sync] Success! Updated ${updated} tiles in database.`);
  } catch (error) {
    console.error("[Gent3D-Sync] Error during sync:", error);
  } finally {
    await mongoose.disconnect();
  }
}

sync();
