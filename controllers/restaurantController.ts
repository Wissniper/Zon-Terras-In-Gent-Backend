import Restaurant from "../models/restaurantModel.js";
import { createGetAll, createGetById } from "./baseController.js";

export const getAllRestaurants = createGetAll(Restaurant, { rating: -1 });
export const getRestaurantById = createGetById(Restaurant);
