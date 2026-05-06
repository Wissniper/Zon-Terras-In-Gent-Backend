import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import ShadowScore from "../models/shadowScoreModel.js";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await ShadowScore.deleteMany({});
});

describe("ShadowScore model", () => {
  it("saves a valid document", async () => {
    const id = new mongoose.Types.ObjectId();
    const ts = new Date("2026-06-15T10:00:00Z");
    const doc = await ShadowScore.create({ terrasRef: id, timestamp: ts, score: 0.8 });
    expect(doc._id).toBeDefined();
    expect(doc.score).toBe(0.8);
  });

  it("rejects score outside 0-1", async () => {
    const id = new mongoose.Types.ObjectId();
    await expect(
      ShadowScore.create({ terrasRef: id, timestamp: new Date(), score: 1.5 })
    ).rejects.toThrow();
  });

  it("enforces unique (terrasRef, timestamp) index", async () => {
    const id = new mongoose.Types.ObjectId();
    const ts = new Date("2026-06-15T10:00:00Z");
    await ShadowScore.create({ terrasRef: id, timestamp: ts, score: 0.5 });
    await expect(
      ShadowScore.create({ terrasRef: id, timestamp: ts, score: 0.7 })
    ).rejects.toThrow();
  });
});
