const { spawn } = require("child_process");
const net = require("net");
const path = require("path");
const os = require("os");
const fs = require("fs").promises;
const Logger = require("./logger");
const { ErrorHandler } = require("./error-handler");

class ChromeLauncher {
  constructor() {
    this.chromeProcess = null;
    this.debugPort = 9222;
    this.userDataDir = path.join(os.tmpdir(), "chrome-web-detector");
    this.logger = new Logger();
    this.errorHandler = new ErrorHandler();
  }

  /**
   * Check if a port is already in use
   * @param {number} port - Port number to check
   * @returns {Promise<boolean>} - True if port is in use, false otherwise
   */
  async isPortInUse(port) {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.listen(port, () => {
        server.once("close", () => {
          resolve(false);
        });
        server.close();
      });

      server.on("error", () => {
        resolve(true);
      });
    });
  }

  /**
   * Get possible Chrome executable paths based on the operating system
   * @returns {string[]} - Array of possible Chrome executable paths
   */
  getPossibleChromePaths() {
    const platform = process.platform;

    switch (platform) {
      case "win32":
        return [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          process.env.LOCALAPPDATA +
            "\\Google\\Chrome\\Application\\chrome.exe",
          process.env.PROGRAMFILES +
            "\\Google\\Chrome\\Application\\chrome.exe",
        ].filter(Boolean);
      case "darwin":
        return [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
          process.env.HOME +
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ].filter(Boolean);
      case "linux":
        return [
          // Playwright's Chromium path (should be first priority)
          "/root/.cache/ms-playwright/chromium-1181/chrome-linux/chrome",
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/snap/bin/chromium",
          "/opt/google/chrome/chrome",
        ];
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Find the Chrome executable path
   * @returns {Promise<string>} - Path to Chrome executable
   */
  async findChromePath() {
    const possiblePaths = this.getPossibleChromePaths();

    for (const chromePath of possiblePaths) {
      try {
        await fs.access(chromePath, fs.constants.F_OK | fs.constants.X_OK);
        this.logger.debug(`Found Chrome executable at: ${chromePath}`);
        return chromePath;
      } catch (error) {
        // Continue to next path
        continue;
      }
    }

    // If no Chrome found, provide helpful error message
    const platform = process.platform;
    let installInstructions = "";

    switch (platform) {
      case "win32":
        installInstructions =
          "Please install Google Chrome from https://www.google.com/chrome/";
        break;
      case "darwin":
        installInstructions =
          "Please install Google Chrome from https://www.google.com/chrome/ or via Homebrew: brew install --cask google-chrome";
        break;
      case "linux":
        installInstructions =
          "Please install Google Chrome via your package manager or from https://www.google.com/chrome/";
        break;
    }

    throw new Error(
      `Chrome executable not found. Searched paths: ${possiblePaths.join(
        ", "
      )}. ${installInstructions}`
    );
  }

  /**
   * Validate system requirements
   * @returns {Promise<void>}
   */
  async validateSystemRequirements() {
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0]);

    if (majorVersion < 16) {
      throw new Error(
        `Node.js version ${nodeVersion} is not supported. Please upgrade to Node.js 16 or higher.`
      );
    }

    // Check available memory (minimum 512MB)
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const minRequiredMemory = 512 * 1024 * 1024; // 512MB in bytes

    if (freeMemory < minRequiredMemory) {
      this.logger.warn(
        `Low available memory: ${Math.round(
          freeMemory / 1024 / 1024
        )}MB. Chrome may not start properly.`
      );
    }

    // Check disk space for user data directory
    try {
      const userDataParent = path.dirname(this.userDataDir);
      await fs.mkdir(userDataParent, { recursive: true });

      // Try to create a test file to check write permissions
      const testFile = path.join(userDataParent, ".write-test");
      await fs.writeFile(testFile, "test");
      await fs.unlink(testFile);
    } catch (error) {
      throw new Error(
        `Cannot create user data directory at ${this.userDataDir}: ${error.message}`
      );
    }

    this.logger.debug("System requirements validation passed");
  }

  /**
   * Launch Chrome with remote debugging capabilities
   * @returns {Promise<string>} - Debug URL for connecting to Chrome
   */
  async launch() {
    try {
      // Validate system requirements first
      await this.validateSystemRequirements();

      // Check if debug port is already in use
      const portInUse = await this.isPortInUse(this.debugPort);
      if (portInUse) {
        const portError = new Error(
          `Chrome debug port ${this.debugPort} is already in use. Please close any existing Chrome instances or use a different port.`
        );
        this.errorHandler.handleError(portError, {
          type: "chrome",
          operation: "launch",
          port: this.debugPort,
        });
        throw portError;
      }

      this.logger.debug(`Chrome debug port ${this.debugPort} is available`);

      const chromePath = await this.findChromePath();
      const chromeArgs = [
        `--remote-debugging-port=${this.debugPort}`,
        `--user-data-dir=${this.userDataDir}`,
        "--no-first-run",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=TranslateUI",
        "--disable-ipc-flooding-protection",
        "--no-sandbox",
        "--headless",
      ];

      // Spawn Chrome process
      this.chromeProcess = spawn(chromePath, chromeArgs, {
        detached: false,
        stdio: "pipe",
      });

      // Handle Chrome process events
      this.chromeProcess.on("error", (error) => {
        const chromeError = new Error(
          `Failed to launch Chrome: ${error.message}`
        );
        this.errorHandler.handleError(chromeError, {
          type: "chrome",
          operation: "launch",
        });
        throw chromeError;
      });

      this.chromeProcess.on("exit", (code, signal) => {
        if (code !== null && code !== 0) {
          this.logger.warn(`Chrome process exited with code ${code}`, {
            code,
            signal,
          });
        }
        if (signal) {
          this.logger.warn(`Chrome process killed with signal ${signal}`, {
            code,
            signal,
          });
        }
      });

      // Give Chrome a moment to initialize before checking
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Wait for Chrome to start and debug port to be available
      this.logger.debug("Waiting for Chrome debug port to become available...");
      await this.waitForDebugPort();

      const debugUrl = this.getDebugUrl();
      this.logger.success(
        `Chrome launched successfully with debug URL: ${debugUrl}`
      );
      return debugUrl;
    } catch (error) {
      this.logger.error("Chrome launch failed, cleaning up...");
      await this.terminate();
      this.errorHandler.handleError(error, {
        type: "chrome",
        operation: "launch",
      });
      throw error;
    }
  }

  /**
   * Wait for Chrome debug port to become available and ready
   * @param {number} timeout - Timeout in milliseconds (default: 15000)
   * @returns {Promise<void>}
   */
  async waitForDebugPort(timeout = 15000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // Try to actually connect to Chrome's debug endpoint
        const isReady = await this.testDebugConnection();
        if (isReady) {
          this.logger.debug(`Chrome debug port ${this.debugPort} is ready`);
          return;
        }
      } catch (error) {
        // Continue waiting - Chrome might still be starting up
      }

      // Wait 200ms before checking again (slightly longer interval)
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const timeoutError = new Error(
      `Chrome debug port ${this.debugPort} did not become available within ${timeout}ms`
    );
    this.errorHandler.handleError(timeoutError, {
      type: "chrome",
      operation: "waitForDebugPort",
      port: this.debugPort,
      timeout,
    });
    throw timeoutError;
  }

  /**
   * Test if Chrome debug connection is actually ready
   * @returns {Promise<boolean>} - True if Chrome debug server is ready
   */
  async testDebugConnection() {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 1000; // 1 second timeout for connection test

      socket.setTimeout(timeout);

      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });

      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(this.debugPort, "localhost");
    });
  }

  /**
   * Get the debug URL for connecting to Chrome
   * @returns {string} - Debug URL
   */
  getDebugUrl() {
    return `http://localhost:${this.debugPort}`;
  }

  /**
   * Terminate the Chrome process and clean up resources
   * @returns {Promise<void>}
   */
  async terminate() {
    if (this.chromeProcess && !this.chromeProcess.killed) {
      return new Promise((resolve) => {
        this.chromeProcess.on("exit", async () => {
          this.chromeProcess = null;
          await this.cleanupTempFiles();
          resolve();
        });

        // Try graceful termination first
        this.chromeProcess.kill("SIGTERM");

        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (this.chromeProcess && !this.chromeProcess.killed) {
            this.chromeProcess.kill("SIGKILL");
          }
        }, 5000);
      });
    } else {
      // Clean up temp files even if no process to terminate
      await this.cleanupTempFiles();
    }

    this.chromeProcess = null;
  }

  /**
   * Clean up temporary files and directories
   * @returns {Promise<void>}
   */
  async cleanupTempFiles() {
    try {
      // Clean up user data directory if it exists
      if (this.userDataDir) {
        try {
          await fs.access(this.userDataDir);
          await fs.rm(this.userDataDir, { recursive: true, force: true });
          this.logger.debug(
            `Cleaned up user data directory: ${this.userDataDir}`
          );
        } catch (error) {
          // Directory might not exist or already cleaned up
          this.logger.debug(
            `User data directory cleanup skipped: ${error.message}`
          );
        }
      }

      // Clean up any Chrome-related temporary files in system temp
      const tempDir = os.tmpdir();
      try {
        const tempFiles = await fs.readdir(tempDir);
        const chromeFiles = tempFiles.filter(
          (file) =>
            file.startsWith("chrome") ||
            file.startsWith(".com.google.Chrome") ||
            file.startsWith("scoped_dir")
        );

        for (const file of chromeFiles) {
          try {
            const fullPath = path.join(tempDir, file);
            await fs.rm(fullPath, { recursive: true, force: true });
            this.logger.debug(`Cleaned up temp file: ${fullPath}`);
          } catch (cleanupError) {
            // Ignore individual file cleanup errors
          }
        }
      } catch (error) {
        // Ignore temp directory read errors
        this.logger.debug(
          `Could not read temp directory for cleanup: ${error.message}`
        );
      }
    } catch (error) {
      this.logger.warn(`Error during temp file cleanup: ${error.message}`);
    }
  }

  /**
   * Check if Chrome process is running
   * @returns {boolean} - True if Chrome is running, false otherwise
   */
  isRunning() {
    return !!(this.chromeProcess && !this.chromeProcess.killed);
  }
}

module.exports = ChromeLauncher;
