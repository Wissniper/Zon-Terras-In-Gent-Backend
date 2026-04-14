import express from "express";
import {
  getAllTerrasen,
  getTerrasById,
  createTerras,
  updateTerras,
  patchTerras,
  deleteTerras,
} from "../controllers/terrasController.js";
import { validateID } from "../middleware/validation.js";

const router = express.Router();

router.get("/", getAllTerrasen);
// router.post("/", createTerras);
router.get("/:id", validateID, getTerrasById);
// router.put("/:id", validateID, updateTerras);
// router.patch("/:id", validateID, patchTerras);
// router.delete("/:id", validateID, deleteTerras);

export default router;
