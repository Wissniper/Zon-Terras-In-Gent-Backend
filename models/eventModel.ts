import mongoose, { Schema, Document } from 'mongoose';
import { v4 as uuidv4 } from "uuid";

export interface EventDocument extends Document {
    uuid: string;
    eventUri?: string; // URI van het evenement in de brondata, indien beschikbaar (bijv. een URI in de SPARQL-resultaten)
    title: string;
    address: string;
    date_start: Date;
    date_end: Date;
    description?: string;
    url?: string;
    intensity?: number;
    location: {
        type: string;
        coordinates: number[];
    };
    isDeleted: boolean;
    deletedAt?: Date;
}

const EventSchema = new Schema(
    {
        uuid: { type: String, default: uuidv4, required: true, unique: true, index: true },
        eventUri: { type: String, unique: true, sparse: true }, // sparse means that the unique constraint is only applied to documents that have a value for this field
        title: {type: String, required: true},
        address: {type: String, required: true},
        date_start: {type: Date, required: true},
        date_end: {type: Date, required: true},
        description: {type: String},
        url: {type: String},
        intensity: {type: Number, default: 0},

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
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date },
    },
    { timestamps: true }
)

EventSchema.index({ location: '2dsphere' });

EventSchema.index({ date_start: 1 });
EventSchema.index({ date_end: 1 });

const Event = mongoose.model<EventDocument>('Event', EventSchema);
export default Event;