import { connect, clearDatabase, closeDatabase } from './database.helper';
import  Terras  from '../models/terrasModel';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('Terras Model Tests', () => {
  
  const validTerrasData = {
    name: 'Terras Gent Zuid',
    address: 'Woodrow Wilsonplein 1, 9000 Gent',
    uuid: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', //uuid string
    location: { 
      type: 'Point', 
      coordinates: [3.731, 51.047] 
    },
    intensity: 70
  };

//Test verplichte velden
    it('zou een terras succesvol moeten aanmaken met alle verplichte velden', async () => {
        const terras = new Terras(validTerrasData);
        const savedTerras = await terras.save();
        
        expect(savedTerras._id).toBeDefined();
        expect(savedTerras.uuid).toBe(validTerrasData.uuid);
        expect(savedTerras.name).toBe(validTerrasData.name);
    });

    it('zou moeten falen als verplichte velden ontbreken', async () => {
        const invalidTerras = new Terras({ name: 'Terras naam' });
        await expect(invalidTerras.save()).rejects.toThrow();
    });

//Test duplicate identifier
    it('zou een duplicate identifier moeten weigeren', async () => {
        await new Terras(validTerrasData).save();
        const duplicate = new Terras(validTerrasData);
        
        await expect(duplicate.save()).rejects.toThrow();
    });

//Test location.type accepts only "Point"
    it('zou moeten falen als location.type geen "Point" is', async () => {
        const invalidLocation = {
        ...validTerrasData,
        location: { type: 'Polygon', coordinates: [[[3, 51], [4, 51], [4, 52], [3, 51]]] }
        };
        const terras = new Terras(invalidLocation);
        await expect(terras.save()).rejects.toThrow();
    });
  
//Test 2dsphere index & location
    it('zou de GeoJSON locatie correct moeten opslaan', async () => {
        const terras = new Terras(validTerrasData);
        await terras.save();
        
    //Controleer of de index bestaat
        const indexes = Terras.schema.indexes();
        const has2dsphere = indexes.some((idx: { location: string; }[]) => idx[0].location === '2dsphere');
        expect(has2dsphere).toBe(true);
    });

    //Test timestamps (createdAt/updatedAt)
    it('zou automatisch createdAt en updatedAt velden moeten toevoegen', async () => {
        const terras = new Terras(validTerrasData);
        const savedTerras: any = await terras.save();
        
        expect(savedTerras.createdAt).toBeDefined();
        expect(savedTerras.updatedAt).toBeDefined();
    });

});