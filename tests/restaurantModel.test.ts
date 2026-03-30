import { connect, clearDatabase, closeDatabase } from './database.helper';
import  Restaurant  from '../models/restaurantModel';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('Restaurant Model Tests', () => {
  
  const validRestaurantData = {
    name: 'De Gouden Saté',
    address: 'Sint-Pietersplein 1, 9000 Gent',
    cuisine: 'Belgian',
    rating: 4.5,
    identifier: 123456789,
    location: { type: 'Point', coordinates: [3.726, 51.041] },
    intensity: 85
  };

//Test verplichte velden
    it('zou een restaurant succesvol moeten aanmaken met alle verplichte velden', async () => {
        const restaurant = new Restaurant(validRestaurantData);
        const savedRestaurant = await restaurant.save();
        
        expect(savedRestaurant._id).toBeDefined();
        expect(savedRestaurant.name).toBe(validRestaurantData.name);
    });

    it('zou moeten falen als verplichte velden ontbreken', async () => {
        const invalidRestaurant = new Restaurant({ cuisine: 'Italian' });
        await expect(invalidRestaurant.save()).rejects.toThrow();
    });

//Test rating (min 0, max 5)
    it('zou een error moeten geven als de rating lager is dan 0', async () => {
        const lowRating = new Restaurant({ ...validRestaurantData, rating: -1 });
        await expect(lowRating.save()).rejects.toThrow();
    });

    it('zou een error moeten geven als de rating hoger is dan 5', async () => {
        const highRating = new Restaurant({ ...validRestaurantData, rating: 6 });
        await expect(highRating.save()).rejects.toThrow();
    });

//Test duplicate identifier
    it('zou een duplicate identifier moeten weigeren', async () => {
        await new Restaurant(validRestaurantData).save();
        const duplicate = new Restaurant(validRestaurantData);
        
        await expect(duplicate.save()).rejects.toThrow();
    });

//Test 2dsphere index & location
    it('zou de GeoJSON locatie correct moeten opslaan', async () => {
        const restaurant = new Restaurant(validRestaurantData);
        await restaurant.save();
        
        //Controleer of de index bestaat
        const indexes = Restaurant.schema.indexes();
        const has2dsphere = indexes.some((idx: { location: string; }[]) => idx[0].location === '2dsphere');
        expect(has2dsphere).toBe(true);
    });

//Test overige indexes
    it('zou indexes moeten hebben op rating, intensity, name en cuisine', () => {
        const indexes = Restaurant.schema.indexes();
        const indexedFields = indexes.map((idx: {}[]) => Object.keys(idx[0])).flat();
        
        expect(indexedFields).toContain('rating');
        expect(indexedFields).toContain('intensity');
        expect(indexedFields).toContain('name');
        expect(indexedFields).toContain('cuisine');

    });
});