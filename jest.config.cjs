/** @type {import('jest').Config} */
module.exports = {
  projects: [
    '<rootDir>/packages/*/jest.config.cjs',
    '<rootDir>/packages/oauth/*/jest.config.cjs',
  ],
}
