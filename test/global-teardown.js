/**
 * Global teardown for Jest tests
 */

const fs = require("fs").promises;
const path = require("path");

module.exports = async () => {
  console.log("Cleaning up test environment...");

  // Clean up temporary directories
  const tempDirs = [
    path.join(__dirname, "temp"),
    path.join(__dirname, "fixtures", "temp"),
    path.join(__dirname, "integration", "temp"),
  ];

  for (const dir of tempDirs) {
    try {
      await fs.rmdir(dir, { recursive: true });
    } catch (error) {
      // Directory might not exist or be in use
    }
  }

  // Clean up any remaining Chrome processes (if any)
  if (process.platform === "darwin" || process.platform === "linux") {
    try {
      const { exec } = require("child_process");
      exec('pkill -f "chrome.*--remote-debugging-port=9222"', () => {
        // Ignore errors - processes might not exist
      });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  console.log("Test environment cleanup complete");
};
