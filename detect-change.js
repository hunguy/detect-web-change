#!/usr/bin/env node

/**
 * Web Element Change Detector CLI
 *
 * A Node.js tool that monitors web pages for changes in specific DOM elements
 * and provides automated notifications when changes occur.
 */

require("dotenv").config();
const CLIController = require("./src/cli");
const ConfigurationManager = require("./src/config");
const ChromeLauncher = require("./src/chrome-launcher");
const BrowserController = require("./src/browser-controller");
const PageMonitor = require("./src/page-monitor");
const ChangeDetector = require("./src/change-detector");
const SlackNotifier = require("./src/slack-notifier");
const StateManager = require("./src/state-manager");
const Logger = require("./src/logger");
const { ErrorHandler } = require("./src/error-handler");

/**
 * Main monitoring workflow orchestration class
 */
class MonitoringWorkflow {
  constructor() {
    this.configManager = new ConfigurationManager();
    this.chromeLauncher = new ChromeLauncher();
    this.browserController = new BrowserController();
    this.pageMonitor = new PageMonitor();
    this.changeDetector = new ChangeDetector();
    this.stateManager = new StateManager();
    this.slackNotifier = null;
    this.logger = new Logger();
    this.errorHandler = new ErrorHandler();

    // Session tracking
    this.session = {
      startTime: new Date(),
      endTime: null,
      results: [],
      errors: [],
      configPath: null,
      slackWebhook: null,
    };
  }

  /**
   * Initialize the monitoring workflow with configuration
   * @param {string} configPath - Path to configuration file
   * @param {string} slackWebhook - Optional Slack webhook URL
   */
  async initialize(configPath, slackWebhook) {
    this.session.configPath = configPath;
    this.session.slackWebhook = slackWebhook;

    if (slackWebhook) {
      this.slackNotifier = new SlackNotifier(slackWebhook);
    }
  }

  /**
   * Execute the complete monitoring workflow
   * @returns {Promise<Object>} Session results
   */
  async execute() {
    let config = null;

    try {
      this.logger.info("Loading configuration...");
      config = await this.configManager.loadConfig(this.session.configPath);
      const targets = this.configManager.getTargets(config);
      this.logger.success(`Loaded ${targets.length} monitoring targets`);

      // Use slack webhook from config if not provided via CLI
      if (!this.session.slackWebhook) {
        const configSlackWebhook = this.configManager.getSlackWebhook(config);
        if (configSlackWebhook) {
          this.session.slackWebhook = configSlackWebhook;
          this.slackNotifier = new SlackNotifier(configSlackWebhook);
          this.logger.info("Using Slack webhook from configuration file");
        }
      }

      this.logger.info("Launching Chrome browser...");
      const debugUrl = await this.chromeLauncher.launch();
      this.logger.success(`Chrome launched with debug URL: ${debugUrl}`);

      this.logger.info("Connecting to browser...");
      await this.browserController.connect(debugUrl);
      this.logger.success("Browser connection established");

      this.logger.info("Starting monitoring loop...");
      await this.processMonitoringTargets(targets);

      this.logger.success("Monitoring completed successfully");
      return this.session;
    } catch (error) {
      const categorizedError = this.errorHandler.handleError(error, {
        type: "workflow",
        operation: "execute",
      });

      this.session.errors.push({
        type: categorizedError.type,
        message: error.message,
        timestamp: new Date(),
        details: error,
        severity: categorizedError.severity,
      });

      // Always re-throw critical configuration and chrome errors
      if (
        categorizedError.type === "CONFIG_ERROR" ||
        categorizedError.type === "CHROME_ERROR"
      ) {
        throw error;
      }

      // For other errors, only re-throw if it's a critical error that should stop the workflow
      if (this.errorHandler.shouldStopWorkflow(categorizedError)) {
        throw error;
      }

      return this.session;
    } finally {
      // Ensure cleanup happens regardless of success or failure
      await this.cleanup();
      this.session.endTime = new Date();
    }
  }

