const fs = require("fs").promises;
const path = require("path");
const Logger = require("./logger");
const { ErrorHandler } = require("./error-handler");

/**
 * ConfigurationManager handles loading, saving, and validating JSON configuration files
 * for the web element change detector tool.
 */
class ConfigurationManager {
  constructor() {
    this.logger = new Logger();
    this.errorHandler = new ErrorHandler();
  }
  /**
   * Load and parse configuration from a JSON file
   * @param {string} filePath - Path to the input.json configuration file
   * @returns {Promise<Object>} Configuration object with targets and settings
   * @throws {Error} If file cannot be read, parsed, or validated
   */
  async loadConfig(filePath) {
    try {
      // Check if file exists and is readable
      await fs.access(filePath, fs.constants.R_OK);

      // Read file content
      const fileContent = await fs.readFile(filePath, "utf8");

      // Parse JSON
      let config;
      try {
        config = JSON.parse(fileContent);
      } catch (parseError) {
        throw new Error(
          `Invalid JSON format in ${filePath}: ${parseError.message}`
        );
      }

      // Validate configuration
      this.validateConfig(config);

      // Normalize configuration to object format
      const normalizedConfig = this.normalizeConfig(config);

      return normalizedConfig;
    } catch (error) {
      if (error.code === "ENOENT") {
        const configError = new Error(
          `Configuration file not found: ${filePath}`
        );
        this.errorHandler.handleError(configError, {
          type: "config",
          operation: "load",
          filePath,
        });
        throw configError;
      } else if (error.code === "EACCES") {
        const configError = new Error(
          `Permission denied reading configuration file: ${filePath}`
        );
        this.errorHandler.handleError(configError, {
          type: "config",
          operation: "load",
          filePath,
        });
        throw configError;
      }

      this.errorHandler.handleError(error, {
        type: "config",
        operation: "load",
        filePath,
      });
      throw error;
    }
  }

  /**
   * Save configuration to a JSON file
   * @param {string} filePath - Path to save the configuration file
   * @param {Object} config - Configuration object to save
   * @throws {Error} If file cannot be written or config is invalid
   */
  async saveConfig(filePath, config) {
    try {
      // Validate configuration before saving
      this.validateConfig(config);

      // Check write permissions on directory
      const dir = path.dirname(filePath);
      await fs.access(dir, fs.constants.W_OK);

      // Convert to JSON with proper formatting
      const jsonContent = JSON.stringify(config, null, 2);

      // Write to file
      await fs.writeFile(filePath, jsonContent, "utf8");
    } catch (error) {
      if (error.code === "EACCES") {
        const configError = new Error(
          `Permission denied writing to configuration file: ${filePath}`
        );
        this.errorHandler.handleError(configError, {
          type: "config",
          operation: "save",
          filePath,
        });
        throw configError;
      } else if (error.code === "ENOSPC") {
        const configError = new Error(
          `No space left on device when writing: ${filePath}`
        );
        this.errorHandler.handleError(configError, {
          type: "config",
          operation: "save",
          filePath,
        });
        throw configError;
      }

      this.errorHandler.handleError(error, {
        type: "config",
        operation: "save",
        filePath,
      });
      throw error;
    }
  }

  /**
   * Validate the entire configuration
   * @param {*} config - Configuration to validate (can be array or object)
   * @throws {Error} If configuration is invalid
   */
  validateConfig(config) {
    // Support both legacy array format and new object format
    if (Array.isArray(config)) {
      // Legacy format: array of monitoring targets
      this.validateTargetsArray(config);
    } else if (config && typeof config === "object") {
      // New format: object with targets and optional settings
      this.validateConfigObject(config);
    } else {
      throw new Error(
        "Configuration must be an array of monitoring targets or an object with targets"
      );
    }
  }

