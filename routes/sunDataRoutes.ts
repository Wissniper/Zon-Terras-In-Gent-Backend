import express from "express";
import {
  getSunPosition,
  getSunForTerras,
  getSunForRestaurant,
  getCachedSunData,
  getSunForEvent,
} from "../controllers/sunDataController";

const router = express.Router();

router.get("/:lat/:lng/:time", getSunPosition);
router.get("/terras/:terrasId", getSunForTerras);
router.get("/restaurant/:restaurantId", getSunForRestaurant);
router.get("/event/:eventId", getSunForEvent);
router.get("/cache/:locationType/:locationId", getCachedSunData);

export default router;
