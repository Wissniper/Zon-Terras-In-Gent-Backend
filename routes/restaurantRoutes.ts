import express from 'express';
import { getAllRestaurants, getRestaurantById, getRestaurantsByCuisine, getRestaurantsByRating, getRestaurantsByName, getRestaurantsInArea, getRestaurantsByIntensity } from '../controllers/restaurantController';

const router = express.Router();

router.get("/", getAllRestaurants);
router.get("/search/cuisine/:cuisine", getRestaurantsByCuisine);
router.get("/search/rating/:rating", getRestaurantsByRating);
router.get("/search/name/:name", getRestaurantsByName);
router.get("/search/area/:area", getRestaurantsInArea);
router.get("/search/intensity/:intensity", getRestaurantsByIntensity);
router.get("/:id", getRestaurantById);

export default router;