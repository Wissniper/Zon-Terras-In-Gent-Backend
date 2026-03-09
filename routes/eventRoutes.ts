import express from "express";

import { 
    getAllEvents,
    getEventById, 
    getTodaysEvents, 
    getEventsWithTerras 
} from '../controllers/eventController';

import { validateDateQuery, validateID } from "../middleware/validation";

const router = express.Router();

router.get('/', getAllEvents);
router.get('/today', validateDateQuery, getTodaysEvents);
router.get('/with-terrassen', validateDateQuery, getEventsWithTerras);
router.get('/:id', validateID , getEventById);

export default router