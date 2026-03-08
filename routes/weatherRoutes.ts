import express from "express";

import {
    getWeatherByParams,
    getWeatherByExactLocation,
    getWeatherInRadius
    
} from '../controllers/weatherController.js';
import { validateCoords } from "../middelware/validation.js";

const router = express.Router();

router.get('/by-location', getWeatherByExactLocation);
router.get('/in-radius', getWeatherInRadius);
router.get('/:lat/:lng', validateCoords, getWeatherByParams);

export default router;