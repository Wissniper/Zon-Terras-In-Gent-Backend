import { docToTriples } from '../services/rdfExporter';

describe('docToTriples', () => {
  describe('terras', () => {
    const terrasDoc = {
      uuid: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Café de Zon',
      address: 'Korenmarkt 1, Gent',
      description: 'A sunny terrace',
      osmUri: 'https://www.openstreetmap.org/node/12345',
      intensity: 85,
      location: { type: 'Point', coordinates: [3.72, 51.05] },
    };

    it('generates rdf:type triple', () => {
      const triples = docToTriples('terras', terrasDoc);
      expect(triples).toContainEqual(
        expect.stringContaining('rdf-syntax-ns#type> <http://api.sun-seeker.be/vocab#Terras>')
      );
    });

    it('generates dcterms:identifier triple', () => {
      const triples = docToTriples('terras', terrasDoc);
      expect(triples).toContainEqual(
        expect.stringContaining(`dc/terms/identifier> "${terrasDoc.uuid}"`)
      );
    });

    it('generates schema:name triple', () => {
      const triples = docToTriples('terras', terrasDoc);
      expect(triples).toContainEqual(
        expect.stringContaining('schema.org/name> "Café de Zon"')
      );
    });

    it('generates owl:sameAs triple for osmUri', () => {
      const triples = docToTriples('terras', terrasDoc);
      expect(triples).toContainEqual(
        expect.stringContaining('owl#sameAs> <https://www.openstreetmap.org/node/12345>')
      );
    });

    it('generates geometry triples as WKT', () => {
      const triples = docToTriples('terras', terrasDoc);
      const wktTriple = triples.find(t => t.includes('asWKT'));
      expect(wktTriple).toBeDefined();
      expect(wktTriple).toContain('POINT(3.72 51.05)');
    });

    it('generates intensity triple', () => {
      const triples = docToTriples('terras', terrasDoc);
      expect(triples).toContainEqual(
        expect.stringContaining('sunIntensity> "85"')
      );
    });

    it('uses correct base URI with terrasen plural', () => {
      const triples = docToTriples('terras', terrasDoc);
      expect(triples[0]).toContain('http://api.sun-seeker.be/terrasen/123e4567');
    });
  });

  describe('restaurant', () => {
    const restaurantDoc = {
      uuid: 'rest-uuid-123',
      name: 'Pizzeria Roma',
      address: 'Veldstraat 10, Gent',
      cuisine: 'Italian',
      phone: '+32 9 123 45 67',
      openingHours: 'Mo-Fr 11:00-22:00',
      location: { type: 'Point', coordinates: [3.72, 51.054] },
    };

    it('generates restaurant type triple', () => {
      const triples = docToTriples('restaurant', restaurantDoc);
      expect(triples).toContainEqual(
        expect.stringContaining('rdf-syntax-ns#type> <https://schema.org/Restaurant>')
      );
    });

    it('generates cuisine triple', () => {
      const triples = docToTriples('restaurant', restaurantDoc);
      expect(triples).toContainEqual(
        expect.stringContaining('servesCuisine> "Italian"')
      );
    });

    it('generates phone triple', () => {
      const triples = docToTriples('restaurant', restaurantDoc);
      expect(triples).toContainEqual(
        expect.stringContaining('telephone> "+32 9 123 45 67"')
      );
    });
  });

  describe('event', () => {
    const eventDoc = {
      uuid: 'event-uuid-456',
      title: 'Jazz Festival',
      address: 'Sint-Baafsplein 1, Gent',
      date_start: new Date('2026-06-01T10:00:00Z'),
      date_end: new Date('2026-06-01T18:00:00Z'),
      locationRef: 'terras-uuid-789',
      locationType: 'terras',
      location: { type: 'Point', coordinates: [3.722, 51.053] },
    };

    it('generates event type triple', () => {
      const triples = docToTriples('event', eventDoc);
      expect(triples).toContainEqual(
        expect.stringContaining('rdf-syntax-ns#type> <https://schema.org/Event>')
      );
    });

    it('generates startDate and endDate triples', () => {
      const triples = docToTriples('event', eventDoc);
      expect(triples).toContainEqual(expect.stringContaining('schema.org/startDate>'));
      expect(triples).toContainEqual(expect.stringContaining('schema.org/endDate>'));
    });

    it('generates schema:location link to venue', () => {
      const triples = docToTriples('event', eventDoc);
      expect(triples).toContainEqual(
        expect.stringContaining('schema.org/location> <http://api.sun-seeker.be/terrasen/terras-uuid-789>')
      );
    });

    it('uses schema:name for title', () => {
      const triples = docToTriples('event', eventDoc);
      expect(triples).toContainEqual(
        expect.stringContaining('schema.org/name> "Jazz Festival"')
      );
    });
  });

  describe('edge cases', () => {
    it('handles doc with minimal fields', () => {
      const triples = docToTriples('terras', { uuid: 'min-uuid' });
      expect(triples.length).toBeGreaterThan(0);
      expect(triples).toContainEqual(expect.stringContaining('rdf-syntax-ns#type'));
    });

    it('escapes quotes in string values', () => {
      const triples = docToTriples('terras', {
        uuid: 'quote-uuid',
        name: 'Café "De Zon"',
      });
      const nameTriple = triples.find(t => t.includes('schema.org/name'));
      expect(nameTriple).toContain('Café \\"De Zon\\"');
    });

    it('handles unknown entity type gracefully', () => {
      const triples = docToTriples('unknown', { uuid: 'x' });
      // Should still produce at least an identifier triple
      expect(triples).toContainEqual(expect.stringContaining('dc/terms/identifier'));
    });
  });
});
