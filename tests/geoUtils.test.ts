import { haversineDistance, findDuplicates } from '../services/geoUtils.js';

describe('haversineDistance', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistance(51.05, 3.72, 51.05, 3.72)).toBe(0);
  });

  it('is symmetric', () => {
    const d1 = haversineDistance(51.05, 3.72, 51.06, 3.73);
    const d2 = haversineDistance(51.06, 3.73, 51.05, 3.72);
    expect(d1).toBeCloseTo(d2, 5);
  });

  it('approximates 1 degree latitude as ~111km', () => {
    const d = haversineDistance(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });

  it('returns a positive value for different points', () => {
    const d = haversineDistance(51.0, 3.7, 51.01, 3.71);
    expect(d).toBeGreaterThan(0);
  });
});

describe('findDuplicates', () => {
  it('returns empty set for empty input', () => {
    expect(findDuplicates([])).toEqual(new Set());
  });

  it('returns empty set for a single item', () => {
    const items = [{ name: 'Café A', lat: 51.05, lng: 3.72 }];
    expect(findDuplicates(items)).toEqual(new Set());
  });

  it('marks the second item as duplicate when same name within 50m', () => {
    const items = [
      { name: 'Café A', lat: 51.05, lng: 3.72 },
      { name: 'Café A', lat: 51.050001, lng: 3.720001 }, // ~1m away
    ];
    const dups = findDuplicates(items);
    expect(dups.has(0)).toBe(false);
    expect(dups.has(1)).toBe(true);
  });

  it('does not mark as duplicate when same name but more than 50m apart', () => {
    const items = [
      { name: 'Café A', lat: 51.05, lng: 3.72 },
      { name: 'Café A', lat: 51.06, lng: 3.73 }, // ~1.3km away
    ];
    expect(findDuplicates(items).size).toBe(0);
  });

  it('does not mark as duplicate when different names within 50m', () => {
    const items = [
      { name: 'Café A', lat: 51.05, lng: 3.72 },
      { name: 'Café B', lat: 51.050001, lng: 3.720001 },
    ];
    expect(findDuplicates(items).size).toBe(0);
  });

  it('is case-insensitive for name comparison', () => {
    const items = [
      { name: 'café a', lat: 51.05, lng: 3.72 },
      { name: 'CAFÉ A', lat: 51.050001, lng: 3.720001 },
    ];
    const dups = findDuplicates(items);
    expect(dups.has(1)).toBe(true);
  });

  it('keeps only the first occurrence when multiple duplicates exist', () => {
    const items = [
      { name: 'Café A', lat: 51.05, lng: 3.72 },
      { name: 'Café A', lat: 51.050001, lng: 3.720001 },
      { name: 'Café A', lat: 51.050002, lng: 3.720002 },
    ];
    const dups = findDuplicates(items);
    expect(dups.has(0)).toBe(false);
    expect(dups.has(1)).toBe(true);
    expect(dups.has(2)).toBe(true);
  });
});
