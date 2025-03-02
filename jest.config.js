/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
  ],
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: './reports',
      outputName: 'junit.xml',
    }]
  ],
  // Add a timeout to ensure tests don't hang
  testTimeout: 10000,
  // Force exit after tests complete
  forceExit: true,
  // Detect open handles (like timers, sockets) that might prevent Jest from exiting
  detectOpenHandles: true,
};
