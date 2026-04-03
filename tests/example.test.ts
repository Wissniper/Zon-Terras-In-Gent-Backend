import { connect, closeDatabase, clearDatabase } from './database.helper';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('Basis Test', () => {
  it('omgeving werkt?', () => {
    expect(1 + 1).toBe(2);
  });
});