const Logger = require("./logger");
const { ErrorHandler } = require("./error-handler");

class PageMonitor {
  constructor() {
    this.defaultTimeout = 10000; // 10 seconds default timeout
    this.navigationTimeout = 30000; // 30 seconds for navigation
    this.logger = new Logger();
    this.errorHandler = new ErrorHandler();
  }

  /**
   * Navigate to a URL and extract text content from a CSS selector
   * @param {Page} page - Playwright page instance
   * @param {string} url - Target webpage URL
   * @param {string} selector - CSS selector for target element
   * @param {Object} options - Optional configuration
   * @param {number} options.timeout - Timeout for selector wait (default: 10000ms)
   * @param {number} options.navigationTimeout - Timeout for navigation (default: 30000ms)
   * @returns {Promise<string>} - Extracted text content (trimmed)
   */
  async navigateAndExtract(page, url, selector, options = {}) {
    const timeout = options.timeout || this.defaultTimeout;
    const navigationTimeout =
      options.navigationTimeout || this.navigationTimeout;

    try {
      // Validate inputs
      if (!page) {
        const validationError = new Error("Page instance is required");
        this.errorHandler.handleError(validationError, {
          type: "page",
          operation: "navigate",
          url,
          selector,
        });
        throw validationError;
      }
      if (!url || typeof url !== "string") {
        const validationError = new Error("Valid URL is required");
        this.errorHandler.handleError(validationError, {
          type: "page",
          operation: "navigate",
          url,
          selector,
        });
        throw validationError;
      }
      if (!selector || typeof selector !== "string") {
        const validationError = new Error("Valid CSS selector is required");
        this.errorHandler.handleError(validationError, {
          type: "page",
          operation: "navigate",
          url,
          selector,
        });
        throw validationError;
      }

      this.logger.debug(`Navigating to ${url} with selector ${selector}`, {
        url,
        selector,
        timeout,
      });

      // Navigate to the URL
      await page.goto(url, {
        timeout: navigationTimeout,
        waitUntil: "domcontentloaded",
      });

      this.logger.debug(`Page loaded successfully: ${url}`);

      // Wait for the selector to be available
      await this.waitForSelector(page, selector, timeout);

      // Extract text content
      const textContent = await this.extractTextContent(page, selector);

      this.logger.debug(`Content extracted successfully from ${url}`, {
        url,
        selector,
        contentLength: textContent.length,
      });

      return textContent;
    } catch (error) {
      const handledError = this.handleNavigationError(error, url, selector);
      this.errorHandler.handleError(handledError, {
        type: "page",
        operation: "navigateAndExtract",
        url,
        selector,
      });
      throw handledError;
    }
  }

  /**
   * Wait for a CSS selector to be available on the page
   * @param {Page} page - Playwright page instance
   * @param {string} selector - CSS selector to wait for
   * @param {number} timeout - Timeout in milliseconds (default: 10000)
   * @returns {Promise<ElementHandle>} - Element handle when found
   */
  async waitForSelector(page, selector, timeout = this.defaultTimeout) {
    try {
      if (!page) {
        throw new Error("Page instance is required");
      }
      if (!selector || typeof selector !== "string") {
        throw new Error("Valid CSS selector is required");
      }

      // Wait for the element to be present in DOM
      const element = await page.waitForSelector(selector, {
        timeout: timeout,
        state: "attached",
      });

      if (!element) {
        throw new Error(
          `Element with selector "${selector}" not found within ${timeout}ms`
        );
      }

      return element;
    } catch (error) {
      if (error.name === "TimeoutError") {
        const timeoutError = new Error(
          `Timeout waiting for selector "${selector}" after ${timeout}ms`
        );
        this.logger.warn(`Element selection timed out: ${selector}`, {
          selector,
          timeout,
        });
        throw timeoutError;
      }

      const selectorError = new Error(
        `Failed to wait for selector "${selector}": ${error.message}`
      );
      this.logger.warn(`Element selection failed: ${selector}`, {
        selector,
        error: error.message,
      });
      throw selectorError;
    }
  }

  /**
   * Extract text content from an element using CSS selector
   * @param {Page} page - Playwright page instance
   * @param {string} selector - CSS selector for target element
   * @returns {Promise<string>} - Extracted text content (trimmed)
   */
  async extractTextContent(page, selector) {
    try {
      if (!page) {
        throw new Error("Page instance is required");
      }
      if (!selector || typeof selector !== "string") {
        throw new Error("Valid CSS selector is required");
      }

      // Use page.textContent() which is more reliable than element.textContent()
      const textContent = await page.textContent(selector);

      if (textContent === null) {
        throw new Error(`No text content found for selector "${selector}"`);
      }

      // Return trimmed text content for clean values
      return textContent.trim();
    } catch (error) {
      const extractionError = new Error(
        `Failed to extract text content from selector "${selector}": ${error.message}`
      );
      this.logger.warn(`Text extraction failed: ${selector}`, {
        selector,
        error: error.message,
      });
      throw extractionError;
    }
  }

  /**
   * Handle navigation and extraction errors with appropriate error types
   * @param {Error} error - Original error
   * @param {string} url - URL that was being accessed
   * @param {string} selector - CSS selector that was being used
   * @returns {Error} - Formatted error with context
   */
  handleNavigationError(error, url, selector) {
    const errorMessage = error.message || "Unknown error";

    // Categorize different types of errors
    if (error.name === "TimeoutError") {
      if (errorMessage.includes("Navigation timeout")) {
        return new Error(
          `Navigation timeout: Failed to load "${url}" within timeout period`
        );
      }
      if (errorMessage.includes("waiting for selector")) {
        return new Error(
          `Element timeout: Selector "${selector}" not found on "${url}" within timeout period`
        );
      }
      return new Error(`Timeout error on "${url}": ${errorMessage}`);
    }

    if (errorMessage.includes("net::ERR_")) {
      return new Error(`Network error loading "${url}": ${errorMessage}`);
    }

    if (errorMessage.includes("Invalid CSS selector")) {
      return new Error(`Invalid CSS selector "${selector}": ${errorMessage}`);
    }

    if (errorMessage.includes("No text content found")) {
      return new Error(
        `No text content found for selector "${selector}" on "${url}"`
      );
    }

    // Generic error with context
    return new Error(
      `Page monitoring error for "${url}" with selector "${selector}": ${errorMessage}`
    );
  }

  /**
   * Set default timeout for selector operations
   * @param {number} timeout - Timeout in milliseconds
   */
  setDefaultTimeout(timeout) {
    if (typeof timeout !== "number" || timeout <= 0) {
      throw new Error("Timeout must be a positive number");
    }
    this.defaultTimeout = timeout;
  }

  /**
   * Set default navigation timeout
   * @param {number} timeout - Timeout in milliseconds
   */
  setNavigationTimeout(timeout) {
    if (typeof timeout !== "number" || timeout <= 0) {
      throw new Error("Navigation timeout must be a positive number");
    }
    this.navigationTimeout = timeout;
  }

  /**
   * Get current default timeout
   * @returns {number} - Current default timeout in milliseconds
   */
  getDefaultTimeout() {
    return this.defaultTimeout;
  }

  /**
   * Get current navigation timeout
   * @returns {number} - Current navigation timeout in milliseconds
   */
  getNavigationTimeout() {
    return this.navigationTimeout;
  }
}

module.exports = PageMonitor;
