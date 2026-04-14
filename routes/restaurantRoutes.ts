import express from "express";
import {
  getAllRestaurants,
  getRestaurantById,
  createRestaurant,
  updateRestaurant,
  patchRestaurant,
  deleteRestaurant,
} from "../controllers/restaurantController.js";

import { validateID } from "../middleware/validation.js";

const router = express.Router();

router.get("/", getAllRestaurants);
// router.post("/", createRestaurant);
router.get("/:id", validateID, getRestaurantById);
// router.put("/:id", validateID, updateRestaurant);
// router.patch("/:id", validateID, patchRestaurant);
// router.delete("/:id", validateID, deleteRestaurant);

export default router;
