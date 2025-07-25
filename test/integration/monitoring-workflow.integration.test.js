/**
 * Integration tests for complete monitoring workflow
 * Tests the entire system end-to-end with real components
 */

const fs = require("fs").promises;
const path = require("path");
const { MonitoringWorkflow } = require("../../detect-change");
const MockSlackServer = require("../fixtures/mock-slack-server");
const { validConfigs, mockWebPages } = require("../fixtures/test-configs");

describe("Monitoring Workflow Integration Tests", () => {
  let mockSlackServer;
  let tempConfigPath;
  let tempDir;

  beforeAll(async () => {
    // Create temporary directory for test files
    tempDir = path.join(__dirname, "..", "temp");
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Start mock Slack server
    mockSlackServer = new MockSlackServer(3001);
    await mockSlackServer.start();
  });

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
    // Clear mock server requests
    mockSlackServer.clearRequests();
    mockSlackServer.setResponse("/webhook", 200, "ok");

    // Create temporary config file
    tempConfigPath = path.join(tempDir, `test-config-${Date.now()}.json`);
  });

  afterEach(async () => {
    // Clean up temporary config file
    try {
      await fs.unlink(tempConfigPath);
    } catch (error) {
      // File might not exist
    }
  });

  describe("Complete Workflow Execution", () => {
    test("should execute complete workflow with single target successfully", async () => {
      // Create test configuration
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

      // Verify session results
      expect(session.results).toHaveLength(1);
      expect(session.results[0].hasChanged).toBe(true);
      expect(session.results[0].oldValue).toBe("old value");
      expect(session.results[0].newValue).toBe("test value");
      expect(session.errors).toHaveLength(0);

      // Verify Slack notification was sent
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(1);
      expect(webhookRequests[0].jsonBody.text).toContain("Change Detected");
      expect(webhookRequests[0].jsonBody.text).toContain("old value");
      expect(webhookRequests[0].jsonBody.text).toContain("test value");

      // Verify configuration was updated
      const updatedConfig = JSON.parse(
        await fs.readFile(tempConfigPath, "utf8")
      );
      expect(updatedConfig[0].current_value).toBe("test value");
    }, 30000);

    test("should handle multiple targets with mixed results", async () => {
      // Create test configuration with multiple targets
      const config = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#test",
          current_value: "old value", // Will change
        },
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#price",
          current_value: "$19.99", // Will not change
        },
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.changed)}`,
          css_selector: "#test",
          current_value: "test value", // Will change to 'new test value'
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const session = await workflow.execute();

      // Verify session results
      expect(session.results).toHaveLength(3);
      expect(session.results[0].hasChanged).toBe(true);
      expect(session.results[1].hasChanged).toBe(false);
      expect(session.results[2].hasChanged).toBe(true);
      expect(session.errors).toHaveLength(0);

      // Verify only 2 notifications were sent (for changes)
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(2);

      // Verify configuration was updated for changed values only
      const updatedConfig = JSON.parse(
        await fs.readFile(tempConfigPath, "utf8")
      );
      expect(updatedConfig[0].current_value).toBe("test value");
      expect(updatedConfig[1].current_value).toBe("$19.99"); // Unchanged
      expect(updatedConfig[2].current_value).toBe("new test value");
    }, 30000);

    test("should handle complex CSS selectors correctly", async () => {
      const config = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.complex)}`,
          css_selector: "div.container > .price:nth-child(2)",
          current_value: "old price",
        },
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.complex)}`,
          css_selector: '[data-testid="product-price"]',
          current_value: "old attribute price",
        },
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.complex)}`,
          css_selector: "li:first-child .text",
          current_value: "old first item",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const session = await workflow.execute();

      // Verify all selectors worked correctly
      expect(session.results).toHaveLength(3);
      expect(session.results[0].newValue).toBe("$29.99");
      expect(session.results[1].newValue).toBe("$39.99");
      expect(session.results[2].newValue).toBe("First Item");
      expect(session.errors).toHaveLength(0);
    }, 30000);
  });

  describe("Error Handling and Recovery", () => {
    test("should handle missing selectors gracefully", async () => {
      const config = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.missing)}`,
          css_selector: "#nonexistent",
          current_value: "old value",
        },
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

      // Verify error isolation - second target should still process
      expect(session.results).toHaveLength(2);
      expect(session.results[0].error).toBeDefined();
      expect(session.results[1].hasChanged).toBe(true);
      expect(session.errors).toHaveLength(1);

      // Verify only successful target sent notification
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(1);
    }, 30000);

    test("should handle Slack notification failures gracefully", async () => {
      // Configure mock server to return error
      mockSlackServer.simulateError("/webhook", "server_error");

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

      // Verify change was detected but notification failed
      expect(session.results).toHaveLength(1);
      expect(session.results[0].hasChanged).toBe(true);
      expect(session.errors).toHaveLength(1);
      expect(session.errors[0].type).toBe("NOTIFICATION_ERROR");

      // Verify configuration was still updated despite notification failure
      const updatedConfig = JSON.parse(
        await fs.readFile(tempConfigPath, "utf8")
      );
      expect(updatedConfig[0].current_value).toBe("test value");
    }, 30000);

    test("should handle invalid URLs gracefully", async () => {
      const config = [
        {
          url: "https://nonexistent-domain-12345.com",
          css_selector: "#test",
          current_value: "old value",
        },
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

      // Verify error isolation
      expect(session.results).toHaveLength(2);
      expect(session.results[0].error).toBeDefined();
      expect(session.results[1].hasChanged).toBe(true);
      expect(session.errors).toHaveLength(1);
    }, 30000);
  });

  describe("Performance and Resource Management", () => {
    test("should handle multiple targets efficiently", async () => {
      // Create configuration with 10 targets
      const config = Array.from({ length: 10 }, (_, i) => ({
        url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
        css_selector: "#test",
        current_value: `old value ${i}`,
      }));
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const startTime = Date.now();
      const session = await workflow.execute();
      const duration = Date.now() - startTime;

      // Verify all targets were processed
      expect(session.results).toHaveLength(10);
      expect(session.results.every((r) => r.hasChanged)).toBe(true);
      expect(session.errors).toHaveLength(0);

      // Verify reasonable performance (should complete within 30 seconds)
      expect(duration).toBeLessThan(30000);

      // Verify all notifications were sent
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(10);
    }, 45000);

    test("should properly clean up resources on completion", async () => {
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

      // Verify workflow completed successfully
      expect(session.results).toHaveLength(1);
      expect(session.errors).toHaveLength(0);

      // Verify resources were cleaned up
      expect(workflow.browserController.isConnectedToBrowser()).toBe(false);
      expect(workflow.chromeLauncher.isRunning()).toBe(false);
    }, 30000);

    test("should handle delayed content loading", async () => {
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

      const session = await workflow.execute();

      // Verify delayed content was detected
      expect(session.results).toHaveLength(1);
      expect(session.results[0].hasChanged).toBe(true);
      expect(session.results[0].newValue).toBe("Delayed content");
      expect(session.errors).toHaveLength(0);
    }, 30000);
  });

  describe("State Management and Persistence", () => {
    test("should maintain data integrity during updates", async () => {
      const originalConfig = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#test",
          current_value: "old value",
          metadata: "should be preserved",
        },
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#price",
          current_value: "$19.99",
          custom_field: "custom data",
        },
      ];
      await fs.writeFile(
        tempConfigPath,
        JSON.stringify(originalConfig, null, 2)
      );

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const session = await workflow.execute();

      // Verify changes were detected
      expect(session.results[0].hasChanged).toBe(true);
      expect(session.results[1].hasChanged).toBe(false);

      // Verify configuration structure was preserved
      const updatedConfig = JSON.parse(
        await fs.readFile(tempConfigPath, "utf8")
      );
      expect(updatedConfig).toHaveLength(2);
      expect(updatedConfig[0].current_value).toBe("test value");
      expect(updatedConfig[0].metadata).toBe("should be preserved");
      expect(updatedConfig[1].current_value).toBe("$19.99");
      expect(updatedConfig[1].custom_field).toBe("custom data");
    }, 30000);

    test("should handle concurrent access to configuration file", async () => {
      const config = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#test",
          current_value: "old value",
        },
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      // Start two workflows simultaneously
      const workflow1 = new MonitoringWorkflow();
      const workflow2 = new MonitoringWorkflow();

      await workflow1.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );
      await workflow2.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      // Execute both workflows
      const [session1, session2] = await Promise.allSettled([
        workflow1.execute(),
        workflow2.execute(),
      ]);

      // At least one should succeed
      const successfulSessions = [session1, session2].filter(
        (s) => s.status === "fulfilled"
      );
      expect(successfulSessions.length).toBeGreaterThan(0);

      // Verify final configuration state is consistent
      const finalConfig = JSON.parse(await fs.readFile(tempConfigPath, "utf8"));
      expect(finalConfig[0].current_value).toBe("test value");
    }, 45000);
  });

  describe("Notification System Integration", () => {
    test("should send properly formatted Slack notifications", async () => {
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

      await workflow.execute();

      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(1);

      const payload = webhookRequests[0].jsonBody;
      const validationErrors = mockSlackServer.validateSlackPayload(
        webhookRequests[0]
      );
      expect(validationErrors).toHaveLength(0);

      // Verify notification content
      expect(payload.text).toContain("Change Detected");
      expect(payload.text).toContain("URL:");
      expect(payload.text).toContain("Selector: #test");
      expect(payload.text).toContain("Was: old value");
      expect(payload.text).toContain("Now: test value");
      expect(payload.text).toContain("Checked:");
    }, 30000);

    test("should handle notification rate limiting", async () => {
      // Configure mock server to simulate rate limiting
      mockSlackServer.simulateError("/webhook", "rate_limit");

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

      // Verify change was detected but notification failed due to rate limiting
      expect(session.results[0].hasChanged).toBe(true);
      expect(session.errors).toHaveLength(1);
      expect(session.errors[0].type).toBe("NOTIFICATION_ERROR");

      // Verify webhook was attempted
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(1);
    }, 30000);
  });
});
