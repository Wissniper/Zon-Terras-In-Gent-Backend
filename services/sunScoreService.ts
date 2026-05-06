import cron from "node-cron";
import Terras from "../models/terrasModel.js";
import ShadowScore from "../models/shadowScoreModel.js";
import { fetchGhentBuildings, computeShadowScore } from "./shadowScoringService.js";

export async function refreshShadowScores(): Promise<void> {
  console.log("[SunScoreService] Starting shadow score refresh...");
  try {
    const buildings = await fetchGhentBuildings();
    const terrassen = await Terras.find({ isDeleted: false });

    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setMilliseconds(0);

    const timestamps: Date[] = [];
    for (let i = 0; i < 48; i++) {
      timestamps.push(new Date(now.getTime() + i * 60 * 60 * 1000));
    }

    const ops = terrassen.flatMap((terras) => {
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
    }

    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    await ShadowScore.deleteMany({ timestamp: { $lt: cutoff } });

    console.log(`[SunScoreService] Refreshed ${ops.length} shadow scores for ${terrassen.length} terrasses.`);
  } catch (err: any) {
    console.warn("[SunScoreService] Refresh failed:", err.message);
  }
}

export function startShadowScoreCron(): void {
  cron.schedule("0 */6 * * *", () => { refreshShadowScores(); });
  console.log("[Cron] Scheduled shadow score refresh every 6 hours");
  refreshShadowScores();
}
