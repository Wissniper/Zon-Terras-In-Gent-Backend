import express from "express";
import {
  getSunPosition,
  getSunForTerras,
  getSunForRestaurant,
  getCachedSunData,
} from "../controllers/sunDataController";

const router = express.Router();

router.get("/:lat/:lng/:time", getSunPosition);
router.get("/terras/:terrasId", getSunForTerras);
router.get("/restaurant/:restaurantId", getSunForRestaurant);
router.get("/cache/:locationType/:locationId", getCachedSunData);

export default router;
