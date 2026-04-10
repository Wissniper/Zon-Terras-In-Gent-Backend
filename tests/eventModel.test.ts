import { connect, clearDatabase, closeDatabase } from './database.helper';
import Event from '../models/eventModel';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());
    
describe('Event Model Tests', () => {
  
  const validEventData = {
    uuid: '123e4567-e89b-12d3-a456-426614174000',
    title: 'Gentse Feesten Concert',
    address: 'Sint-Baafsplein, 9000 Gent',
    date_start: new Date('2026-07-17T20:00:00Z'),
    date_end: new Date('2026-07-17T23:00:00Z'),
    location: {
      type: 'Point',
      coordinates: [3.727, 51.053]
    },
    description: 'bla bla',
    url: 'https://www.gentsefeesten.be',
    intensity: 90
  };

  //Validates required fields
  it('zou een event succesvol moeten aanmaken met alle verplichte velden', async () => {
    const event = new Event(validEventData);
    const savedEvent = await event.save();

    expect(savedEvent._id).toBeDefined();
    expect(savedEvent.uuid).toBe(validEventData.uuid);
    expect(savedEvent.title).toBe(validEventData.title);
  });

  it('zou moeten falen als verplichte velden ontbreken', async () => {
    const invalidEvent = new Event({ address: 'Gent' });
    await expect(invalidEvent.save()).rejects.toThrow();
  });

  //Rejects duplicate id (unique constraint)
  it('zou een duplicate uuid moeten weigeren', async () => {
    await new Event(validEventData).save();
    const duplicate = new Event(validEventData);
    
    await expect(duplicate.save()).rejects.toThrow();
  });

  //Optional fields save correctly
  it('zou optionele velden zoals description en url correct moeten opslaan', async () => {
    const event = new Event(validEventData);
    const savedEvent = await event.save();

    expect(savedEvent.description).toBe(validEventData.description);
    expect(savedEvent.url).toBe(validEventData.url);
  });

  //2dsphere index builds correctly
  it('zou een 2dsphere index moeten hebben op de locatie', async () => {
    const indexes = Event.schema.indexes();
    const has2dsphere = indexes.some((idx: { location: string; }[]) => idx[0].location === '2dsphere');
    expect(has2dsphere).toBe(true);
  });

  //Date indexes on date_start, date_end exist
  it('zou indexes moeten hebben op date_start en date_end', () => {
    const indexes = Event.schema.indexes();
    const indexedFields = indexes.map((idx: {}[]) => Object.keys(idx[0])).flat();
    
    expect(indexedFields).toContain('date_start');
    expect(indexedFields).toContain('date_end');
  });

  //Timestamps adds createdAt/updatedAt
  it('zou automatisch createdAt en updatedAt moeten toevoegen', async () => {
    const event = new Event(validEventData);
    const savedEvent: any = await event.save();

    expect(savedEvent.createdAt).toBeDefined();
    expect(savedEvent.updatedAt).toBeDefined();
  });
});