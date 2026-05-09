import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import ShadowScore from "../models/shadowScoreModel";
import {
  computeShadowScore,
  resolveHeight,
  getNearestShadowScore,
  type Building,
} from "../services/shadowScoringService";

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

// Ghent coords for reference
const LAT = 51.0536;
const LNG = 3.7218;

describe("resolveHeight", () => {
  it("uses explicit height tag", () => {
    expect(resolveHeight({ height: "15" })).toBe(15);
  });

  it("uses building:levels * 3.5 when no height", () => {
    expect(resolveHeight({ "building:levels": "4" })).toBe(14);
  });

  it("defaults to 10 when no tags", () => {
    expect(resolveHeight({})).toBe(10);
  });

  it("defaults to 10 when tags are unparseable", () => {
    expect(resolveHeight({ height: "unknown" })).toBe(10);
  });
});

describe("computeShadowScore", () => {
  it("returns 1.0 at night (sun below horizon)", () => {
    // 2 AM UTC in June = 4 AM local in Belgium, sun definitely below horizon
    const night = new Date("2026-06-15T00:00:00Z");
    const score = computeShadowScore(LAT, LNG, night, []);
    expect(score).toBe(1.0);
  });

  it("returns 1.0 with no buildings at daytime", () => {
    // Solar noon in June in Belgium ≈ 11:30 UTC
    const noon = new Date("2026-06-15T11:30:00Z");
    const score = computeShadowScore(LAT, LNG, noon, []);
    expect(score).toBe(1.0);
  });

  it("returns a score between 0 and 1 inclusive", () => {
    const noon = new Date("2026-06-15T11:30:00Z");
    const polygon: [number, number][] = [
      [LNG - 0.001, LAT - 0.001],
      [LNG + 0.001, LAT - 0.001],
      [LNG + 0.001, LAT + 0.001],
      [LNG - 0.001, LAT + 0.001],
      [LNG - 0.001, LAT - 0.001],
    ];
    const building: Building = {
      polygon,
      height: 50,
      cx: LNG,
      cy: LAT,
      halfWidth: 0.001 * 111320 * Math.sqrt(2),
    };
    const score = computeShadowScore(LAT, LNG, noon, [building]);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("getNearestShadowScore", () => {
  it("returns 1.0 when no scores exist (cold start)", async () => {
    const id = new mongoose.Types.ObjectId();
    const score = await getNearestShadowScore(id, new Date());
    expect(score).toBe(1.0);
  });

  it("returns the score of the nearest timestamp", async () => {
    const id = new mongoose.Types.ObjectId();
    const base = new Date("2026-06-15T10:00:00Z");
    const hour11 = new Date("2026-06-15T11:00:00Z");
    const hour12 = new Date("2026-06-15T12:00:00Z");
    await ShadowScore.create({ terrasRef: id, timestamp: hour11, score: 0.3 });
    await ShadowScore.create({ terrasRef: id, timestamp: hour12, score: 0.9 });

    // Query at 11:20 — closer to 11:00
    const query = new Date("2026-06-15T11:20:00Z");
    const score = await getNearestShadowScore(id, query);
    expect(score).toBe(0.3);
  });

  it("returns 1.0 when terrasRef has no matching docs", async () => {
    const otherId = new mongoose.Types.ObjectId();
    const myId = new mongoose.Types.ObjectId();
    await ShadowScore.create({ terrasRef: otherId, timestamp: new Date(), score: 0.5 });
    const score = await getNearestShadowScore(myId, new Date());
    expect(score).toBe(1.0);
  });
});