  /**
   * Process all monitoring targets sequentially with error isolation
   * @param {Array} targets - Array of monitoring targets
   */
  async processMonitoringTargets(targets) {
    const changes = [];

    // Step 1: Process all targets and collect changes
    for (let i = 0; i < targets.length; i++) {
      const entry = targets[i];
      this.logger.info(
        `Processing target ${i + 1}/${targets.length}: ${entry.url}`
      );

      try {
        const result = await this.processMonitoringTarget(entry);
        this.session.results.push(result);

        if (result.hasChanged) {
          changes.push(result);
          this.logger.success(`Change detected for ${entry.url}`);
        } else {
          this.logger.info(`No change for ${entry.url}`);
        }
      } catch (error) {
        // Isolate errors - continue processing other targets (graceful degradation)
        const categorizedError = this.errorHandler.handleError(error, {
          type: "target",
          operation: "processMonitoringTarget",
          entry,
        });

        const errorResult = {
          entry: entry,
          hasChanged: false,
          error: error.message,
          timestamp: new Date().toISOString(),
          errorType: categorizedError.type,
          severity: categorizedError.severity,
        };

        this.session.results.push(errorResult);
        this.session.errors.push({
          type: categorizedError.type,
          message: error.message,
          entry: entry,
          timestamp: new Date(),
          details: error,
          severity: categorizedError.severity,
        });

        this.logger.failure(
          `Error processing ${entry.url}: ${categorizedError.userMessage}`
        );

        // Continue processing other targets unless it's a critical workflow error
        if (this.errorHandler.shouldStopWorkflow(categorizedError)) {
          throw error;
        }
      }
    }

    // Step 2: Send notifications for all changes before updating state
    if (changes.length > 0 && this.slackNotifier) {
      this.logger.info(
        `Sending notifications for ${changes.length} changes...`
      );
      await this.sendNotificationsForChanges(changes);
    }

    // Step 3: Update configuration with changes after notifications are sent
    if (changes.length > 0) {
      this.logger.info(
        `Updating configuration with ${changes.length} changes...`
      );
      try {
        await this.stateManager.updateAndPersist(
          this.session.configPath,
          targets,
          changes
        );
        this.logger.success("Configuration updated successfully");
      } catch (error) {
        const categorizedError = this.errorHandler.handleError(error, {
          type: "persistence",
          operation: "updateAndPersist",
        });

        this.session.errors.push({
          type: categorizedError.type,
          message: error.message,
          timestamp: new Date(),
          details: error,
          severity: categorizedError.severity,
        });

        this.logger.failure(
          `Error updating configuration: ${categorizedError.userMessage}`
        );
        throw error; // This is critical - fail the workflow if we can't persist
      }
    }
  }

  /**
   * Process a single monitoring target
   * @param {Object} entry - Configuration entry
   * @returns {Promise<Object>} Processing result
   */
  async processMonitoringTarget(entry) {
    let page = null;

    try {
      // Create a new page for this target
      page = await this.browserController.createPage();

      // Navigate and extract content
      const extractedValue = await this.pageMonitor.navigateAndExtract(
        page,
        entry.url,
        entry.css_selector
      );

      // Detect changes
      const result = this.changeDetector.processEntry(entry, extractedValue);

      return result;
    } finally {
      // Always clean up the page
      if (page) {
        await this.browserController.closePage(page);
      }
    }
  }

  /**
   * Send notifications for all detected changes with error isolation
   * @param {Array} changes - Array of change records
   */
  async sendNotificationsForChanges(changes) {
    let successCount = 0;
    let failureCount = 0;

    for (const change of changes) {
      try {
        const sent = await this.slackNotifier.sendChangeNotification(change);
        if (sent) {
          successCount++;
          this.logger.success(`Notification sent for ${change.entry.url}`);
        } else {
          failureCount++;
          this.logger.warn(`Notification failed for ${change.entry.url}`);
        }
      } catch (notificationError) {
        failureCount++;
        // Log notification errors but continue processing other notifications (graceful degradation)
        const categorizedError = this.errorHandler.handleError(
          notificationError,
          {
            type: "notification",
            operation: "sendChangeNotification",
            entry: change.entry,
          }
        );

        this.session.errors.push({
          type: categorizedError.type,
          message: notificationError.message,
          entry: change.entry,
          timestamp: new Date(),
          details: notificationError,
          severity: categorizedError.severity,
        });

        this.logger.failure(
          `Failed to send notification for ${change.entry.url}: ${categorizedError.userMessage}`
        );
      }
    }

    this.logger.info(
      `Notification summary: ${successCount} sent, ${failureCount} failed`
    );
  }

  /**
   * Clean up all resources
   */
  async cleanup() {
    this.logger.info("Cleaning up resources...");

    try {
      // Disconnect from browser
      if (this.browserController.isConnectedToBrowser()) {
        await this.browserController.disconnect();
        this.logger.success("Browser disconnected");
      }
    } catch (error) {
      this.logger.warn(`Error disconnecting browser: ${error.message}`);
    }

    try {
      // Terminate Chrome process
      if (this.chromeLauncher.isRunning()) {
        await this.chromeLauncher.terminate();
        this.logger.success("Chrome process terminated");
      }
    } catch (error) {
      this.logger.warn(`Error terminating Chrome: ${error.message}`);
    }
  }

