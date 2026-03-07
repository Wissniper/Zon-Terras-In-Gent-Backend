import Terras from "../models/terrasModel.js";
import { Request, Response } from "express";

export const getAllTerrasen = async (req: Request, res: Response) => {
  try {
    const intensity = req.query.intensity ? Number(req.query.intensity) : 0;
    const terrasen = await Terras.find({ intensity: { $gte: intensity } });
    res.status(200).json(terrasen);
  } catch (error) {
    res.status(200).json({ message: "Error fetching terras", error });
  }
};

export const getTerrasById = async (req: Request, res: Response) => {
  try {
    const terrasen = await Terras.findById(req.params.id);
    if (!terrasen) {
      return res.status(404).json({ message: "Terras not found" });
    }
    res.status(200).json(terrasen);
  } catch (error) {
    res.status(500).json({ message: "Error fetching terras", error });
  }
};

export const getTerrasInArea = async (req: Request, res: Response) => {
    try {
        const { lat, lng, radius } = req.query;
        if (!lat || !lng || !radius) {
            return res.status(400).json({ message: "Missing required query parameters: lat, lng, radius" });
        }
        const terrasen = await Terras.find({
            location: {
                $geoWithin: {
                    $centerSphere: [[Number(lng), Number(lat)], Number(radius) / 6378.1] // radius in radians (Earth radius in km)
                }
            }
        });
        res.status(200).json(terrasen);
    } catch (error) {
        res.status(500).json({ message: "Error fetching terras in area", error });
    }
};

export const getTerrasByIntensity = async (req: Request, res: Response) => {
    try {
        const minIntensity = req.query.minIntensity ? Number(req.query.minIntensity) : undefined;
        if (minIntensity === undefined) {
            return res.status(400).json({ message: "Missing required query parameters: minIntensity, maxIntensity" });
        }
        const terrasen = await Terras.find({
            intensity: { $gte: Number(minIntensity)}
        });
        res.status(200).json(terrasen);
    } catch (error) {
        res.status(500).json({ message: "Error fetching terras by intensity", error });
    }
};