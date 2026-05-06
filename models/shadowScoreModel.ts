import mongoose, { Document, Schema } from "mongoose";

export interface ShadowScoreDocument extends Document {
  terrasRef: mongoose.Types.ObjectId;
  timestamp: Date;
  score: number;
}

const ShadowScoreSchema = new Schema(
  {
    terrasRef: { type: Schema.Types.ObjectId, ref: "Terras", required: true },
    timestamp: { type: Date, required: true },
    score: { type: Number, required: true, min: 0, max: 1 },
  },
  { timestamps: true }
);

ShadowScoreSchema.index({ terrasRef: 1, timestamp: 1 }, { unique: true });
ShadowScoreSchema.index({ timestamp: 1 });

const ShadowScore = mongoose.model<ShadowScoreDocument>("ShadowScore", ShadowScoreSchema);
export default ShadowScore;
