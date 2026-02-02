/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'json'],
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.spec.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 30000,
  setupFiles: ['./tests/setup.js'],
  injectGlobals: true,
};
