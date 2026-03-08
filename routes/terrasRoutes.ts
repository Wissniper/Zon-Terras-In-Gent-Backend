import express from "express";
import {
  getAllTerrasen,
  getTerrasById,
  createTerras,
  updateTerras,
  patchTerras,
  deleteTerras,
} from "../controllers/terrasController";

const router = express.Router();

router.get("/", getAllTerrasen);
router.post("/", createTerras);
router.get("/:id", getTerrasById);
router.put("/:id", updateTerras);
router.patch("/:id", patchTerras);
router.delete("/:id", deleteTerras);

export default router;
