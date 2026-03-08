import express from "express";
import { getAllTerrasen, getTerrasById } from "../controllers/terrasController";
import { validateID } from "../middelware/validation";

const router = express.Router();

router.get("/", getAllTerrasen);
router.get("/:id", validateID, getTerrasById);

export default router;
