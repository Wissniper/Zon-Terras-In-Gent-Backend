import express from "express";
import { getAllTerrasen, getTerrasById, getTerrasInArea, getTerrasByIntensity } from "../controllers/terrasController";

const router = express.Router();

router.get("/", getAllTerrasen);
router.get("/:id", getTerrasById);
router.get("/search/area/:area", getTerrasInArea);
router.get("/search/intensity/:intensity", getTerrasByIntensity);

export default router;
