import express from "express";
import {
  searchTerrasen,
  searchRestaurants,
  searchEvents,
  searchNearby,
} from "../controllers/searchController";

import { validateCoords, validateRadius } from "../middleware/validation";

const router = express.Router();

router.get("/terrasen", searchTerrasen);
router.get("/restaurants", searchRestaurants);
router.get("/events", searchEvents);
router.get("/nearby/:lat/:lng/:radius", validateCoords, validateRadius, searchNearby);

export default router;
