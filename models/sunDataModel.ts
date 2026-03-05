import mongoose, { Document, Schema } from "mongoose";

export interface SunDataDocument extends Document {
  locationRef: mongoose.Types.ObjectId;
  locationType: "Terras" | "Restaurant" | "Event";
  dateTime: Date;
  intensity: number;       // 0-100
  azimuth: number;         // radians
  altitude: number;        // radians
  goldenHour: {
    dawnStart: Date;
    dawnEnd: Date;
    duskStart: Date;
    duskEnd: Date;
  };
}

const SunDataSchema = new Schema(
  {
    locationRef: { type: Schema.Types.ObjectId, required: true, refPath: "locationType" },
    locationType: { type: String, required: true, enum: ["Terras", "Restaurant", "Event"] },
    dateTime: { type: Date, required: true },
    intensity: { type: Number, required: true, min: 0, max: 100 },
    azimuth: { type: Number, required: true },
    altitude: { type: Number, required: true },
    goldenHour: {
      dawnStart: { type: Date, required: true },
      dawnEnd: { type: Date, required: true },
      duskStart: { type: Date, required: true },
      duskEnd: { type: Date, required: true },
    },
  },
  { timestamps: true },
);

SunDataSchema.index({ locationRef: 1, locationType: 1, dateTime: 1 }, { unique: true });
SunDataSchema.index({ dateTime: 1 });

const SunData = mongoose.model<SunDataDocument>("SunData", SunDataSchema);

export default SunData;
