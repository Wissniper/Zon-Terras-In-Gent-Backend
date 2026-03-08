import express from "express";
import { getAllRestaurants, getRestaurantById } from "../controllers/restaurantController";

const router = express.Router();

router.get("/", getAllRestaurants);
router.get("/:id", getRestaurantById);

export default router;
