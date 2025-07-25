/**
 * Global setup for Jest tests
 */

const fs = require("fs").promises;
const path = require("path");

module.exports = async () => {
  console.log("Setting up test environment...");

  // Create temporary directories for tests
  const tempDirs = [
    path.join(__dirname, "temp"),
    path.join(__dirname, "fixtures", "temp"),
    path.join(__dirname, "integration", "temp"),
  ];

  for (const dir of tempDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  // Set environment variables for testing
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "ERROR"; // Reduce log noise during tests

  // Disable Chrome sandbox for CI environments
  if (process.env.CI) {
    process.env.CHROME_ARGS = "--no-sandbox --disable-setuid-sandbox";
  }

  console.log("Test environment setup complete");
};
