import request from 'supertest';
import { createTestApp } from './testApp.js';
import { connect, clearDatabase, closeDatabase } from './database.helper.js';
import Gent3dTile from '../models/gent3dTileModel.js';
import fs from 'fs';
import path from 'path';

const app = createTestApp();

beforeAll(async () => await connect());
afterEach(async () => {
  await clearDatabase();
  // Clean up any dummy files created in public/tiles
  const dummyFile = path.resolve('public/tiles/test_tile.glb');
  if (fs.existsSync(dummyFile)) {
    fs.unlinkSync(dummyFile);
  }
});
afterAll(async () => await closeDatabase());

describe('GLB Serving Integration Tests', () => {
  const publicTilesDir = path.resolve('public/tiles');

  beforeAll(() => {
    if (!fs.existsSync(publicTilesDir)) {
      fs.mkdirSync(publicTilesDir, { recursive: true });
    }
  });

  it('GET /api/gent3d/:vaknummer/glb returns 200 and correct content-type for valid tile', async () => {
    const vaknummer = '099_193';
    const dummyGlbPath = path.join(publicTilesDir, 'test_tile.glb');
    
    // Create dummy GLB file
    fs.writeFileSync(dummyGlbPath, 'dummy glb content');

    await Gent3dTile.create({
      vaknummer,
      xCoord: 99000,
      yCoord: 193000,
      downloadUrl: 'http://example.com',
      downloadStatus: 'done',
      glbPath: dummyGlbPath
    });

    const response = await request(app)
      .get(`/api/gent3d/${vaknummer}/glb`);

    expect(response.status).toBe(200);
    expect(response.get('Content-Type')).toBe('model/gltf-binary');
    expect(response.text).toBe('dummy glb content');
  });

  it('GET /api/gent3d/:vaknummer/glb returns 404 if tile not found', async () => {
    const response = await request(app)
      .get('/api/gent3d/non_existent/glb');

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Tile not found');
  });

  it('GET /api/gent3d/:vaknummer/glb returns 404 if GLB not processed', async () => {
    const vaknummer = '099_193';
    await Gent3dTile.create({
      vaknummer,
      xCoord: 99000,
      yCoord: 193000,
      downloadUrl: 'http://example.com',
      downloadStatus: 'pending'
      // glbPath is missing
    });

    const response = await request(app)
      .get(`/api/gent3d/${vaknummer}/glb`);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('GLB file not yet processed or found on disk');
  });

  it('GET /api/gent3d/:vaknummer/glb returns 404 if file missing from disk', async () => {
    const vaknummer = '099_193';
    await Gent3dTile.create({
      vaknummer,
      xCoord: 99000,
      yCoord: 193000,
      downloadUrl: 'http://example.com',
      downloadStatus: 'done',
      glbPath: path.join(publicTilesDir, 'non_existent.glb')
    });

    const response = await request(app)
      .get(`/api/gent3d/${vaknummer}/glb`);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('GLB file record exists but file is missing from disk');
  });

  it('GET /api/gent3d/:vaknummer/glb returns 403 for directory traversal attempt', async () => {
    const vaknummer = 'traversal_test';
    // Attempt to point to a file outside public/tiles
    const illegalPath = path.resolve('package.json');

    await Gent3dTile.create({
      vaknummer,
      xCoord: 0,
      yCoord: 0,
      downloadUrl: 'http://example.com',
      downloadStatus: 'done',
      glbPath: illegalPath
    });

    const response = await request(app)
      .get(`/api/gent3d/${vaknummer}/glb`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied');
  });
});
