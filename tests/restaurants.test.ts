import request from 'supertest';
import { connect, closeDatabase, clearDatabase } from './database.helper';
import { createTestApp } from './testApp';
import Restaurant from '../models/restaurantModel';

const app = createTestApp();

const validRestaurant = {
  name: 'Pizzeria Roma',
  address: 'Veldstraat 10, 9000 Gent',
  cuisine: 'Italian',
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
    await Restaurant.create(validRestaurant);
    const res = await request(app).get('/api/restaurants');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.restaurants[0].name).toBe(validRestaurant.name);
  });
});

describe('POST /api/restaurants', () => {
  it('returns 404 because the route is disabled', async () => {
    const res = await request(app).post('/api/restaurants').send(validRestaurant);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/restaurants/:id', () => {
  it('returns a restaurant by UUID', async () => {
    const created = await Restaurant.create(validRestaurant);
    const uuid = created.uuid;

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
  it('returns 404 because the route is disabled', async () => {
    const created = await Restaurant.create(validRestaurant);
    const uuid = created.uuid;

    const updated = { ...validRestaurant, name: 'La Dolce Vita' };
    const res = await request(app).put(`/api/restaurants/${uuid}`).send(updated);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/restaurants/:id', () => {
  it('returns 404 because the route is disabled', async () => {
    const created = await Restaurant.create(validRestaurant);
    const uuid = created.uuid;

    const res = await request(app).patch(`/api/restaurants/${uuid}`).send({ intensity: 80 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/restaurants/:id', () => {
  it('returns 404 because the route is disabled', async () => {
    const created = await Restaurant.create(validRestaurant);
    const uuid = created.uuid;

    const res = await request(app).delete(`/api/restaurants/${uuid}`);
    expect(res.status).toBe(404);
  });
});
