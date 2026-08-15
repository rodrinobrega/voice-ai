/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/handlers/**/*.ts', // thin wiring, exercised (behaviorally, not for coverage) by handler-level tests that mock infra/*
    '!src/infra/**/*.ts', // thin AWS/Speechmatics SDK adapters; would need heavy SDK client mocking for little business-logic payoff in this exercise's scope
    '!src/**/index.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      lines: 75,
      statements: 75,
      functions: 70,
      branches: 65,
    },
  },
  clearMocks: true,
};
