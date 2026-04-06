import { haversineDistance, findDuplicates } from '../services/geoUtils';

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    const d = haversineDistance(51.05, 3.72, 51.05, 3.72);
    expect(d).toBe(0);
  });

  it('calculates a known distance between two cities', () => {
    // Brussels (50.85, 4.35) to Ghent (51.05, 3.72) ≈ 50-55 km
    const d = haversineDistance(50.85, 4.35, 51.05, 3.72);
    expect(d).toBeGreaterThan(45000);
    expect(d).toBeLessThan(60000);
  });

  it('returns a small distance for nearby points', () => {
    // Two points ~100m apart on Korenmarkt
    const d = haversineDistance(51.0536, 3.7218, 51.0537, 3.7230);
    expect(d).toBeGreaterThan(50);
    expect(d).toBeLessThan(200);
  });

  it('is symmetric', () => {
    const d1 = haversineDistance(51.05, 3.72, 50.85, 4.35);
    const d2 = haversineDistance(50.85, 4.35, 51.05, 3.72);
    expect(d1).toBeCloseTo(d2, 5);
  });
});

describe('findDuplicates', () => {
  it('returns empty set when no duplicates', () => {
    const items = [
      { name: 'Café A', lat: 51.05, lng: 3.72 },
      { name: 'Café B', lat: 51.06, lng: 3.73 },
    ];
    const dupes = findDuplicates(items);
    expect(dupes.size).toBe(0);
  });

  it('marks same-name items within 50m as duplicates', () => {
    const items = [
      { name: 'Café De Zon', lat: 51.0536, lng: 3.7218 },
      { name: 'Café De Zon', lat: 51.0536, lng: 3.7219 }, // ~0.7m away
    ];
    const dupes = findDuplicates(items);
    expect(dupes.size).toBe(1);
    expect(dupes.has(1)).toBe(true);
  });

  it('does not mark same-name items far apart as duplicates', () => {
    const items = [
      { name: 'Café De Zon', lat: 51.05, lng: 3.72 },
      { name: 'Café De Zon', lat: 51.06, lng: 3.73 }, // ~1.3km away
    ];
    const dupes = findDuplicates(items);
    expect(dupes.size).toBe(0);
  });

  it('is case-insensitive on name matching', () => {
    const items = [
      { name: 'Café De Zon', lat: 51.0536, lng: 3.7218 },
      { name: 'café de zon', lat: 51.0536, lng: 3.7219 },
    ];
    const dupes = findDuplicates(items);
    expect(dupes.size).toBe(1);
  });

  it('does not mark different-name items nearby as duplicates', () => {
    const items = [
      { name: 'Café A', lat: 51.0536, lng: 3.7218 },
      { name: 'Café B', lat: 51.0536, lng: 3.7219 },
    ];
    const dupes = findDuplicates(items);
    expect(dupes.size).toBe(0);
  });

  it('returns empty set for empty input', () => {
    const dupes = findDuplicates([]);
    expect(dupes.size).toBe(0);
  });

  it('handles multiple duplicates of the same item', () => {
    const items = [
      { name: 'Café De Zon', lat: 51.0536, lng: 3.7218 },
      { name: 'Café De Zon', lat: 51.0536, lng: 3.7218 },
      { name: 'Café De Zon', lat: 51.0536, lng: 3.7218 },
    ];
    const dupes = findDuplicates(items);
    // First item kept, indices 1 and 2 are duplicates
    expect(dupes.size).toBe(2);
    expect(dupes.has(0)).toBe(false);
    expect(dupes.has(1)).toBe(true);
    expect(dupes.has(2)).toBe(true);
  });
});
