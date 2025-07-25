/**
 * Unit tests for CLI Controller
 */

const CLIController = require("./cli");
const path = require("path");

describe("CLIController", () => {
  let cli;
  let originalEnv;

  beforeEach(() => {
    cli = new CLIController();
    originalEnv = process.env;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("parseArgs", () => {
    it("should parse required input argument", () => {
      const argv = ["node", "script.js", "--input", "test-config.json"];
      const args = cli.parseArgs(argv);

      expect(args.input).toBe("test-config.json");
    });

    it("should parse input argument with alias", () => {
      const argv = ["node", "script.js", "-i", "test-config.json"];
      const args = cli.parseArgs(argv);

      expect(args.input).toBe("test-config.json");
    });

    it("should parse optional slack-webhook argument", () => {
      const argv = [
        "node",
        "script.js",
        "--input",
        "test-config.json",
        "--slack-webhook",
        "https://hooks.slack.com/test",
      ];
      const args = cli.parseArgs(argv);

      expect(args.input).toBe("test-config.json");
      expect(args["slack-webhook"]).toBe("https://hooks.slack.com/test");
    });

    it("should parse slack-webhook argument with alias", () => {
      const argv = [
        "node",
        "script.js",
        "--input",
        "test-config.json",
        "-s",
        "https://hooks.slack.com/test",
      ];
      const args = cli.parseArgs(argv);

      expect(args.input).toBe("test-config.json");
      expect(args["slack-webhook"]).toBe("https://hooks.slack.com/test");
    });

    it("should throw error when input argument is missing", () => {
      const argv = ["node", "script.js"];

      expect(() => cli.parseArgs(argv)).toThrow();
    });

    it("should throw error for unknown arguments", () => {
      const argv = [
        "node",
        "script.js",
        "--input",
        "test-config.json",
        "--unknown",
        "value",
      ];

      expect(() => cli.parseArgs(argv)).toThrow();
    });
  });

  describe("validateArgs", () => {
    it("should validate valid arguments with existing file", async () => {
      const args = { input: "test-config.json" };
      const validated = await cli.validateArgs(args);

      expect(validated.inputPath).toBe(path.resolve("test-config.json"));
    });

    it("should resolve relative input paths", async () => {
      const args = { input: "./test-config.json" };
      const validated = await cli.validateArgs(args);

      expect(validated.inputPath).toBe(path.resolve("./test-config.json"));
    });

    it("should throw error when input file is not accessible", async () => {
      const args = { input: "nonexistent.json" };

      await expect(cli.validateArgs(args)).rejects.toThrow(
        "Cannot read input file"
      );
    });

    it("should throw error when input file is not JSON", async () => {
      const args = { input: "config.txt" };

      await expect(cli.validateArgs(args)).rejects.toThrow(
        "Input file must be a JSON file"
      );
    });

    it("should use command line slack webhook when provided", async () => {
      const args = {
        input: "test-config.json",
        "slack-webhook": "https://hooks.slack.com/services/test",
      };
      const validated = await cli.validateArgs(args);

      expect(validated.slackWebhook).toBe(
        "https://hooks.slack.com/services/test"
      );
    });

    it("should use environment variable for slack webhook when command line not provided", async () => {
      process.env.SLACK_WEBHOOK_URL =
        "https://hooks.slack.com/services/env-test";
      const args = { input: "test-config.json" };
      const validated = await cli.validateArgs(args);

      expect(validated.slackWebhook).toBe(
        "https://hooks.slack.com/services/env-test"
      );
    });

    it("should prioritize command line slack webhook over environment variable", async () => {
      process.env.SLACK_WEBHOOK_URL =
        "https://hooks.slack.com/services/env-test";
      const args = {
        input: "test-config.json",
        "slack-webhook": "https://hooks.slack.com/services/cli-test",
      };
      const validated = await cli.validateArgs(args);

      expect(validated.slackWebhook).toBe(
        "https://hooks.slack.com/services/cli-test"
      );
    });

    it("should work without slack webhook", async () => {
      const args = { input: "test-config.json" };
      const validated = await cli.validateArgs(args);

      expect(validated.slackWebhook).toBeUndefined();
    });

    it("should throw error for invalid slack webhook URL", async () => {
      const args = {
        input: "test-config.json",
        "slack-webhook": "invalid-url",
      };

      await expect(cli.validateArgs(args)).rejects.toThrow(
        "Invalid Slack webhook URL"
      );
    });

    it("should throw error for non-HTTPS slack webhook URL", async () => {
      const args = {
        input: "test-config.json",
        "slack-webhook": "http://hooks.slack.com/services/test",
      };

      await expect(cli.validateArgs(args)).rejects.toThrow(
        "Invalid Slack webhook URL"
      );
    });
  });

  describe("isValidWebhookUrl", () => {
    it("should validate correct Slack webhook URLs", () => {
      const validUrls = [
        "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
        "https://hooks.slack.com/workflows/T00000000/A00000000/123456789/abcdefghijklmnop",
        "https://custom.slack.com/services/webhook",
      ];

      validUrls.forEach((url) => {
        expect(cli.isValidWebhookUrl(url)).toBe(true);
      });
    });

    it("should reject invalid webhook URLs", () => {
      const invalidUrls = [
        "http://hooks.slack.com/services/test", // HTTP instead of HTTPS
        "https://example.com/webhook", // Not slack.com domain
        "not-a-url",
        "",
        "ftp://hooks.slack.com/test",
      ];

      invalidUrls.forEach((url) => {
        expect(cli.isValidWebhookUrl(url)).toBe(false);
      });
    });
  });

  describe("handleError", () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, "error").mockImplementation();
      jest.spyOn(cli, "displayUsage").mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it("should handle missing required argument error", () => {
      const error = new Error("Missing required argument: input");
      const exitCode = cli.handleError(error);

      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        "Error: Missing required arguments"
      );
      expect(cli.displayUsage).toHaveBeenCalled();
    });

    it("should handle unknown argument error", () => {
      const error = new Error("Unknown argument: invalid");
      const exitCode = cli.handleError(error);

      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        "Error: Unknown argument: invalid"
      );
      expect(cli.displayUsage).toHaveBeenCalled();
    });

    it("should handle generic errors", () => {
      const error = new Error("Generic error message");
      const exitCode = cli.handleError(error);

      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        "Error: Generic error message"
      );
      expect(cli.displayUsage).not.toHaveBeenCalled();
    });
  });

  describe("run", () => {
    it("should return success result with valid arguments", async () => {
      const argv = ["node", "script.js", "--input", "test-config.json"];
      const result = await cli.run(argv);

      expect(result.success).toBe(true);
      expect(result.args.inputPath).toBe(path.resolve("test-config.json"));
    });

    it("should return success result with slack webhook", async () => {
      const argv = [
        "node",
        "script.js",
        "--input",
        "test-config.json",
        "--slack-webhook",
        "https://hooks.slack.com/test",
      ];
      const result = await cli.run(argv);

      expect(result.success).toBe(true);
      expect(result.args.slackWebhook).toBe("https://hooks.slack.com/test");
    });

    it("should return error result for invalid arguments", async () => {
      const argv = ["node", "script.js"]; // Missing required input
      const result = await cli.run(argv);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.exitCode).toBe(1);
    });

    it("should return error result for file access issues", async () => {
      const argv = ["node", "script.js", "--input", "nonexistent.json"];
      const result = await cli.run(argv);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot read input file");
      expect(result.exitCode).toBe(1);
    });

    it("should handle environment variable for slack webhook", async () => {
      process.env.SLACK_WEBHOOK_URL =
        "https://hooks.slack.com/services/env-test";
      const argv = ["node", "script.js", "--input", "test-config.json"];
      const result = await cli.run(argv);

      expect(result.success).toBe(true);
      expect(result.args.slackWebhook).toBe(
        "https://hooks.slack.com/services/env-test"
      );
    });
  });

  describe("displayUsage", () => {
    it("should display usage information without throwing errors", () => {
      // Just verify the method can be called without throwing
      expect(() => cli.displayUsage()).not.toThrow();
    });
  });
});
