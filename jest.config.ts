import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // uuid@14 ships pure ESM — Jest can't parse it. Map to a local shim
    // backed by node:crypto.randomUUID() (functionally identical to v4).
    '^uuid$': '<rootDir>/tests/__mocks__/uuid.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  testTimeout: 30000,
};

export default config;