import { jest, beforeAll, afterAll, afterEach, describe, it, expect } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Mock shadowScoringService before importing sunScoreService (ESM hoisting requirement)
const mockFetchGhentBuildings = jest.fn<() => Promise<never[]>>();
const mockComputeShadowScore = jest.fn<() => number>();

jest.unstable_mockModule("../services/shadowScoringService.js", () => ({
  fetchGhentBuildings: mockFetchGhentBuildings,
  computeShadowScore: mockComputeShadowScore,
}));

// Dynamic imports after mocking
const { default: Terras } = await import("../models/terrasModel.js");
const { default: ShadowScore } = await import("../models/shadowScoreModel.js");
const { refreshShadowScores } = await import("../services/sunScoreService.js");

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
  await Terras.deleteMany({});
  await ShadowScore.deleteMany({});
  jest.resetAllMocks();
});

describe("refreshShadowScores", () => {
  it("writes 48 ShadowScore docs per terrace", async () => {
    mockFetchGhentBuildings.mockResolvedValue([]);
    mockComputeShadowScore.mockReturnValue(50);

    await Terras.create({
      name: "Test Terras",
      address: "Teststraat 1",
      location: { type: "Point", coordinates: [3.7218, 51.0536] },
      intensity: 50,
    });

    await refreshShadowScores();

    const count = await ShadowScore.countDocuments();
    expect(count).toBe(48);
  });

  it("upserts on re-run (does not double-write)", async () => {
    mockFetchGhentBuildings.mockResolvedValue([]);
    mockComputeShadowScore.mockReturnValue(50);

    await Terras.create({
      name: "Test Terras",
      address: "Teststraat 1",
      location: { type: "Point", coordinates: [3.7218, 51.0536] },
      intensity: 50,
    });

    await refreshShadowScores();
    await refreshShadowScores();

    const count = await ShadowScore.countDocuments();
    expect(count).toBe(48);
  });

  it("skips deleted terraces", async () => {
    mockFetchGhentBuildings.mockResolvedValue([]);
    mockComputeShadowScore.mockReturnValue(50);

    await Terras.create({
      name: "Deleted Terras",
      address: "Teststraat 2",
      location: { type: "Point", coordinates: [3.72, 51.05] },
      intensity: 50,
      isDeleted: true,
    });

    await refreshShadowScores();

    const count = await ShadowScore.countDocuments();
    expect(count).toBe(0);
  });

  it("does not throw when Overpass fails", async () => {
    mockFetchGhentBuildings.mockRejectedValue(new Error("Network error"));

    await Terras.create({
      name: "Test Terras",
      address: "Teststraat 1",
      location: { type: "Point", coordinates: [3.7218, 51.0536] },
      intensity: 50,
    });

    await expect(refreshShadowScores()).resolves.not.toThrow();
  });
});
