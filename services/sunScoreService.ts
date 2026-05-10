import cron from "node-cron";
import Terras from "../models/terrasModel.js";
import ShadowScore from "../models/shadowScoreModel.js";
import { fetchGhentBuildings, computeShadowScore } from "./shadowScoringService.js";

export async function refreshShadowScores(): Promise<void> {
  console.log("[SunScoreService] Starting shadow score refresh...");
  try {
    const buildings = await fetchGhentBuildings();
    const terrassen = await Terras.find({ isDeleted: false });

    // Start from midnight UTC today so past hours of the current day are always covered.
    // Queries for any hour today (or tomorrow) will find a bracketing record.
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const timestamps: Date[] = [];
    for (let i = 0; i < 48; i++) {
      timestamps.push(new Date(startOfDay.getTime() + i * 60 * 60 * 1000));
    }

    // Process in batches of 10 terrasses, yielding to the event loop between each batch
    // to prevent the synchronous shadow computation from blocking the MongoDB connection.
    const BATCH_SIZE = 10;
    let totalOps = 0;
    for (let i = 0; i < terrassen.length; i += BATCH_SIZE) {
      const batch = terrassen.slice(i, i + BATCH_SIZE);
      const ops = batch.flatMap((terras) => {
        const [lng, lat] = terras.location.coordinates;
        return timestamps.map((ts) => {
          const score = computeShadowScore(lat, lng, ts, buildings);
          return {
            updateOne: {
              filter: { terrasRef: terras._id, timestamp: ts },
              update: { $set: { terrasRef: terras._id, timestamp: ts, score } },
              upsert: true,
            },
          };
        });
      });
      if (ops.length > 0) {
        await ShadowScore.bulkWrite(ops);
        totalOps += ops.length;
      }
      // Yield to event loop between batches
      await new Promise((resolve) => setImmediate(resolve));
    }

    const cutoff = new Date(startOfDay.getTime() - 48 * 60 * 60 * 1000);
    await ShadowScore.deleteMany({ timestamp: { $lt: cutoff } });

    console.log(`[SunScoreService] Refreshed ${totalOps} shadow scores for ${terrassen.length} terrasses.`);
  } catch (err: any) {
    console.warn("[SunScoreService] Refresh failed:", err.message);
  }
}

export function startShadowScoreCron(): void {
  cron.schedule("0 */6 * * *", () => { refreshShadowScores(); });
  console.log("[Cron] Scheduled shadow score refresh every 6 hours");
}
