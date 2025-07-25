const SlackNotifier = require("./slack-notifier");
const axios = require("axios");

// Mock axios
jest.mock("axios");
const mockedAxios = axios;

describe("SlackNotifier", () => {
  let slackNotifier;
  let mockChangeRecord;

  beforeEach(() => {
    slackNotifier = new SlackNotifier("https://hooks.slack.com/test-webhook");

    mockChangeRecord = {
      entry: {
        url: "https://example.com/product",
        css_selector: "#price",
      },
      oldValue: "$19.99",
      newValue: "$18.49",
      timestamp: "2025-07-25T15:30:00.000Z",
    };

    // Clear all mocks
    jest.clearAllMocks();

    // Mock console methods
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "warn").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should store webhook URL", () => {
      const webhookUrl = "https://hooks.slack.com/test";
      const notifier = new SlackNotifier(webhookUrl);
      expect(notifier.webhookUrl).toBe(webhookUrl);
    });

    it("should handle undefined webhook URL", () => {
      const notifier = new SlackNotifier();
      expect(notifier.webhookUrl).toBeUndefined();
    });
  });

  describe("formatMessage", () => {
    it("should format change record into structured Slack message", () => {
      const message = slackNotifier.formatMessage(mockChangeRecord);

      expect(message).toEqual({
        text: expect.stringContaining("🔔 Change Detected!"),
        username: "Web Element Monitor",
        icon_emoji: ":mag:",
      });

      expect(message.text).toContain("• URL: https://example.com/product");
      expect(message.text).toContain("• Selector: #price");
      expect(message.text).toContain("• Was: $19.99");
      expect(message.text).toContain("• Now: $18.49");
      expect(message.text).toContain("• Checked:");
    });

    it("should format timestamp correctly", () => {
      const message = slackNotifier.formatMessage(mockChangeRecord);

      // Should contain formatted date/time (format may vary by locale)
      expect(message.text).toMatch(
        /• Checked: \d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} (AM|PM)/
      );
    });

    it("should handle special characters in values", () => {
      const changeRecord = {
        ...mockChangeRecord,
        oldValue: "Special & chars <test>",
        newValue: 'New & value "quoted"',
      };

      const message = slackNotifier.formatMessage(changeRecord);

      expect(message.text).toContain("• Was: Special & chars <test>");
      expect(message.text).toContain('• Now: New & value "quoted"');
    });

    it("should handle empty values", () => {
      const changeRecord = {
        ...mockChangeRecord,
        oldValue: "",
        newValue: "New value",
      };

      const message = slackNotifier.formatMessage(changeRecord);

      expect(message.text).toContain("• Was: ");
      expect(message.text).toContain("• Now: New value");
    });
  });

  describe("sendWebhook", () => {
    const mockMessage = {
      text: "Test message",
      username: "Web Element Monitor",
      icon_emoji: ":mag:",
    };

    it("should send webhook successfully", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      const result = await slackNotifier.sendWebhook(mockMessage);

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "https://hooks.slack.com/test-webhook",
        mockMessage,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        }
      );
    });

    it("should handle HTTP error responses", async () => {
      const errorResponse = {
        response: {
          status: 400,
          data: "Bad Request",
        },
      };
      mockedAxios.post.mockRejectedValue(errorResponse);

      await expect(slackNotifier.sendWebhook(mockMessage)).rejects.toThrow(
        "Slack webhook failed with status 400: Bad Request"
      );
    });

    it("should handle network errors", async () => {
      const networkError = {
        request: {},
      };
      mockedAxios.post.mockRejectedValue(networkError);

      await expect(slackNotifier.sendWebhook(mockMessage)).rejects.toThrow(
        "Network error sending Slack webhook"
      );
    });

    it("should handle other errors", async () => {
      const otherError = new Error("Unknown error");
      mockedAxios.post.mockRejectedValue(otherError);

      await expect(slackNotifier.sendWebhook(mockMessage)).rejects.toThrow(
        "Slack webhook error: Unknown error"
      );
    });

    it("should return false for non-200 status codes", async () => {
      mockedAxios.post.mockResolvedValue({ status: 201 });

      const result = await slackNotifier.sendWebhook(mockMessage);

      expect(result).toBe(false);
    });
  });

  describe("sendChangeNotification", () => {
    it("should send notification successfully", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      const result = await slackNotifier.sendChangeNotification(
        mockChangeRecord
      );

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        "Slack notification sent for https://example.com/product"
      );
    });

    it("should handle missing webhook URL gracefully", async () => {
      const notifierWithoutWebhook = new SlackNotifier();

      const result = await notifierWithoutWebhook.sendChangeNotification(
        mockChangeRecord
      );

      expect(result).toBe(false);
      expect(console.warn).toHaveBeenCalledWith(
        "No Slack webhook URL provided, skipping notification"
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("should handle webhook failures gracefully", async () => {
      mockedAxios.post.mockRejectedValue(new Error("Network error"));

      const result = await slackNotifier.sendChangeNotification(
        mockChangeRecord
      );

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        "Failed to send Slack notification for https://example.com/product:",
        "Slack webhook error: Network error"
      );
    });

    it("should handle formatting errors gracefully", async () => {
      // Create a change record that might cause formatting issues
      const invalidChangeRecord = {
        entry: null,
        oldValue: "$19.99",
        newValue: "$18.49",
        timestamp: "2025-07-25T15:30:00.000Z",
      };

      const result = await slackNotifier.sendChangeNotification(
        invalidChangeRecord
      );

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        "Failed to send Slack notification for unknown URL:",
        expect.any(String)
      );
    });

    it("should continue processing after individual failures", async () => {
      // First call fails, second succeeds
      mockedAxios.post
        .mockRejectedValueOnce(new Error("First failure"))
        .mockResolvedValueOnce({ status: 200 });

      const result1 = await slackNotifier.sendChangeNotification(
        mockChangeRecord
      );
      const result2 = await slackNotifier.sendChangeNotification(
        mockChangeRecord
      );

      expect(result1).toBe(false);
      expect(result2).toBe(true);
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling and graceful degradation", () => {
    it("should not throw errors on webhook failures", async () => {
      mockedAxios.post.mockRejectedValue(new Error("Webhook failed"));

      // Should not throw, should return false
      await expect(
        slackNotifier.sendChangeNotification(mockChangeRecord)
      ).resolves.toBe(false);
    });

    it("should log appropriate error messages", async () => {
      const httpError = {
        response: {
          status: 404,
          data: "Not Found",
        },
      };
      mockedAxios.post.mockRejectedValue(httpError);

      await slackNotifier.sendChangeNotification(mockChangeRecord);

      expect(console.error).toHaveBeenCalledWith(
        "Failed to send Slack notification for https://example.com/product:",
        "Slack webhook failed with status 404: Not Found"
      );
    });

    it("should handle timeout errors", async () => {
      const timeoutError = {
        code: "ECONNABORTED",
        message: "timeout of 10000ms exceeded",
      };
      mockedAxios.post.mockRejectedValue(timeoutError);

      const result = await slackNotifier.sendChangeNotification(
        mockChangeRecord
      );

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        "Failed to send Slack notification for https://example.com/product:",
        "Slack webhook error: timeout of 10000ms exceeded"
      );
    });
  });
});