  /**
   * Get session summary
   * @returns {Object} Session summary
   */
  getSessionSummary() {
    const duration = this.session.endTime
      ? this.session.endTime - this.session.startTime
      : Date.now() - this.session.startTime;

    const changes = this.session.results.filter((r) => r.hasChanged).length;
    const errors = this.session.errors.length;
    const total = this.session.results.length;
    const errorStats = this.errorHandler.getErrorStats();

    return {
      duration: Math.round(duration / 1000), // seconds
      total: total,
      changes: changes,
      errors: errors,
      success: errors === 0,
      errorStats: errorStats,
      criticalErrors: errorStats.criticalErrors,
      warnings: errorStats.mediumErrors + errorStats.lowErrors,
    };
  }
}

// Global workflow instance for signal handling
let globalWorkflow = null;
let isShuttingDown = false;

/**
 * Handle graceful shutdown on signals
 * @param {string} signal - Signal received
 */
async function handleShutdown(signal) {
  if (isShuttingDown) {
    console.log(`\nReceived ${signal} again, forcing exit...`);
    process.exit(2);
  }

  isShuttingDown = true;
  console.log(`\nReceived ${signal}, initiating graceful shutdown...`);

  if (globalWorkflow) {
    try {
      await globalWorkflow.cleanup();
      console.log("Cleanup completed successfully");
    } catch (error) {
      console.error(`Error during cleanup: ${error.message}`);
    }
  }

  // Exit with code 130 for SIGINT (Ctrl+C) or 143 for SIGTERM
  const exitCode = signal === "SIGINT" ? 130 : 143;
  process.exit(exitCode);
}

/**
 * Setup signal handlers for graceful shutdown
 */
function setupSignalHandlers() {
  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  // Handle uncaught exceptions and unhandled rejections
  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    if (globalWorkflow) {
      globalWorkflow.cleanup().finally(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    if (globalWorkflow) {
      globalWorkflow.cleanup().finally(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });
}

async function main() {
  const cli = new CLIController();
  const workflow = new MonitoringWorkflow();
  const logger = new Logger();

  // Set global workflow reference for signal handling
  globalWorkflow = workflow;

  // Setup signal handlers
  setupSignalHandlers();

  try {
    logger.info("Web Element Change Detector CLI v1.0.0");

    // Parse and validate CLI arguments
    const result = await cli.run();

    if (!result.success) {
      process.exit(result.exitCode);
    }

    const { inputPath, slackWebhook } = result.args;

    logger.info("Starting monitoring process...");
    logger.info(`Configuration file: ${inputPath}`);
    if (slackWebhook) {
      logger.info("Slack notifications: Enabled");
    } else {
      logger.info("Slack notifications: Disabled");
    }

    // Initialize and execute monitoring workflow
    await workflow.initialize(inputPath, slackWebhook);
    await workflow.execute();

    // Display session summary
    const summary = workflow.getSessionSummary();
    logger.info("\n=== Monitoring Session Summary ===");
    logger.info(`Duration: ${summary.duration}s`);
    logger.info(`Total targets: ${summary.total}`);
    logger.info(`Changes detected: ${summary.changes}`);
    logger.info(`Errors: ${summary.errors}`);
    if (summary.criticalErrors > 0) {
      logger.error(`Critical errors: ${summary.criticalErrors}`);
    }
    if (summary.warnings > 0) {
      logger.warn(`Warnings: ${summary.warnings}`);
    }

    const statusMessage = summary.success ? "SUCCESS" : "COMPLETED WITH ERRORS";
    if (summary.success) {
      logger.success(`Status: ${statusMessage}`);
    } else {
      logger.warn(`Status: ${statusMessage}`);
    }

    logger.success("Monitoring process completed");

    // Clear global reference
    globalWorkflow = null;

    // Exit with appropriate code: 0 for success, 1 for errors
    process.exit(summary.criticalErrors > 0 ? 1 : 0);
  } catch (error) {
    logger.failure(`Error during monitoring process: ${error.message}`);

    // Display session summary even on failure
    const summary = workflow.getSessionSummary();
    logger.info("\n=== Monitoring Session Summary (Failed) ===");
    logger.info(`Duration: ${summary.duration}s`);
    logger.info(`Total targets: ${summary.total}`);
    logger.info(`Changes detected: ${summary.changes}`);
    logger.info(`Errors: ${summary.errors}`);
    if (summary.errorStats) {
      logger.error(`Critical errors: ${summary.errorStats.criticalErrors}`);
      logger.warn(`High priority errors: ${summary.errorStats.highErrors}`);
      logger.warn(`Medium priority errors: ${summary.errorStats.mediumErrors}`);
      logger.info(`Low priority warnings: ${summary.errorStats.lowErrors}`);
    }

    // Clear global reference
    globalWorkflow = null;

    // Exit with error code 1
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = { main, MonitoringWorkflow };
