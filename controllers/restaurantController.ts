import Restaurant from "../models/restaurantModel.js";
import SunData from "../models/sunDataModel.js";
import { createGetAll, createGetById, createOne, updateOne, patchOne, softDelete } from "./baseController.js";

export const getAllRestaurants = createGetAll(Restaurant, { rating: -1 });
export const getRestaurantById = createGetById(Restaurant);
export const createRestaurant = createOne(Restaurant);
export const updateRestaurant = updateOne(Restaurant);
export const patchRestaurant = patchOne(Restaurant);

// Soft delete: restaurant wordt onzichtbaar maar data blijft bewaard
// Cascade: verwijder alle gekoppelde zondata
export const deleteRestaurant = softDelete(Restaurant, async (id) => {
  await SunData.deleteMany({ locationRef: id, locationType: "Restaurant" });
});
