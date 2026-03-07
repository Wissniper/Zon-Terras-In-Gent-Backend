import Event, { EventDocument } from "../models/eventModel.js";
import { Request, Response } from "express";
import Terras from '../models/terrasModel.js';

// Helper: geeft start en einde van een dag terug
const getDayRange = (date?: string) => {
    const day = date ? new Date(date) : new Date();
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    return { dayStart: day, dayEnd: nextDay };
};

export const getAllEvents = async (req: Request, res: Response) => {
    try {
        const events = await Event.find().sort({ date_start: 1 });
        res.status(200).json(events);
    } catch (error) {
        res.status(500).json({ message: "Error fetching Events", error });
    }
};

// Filtert events die overlappen met vandaag of een gekozen datum (?date=YYYY-MM-DD)
export const getTodaysEvents = async (req: Request, res: Response) => {
    try {
        const { dayStart, dayEnd } = getDayRange(req.query.date as string);

        const events = await Event.find({
            date_start: { $lt: dayEnd },
            date_end: { $gte: dayStart }
        }).sort({ date_start: 1 });

        res.status(200).json(events);
    } catch (error) {
        res.status(500).json({ message: "Error fetching Events" });
    }
};

// Koppel events aan dichtstbijzijnde terrassen (max 100m)
const findNearbyTerrassen = async (event: EventDocument) => {
    const terrassen = await Terras.find({
        location: {
            $near: { $geometry: event.location, $maxDistance: 100 }
        }
    });
    return { ...event.toObject(), terrassen };
};

// Events van vandaag/gekozen datum + gekoppelde terrassen
export const getEventsWithTerras = async (req: Request, res: Response) => {
    try {
        const { dayStart, dayEnd } = getDayRange(req.query.date as string);

        const events = await Event.find({
            date_start: { $lt: dayEnd },
            date_end: { $gte: dayStart }
        }).sort({ date_start: 1 });

        const result = await Promise.all(events.map(findNearbyTerrassen));
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: "Error fetching Events" });
    }
}