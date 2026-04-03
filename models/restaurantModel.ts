import mongoose, { Schema, Document } from "mongoose";
import { v4 as uuidv4 } from "uuid";

export interface RestaurantDocument extends Document {
    uuid: string;
    identifier: number; // unique identifier for the restaurant
    name: string;
    address: string;
    cuisine: string;
    rating: number; // rating out of 5
    phone?: string;
    website?: string;
    openingHours?: string;
    takeaway?: boolean;
    location: {
        type: "Point";
        coordinates: number[]; // [long, lat]
    };
    intensity: number;
    isDeleted: boolean;
    deletedAt?: Date;
}

const RestaurantSchema = new Schema(
  {
    uuid: { type: String, default: uuidv4, unique: true, index: true },
    identifier: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    address: { type: String, required: true },
    cuisine: { type: String, required: true },
    rating: { type: Number, required: true, min: 0, max: 5 },
    phone: { type: String },
    website: { type: String },
    openingHours: { type: String },
    takeaway: { type: Boolean },
    location: {
      type: {
        type: String,
        enum: ["Point"], 
        required: true,
        default: "Point",
      },
      coordinates: {
        type: [Number], 
        required: true,
      },
    },
    intensity: { type: Number, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

RestaurantSchema.index({ location: "2dsphere" }); 

RestaurantSchema.index({ rating: -1 }); // create an index on the rating field for faster queries when sorting by rating

RestaurantSchema.index({ intensity: -1 }); // create an index on the intensity field for faster queries when sorting by intensity

RestaurantSchema.index({ name: 1 }); // create an index on the name field for faster queries when searching by name

RestaurantSchema.index({ cuisine: 1 }); // create an index on the cuisine field for faster queries when searching by cuisine

const Restaurant = mongoose.model<RestaurantDocument>(
  "Restaurant",
  RestaurantSchema,
);

export default Restaurant;