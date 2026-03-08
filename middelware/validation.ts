import { param, validationResult, body, query } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

const handleErrors = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

export const validateCoords = [
    param('lat').isFloat({ min: -90, max: 90 }).withMessage('Lat should be between -90 and 90'),
    param('lng').isFloat({ min: -180, max: 180 }).withMessage('Lng should be between -180 and 180'),
    handleErrors
];

export const validateID = [
    param(['id', 'locationId', 'restaurantId', 'terrasId', 'eventId']).isMongoId().withMessage("Invalid database id"),
    handleErrors
];

export const validateRadius = [
    param('radius').isInt({min: 1}).withMessage('Radius needs to be a number > 0'),
    handleErrors
];

///:lat/:lng/:time (VERPLICHT)
export const validateTimeParam = [
    param('time').custom((value) => {
        if (value === 'now' || !isNaN(Date.parse(value))) return true;
        throw new Error("Invalid time format. Use ISO 8601 or 'now'");
    }),
    handleErrors
];

//(OPTIONEEL query ?time=)
export const validateTimeQuery = [
    query('time').optional().custom((value) => {
        if (value === 'now' || !isNaN(Date.parse(value))) return true;
        throw new Error("Invalid time format in query");
    }),
    handleErrors
];

export const validateDateQuery = [
    query('date').optional().isISO8601().withMessage('Invalid date format in query'),
    handleErrors
];

export const validateLocationType = [
    param('locationType')
        .isIn(['Terras', 'Restaurant', 'Event'])
        .withMessage('Invalid locationType. Use: Terras, Restaurant, or Event'),
    handleErrors
];

export const validateSunBatch = [
  
    body('locations').isArray().withMessage('Expected an array of locations'),
    
    body('locations.*.lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('locations.*.lng').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    body('locations.*.time').custom((value) => {
        if (value === 'now' || !isNaN(Date.parse(value))) return true;
        throw new Error("Invalid time format");
    }),
    handleErrors
];