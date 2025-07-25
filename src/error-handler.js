/**
 * Comprehensive error handling system with categorization and user-friendly messages
 */

const Logger = require("./logger");

/**
 * Error categories as defined in the design document
 */
const ErrorTypes = {
  CONFIG_ERROR: "CONFIG_ERROR",
  CHROME_ERROR: "CHROME_ERROR",
  BROWSER_ERROR: "BROWSER_ERROR",
  PAGE_ERROR: "PAGE_ERROR",
  EXTRACTION_ERROR: "EXTRACTION_ERROR",
  NOTIFICATION_ERROR: "NOTIFICATION_ERROR",
  PERSISTENCE_ERROR: "PERSISTENCE_ERROR",
  WORKFLOW_ERROR: "WORKFLOW_ERROR",
  TARGET_ERROR: "TARGET_ERROR",
};

/**
 * Error severity levels
 */
const ErrorSeverity = {
  CRITICAL: "CRITICAL", // Stops entire workflow
  HIGH: "HIGH", // Stops current operation but continues workflow
  MEDIUM: "MEDIUM", // Logs error but continues processing
  LOW: "LOW", // Warning level, non-blocking
};

class ErrorHandler {
  constructor() {
    this.logger = new Logger();
    this.errorCounts = {};
    this.sessionErrors = [];
  }

  /**
   * Categorize error based on error message and context
   * @param {Error} error - The error to categorize
   * @param {Object} context - Additional context about where error occurred
   * @returns {Object} Categorized error information
   */
  categorizeError(error, context = {}) {
    const message = error.message || "Unknown error";
    const stack = error.stack || "";

    // Configuration errors
    if (
      message.includes("Configuration") ||
      message.includes("Invalid JSON") ||
      message.includes("Missing required field") ||
      message.includes("Config load failed") ||
      (message.includes("not found") && context.type === "config")
    ) {
      return {
        type: ErrorTypes.CONFIG_ERROR,
        severity: ErrorSeverity.CRITICAL,
        category: "Configuration",
        userMessage: this.getConfigErrorMessage(message),
        technicalMessage: message,
        suggestions: this.getConfigErrorSuggestions(message),
      };
    }

    // Chrome launch errors
    if (
      message.includes("Chrome") &&
      (message.includes("launch") ||
        message.includes("port") ||
        message.includes("debug"))
    ) {
      return {
        type: ErrorTypes.CHROME_ERROR,
        severity: ErrorSeverity.CRITICAL,
        category: "Chrome Browser",
        userMessage: this.getChromeErrorMessage(message),
        technicalMessage: message,
        suggestions: this.getChromeErrorSuggestions(message),
      };
    }

    // Browser connection errors
    if (
      message.includes("connect") ||
      message.includes("CDP") ||
      message.includes("browser")
    ) {
      return {
        type: ErrorTypes.BROWSER_ERROR,
        severity: ErrorSeverity.CRITICAL,
        category: "Browser Connection",
        userMessage: this.getBrowserErrorMessage(message),
        technicalMessage: message,
        suggestions: this.getBrowserErrorSuggestions(message),
      };
    }

    // Page navigation errors
    if (
      message.includes("Navigation") ||
      message.includes("timeout") ||
      message.includes("net::ERR") ||
      message.includes("load")
    ) {
      // If this is in the context of processing a target, categorize as TARGET_ERROR for backward compatibility
      const errorType =
        context.operation === "processMonitoringTarget"
          ? ErrorTypes.TARGET_ERROR
          : ErrorTypes.PAGE_ERROR;
      return {
        type: errorType,
        severity: ErrorSeverity.HIGH,
        category: "Page Navigation",
        userMessage: this.getPageErrorMessage(message),
        technicalMessage: message,
        suggestions: this.getPageErrorSuggestions(message),
      };
    }

    // Element extraction errors
    if (
      message.includes("selector") ||
      message.includes("element") ||
      message.includes("textContent") ||
      message.includes("extract")
    ) {
      return {
        type: ErrorTypes.EXTRACTION_ERROR,
        severity: ErrorSeverity.MEDIUM,
        category: "Element Extraction",
        userMessage: this.getExtractionErrorMessage(message),
        technicalMessage: message,
        suggestions: this.getExtractionErrorSuggestions(message),
      };
    }

    // Slack notification errors
    if (
      message.includes("Slack") ||
      message.includes("webhook") ||
      message.includes("notification")
    ) {
      return {
        type: ErrorTypes.NOTIFICATION_ERROR,
        severity: ErrorSeverity.MEDIUM,
        category: "Slack Notification",
        userMessage: this.getNotificationErrorMessage(message),
        technicalMessage: message,
        suggestions: this.getNotificationErrorSuggestions(message),
      };
    }

    // File persistence errors
    if (
      message.includes("persist") ||
      message.includes("write") ||
      message.includes("permission") ||
      message.includes("EACCES")
    ) {
      return {
        type: ErrorTypes.PERSISTENCE_ERROR,
        severity: ErrorSeverity.CRITICAL,
        category: "File Operations",
        userMessage: this.getPersistenceErrorMessage(message),
        technicalMessage: message,
        suggestions: this.getPersistenceErrorSuggestions(message),
      };
    }

    // Default to workflow error
    return {
      type: ErrorTypes.WORKFLOW_ERROR,
      severity: ErrorSeverity.HIGH,
      category: "General",
      userMessage: `An unexpected error occurred: ${message}`,
      technicalMessage: message,
      suggestions: [
        "Check the logs for more details",
        "Try running the command again",
      ],
    };
  }

