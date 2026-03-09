import express from "express";
import { getAllTerrasen, getTerrasById } from "../controllers/terrasController";
import { validateID } from "../middleware/validation";

const router = express.Router();

router.get("/", getAllTerrasen);
router.get("/:id", validateID, getTerrasById);

export default router;
