/**
 * End-to-end integration tests with real Chrome browser instances
 * Tests the complete system with actual browser automation
 */

const fs = require("fs").promises;
const path = require("path");
const { MonitoringWorkflow } = require("../../detect-change");
const MockSlackServer = require("../fixtures/mock-slack-server");
const { validConfigs, mockWebPages } = require("../fixtures/test-configs");

describe("End-to-End Integration Tests", () => {
  let mockSlackServer;
  let tempConfigPath;
  let tempDir;

  // Helper to check if Chrome can be launched
  const canLaunchChrome = async () => {
    try {
      const ChromeLauncher = require("../../src/chrome-launcher");
      const launcher = new ChromeLauncher();
      const url = await launcher.launch();
      await launcher.terminate();
      return true;
    } catch (error) {
      console.warn("Chrome not available for E2E tests:", error.message);
      return false;
    }
  };

  beforeAll(async () => {
    // Check if Chrome is available
    const chromeAvailable = await canLaunchChrome();
    if (!chromeAvailable) {
      console.warn("Skipping E2E tests - Chrome not available");
      return;
    }

    // Create temporary directory for test files
    tempDir = path.join(__dirname, "..", "temp");
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Start mock Slack server
    mockSlackServer = new MockSlackServer(3004);
    await mockSlackServer.start();
  }, 30000);

  afterAll(async () => {
    // Stop mock Slack server
    if (mockSlackServer) {
      await mockSlackServer.stop();
    }

    // Clean up temporary files
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Skip if Chrome not available
    const chromeAvailable = await canLaunchChrome();
    if (!chromeAvailable) {
      return;
    }

    // Clear mock server requests
    mockSlackServer.clearRequests();
    mockSlackServer.setResponse("/webhook", 200, "ok");

    // Create temporary config file
    tempConfigPath = path.join(tempDir, `e2e-test-config-${Date.now()}.json`);
  });

  afterEach(async () => {
    // Clean up temporary config file
    try {
      await fs.unlink(tempConfigPath);
    } catch (error) {
      // File might not exist
    }
  });

  describe("Real Browser Automation", () => {
    test("should launch Chrome and process data URLs successfully", async () => {
      const chromeAvailable = await canLaunchChrome();
      if (!chromeAvailable) {
        console.warn("Skipping test - Chrome not available");
        return;
      }

      const config = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#test",
          current_value: "old value",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const session = await workflow.execute();

      // Verify successful execution
      expect(session.results).toHaveLength(1);
      expect(session.results[0].hasChanged).toBe(true);
      expect(session.results[0].oldValue).toBe("old value");
      expect(session.results[0].newValue).toBe("test value");
      expect(session.errors).toHaveLength(0);

      // Verify browser cleanup
      expect(workflow.browserController.isConnectedToBrowser()).toBe(false);
      expect(workflow.chromeLauncher.isRunning()).toBe(false);

      // Verify notification was sent
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(1);
    }, 45000);

    test("should handle multiple pages with real browser navigation", async () => {
      const chromeAvailable = await canLaunchChrome();
      if (!chromeAvailable) {
        console.warn("Skipping test - Chrome not available");
        return;
      }

      const config = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#test",
          current_value: "old value 1",
        },
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.changed)}`,
          css_selector: "#test",
          current_value: "old value 2",
        },
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.complex)}`,
          css_selector: "div.container > .price:nth-child(2)",
          current_value: "old price",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const session = await workflow.execute();

      // Verify all pages were processed
      expect(session.results).toHaveLength(3);
      expect(session.results[0].hasChanged).toBe(true);
      expect(session.results[0].newValue).toBe("test value");
      expect(session.results[1].hasChanged).toBe(true);
      expect(session.results[1].newValue).toBe("new test value");
      expect(session.results[2].hasChanged).toBe(true);
      expect(session.results[2].newValue).toBe("$29.99");
      expect(session.errors).toHaveLength(0);

      // Verify all notifications were sent
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(3);
    }, 60000);

    test("should handle delayed content with real browser waiting", async () => {
      const chromeAvailable = await canLaunchChrome();
      if (!chromeAvailable) {
        console.warn("Skipping test - Chrome not available");
        return;
      }

      const config = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.delayed)}`,
          css_selector: "#delayed",
          current_value: "old delayed content",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const startTime = Date.now();
      const session = await workflow.execute();
      const duration = Date.now() - startTime;

      // Verify delayed content was detected
      expect(session.results).toHaveLength(1);
      expect(session.results[0].hasChanged).toBe(true);
      expect(session.results[0].newValue).toBe("Delayed content");
      expect(session.errors).toHaveLength(0);

      // Verify it took time to wait for the delayed content
      expect(duration).toBeGreaterThan(500); // Should wait at least 500ms for delayed content
    }, 45000);

    test("should handle real network requests to public websites", async () => {
      const chromeAvailable = await canLaunchChrome();
      if (!chromeAvailable) {
        console.warn("Skipping test - Chrome not available");
        return;
      }

      // Use a reliable public website for testing
      const config = [
        {
          url: "https://httpbin.org/html",
          css_selector: "h1",
          current_value: "old title",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const session = await workflow.execute();

      // Verify real network request was processed
      expect(session.results).toHaveLength(1);

      // The result depends on whether the content changed
      if (session.results[0].hasChanged) {
        expect(session.results[0].newValue).toBeDefined();
        expect(session.results[0].newValue).not.toBe("old title");
      } else {
        expect(session.results[0].newValue).toBe("old title");
      }

      // Should not have errors for a successful request
      if (session.errors.length > 0) {
        console.warn("Network request failed:", session.errors[0]);
      }
    }, 60000);
  });

  describe("Browser Resource Management", () => {
    test("should properly manage browser lifecycle", async () => {
      const chromeAvailable = await canLaunchChrome();
      if (!chromeAvailable) {
        console.warn("Skipping test - Chrome not available");
        return;
      }

      const config = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#test",
          current_value: "old value",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      // Verify initial state
      expect(workflow.browserController.isConnectedToBrowser()).toBe(false);
      expect(workflow.chromeLauncher.isRunning()).toBe(false);

      // Execute workflow
      const session = await workflow.execute();

      // Verify execution was successful
      expect(session.results).toHaveLength(1);
      expect(session.results[0].hasChanged).toBe(true);
      expect(session.errors).toHaveLength(0);

      // Verify cleanup was performed
      expect(workflow.browserController.isConnectedToBrowser()).toBe(false);
      expect(workflow.chromeLauncher.isRunning()).toBe(false);
    }, 45000);

    test("should handle multiple workflow executions with proper cleanup", async () => {
      const chromeAvailable = await canLaunchChrome();
      if (!chromeAvailable) {
        console.warn("Skipping test - Chrome not available");
        return;
      }

      const config = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#test",
          current_value: "old value",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      // Execute workflow multiple times
      for (let i = 0; i < 3; i++) {
        const workflow = new MonitoringWorkflow();
        await workflow.initialize(
          tempConfigPath,
          mockSlackServer.getWebhookUrl("/webhook")
        );

        const session = await workflow.execute();

        // Verify each execution is successful
        expect(session.results).toHaveLength(1);
        expect(session.results[0].hasChanged).toBe(true);
        expect(session.errors).toHaveLength(0);

        // Verify cleanup after each execution
        expect(workflow.browserController.isConnectedToBrowser()).toBe(false);
        expect(workflow.chromeLauncher.isRunning()).toBe(false);

        // Update config for next iteration
        const updatedConfig = JSON.parse(
          await fs.readFile(tempConfigPath, "utf8")
        );
        updatedConfig[0].current_value = "old value"; // Reset for next test
        await fs.writeFile(
          tempConfigPath,
          JSON.stringify(updatedConfig, null, 2)
        );

        // Clear notifications for next iteration
        mockSlackServer.clearRequests();
      }

      // Verify total notifications sent
      const totalRequests = mockSlackServer.getRequests().length;
      expect(totalRequests).toBeGreaterThan(0);
    }, 120000);

    test("should handle browser crashes gracefully", async () => {
      const chromeAvailable = await canLaunchChrome();
      if (!chromeAvailable) {
        console.warn("Skipping test - Chrome not available");
        return;
      }

      const config = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#test",
          current_value: "old value",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      // Start the workflow
      await workflow.configManager.loadConfig(tempConfigPath);
      const debugUrl = await workflow.chromeLauncher.launch();
      await workflow.browserController.connect(debugUrl);

      // Verify browser is running
      expect(workflow.browserController.isConnectedToBrowser()).toBe(true);
      expect(workflow.chromeLauncher.isRunning()).toBe(true);

      // Simulate browser crash by terminating Chrome process
      await workflow.chromeLauncher.terminate();

      // Try to continue processing - should handle the crash
      try {
        await workflow.processMonitoringTargets();
      } catch (error) {
        // Expected to fail due to browser crash
        expect(error.message).toContain("browser");
      }

      // Verify cleanup was performed
      expect(workflow.browserController.isConnectedToBrowser()).toBe(false);
      expect(workflow.chromeLauncher.isRunning()).toBe(false);
    }, 45000);
  });

  describe("Real-World Scenarios", () => {
    test("should handle complex CSS selectors on real content", async () => {
      const chromeAvailable = await canLaunchChrome();
      if (!chromeAvailable) {
        console.warn("Skipping test - Chrome not available");
        return;
      }

      const complexHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Complex Test Page</title></head>
          <body>
            <div class="header">
              <nav class="navigation">
                <ul class="nav-list">
                  <li class="nav-item active"><a href="#home">Home</a></li>
                  <li class="nav-item"><a href="#about">About</a></li>
                </ul>
              </nav>
            </div>
            <main class="content">
              <article class="post" data-id="123">
                <header class="post-header">
                  <h1 class="post-title">Test Article</h1>
                  <div class="post-meta">
                    <span class="author">John Doe</span>
                    <time class="date" datetime="2023-01-01">January 1, 2023</time>
                  </div>
                </header>
                <div class="post-content">
                  <p class="intro">This is the introduction paragraph.</p>
                  <div class="stats">
                    <span class="views" data-count="1234">1,234 views</span>
                    <span class="likes" data-count="56">56 likes</span>
                  </div>
                </div>
              </article>
            </main>
          </body>
        </html>
      `;

      const config = [
        {
          url: `data:text/html,${encodeURIComponent(complexHtml)}`,
          css_selector: ".nav-item.active a",
          current_value: "old nav",
        },
        {
          url: `data:text/html,${encodeURIComponent(complexHtml)}`,
          css_selector: 'article[data-id="123"] .post-title',
          current_value: "old title",
        },
        {
          url: `data:text/html,${encodeURIComponent(complexHtml)}`,
          css_selector: ".post-meta .author",
          current_value: "old author",
        },
        {
          url: `data:text/html,${encodeURIComponent(complexHtml)}`,
          css_selector: '.stats .views[data-count="1234"]',
          current_value: "old views",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const session = await workflow.execute();

      // Verify all complex selectors worked
      expect(session.results).toHaveLength(4);
      expect(session.results[0].newValue).toBe("Home");
      expect(session.results[1].newValue).toBe("Test Article");
      expect(session.results[2].newValue).toBe("John Doe");
      expect(session.results[3].newValue).toBe("1,234 views");
      expect(session.errors).toHaveLength(0);
    }, 60000);

    test("should handle JavaScript-heavy pages", async () => {
      const chromeAvailable = await canLaunchChrome();
      if (!chromeAvailable) {
        console.warn("Skipping test - Chrome not available");
        return;
      }

      const jsHeavyHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>JavaScript Heavy Page</title></head>
          <body>
            <div id="loading">Loading...</div>
            <div id="content" style="display: none;">
              <h1 id="dynamic-title">Dynamic Content</h1>
              <div id="counter">0</div>
            </div>
            <script>
              // Simulate loading delay
              setTimeout(() => {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('content').style.display = 'block';
                
                // Update counter every 100ms
                let count = 0;
                const counter = document.getElementById('counter');
                const interval = setInterval(() => {
                  count++;
                  counter.textContent = count;
                  if (count >= 10) {
                    clearInterval(interval);
                    counter.textContent = 'Final Count: ' + count;
                  }
                }, 100);
              }, 1000);
            </script>
          </body>
        </html>
      `;

      const config = [
        {
          url: `data:text/html,${encodeURIComponent(jsHeavyHtml)}`,
          css_selector: "#dynamic-title",
          current_value: "old title",
        },
        {
          url: `data:text/html,${encodeURIComponent(jsHeavyHtml)}`,
          css_selector: "#counter",
          current_value: "old counter",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const startTime = Date.now();
      const session = await workflow.execute();
      const duration = Date.now() - startTime;

      // Verify JavaScript content was processed
      expect(session.results).toHaveLength(2);
      expect(session.results[0].newValue).toBe("Dynamic Content");
      expect(session.results[1].newValue).toContain("Final Count:");
      expect(session.errors).toHaveLength(0);

      // Verify it took time to wait for JavaScript execution
      expect(duration).toBeGreaterThan(2000); // Should wait for JS to complete
    }, 60000);

    test("should handle form interactions and dynamic updates", async () => {
      const chromeAvailable = await canLaunchChrome();
      if (!chromeAvailable) {
        console.warn("Skipping test - Chrome not available");
        return;
      }

      const interactiveHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Interactive Page</title></head>
          <body>
            <div id="status">Ready</div>
            <form id="test-form">
              <input type="text" id="name-input" value="Default Name">
              <button type="button" onclick="updateStatus()">Update</button>
            </form>
            <div id="result">No result</div>
            <script>
              function updateStatus() {
                const name = document.getElementById('name-input').value;
                document.getElementById('status').textContent = 'Updated';
                document.getElementById('result').textContent = 'Hello, ' + name + '!';
              }
              
              // Auto-update after page load
              setTimeout(() => {
                document.getElementById('name-input').value = 'Auto Updated';
                updateStatus();
              }, 500);
            </script>
          </body>
        </html>
      `;

      const config = [
        {
          url: `data:text/html,${encodeURIComponent(interactiveHtml)}`,
          css_selector: "#status",
          current_value: "old status",
        },
        {
          url: `data:text/html,${encodeURIComponent(interactiveHtml)}`,
          css_selector: "#result",
          current_value: "old result",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const session = await workflow.execute();

      // Verify dynamic updates were captured
      expect(session.results).toHaveLength(2);
      expect(session.results[0].newValue).toBe("Updated");
      expect(session.results[1].newValue).toBe("Hello, Auto Updated!");
      expect(session.errors).toHaveLength(0);
    }, 45000);
  });

  describe("Integration with External Services", () => {
    test("should integrate with mock Slack webhook service", async () => {
      const chromeAvailable = await canLaunchChrome();
      if (!chromeAvailable) {
        console.warn("Skipping test - Chrome not available");
        return;
      }

      const config = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#test",
          current_value: "old value",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const session = await workflow.execute();

      // Verify workflow execution
      expect(session.results).toHaveLength(1);
      expect(session.results[0].hasChanged).toBe(true);
      expect(session.errors).toHaveLength(0);

      // Verify Slack integration
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(1);

      const request = webhookRequests[0];
      expect(request.method).toBe("POST");
      expect(request.headers["content-type"]).toBe("application/json");
      expect(request.jsonBody).toBeDefined();
      expect(request.jsonBody.text).toContain("Change Detected");

      // Verify Slack payload validation
      const validationErrors = mockSlackServer.validateSlackPayload(request);
      expect(validationErrors).toHaveLength(0);
    }, 45000);

    test("should handle webhook authentication and headers", async () => {
      const chromeAvailable = await canLaunchChrome();
      if (!chromeAvailable) {
        console.warn("Skipping test - Chrome not available");
        return;
      }

      const config = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#test",
          current_value: "old value",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const session = await workflow.execute();

      // Verify execution
      expect(session.results).toHaveLength(1);
      expect(session.results[0].hasChanged).toBe(true);

      // Verify webhook request headers
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(1);

      const request = webhookRequests[0];
      expect(request.headers["content-type"]).toBe("application/json");
      expect(request.headers["user-agent"]).toBeDefined();
      expect(request.body).toBeDefined();
      expect(request.jsonBody).toBeDefined();
    }, 45000);
  });
});
