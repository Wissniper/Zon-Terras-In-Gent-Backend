import { jest, describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';

// Mock the external weather service so tests don't hit Open-Meteo
jest.unstable_mockModule('../services/weatherService', () => ({
  fetchWeatherData: jest.fn<any>().mockResolvedValue({
    temperature: 20,
    windspeed: 8,
    weathercode: 0,
  }),
}));

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { connect, closeDatabase, clearDatabase } = await import('./database.helper');
const { default: sunDataRoutes } = await import('../routes/sunDataRoutes');
const { default: Terras } = await import('../models/terrasModel');
const { default: ShadowScore } = await import('../models/shadowScoreModel');

// Build a minimal app with only the sun routes (avoids missing gent3dRoutes in testApp.ts)
const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: any) => {
  if (!req.headers.accept || req.headers.accept === '*/*') {
    req.headers.accept = 'application/json';
  }
  next();
});
app.use('/api/sun', sunDataRoutes);

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('GET /api/sun/terras/:id with shadowScore', () => {
  it('includes shadowScore in the sunData response', async () => {
    const terras = await Terras.create({
      name: 'Test Terras',
      address: 'Teststraat 1',
      location: { type: 'Point', coordinates: [3.7218, 51.0536] },
      intensity: 70,
    });

    // Pre-seed a shadow score of 0.5 for this terrace at current hour
    const ts = new Date();
    ts.setMinutes(0, 0, 0);
    ts.setMilliseconds(0);
    await ShadowScore.create({ terrasRef: terras._id, timestamp: ts, score: 0.5 });

    const res = await request(app)
      .get(`/api/sun/terras/${terras.uuid}`)
      .query({ time: ts.toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.sunData).toHaveProperty('shadowScore');
    expect(res.body.sunData.shadowScore).toBe(0.5);
  });

  it('defaults shadowScore to 1.0 when no score is seeded (cold start)', async () => {
    const terras = await Terras.create({
      name: 'Test Terras 2',
      address: 'Teststraat 2',
      location: { type: 'Point', coordinates: [3.7218, 51.0536] },
      intensity: 70,
    });

    const res = await request(app)
      .get(`/api/sun/terras/${terras.uuid}`)
      .query({ time: new Date().toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.sunData.shadowScore).toBe(1.0);
  });

  it('intensity with shadowScore 0.5 is roughly half of intensity with shadowScore 1.0', async () => {
    const terras = await Terras.create({
      name: 'Test Terras 3',
      address: 'Teststraat 3',
      location: { type: 'Point', coordinates: [3.7218, 51.0536] },
      intensity: 70,
    });

    const ts = new Date('2026-06-15T11:30:00Z'); // noon in Belgium — high intensity
    ts.setMinutes(0, 0, 0);
    ts.setMilliseconds(0);

    // With shadowScore 1.0 (no shadow docs = cold start default)
    const resFull = await request(app)
      .get(`/api/sun/terras/${terras.uuid}`)
      .query({ time: ts.toISOString() });

    const fullIntensity = resFull.body.sunData.intensity;

    // Now seed a 0.5 shadow score
    await ShadowScore.create({ terrasRef: terras._id, timestamp: ts, score: 0.5 });

    const resShadowed = await request(app)
      .get(`/api/sun/terras/${terras.uuid}`)
      .query({ time: ts.toISOString() });

    const shadowedIntensity = resShadowed.body.sunData.intensity;

    // Shadowed intensity should be approximately 50% of full — within rounding
    expect(shadowedIntensity).toBeLessThanOrEqual(fullIntensity);
    expect(shadowedIntensity).toBeGreaterThanOrEqual(Math.floor(fullIntensity * 0.5) - 1);
  });
});
