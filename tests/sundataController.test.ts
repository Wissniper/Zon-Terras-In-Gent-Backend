import request from 'supertest';
import app from '../app.js';
import { connect, clearDatabase, closeDatabase } from './database.helper.js';
import Terras from '../models/terrasModel.js';
import SunData from '../models/sunDataModel.js';
import Weather from '../models/weatherModel.js';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('SunData Controller Logic Tests', () => {

//getSunPosition calculates correct data for known coordinates
it('getSunPosition calculates sun data for known coordinates/time', async () => {
    const lat = '51.05';
    const lng = '3.72';
    const time = '2026-03-07T12:00:00Z';

    const response = await request(app)
      .get(`/api/sun/${lat}/${lng}/${time}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('position');
    expect(response.body.position).toHaveProperty('azimuth');
    expect(response.body).toHaveProperty('intensity');
  });

//getSunPosition returns 400 for invalid input
  it('getSunPosition returns 400 for invalid input', async () => {
    const response = await request(app)
      .get('/api/sun/invalid/coordinates/now')
      .set('Accept', 'application/json');

    expect(response.status).toBe(400);
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].msg).toBe('Lat should be between -90 and 90');
  });

//getSunForTerras returns 404 for unknown terras
  it('getSunForTerras returns 404 for unknown terras', async () => {
    const nonExistentUuid = '550e8400-e29b-41d4-a716-446655440000';
    const response = await request(app)
      .get(`/api/sun/terras/${nonExistentUuid}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Terras not found');
  });

//getOrCreateCache creates new entry when not cached
  it('getOrCreateCache creates new entry when not cached', async () => {
    const terras = await Terras.create({
      name: 'Cache Test Terras',
      address: 'Gent',
      intensity: 50,
      location: { type: 'Point', coordinates: [3.72, 51.05] },
    });

    // Seed Weather so fetchWeatherData reads from DB instead of making an HTTP call
    await Weather.create({
      timestamp: new Date(),
      temperature: 20,
      cloudCover: 10,
      cloudFactor: 8,
      uvIndex: 3,
      windspeed: 15,
      location: { type: 'Point', coordinates: [3.72, 51.05] },
    });

    const response = await request(app)
      .get(`/api/sun/terras/${terras.uuid}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);

    const count = await SunData.countDocuments({ locationRef: terras._id, locationType: 'Terras' });
    expect(count).toBe(1);
  });

//getOrCreateCache returns existing entry when already cached
  it('getOrCreateCache returns existing entry when already cached', async () => {
    const terras = await Terras.create({
      name: 'Cache Test Terras',
      address: 'Gent',
      intensity: 50,
      location: { type: 'Point', coordinates: [3.72, 51.05] },
    });

    // Pre-create a fresh SunData entry — updatedAt will be now, so isStale = false
    const cacheDate = new Date();
    cacheDate.setMinutes(0, 0, 0);
    await SunData.create({
      locationRef: terras._id,
      locationType: 'Terras',
      dateTime: cacheDate,
      intensity: 77,
      azimuth: 2.5,
      altitude: 0.8,
      goldenHour: {
        dawnStart: new Date(),
        dawnEnd: new Date(),
        duskStart: new Date(),
        duskEnd: new Date(),
      },
    });

    const response = await request(app)
      .get(`/api/sun/terras/${terras.uuid}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);

    // No new entry should have been created
    const count = await SunData.countDocuments({ locationRef: terras._id, locationType: 'Terras' });
    expect(count).toBe(1);

    // The cached intensity should be returned unchanged
    expect(response.body.sunData.intensity).toBe(77);
  });

//getCachedSunData validates locationType enum
  it('getCachedSunData validates locationType enum', async () => {
    const response = await request(app)
      .get('/api/sun/cache/InvalidType/some-id')
      .set('Accept', 'application/json');

    expect(response.status).toBe(400);
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].msg).toBe('Invalid database id');
  });
});