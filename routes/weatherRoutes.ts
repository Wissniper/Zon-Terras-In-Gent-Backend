import express from "express";

import {
    getWeatherByParams,
    getWeatherByExactLocation,
    getWeatherInRadius
    
} from '../controllers/weatherController.js';

const router = express.Router();

router.get('/by-location', getWeatherByExactLocation);
router.get('/in-radius', getWeatherInRadius);
router.get('/:lat/:lng', getWeatherByParams);

export default router;