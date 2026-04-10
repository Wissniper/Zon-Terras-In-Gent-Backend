import { jest } from '@jest/globals';
import { connect, clearDatabase, closeDatabase } from './database.helper.js';

const mockFetchSparql = jest.fn();
const mockSyncToTriplestore = jest.fn();
const mockDocToTriples = jest.fn();

jest.unstable_mockModule('../services/sparqlFetcher.js', () => ({
  fetchSparql: mockFetchSparql,
}));

jest.unstable_mockModule('../services/rdfExporter.js', () => ({
  syncToTriplestore: mockSyncToTriplestore,
  docToTriples: mockDocToTriples,
}));

const { default: Event } = await import('../models/eventModel.js');
const { default: Terras } = await import('../models/terrasModel.js');
const { syncEventData } = await import('../services/eventDataFetcher.js');

const EVENT_URI = 'https://stad.gent/id/events/1';

const validSparqlBinding = {
  event: { type: 'uri', value: EVENT_URI },
  name: { type: 'literal', value: 'Gentse Feesten' },
  startDate: { type: 'literal', value: '2026-07-15T10:00:00Z' },
  endDate: { type: 'literal', value: '2026-07-25T22:00:00Z' },
  street: { type: 'literal', value: 'Korenmarkt' },
  locality: { type: 'literal', value: 'Gent' },
  postal: { type: 'literal', value: '9000' },
  desc: { type: 'literal', value: 'Annual summer festival' },
  url: { type: 'literal', value: 'https://gentsefeesten.be' },
};

function mockGeoApi(records: Array<{ event: string; geo: { lat: number; lon: number } }>) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: records }),
  } as never) as typeof global.fetch;
}

beforeAll(async () => await connect());
afterEach(async () => {
  await clearDatabase();
  jest.clearAllMocks();
});
afterAll(async () => await closeDatabase());

beforeEach(() => {
  mockSyncToTriplestore.mockResolvedValue(undefined as never);
  mockDocToTriples.mockReturnValue([] as never);
});

describe('syncEventData', () => {
  it('creates a new event when SPARQL and geo data are both available', async () => {
    mockFetchSparql.mockResolvedValue([validSparqlBinding] as never);
    mockGeoApi([{ event: EVENT_URI, geo: { lat: 51.05, lon: 3.72 } }]);

    const result = await syncEventData();

    expect(await Event.countDocuments()).toBe(1);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('skips events that have no matching geo coordinates', async () => {
    mockFetchSparql.mockResolvedValue([validSparqlBinding] as never);
    mockGeoApi([]); // no geo for this event

    const result = await syncEventData();

    expect(await Event.countDocuments()).toBe(0);
    expect(result.parsed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('stores correct coordinates from geo data', async () => {
    mockFetchSparql.mockResolvedValue([validSparqlBinding] as never);
    mockGeoApi([{ event: EVENT_URI, geo: { lat: 51.05, lon: 3.72 } }]);

    await syncEventData();

    const doc = await Event.findOne({ eventUri: EVENT_URI });
    expect(doc!.location.coordinates[0]).toBeCloseTo(3.72);  // longitude
    expect(doc!.location.coordinates[1]).toBeCloseTo(51.05); // latitude
  });

  it('builds address from street + postal + locality', async () => {
    mockFetchSparql.mockResolvedValue([validSparqlBinding] as never);
    mockGeoApi([{ event: EVENT_URI, geo: { lat: 51.05, lon: 3.72 } }]);

    await syncEventData();

    const doc = await Event.findOne({ eventUri: EVENT_URI });
    expect(doc!.address).toBe('Korenmarkt, 9000 Gent');
  });

  it('skips bindings missing required startDate', async () => {
    const { startDate, ...noStart } = validSparqlBinding;
    mockFetchSparql.mockResolvedValue([noStart] as never);
    mockGeoApi([{ event: EVENT_URI, geo: { lat: 51.05, lon: 3.72 } }]);

    const result = await syncEventData();

    expect(result.parsed).toBe(0);
    expect(await Event.countDocuments()).toBe(0);
  });

  it('deduplicates SPARQL bindings with the same eventUri', async () => {
    mockFetchSparql.mockResolvedValue([validSparqlBinding, validSparqlBinding] as never);
    mockGeoApi([{ event: EVENT_URI, geo: { lat: 51.05, lon: 3.72 } }]);

    const result = await syncEventData();

    expect(result.parsed).toBe(1);
    expect(await Event.countDocuments()).toBe(1);
  });

  it('updates an existing event with the same eventUri', async () => {
    await Event.create({
      eventUri: EVENT_URI,
      title: 'Old Title',
      address: 'Gent',
      date_start: new Date(),
      date_end: new Date(),
      intensity: 0,
      location: { type: 'Point', coordinates: [3.72, 51.05] },
    });

    mockFetchSparql.mockResolvedValue([validSparqlBinding] as never);
    mockGeoApi([{ event: EVENT_URI, geo: { lat: 51.05, lon: 3.72 } }]);

    const result = await syncEventData();

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    const doc = await Event.findOne({ eventUri: EVENT_URI });
    expect(doc!.title).toBe('Gentse Feesten');
  });

  it('links event to a nearby terras via locationRef', async () => {
    await Terras.create({
      name: 'Nearby Terras',
      address: 'Korenmarkt',
      intensity: 0,
      location: { type: 'Point', coordinates: [3.72, 51.05] },
    });

    mockFetchSparql.mockResolvedValue([validSparqlBinding] as never);
    mockGeoApi([{ event: EVENT_URI, geo: { lat: 51.05, lon: 3.72 } }]);

    await syncEventData();

    const doc = await Event.findOne({ eventUri: EVENT_URI });
    expect(doc!.locationType).toBe('terras');
    expect(doc!.locationRef).toBeDefined();
  });

  it('returns 0 counts when SPARQL returns no bindings', async () => {
    mockFetchSparql.mockResolvedValue([] as never);
    mockGeoApi([]);

    const result = await syncEventData();

    expect(result.total).toBe(0);
    expect(result.parsed).toBe(0);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });
});
