import request from 'supertest';
import { connect, closeDatabase, clearDatabase } from './database.helper';
import { createTestApp } from './testApp';
import Terras from '../models/terrasModel';

const app = createTestApp();

const validTerras = {
  name: 'Terras De Zon',
  address: 'Korenmarkt 1, 9000 Gent',
  location: { type: 'Point', coordinates: [3.7218, 51.0536] },
  intensity: 80,
};

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('GET /api/terrasen', () => {
  it('returns an empty list when no terrasen exist', async () => {
    const res = await request(app).get('/api/terrasen');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.terrasen).toEqual([]);
  });

  it('returns all non-deleted terrasen', async () => {
    await Terras.create(validTerras);
    const res = await request(app).get('/api/terrasen');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.terrasen[0].name).toBe(validTerras.name);
  });
});

describe('POST /api/terrasen', () => {
  it('returns 404 because the route is disabled', async () => {
    const res = await request(app).post('/api/terrasen').send(validTerras);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/terrasen/:id', () => {
  it('returns a terras by UUID', async () => {
    const created = await Terras.create(validTerras);
    const uuid = created.uuid;

    const res = await request(app).get(`/api/terrasen/${uuid}`);
    expect(res.status).toBe(200);
    expect(res.body.terras.uuid).toBe(uuid);
    expect(res.body.links).toBeDefined();
  });

  it('returns 404 for a non-existent UUID', async () => {
    const res = await request(app).get('/api/terrasen/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid ID format', async () => {
    const res = await request(app).get('/api/terrasen/not-a-valid-id');
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/terrasen/:id', () => {
  it('returns 404 because the route is disabled', async () => {
    const created = await Terras.create(validTerras);
    const uuid = created.uuid;

    const updated = { ...validTerras, name: 'Updated Terras', intensity: 50 };
    const res = await request(app).put(`/api/terrasen/${uuid}`).send(updated);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/terrasen/:id', () => {
  it('returns 404 because the route is disabled', async () => {
    const created = await Terras.create(validTerras);
    const uuid = created.uuid;

    const res = await request(app).patch(`/api/terrasen/${uuid}`).send({ intensity: 30 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/terrasen/:id', () => {
  it('returns 404 because the route is disabled', async () => {
    const created = await Terras.create(validTerras);
    const uuid = created.uuid;

    const res = await request(app).delete(`/api/terrasen/${uuid}`);
    expect(res.status).toBe(404);
  });
});
