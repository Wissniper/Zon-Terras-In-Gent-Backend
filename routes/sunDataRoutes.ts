import express from "express";
import {
  getSunPosition,
  getSunForTerras,
  getSunForRestaurant,
  getCachedSunData,
  getSunForEvent,
  getSunBatch,
} from "../controllers/sunDataController.js";
import { validateCoords, validateID, validateLocationType, validateSunBatch, validateTimeParam, validateTimeQuery }from "../middleware/validation.js";

const router = express.Router();

router.post("/batch", validateSunBatch, getSunBatch);
router.get("/terras/:terrasId", validateID, validateTimeQuery, getSunForTerras);
router.get("/restaurant/:restaurantId", validateID, validateTimeQuery, getSunForRestaurant);
router.get("/event/:eventId", validateID, validateTimeQuery, getSunForEvent);
router.get("/cache/:locationType/:locationId", validateID, validateLocationType, getCachedSunData);
router.get("/:lat/:lng/:time", validateCoords, validateTimeParam, getSunPosition);

export default router;
