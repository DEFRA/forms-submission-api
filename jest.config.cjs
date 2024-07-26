/**
 * Jest config
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  verbose: true,
  resetMocks: true,
  resetModules: true,
  restoreMocks: true,
  clearMocks: true,
  silent: true,
  testMatch: ['**/*.test.{cjs,js}'],
  reporters: ['default', ['github-actions', { silent: false }], 'summary'],
  collectCoverageFrom: ['src/**/*.js'],
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.server',
    '<rootDir>/src/__fixtures__'
  ],
  coverageDirectory: '<rootDir>/coverage',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: ['<rootDir>/node_modules/(?!@defra/forms-model/)']
}
