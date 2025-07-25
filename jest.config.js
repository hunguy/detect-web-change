module.exports = {
  // Test environment
  testEnvironment: "node",

  // Test file patterns
  testMatch: ["<rootDir>/src/**/*.test.js", "<rootDir>/test/**/*.test.js"],

  // Coverage configuration
  collectCoverageFrom: [
    "src/**/*.js",
    "detect-change.js",
    "!src/**/*.test.js",
    "!test/**/*",
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // Setup files
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"],

  // Test timeout (increased for integration tests)
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Module directories
  moduleDirectories: ["node_modules", "<rootDir>"],

  // Transform configuration (if needed for ES modules)
  transform: {},

  // Test path ignore patterns
  testPathIgnorePatterns: ["/node_modules/", "/temp/"],

  // Global setup and teardown
  globalSetup: "<rootDir>/test/global-setup.js",
  globalTeardown: "<rootDir>/test/global-teardown.js",

  // Reporter configuration
  reporters: ["default"],

  // Error handling
  errorOnDeprecated: true,

  // Detect open handles (useful for debugging)
  detectOpenHandles: false,

  // Force exit after tests complete
  forceExit: true,

  // Max workers for parallel execution
  maxWorkers: "50%",
};
