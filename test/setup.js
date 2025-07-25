/**
 * Jest setup file for test configuration
 */

// Increase timeout for integration tests
jest.setTimeout(60000);

// Mock console methods to reduce noise during tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

// Store original methods for restoration
global.originalConsole = {
  error: originalConsoleError,
  warn: originalConsoleWarn,
  log: originalConsoleLog,
};

// Mock console methods during tests (can be overridden per test)
beforeEach(() => {
  // Only mock console if not explicitly testing console output
  if (
    !expect.getState().currentTestName?.includes("console") &&
    !expect.getState().currentTestName?.includes("logging")
  ) {
    console.error = jest.fn();
    console.warn = jest.fn();
    console.log = jest.fn();
  }
});

afterEach(() => {
  // Restore console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});

// Global test utilities
global.testUtils = {
  // Helper to wait for a condition
  waitFor: async (condition, timeout = 5000, interval = 100) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  },

  // Helper to create temporary files
  createTempFile: async (content, extension = ".json") => {
    const fs = require("fs").promises;
    const path = require("path");
    const tempDir = path.join(__dirname, "temp");

    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    const tempFile = path.join(tempDir, `temp-${Date.now()}${extension}`);
    await fs.writeFile(tempFile, content);
    return tempFile;
  },

  // Helper to clean up temporary files
  cleanupTempFile: async (filePath) => {
    const fs = require("fs").promises;
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // File might not exist
    }
  },

  // Helper to measure execution time
  measureTime: async (fn) => {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    return { result, duration };
  },

  // Helper to measure memory usage
  measureMemory: async (fn) => {
    const startMemory = process.memoryUsage();
    const result = await fn();
    const endMemory = process.memoryUsage();
    const memoryDelta = {
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      heapTotal: endMemory.heapTotal - startMemory.heapTotal,
      external: endMemory.external - startMemory.external,
      rss: endMemory.rss - startMemory.rss,
    };
    return { result, memoryDelta };
  },
};

// Custom matchers
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },

  toHaveValidSlackPayload(received) {
    const payload = received.jsonBody;
    const pass =
      payload &&
      (payload.text || payload.attachments || payload.blocks) &&
      typeof payload.text === "string";

    if (pass) {
      return {
        message: () => `expected request not to have valid Slack payload`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected request to have valid Slack payload`,
        pass: false,
      };
    }
  },
});

// Handle unhandled promise rejections in tests
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Handle uncaught exceptions in tests
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});
