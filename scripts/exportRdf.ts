import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";

// Importeer modellen
import Terras from "../models/terrasModel.js";
import Restaurant from "../models/restaurantModel.js";
import Event from "../models/eventModel.js";
import SunData from "../models/sunDataModel.js";
import Weather from "../models/weatherModel.js";

// Importeer de exporter
import { exportAllToRdf } from "../services/rdfExporter.js";

dotenv.config();

async function runExport() {
    console.log("[RDF-Export] Starting full database dump...");
    
    try {
        await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/zon-terras-gent");
        console.log("[RDF-Export] Connected to MongoDB.");

        const models = {
            terras: Terras,
            restaurant: Restaurant,
            event: Event,
            sundata: SunData,
            weather: Weather
        };

        const rdfOutput = await exportAllToRdf(models);
        
        const exportPath = path.join(process.cwd(), "data", "full_dump.nt");
        await fs.mkdir(path.dirname(exportPath), { recursive: true });
        await fs.writeFile(exportPath, rdfOutput);

        console.log(`[RDF-Export] Success! Exported to ${exportPath}`);
        console.log(`[RDF-Export] Total triples exported: ${rdfOutput.split("\n").length}`);

    } catch (error) {
        console.error("[RDF-Export] Critical error during export:", error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

runExport();
