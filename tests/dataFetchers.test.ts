import { jest, describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';

// Mock external dependencies before importing the modules under test
jest.unstable_mockModule('../services/sparqlFetcher', () => ({
  fetchSparql: jest.fn<any>().mockResolvedValue([]),
}));

jest.unstable_mockModule('../services/rdfExporter', () => ({
  docToTriples: jest.fn<any>().mockReturnValue([]),
  syncToTriplestore: jest.fn<any>().mockResolvedValue(undefined),
}));

// Mock global fetch for event fetcher's REST API calls
const mockFetch = jest.fn<any>().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ results: [] }),
});
globalThis.fetch = mockFetch as any;

const { connect, closeDatabase, clearDatabase } = await import('./database.helper');
const { fetchSparql } = await import('../services/sparqlFetcher');
const { syncTerrasData } = await import('../services/terrasDataFetcher');
const { syncRestaurantData } = await import('../services/restaurantDataFetcher');
const { syncEventData } = await import('../services/eventDataFetcher');

beforeAll(async () => await connect());
afterEach(async () => {
  await clearDatabase();
  jest.clearAllMocks();
});
afterAll(async () => await closeDatabase());

describe('syncTerrasData', () => {
  it('returns zeros when SPARQL returns no bindings', async () => {
    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([]);
    const result = await syncTerrasData();
    expect(result.total).toBe(0);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });

  it('parses and upserts valid SPARQL bindings', async () => {
    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([
      {
        osm: { type: 'uri', value: 'https://osm.org/node/111' },
        name: { type: 'literal', value: 'Café Central' },
        geo: { type: 'literal', value: 'POINT(3.7218 51.0536)' },
        street: { type: 'literal', value: 'Korenmarkt' },
        housenumber: { type: 'literal', value: '1' },
        city: { type: 'literal', value: 'Gent' },
      },
    ]);

    const result = await syncTerrasData();
    expect(result.total).toBe(1);
    expect(result.parsed).toBe(1);
    expect(result.created).toBe(1);
  });

  it('skips bindings with missing required fields', async () => {
    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([
      { osm: { type: 'uri', value: 'https://osm.org/node/222' } },
      { name: { type: 'literal', value: 'No Geo' } },
    ]);

    const result = await syncTerrasData();
    expect(result.total).toBe(2);
    expect(result.parsed).toBe(0);
    expect(result.created).toBe(0);
  });

  it('skips bindings with invalid WKT geometry', async () => {
    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([
      {
        osm: { type: 'uri', value: 'https://osm.org/node/333' },
        name: { type: 'literal', value: 'Bad Geo Café' },
        geo: { type: 'literal', value: 'INVALID_WKT' },
      },
    ]);

    const result = await syncTerrasData();
    expect(result.parsed).toBe(0);
  });

  it('deduplicates items with same name within 50m', async () => {
    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([
      {
        osm: { type: 'uri', value: 'https://osm.org/node/444' },
        name: { type: 'literal', value: 'Café Duplicate' },
        geo: { type: 'literal', value: 'POINT(3.7218 51.0536)' },
      },
      {
        osm: { type: 'uri', value: 'https://osm.org/node/445' },
        name: { type: 'literal', value: 'Café Duplicate' },
        geo: { type: 'literal', value: 'POINT(3.7219 51.0536)' },
      },
    ]);

    const result = await syncTerrasData();
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.unique).toBe(1);
    expect(result.created).toBe(1);
  });

  it('updates existing terras on re-run (idempotent)', async () => {
    const binding = {
      osm: { type: 'uri', value: 'https://osm.org/node/555' },
      name: { type: 'literal', value: 'Stable Café' },
      geo: { type: 'literal', value: 'POINT(3.7218 51.0536)' },
    };

    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([binding]);
    const first = await syncTerrasData();
    expect(first.created).toBe(1);

    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([
      { ...binding, name: { type: 'literal', value: 'Updated Café' } },
    ]);
    const second = await syncTerrasData();
    expect(second.updated).toBe(1);
    expect(second.created).toBe(0);
  });
});

