import express from "express";
import { getAllTiles, getTileByVaknummer, getTileFile, getGlbFile } from "../controllers/gent3dController.js";

const router = express.Router();

router.get("/", getAllTiles);
router.get("/:vaknummer/glb", getGlbFile);
router.get("/:vaknummer/file", getTileFile);
router.get("/:vaknummer", getTileByVaknummer);

export default router;
