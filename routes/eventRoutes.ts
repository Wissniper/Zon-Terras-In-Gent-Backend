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
} from "../controllers/eventController";

const router = express.Router();

router.get("/", getAllEvents);
router.post("/", createEvent);
router.get("/today", getTodaysEvents);
router.get("/with-terrassen", getEventsWithTerras);
router.get("/:id", getEventById);
router.put("/:id", updateEvent);
router.patch("/:id", patchEvent);
router.delete("/:id", deleteEvent);

export default router;
