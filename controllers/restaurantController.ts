import Restaurant from "../models/restaurantModel.js";
import SunData from "../models/sunDataModel.js";
import Event from "../models/eventModel.js";
import { Request, Response } from "express";
import { createGetAll, createOne, updateOne, patchOne, softDelete } from "./baseController.js";
import { toLd } from "../contexts/jsonld.js";
import { isValidObjectId } from "mongoose";

export const getAllRestaurants = createGetAll(Restaurant, { rating: -1 });

export const getRestaurantById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const query = isValidObjectId(id) ? { _id: id } : { uuid: id };
    const restaurant = await Restaurant.findOne({ ...query, isDeleted: { $ne: true } });
    
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Haal events op die aan dit restaurant gekoppeld zijn
    const events = await Event.find({ 
      locationRef: restaurant.uuid, 
      locationType: "restaurant",
      isDeleted: { $ne: true } 
    }).sort({ date_start: 1 });

    const selfHref = `/api/restaurants/${restaurant.uuid}`;
    const responseData = {
      restaurant: restaurant,
      events: events,
      links: [
        { rel: "self", href: selfHref },
        { rel: "collection", href: "/api/restaurants" },
        { rel: "sun", href: `/api/sun/restaurant/${restaurant.uuid}` }
      ]
    };

    res.format({
      'application/ld+json': () => res.status(200).json(
        toLd("restaurant", restaurant.toObject(), selfHref)
      ),
      'application/json': () => res.status(200).json(responseData),
      'text/html': () => res.render('restaurants/detail', responseData),
      'default': () => res.status(406).send('Not Acceptable')
    });

  } catch (error) {
    res.status(500).json({ message: "Error fetching Restaurant", error });
  }
};
export const createRestaurant = createOne(Restaurant);
export const updateRestaurant = updateOne(Restaurant);
export const patchRestaurant = patchOne(Restaurant);

// Soft delete: restaurant wordt onzichtbaar maar data blijft bewaard
// Cascade: verwijder alle gekoppelde zondata
export const deleteRestaurant = softDelete(Restaurant, async (id) => {
  const restaurant = await Restaurant.findOne(
    isValidObjectId(id) ? { _id: id } : { uuid: id }
  );
  if (restaurant) {
    await SunData.deleteMany({ locationRef: restaurant._id, locationType: "Restaurant" });
  }
});
