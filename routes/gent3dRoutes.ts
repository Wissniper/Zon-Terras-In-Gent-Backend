import express from "express";
import { getAllTiles, getTileByVaknummer } from "../controllers/gent3dController.js";

const router = express.Router();

router.get("/", getAllTiles);
router.get("/:vaknummer", getTileByVaknummer);

export default router;
