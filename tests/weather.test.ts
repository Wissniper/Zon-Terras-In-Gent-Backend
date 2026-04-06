import { jest, describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';

// Mock the external weather service so tests don't hit the Open-Meteo API
jest.unstable_mockModule('../services/weatherService', () => ({
  fetchWeatherData: jest.fn<any>().mockResolvedValue({
    temperature: 18.5,
    windspeed: 12,
    weathercode: 1,
  }),
}));

const { default: request } = await import('supertest');
const { connect, closeDatabase, clearDatabase } = await import('./database.helper');
const { createTestApp } = await import('./testApp');

const app = createTestApp();

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('GET /api/weather/:lat/:lng', () => {
  it('returns weather data for valid coordinates', async () => {
    const res = await request(app).get('/api/weather/51.0536/3.7218');
    expect(res.status).toBe(200);
    expect(res.body.weather).toBeDefined();
    expect(res.body.links).toBeDefined();
  });

  it('returns 400 for latitude out of range', async () => {
    const res = await request(app).get('/api/weather/999/3.72');
    expect(res.status).toBe(400);
  });

  it('returns 400 for longitude out of range', async () => {
    const res = await request(app).get('/api/weather/51.05/999');
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric coordinates', async () => {
    const res = await request(app).get('/api/weather/abc/xyz');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/weather/by-location', () => {
  it('returns 200 with an empty list when no cached data', async () => {
    const res = await request(app).get('/api/weather/by-location?lat=51.05&lng=3.72');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.weather).toEqual([]);
  });
});

describe('GET /api/weather/in-radius', () => {
  it('returns 200 with an empty list when no cached data', async () => {
    const res = await request(app).get('/api/weather/in-radius?lat=51.05&lng=3.72&radius=5');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.weather).toEqual([]);
  });
});