  /**
   * Handle an error with appropriate logging and user feedback
   * @param {Error} error - The error to handle
   * @param {Object} context - Additional context
   * @returns {Object} Processed error information
   */
  handleError(error, context = {}) {
    const categorizedError = this.categorizeError(error, context);

    // Track error counts
    this.errorCounts[categorizedError.type] =
      (this.errorCounts[categorizedError.type] || 0) + 1;

    // Add to session errors
    const errorRecord = {
      ...categorizedError,
      timestamp: new Date(),
      context: context,
      originalError: error,
    };
    this.sessionErrors.push(errorRecord);

    // Log based on severity
    switch (categorizedError.severity) {
      case ErrorSeverity.CRITICAL:
        this.logger.error(
          `CRITICAL ${categorizedError.category} Error: ${categorizedError.userMessage}`,
          {
            type: categorizedError.type,
            context: context,
            technical: categorizedError.technicalMessage,
          }
        );
        break;

      case ErrorSeverity.HIGH:
        this.logger.error(
          `${categorizedError.category} Error: ${categorizedError.userMessage}`,
          {
            type: categorizedError.type,
            context: context,
          }
        );
        break;

      case ErrorSeverity.MEDIUM:
        this.logger.warn(
          `${categorizedError.category} Warning: ${categorizedError.userMessage}`,
          {
            type: categorizedError.type,
            context: context,
          }
        );
        break;

      case ErrorSeverity.LOW:
        this.logger.warn(
          `${categorizedError.category} Notice: ${categorizedError.userMessage}`,
          {
            type: categorizedError.type,
          }
        );
        break;
    }

    // Show suggestions for critical and high severity errors
    if (
      categorizedError.severity === ErrorSeverity.CRITICAL ||
      categorizedError.severity === ErrorSeverity.HIGH
    ) {
      this.showSuggestions(categorizedError.suggestions);
    }

    return categorizedError;
  }

  /**
   * Show error suggestions to the user
   * @param {Array} suggestions - Array of suggestion strings
   */
  showSuggestions(suggestions) {
    if (suggestions && suggestions.length > 0) {
      this.logger.info("Suggestions to resolve this issue:");
      suggestions.forEach((suggestion, index) => {
        this.logger.info(`  ${index + 1}. ${suggestion}`);
      });
    }
  }

  /**
   * Check if error should stop the workflow
   * @param {Object} categorizedError - Categorized error object
   * @returns {boolean} True if workflow should stop
   */
  shouldStopWorkflow(categorizedError) {
    return categorizedError.severity === ErrorSeverity.CRITICAL;
  }

