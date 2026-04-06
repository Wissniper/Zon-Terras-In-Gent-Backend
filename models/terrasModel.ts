import mongoose, { Document, Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { docToTriples, syncToTriplestore } from "../services/rdfExporter.js";

export interface TerrasDocument extends Document {
  uuid: string;
  osmUri?: string; 
  name: string;
  description?: string;
  address: string;
  url?: string;
  location: {
    type: "Point";
    coordinates: number[]; // [long, lat]
  };
  intensity: number; // actual sun-intensity (0-100)
  isDeleted: boolean;
  deletedAt?: Date;
}

const TerrasSchema = new Schema(
  {
    uuid: { type: String, default: uuidv4, required: true, unique: true, index: true },
    osmUri: { type: String, unique: true, sparse: true },
    name: { type: String, required: true },
    description: { type: String },
    address: { type: String, required: true },
    url: { type: String },
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
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

TerrasSchema.index({ location: "2dsphere" }); // create a geospatial index on the location field

TerrasSchema.index({ intensity: -1 }); // create an index on the intensity field for faster queries when sorting by intensity

// Middleware voor automatische RDF sync
TerrasSchema.post('save', async function(doc) {
  const triples = docToTriples('terras', doc.toObject());
  await syncToTriplestore(triples);
});

// Ook syncen bij updates via findOneAndUpdate (gebruikt in fetchers)
TerrasSchema.post('findOneAndUpdate', async function(doc) {
  if (doc) {
    const triples = docToTriples('terras', doc.toObject());
    await syncToTriplestore(triples);
  }
});

const Terras = mongoose.model<TerrasDocument>("Terras", TerrasSchema);

export default Terras;
