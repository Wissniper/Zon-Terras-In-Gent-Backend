import request from 'supertest';
import { connect, closeDatabase, clearDatabase } from './database.helper';
import { createTestApp } from './testApp';
import Terras from '../models/terrasModel';
import Restaurant from '../models/restaurantModel';
import Event from '../models/eventModel';

const app = createTestApp();

const terrasA = {
  name: 'Zonnig Terras',
  address: 'Korenmarkt 1, Gent',
  location: { type: 'Point', coordinates: [3.7218, 51.0536] },
  intensity: 90,
};

const terrasB = {
  name: 'Schaduwrijk Terras',
  address: 'Vrijdagmarkt 5, Gent',
  location: { type: 'Point', coordinates: [3.724, 51.056] },
  intensity: 20,
};

const restaurant = {
  name: 'Café Italiano',
  address: 'Veldstraat 10, Gent',
  cuisine: 'Italian',
  location: { type: 'Point', coordinates: [3.7200, 51.0540] },
  intensity: 75,
};

const futureEvent = {
  title: 'Jazz Night',
  address: 'Sint-Baafsplein 1, Gent',
  date_start: '2026-06-01T20:00:00.000Z',
  date_end: '2026-06-01T23:00:00.000Z',
  location: { type: 'Point', coordinates: [3.722, 51.053] },
};

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('GET /api/search/terrasen', () => {
  it('returns all terrasen when no filters applied', async () => {
    await Terras.create(terrasA);
    await Terras.create(terrasB);

    const res = await request(app).get('/api/search/terrasen');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it('filters by name with ?q=', async () => {
    await Terras.create(terrasA);
    await Terras.create(terrasB);

    const res = await request(app).get('/api/search/terrasen?q=Zonnig');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.terrasen[0].name).toBe(terrasA.name);
  });

  it('filters to sunny only with ?sunnyOnly=true', async () => {
    await Terras.create(terrasA); // intensity 90
    await Terras.create(terrasB); // intensity 20

    const res = await request(app).get('/api/search/terrasen?sunnyOnly=true');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.terrasen[0].name).toBe(terrasA.name);
  });

  it('filters by intensity range', async () => {
    await Terras.create(terrasA); // 90
    await Terras.create(terrasB); // 20

    const res = await request(app).get('/api/search/terrasen?minIntensity=50&maxIntensity=100');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

describe('GET /api/search/restaurants', () => {
  it('returns all restaurants when no filters applied', async () => {
    await Restaurant.create(restaurant);
    const res = await request(app).get('/api/search/restaurants');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('filters by name with ?q=', async () => {
    await Restaurant.create(restaurant);
    const res = await request(app).get('/api/search/restaurants?q=Italiano');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('filters by cuisine', async () => {
    await Restaurant.create(restaurant);
    const res = await request(app).get('/api/search/restaurants?cuisine=Italian');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('returns empty when cuisine does not match', async () => {
    await Restaurant.create(restaurant);
    const res = await request(app).get('/api/search/restaurants?cuisine=Japanese');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

});

describe('GET /api/search/events', () => {
  it('returns all events when no filters applied', async () => {
    await Event.create(futureEvent);
    const res = await request(app).get('/api/search/events');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('filters events by title with ?q=', async () => {
    await Event.create(futureEvent);
    const res = await request(app).get('/api/search/events?q=Jazz');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('returns empty when title does not match', async () => {
    await Event.create(futureEvent);
    const res = await request(app).get('/api/search/events?q=Classical');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it('filters events by date', async () => {
    await Event.create(futureEvent);
    const res = await request(app).get('/api/search/events?date=2026-06-01');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

describe('GET /api/search/semantic', () => {
  it('returns 200 with empty results when no data', async () => {
    const res = await request(app).get('/api/search/semantic');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it('finds events linked to restaurants matching cuisine filter', async () => {
    const rest = await Restaurant.create(restaurant);
    const restUuid = rest.uuid;

    await Event.create({
      ...futureEvent,
      locationRef: restUuid,
      locationType: 'restaurant',
    });

    const res = await request(app).get('/api/search/semantic?cuisine=Italian');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

describe('GET /api/search/nearby/:lat/:lng/:radius', () => {
  it('returns counts for all resource types', async () => {
    await Terras.create(terrasA);
    await Restaurant.create(restaurant);

    const res = await request(app).get('/api/search/nearby/51.0536/3.7218/5');
    expect(res.status).toBe(200);
    expect(res.body.counts).toBeDefined();
    expect(res.body.data.terrasen).toBeDefined();
    expect(res.body.data.restaurants).toBeDefined();
    expect(res.body.data.events).toBeDefined();
  });

  it('returns 400 for invalid coordinates', async () => {
    const res = await request(app).get('/api/search/nearby/999/999/1');
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric radius', async () => {
    const res = await request(app).get('/api/search/nearby/51.05/3.72/abc');
    expect(res.status).toBe(400);
  });
});
