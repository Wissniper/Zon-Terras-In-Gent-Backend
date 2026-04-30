import request from 'supertest';
import { connect, closeDatabase, clearDatabase } from './database.helper';
import { createTestApp } from './testApp';
import Event from '../models/eventModel';
import Terras from '../models/terrasModel';

const app = createTestApp();

const validEvent = {
  title: 'Jazz Festival',
  address: 'Sint-Baafsplein 1, 9000 Gent',
  date_start: '2026-06-01T10:00:00.000Z',
  date_end: '2026-06-01T18:00:00.000Z',
  location: { type: 'Point', coordinates: [3.722, 51.053] },
};

const validTerras = {
  name: 'Terras De Zon',
  address: 'Korenmarkt 1, 9000 Gent',
  location: { type: 'Point', coordinates: [3.7218, 51.0536] },
  intensity: 80,
};

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('GET /api/events', () => {
  it('returns an empty list when no events exist', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.events).toEqual([]);
  });

  it('returns all events', async () => {
    await Event.create(validEvent);
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.events[0].title).toBe(validEvent.title);
  });
});

describe('POST /api/events', () => {
  it('returns 404 because the route is disabled', async () => {
    const res = await request(app).post('/api/events').send(validEvent);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/events/:id', () => {
  it('returns an event by UUID', async () => {
    const created = await Event.create(validEvent);
    const uuid = created.uuid;

    const res = await request(app).get(`/api/events/${uuid}`);
    expect(res.status).toBe(200);
    expect(res.body.event.uuid).toBe(uuid);
  });

  it('returns 404 for a non-existent UUID', async () => {
    const res = await request(app).get('/api/events/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid ID format', async () => {
    const res = await request(app).get('/api/events/not-a-valid-id');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/events/today', () => {
  it('returns events that overlap with today', async () => {
    const today = new Date();
    const eventToday = {
      ...validEvent,
      date_start: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0).toISOString(),
      date_end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 20, 0, 0).toISOString(),
    };

    await Event.create(eventToday);
    const res = await request(app).get('/api/events/today');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('returns no events when none overlap with today', async () => {
    await Event.create(validEvent);
    const res = await request(app).get('/api/events/today');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it('returns 400 for an invalid date query param', async () => {
    const res = await request(app).get('/api/events/today?date=not-a-date');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/events/with-terrasen', () => {
  it('returns today\'s events with nearby terrasen', async () => {
    const today = new Date();
    const eventToday = {
      ...validEvent,
      date_start: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0).toISOString(),
      date_end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 20, 0, 0).toISOString(),
    };

    await Event.create(eventToday);
    const res = await request(app).get('/api/events/with-terrasen');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.events[0]).toHaveProperty('terrasen');
  });
});

describe('PUT /api/events/:id', () => {
  it('returns 404 because the route is disabled', async () => {
    const created = await Event.create(validEvent);
    const uuid = created.uuid;

    const updated = { ...validEvent, title: 'Updated Festival' };
    const res = await request(app).put(`/api/events/${uuid}`).send(updated);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/events/:id', () => {
  it('returns 404 because the route is disabled', async () => {
    const created = await Event.create(validEvent);
    const uuid = created.uuid;

    const res = await request(app).patch(`/api/events/${uuid}`).send({ title: 'Patched Title' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/events/:id', () => {
  it('returns 404 because the route is disabled', async () => {
    const created = await Event.create(validEvent);
    const uuid = created.uuid;

    const res = await request(app).delete(`/api/events/${uuid}`);
    expect(res.status).toBe(404);
  });
});
