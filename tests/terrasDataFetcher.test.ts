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

const { default: Terras } = await import('../models/terrasModel.js');
const { syncTerrasData } = await import('../services/terrasDataFetcher.js');

const validBinding = {
  osm: { type: 'uri', value: 'https://www.openstreetmap.org/node/10' },
  name: { type: 'literal', value: 'Café Den Turk' },
  geo: { type: 'literal', value: 'POINT(3.72 51.05)' },
  street: { type: 'literal', value: 'Botermarkt' },
  housenumber: { type: 'literal', value: '1' },
  city: { type: 'literal', value: 'Gent' },
  description: { type: 'literal', value: 'A classic Ghent café' },
  website: { type: 'literal', value: 'https://denturk.be' },
};

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

describe('syncTerrasData', () => {
  it('creates a new terras from a valid SPARQL binding', async () => {
    mockFetchSparql.mockResolvedValue([validBinding] as never);

    const result = await syncTerrasData();

    expect(await Terras.countDocuments()).toBe(1);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('returns correct total, parsed and unique counts', async () => {
    mockFetchSparql.mockResolvedValue([validBinding] as never);

    const result = await syncTerrasData();

    expect(result.total).toBe(1);
    expect(result.parsed).toBe(1);
    expect(result.unique).toBe(1);
  });

  it('skips bindings missing the required osm field', async () => {
    const { osm, ...noOsm } = validBinding;
    mockFetchSparql.mockResolvedValue([noOsm] as never);

    const result = await syncTerrasData();

    expect(result.parsed).toBe(0);
    expect(await Terras.countDocuments()).toBe(0);
  });

  it('skips bindings with invalid WKT geometry', async () => {
    const binding = { ...validBinding, geo: { type: 'literal', value: 'NOT_A_POINT' } };
    mockFetchSparql.mockResolvedValue([binding] as never);

    const result = await syncTerrasData();

    expect(result.parsed).toBe(0);
    expect(await Terras.countDocuments()).toBe(0);
  });

  it('stores correct coordinates from WKT POINT(lon lat)', async () => {
    mockFetchSparql.mockResolvedValue([validBinding] as never);

    await syncTerrasData();

    const doc = await Terras.findOne({ osmUri: validBinding.osm.value });
    expect(doc!.location.coordinates[0]).toBeCloseTo(3.72);  // longitude
    expect(doc!.location.coordinates[1]).toBeCloseTo(51.05); // latitude
  });

  it('builds full address from street + housenumber + city', async () => {
    mockFetchSparql.mockResolvedValue([validBinding] as never);

    await syncTerrasData();

    const doc = await Terras.findOne({ osmUri: validBinding.osm.value });
    expect(doc!.address).toBe('Botermarkt 1, Gent');
  });

  it('defaults city to Gent when city field is absent', async () => {
    const { city, ...noCity } = validBinding;
    mockFetchSparql.mockResolvedValue([noCity] as never);

    await syncTerrasData();

    const doc = await Terras.findOne({ osmUri: validBinding.osm.value });
    expect(doc!.address).toContain('Gent');
  });

  it('defaults url to empty string when website is absent', async () => {
    const { website, ...noWebsite } = validBinding;
    mockFetchSparql.mockResolvedValue([noWebsite] as never);

    await syncTerrasData();

    const doc = await Terras.findOne({ osmUri: validBinding.osm.value });
    expect(doc!.url).toBe('');
  });

  it('updates an existing terras matched by osmUri', async () => {
    await Terras.create({
      osmUri: validBinding.osm.value,
      name: 'Old Name',
      address: 'Gent',
      intensity: 0,
      location: { type: 'Point', coordinates: [3.72, 51.05] },
    });

    mockFetchSparql.mockResolvedValue([validBinding] as never);

    const result = await syncTerrasData();

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    const doc = await Terras.findOne({ osmUri: validBinding.osm.value });
    expect(doc!.name).toBe('Café Den Turk');
  });

  it('deduplicates entries with the same name within 50m', async () => {
    const binding2 = {
      ...validBinding,
      osm: { type: 'uri', value: 'https://www.openstreetmap.org/node/11' },
      geo: { type: 'literal', value: 'POINT(3.720001 51.050001)' }, // ~1m away
    };
    mockFetchSparql.mockResolvedValue([validBinding, binding2] as never);

    const result = await syncTerrasData();

    expect(result.duplicatesSkipped).toBe(1);
    expect(result.unique).toBe(1);
    expect(await Terras.countDocuments()).toBe(1);
  });

  it('returns 0 counts when SPARQL returns no bindings', async () => {
    mockFetchSparql.mockResolvedValue([] as never);

    const result = await syncTerrasData();

    expect(result.total).toBe(0);
    expect(result.parsed).toBe(0);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });
});
