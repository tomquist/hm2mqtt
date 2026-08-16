/**
 * End-to-end suite: real Home Assistant, real broker, real hm2mqtt build.
 *
 * Kept separate from `jest.config.cjs` so `npm test` stays fast and needs no
 * Python. Run it with `npm run test:e2e` (which builds first) or in the `e2e`
 * CI job.
 *
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
module.exports = {
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  testMatch: ['**/test/e2e/scenarios/*.e2e.ts'],
  injectGlobals: true,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, isolatedModules: true }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverage: false,
  // A scenario boots Home Assistant, which is slow on a cold CI runner.
  testTimeout: 300000,
  // Scenarios bind ports and spawn processes; they must not overlap.
  maxWorkers: 1,
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: './test-results', outputName: 'junit-e2e.xml' }],
  ],
  forceExit: true,
};
