import request from 'supertest';
import { connect, closeDatabase, clearDatabase } from './database.helper';
import { createTestApp } from './testApp';

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
    await request(app).post('/api/terrasen').send(validTerras);
    const res = await request(app).get('/api/terrasen');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.terrasen[0].name).toBe(validTerras.name);
  });
});

describe('POST /api/terrasen', () => {
  it('creates a new terras and returns 201', async () => {
    const res = await request(app).post('/api/terrasen').send(validTerras);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(validTerras.name);
    expect(res.body.uuid).toBeDefined();
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app).post('/api/terrasen').send({ name: 'Missing fields' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/terrasen/:id', () => {
  it('returns a terras by UUID', async () => {
    const created = await request(app).post('/api/terrasen').send(validTerras);
    const uuid = created.body.uuid;

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
  it('fully replaces a terras', async () => {
    const created = await request(app).post('/api/terrasen').send(validTerras);
    const uuid = created.body.uuid;

    const updated = { ...validTerras, name: 'Updated Terras', intensity: 50 };
    const res = await request(app).put(`/api/terrasen/${uuid}`).send(updated);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Terras');
    expect(res.body.intensity).toBe(50);
  });

  it('returns 404 when updating a non-existent terras', async () => {
    const res = await request(app)
      .put('/api/terrasen/00000000-0000-4000-8000-000000000000')
      .send(validTerras);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/terrasen/:id', () => {
  it('partially updates a terras', async () => {
    const created = await request(app).post('/api/terrasen').send(validTerras);
    const uuid = created.body.uuid;

    const res = await request(app).patch(`/api/terrasen/${uuid}`).send({ intensity: 30 });
    expect(res.status).toBe(200);
    expect(res.body.intensity).toBe(30);
    expect(res.body.name).toBe(validTerras.name);
  });

  it('returns 404 when patching a non-existent terras', async () => {
    const res = await request(app)
      .patch('/api/terrasen/00000000-0000-4000-8000-000000000000')
      .send({ intensity: 30 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/terrasen/:id', () => {
  it('soft-deletes a terras', async () => {
    const created = await request(app).post('/api/terrasen').send(validTerras);
    const uuid = created.body.uuid;

    const deleteRes = await request(app).delete(`/api/terrasen/${uuid}`);
    expect(deleteRes.status).toBe(200);

    // Should no longer appear in the list
    const listRes = await request(app).get('/api/terrasen');
    expect(listRes.body.count).toBe(0);
  });

  it('returns 404 when deleting an already-deleted terras', async () => {
    const created = await request(app).post('/api/terrasen').send(validTerras);
    const uuid = created.body.uuid;

    await request(app).delete(`/api/terrasen/${uuid}`);
    const res = await request(app).delete(`/api/terrasen/${uuid}`);
    expect(res.status).toBe(404);
  });
});
