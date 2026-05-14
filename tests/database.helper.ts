import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer | undefined;

/**
 * Connect to an in-memory MongoDB.
 *
 * Retries on port collision: parallel Jest workers in CI sometimes probe the
 * same "free" port at the same instant — one binds, the other throws
 * "Port already in use" and cascades into 10s mongoose buffer timeouts
 * across the rest of the suite. A short backoff + retry lets the loser pick
 * a different port on the next attempt.
 */
export const connect = async () => {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      await mongoose.connect(uri);
      await mongoose.syncIndexes();
      return;
    } catch (err) {
      lastErr = err;
      // Clean up a partial mongod so the next attempt isn't double-counted.
      try { await mongod?.stop(); } catch { /* ignore */ }
      mongod = undefined;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
};

//Sluit de verbinding en stop server
export const closeDatabase = async () => {
  // If `connect` failed, calling dropDatabase against an unopened connection
  // blocks for 10s waiting for a buffer that never flushes — skip it.
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
    mongod = undefined;
  }
};

//Verwijder alle data uit de collecties
export const clearDatabase = async () => {
  if (mongoose.connection.readyState !== 1) return;
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
};
