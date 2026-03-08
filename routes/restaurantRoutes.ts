import express from "express";
import {
  getAllRestaurants,
  getRestaurantById,
  createRestaurant,
  updateRestaurant,
  patchRestaurant,
  deleteRestaurant,
} from "../controllers/restaurantController";

const router = express.Router();

router.get("/", getAllRestaurants);
router.post("/", createRestaurant);
router.get("/:id", getRestaurantById);
router.put("/:id", updateRestaurant);
router.patch("/:id", patchRestaurant);
router.delete("/:id", deleteRestaurant);

export default router;
