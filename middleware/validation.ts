import { param, validationResult, body, query } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import Terras from '../models/terrasModel.js';
import Restaurant from '../models/restaurantModel.js';

const handleErrors = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorArray = errors.array();
        return res.status(400).format({
            'application/json': () => res.json({ errors: errorArray }),
            'text/html': () => res.render('error', { title: 'Validatiefout', status: 400, errors: errorArray }),
            'default': () => res.send('Bad Request')
        });
    }
    next();
};

export const validateCoords = [
    param('lat').isFloat({ min: -90, max: 90 }).withMessage('Lat should be between -90 and 90'),
    param('lng').isFloat({ min: -180, max: 180 }).withMessage('Lng should be between -180 and 180'),
    handleErrors
];

export const validateID = [
    param(['id', 'locationId', 'restaurantId', 'terrasId', 'eventId'])
        .optional()
        .custom((value) => {
            // Check if it's a valid MongoDB ObjectId or a valid UUID (v4)
            const mongoIdPattern = /^[0-9a-fA-F]{24}$/;
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (mongoIdPattern.test(value) || uuidPattern.test(value)) {
                return true;
            }
            throw new Error("Invalid database id");
        }),
    (req: Request, res: Response, next: NextFunction) => {
        const idParams = ['id', 'locationId', 'restaurantId', 'terrasId', 'eventId'];
        const hasId = idParams.some(p => req.params[p]);
        if (!hasId) {
            const errorArray = [{ msg: "Missing id parameter" }];
            return res.status(400).format({
                'application/json': () => res.json({ errors: errorArray }),
                'text/html': () => res.render('error', { title: 'Validatiefout', status: 400, errors: errorArray }),
                'default': () => res.send('Bad Request')
            });
        }
        next();
    },
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

    export const validateLocationRef = [
    body('locationRef').optional().custom(async (value, { req }) => {
        const type = req.body.locationType;
        if (!type) {
            // If locationRef is provided, locationType is mandatory
            if (value) throw new Error("locationType is required when locationRef is provided");
            return true;
        }

        if (type === 'terras') {
            const exists = await Terras.findOne({ uuid: value, isDeleted: { $ne: true } });
            if (!exists) throw new Error("Referenced Terras does not exist");
        } else if (type === 'restaurant') {
            const exists = await Restaurant.findOne({ uuid: value, isDeleted: { $ne: true } });
            if (!exists) throw new Error("Referenced Restaurant does not exist");
        }
        return true;
    }),
    handleErrors
    ];