  /**
   * Get error statistics for the session
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    return {
      totalErrors: this.sessionErrors.length,
      errorCounts: { ...this.errorCounts },
      criticalErrors: this.sessionErrors.filter(
        (e) => e.severity === ErrorSeverity.CRITICAL
      ).length,
      highErrors: this.sessionErrors.filter(
        (e) => e.severity === ErrorSeverity.HIGH
      ).length,
      mediumErrors: this.sessionErrors.filter(
        (e) => e.severity === ErrorSeverity.MEDIUM
      ).length,
      lowErrors: this.sessionErrors.filter(
        (e) => e.severity === ErrorSeverity.LOW
      ).length,
    };
  }

  // Error message generators for different categories
  getConfigErrorMessage(message) {
    if (message.includes("not found")) {
      return "Configuration file not found. Please check the file path.";
    }
    if (message.includes("Invalid JSON")) {
      return "Configuration file contains invalid JSON. Please check the file format.";
    }
    if (message.includes("Missing required field")) {
      return "Configuration file is missing required fields. Please check the file structure.";
    }
    return "Configuration file error. Please check your input file.";
  }

  getConfigErrorSuggestions(message) {
    const suggestions = ["Verify the configuration file path is correct"];

    if (message.includes("Invalid JSON")) {
      suggestions.push("Use a JSON validator to check file syntax");
      suggestions.push("Ensure all strings are properly quoted");
    }
    if (message.includes("Missing required field")) {
      suggestions.push(
        "Ensure each entry has url, css_selector, and current_value fields"
      );
    }

    return suggestions;
  }

  getChromeErrorMessage(message) {
    if (message.includes("port") && message.includes("in use")) {
      return "Chrome debug port is already in use. Please close existing Chrome instances.";
    }
    if (message.includes("launch")) {
      return "Failed to launch Chrome browser. Please check Chrome installation.";
    }
    return "Chrome browser error occurred.";
  }

  getChromeErrorSuggestions(message) {
    const suggestions = [];

    if (message.includes("port")) {
      suggestions.push("Close any existing Chrome instances");
      suggestions.push("Check if another application is using port 9222");
    }
    if (message.includes("launch")) {
      suggestions.push("Verify Chrome is installed and accessible");
      suggestions.push("Check system permissions for launching applications");
    }

    return suggestions;
  }

  getBrowserErrorMessage(message) {
    if (message.includes("connect")) {
      return "Failed to connect to Chrome browser. The browser may not be ready.";
    }
    return "Browser connection error occurred.";
  }

  getBrowserErrorSuggestions(message) {
    return [
      "Wait a moment and try again",
      "Ensure Chrome launched successfully",
      "Check if Chrome debug port is accessible",
    ];
  }

  getPageErrorMessage(message) {
    if (message.includes("timeout")) {
      return "Page failed to load within the timeout period.";
    }
    if (message.includes("net::ERR")) {
      return "Network error occurred while loading the page.";
    }
    return "Page navigation error occurred.";
  }

  getPageErrorSuggestions(message) {
    const suggestions = ["Check your internet connection"];

    if (message.includes("timeout")) {
      suggestions.push("The website may be slow - try increasing timeout");
      suggestions.push("Verify the URL is correct and accessible");
    }

    return suggestions;
  }

  getExtractionErrorMessage(message) {
    if (message.includes("selector") && message.includes("not found")) {
      return "The specified CSS selector was not found on the page.";
    }
    if (message.includes("timeout")) {
      return "Element selection timed out - the element may not exist or load slowly.";
    }
    return "Failed to extract content from the page element.";
  }

  getExtractionErrorSuggestions(message) {
    const suggestions = [];

    if (message.includes("selector")) {
      suggestions.push("Verify the CSS selector is correct");
      suggestions.push("Check if the page structure has changed");
      suggestions.push("Use browser developer tools to test the selector");
    }
    if (message.includes("timeout")) {
      suggestions.push(
        "The element may load dynamically - try increasing timeout"
      );
    }

    return suggestions;
  }

  getNotificationErrorMessage(message) {
    if (message.includes("webhook")) {
      return "Failed to send Slack notification. Check webhook URL and network connection.";
    }
    return "Notification delivery failed.";
  }

  getNotificationErrorSuggestions(message) {
    return [
      "Verify the Slack webhook URL is correct",
      "Check your internet connection",
      "Ensure the Slack workspace allows webhook notifications",
    ];
  }

  getPersistenceErrorMessage(message) {
    if (message.includes("permission") || message.includes("EACCES")) {
      return "Permission denied when trying to save configuration file.";
    }
    if (message.includes("ENOSPC")) {
      return "Not enough disk space to save configuration file.";
    }
    return "Failed to save configuration changes.";
  }

  getPersistenceErrorSuggestions(message) {
    const suggestions = [];

    if (message.includes("permission")) {
      suggestions.push("Check file and directory permissions");
      suggestions.push(
        "Ensure you have write access to the configuration file"
      );
    }
    if (message.includes("ENOSPC")) {
      suggestions.push("Free up disk space");
    }

    return suggestions;
  }
}

module.exports = { ErrorHandler, ErrorTypes, ErrorSeverity };
