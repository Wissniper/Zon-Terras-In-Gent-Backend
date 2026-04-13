import request from 'supertest';
import { createTestApp } from './testApp.js';
import { connect, clearDatabase, closeDatabase } from './database.helper.js';

const app = createTestApp();
import Terras from '../models/terrasModel.js';
import Restaurant from '../models/restaurantModel.js';
import Event from '../models/eventModel.js';

beforeAll(async () => {
    await connect()
    
    await Promise.all([
    Terras.init(),
    Restaurant.init(),
    Event.init() ]);
});

afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('Search Controller Logic Tests', () => {

//searchTerrasen combines text, intensity, and geo filters
it('searchTerrasen combines text, intensity, and geo filters', async () => {
    await Terras.create({
      uuid: 't-search-1',
      name: 'Korenmarkt Terras',
      address: 'Gent',
      intensity: 70,
      location: { type: 'Point', coordinates: [3.72, 51.05] }, 
      isDeleted: false
    });

    const response = await request(app)
      .get('/api/search/terrasen?q=koren&minIntensity=60&lat=51.05&lng=3.72&radius=2')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body.terrasen.length).toBe(1);
    expect(response.body.terrasen[0].name).toMatch(/Korenmarkt/i);
  });

//searchRestaurants filters by cuisine and intensity range
it('searchRestaurants filters by cuisine and intensity', async () => {
    await Restaurant.create({
      uuid: 'r-search-1',
      name: 'Pizza Place',
      cuisine: 'Italian',
      address: 'Gent',
      intensity: 65,
      location: { type: 'Point', coordinates: [3.72, 51.05] },
      isDeleted: false
    });

    const response = await request(app)
      .get('/api/search/restaurants?cuisine=italian&minIntensity=60')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body.restaurants.length).toBe(1);
    expect(response.body.restaurants[0].cuisine).toBe('Italian');
  });

//searchEvents filters by date overlap + text
it('searchEvents filters by date overlap and text', async () => {
    await Event.create({
      uuid: 'e-search-1',
      title: 'Jazz Night',
      address: 'Gent',
      date_start: new Date('2026-03-07T20:00:00Z'),
      date_end: new Date('2026-03-07T23:59:00Z'),
      locationRef: 'some-uuid',
      locationType: 'restaurant',
      location: {
        type: 'Point',
        coordinates: [3.727, 51.053]
    }
    });

    const response = await request(app)
      .get('/api/search/events?q=jazz&date=2026-03-07')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body.events.length).toBe(1);
    expect(response.body.events[0].title).toBe('Jazz Night');
  });

//searchNearby returns all 3 entity types in one response
it('searchNearby returns all 3 entity types in one response', async () => {
    const commonLoc = { type: 'Point', coordinates: [3.725, 51.055] };
    
    await Promise.all([
      Terras.create({ uuid: 't-near', name: 'T', address: 'Gent', location: commonLoc, intensity: 50 }),
      Restaurant.create({ uuid: 'r-near', name: 'R', cuisine: 'Italian', address: 'Gent', location: commonLoc, intensity: 50 }),
      Event.create({ uuid: 'e-near', title: 'E', address: 'Gent', location: commonLoc, date_start: new Date(), date_end: new Date() })
    ]);

    ///api/search/nearby/:lat/:lng/:radius
    const response = await request(app)
      .get('/api/search/nearby/51.055/3.725/1')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body.counts.total).toBe(3);
    expect(response.body.data.terrasen).toBeDefined();
    expect(response.body.data.restaurants).toBeDefined();
    expect(response.body.data.events).toBeDefined();
  });
});