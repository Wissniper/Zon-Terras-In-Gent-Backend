import request from 'supertest';
import { connect, closeDatabase, clearDatabase } from './database.helper';
import { createTestApp } from './testApp';

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
    await request(app).post('/api/events').send(validEvent);
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.events[0].title).toBe(validEvent.title);
  });
});

describe('POST /api/events', () => {
  it('creates an event and returns 201', async () => {
    const res = await request(app).post('/api/events').send(validEvent);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(validEvent.title);
    expect(res.body.uuid).toBeDefined();
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app).post('/api/events').send({ title: 'Missing fields' });
    expect(res.status).toBe(400);
  });

  it('creates an event linked to a terras via locationRef', async () => {
    const terrasRes = await request(app).post('/api/terrasen').send(validTerras);
    const terrasUuid = terrasRes.body.uuid;

    const res = await request(app).post('/api/events').send({
      ...validEvent,
      locationRef: terrasUuid,
      locationType: 'terras',
    });
    expect(res.status).toBe(201);
    expect(res.body.locationRef).toBe(terrasUuid);
    expect(res.body.locationType).toBe('terras');
  });

  it('returns 400 when locationRef points to a non-existent terras', async () => {
    const res = await request(app).post('/api/events').send({
      ...validEvent,
      locationRef: '00000000-0000-4000-8000-000000000000',
      locationType: 'terras',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/events/:id', () => {
  it('returns an event by UUID', async () => {
    const created = await request(app).post('/api/events').send(validEvent);
    const uuid = created.body.uuid;

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

    await request(app).post('/api/events').send(eventToday);
    const res = await request(app).get('/api/events/today');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('returns no events when none overlap with today', async () => {
    // Event far in the future
    await request(app).post('/api/events').send(validEvent);
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

    await request(app).post('/api/events').send(eventToday);
    const res = await request(app).get('/api/events/with-terrasen');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.events[0]).toHaveProperty('terrasen');
  });
});

describe('PUT /api/events/:id', () => {
  it('fully replaces an event', async () => {
    const created = await request(app).post('/api/events').send(validEvent);
    const uuid = created.body.uuid;

    const updated = { ...validEvent, title: 'Updated Festival' };
    const res = await request(app).put(`/api/events/${uuid}`).send(updated);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Festival');
  });

  it('returns 404 when updating a non-existent event', async () => {
    const res = await request(app)
      .put('/api/events/00000000-0000-4000-8000-000000000000')
      .send(validEvent);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/events/:id', () => {
  it('partially updates an event', async () => {
    const created = await request(app).post('/api/events').send(validEvent);
    const uuid = created.body.uuid;

    const res = await request(app).patch(`/api/events/${uuid}`).send({ title: 'Patched Title' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Patched Title');
    expect(res.body.address).toBe(validEvent.address);
  });
});

describe('DELETE /api/events/:id', () => {
  it('soft-deletes an event', async () => {
    const created = await request(app).post('/api/events').send(validEvent);
    const uuid = created.body.uuid;

    const deleteRes = await request(app).delete(`/api/events/${uuid}`);
    expect(deleteRes.status).toBe(200);

    const listRes = await request(app).get('/api/events');
    expect(listRes.body.count).toBe(0);
  });

  it('returns 404 when deleting an already-deleted event', async () => {
    const created = await request(app).post('/api/events').send(validEvent);
    const uuid = created.body.uuid;

    await request(app).delete(`/api/events/${uuid}`);
    const res = await request(app).delete(`/api/events/${uuid}`);
    expect(res.status).toBe(404);
  });
});
