/** @type {import('jest').Config} */
export default {
  testEnvironment: 'jsdom',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'js', 'vue', 'json'],
  transform: {
    '^.+\\.vue$': '@vue/vue3-jest',
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/$1',
    '^@/(.*)$': '<rootDir>/$1',
    '^#app$': '<rootDir>/test/mocks/nuxtApp.ts',
  },
  testMatch: ['<rootDir>/**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.nuxt/',
    '/.output/',
    '/cypress/',
    '/dist/',
  ],
  collectCoverageFrom: [
    'composables/**/*.ts',
    'stores/**/*.ts',
    'components/**/*.vue',
    'middleware/**/*.ts',
    '!**/*.d.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  clearMocks: true,
}
