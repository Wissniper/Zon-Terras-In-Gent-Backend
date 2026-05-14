/**
 * Cross-endpoint convergence test.
 *
 * Asserts the contract that drove the frontend "every source shows a
 * different number" bug:
 *
 *   /api/search/terrasen?time=X      (leaderboard, discover, marker list)
 *   /api/sun/terras/:uuid?time=X     (map popup, terras detail page)
 *   /api/terrasen/:uuid?time=X       (detail page fallback)
 *
 * MUST agree on intensity for the same (id, time) pair. Same shadow lookup,
 * same cloud lookup, same formula, same time. If they ever diverge again
 * the four frontend surfaces will too.
 */

import request from 'supertest';
import { connect, closeDatabase, clearDatabase } from './database.helper';
import { createTestApp } from './testApp';
import Terras from '../models/terrasModel';
import Weather from '../models/weatherModel';

const app = createTestApp();

describe('Intensity convergence across endpoints', () => {
  beforeAll(async () => { await connect(); });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('/search/terrasen and /sun/terras/:id return identical intensity for the same (id, time)', async () => {
    const terras = await Terras.create({
      name: 'Convergence Terras',
      address: 'Gent',
      intensity: 0,
      location: { type: 'Point', coordinates: [3.72, 51.05] },
    });

    // Seed a recent weather point so both endpoints see the same cloud factor.
    await Weather.create({
      location: { type: 'Point', coordinates: [3.72, 51.05] },
      timestamp: new Date(),
      temperature: 15,
      cloudCover: 30,
      cloudFactor: 24,
      uvIndex: 4,
      windspeed: 3,
    });

    // Pick a deterministic daytime moment in Ghent so altitude > 0.
    const time = new Date('2026-05-14T12:00:00Z').toISOString();

    const [searchRes, sunRes, detailRes] = await Promise.all([
      request(app).get(`/api/search/terrasen?time=${encodeURIComponent(time)}`).set('Accept', 'application/json'),
      request(app).get(`/api/sun/terras/${terras.uuid}?time=${encodeURIComponent(time)}`).set('Accept', 'application/json'),
      request(app).get(`/api/terrasen/${terras.uuid}?time=${encodeURIComponent(time)}`).set('Accept', 'application/json'),
    ]);

    expect(searchRes.status).toBe(200);
    expect(sunRes.status).toBe(200);
    expect(detailRes.status).toBe(200);

    const searchItem = searchRes.body.terrasen.find((t: any) => t.uuid === terras.uuid);
    expect(searchItem).toBeDefined();

    const searchIntensity = searchItem.intensity;
    const sunIntensity = sunRes.body.sunData.intensity;
    const detailIntensity = detailRes.body.terras.intensity;

    expect(sunIntensity).toBe(searchIntensity);
    expect(detailIntensity).toBe(searchIntensity);
  });

  it('night-time consistency: all three endpoints return 0 when altitude <= 0', async () => {
    await Terras.create({
      name: 'Night Terras',
      address: 'Gent',
      intensity: 50,
      location: { type: 'Point', coordinates: [3.72, 51.05] },
    });
    const terras = await Terras.findOne({ name: 'Night Terras' });
    expect(terras).toBeDefined();

    // 02:00 UTC in May — sun below horizon at Ghent latitude.
    const time = new Date('2026-05-14T02:00:00Z').toISOString();

    const [searchRes, sunRes, detailRes] = await Promise.all([
      request(app).get(`/api/search/terrasen?time=${encodeURIComponent(time)}`).set('Accept', 'application/json'),
      request(app).get(`/api/sun/terras/${terras!.uuid}?time=${encodeURIComponent(time)}`).set('Accept', 'application/json'),
      request(app).get(`/api/terrasen/${terras!.uuid}?time=${encodeURIComponent(time)}`).set('Accept', 'application/json'),
    ]);

    const searchItem = searchRes.body.terrasen.find((t: any) => t.uuid === terras!.uuid);
    expect(searchItem.intensity).toBe(0);
    expect(sunRes.body.sunData.intensity).toBe(0);
    expect(detailRes.body.terras.intensity).toBe(0);
  });
});
