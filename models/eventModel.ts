import mongoose, { Schema, Document } from 'mongoose';

export interface EventDocument extends Document {
    id: string;
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
}

const EventSchema = new Schema(
    {
        id: {type: String, required: true, unique: true},
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
        }

},
    { timestamps: true }
)

EventSchema.index({ location: '2dsphere' });

EventSchema.index({ date_start: 1 });
EventSchema.index({ date_end: 1 });

const Event = mongoose.model<EventDocument>('Event', EventSchema);
export default Event;