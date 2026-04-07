import request from 'supertest';
import app from '../app.js';
import { connect, clearDatabase, closeDatabase } from './database.helper.js';

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

//Test caching logic (getOrCreateCache)
  it.skip('getOrCreateCache creates new entry and returns existing when cached', async () => {
    // TODO
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