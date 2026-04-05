import express from "express";
import {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  patchEvent,
  deleteEvent,
  getTodaysEvents,
  getEventsWithTerras,
} from "../controllers/eventController.js";

import { validateDateQuery, validateID, validateLocationRef } from "../middleware/validation.js";

const router = express.Router();

router.get("/", getAllEvents);
router.post("/", validateLocationRef, createEvent);
router.get("/today", validateDateQuery, getTodaysEvents);
router.get("/with-terrasen", validateDateQuery, getEventsWithTerras);
router.get("/:id", validateID, getEventById);
router.put("/:id", validateID, validateLocationRef, updateEvent);
router.patch("/:id", validateID, validateLocationRef, patchEvent);
router.delete("/:id", validateID, deleteEvent);

export default router;
