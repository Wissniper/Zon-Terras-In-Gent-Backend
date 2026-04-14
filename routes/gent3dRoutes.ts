import express from "express";
import { getAllTiles, getTileByVaknummer, getTileFile } from "../controllers/gent3dController.js";

const router = express.Router();

router.get("/", getAllTiles);
router.get("/:vaknummer/file", getTileFile);
router.get("/:vaknummer", getTileByVaknummer);

export default router;
