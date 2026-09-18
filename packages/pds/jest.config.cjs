/** @type {import('jest').Config} */
module.exports = {
  displayName: 'PDS',
  transform: {
    // Also transform .mjs/.cjs: ESM-only deps resolved through the export-map
    // fallback resolver must compile to CommonJS like everything else.
    '^.+\\.(m|c)?[jt]s$': [
      '@swc/jest',
      { jsc: { transform: {} }, module: { type: 'commonjs' } },
    ],
  },
  transformIgnorePatterns: [],
  testTimeout: 60000,

  resolver: '<rootDir>/../../jest.esm-exports-resolver.cjs',

  moduleNameMapper: {
    '^\\./templates/(.+\\.js)$': '<rootDir>/dist/mailer/templates/$1',
    '^(\\.\\.?\\/.+)\\.js$': ['$1.ts', '$1.js'],
  },
}
