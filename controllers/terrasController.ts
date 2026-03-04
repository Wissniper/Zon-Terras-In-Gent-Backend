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
