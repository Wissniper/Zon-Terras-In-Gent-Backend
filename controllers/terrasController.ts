import Terras from "../models/terrasModel.js";
import SunData from "../models/sunDataModel.js";
import Event from "../models/eventModel.js";
import { Request, Response } from "express";
import { createGetAll, createOne, updateOne, patchOne, softDelete } from "./baseController.js";
import { toLd } from "../contexts/jsonld.js";
import { isValidObjectId } from "mongoose";

export const getAllTerrasen = createGetAll(Terras, { intensity: -1 });

export const getTerrasById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const query = isValidObjectId(id) ? { _id: id } : { uuid: id };
    const terras = await Terras.findOne({ ...query, isDeleted: { $ne: true } });
    
    if (!terras) {
      return res.status(404).json({ message: "Terras not found" });
    }

    // Haal events op die aan dit terras gekoppeld zijn
    const events = await Event.find({ 
      locationRef: terras.uuid, 
      locationType: "terras",
      isDeleted: { $ne: true } 
    }).sort({ date_start: 1 });

    const selfHref = `/api/terrasen/${terras.uuid}`;
    const responseData = {
      terras: terras,
      events: events,
      links: [
        { rel: "self", href: selfHref },
        { rel: "collection", href: "/api/terrasen" },
        { rel: "sun", href: `/api/sun/terras/${terras.uuid}` }
      ]
    };

    res.format({
      'application/ld+json': () => res.status(200).json(
        toLd("terras", terras.toObject(), selfHref)
      ),
      'application/json': () => res.status(200).json(responseData),
      'text/html': () => res.render('terrasen/detail', responseData),
      'default': () => res.status(406).send('Not Acceptable')
    });

  } catch (error) {
    res.status(500).json({ message: "Error fetching Terras", error });
  }
};
export const createTerras = createOne(Terras);
export const updateTerras = updateOne(Terras);
export const patchTerras = patchOne(Terras);

// Soft delete: terras wordt onzichtbaar maar data blijft bewaard
// Cascade: verwijder alle gekoppelde zondata
export const deleteTerras = softDelete(Terras, async (id) => {
  await SunData.deleteMany({ locationRef: id, locationType: "Terras" });
});
