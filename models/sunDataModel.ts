import mongoose, { Document, Schema } from "mongoose";

export interface SunDataDocument extends Document {
  terrasId: mongoose.Types.ObjectId;
  dateTime: Date;
  intensity: number;       // 0-100, adjusted for cloud cover
  azimuth: number;         // radians
  altitude: number;        // radians
}

const SunDataSchema = new Schema(
  {
    terrasId: { type: Schema.Types.ObjectId, ref: "Terras", required: true },
    dateTime: { type: Date, required: true },
    intensity: { type: Number, required: true, min: 0, max: 100 },
    azimuth: { type: Number, required: true },
    altitude: { type: Number, required: true },
  },
  { timestamps: true },
);

SunDataSchema.index({ terrasId: 1, dateTime: 1 }, { unique: true });
SunDataSchema.index({ dateTime: 1 });

const SunData = mongoose.model<SunDataDocument>("SunData", SunDataSchema);

export default SunData;
