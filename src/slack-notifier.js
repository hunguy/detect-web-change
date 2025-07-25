const axios = require("axios");
const Logger = require("./logger");
const { ErrorHandler } = require("./error-handler");

/**
 * SlackNotifier handles sending change notifications to Slack via webhooks
 */
class SlackNotifier {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
    this.logger = new Logger();
    this.errorHandler = new ErrorHandler();
  }

  /**
   * Send a change notification to Slack
   * @param {Object} changeRecord - The change detection result
   * @param {Object} changeRecord.entry - Original configuration entry
   * @param {string} changeRecord.oldValue - Previous stored value
   * @param {string} changeRecord.newValue - Newly extracted value
   * @param {string} changeRecord.timestamp - ISO timestamp of detection
   * @returns {Promise<boolean>} - True if notification sent successfully
   */
  async sendChangeNotification(changeRecord) {
    if (!this.webhookUrl) {
      this.logger.warn("No Slack webhook URL provided, skipping notification");
      return false;
    }

    const url = changeRecord?.entry?.url || "unknown URL";

    try {
      this.logger.debug(`Preparing Slack notification for ${url}`, { url });

      const message = this.formatMessage(changeRecord);
      const success = await this.sendWebhook(message);

      if (success) {
        this.logger.success(`Slack notification sent for ${url}`);
      } else {
        this.logger.warn(`Slack notification failed for ${url}`);
      }

      return success;
    } catch (error) {
      this.errorHandler.handleError(error, {
        type: "notification",
        operation: "sendChangeNotification",
        url,
      });
      return false;
    }
  }

  /**
   * Format a change record into a structured Slack message
   * @param {Object} changeRecord - The change detection result
   * @returns {Object} - Formatted Slack message payload
   */
  formatMessage(changeRecord) {
    const { entry, oldValue, newValue, timestamp } = changeRecord;

    // Format timestamp for display
    const displayTime = new Date(timestamp).toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const text = [
      "🔔 Change Detected!",
      `• URL: ${entry.url}`,
      `• Selector: ${entry.css_selector}`,
      `• Was: ${oldValue}`,
      `• Now: ${newValue}`,
      `• Checked: ${displayTime}`,
    ].join("\n");

    return {
      text,
      username: "Web Element Monitor",
      icon_emoji: ":mag:",
    };
  }

  /**
   * Send a webhook request to Slack
   * @param {Object} message - The formatted message payload
   * @returns {Promise<boolean>} - True if webhook sent successfully
   */
  async sendWebhook(message) {
    try {
      const response = await axios.post(this.webhookUrl, message, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      });

      // Slack webhooks return 200 for success
      return response.status === 200;
    } catch (error) {
      if (error.response) {
        // HTTP error response
        const httpError = new Error(
          `Slack webhook failed with status ${error.response.status}: ${error.response.data}`
        );
        this.logger.error(
          `Slack webhook HTTP error: ${error.response.status}`,
          {
            status: error.response.status,
            data: error.response.data,
          }
        );
        throw httpError;
      } else if (error.request) {
        // Network error
        const networkError = new Error("Network error sending Slack webhook");
        this.logger.error("Slack webhook network error", {
          request: error.request,
        });
        throw networkError;
      } else {
        // Other error
        const webhookError = new Error(`Slack webhook error: ${error.message}`);
        this.logger.error(`Slack webhook general error: ${error.message}`);
        throw webhookError;
      }
    }
  }
}

module.exports = SlackNotifier;
