/**
 * CLI Controller for Web Element Change Detector
 *
 * Handles command-line argument parsing, validation, and usage display
 */

const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs").promises;
const path = require("path");
const Logger = require("./logger");
const { ErrorHandler } = require("./error-handler");

class CLIController {
  constructor() {
    this.args = null;
    this.logger = new Logger();
    this.errorHandler = new ErrorHandler();
  }

  /**
   * Parse and validate command-line arguments
   * @param {string[]} argv - Command line arguments
   * @returns {Object} Parsed arguments
   */
  parseArgs(argv = process.argv) {
    try {
      const args = yargs(hideBin(argv))
        .usage(
          "Usage: $0 --input <config-file> [--slack-webhook <webhook-url>]"
        )
        .option("input", {
          alias: "i",
          type: "string",
          describe: "Path to the input configuration JSON file",
          demandOption: true,
          requiresArg: true,
        })
        .option("slack-webhook", {
          alias: "s",
          type: "string",
          describe:
            "Slack webhook URL for notifications (can also be set via SLACK_WEBHOOK_URL environment variable)",
          requiresArg: true,
        })
        .help("help")
        .alias("help", "h")
        .version("1.0.0")
        .alias("version", "v")
        .example("$0 --input config.json", "Monitor using config.json file")
        .example(
          "$0 --input config.json --slack-webhook https://hooks.slack.com/...",
          "Monitor with Slack notifications via CLI"
        )
        .example(
          "SLACK_WEBHOOK_URL=https://hooks.slack.com/... $0 --input config.json",
          "Monitor using environment variable for Slack webhook"
        )
        .example(
          "$0 --input config.json",
          "Monitor with Slack webhook from config file"
        )
        .epilog(
          `
Configuration Format:
  The config file can be either:
  • Object format: {"slack_webhook": "...", "targets": [...]}
  • Legacy array format: [{"url": "...", "css_selector": "...", ...}]

System Requirements:
  • Node.js 16.0.0 or higher
  • Google Chrome or Chromium browser
  • Minimum 512MB available RAM
  • Write permissions to temporary directory

Exit Codes:
  0   Success - monitoring completed without critical errors
  1   Error - critical errors occurred during monitoring
  130 Interrupted - process was interrupted by SIGINT (Ctrl+C)
  143 Terminated - process was terminated by SIGTERM

For more information, visit: https://github.com/your-repo/web-element-change-detector
        `
        )
        .strict()
        .exitProcess(false) // Prevent yargs from calling process.exit
        .parseSync();

      this.args = args;
      return args;
    } catch (error) {
      // Re-throw yargs errors for proper handling
      throw error;
    }
  }

  /**
   * Validate parsed arguments
   * @param {Object} args - Parsed arguments
   * @returns {Promise<Object>} Validated arguments with resolved paths and webhook URL
   */
  async validateArgs(args) {
    const validatedArgs = { ...args };

    // Validate input file path
    if (!args.input) {
      throw new Error(
        "Input configuration file path is required. Use --input <file-path>"
      );
    }

    // Resolve input file path
    const inputPath = path.resolve(args.input);

    // Validate input file is JSON first (before checking file access)
    if (!inputPath.toLowerCase().endsWith(".json")) {
      throw new Error(`Input file must be a JSON file: ${inputPath}`);
    }

    try {
      await fs.access(inputPath, fs.constants.R_OK);
      validatedArgs.inputPath = inputPath;
    } catch (error) {
      throw new Error(
        `Cannot read input file: ${inputPath}. Please check the file exists and is readable.`
      );
    }

    // Handle Slack webhook URL - prioritize command line argument over environment variable
    const slackWebhook = args["slack-webhook"] || process.env.SLACK_WEBHOOK_URL;

    if (slackWebhook) {
      if (!this.isValidWebhookUrl(slackWebhook)) {
        throw new Error(
          `Invalid Slack webhook URL: ${slackWebhook}. Must be a valid HTTPS URL.`
        );
      }
      validatedArgs.slackWebhook = slackWebhook;
    }

    return validatedArgs;
  }

  /**
   * Validate Slack webhook URL format
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid webhook URL
   */
  isValidWebhookUrl(url) {
    try {
      const parsedUrl = new URL(url);
      return (
        parsedUrl.protocol === "https:" &&
        (parsedUrl.hostname === "hooks.slack.com" ||
          parsedUrl.hostname.endsWith(".slack.com"))
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Display usage information
   */
  displayUsage() {
    yargs()
      .usage("Usage: $0 --input <config-file> [--slack-webhook <webhook-url>]")
      .option("input", {
        alias: "i",
        type: "string",
        describe: "Path to the input configuration JSON file",
        demandOption: true,
      })
      .option("slack-webhook", {
        alias: "s",
        type: "string",
        describe: "Slack webhook URL for notifications",
      })
      .example("$0 --input config.json", "Monitor using config.json file")
      .example(
        "$0 --input config.json --slack-webhook https://hooks.slack.com/...",
        "Monitor with Slack notifications"
      )
      .showHelp();
  }

  /**
   * Handle and format errors appropriately
   * @param {Error} error - Error to handle
   * @returns {number} Exit code
   */
  handleError(error) {
    // Handle CLI-specific errors with backward compatibility
    if (error.message.includes("Missing required argument")) {
      console.error("Error: Missing required arguments");
      this.displayUsage();
      return 1;
    }

    if (error.message.includes("Unknown argument")) {
      console.error(`Error: ${error.message}`);
      this.displayUsage();
      return 1;
    }

    // For other errors, use the new error handling system but maintain backward compatibility
    if (error.message.includes("Cannot read input file")) {
      console.error(`Error: ${error.message}`);
      return 1;
    }

    // For generic errors, use the old format for backward compatibility
    console.error(`Error: ${error.message}`);
    return 1;
  }

  /**
   * Validate basic system requirements
   * @returns {Promise<void>}
   */
  async validateSystemRequirements() {
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0]);

    if (majorVersion < 16) {
      throw new Error(
        `Node.js version ${nodeVersion} is not supported. Please upgrade to Node.js 16 or higher.`
      );
    }

    // Check available memory (minimum 512MB)
    const os = require("os");
    const freeMemory = os.freemem();
    const minRequiredMemory = 512 * 1024 * 1024; // 512MB in bytes

    if (freeMemory < minRequiredMemory) {
      console.warn(
        `Warning: Low available memory: ${Math.round(
          freeMemory / 1024 / 1024
        )}MB. Chrome may not start properly.`
      );
    }

    this.logger.debug("Basic system requirements validation passed");
  }

  /**
   * Main CLI execution method
   * @param {string[]} argv - Command line arguments
   * @returns {Promise<Object>} Validated arguments ready for monitoring
   */
  async run(argv = process.argv) {
    try {
      // Validate basic system requirements first
      await this.validateSystemRequirements();

      const args = this.parseArgs(argv);
      const validatedArgs = await this.validateArgs(args);

      return {
        success: true,
        args: validatedArgs,
      };
    } catch (error) {
      const exitCode = this.handleError(error);
      return {
        success: false,
        error: error.message,
        exitCode,
      };
    }
  }
}

module.exports = CLIController;
