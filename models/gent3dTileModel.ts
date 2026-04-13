import mongoose, { Document, Schema } from "mongoose";

export interface Gent3dTileDocument extends Document {
  vaknummer: string;        // grid tile ID, e.g. "099_193"
  xCoord: number;           // Lambert 72 X in metres, e.g. 99000
  yCoord: number;           // Lambert 72 Y in metres, e.g. 193000
  downloadUrl: string;      // source URL from the CSV index
  localPath?: string;       // absolute path to the downloaded ZIP on disk
  fileName?: string;        // e.g. "Dwg_099000_193000_10_2_N_2013.zip"
  fileSize?: number;        // bytes
  downloadStatus: "pending" | "downloading" | "done" | "error" | "skipped";
  errorMessage?: string;
  lastDownloadedAt?: Date;
  year?: number;            // parsed from filename (2009 or 2013)
}

const Gent3dTileSchema = new Schema(
  {
    vaknummer:        { type: String, required: true, unique: true, index: true },
    xCoord:           { type: Number, required: true },
    yCoord:           { type: Number, required: true },
    downloadUrl:      { type: String, required: true },
    localPath:        { type: String },
    fileName:         { type: String },
    fileSize:         { type: Number },
    downloadStatus:   {
      type: String,
      enum: ["pending", "downloading", "done", "error", "skipped"],
      default: "pending",
      required: true,
      index: true,
    },
    errorMessage:     { type: String },
    lastDownloadedAt: { type: Date },
    year:             { type: Number },
  },
  { timestamps: true }
);

// Compound index for spatial lookups by Lambert grid position
Gent3dTileSchema.index({ xCoord: 1, yCoord: 1 });

const Gent3dTile = mongoose.model<Gent3dTileDocument>("Gent3dTile", Gent3dTileSchema);

export default Gent3dTile;
