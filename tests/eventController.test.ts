import { jest, describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../app.js';
import { connect, clearDatabase, closeDatabase } from './database.helper.js';
import Event from '../models/eventModel.js';
import Terras from '../models/terrasModel.js';

describe('Event Controller Logic Tests', () => {

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

  //getAllEvents returns sorted by date_start
  it('getAllEvents returns sorted by date_start', async () => {
    await Event.create([
      { uuid: 'e-late', title: 'Late Avond', date_start: new Date('2026-05-01T20:00:00Z'), date_end: new Date('2026-05-01T22:00:00Z'), address: 'Gent', location: { type: 'Point', coordinates: [3.7, 51.0] } },
      { uuid: 'e-vroeg', title: 'Vroege Vogel', date_start: new Date('2026-05-01T08:00:00Z'), date_end: new Date('2026-05-01T10:00:00Z'), address: 'Gent', location: { type: 'Point', coordinates: [3.7, 51.0] } }
    ]);

    const response = await request(app)
      .get('/api/events')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    const data = response.body.events; 
    
    expect(data).toBeDefined();
    expect(data[0].title).toBe('Vroege Vogel');
    expect(data[1].title).toBe('Late Avond');
  });

  //getTodaysEvents returns events overlapping with today
  it('getTodaysEvents returns events overlapping with today', async () => {
    const testDate = '2026-04-10'; 
    
    await Event.create({
      uuid: 'e-today',
      title: 'Event van Vandaag',
      date_start: new Date(`${testDate}T12:00:00Z`), 
      date_end: new Date(`${testDate}T14:00:00Z`),
      address: 'Gent',
      location: { type: 'Point', coordinates: [3.7, 51.0] }
    });

    const response = await request(app)
      .get(`/api/events/today?date=${testDate}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.events[0].title).toBe('Event van Vandaag');
  });

  //getTodaysEvents with ?date= param filters correct day
  it('getTodaysEvents with ?date= param filters correct day', async () => {
    await Event.create({
      uuid: 'e-target',
      title: 'Specifieke Dag',
      date_start: new Date('2026-06-10T12:00:00Z'),
      date_end: new Date('2026-06-10T14:00:00Z'),
      address: 'Gent',
      location: { type: 'Point', coordinates: [3.7, 51.0] }
    });

    const match = await request(app).get('/api/events/today?date=2026-06-10').set('Accept', 'application/json');
    expect(match.body.count).toBe(1);
    
    const noMatch = await request(app).get('/api/events/today?date=2026-06-11').set('Accept', 'application/json');
    expect(noMatch.body.count).toBe(0);
  });

  //getTodayEvents includes multi-day events
  it('getTodayEvents includes multi-day events (overlap check)', async () => {
    await Event.create({
      uuid: 'multi',
      title: 'Festival',
      date_start: new Date('2026-07-01T10:00:00Z'),
      date_end: new Date('2026-07-05T10:00:00Z'),
      address: 'Gent',
      location: { type: 'Point', coordinates: [3.7, 51.0] }
    });

    const response = await request(app).get('/api/events/today?date=2026-07-03').set('Accept', 'application/json');
    expect(response.body.count).toBe(1);
    expect(response.body.events[0].title).toBe('Festival');
  });

  //getEventsWithTerras attaches nearby terrassen (within 100m)
  it('getEventsWithTerras attaches nearby terrassen (within 100m)', async () => {
    await Event.create({
      uuid: 'geo-event',
      title: 'Markt Concert',
      date_start: new Date('2026-08-01T12:00:00Z'),
      date_end: new Date('2026-08-01T14:00:00Z'),
      address: 'Vrijdagmarkt',
      location: { type: 'Point', coordinates: [3.7265, 51.0535] }
    });

    await Terras.create({
      uuid: 't-near',
      name: 'Dichtbij Terras',
      address: 'Vrijdagmarkt 1',
      intensity: 50,
      location: { type: 'Point', coordinates: [3.7266, 51.0536] } // ~10m afstand
    });

    const response = await request(app).get('/api/events/with-terrasen?date=2026-08-01').set('Accept', 'application/json');
    expect(response.body.events[0].terrasen.length).toBe(1);
    expect(response.body.events[0].terrasen[0].name).toBe('Dichtbij Terras');
  });

  //getEventsWithTerras returns empty terrassen array when none nearby
  it('getEventsWithTerras returns empty terrassen array when none nearby', async () => {
    await Event.create({
      uuid: 'lonely',
      title: 'Bos Event',
      date_start: new Date('2026-09-01T12:00:00Z'),
      date_end: new Date('2026-09-01T14:00:00Z'),
      address: 'Ver weg',
      location: { type: 'Point', coordinates: [3.0, 50.0] }
    });

    const response = await request(app).get('/api/events/with-terrasen?date=2026-09-01').set('Accept', 'application/json');
    expect(response.body.events[0].terrasen.length).toBe(0);
  });
});