import request from 'supertest';
import { createTestApp } from './testApp.js';
import { connect, clearDatabase, closeDatabase } from './database.helper.js';

const app = createTestApp();
import Terras from '../models/terrasModel.js';
import Restaurant from '../models/restaurantModel.js';
import Event from '../models/eventModel.js';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

// Ghent city center
const CENTER = { lat: 51.05, lng: 3.72 };
// ~440m north of center  (well within 1 km radius)
const NEAR = { lat: 51.054, lng: 3.72 };
// ~1660m north of center (beyond 1 km, within 2 km)
const FAR  = { lat: 51.065, lng: 3.72 };

describe('Geospatial Query Tests', () => {

  // $near query finds terrassen within radius of a point
  it('$near query finds terrassen within 100m of a point', async () => {
    await Terras.create({
      name: 'Terras Dichtbij',
      address: 'Gent',
      intensity: 50,
      location: { type: 'Point', coordinates: [NEAR.lng, NEAR.lat] },
    });

    const res = await request(app)
      .get(`/api/search/nearby/${CENTER.lat}/${CENTER.lng}/1`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.data.terrasen).toHaveLength(1);
    expect(res.body.data.terrasen[0].name).toBe('Terras Dichtbij');
  });

  // $near query excludes terrassen beyond distance
  it('$near query excludes terrassen beyond distance', async () => {
    await Terras.create({
      name: 'Terras Ver Weg',
      address: 'Gent',
      intensity: 50,
      location: { type: 'Point', coordinates: [FAR.lng, FAR.lat] },
    });

    const res = await request(app)
      .get(`/api/search/nearby/${CENTER.lat}/${CENTER.lng}/1`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.data.terrasen).toHaveLength(0);
  });

  // $geoWithin + $centerSphere works for area search (restaurant & terras search controllers)
  it('$geoWithin + $centerSphere works for area search (restaurant & terras controllers)', async () => {
    await Terras.create([
      { name: 'Terras Dichtbij', address: 'Gent', intensity: 60, location: { type: 'Point', coordinates: [NEAR.lng, NEAR.lat] } },
      { name: 'Terras Ver',      address: 'Gent', intensity: 60, location: { type: 'Point', coordinates: [FAR.lng,  FAR.lat]  } },
    ]);
    await Restaurant.create([
      { name: 'Restaurant Dichtbij', address: 'Gent', cuisine: 'Belgian', intensity: 60, location: { type: 'Point', coordinates: [NEAR.lng, NEAR.lat] } },
      { name: 'Restaurant Ver',      address: 'Gent', cuisine: 'Italian', intensity: 40, location: { type: 'Point', coordinates: [FAR.lng,  FAR.lat]  } },
    ]);

    const terrasRes = await request(app)
      .get(`/api/search/terrasen?lat=${CENTER.lat}&lng=${CENTER.lng}&radius=1`)
      .set('Accept', 'application/json');

    const restaurantRes = await request(app)
      .get(`/api/search/restaurants?lat=${CENTER.lat}&lng=${CENTER.lng}&radius=1`)
      .set('Accept', 'application/json');

    expect(terrasRes.status).toBe(200);
    expect(terrasRes.body.terrasen).toHaveLength(1);
    expect(terrasRes.body.terrasen[0].name).toBe('Terras Dichtbij');

    expect(restaurantRes.status).toBe(200);
    expect(restaurantRes.body.restaurants).toHaveLength(1);
    expect(restaurantRes.body.restaurants[0].name).toBe('Restaurant Dichtbij');
  });

  // $nearSphere works for searchNearby (all 3 entity types)
  it('$nearSphere works for searchNearby (all 3 entity types)', async () => {
    await Promise.all([
      Terras.create({
        name: 'Terras', address: 'Gent', intensity: 50,
        location: { type: 'Point', coordinates: [NEAR.lng, NEAR.lat] },
      }),
      Restaurant.create({
        name: 'Restaurant', address: 'Gent', cuisine: 'Belgian', intensity: 50,
        location: { type: 'Point', coordinates: [NEAR.lng, NEAR.lat] },
      }),
      Event.create({
        title: 'Event', address: 'Gent',
        date_start: new Date('2026-06-01T10:00:00Z'),
        date_end:   new Date('2026-06-01T12:00:00Z'),
        location: { type: 'Point', coordinates: [NEAR.lng, NEAR.lat] },
      }),
      // FAR entities — should be excluded
      Terras.create({
        name: 'Ver Terras', address: 'Gent', intensity: 50,
        location: { type: 'Point', coordinates: [FAR.lng, FAR.lat] },
      }),
      Restaurant.create({
        name: 'Ver Restaurant', address: 'Gent', cuisine: 'Italian', intensity: 40,
        location: { type: 'Point', coordinates: [FAR.lng, FAR.lat] },
      }),
      Event.create({
        title: 'Ver Event', address: 'Gent',
        date_start: new Date('2026-06-01T10:00:00Z'),
        date_end:   new Date('2026-06-01T12:00:00Z'),
        location: { type: 'Point', coordinates: [FAR.lng, FAR.lat] },
      }),
    ]);

    const res = await request(app)
      .get(`/api/search/nearby/${CENTER.lat}/${CENTER.lng}/1`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.data.terrasen).toHaveLength(1);
    expect(res.body.data.restaurants).toHaveLength(1);
    expect(res.body.data.events).toHaveLength(1);
    expect(res.body.counts.total).toBe(3);
  });

  // $geoNear aggregation stage works in search controllers (adds distance field, respects maxDistance)
  it('$geoNear aggregation stage works in search controllers', async () => {
    await Terras.create([
      { name: 'Terras Dichtbij', address: 'Gent', intensity: 70, location: { type: 'Point', coordinates: [NEAR.lng, NEAR.lat] } },
      { name: 'Terras Ver',      address: 'Gent', intensity: 80, location: { type: 'Point', coordinates: [FAR.lng,  FAR.lat]  } },
      // Beyond radius=2 (>2000m) — should be excluded
      { name: 'Buiten Straal',   address: 'Gent', intensity: 90, location: { type: 'Point', coordinates: [3.72, 51.08] } },
    ]);

    const res = await request(app)
      .get(`/api/search/terrasen?lat=${CENTER.lat}&lng=${CENTER.lng}&radius=2`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.terrasen).toHaveLength(2);
    // $geoNear adds a distance field to every result
    expect(res.body.terrasen[0]).toHaveProperty('distance');
    expect(res.body.terrasen[1]).toHaveProperty('distance');
    // The terras beyond 2 km must be absent
    const names = res.body.terrasen.map((t: any) => t.name);
    expect(names).not.toContain('Buiten Straal');
  });
});
