import { calculateSunData } from '../services/sunService';

describe('calculateSunData', () => {
  const ghentLat = 51.0536;
  const ghentLng = 3.7218;

  it('returns all expected fields', () => {
    const result = calculateSunData(new Date('2026-06-21T12:00:00Z'), ghentLat, ghentLng);
    expect(result).toHaveProperty('position');
    expect(result).toHaveProperty('times');
    expect(result).toHaveProperty('intensity');
    expect(result).toHaveProperty('cloudFactor');
    expect(result).toHaveProperty('goldenHour');
    expect(result.position).toHaveProperty('azimuth');
    expect(result.position).toHaveProperty('altitude');
  });

  it('returns high intensity at solar noon in summer', () => {
    const result = calculateSunData(new Date('2026-06-21T12:00:00Z'), ghentLat, ghentLng);
    expect(result.intensity).toBeGreaterThan(50);
  });

  it('returns 0 intensity at night', () => {
    const result = calculateSunData(new Date('2026-06-21T02:00:00Z'), ghentLat, ghentLng);
    expect(result.intensity).toBe(0);
  });

  it('returns cloudFactor as null when not provided', () => {
    const result = calculateSunData(new Date('2026-06-21T12:00:00Z'), ghentLat, ghentLng);
    expect(result.cloudFactor).toBeNull();
  });

  it('reduces intensity with cloud factor', () => {
    const clear = calculateSunData(new Date('2026-06-21T12:00:00Z'), ghentLat, ghentLng);
    const cloudy = calculateSunData(new Date('2026-06-21T12:00:00Z'), ghentLat, ghentLng, 80);
    expect(cloudy.intensity).toBeLessThan(clear.intensity);
    expect(cloudy.cloudFactor).toBe(80);
  });

  it('returns golden hour times', () => {
    const result = calculateSunData(new Date('2026-06-21T12:00:00Z'), ghentLat, ghentLng);
    expect(result.goldenHour.dawnStart).toBeDefined();
    expect(result.goldenHour.dawnEnd).toBeDefined();
    expect(result.goldenHour.duskStart).toBeDefined();
    expect(result.goldenHour.duskEnd).toBeDefined();
  });

  it('clamps intensity between 0 and 100', () => {
    // Test with a full cloud factor to ensure minimum clamping
    const result = calculateSunData(new Date('2026-06-21T12:00:00Z'), ghentLat, ghentLng, 100);
    expect(result.intensity).toBeGreaterThanOrEqual(0);
    expect(result.intensity).toBeLessThanOrEqual(100);
  });

  it('works for different locations', () => {
    // Equator at noon should have very high intensity
    const equator = calculateSunData(new Date('2026-03-21T12:00:00Z'), 0, 0);
    expect(equator.intensity).toBeGreaterThan(0);
  });
});
