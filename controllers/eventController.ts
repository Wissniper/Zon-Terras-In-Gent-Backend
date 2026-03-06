import Event, { EventDocument } from "../models/eventModel.js";
import { Request, Response } from "express";

// @ts-ignore
import Terras from '../models/terrasModel'; 


export const getAllEvents = async (req: Request, res: Response) => {
    try {
        const events = await Event.find().sort({ date_start: 1 });

        res.status(200).json(events);
    } catch (error) {
        res.status(500).json({ 
            message: "Error fetching Events",
            error: error 
        });
    }
};

export const getEventById = async (req: Request, res: Response) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }
        res.status(200).json(event);
    } catch (error) {
        res.status(500).json({ message: "Error fetching event", error });
    }
};


export const getTodaysEvents = async (req: Request, res: Response) => {
    try {
        const today = req.query.date ? new Date(req.query.date as string) : new Date()
        today.setHours(0, 0, 0, 0);

        const events = await Event.find({
            date_start: { $gte: today }
        }).sort({ date_start: 1 }); 

        res.status(200).json(events);
    } catch (error) {
        res.status(500).json({ message: "Error fetching Events" });
    }
};

const findNearbyTerrassen = async (event: EventDocument) => {
    const terrassen = await Terras.find({
        location: {
            $near: { $geometry: event.location, $maxDistance: 100 }
        }
    });
    return { ...event.toObject(), terrassen };
};

export const getEventsWithTerras = async (req: Request, res: Response) => {
    try {
        const events = await Event.find();
        
        const result = await Promise.all(events.map(findNearbyTerrassen));

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: "Error fetching Events" });
    }
}