const fs = require("fs").promises;
const { constants: fsConstants } = require("fs");
const path = require("path");
const ConfigurationManager = require("./config");
const Logger = require("./logger");
const { ErrorHandler } = require("./error-handler");

/**
 * StateManager handles updating configuration values in memory and persisting
 * changes back to the configuration file.
 */
class StateManager {
  constructor() {
    this.configManager = new ConfigurationManager();
    this.logger = new Logger();
    this.errorHandler = new ErrorHandler();
  }

  /**
   * Update current_value fields in the configuration based on detected changes
   * @param {Array} targets - Array of monitoring targets
   * @param {Array} changes - Array of change records with new values
   * @returns {Array} Updated targets array with new current_value fields
   */
  updateConfigValues(targets, changes) {
    if (!Array.isArray(targets)) {
      throw new Error("Targets must be an array");
    }

    if (!Array.isArray(changes)) {
      throw new Error("Changes must be an array");
    }

    // Create a deep copy of the targets to avoid mutating the original
    const updatedTargets = JSON.parse(JSON.stringify(targets));

    // Create a map of changes for efficient lookup
    const changeMap = new Map();
    changes.forEach((change) => {
      if (!change.entry || !change.hasChanged) {
        return; // Skip non-changes or invalid change records
      }

      const key = `${change.entry.url}|${change.entry.css_selector}`;
      changeMap.set(key, change.newValue);
    });

    // Update target entries with new values
    updatedTargets.forEach((entry, index) => {
      const key = `${entry.url}|${entry.css_selector}`;
      if (changeMap.has(key)) {
        entry.current_value = changeMap.get(key);
      }
    });

    return updatedTargets;
  }

  /**
   * Persist updated configuration back to the JSON file
   * @param {string} filePath - Path to the configuration file
   * @param {Object} updatedConfig - Updated configuration object to save
   * @throws {Error} If file cannot be written or permissions are insufficient
   */
  async persistConfig(filePath, updatedConfig) {
    try {
      // Validate write permissions before attempting to save
      await this.validateWritePermissions(filePath);

      // Use ConfigurationManager to save the updated configuration
      await this.configManager.saveConfig(filePath, updatedConfig);
    } catch (error) {
      const persistError = new Error(
        `Failed to persist configuration: ${error.message}`
      );
      this.errorHandler.handleError(persistError, {
        type: "persistence",
        operation: "persistConfig",
        filePath,
      });
      throw persistError;
    }
  }

  /**
   * Validate that the file and its directory have write permissions
   * @param {string} filePath - Path to validate write permissions for
   * @throws {Error} If write permissions are insufficient
   */
  async validateWritePermissions(filePath) {
    try {
      const dir = path.dirname(filePath);

      // Check if directory exists and is writable
      try {
        await fs.access(dir, fsConstants.W_OK);
      } catch (dirError) {
        if (dirError.code === "ENOENT") {
          throw new Error(`Directory does not exist: ${dir}`);
        } else if (dirError.code === "EACCES") {
          throw new Error(`No write permission for directory: ${dir}`);
        }
        throw dirError;
      }

      // Check if file exists
      try {
        await fs.access(filePath, fsConstants.F_OK);

        // File exists, check if it's writable
        try {
          await fs.access(filePath, fsConstants.W_OK);
        } catch (fileError) {
          if (fileError.code === "EACCES") {
            throw new Error(`No write permission for file: ${filePath}`);
          }
          throw fileError;
        }
      } catch (fileError) {
        if (fileError.code === "ENOENT") {
          // File doesn't exist, which is fine - we can create it if directory is writable
          return;
        }
        throw fileError;
      }
    } catch (error) {
      const permissionError = new Error(
        `Write permission validation failed: ${error.message}`
      );
      this.errorHandler.handleError(permissionError, {
        type: "persistence",
        operation: "validateWritePermissions",
        filePath,
      });
      throw permissionError;
    }
  }

  /**
   * Update configuration values and persist changes in a single operation
   * @param {string} filePath - Path to the configuration file
   * @param {Array} targets - Array of monitoring targets
   * @param {Array} changes - Array of change records with new values
   * @returns {Array} Updated targets array that was persisted
   */
  async updateAndPersist(filePath, targets, changes) {
    try {
      // Update target values in memory
      const updatedTargets = this.updateConfigValues(targets, changes);

      // Load the original configuration to preserve other fields like slack_webhook
      const originalConfig = await this.configManager.loadConfig(filePath);

      // Create updated configuration object
      const updatedConfig = {
        ...originalConfig,
        targets: updatedTargets,
      };

      // Persist the updated configuration
      await this.persistConfig(filePath, updatedConfig);

      return updatedTargets;
    } catch (error) {
      const updateError = new Error(
        `Failed to update and persist configuration: ${error.message}`
      );
      this.errorHandler.handleError(updateError, {
        type: "persistence",
        operation: "updateAndPersist",
        filePath,
      });
      throw updateError;
    }
  }
}

module.exports = StateManager;
