/**
 * Centralized logging system for the Web Element Change Detector
 * Provides structured logging with different levels and error categorization
 */

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || "INFO";
    this.logLevels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3,
    };
  }

  /**
   * Set the logging level
   * @param {string} level - Log level (ERROR, WARN, INFO, DEBUG)
   */
  setLogLevel(level) {
    if (this.logLevels.hasOwnProperty(level)) {
      this.logLevel = level;
    }
  }

  /**
   * Check if a log level should be output
   * @param {string} level - Log level to check
   * @returns {boolean} True if should log
   */
  shouldLog(level) {
    return this.logLevels[level] <= this.logLevels[this.logLevel];
  }

  /**
   * Format log message with timestamp and level
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   * @returns {string} Formatted log message
   */
  formatMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const contextStr =
      Object.keys(context).length > 0 ? ` | ${JSON.stringify(context)}` : "";

    return `[${timestamp}] ${level}: ${message}${contextStr}`;
  }

  /**
   * Log error message
   * @param {string} message - Error message
   * @param {Object} context - Additional context
   */
  error(message, context = {}) {
    if (this.shouldLog("ERROR")) {
      console.error(this.formatMessage("ERROR", message, context));
    }
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {Object} context - Additional context
   */
  warn(message, context = {}) {
    if (this.shouldLog("WARN")) {
      console.warn(this.formatMessage("WARN", message, context));
    }
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {Object} context - Additional context
   */
  info(message, context = {}) {
    if (this.shouldLog("INFO")) {
      console.log(this.formatMessage("INFO", message, context));
    }
  }

  /**
   * Log debug message
   * @param {string} message - Debug message
   * @param {Object} context - Additional context
   */
  debug(message, context = {}) {
    if (this.shouldLog("DEBUG")) {
      console.log(this.formatMessage("DEBUG", message, context));
    }
  }

  /**
   * Log success message (always shown)
   * @param {string} message - Success message
   * @param {Object} context - Additional context
   */
  success(message, context = {}) {
    console.log(this.formatMessage("SUCCESS", `✓ ${message}`, context));
  }

  /**
   * Log failure message (always shown)
   * @param {string} message - Failure message
   * @param {Object} context - Additional context
   */
  failure(message, context = {}) {
    console.error(this.formatMessage("FAILURE", `✗ ${message}`, context));
  }
}

module.exports = Logger;
