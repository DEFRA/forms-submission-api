const { CI } = process.env

/**
 * Jest config
 * @type {Config}
 */
module.exports = {
  verbose: true,
  resetMocks: true,
  resetModules: true,
  restoreMocks: true,
  clearMocks: true,
  silent: true,
  testMatch: ['<rootDir>/src/**/*.test.{cjs,js,mjs}'],
  reporters: CI
    ? [['github-actions', { silent: false }], 'summary']
    : ['default', 'summary'],
  collectCoverageFrom: ['<rootDir>/src/**/*.{cjs,js,mjs}'],
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.server',
    '<rootDir>/test'
  ],
  coverageDirectory: '<rootDir>/coverage',
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['jest-extended/all'],
  transform: {
    '^.+\\.(cjs|js|mjs)$': [
      'babel-jest',
      {
        plugins: ['transform-import-meta'],
        rootMode: 'upward'
      }
    ]
  },

  // Enable Babel transforms for node_modules
  // See: https://jestjs.io/docs/ecmascript-modules
  transformIgnorePatterns: [
    `node_modules/(?!${[
      '@defra/forms-model/.*',
      '@defra/hapi-tracing/.*',
      'nanoid', // Supports ESM only
      'slug', // Supports ESM only
      '@defra/forms-engine-plugin'
    ].join('|')}/)`
  ]
}

/**
 * @import { Config } from 'jest'
 */