describe('syncRestaurantData', () => {
  it('returns zeros when SPARQL returns no bindings', async () => {
    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([]);
    const result = await syncRestaurantData();
    expect(result.total).toBe(0);
    expect(result.created).toBe(0);
  });

  it('parses and upserts valid restaurant bindings', async () => {
    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([
      {
        osm: { type: 'uri', value: 'https://osm.org/node/666' },
        name: { type: 'literal', value: 'Pizzeria Roma' },
        geo: { type: 'literal', value: 'POINT(3.72 51.054)' },
        cuisine: { type: 'literal', value: 'Italian' },
        phone: { type: 'literal', value: '+32 9 123' },
      },
    ]);

    const result = await syncRestaurantData();
    expect(result.created).toBe(1);
    expect(result.parsed).toBe(1);
  });

  it('defaults cuisine to "restaurant" when not provided', async () => {
    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([
      {
        osm: { type: 'uri', value: 'https://osm.org/node/777' },
        name: { type: 'literal', value: 'No Cuisine Place' },
        geo: { type: 'literal', value: 'POINT(3.72 51.054)' },
      },
    ]);

    const result = await syncRestaurantData();
    expect(result.created).toBe(1);
  });

  it('builds address from street, housenumber, and city', async () => {
    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([
      {
        osm: { type: 'uri', value: 'https://osm.org/node/888' },
        name: { type: 'literal', value: 'Address Test' },
        geo: { type: 'literal', value: 'POINT(3.72 51.054)' },
        street: { type: 'literal', value: 'Veldstraat' },
        housenumber: { type: 'literal', value: '10' },
        city: { type: 'literal', value: 'Gent' },
      },
    ]);

    const result = await syncRestaurantData();
    expect(result.created).toBe(1);
  });
});

describe('syncEventData', () => {
  it('returns zeros when SPARQL and REST API return no data', async () => {
    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    const result = await syncEventData();
    expect(result.total).toBe(0);
    expect(result.created).toBe(0);
  });

  it('parses events with matching geo data', async () => {
    const eventUri = 'https://stad.gent/events/1';

    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([
      {
        event: { type: 'uri', value: eventUri },
        name: { type: 'literal', value: 'Jazz Night' },
        startDate: { type: 'literal', value: '2026-06-01T20:00:00Z' },
        endDate: { type: 'literal', value: '2026-06-01T23:00:00Z' },
        street: { type: 'literal', value: 'Sint-Baafsplein' },
        locality: { type: 'literal', value: 'Gent' },
        postal: { type: 'literal', value: '9000' },
      },
    ]);

    // Mock the REST API geo response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [{ event: eventUri, geo: { lat: 51.053, lon: 3.722 } }],
      }),
    });

    const result = await syncEventData();
    expect(result.parsed).toBe(1);
    expect(result.created).toBe(1);
  });

  it('skips events without geo coordinates', async () => {
    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([
      {
        event: { type: 'uri', value: 'https://stad.gent/events/nogeo' },
        name: { type: 'literal', value: 'No Geo Event' },
        startDate: { type: 'literal', value: '2026-06-01T20:00:00Z' },
        endDate: { type: 'literal', value: '2026-06-01T23:00:00Z' },
        street: { type: 'literal', value: 'Somewhere' },
        locality: { type: 'literal', value: 'Gent' },
        postal: { type: 'literal', value: '9000' },
      },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    const result = await syncEventData();
    expect(result.parsed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips events with invalid dates', async () => {
    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([
      {
        event: { type: 'uri', value: 'https://stad.gent/events/baddate' },
        name: { type: 'literal', value: 'Bad Date Event' },
        startDate: { type: 'literal', value: 'not-a-date' },
        endDate: { type: 'literal', value: '2026-06-01T23:00:00Z' },
        street: { type: 'literal', value: 'Somewhere' },
        locality: { type: 'literal', value: 'Gent' },
        postal: { type: 'literal', value: '9000' },
      },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [{ event: 'https://stad.gent/events/baddate', geo: { lat: 51.05, lon: 3.72 } }],
      }),
    });

    const result = await syncEventData();
    expect(result.parsed).toBe(0);
  });

  it('deduplicates events by eventUri', async () => {
    const eventUri = 'https://stad.gent/events/dup';

    (fetchSparql as jest.Mock<any>).mockResolvedValueOnce([
      {
        event: { type: 'uri', value: eventUri },
        name: { type: 'literal', value: 'Dup Event' },
        startDate: { type: 'literal', value: '2026-06-01T20:00:00Z' },
        endDate: { type: 'literal', value: '2026-06-01T23:00:00Z' },
        street: { type: 'literal', value: 'Street' },
        locality: { type: 'literal', value: 'Gent' },
        postal: { type: 'literal', value: '9000' },
      },
      {
        event: { type: 'uri', value: eventUri },
        name: { type: 'literal', value: 'Dup Event' },
        startDate: { type: 'literal', value: '2026-06-01T20:00:00Z' },
        endDate: { type: 'literal', value: '2026-06-01T23:00:00Z' },
        street: { type: 'literal', value: 'Street' },
        locality: { type: 'literal', value: 'Gent' },
        postal: { type: 'literal', value: '9000' },
      },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [{ event: eventUri, geo: { lat: 51.053, lon: 3.722 } }],
      }),
    });

    const result = await syncEventData();
    expect(result.parsed).toBe(1);
    expect(result.created).toBe(1);
  });
});
