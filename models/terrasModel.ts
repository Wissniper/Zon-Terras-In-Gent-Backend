import mongoose, { Document, Schema } from "mongoose";

export interface TerrasDocument extends Document {
  name: string;
  description?: string;
  address: string;
  url?: string;
  identifier: number;
  location: {
    type: "Point";
    coordinates: number[]; // [long, lat]
  };
  intensity: number; // actual sun-intensity (0-100)
}

const TerrasSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    address: { type: String, required: true },
    url: { type: String },
    identifier: { type: Number, required: true, unique: true },
    location: {
      type: {
        type: String,
        enum: ["Point"], // a GeoJSON Point is a string with value 'Point'
        required: true,
        default: "Point",
      },
      coordinates: {
        type: [Number], // an array of numbers [longitude, latitude]
        required: true,
      },
    },
    intensity: { type: Number, required: true },
  },
  { timestamps: true },
);

TerrasSchema.index({ location: "2dsphere" }); // create a geospatial index on the location field

TerrasSchema.index({ intensity: -1 }); // create an index on the intensity field for faster queries when sorting by intensity

const Terras = mongoose.model<TerrasDocument>("Terras", TerrasSchema);

export default Terras;
