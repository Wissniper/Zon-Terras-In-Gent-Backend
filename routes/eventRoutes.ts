import express from "express";

import { 
    getAllEvents,
    getEventById, 
    getTodaysEvents, 
    getEventsWithTerras 
} from '../controllers/eventController';

const router = express.Router();

router.get('/', getAllEvents);
router.get('/today', getTodaysEvents);
router.get('/with-terrassen', getEventsWithTerras);
router.get('/:id', getEventById);

export default router