import mongoose, { Schema, Document } from 'mongoose';

export interface WeatherDocument extends Document{
    timestamp: Date;
    temperature: Number;
    cloudCover: Number;
    cloudFactor: Number;
    uvIndex: Number;
    windspeed: Number;
    location: {
        type: string;
        coordinates: number[];
    };
}

const WeatherSchema = new Schema(
    {
        timestamp: {type: Date, required: true},
        temperature: {type: Number, required: true},
        cloudCover: {type: Number, required: true},
        cloudFactor: { type: Number, required: true },
        uvIndex: {type: Number, required: true},
        windspeed: {type: Number, required: true},

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
    }
)

WeatherSchema.index({ timestamp: -1 });
WeatherSchema.index({ location: "2dsphere" });

const Weather = mongoose.model<WeatherDocument>('Weather', WeatherSchema);
export default Weather;