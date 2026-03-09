import express from "express";
import { getAllRestaurants, getRestaurantById } from "../controllers/restaurantController";

import { validateID } from "../middleware/validation";

const router = express.Router();

router.get("/", getAllRestaurants);
router.get("/:id",validateID ,getRestaurantById);

export default router;
