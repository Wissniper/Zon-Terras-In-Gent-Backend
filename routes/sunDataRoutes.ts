import express from "express";
import {
  getSunPosition,
  getSunForTerras,
  getCachedSunData,
} from "../controllers/sunDataController";

const router = express.Router();

router.get("/:lat/:lng/:time", getSunPosition);
router.get("/terras/:terrasId", getSunForTerras);
router.get("/cache/:terrasId", getCachedSunData);

export default router;
