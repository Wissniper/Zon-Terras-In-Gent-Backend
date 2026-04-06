import request from 'supertest';
import app from '../app.js';
import { connect, clearDatabase, closeDatabase } from './database.helper.js';
import Terras from '../models/terrasModel.js';
import mongoose from 'mongoose';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('Terras Controller Logic Tests (#73)', () => {

//getAllTerrasen filters by ?intensity=
  it('getAllTerrasen filters by ?intensity=', async () => {
    await Terras.create([
      { uuid: 't-high', name: 'Zonnig', intensity: 80, address: 'Gent', location: { type: 'Point', coordinates: [3.7, 51.0] } },
      { uuid: 't-low', name: 'Schaduw', intensity: 20, address: 'Gent', location: { type: 'Point', coordinates: [3.7, 51.0] } }
    ]);

    const response = await request(app)
      .get('/api/terrasen?intensity=80')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);

    const data = response.body.terrasen;
    expect(data.length).toBe(1);
    expect(data[0].intensity).toBe(80);
  });

//getTerrasById returns 404 for unknown ID
  it('getTerrasById returns 404 for unknown ID', async () => {
    
    const nonExistentUuid = '550e8400-e29b-41d4-a716-446655440000';
    
    const response = await request(app)
        .get(`/api/terrasen/${nonExistentUuid}`)
        .set('Accept', 'application/json');

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Terras not found");
  });

//getTerrasById returns 200 for existing UUID

it('getTerrasById returns the correct terras for a valid UUID', async () => {
 
  const validUuid = '77f1680b-222a-463e-b83c-1f55811c76f6';

  await Terras.create({ 
    uuid: validUuid, 
    name: 'Mijn Terras', 
    intensity: 50, 
    address: 'Gent', 
    location: { type: 'Point', coordinates: [3.7, 51.0] } 
  });

  const response = await request(app)
    .get(`/api/terrasen/${validUuid}`)
    .set('Accept', 'application/json');

  expect(response.status).toBe(200);
  
  const terrasData = response.body.terras || response.body;
  expect(terrasData.name).toBe('Mijn Terras');
});
});