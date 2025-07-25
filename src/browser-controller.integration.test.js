const BrowserController = require("./browser-controller");
const ChromeLauncher = require("./chrome-launcher");

// Integration tests that require Chrome to be running
// These tests are skipped by default and can be run manually with:
// npm test -- --testNamePattern="Integration"

describe("BrowserController Integration Tests", () => {
  let chromeLauncher;
  let browserController;
  let debugUrl;

  // Helper to check if Chrome can be launched
  const canLaunchChrome = async () => {
    try {
      const launcher = new ChromeLauncher();
      const url = await launcher.launch();
      await launcher.terminate();
      return true;
    } catch (error) {
      console.warn(
        "Chrome not available for integration tests:",
        error.message
      );
      return false;
    }
  };

  beforeAll(async () => {
    const chromeAvailable = await canLaunchChrome();
    if (!chromeAvailable) {
      console.warn("Skipping integration tests - Chrome not available");
      return;
    }

    // Launch Chrome for integration testing
    chromeLauncher = new ChromeLauncher();
    debugUrl = await chromeLauncher.launch();
  }, 30000);

  afterAll(async () => {
    // Clean up Chrome process
    if (chromeLauncher) {
      await chromeLauncher.terminate();
    }
  }, 10000);

  beforeEach(() => {
    if (!debugUrl) {
      return; // Skip test setup if Chrome not available
    }
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

  describe("Integration - Connection Management", () => {
    test("should connect to Chrome successfully", async () => {
      await browserController.connect(debugUrl);

      expect(browserController.isConnectedToBrowser()).toBe(true);
      expect(browserController.getBrowser()).toBeTruthy();
      expect(browserController.getContext()).toBeTruthy();
    });

    test("should disconnect properly", async () => {
      await browserController.connect(debugUrl);
      expect(browserController.isConnectedToBrowser()).toBe(true);

      await browserController.disconnect();
      expect(browserController.isConnectedToBrowser()).toBe(false);
    });

    test("should handle browser disconnect events", async () => {
      await browserController.connect(debugUrl);
      expect(browserController.isConnectedToBrowser()).toBe(true);

      // Simulate browser disconnect by closing the browser directly
      await browserController.getBrowser().close();

      // Give some time for the disconnect event to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(browserController.isConnectedToBrowser()).toBe(false);
    });
  });

  describe("Integration - Page Management", () => {
    beforeEach(async () => {
      await browserController.connect(debugUrl);
    });

    test("should create a page successfully", async () => {
      const page = await browserController.createPage();

      expect(page).toBeTruthy();
      expect(browserController.getOpenPageCount()).toBe(1);
      expect(page.isClosed()).toBe(false);
    });

    test("should create multiple pages", async () => {
      const page1 = await browserController.createPage();
      const page2 = await browserController.createPage();

      expect(browserController.getOpenPageCount()).toBe(2);
      expect(page1.isClosed()).toBe(false);
      expect(page2.isClosed()).toBe(false);
    });

    test("should close a specific page", async () => {
      const page1 = await browserController.createPage();
      const page2 = await browserController.createPage();

      expect(browserController.getOpenPageCount()).toBe(2);

      await browserController.closePage(page1);

      expect(browserController.getOpenPageCount()).toBe(1);
      expect(page1.isClosed()).toBe(true);
      expect(page2.isClosed()).toBe(false);
    });

    test("should close all pages", async () => {
      await browserController.createPage();
      await browserController.createPage();
      await browserController.createPage();

      expect(browserController.getOpenPageCount()).toBe(3);

      await browserController.closeAllPages();

      expect(browserController.getOpenPageCount()).toBe(0);
    });

    test("should track page closure automatically", async () => {
      const page = await browserController.createPage();
      expect(browserController.getOpenPageCount()).toBe(1);

      // Close page directly
      await page.close();

      // Give some time for the close event to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(browserController.getOpenPageCount()).toBe(0);
    });
  });

  describe("Integration - Page Navigation", () => {
    let page;

    beforeEach(async () => {
      await browserController.connect(debugUrl);
      page = await browserController.createPage();
    });

    test("should navigate to a webpage", async () => {
      // Create a simple HTML page content
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head><title>Test Page</title></head>
          <body>
            <h1 id="title">Hello World</h1>
            <p class="content">This is test content</p>
          </body>
        </html>
      `;

      // Navigate to data URL with HTML content
      await page.goto(`data:text/html,${encodeURIComponent(htmlContent)}`);

      // Verify navigation was successful
      const title = await page.textContent("#title");
      expect(title).toBe("Hello World");

      const content = await page.textContent(".content");
      expect(content).toBe("This is test content");
    });

    test("should wait for selectors", async () => {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <body>
            <div id="initial">Initial content</div>
            <script>
              setTimeout(() => {
                const div = document.createElement('div');
                div.id = 'delayed';
                div.textContent = 'Delayed content';
                document.body.appendChild(div);
              }, 500);
            </script>
          </body>
        </html>
      `;

      await page.goto(`data:text/html,${encodeURIComponent(htmlContent)}`);

      // Wait for the delayed element
      await page.waitForSelector("#delayed", { timeout: 2000 });

      const delayedContent = await page.textContent("#delayed");
      expect(delayedContent).toBe("Delayed content");
    });
  });

  describe("Integration - Resource Management", () => {
    test("should properly clean up all resources on disconnect", async () => {
      await browserController.connect(debugUrl);

      // Create multiple pages
      await browserController.createPage();
      await browserController.createPage();
      await browserController.createPage();

      expect(browserController.getOpenPageCount()).toBe(3);
      expect(browserController.isConnectedToBrowser()).toBe(true);

      // Disconnect should clean up everything
      await browserController.disconnect();

      expect(browserController.getOpenPageCount()).toBe(0);
      expect(browserController.isConnectedToBrowser()).toBe(false);
      expect(browserController.getBrowser()).toBe(null);
      expect(browserController.getContext()).toBe(null);
    });
  });
});
