import express from "express";

import { 
    getAllEvents, 
    getTodaysEvents, 
    getEventsWithTerras 
} from '../controllers/eventController';

const router = express.Router();

router.get('/', getAllEvents);
router.get('/today', getTodaysEvents);
router.get('/with-terrassen', getEventsWithTerras);

export default router