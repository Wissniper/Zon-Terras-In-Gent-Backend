import { jest, describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connect, clearDatabase, closeDatabase } from './database.helper';
import SunData from '../models/sunDataModel';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('Sun Data Model Tests', () => {


  const validSunData = {
    locationRef: new mongoose.Types.ObjectId(),
    locationType: 'Terras',
    dateTime: new Date('2026-06-21T12:00:00Z'),
    intensity: 85,
    azimuth: 3.14,
    altitude: 1.2,
    goldenHour: {
      dawnStart: new Date('2026-06-21T05:00:00Z'),
      dawnEnd: new Date('2026-06-21T06:00:00Z'),
      duskStart: new Date('2026-06-21T21:00:00Z'),
      duskEnd: new Date('2026-06-21T22:00:00Z')
    }
  };

  //Validates required fields
  it('zou sunData succesvol moeten aanmaken met alle verplichte velden', async () => {
    const sunData = new SunData(validSunData);
    const savedData = await sunData.save();

    expect(savedData._id).toBeDefined();
    expect(savedData.locationType).toBe('Terras');
  });

  it('zou moeten falen als een verplicht veld ontbreekt', async () => {
    const { intensity, ...incompleteData } = validSunData;
    const invalidSunData = new SunData(incompleteData);
    await expect(invalidSunData.save()).rejects.toThrow();
  });

  //intensity respects min: 0, max: 100
  it('zou moeten falen als intensity buiten het bereik 0-100 valt', async () => {
    const tooHigh = new SunData({ ...validSunData, intensity: 101 });
    const tooLow = new SunData({ ...validSunData, intensity: -1 });
    
    await expect(tooHigh.save()).rejects.toThrow();
    await expect(tooLow.save()).rejects.toThrow();
  });

  //locationType only accepts "Terras", "Restaurant", "Event"
  it('zou moeten falen bij een ongeldig locationType', async () => {
    const invalidType = new SunData({ ...validSunData, locationType: 'Park' });
    await expect(invalidType.save()).rejects.toThrow();
  });

  //Unique compound index on (locationRef, locationType, dateTime)
  it('zou een fout moeten geven bij een duplicaat van de compound sleutel', async () => {
    await new SunData(validSunData).save();
    const duplicate = new SunData(validSunData);
   
    await expect(duplicate.save()).rejects.toThrow();
  });

  //Polymorphic refPath resolves correctly
  it('zou de refPath correct moeten configureren', () => {
    const path: any = SunData.schema.path('locationRef');
    expect(path.options.refPath).toBe('locationType');
  });

  //Timestamps check
  it('zou automatisch createdAt en updatedAt moeten toevoegen', async () => {
    const sunData = new SunData(validSunData);
    const savedData: any = await sunData.save();

    expect(savedData.createdAt).toBeDefined();
    expect(savedData.updatedAt).toBeDefined();
  });
});