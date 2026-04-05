import Event, { EventDocument } from "../models/eventModel.js";
import SunData from "../models/sunDataModel.js";
import { Request, Response } from "express";
import Terras from "../models/terrasModel.js";
import Restaurant from "../models/restaurantModel.js";
import { createGetAll, createOne, updateOne, patchOne, softDelete } from "./baseController.js";
import { toLd } from "../contexts/jsonld.js";
import { isValidObjectId } from "mongoose";

export const getAllEvents = createGetAll(Event, { date_start: 1 });

// Custom getById om de venue (Terras/Restaurant) mee te geven
export const getEventById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const query = isValidObjectId(id) ? { _id: id } : { uuid: id };
    const event = await Event.findOne({ ...query, isDeleted: { $ne: true } });
    
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    let venue = null;
    if (event.locationRef && event.locationType) {
      if (event.locationType === "terras") {
        venue = await Terras.findOne({ uuid: event.locationRef, isDeleted: { $ne: true } });
      } else if (event.locationType === "restaurant") {
        venue = await Restaurant.findOne({ uuid: event.locationRef, isDeleted: { $ne: true } });
      }
    }

    const selfHref = `/api/events/${event.uuid}`;
    const responseData = {
      event: event,
      venue: venue, // Bevat nu de naam, adres etc. van de plek
      links: [
        { rel: "self", href: selfHref },
        { rel: "collection", href: "/api/events" },
        { rel: "sun", href: `/api/sun/event/${event.uuid}` }
      ]
    };

    res.format({
      'application/ld+json': () => res.status(200).json(
        toLd("event", event.toObject(), selfHref)
      ),
      'application/json': () => res.status(200).json(responseData),
      'text/html': () => res.render('events/detail', responseData),
      'default': () => res.status(406).send('Not Acceptable')
    });

  } catch (error) {
    res.status(500).json({ message: "Error fetching Event", error });
  }
};

export const createEvent = createOne(Event);
export const updateEvent = updateOne(Event);
export const patchEvent = patchOne(Event);

// Soft delete: event wordt gemarkeerd als verwijderd
// Cascade: verwijder alle gekoppelde zondata
export const deleteEvent = softDelete(Event, async (id) => {
  await SunData.deleteMany({ locationRef: id, locationType: "Event" });
});

// Helper: geeft start en einde van een dag terug
const getDayRange = (date?: string) : { dayStart: Date; dayEnd: Date } => {
    const day = date ? new Date(date) : new Date();
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    return { dayStart: day, dayEnd: nextDay };
};

// Filtert events die overlappen met vandaag of een gekozen datum (?date=YYYY-MM-DD)
export const getTodaysEvents = async (req: Request, res: Response) => {
    try {
        const { dayStart, dayEnd } = getDayRange(req.query.date as string);

        const events = await Event.find({
            date_start: { $lt: dayEnd },
            date_end: { $gte: dayStart }
        }).sort({ date_start: 1 });

        const responseData = {
            count: events.length,
            events: events,
            links: [
                { rel: "self", href: "/api/events/today" },
                { rel: "collection", href: "/api/events" },
                { rel: "with_terrasen", href: "/api/events/with-terrasen" } 
            ]
        };

        res.format({
            'application/json': () => res.status(200).json(responseData),
            'text/html': () => res.render('events/list', responseData),
            'default': () => res.status(406).send('Not Acceptable')
        });
    } catch (error) {
        res.status(500).json({ message: "Error fetching Events" });
    }
};

// Koppel events aan dichtstbijzijnde terrasen (max 100m)
const findNearbyTerrasen = async (event: EventDocument) => {
    const terrasen = await Terras.find({
        location: {
            $near: { $geometry: event.location, $maxDistance: 100 }
        }
    });
    return { ...event.toObject(), terrasen };
};

// Events van vandaag/gekozen datum + gekoppelde terrasen
export const getEventsWithTerras = async (req: Request, res: Response) => {
    try {
        const { dayStart, dayEnd } = getDayRange(req.query.date as string);

        const events = await Event.find({
            date_start: { $lt: dayEnd },
            date_end: { $gte: dayStart }
        }).sort({ date_start: 1 });

        const result = await Promise.all(events.map(findNearbyTerrasen));

        const responseData = {
            count: result.length,
            events: result,
            links: [
                { rel: "self", href: "/api/events/with-terrasen" },
                { rel: "today_only", href: "/api/events/today" },
                { rel: "collection", href: "/api/events" }
            ]
        };

        res.format({
            'application/json': () => res.status(200).json(responseData),
            'text/html': () => res.render('events/list', responseData), // TODO: eventueel aparte view maken 'with-terrasen'
            'default': () => res.status(406).send('Not Acceptable')
        });
    } catch (error) {
        res.status(500).json({ message: "Error fetching Events" });
    }
};