  /**
   * Validate configuration object format
   * @param {Object} config - Configuration object to validate
   * @throws {Error} If configuration is invalid
   */
  validateConfigObject(config) {
    // Check for required targets field
    if (!config.targets || !Array.isArray(config.targets)) {
      throw new Error("Configuration object must have a 'targets' array");
    }

    this.validateTargetsArray(config.targets);

    // Validate optional slack_webhook field
    if (config.slack_webhook !== undefined) {
      if (typeof config.slack_webhook !== "string") {
        throw new Error("slack_webhook must be a string");
      }
      if (config.slack_webhook.trim().length === 0) {
        throw new Error("slack_webhook cannot be empty");
      }
      // Validate webhook URL format
      try {
        const url = new URL(config.slack_webhook);
        if (url.protocol !== "https:") {
          throw new Error("slack_webhook must be an HTTPS URL");
        }
        if (!url.hostname.includes("slack.com")) {
          throw new Error("slack_webhook must be a valid Slack webhook URL");
        }
      } catch (urlError) {
        throw new Error(`Invalid slack_webhook URL: ${urlError.message}`);
      }
    }

    // Check for unexpected fields
    const allowedFields = ["targets", "slack_webhook"];
    const extraFields = Object.keys(config).filter(
      (key) => !allowedFields.includes(key)
    );
    if (extraFields.length > 0) {
      throw new Error(
        `Unexpected configuration fields: ${extraFields.join(", ")}`
      );
    }
  }

  /**
   * Validate array of monitoring targets
   * @param {Array} targets - Array of monitoring targets to validate
   * @throws {Error} If targets array is invalid
   */
  validateTargetsArray(targets) {
    if (!Array.isArray(targets)) {
      throw new Error("Targets must be an array");
    }

    if (targets.length === 0) {
      throw new Error("Targets array cannot be empty");
    }

    // Validate each entry
    targets.forEach((entry, index) => {
      try {
        this.validateEntry(entry);
      } catch (error) {
        throw new Error(
          `Invalid target entry at index ${index}: ${error.message}`
        );
      }
    });

    // Check for duplicate entries (same URL + selector combination)
    const seen = new Set();
    targets.forEach((entry, index) => {
      const key = `${entry.url}|${entry.css_selector}`;
      if (seen.has(key)) {
        throw new Error(
          `Duplicate monitoring target at index ${index}: ${entry.url} with selector ${entry.css_selector}`
        );
      }
      seen.add(key);
    });
  }

  /**
   * Validate a single configuration entry
   * @param {*} entry - Single configuration entry to validate
   * @throws {Error} If entry is invalid
   */
  validateEntry(entry) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Entry must be an object");
    }

    // Check required fields
    const requiredFields = ["url", "css_selector", "current_value"];
    for (const field of requiredFields) {
      if (!(field in entry)) {
        throw new Error(`Missing required field: ${field}`);
      }
      if (typeof entry[field] !== "string") {
        throw new Error(`Field ${field} must be a string`);
      }
    }

    // Validate URL format
    try {
      new URL(entry.url);
    } catch (urlError) {
      throw new Error(`Invalid URL format: ${entry.url}`);
    }

    // Validate CSS selector is not empty
    if (entry.css_selector.trim().length === 0) {
      throw new Error("CSS selector cannot be empty");
    }

    // Check for unexpected fields
    const allowedFields = ["url", "css_selector", "current_value"];
    const extraFields = Object.keys(entry).filter(
      (key) => !allowedFields.includes(key)
    );
    if (extraFields.length > 0) {
      throw new Error(`Unexpected fields found: ${extraFields.join(", ")}`);
    }
  }

  /**
   * Normalize configuration to object format
   * @param {Array|Object} config - Configuration in either format
   * @returns {Object} Normalized configuration object
   */
  normalizeConfig(config) {
    if (Array.isArray(config)) {
      // Legacy format: convert array to object format
      return {
        targets: config,
        slack_webhook: undefined,
      };
    } else {
      // Already in object format
      return config;
    }
  }

  /**
   * Get targets array from configuration
   * @param {Object} config - Normalized configuration object
   * @returns {Array} Array of monitoring targets
   */
  getTargets(config) {
    return config.targets || [];
  }

  /**
   * Get slack webhook from configuration
   * @param {Object} config - Normalized configuration object
   * @returns {string|undefined} Slack webhook URL or undefined
   */
  getSlackWebhook(config) {
    return config.slack_webhook;
  }
}

module.exports = ConfigurationManager;
