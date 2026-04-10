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

const { default: Restaurant } = await import('../models/restaurantModel.js');
const { syncRestaurantData } = await import('../services/restaurantDataFetcher.js');

const validBinding = {
  osm: { type: 'uri', value: 'https://www.openstreetmap.org/node/1' },
  name: { type: 'literal', value: 'Resto Gent' },
  geo: { type: 'literal', value: 'POINT(3.72 51.05)' },
  street: { type: 'literal', value: 'Korenmarkt' },
  housenumber: { type: 'literal', value: '5' },
  city: { type: 'literal', value: 'Gent' },
  cuisine: { type: 'literal', value: 'Belgian' },
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

describe('syncRestaurantData', () => {
  it('creates a new restaurant from a valid SPARQL binding', async () => {
    mockFetchSparql.mockResolvedValue([validBinding] as never);

    const result = await syncRestaurantData();

    expect(await Restaurant.countDocuments()).toBe(1);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('returns correct total, parsed and unique counts', async () => {
    mockFetchSparql.mockResolvedValue([validBinding] as never);

    const result = await syncRestaurantData();

    expect(result.total).toBe(1);
    expect(result.parsed).toBe(1);
    expect(result.unique).toBe(1);
  });

  it('skips bindings missing the required osm field', async () => {
    const { osm, ...noOsm } = validBinding;
    mockFetchSparql.mockResolvedValue([noOsm] as never);

    const result = await syncRestaurantData();

    expect(result.parsed).toBe(0);
    expect(await Restaurant.countDocuments()).toBe(0);
  });

  it('skips bindings with invalid WKT geometry', async () => {
    const binding = { ...validBinding, geo: { type: 'literal', value: 'INVALID_WKT' } };
    mockFetchSparql.mockResolvedValue([binding] as never);

    const result = await syncRestaurantData();

    expect(result.parsed).toBe(0);
    expect(await Restaurant.countDocuments()).toBe(0);
  });

  it('stores correct coordinates from WKT POINT(lon lat)', async () => {
    mockFetchSparql.mockResolvedValue([validBinding] as never);

    await syncRestaurantData();

    const doc = await Restaurant.findOne({ osmUri: validBinding.osm.value });
    expect(doc!.location.coordinates[0]).toBeCloseTo(3.72);  // longitude
    expect(doc!.location.coordinates[1]).toBeCloseTo(51.05); // latitude
  });

  it('builds full address from street + housenumber + city', async () => {
    mockFetchSparql.mockResolvedValue([validBinding] as never);

    await syncRestaurantData();

    const doc = await Restaurant.findOne({ osmUri: validBinding.osm.value });
    expect(doc!.address).toBe('Korenmarkt 5, Gent');
  });

  it('defaults city to Gent when city field is absent', async () => {
    const { city, ...noCity } = validBinding;
    mockFetchSparql.mockResolvedValue([noCity] as never);

    await syncRestaurantData();

    const doc = await Restaurant.findOne({ osmUri: validBinding.osm.value });
    expect(doc!.address).toContain('Gent');
  });

  it('defaults cuisine to "restaurant" when cuisine field is absent', async () => {
    const { cuisine, ...noCuisine } = validBinding;
    mockFetchSparql.mockResolvedValue([noCuisine] as never);

    await syncRestaurantData();

    const doc = await Restaurant.findOne({ osmUri: validBinding.osm.value });
    expect(doc!.cuisine).toBe('restaurant');
  });

  it('updates an existing restaurant matched by osmUri', async () => {
    await Restaurant.create({
      osmUri: validBinding.osm.value,
      name: 'Old Name',
      cuisine: 'Italian',
      address: 'Gent',
      intensity: 0,
      rating: 0,
      location: { type: 'Point', coordinates: [3.72, 51.05] },
    });

    mockFetchSparql.mockResolvedValue([validBinding] as never);

    const result = await syncRestaurantData();

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    const doc = await Restaurant.findOne({ osmUri: validBinding.osm.value });
    expect(doc!.name).toBe('Resto Gent');
  });

  it('deduplicates entries with the same name within 50m', async () => {
    const binding2 = {
      ...validBinding,
      osm: { type: 'uri', value: 'https://www.openstreetmap.org/node/2' },
      geo: { type: 'literal', value: 'POINT(3.720001 51.050001)' }, // ~1m away
    };
    mockFetchSparql.mockResolvedValue([validBinding, binding2] as never);

    const result = await syncRestaurantData();

    expect(result.duplicatesSkipped).toBe(1);
    expect(result.unique).toBe(1);
    expect(await Restaurant.countDocuments()).toBe(1);
  });

  it('does not deduplicate entries with the same name more than 50m apart', async () => {
    const binding2 = {
      ...validBinding,
      osm: { type: 'uri', value: 'https://www.openstreetmap.org/node/2' },
      geo: { type: 'literal', value: 'POINT(3.73 51.06)' }, // ~1.3km away
    };
    mockFetchSparql.mockResolvedValue([validBinding, binding2] as never);

    const result = await syncRestaurantData();

    expect(result.duplicatesSkipped).toBe(0);
    expect(await Restaurant.countDocuments()).toBe(2);
  });

  it('returns 0 counts when SPARQL returns no bindings', async () => {
    mockFetchSparql.mockResolvedValue([] as never);

    const result = await syncRestaurantData();

    expect(result.total).toBe(0);
    expect(result.parsed).toBe(0);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });
});
