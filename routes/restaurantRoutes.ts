import express from "express";
import { getAllRestaurants, getRestaurantById } from "../controllers/restaurantController.js";

import { validateID } from "../middleware/validation.js";

const router = express.Router();

router.get("/", getAllRestaurants);
router.get("/:id",validateID ,getRestaurantById);

export default router;
