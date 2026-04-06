import { connect, closeDatabase, clearDatabase } from './database.helper';
import Terras from '../models/terrasModel';
import Restaurant from '../models/restaurantModel';
import Event from '../models/eventModel';
import { docToTriples } from '../services/rdfExporter';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('Semantic Graph Relationships', () => {
  it('should create a Terras with a UUID and osmUri', async () => {
    const terras = new Terras({
      name: "Café Den Turk",
      address: "Botermarkt 1, 9000 Gent",
      location: { type: "Point", coordinates: [3.72, 51.05] },
      intensity: 85,
      osmUri: "https://www.openstreetmap.org/node/12345"
    });
    const saved = await terras.save();
    expect(saved.uuid).toBeDefined();
    expect(saved.osmUri).toBe("https://www.openstreetmap.org/node/12345");
  });

  it('should link an Event to a Terras via locationRef', async () => {
    const terras = await Terras.create({
      name: "Sunny Terrace",
      address: "Korenmarkt",
      location: { type: "Point", coordinates: [3.72, 51.05] },
      intensity: 90
    });

    const event = await Event.create({
      title: "Jazz on the Terrace",
      address: "Korenmarkt",
      date_start: new Date(),
      date_end: new Date(),
      location: { type: "Point", coordinates: [3.72, 51.05] },
      locationRef: terras.uuid,
      locationType: "terras"
    });

    expect(event.locationRef).toBe(terras.uuid);
    expect(event.locationType).toBe("terras");
  });

  it('should generate correct RDF triples for an Event with locationRef', () => {
    const mockEvent = {
      uuid: "event-123",
      title: "Semantic Party",
      locationRef: "terras-456",
      locationType: "terras",
      date_start: "2026-04-05T12:00:00Z"
    };

    const triples = docToTriples('event', mockEvent);
    const locationTriple = triples.find(t => t.includes('https://schema.org/location'));
    
    expect(locationTriple).toContain('<http://api.sun-seeker.be/events/event-123>');
    expect(locationTriple).toContain('<https://schema.org/location>');
    expect(locationTriple).toContain('<http://api.sun-seeker.be/terrasen/terras-456>');
  });

  it('should include osmUri as owl:sameAs in RDF triples', () => {
    const mockRestaurant = {
      uuid: "rest-789",
      name: "Pasta Place",
      osmUri: "https://www.openstreetmap.org/node/999"
    };

    const triples = docToTriples('restaurant', mockRestaurant);
    const sameAsTriple = triples.find(t => t.includes('http://www.w3.org/2002/07/owl#sameAs'));
    
    expect(sameAsTriple).toContain('<http://api.sun-seeker.be/restaurants/rest-789>');
    expect(sameAsTriple).toContain('<http://www.w3.org/2002/07/owl#sameAs>');
    expect(sameAsTriple).toContain('<https://www.openstreetmap.org/node/999>');
  });
});
