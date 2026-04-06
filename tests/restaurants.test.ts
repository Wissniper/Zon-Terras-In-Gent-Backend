import request from 'supertest';
import { connect, closeDatabase, clearDatabase } from './database.helper';
import { createTestApp } from './testApp';

const app = createTestApp();

const validRestaurant = {
  name: 'Pizzeria Roma',
  address: 'Veldstraat 10, 9000 Gent',
  cuisine: 'Italian',
  rating: 4.2,
  location: { type: 'Point', coordinates: [3.72, 51.054] },
  intensity: 65,
};

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('GET /api/restaurants', () => {
  it('returns an empty list when no restaurants exist', async () => {
    const res = await request(app).get('/api/restaurants');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.restaurants).toEqual([]);
  });

  it('returns all non-deleted restaurants', async () => {
    await request(app).post('/api/restaurants').send(validRestaurant);
    const res = await request(app).get('/api/restaurants');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.restaurants[0].name).toBe(validRestaurant.name);
  });
});

describe('POST /api/restaurants', () => {
  it('creates a restaurant and returns 201', async () => {
    const res = await request(app).post('/api/restaurants').send(validRestaurant);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(validRestaurant.name);
    expect(res.body.uuid).toBeDefined();
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app).post('/api/restaurants').send({ name: 'Incomplete' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when rating is out of range', async () => {
    const res = await request(app)
      .post('/api/restaurants')
      .send({ ...validRestaurant, rating: 6 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/restaurants/:id', () => {
  it('returns a restaurant by UUID', async () => {
    const created = await request(app).post('/api/restaurants').send(validRestaurant);
    const uuid = created.body.uuid;

    const res = await request(app).get(`/api/restaurants/${uuid}`);
    expect(res.status).toBe(200);
    expect(res.body.restaurant.uuid).toBe(uuid);
    expect(res.body.restaurant.cuisine).toBe(validRestaurant.cuisine);
  });

  it('returns 404 for a non-existent UUID', async () => {
    const res = await request(app).get('/api/restaurants/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid ID format', async () => {
    const res = await request(app).get('/api/restaurants/not-a-valid-id');
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/restaurants/:id', () => {
  it('fully replaces a restaurant', async () => {
    const created = await request(app).post('/api/restaurants').send(validRestaurant);
    const uuid = created.body.uuid;

    const updated = { ...validRestaurant, name: 'La Dolce Vita', rating: 5 };
    const res = await request(app).put(`/api/restaurants/${uuid}`).send(updated);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('La Dolce Vita');
    expect(res.body.rating).toBe(5);
  });

  it('returns 404 when updating a non-existent restaurant', async () => {
    const res = await request(app)
      .put('/api/restaurants/00000000-0000-4000-8000-000000000000')
      .send(validRestaurant);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/restaurants/:id', () => {
  it('partially updates a restaurant', async () => {
    const created = await request(app).post('/api/restaurants').send(validRestaurant);
    const uuid = created.body.uuid;

    const res = await request(app).patch(`/api/restaurants/${uuid}`).send({ rating: 3.5 });
    expect(res.status).toBe(200);
    expect(res.body.rating).toBe(3.5);
    expect(res.body.cuisine).toBe(validRestaurant.cuisine);
  });

  it('returns 404 when patching a non-existent restaurant', async () => {
    const res = await request(app)
      .patch('/api/restaurants/00000000-0000-4000-8000-000000000000')
      .send({ rating: 3 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/restaurants/:id', () => {
  it('soft-deletes a restaurant', async () => {
    const created = await request(app).post('/api/restaurants').send(validRestaurant);
    const uuid = created.body.uuid;

    const deleteRes = await request(app).delete(`/api/restaurants/${uuid}`);
    expect(deleteRes.status).toBe(200);

    const listRes = await request(app).get('/api/restaurants');
    expect(listRes.body.count).toBe(0);
  });

  it('returns 404 when deleting an already-deleted restaurant', async () => {
    const created = await request(app).post('/api/restaurants').send(validRestaurant);
    const uuid = created.body.uuid;

    await request(app).delete(`/api/restaurants/${uuid}`);
    const res = await request(app).delete(`/api/restaurants/${uuid}`);
    expect(res.status).toBe(404);
  });
});
