const BrowserController = require("./browser-controller");

describe("BrowserController Unit Tests", () => {
  let browserController;

  beforeEach(() => {
    browserController = new BrowserController();
  });

  afterEach(async () => {
    // Clean up browser connection after each test
    if (browserController && browserController.isConnectedToBrowser()) {
      try {
        await browserController.disconnect();
      } catch (error) {
        // Ignore cleanup errors in tests
      }
    }
  });

  describe("Initial State", () => {
    test("should initialize with correct default state", () => {
      expect(browserController.isConnectedToBrowser()).toBe(false);
      expect(browserController.getBrowser()).toBe(null);
      expect(browserController.getContext()).toBe(null);
      expect(browserController.getOpenPageCount()).toBe(0);
    });
  });

  describe("Connection Management", () => {
    test("should throw error when connecting to invalid debug URL", async () => {
      await expect(browserController.connect("invalid-url")).rejects.toThrow(
        "Failed to connect to Chrome"
      );

      expect(browserController.isConnectedToBrowser()).toBe(false);
    });

    test("should throw error when connecting to non-existent port", async () => {
      await expect(
        browserController.connect("http://localhost:9999")
      ).rejects.toThrow("Failed to connect to Chrome");

      expect(browserController.isConnectedToBrowser()).toBe(false);
    });

    test("should throw error when trying to connect twice without disconnecting", async () => {
      // Mock a successful connection by setting internal state
      browserController.isConnected = true;

      await expect(
        browserController.connect("http://localhost:9222")
      ).rejects.toThrow("Browser is already connected");
    });

    test("should handle multiple disconnect calls gracefully", async () => {
      // Should not throw even when not connected
      await expect(browserController.disconnect()).resolves.not.toThrow();

      // Second disconnect should also not throw
      await expect(browserController.disconnect()).resolves.not.toThrow();
    });
  });

  describe("Page Management", () => {
    test("should throw error when creating page without connection", async () => {
      await expect(browserController.createPage()).rejects.toThrow(
        "Browser is not connected"
      );
    });

    test("should handle closing null page gracefully", async () => {
      await expect(browserController.closePage(null)).resolves.not.toThrow();
    });

    test("should handle closing undefined page gracefully", async () => {
      await expect(
        browserController.closePage(undefined)
      ).resolves.not.toThrow();
    });

    test("should track page count correctly", () => {
      expect(browserController.getOpenPageCount()).toBe(0);

      // Simulate adding pages to the internal set
      const mockPage1 = { isClosed: () => false };
      const mockPage2 = { isClosed: () => false };

      browserController.pages.add(mockPage1);
      browserController.pages.add(mockPage2);

      expect(browserController.getOpenPageCount()).toBe(2);

      browserController.pages.delete(mockPage1);
      expect(browserController.getOpenPageCount()).toBe(1);
    });
  });

  describe("State Management", () => {
    test("should return correct connection status", () => {
      expect(browserController.isConnectedToBrowser()).toBe(false);

      // Simulate connected state
      browserController.isConnected = true;
      browserController.browser = { mock: "browser" };
      browserController.context = { mock: "context" };

      expect(browserController.isConnectedToBrowser()).toBe(true);
    });

    test("should return browser and context instances", () => {
      expect(browserController.getBrowser()).toBe(null);
      expect(browserController.getContext()).toBe(null);

      const mockBrowser = { mock: "browser" };
      const mockContext = { mock: "context" };

      browserController.browser = mockBrowser;
      browserController.context = mockContext;

      expect(browserController.getBrowser()).toBe(mockBrowser);
      expect(browserController.getContext()).toBe(mockContext);
    });
  });

  describe("Error Handling", () => {
    test("should handle connection errors and maintain clean state", async () => {
      await expect(browserController.connect("invalid-url")).rejects.toThrow(
        "Failed to connect to Chrome"
      );

      // State should remain clean after error
      expect(browserController.isConnectedToBrowser()).toBe(false);
      expect(browserController.getBrowser()).toBe(null);
      expect(browserController.getContext()).toBe(null);
      expect(browserController.getOpenPageCount()).toBe(0);
    });

    test("should handle disconnect errors and clean up state", async () => {
      // Simulate connected state with mock objects
      browserController.isConnected = true;
      browserController.browser = {
        close: jest.fn().mockRejectedValue(new Error("Mock disconnect error")),
      };
      browserController.context = {
        close: jest.fn().mockResolvedValue(),
      };

      // Add mock pages
      const mockPage = {
        isClosed: () => false,
        close: jest.fn().mockResolvedValue(),
      };
      browserController.pages.add(mockPage);

      // Disconnect should handle error but still clean up
      await expect(browserController.disconnect()).rejects.toThrow(
        "Failed to disconnect from browser"
      );

      // State should be cleaned up despite the error
      expect(browserController.isConnectedToBrowser()).toBe(false);
      expect(browserController.getBrowser()).toBe(null);
      expect(browserController.getContext()).toBe(null);
      expect(browserController.getOpenPageCount()).toBe(0);
    });

    test("should handle page close errors gracefully", async () => {
      const mockPage = {
        isClosed: () => false,
        close: jest.fn().mockRejectedValue(new Error("Mock page close error")),
      };

      browserController.pages.add(mockPage);
      expect(browserController.getOpenPageCount()).toBe(1);

      // Should not throw error, just log warning
      await expect(
        browserController.closePage(mockPage)
      ).resolves.not.toThrow();

      // Page should be removed from tracking even if close failed
      expect(browserController.getOpenPageCount()).toBe(0);
    });
  });

  describe("Resource Cleanup", () => {
    test("should clean up all pages on closeAllPages", async () => {
      const mockPage1 = {
        isClosed: () => false,
        close: jest.fn().mockResolvedValue(),
      };
      const mockPage2 = {
        isClosed: () => false,
        close: jest.fn().mockResolvedValue(),
      };

      browserController.pages.add(mockPage1);
      browserController.pages.add(mockPage2);

      expect(browserController.getOpenPageCount()).toBe(2);

      await browserController.closeAllPages();

      expect(browserController.getOpenPageCount()).toBe(0);
      expect(mockPage1.close).toHaveBeenCalled();
      expect(mockPage2.close).toHaveBeenCalled();
    });

    test("should handle mixed success/failure in closeAllPages", async () => {
      const mockPage1 = {
        isClosed: () => false,
        close: jest.fn().mockResolvedValue(),
      };
      const mockPage2 = {
        isClosed: () => false,
        close: jest.fn().mockRejectedValue(new Error("Close failed")),
      };

      browserController.pages.add(mockPage1);
      browserController.pages.add(mockPage2);

      expect(browserController.getOpenPageCount()).toBe(2);

      // Should not throw even if some pages fail to close
      await expect(browserController.closeAllPages()).resolves.not.toThrow();

      expect(browserController.getOpenPageCount()).toBe(0);
      expect(mockPage1.close).toHaveBeenCalled();
      expect(mockPage2.close).toHaveBeenCalled();
    });
  });
});
