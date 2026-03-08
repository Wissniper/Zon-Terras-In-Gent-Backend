import Terras from "../models/terrasModel.js";
import { createGetAll, createGetById } from "./baseController.js";

export const getAllTerrasen = createGetAll(Terras, { intensity: -1 });
export const getTerrasById = createGetById(Terras);
