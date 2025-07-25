/**
 * Integration tests for error scenarios
 * Tests network failures, browser crashes, and file system issues
 */

const fs = require("fs").promises;
const path = require("path");
const { MonitoringWorkflow } = require("../../detect-change");
const MockSlackServer = require("../fixtures/mock-slack-server");
const {
  validConfigs,
  invalidConfigs,
  mockWebPages,
} = require("../fixtures/test-configs");

describe("Error Scenarios Integration Tests", () => {
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
    mockSlackServer = new MockSlackServer(3002);
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
    tempConfigPath = path.join(tempDir, `error-test-config-${Date.now()}.json`);
  });

  afterEach(async () => {
    // Clean up temporary config file
    try {
      await fs.unlink(tempConfigPath);
    } catch (error) {
      // File might not exist
    }
  });

  describe("Network Failure Scenarios", () => {
    test("should handle DNS resolution failures", async () => {
      const config = [
        {
          url: "https://nonexistent-domain-12345.invalid",
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

      // Verify error isolation - second target should still process
      expect(session.results).toHaveLength(2);
      expect(session.results[0].error).toBeDefined();
      expect(session.results[0].error).toContain("navigation");
      expect(session.results[1].hasChanged).toBe(true);
      expect(session.errors).toHaveLength(1);
      expect(session.errors[0].type).toBe("TARGET_ERROR");

      // Verify successful target still sent notification
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(1);
    }, 30000);

    test("should handle connection timeouts", async () => {
      // Use a non-routable IP address to simulate timeout
      const config = [
        {
          url: "http://10.255.255.1:8080/timeout-test",
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

      // Verify timeout was handled gracefully
      expect(session.results).toHaveLength(1);
      expect(session.results[0].error).toBeDefined();
      expect(session.errors).toHaveLength(1);
      expect(session.errors[0].type).toBe("TARGET_ERROR");

      // Verify no notifications were sent for failed target
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(0);
    }, 45000);

    test("should handle HTTP error responses", async () => {
      const config = [
        {
          url: "https://httpstat.us/404",
          css_selector: "#test",
          current_value: "old value",
        },
        {
          url: "https://httpstat.us/500",
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

      // Verify both HTTP errors were handled
      expect(session.results).toHaveLength(2);
      expect(session.results[0].error).toBeDefined();
      expect(session.results[1].error).toBeDefined();
      expect(session.errors).toHaveLength(2);

      // Verify no notifications were sent for failed targets
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(0);
    }, 30000);

    test("should handle Slack webhook network failures", async () => {
      // Stop the mock server to simulate network failure
      await mockSlackServer.stop();

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

      // Restart server for cleanup
      await mockSlackServer.start();
    }, 30000);
  });

  describe("Browser Crash and Recovery Scenarios", () => {
    test("should handle Chrome launch failures gracefully", async () => {
      const config = validConfigs.single;
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      // Mock Chrome launcher to simulate launch failure
      const originalLaunch = workflow.chromeLauncher.launch;
      workflow.chromeLauncher.launch = jest
        .fn()
        .mockRejectedValue(new Error("Chrome executable not found"));

      await expect(workflow.execute()).rejects.toThrow(
        "Chrome executable not found"
      );

      // Verify cleanup was attempted
      expect(workflow.browserController.isConnectedToBrowser()).toBe(false);
      expect(workflow.chromeLauncher.isRunning()).toBe(false);

      // Restore original method
      workflow.chromeLauncher.launch = originalLaunch;
    }, 30000);

    test("should handle browser connection failures", async () => {
      const config = validConfigs.single;
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      // Mock browser controller to simulate connection failure
      const originalConnect = workflow.browserController.connect;
      workflow.browserController.connect = jest
        .fn()
        .mockRejectedValue(new Error("Failed to connect to Chrome debug port"));

      await expect(workflow.execute()).rejects.toThrow(
        "Failed to connect to Chrome debug port"
      );

      // Restore original method
      workflow.browserController.connect = originalConnect;
    }, 30000);

    test("should handle page creation failures", async () => {
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

      // Start the workflow normally
      await workflow.configManager.loadConfig(tempConfigPath);
      const debugUrl = await workflow.chromeLauncher.launch();
      await workflow.browserController.connect(debugUrl);

      // Mock page creation to fail
      const originalCreatePage = workflow.browserController.createPage;
      workflow.browserController.createPage = jest
        .fn()
        .mockRejectedValue(new Error("Failed to create new page"));

      // Process targets should handle page creation failure
      const session = await workflow.processMonitoringTargets();

      expect(session.results).toHaveLength(1);
      expect(session.results[0].error).toBeDefined();
      expect(session.errors).toHaveLength(1);

      // Cleanup
      workflow.browserController.createPage = originalCreatePage;
      await workflow.cleanup();
    }, 30000);
  });

  describe("File System Error Scenarios", () => {
    test("should handle missing configuration file", async () => {
      const nonExistentPath = path.join(tempDir, "nonexistent-config.json");

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        nonExistentPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      await expect(workflow.execute()).rejects.toThrow();
    }, 30000);

    test("should handle invalid JSON configuration", async () => {
      // Write invalid JSON to config file
      await fs.writeFile(tempConfigPath, "{ invalid json content }");

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      await expect(workflow.execute()).rejects.toThrow();
    }, 30000);

    test("should handle configuration file permission errors", async () => {
      const config = validConfigs.single;
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      // Make file read-only to simulate permission error
      await fs.chmod(tempConfigPath, 0o444);

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const session = await workflow.execute();

      // Should be able to read but not write
      expect(session.results).toHaveLength(1);

      // Restore permissions for cleanup
      await fs.chmod(tempConfigPath, 0o644);
    }, 30000);

    test("should handle disk space issues during config save", async () => {
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

      // Mock state manager to simulate disk space error
      const originalPersist = workflow.stateManager.persistConfig;
      workflow.stateManager.persistConfig = jest
        .fn()
        .mockRejectedValue(new Error("ENOSPC: no space left on device"));

      const session = await workflow.execute();

      // Change should be detected but persistence should fail
      expect(session.results).toHaveLength(1);
      expect(session.results[0].hasChanged).toBe(true);
      expect(session.errors).toHaveLength(1);
      expect(session.errors[0].type).toBe("PERSISTENCE_ERROR");

      // Restore original method
      workflow.stateManager.persistConfig = originalPersist;
    }, 30000);
  });

  describe("Invalid Configuration Scenarios", () => {
    test("should handle empty configuration array", async () => {
      await fs.writeFile(
        tempConfigPath,
        JSON.stringify(invalidConfigs.emptyArray, null, 2)
      );

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const session = await workflow.execute();

      expect(session.results).toHaveLength(0);
      expect(session.errors).toHaveLength(0);
    }, 30000);

    test("should handle configuration with missing required fields", async () => {
      await fs.writeFile(
        tempConfigPath,
        JSON.stringify(invalidConfigs.missingUrl, null, 2)
      );

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      await expect(workflow.execute()).rejects.toThrow();
    }, 30000);

    test("should handle invalid CSS selectors", async () => {
      const config = [
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "invalid>>selector<<<",
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

      // Invalid selector should fail, valid one should succeed
      expect(session.results).toHaveLength(2);
      expect(session.results[0].error).toBeDefined();
      expect(session.results[1].hasChanged).toBe(true);
      expect(session.errors).toHaveLength(1);
    }, 30000);
  });

  describe("Resource Exhaustion Scenarios", () => {
    test("should handle memory pressure gracefully", async () => {
      // Create a large configuration to stress memory
      const config = Array.from({ length: 100 }, (_, i) => ({
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

      const session = await workflow.execute();

      // Should handle large configuration without crashing
      expect(session.results).toHaveLength(100);
      expect(session.results.every((r) => r.hasChanged || r.error)).toBe(true);

      // Verify cleanup was performed
      expect(workflow.browserController.isConnectedToBrowser()).toBe(false);
      expect(workflow.chromeLauncher.isRunning()).toBe(false);
    }, 60000);

    test("should handle concurrent page processing limits", async () => {
      // Create configuration with many targets
      const config = Array.from({ length: 20 }, (_, i) => ({
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

      // Should complete all targets
      expect(session.results).toHaveLength(20);
      expect(session.results.every((r) => r.hasChanged || r.error)).toBe(true);

      // Should complete in reasonable time (sequential processing)
      expect(duration).toBeLessThan(60000);
    }, 75000);
  });

  describe("Recovery and Cleanup Scenarios", () => {
    test("should recover from partial failures", async () => {
      const config = [
        {
          url: "https://nonexistent-domain.invalid",
          css_selector: "#test",
          current_value: "old value",
        },
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
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

      // Should process all targets despite failures
      expect(session.results).toHaveLength(3);
      expect(session.results[0].error).toBeDefined(); // Network failure
      expect(session.results[1].error).toBeDefined(); // Selector not found
      expect(session.results[2].hasChanged).toBe(true); // Success
      expect(session.errors).toHaveLength(2);

      // Should send notification for successful target
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(1);

      // Should update config for successful target only
      const updatedConfig = JSON.parse(
        await fs.readFile(tempConfigPath, "utf8")
      );
      expect(updatedConfig[0].current_value).toBe("old value"); // Unchanged due to error
      expect(updatedConfig[1].current_value).toBe("old value"); // Unchanged due to error
      expect(updatedConfig[2].current_value).toBe("test value"); // Updated
    }, 45000);

    test("should ensure cleanup on unexpected errors", async () => {
      const config = validConfigs.single;
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      // Start workflow
      await workflow.configManager.loadConfig(tempConfigPath);
      const debugUrl = await workflow.chromeLauncher.launch();
      await workflow.browserController.connect(debugUrl);

      // Simulate unexpected error during processing
      const originalProcess = workflow.processMonitoringTargets;
      workflow.processMonitoringTargets = jest
        .fn()
        .mockRejectedValue(new Error("Unexpected processing error"));

      await expect(workflow.execute()).rejects.toThrow(
        "Unexpected processing error"
      );

      // Verify cleanup was performed despite error
      expect(workflow.browserController.isConnectedToBrowser()).toBe(false);
      expect(workflow.chromeLauncher.isRunning()).toBe(false);

      // Restore original method
      workflow.processMonitoringTargets = originalProcess;
    }, 30000);
  });
});
