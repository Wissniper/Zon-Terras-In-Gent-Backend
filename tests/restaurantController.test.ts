import request from 'supertest';
import app from '../app.js';
import { connect, clearDatabase, closeDatabase } from './database.helper.js';
import Restaurant from '../models/restaurantModel.js';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('Restaurant Controller Logic Tests', () => {

//getAllRestaurants filters by ?intensity=
  it('getAllRestaurants filters by ?intensity=', async () => {
    await Restaurant.create([
      { uuid: 'r-high', name: 'Zonnig Restaurant', rating: 3, cuisine: 'Italian', intensity: 90, address: 'Gent', location: { type: 'Point', coordinates: [3.7, 51.0] } },
      { uuid: 'r-low', name: 'Schaduw Restaurant', rating: 1, cuisine: 'Italian', intensity: 10, address: 'Gent', location: { type: 'Point', coordinates: [3.7, 51.0] } }
    ]);

    const response = await request(app)
      .get('/api/restaurants?intensity=90')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    const data = response.body.restaurants;
    
    expect(data.length).toBe(1);
    expect(data[0].intensity).toBe(90);
  });

//getRestaurantById returns 404 for unknown ID
  it('getRestaurantById returns 404 for unknown ID', async () => {

    const nonExistentUuid = '550e8400-e29b-41d4-a716-446655440000';
    const response = await request(app)
      .get(`/api/restaurants/${nonExistentUuid}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Restaurant not found");
  });

//getRestaurantsByName does case-insensitive search via getAll
  it('getRestaurantsByName does case-insensitive search via query param', async () => {
    await Restaurant.create({ 
      uuid: 'r-123', 
      name: 'Het Gouden Bord',
      rating: 4,
      cuisine: 'Italian',
      intensity: 50, 
      address: 'Gent', 
      location: { type: 'Point', coordinates: [3.7, 51.0] } 
    });

    const response = await request(app)
      .get('/api/restaurants?name=gouden')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    
    const results = response.body.restaurants;
    expect(results[0].name).toMatch(/Gouden/i);
    
  });

});