import express from "express";
import { getAllTerrasen, getTerrasById } from "../controllers/terrasController";

const router = express.Router();

router.get("/", getAllTerrasen);
router.get("/:id", getTerrasById);

export default router;
