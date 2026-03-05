import Restaurant from "../models/restaurantModel";
import { Request, Response } from "express";

export const getAllRestaurants = async (req: Request, res: Response) => {
  try {
    const intensity = req.query.intensity ? Number(req.query.intensity) : 0;
    const restaurants = await Restaurant.find({ intensity: { $gte: intensity } });
    res.status(200).json(restaurants);
  } catch (error) {
    res.status(200).json({ message: "Error fetching restaurants", error });
  }
};

export const getRestaurantById = async (req: Request, res: Response) => {
    try {
        const restaurant = await Restaurant.findById(req.params.id);
        if (!restaurant) {
            return res.status(404).json({ message: "Restaurant not found" });
        }
        res.status(200).json(restaurant);
    } catch (error) {
        res.status(500).json({ message: "Error fetching restaurant", error });
    }
};

export const getRestaurantsByCuisine = async (req: Request, res: Response) => {
    try {
        const cuisine = req.query.cuisine as string;
        if (!cuisine) {
            return res.status(400).json({ message: "Cuisine query parameter is required" });
        }
        const restaurants = await Restaurant.find({ cuisine: cuisine });
        res.status(200).json(restaurants);
    } catch (error) {
        res.status(500).json({ message: "Error fetching restaurants by cuisine", error });
    }
};

export const getRestaurantsByRating = async (req: Request, res: Response) => {
    try {
        const rating = req.query.rating ? Number(req.query.rating) : 0;
        const restaurants = await Restaurant.find({ rating: { $gte: rating } });
        res.status(200).json(restaurants);
    } catch (error) {
        res.status(500).json({ message: "Error fetching restaurants by rating", error });
    }
};

export const getRestaurantsByName = async (req: Request, res: Response) => {
    try {
        const name = req.query.name as string;
        if (!name) {
            return res.status(400).json({ message: "Name query parameter is required" });
        }
        const restaurants = await Restaurant.find({ name: { $regex: name, $options: "i" } });
        res.status(200).json(restaurants);
    } catch (error) {
        res.status(500).json({ message: "Error fetching restaurants by name", error });
    }
};

export const getRestaurantsInArea = async (req: Request, res: Response) => {
    try {
        const { lat, lng, radius } = req.query;
        if (!lat || !lng || !radius) {
            return res.status(400).json({ message: "Latitude, longitude, and radius query parameters are required" });
        }
        const restaurants = await Restaurant.find({
            location: {
                $geoWithin: {
                    $centerSphere: [[Number(lng), Number(lat)], Number(radius) / 6378.1] // divide radius by Earth's radius in kilometers to convert to radians
                }
            }
        });
        res.status(200).json(restaurants);
    } catch (error) {
        res.status(500).json({ message: "Error fetching restaurants in area", error });
    }
};

export const getRestaurantsByIntensity = async (req: Request, res: Response) => {
    try {
        const intensity = req.query.intensity ? Number(req.query.intensity) : 0;
        const restaurants = await Restaurant.find({ intensity: { $gte: intensity } });
        res.status(200).json(restaurants);
    } catch (error) {
        res.status(500).json({ message: "Error fetching restaurants by intensity", error });
    }
};