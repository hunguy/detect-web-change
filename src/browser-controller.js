const { chromium } = require("playwright");
const Logger = require("./logger");
const { ErrorHandler } = require("./error-handler");

class BrowserController {
  constructor() {
    this.browser = null;
    this.context = null;
    this.pages = new Set();
    this.isConnected = false;
    this.logger = new Logger();
    this.errorHandler = new ErrorHandler();
  }

  /**
   * Connect to Chrome using Playwright's connectOverCDP
   * @param {string} debugUrl - Chrome debug URL (e.g., http://localhost:9222)
   * @returns {Promise<void>}
   */
  async connect(debugUrl) {
    try {
      if (this.isConnected) {
        const connectionError = new Error("Browser is already connected");
        this.errorHandler.handleError(connectionError, {
          type: "browser",
          operation: "connect",
        });
        throw connectionError;
      }

      this.logger.debug(`Connecting to Chrome via CDP at ${debugUrl}...`);

      // Connect to Chrome via CDP
      this.browser = await chromium.connectOverCDP(debugUrl);

      // Create a new browser context
      this.context = await this.browser.newContext({
        // Set reasonable defaults for web scraping
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
        // Set timeouts
        timeout: 30000,
      });

      this.isConnected = true;
      this.logger.success("Browser connection established successfully");

      // Handle browser disconnect events
      this.browser.on("disconnected", () => {
        this.logger.warn("Browser disconnected unexpectedly");
        this.isConnected = false;
        this.browser = null;
        this.context = null;
        this.pages.clear();
      });
    } catch (error) {
      this.isConnected = false;
      const browserError = new Error(
        `Failed to connect to Chrome: ${error.message}`
      );
      this.errorHandler.handleError(browserError, {
        type: "browser",
        operation: "connect",
        debugUrl,
      });
      throw browserError;
    }
  }

  /**
   * Create a new page instance
   * @returns {Promise<Page>} - Playwright page instance
   */
  async createPage() {
    try {
      if (!this.isConnected || !this.context) {
        const pageError = new Error(
          "Browser is not connected. Call connect() first."
        );
        this.errorHandler.handleError(pageError, {
          type: "browser",
          operation: "createPage",
        });
        throw pageError;
      }

      this.logger.debug("Creating new browser page...");
      const page = await this.context.newPage();

      // Track the page for cleanup
      this.pages.add(page);

      // Set up page event handlers
      page.on("close", () => {
        this.pages.delete(page);
      });

      // Set default navigation timeout
      page.setDefaultNavigationTimeout(30000);
      page.setDefaultTimeout(10000);

      this.logger.debug(
        `Page created successfully. Total pages: ${this.pages.size}`
      );
      return page;
    } catch (error) {
      const pageError = new Error(`Failed to create page: ${error.message}`);
      this.errorHandler.handleError(pageError, {
        type: "browser",
        operation: "createPage",
      });
      throw pageError;
    }
  }

  /**
   * Close a specific page
   * @param {Page} page - Playwright page instance to close
   * @returns {Promise<void>}
   */
  async closePage(page) {
    try {
      if (!page) {
        return;
      }

      // Remove from tracking set
      this.pages.delete(page);

      // Close the page if it's not already closed
      if (!page.isClosed()) {
        await page.close();
      }
    } catch (error) {
      // Log error but don't throw - page cleanup should be non-blocking
      this.logger.warn(`Failed to close page: ${error.message}`, {
        operation: "closePage",
      });
    }
  }

  /**
   * Close all open pages
   * @returns {Promise<void>}
   */
  async closeAllPages() {
    const pagePromises = Array.from(this.pages).map((page) =>
      this.closePage(page)
    );
    await Promise.allSettled(pagePromises);
    this.pages.clear();
  }

  /**
   * Disconnect from the browser and clean up resources
   * @returns {Promise<void>}
   */
  async disconnect() {
    try {
      // Close all pages first
      await this.closeAllPages();

      // Close browser context
      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      // Disconnect from browser
      if (this.browser && this.isConnected) {
        await this.browser.close();
        this.browser = null;
      }

      this.isConnected = false;
    } catch (error) {
      // Ensure cleanup even if there are errors
      this.isConnected = false;
      this.browser = null;
      this.context = null;
      this.pages.clear();

      throw new Error(`Failed to disconnect from browser: ${error.message}`);
    }
  }

  /**
   * Check if browser is connected
   * @returns {boolean} - True if connected, false otherwise
   */
  isConnectedToBrowser() {
    return this.isConnected && !!this.browser && !!this.context;
  }

  /**
   * Get the number of open pages
   * @returns {number} - Number of open pages
   */
  getOpenPageCount() {
    return this.pages.size;
  }

  /**
   * Get browser context for advanced operations
   * @returns {BrowserContext|null} - Playwright browser context
   */
  getContext() {
    return this.context;
  }

  /**
   * Get browser instance for advanced operations
   * @returns {Browser|null} - Playwright browser instance
   */
  getBrowser() {
    return this.browser;
  }
}

module.exports = BrowserController;
