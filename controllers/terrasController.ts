import Terras from "../models/terrasModel.js";
import SunData from "../models/sunDataModel.js";
import { createGetAll, createGetById, createOne, updateOne, patchOne, softDelete } from "./baseController.js";

export const getAllTerrasen = createGetAll(Terras, { intensity: -1 });
export const getTerrasById = createGetById(Terras);
export const createTerras = createOne(Terras);
export const updateTerras = updateOne(Terras);
export const patchTerras = patchOne(Terras);

// Soft delete: terras wordt onzichtbaar maar data blijft bewaard
// Cascade: verwijder alle gekoppelde zondata
export const deleteTerras = softDelete(Terras, async (id) => {
  await SunData.deleteMany({ locationRef: id, locationType: "Terras" });
});
