/** @type {import('jest').Config} */
module.exports = {
  displayName: 'Ozone',
  transform: {
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      { jsc: { transform: {} }, module: { type: 'es6' } },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  transformIgnorePatterns: [],
  testTimeout: 60000,
  setupFiles: ['<rootDir>/../../test.setup.ts'],
  moduleDirectories: ['node_modules', '<rootDir>/../../node_modules'],
  moduleNameMapper: {
    '^varint$': '<rootDir>/../../jest.varint-shim.cjs',
    '^(\\.\\.?\\/.+)\\.js$': ['$1.ts', '$1.js'],
  },
}
