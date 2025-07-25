/**
 * Performance integration tests
 * Tests multiple entries, resource usage, and performance characteristics
 */

const fs = require("fs").promises;
const path = require("path");
const { MonitoringWorkflow } = require("../../detect-change");
const MockSlackServer = require("../fixtures/mock-slack-server");
const { validConfigs, mockWebPages } = require("../fixtures/test-configs");

describe("Performance Integration Tests", () => {
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
    mockSlackServer = new MockSlackServer(3003);
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
    tempConfigPath = path.join(tempDir, `perf-test-config-${Date.now()}.json`);
  });

  afterEach(async () => {
    // Clean up temporary config file
    try {
      await fs.unlink(tempConfigPath);
    } catch (error) {
      // File might not exist
    }
  });

  describe("Multiple Entry Performance", () => {
    test("should handle 10 entries efficiently", async () => {
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

      const startTime = process.hrtime.bigint();
      const startMemory = process.memoryUsage();

      const session = await workflow.execute();

      const endTime = process.hrtime.bigint();
      const endMemory = process.memoryUsage();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

      // Verify all entries were processed
      expect(session.results).toHaveLength(10);
      expect(session.results.every((r) => r.hasChanged)).toBe(true);
      expect(session.errors).toHaveLength(0);

      // Performance assertions
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      expect(memoryDelta).toBeLessThan(100 * 1024 * 1024); // Should not use more than 100MB additional memory

      // Verify all notifications were sent
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(10);

      console.log(`Performance metrics for 10 entries:
        Duration: ${duration.toFixed(2)}ms
        Memory delta: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB
        Average time per entry: ${(duration / 10).toFixed(2)}ms`);
    }, 45000);

    test("should handle 25 entries with reasonable performance", async () => {
      const config = Array.from({ length: 25 }, (_, i) => ({
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

      const startTime = process.hrtime.bigint();
      const startMemory = process.memoryUsage();

      const session = await workflow.execute();

      const endTime = process.hrtime.bigint();
      const endMemory = process.memoryUsage();
      const duration = Number(endTime - startTime) / 1000000;
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

      // Verify all entries were processed
      expect(session.results).toHaveLength(25);
      expect(session.results.every((r) => r.hasChanged)).toBe(true);
      expect(session.errors).toHaveLength(0);

      // Performance assertions
      expect(duration).toBeLessThan(60000); // Should complete within 60 seconds
      expect(memoryDelta).toBeLessThan(200 * 1024 * 1024); // Should not use more than 200MB additional memory

      // Verify linear scaling (should be roughly proportional to entry count)
      const avgTimePerEntry = duration / 25;
      expect(avgTimePerEntry).toBeLessThan(3000); // Should average less than 3 seconds per entry

      console.log(`Performance metrics for 25 entries:
        Duration: ${duration.toFixed(2)}ms
        Memory delta: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB
        Average time per entry: ${avgTimePerEntry.toFixed(2)}ms`);
    }, 75000);

    test("should handle 50 entries with acceptable performance degradation", async () => {
      const config = Array.from({ length: 50 }, (_, i) => ({
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

      const startTime = process.hrtime.bigint();
      const startMemory = process.memoryUsage();

      const session = await workflow.execute();

      const endTime = process.hrtime.bigint();
      const endMemory = process.memoryUsage();
      const duration = Number(endTime - startTime) / 1000000;
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

      // Verify all entries were processed
      expect(session.results).toHaveLength(50);
      expect(session.results.every((r) => r.hasChanged)).toBe(true);
      expect(session.errors).toHaveLength(0);

      // Performance assertions (more lenient for larger dataset)
      expect(duration).toBeLessThan(120000); // Should complete within 2 minutes
      expect(memoryDelta).toBeLessThan(500 * 1024 * 1024); // Should not use more than 500MB additional memory

      const avgTimePerEntry = duration / 50;
      expect(avgTimePerEntry).toBeLessThan(3000); // Should maintain reasonable per-entry performance

      console.log(`Performance metrics for 50 entries:
        Duration: ${duration.toFixed(2)}ms
        Memory delta: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB
        Average time per entry: ${avgTimePerEntry.toFixed(2)}ms`);
    }, 150000);
  });

  describe("Resource Usage Patterns", () => {
    test("should maintain stable memory usage across multiple runs", async () => {
      const config = Array.from({ length: 5 }, (_, i) => ({
        url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
        css_selector: "#test",
        current_value: `old value ${i}`,
      }));
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const memoryUsages = [];
      const durations = [];

      // Run workflow multiple times to check for memory leaks
      for (let run = 0; run < 3; run++) {
        const workflow = new MonitoringWorkflow();
        await workflow.initialize(
          tempConfigPath,
          mockSlackServer.getWebhookUrl("/webhook")
        );

        const startTime = process.hrtime.bigint();
        const startMemory = process.memoryUsage();

        const session = await workflow.execute();

        const endTime = process.hrtime.bigint();
        const endMemory = process.memoryUsage();
        const duration = Number(endTime - startTime) / 1000000;
        const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

        memoryUsages.push(memoryDelta);
        durations.push(duration);

        // Verify consistent results
        expect(session.results).toHaveLength(5);
        expect(session.results.every((r) => r.hasChanged)).toBe(true);
        expect(session.errors).toHaveLength(0);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        // Wait between runs to allow cleanup
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Verify memory usage doesn't grow significantly between runs
      const maxMemoryUsage = Math.max(...memoryUsages);
      const minMemoryUsage = Math.min(...memoryUsages);
      const memoryGrowth = maxMemoryUsage - minMemoryUsage;

      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // Memory growth should be less than 50MB

      // Verify performance remains consistent
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);
      const performanceVariation = (maxDuration - minDuration) / minDuration;

      expect(performanceVariation).toBeLessThan(0.5); // Performance variation should be less than 50%

      console.log(`Resource stability metrics:
        Memory usage range: ${(minMemoryUsage / 1024 / 1024).toFixed(2)}MB - ${(
        maxMemoryUsage /
        1024 /
        1024
      ).toFixed(2)}MB
        Duration range: ${minDuration.toFixed(2)}ms - ${maxDuration.toFixed(
        2
      )}ms
        Performance variation: ${(performanceVariation * 100).toFixed(2)}%`);
    }, 90000);

    test("should handle mixed content types efficiently", async () => {
      const config = [
        // Simple HTML
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#test",
          current_value: "old value",
        },
        // Complex HTML with multiple selectors
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.complex)}`,
          css_selector: "div.container > .price:nth-child(2)",
          current_value: "old price",
        },
        // Delayed content
        {
          url: `data:text/html,${encodeURIComponent(mockWebPages.delayed)}`,
          css_selector: "#delayed",
          current_value: "old delayed",
        },
        // Multiple entries of the same type
        ...Array.from({ length: 7 }, (_, i) => ({
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#test",
          current_value: `old value ${i}`,
        })),
      ];
      await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      const workflow = new MonitoringWorkflow();
      await workflow.initialize(
        tempConfigPath,
        mockSlackServer.getWebhookUrl("/webhook")
      );

      const startTime = process.hrtime.bigint();
      const session = await workflow.execute();
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      // Verify all entries were processed
      expect(session.results).toHaveLength(10);
      expect(session.results.every((r) => r.hasChanged)).toBe(true);
      expect(session.errors).toHaveLength(0);

      // Verify reasonable performance for mixed content
      expect(duration).toBeLessThan(45000); // Should complete within 45 seconds

      console.log(
        `Mixed content performance: ${duration.toFixed(
          2
        )}ms for 10 mixed entries`
      );
    }, 60000);
  });

  describe("Concurrent Processing Limits", () => {
    test("should handle sequential processing efficiently", async () => {
      const config = Array.from({ length: 15 }, (_, i) => ({
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

      const startTime = process.hrtime.bigint();
      const session = await workflow.execute();
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      // Verify all entries were processed
      expect(session.results).toHaveLength(15);
      expect(session.results.every((r) => r.hasChanged)).toBe(true);
      expect(session.errors).toHaveLength(0);

      // Verify sequential processing characteristics
      // Sequential processing should show linear time scaling
      const avgTimePerEntry = duration / 15;
      expect(avgTimePerEntry).toBeGreaterThan(500); // Should take at least 500ms per entry (realistic for page loading)
      expect(avgTimePerEntry).toBeLessThan(4000); // Should not take more than 4 seconds per entry

      console.log(`Sequential processing metrics:
        Total duration: ${duration.toFixed(2)}ms
        Average per entry: ${avgTimePerEntry.toFixed(2)}ms
        Entries per second: ${(15000 / duration).toFixed(2)}`);
    }, 75000);

    test("should maintain browser stability under load", async () => {
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

      const session = await workflow.execute();

      // Verify browser remained stable throughout processing
      expect(session.results).toHaveLength(20);
      expect(session.results.every((r) => r.hasChanged)).toBe(true);
      expect(session.errors).toHaveLength(0);

      // Verify browser was properly cleaned up
      expect(workflow.browserController.isConnectedToBrowser()).toBe(false);
      expect(workflow.chromeLauncher.isRunning()).toBe(false);

      // Verify all notifications were sent
      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(20);
    }, 90000);
  });

  describe("Notification Performance", () => {
    test("should handle high notification volume efficiently", async () => {
      const config = Array.from({ length: 30 }, (_, i) => ({
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

      const startTime = process.hrtime.bigint();
      const session = await workflow.execute();
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      // Verify all changes were detected and notifications sent
      expect(session.results).toHaveLength(30);
      expect(session.results.every((r) => r.hasChanged)).toBe(true);
      expect(session.errors).toHaveLength(0);

      const webhookRequests = mockSlackServer.getRequestsForPath("/webhook");
      expect(webhookRequests).toHaveLength(30);

      // Verify notification performance
      const notificationTime = duration; // Notifications are part of overall workflow
      const avgNotificationTime = notificationTime / 30;
      expect(avgNotificationTime).toBeLessThan(1000); // Should average less than 1 second per notification

      console.log(`Notification performance metrics:
        Total notifications: 30
        Total time: ${duration.toFixed(2)}ms
        Average per notification: ${avgNotificationTime.toFixed(2)}ms`);
    }, 120000);

    test("should handle notification failures without performance degradation", async () => {
      // Configure some notifications to fail
      mockSlackServer.setResponse("/webhook", 500, { error: "Server Error" });

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

      const startTime = process.hrtime.bigint();
      const session = await workflow.execute();
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      // Verify changes were detected despite notification failures
      expect(session.results).toHaveLength(10);
      expect(session.results.every((r) => r.hasChanged)).toBe(true);
      expect(session.errors).toHaveLength(10); // All notifications should fail

      // Verify performance wasn't significantly impacted by failures
      const avgTimePerEntry = duration / 10;
      expect(avgTimePerEntry).toBeLessThan(5000); // Should still complete reasonably quickly

      // Verify configuration was still updated
      const updatedConfig = JSON.parse(
        await fs.readFile(tempConfigPath, "utf8")
      );
      expect(
        updatedConfig.every((entry) => entry.current_value === "test value")
      ).toBe(true);

      console.log(
        `Failure handling performance: ${duration.toFixed(
          2
        )}ms with 10 notification failures`
      );
    }, 60000);
  });

  describe("Scalability Characteristics", () => {
    test("should demonstrate linear scaling characteristics", async () => {
      const testSizes = [5, 10, 15];
      const results = [];

      for (const size of testSizes) {
        const config = Array.from({ length: size }, (_, i) => ({
          url: `data:text/html,${encodeURIComponent(mockWebPages.simple)}`,
          css_selector: "#test",
          current_value: `old value ${i}`,
        }));

        const testConfigPath = path.join(
          tempDir,
          `scaling-test-${size}-${Date.now()}.json`
        );
        await fs.writeFile(testConfigPath, JSON.stringify(config, null, 2));

        const workflow = new MonitoringWorkflow();
        await workflow.initialize(
          testConfigPath,
          mockSlackServer.getWebhookUrl("/webhook")
        );

        const startTime = process.hrtime.bigint();
        const session = await workflow.execute();
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;

        results.push({
          size,
          duration,
          avgPerEntry: duration / size,
          success: session.results.every((r) => r.hasChanged),
          errors: session.errors.length,
        });

        // Cleanup
        await fs.unlink(testConfigPath);

        // Clear mock server requests between tests
        mockSlackServer.clearRequests();
      }

      // Verify all tests succeeded
      expect(results.every((r) => r.success && r.errors === 0)).toBe(true);

      // Verify roughly linear scaling (allowing for some variance)
      const baselinePerEntry = results[0].avgPerEntry;
      for (let i = 1; i < results.length; i++) {
        const scalingFactor = results[i].avgPerEntry / baselinePerEntry;
        expect(scalingFactor).toBeLessThan(2.0); // Should not more than double per entry time
        expect(scalingFactor).toBeGreaterThan(0.5); // Should not be significantly faster (unrealistic)
      }

      console.log("Scaling characteristics:");
      results.forEach((r) => {
        console.log(
          `  ${r.size} entries: ${r.duration.toFixed(
            2
          )}ms total, ${r.avgPerEntry.toFixed(2)}ms per entry`
        );
      });
    }, 120000);
  });
});
