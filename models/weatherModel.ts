import mongoose, { Schema, Document } from 'mongoose';

export interface WeatherDocument extends Document{
    timestamp: Date;
    temperature: Number;
    cloudcover: Number;
    uvIndex: Number;
    windspeed: Number;
}

const WeatherSchema = new Schema(
    {
        timestamp: {type: Date, required: true},
        temperature: {type: Number, required: true},
        cloudcover: {type: Number, required: true},
        uvIndex: {type: Number, required: true},
        windspeed: {type: Number, required: true}
    }
)

WeatherSchema.index({ timestamp: -1 });

const Weather = mongoose.model<WeatherDocument>('Weather', WeatherSchema);
export default Weather;