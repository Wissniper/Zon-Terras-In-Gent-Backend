import express from "express";
import { getAllTerrasen, getTerrasById } from "../controllers/terrasController.js";
import { validateID } from "../middleware/validation.js";

const router = express.Router();

router.get("/", getAllTerrasen);
router.get("/:id", validateID, getTerrasById);

export default router;
