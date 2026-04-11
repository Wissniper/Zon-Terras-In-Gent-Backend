import { jest, describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';

// Mock the external weather service so sun endpoints don't hit Open-Meteo
jest.unstable_mockModule('../services/weatherService', () => ({
  fetchWeatherData: jest.fn<any>().mockResolvedValue({
    temperature: 20,
    windspeed: 8,
    weathercode: 0,
  }),
}));

const { default: request } = await import('supertest');
const { connect, closeDatabase, clearDatabase } = await import('./database.helper');
const { createTestApp } = await import('./testApp');

const app = createTestApp();

const validTerras = {
  name: 'Zonnig Terras',
  address: 'Korenmarkt 1, 9000 Gent',
  location: { type: 'Point', coordinates: [3.7218, 51.0536] },
  intensity: 85,
};

const validRestaurant = {
  name: 'Terras Restaurant',
  address: 'Veldstraat 10, 9000 Gent',
  cuisine: 'Belgian',
  location: { type: 'Point', coordinates: [3.72, 51.054] },
  intensity: 70,
};

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('GET /api/sun/:lat/:lng/:time', () => {
  it('returns sun position for valid coordinates and time=now', async () => {
    const res = await request(app).get('/api/sun/51.0536/3.7218/now');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('position');
    expect(res.body.position).toHaveProperty('azimuth');
    expect(res.body.position).toHaveProperty('altitude');
  });

  it('returns sun position for an ISO 8601 timestamp', async () => {
    const res = await request(app).get('/api/sun/51.0536/3.7218/2026-06-21T12:00:00Z');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('intensity');
  });

  it('returns 400 for invalid coordinates', async () => {
    const res = await request(app).get('/api/sun/999/3.72/now');
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid time format', async () => {
    const res = await request(app).get('/api/sun/51.05/3.72/not-a-time');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/sun/terras/:terrasId', () => {
  it('returns sun data for an existing terras', async () => {
    const created = await request(app).post('/api/terrasen').send(validTerras);
    const uuid = created.body.uuid;

    const res = await request(app).get(`/api/sun/terras/${uuid}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sunData');
  });

  it('returns 404 for a non-existent terras', async () => {
    const res = await request(app).get('/api/sun/terras/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid terras ID format', async () => {
    const res = await request(app).get('/api/sun/terras/not-valid');
    expect(res.status).toBe(400);
  });

  it('accepts an optional ?time= query param', async () => {
    const created = await request(app).post('/api/terrasen').send(validTerras);
    const uuid = created.body.uuid;

    const res = await request(app).get(`/api/sun/terras/${uuid}?time=2026-06-21T12:00:00Z`);
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid ?time= query param', async () => {
    const created = await request(app).post('/api/terrasen').send(validTerras);
    const uuid = created.body.uuid;

    const res = await request(app).get(`/api/sun/terras/${uuid}?time=not-a-date`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/sun/restaurant/:restaurantId', () => {
  it('returns sun data for an existing restaurant', async () => {
    const created = await request(app).post('/api/restaurants').send(validRestaurant);
    const uuid = created.body.uuid;

    const res = await request(app).get(`/api/sun/restaurant/${uuid}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sunData');
  });

  it('returns 404 for a non-existent restaurant', async () => {
    const res = await request(app).get('/api/sun/restaurant/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/sun/event/:eventId', () => {
  it('returns sun data for an existing event', async () => {
    const eventRes = await request(app).post('/api/events').send({
      title: 'Sun Test Event',
      address: 'Korenmarkt 1, Gent',
      date_start: '2026-06-01T10:00:00.000Z',
      date_end: '2026-06-01T18:00:00.000Z',
      location: { type: 'Point', coordinates: [3.7218, 51.0536] },
    });
    const uuid = eventRes.body.uuid;

    const res = await request(app).get(`/api/sun/event/${uuid}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sunData');
  });

  it('returns 404 for a non-existent event', async () => {
    const res = await request(app).get('/api/sun/event/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/sun/cache/:locationType/:locationId', () => {
  it('returns 400 for invalid locationType', async () => {
    const res = await request(app).get('/api/sun/cache/InvalidType/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(400);
  });

  it('returns 200 with empty cache for valid location', async () => {
    const created = await request(app).post('/api/terrasen').send(validTerras);
    const uuid = created.body.uuid;

    const res = await request(app).get(`/api/sun/cache/Terras/${uuid}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/sun/batch', () => {
  it('returns sun data for a batch of locations', async () => {
    const res = await request(app)
      .post('/api/sun/batch')
      .send({
        locations: [
          { lat: 51.0536, lng: 3.7218, time: new Date().toISOString() },
          { lat: 51.056, lng: 3.724, time: '2026-06-21T12:00:00Z' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.results[0]).toHaveProperty('intensity');
  });

  it('returns 400 when locations is not an array', async () => {
    const res = await request(app).post('/api/sun/batch').send({ locations: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid coordinates in batch', async () => {
    const res = await request(app).post('/api/sun/batch').send({
      locations: [{ lat: 999, lng: 3.72, time: 'now' }],
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid time in batch', async () => {
    const res = await request(app).post('/api/sun/batch').send({
      locations: [{ lat: 51.05, lng: 3.72, time: 'not-a-time' }],
    });
    expect(res.status).toBe(400);
  });
});
