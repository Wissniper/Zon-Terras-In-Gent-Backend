import Weather from "../models/weatherModel.js";
import {fetchWeatherData} from "../services/weatherService.js"
import { Request, Response } from "express";

export const getWeatherByParams = async (req: Request, res: Response) => {
    try {
       
        const lat = Number(req.params.lat);
        const lng = Number(req.params.lng);

        
        const weather = await fetchWeatherData(lat, lng);

        res.status(200).json(weather);
    } catch (error) {
        res.status(500).json({ message: "Error in weather integration", error });
    }
};

export const getWeatherByExactLocation = async (req: Request, res: Response) => {
    try {
        const { lat, lng } = req.query;

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const endOfTomorrow = new Date();
        endOfTomorrow.setDate(startOfToday.getDate() + 1);
        endOfTomorrow.setHours(23, 59, 59, 999);

        const weather = await Weather.find({
            "location.coordinates": [Number(lng), Number(lat)],
            timestamp: { $gte: startOfToday, $lte: endOfTomorrow }
        })
        res.status(200).json(weather);
    } catch(error) {
        res.status(500).json({ message: "Error fetching Weather" });
    }
};

export const getWeatherInRadius = async (req: Request, res: Response) => {
    try {
        const { lat, lng, radius } = req.query; 

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const endOfTomorrow = new Date();
        endOfTomorrow.setDate(startOfToday.getDate() + 1);
        endOfTomorrow.setHours(23, 59, 59, 999);

        const weather = await Weather.find({
            location: {
                $near: {
                    $geometry: { type: "Point", coordinates: [Number(lng), Number(lat)] },
                    $maxDistance: Number(radius) * 1000 //radius in meter
                }
            },
            timestamp: { $gte: startOfToday, $lte: endOfTomorrow }
        });
        res.status(200).json(weather);
    } catch(error) {
        res.status(500).json({ message: "Error fetching Weather" });
    }
};