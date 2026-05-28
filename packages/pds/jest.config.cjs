/** @type {import('jest').Config} */
module.exports = {
  displayName: 'PDS',
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
  moduleNameMapper: {
    '^\\./templates/(.+\\.js)$': '<rootDir>/dist/mailer/templates/$1',
    '^varint$': '<rootDir>/../../jest.varint-shim.cjs',
    '^(\\.\\.?\\/.+)\\.js$': ['$1.ts', '$1.js'],
  },
}
