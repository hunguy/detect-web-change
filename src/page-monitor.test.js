const PageMonitor = require("./page-monitor");

// Mock Playwright page object
const createMockPage = () => ({
  goto: jest.fn(),
  waitForSelector: jest.fn(),
  textContent: jest.fn(),
  isClosed: jest.fn(() => false),
});

// Mock element handle
const createMockElement = () => ({
  textContent: jest.fn(),
});

describe("PageMonitor", () => {
  let pageMonitor;
  let mockPage;

  beforeEach(() => {
    pageMonitor = new PageMonitor();
    mockPage = createMockPage();
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with default timeouts", () => {
      expect(pageMonitor.getDefaultTimeout()).toBe(10000);
      expect(pageMonitor.getNavigationTimeout()).toBe(30000);
    });
  });

  describe("navigateAndExtract", () => {
    it("should successfully navigate and extract text content", async () => {
      const url = "https://example.com";
      const selector = "#price";
      const expectedText = "Test Content";

      mockPage.goto.mockResolvedValue();
      mockPage.waitForSelector.mockResolvedValue(createMockElement());
      mockPage.textContent.mockResolvedValue(`  ${expectedText}  `);

      const result = await pageMonitor.navigateAndExtract(
        mockPage,
        url,
        selector
      );

      expect(mockPage.goto).toHaveBeenCalledWith(url, {
        timeout: 30000,
        waitUntil: "domcontentloaded",
      });
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(selector, {
        timeout: 10000,
        state: "attached",
      });
      expect(mockPage.textContent).toHaveBeenCalledWith(selector);
      expect(result).toBe(expectedText);
    });

    it("should use custom timeouts when provided", async () => {
      const url = "https://example.com";
      const selector = "#price";
      const options = { timeout: 5000, navigationTimeout: 15000 };

      mockPage.goto.mockResolvedValue();
      mockPage.waitForSelector.mockResolvedValue(createMockElement());
      mockPage.textContent.mockResolvedValue("Test");

      await pageMonitor.navigateAndExtract(mockPage, url, selector, options);

      expect(mockPage.goto).toHaveBeenCalledWith(url, {
        timeout: 15000,
        waitUntil: "domcontentloaded",
      });
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(selector, {
        timeout: 5000,
        state: "attached",
      });
    });

    it("should throw error for missing page", async () => {
      await expect(
        pageMonitor.navigateAndExtract(null, "https://example.com", "#selector")
      ).rejects.toThrow("Page instance is required");
    });

    it("should throw error for invalid URL", async () => {
      await expect(
        pageMonitor.navigateAndExtract(mockPage, "", "#selector")
      ).rejects.toThrow("Valid URL is required");

      await expect(
        pageMonitor.navigateAndExtract(mockPage, null, "#selector")
      ).rejects.toThrow("Valid URL is required");
    });

    it("should throw error for invalid selector", async () => {
      await expect(
        pageMonitor.navigateAndExtract(mockPage, "https://example.com", "")
      ).rejects.toThrow("Valid CSS selector is required");

      await expect(
        pageMonitor.navigateAndExtract(mockPage, "https://example.com", null)
      ).rejects.toThrow("Valid CSS selector is required");
    });

    it("should handle navigation errors", async () => {
      const url = "https://example.com";
      const selector = "#price";

      mockPage.goto.mockRejectedValue(new Error("Navigation failed"));

      await expect(
        pageMonitor.navigateAndExtract(mockPage, url, selector)
      ).rejects.toThrow(
        'Page monitoring error for "https://example.com" with selector "#price": Navigation failed'
      );
    });

    it("should handle selector timeout errors", async () => {
      const url = "https://example.com";
      const selector = "#price";

      mockPage.goto.mockResolvedValue();
      const timeoutError = new Error("Timeout");
      timeoutError.name = "TimeoutError";
      mockPage.waitForSelector.mockRejectedValue(timeoutError);

      await expect(
        pageMonitor.navigateAndExtract(mockPage, url, selector)
      ).rejects.toThrow(
        'Page monitoring error for "https://example.com" with selector "#price": Timeout waiting for selector "#price" after 10000ms'
      );
    });
  });

  describe("waitForSelector", () => {
    it("should successfully wait for selector", async () => {
      const selector = "#test-element";
      const mockElement = createMockElement();

      mockPage.waitForSelector.mockResolvedValue(mockElement);

      const result = await pageMonitor.waitForSelector(mockPage, selector);

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(selector, {
        timeout: 10000,
        state: "attached",
      });
      expect(result).toBe(mockElement);
    });

    it("should use custom timeout", async () => {
      const selector = "#test-element";
      const timeout = 5000;
      const mockElement = createMockElement();

      mockPage.waitForSelector.mockResolvedValue(mockElement);

      await pageMonitor.waitForSelector(mockPage, selector, timeout);

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(selector, {
        timeout: 5000,
        state: "attached",
      });
    });

    it("should throw error for missing page", async () => {
      await expect(
        pageMonitor.waitForSelector(null, "#selector")
      ).rejects.toThrow("Page instance is required");
    });

    it("should throw error for invalid selector", async () => {
      await expect(pageMonitor.waitForSelector(mockPage, "")).rejects.toThrow(
        "Valid CSS selector is required"
      );
    });

    it("should handle timeout errors", async () => {
      const selector = "#missing-element";
      const timeoutError = new Error("Timeout");
      timeoutError.name = "TimeoutError";

      mockPage.waitForSelector.mockRejectedValue(timeoutError);

      await expect(
        pageMonitor.waitForSelector(mockPage, selector)
      ).rejects.toThrow(
        'Timeout waiting for selector "#missing-element" after 10000ms'
      );
    });

    it("should handle null element return", async () => {
      const selector = "#test-element";

      mockPage.waitForSelector.mockResolvedValue(null);

      await expect(
        pageMonitor.waitForSelector(mockPage, selector)
      ).rejects.toThrow(
        'Element with selector "#test-element" not found within 10000ms'
      );
    });

    it("should handle general errors", async () => {
      const selector = "#test-element";

      mockPage.waitForSelector.mockRejectedValue(new Error("Invalid selector"));

      await expect(
        pageMonitor.waitForSelector(mockPage, selector)
      ).rejects.toThrow(
        'Failed to wait for selector "#test-element": Invalid selector'
      );
    });
  });

  describe("extractTextContent", () => {
    it("should successfully extract and trim text content", async () => {
      const selector = "#price";
      const rawText = "  $19.99  ";
      const expectedText = "$19.99";

      mockPage.textContent.mockResolvedValue(rawText);

      const result = await pageMonitor.extractTextContent(mockPage, selector);

      expect(mockPage.textContent).toHaveBeenCalledWith(selector);
      expect(result).toBe(expectedText);
    });

    it("should handle empty text content", async () => {
      const selector = "#empty";

      mockPage.textContent.mockResolvedValue("");

      const result = await pageMonitor.extractTextContent(mockPage, selector);

      expect(result).toBe("");
    });

    it("should throw error for missing page", async () => {
      await expect(
        pageMonitor.extractTextContent(null, "#selector")
      ).rejects.toThrow("Page instance is required");
    });

    it("should throw error for invalid selector", async () => {
      await expect(
        pageMonitor.extractTextContent(mockPage, "")
      ).rejects.toThrow("Valid CSS selector is required");
    });

    it("should handle null text content", async () => {
      const selector = "#missing";

      mockPage.textContent.mockResolvedValue(null);

      await expect(
        pageMonitor.extractTextContent(mockPage, selector)
      ).rejects.toThrow('No text content found for selector "#missing"');
    });

    it("should handle extraction errors", async () => {
      const selector = "#test";

      mockPage.textContent.mockRejectedValue(new Error("Element not found"));

      await expect(
        pageMonitor.extractTextContent(mockPage, selector)
      ).rejects.toThrow(
        'Failed to extract text content from selector "#test": Element not found'
      );
    });
  });

  describe("handleNavigationError", () => {
    it("should handle navigation timeout errors", () => {
      const error = new Error("Navigation timeout");
      error.name = "TimeoutError";

      const result = pageMonitor.handleNavigationError(
        error,
        "https://example.com",
        "#selector"
      );

      expect(result.message).toContain(
        'Navigation timeout: Failed to load "https://example.com"'
      );
    });

    it("should handle selector timeout errors", () => {
      const error = new Error("waiting for selector timeout");
      error.name = "TimeoutError";

      const result = pageMonitor.handleNavigationError(
        error,
        "https://example.com",
        "#selector"
      );

      expect(result.message).toContain(
        'Element timeout: Selector "#selector" not found'
      );
    });

    it("should handle network errors", () => {
      const error = new Error("net::ERR_CONNECTION_REFUSED");

      const result = pageMonitor.handleNavigationError(
        error,
        "https://example.com",
        "#selector"
      );

      expect(result.message).toContain(
        'Network error loading "https://example.com"'
      );
    });

    it("should handle invalid CSS selector errors", () => {
      const error = new Error("Invalid CSS selector syntax");

      const result = pageMonitor.handleNavigationError(
        error,
        "https://example.com",
        "#selector"
      );

      expect(result.message).toContain('Invalid CSS selector "#selector"');
    });

    it("should handle no text content errors", () => {
      const error = new Error("No text content found for element");

      const result = pageMonitor.handleNavigationError(
        error,
        "https://example.com",
        "#selector"
      );

      expect(result.message).toContain(
        'No text content found for selector "#selector" on "https://example.com"'
      );
    });

    it("should handle generic errors", () => {
      const error = new Error("Some other error");

      const result = pageMonitor.handleNavigationError(
        error,
        "https://example.com",
        "#selector"
      );

      expect(result.message).toContain(
        'Page monitoring error for "https://example.com" with selector "#selector": Some other error'
      );
    });
  });

  describe("timeout configuration", () => {
    it("should set and get default timeout", () => {
      pageMonitor.setDefaultTimeout(15000);
      expect(pageMonitor.getDefaultTimeout()).toBe(15000);
    });

    it("should set and get navigation timeout", () => {
      pageMonitor.setNavigationTimeout(45000);
      expect(pageMonitor.getNavigationTimeout()).toBe(45000);
    });

    it("should throw error for invalid default timeout", () => {
      expect(() => pageMonitor.setDefaultTimeout(-1000)).toThrow(
        "Timeout must be a positive number"
      );
      expect(() => pageMonitor.setDefaultTimeout(0)).toThrow(
        "Timeout must be a positive number"
      );
      expect(() => pageMonitor.setDefaultTimeout("invalid")).toThrow(
        "Timeout must be a positive number"
      );
    });

    it("should throw error for invalid navigation timeout", () => {
      expect(() => pageMonitor.setNavigationTimeout(-1000)).toThrow(
        "Navigation timeout must be a positive number"
      );
      expect(() => pageMonitor.setNavigationTimeout(0)).toThrow(
        "Navigation timeout must be a positive number"
      );
      expect(() => pageMonitor.setNavigationTimeout("invalid")).toThrow(
        "Navigation timeout must be a positive number"
      );
    });
  });
});
