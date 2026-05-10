import request from 'supertest';
import { createTestApp } from './testApp.js';
import { connect, clearDatabase, closeDatabase } from './database.helper.js';
import { parseBboxFromQuery, buildBboxFilter } from '../controllers/baseController.js';

const app = createTestApp();
import Terras from '../models/terrasModel.js';
import Restaurant from '../models/restaurantModel.js';
import Event from '../models/eventModel.js';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

const INSIDE = [3.72, 51.05];     // Ghent center
const OUTSIDE_FAR = [4.50, 51.20]; // far outside city
const BBOX_GENT = {
  north: 51.10,
  south: 51.00,
  east: 3.80,
  west: 3.65,
};

describe('Bbox helper unit', () => {
  it('parseBboxFromQuery returns null for missing fields', () => {
    expect(parseBboxFromQuery({ north: '51.1', south: '51.0', east: '3.8' })).toBeNull();
    expect(parseBboxFromQuery({})).toBeNull();
  });

  it('parseBboxFromQuery returns null for non-numeric input', () => {
    expect(parseBboxFromQuery({ north: 'a', south: 'b', east: 'c', west: 'd' })).toBeNull();
  });

  it('parseBboxFromQuery returns null for degenerate or out-of-range box', () => {
    expect(parseBboxFromQuery({ north: '51.0', south: '51.0', east: '3.8', west: '3.6' })).toBeNull();
    expect(parseBboxFromQuery({ north: '51.0', south: '51.1', east: '3.8', west: '3.6' })).toBeNull();
    expect(parseBboxFromQuery({ north: '95', south: '51', east: '3.8', west: '3.6' })).toBeNull();
  });

  it('parseBboxFromQuery accepts well-formed numeric strings', () => {
    const r = parseBboxFromQuery({ north: '51.10', south: '51.00', east: '3.80', west: '3.65' });
    expect(r).toEqual({ north: 51.1, south: 51.0, east: 3.8, west: 3.65 });
  });

  it('buildBboxFilter produces a $geoWithin polygon clause', () => {
    const f = buildBboxFilter(BBOX_GENT);
    expect(f.location.$geoWithin.$geometry.type).toBe('Polygon');
    const ring = f.location.$geoWithin.$geometry.coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]); // closed ring
  });
});

describe('Bbox filter on /api/search/terrasen', () => {
  it('returns only terrasen inside bbox', async () => {
    await Terras.create({
      name: 'Inside', address: 'Gent', intensity: 50,
      location: { type: 'Point', coordinates: INSIDE },
    });
    await Terras.create({
      name: 'Outside', address: 'Far', intensity: 50,
      location: { type: 'Point', coordinates: OUTSIDE_FAR },
    });

    const res = await request(app)
      .get('/api/search/terrasen')
      .query(BBOX_GENT)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    const names = res.body.terrasen.map((t: any) => t.name);
    expect(names).toContain('Inside');
    expect(names).not.toContain('Outside');
  });

  it('without bbox returns both inside and outside', async () => {
    await Terras.create({
      name: 'Inside', address: 'Gent', intensity: 50,
      location: { type: 'Point', coordinates: INSIDE },
    });
    await Terras.create({
      name: 'Outside', address: 'Far', intensity: 50,
      location: { type: 'Point', coordinates: OUTSIDE_FAR },
    });

    const res = await request(app)
      .get('/api/search/terrasen')
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.terrasen).toHaveLength(2);
  });
});

describe('Bbox filter on /api/search/restaurants', () => {
  it('returns only restaurants inside bbox', async () => {
    await Restaurant.create({
      name: 'Inside', address: 'Gent', cuisine: 'belgian', intensity: 50,
      location: { type: 'Point', coordinates: INSIDE },
    });
    await Restaurant.create({
      name: 'Outside', address: 'Far', cuisine: 'belgian', intensity: 50,
      location: { type: 'Point', coordinates: OUTSIDE_FAR },
    });

    const res = await request(app)
      .get('/api/search/restaurants')
      .query(BBOX_GENT)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    const names = res.body.restaurants.map((r: any) => r.name);
    expect(names).toContain('Inside');
    expect(names).not.toContain('Outside');
  });
});

describe('Bbox filter on /api/search/events', () => {
  it('returns only events inside bbox', async () => {
    await Event.create({
      title: 'Inside', address: 'Gent',
      date_start: new Date(), date_end: new Date(Date.now() + 86400000),
      location: { type: 'Point', coordinates: INSIDE },
    });
    await Event.create({
      title: 'Outside', address: 'Far',
      date_start: new Date(), date_end: new Date(Date.now() + 86400000),
      location: { type: 'Point', coordinates: OUTSIDE_FAR },
    });

    const res = await request(app)
      .get('/api/search/events')
      .query(BBOX_GENT)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    const titles = res.body.events.map((e: any) => e.title);
    expect(titles).toContain('Inside');
    expect(titles).not.toContain('Outside');
  });
});

describe('Bbox filter on /api/terrasen', () => {
  it('returns only terrasen inside bbox', async () => {
    await Terras.create({
      name: 'Inside', address: 'Gent', intensity: 50,
      location: { type: 'Point', coordinates: INSIDE },
    });
    await Terras.create({
      name: 'Outside', address: 'Far', intensity: 50,
      location: { type: 'Point', coordinates: OUTSIDE_FAR },
    });

    const res = await request(app)
      .get('/api/terrasen')
      .query(BBOX_GENT)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    const names = res.body.terrasen.map((t: any) => t.name);
    expect(names).toContain('Inside');
    expect(names).not.toContain('Outside');
  });
});
