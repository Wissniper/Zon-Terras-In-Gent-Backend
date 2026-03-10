import express from "express";

import { 
    getAllEvents,
    getEventById, 
    getTodaysEvents, 
    getEventsWithTerras 
} from '../controllers/eventController.js';

import { validateDateQuery, validateID } from "../middleware/validation.js";

const router = express.Router();

router.get('/', getAllEvents);
router.get('/today', validateDateQuery, getTodaysEvents);
router.get('/with-terrasen', validateDateQuery, getEventsWithTerras);
router.get('/:id', validateID, getEventById);

export default router