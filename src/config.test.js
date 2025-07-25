const fs = require("fs").promises;
const path = require("path");
const ConfigurationManager = require("./config");

describe("ConfigurationManager", () => {
  let configManager;
  let tempDir;
  let testConfigPath;

  beforeEach(async () => {
    configManager = new ConfigurationManager();

    // Create temporary directory for test files
    tempDir = path.join(__dirname, "..", "test-temp");
    await fs.mkdir(tempDir, { recursive: true });
    testConfigPath = path.join(tempDir, "test-config.json");
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("loadConfig", () => {
    test("should load valid configuration file", async () => {
      const validConfig = [
        {
          url: "https://example.com",
          css_selector: "#price",
          current_value: "$19.99",
        },
        {
          url: "https://test.com/product",
          css_selector: ".title",
          current_value: "Product Name",
        },
      ];

      await fs.writeFile(testConfigPath, JSON.stringify(validConfig, null, 2));

      const result = await configManager.loadConfig(testConfigPath);
      expect(result).toEqual(validConfig);
    });

    test("should throw error for non-existent file", async () => {
      const nonExistentPath = path.join(tempDir, "does-not-exist.json");

      await expect(configManager.loadConfig(nonExistentPath)).rejects.toThrow(
        "Configuration file not found"
      );
    });

    test("should throw error for invalid JSON", async () => {
      await fs.writeFile(testConfigPath, "{ invalid json }");

      await expect(configManager.loadConfig(testConfigPath)).rejects.toThrow(
        "Invalid JSON format"
      );
    });

    test("should throw error for invalid configuration structure", async () => {
      await fs.writeFile(testConfigPath, JSON.stringify({ not: "array" }));

      await expect(configManager.loadConfig(testConfigPath)).rejects.toThrow(
        "Configuration must be an array"
      );
    });

    test("should throw error for empty configuration array", async () => {
      await fs.writeFile(testConfigPath, JSON.stringify([]));

      await expect(configManager.loadConfig(testConfigPath)).rejects.toThrow(
        "Configuration array cannot be empty"
      );
    });
  });

  describe("saveConfig", () => {
    test("should save valid configuration to file", async () => {
      const validConfig = [
        {
          url: "https://example.com",
          css_selector: "#price",
          current_value: "$19.99",
        },
      ];

      await configManager.saveConfig(testConfigPath, validConfig);

      // Verify file was created and contains correct data
      const fileContent = await fs.readFile(testConfigPath, "utf8");
      const parsedContent = JSON.parse(fileContent);
      expect(parsedContent).toEqual(validConfig);
    });

    test("should format JSON with proper indentation", async () => {
      const validConfig = [
        {
          url: "https://example.com",
          css_selector: "#price",
          current_value: "$19.99",
        },
      ];

      await configManager.saveConfig(testConfigPath, validConfig);

      const fileContent = await fs.readFile(testConfigPath, "utf8");
      expect(fileContent).toContain("  "); // Should have 2-space indentation
      expect(fileContent.split("\n").length).toBeGreaterThan(1); // Should be multi-line
    });

    test("should throw error when saving invalid configuration", async () => {
      const invalidConfig = { not: "array" };

      await expect(
        configManager.saveConfig(testConfigPath, invalidConfig)
      ).rejects.toThrow("Configuration must be an array");
    });

    test("should throw error for write permission issues", async () => {
      const readOnlyDir = path.join(tempDir, "readonly");
      await fs.mkdir(readOnlyDir);
      await fs.chmod(readOnlyDir, 0o444); // Read-only

      const readOnlyPath = path.join(readOnlyDir, "config.json");
      const validConfig = [
        {
          url: "https://example.com",
          css_selector: "#price",
          current_value: "$19.99",
        },
      ];

      await expect(
        configManager.saveConfig(readOnlyPath, validConfig)
      ).rejects.toThrow("Permission denied");

      // Cleanup
      await fs.chmod(readOnlyDir, 0o755);
    });
  });

  describe("validateConfig", () => {
    test("should validate correct configuration array", () => {
      const validConfig = [
        {
          url: "https://example.com",
          css_selector: "#price",
          current_value: "$19.99",
        },
        {
          url: "https://test.com/product",
          css_selector: ".title",
          current_value: "Product Name",
        },
      ];

      expect(() => configManager.validateConfig(validConfig)).not.toThrow();
    });

    test("should reject non-array configuration", () => {
      expect(() => configManager.validateConfig({ not: "array" })).toThrow(
        "Configuration must be an array"
      );
    });

    test("should reject empty array", () => {
      expect(() => configManager.validateConfig([])).toThrow(
        "Configuration array cannot be empty"
      );
    });

    test("should reject duplicate entries", () => {
      const configWithDuplicates = [
        {
          url: "https://example.com",
          css_selector: "#price",
          current_value: "$19.99",
        },
        {
          url: "https://example.com",
          css_selector: "#price",
          current_value: "$18.99",
        },
      ];

      expect(() => configManager.validateConfig(configWithDuplicates)).toThrow(
        "Duplicate monitoring target"
      );
    });

    test("should provide specific error for invalid entry", () => {
      const configWithInvalidEntry = [
        {
          url: "https://example.com",
          css_selector: "#price",
          current_value: "$19.99",
        },
        {
          url: "invalid-url",
          css_selector: "#price",
          // missing current_value
        },
      ];

      expect(() =>
        configManager.validateConfig(configWithInvalidEntry)
      ).toThrow("Invalid configuration entry at index 1");
    });
  });

  describe("validateEntry", () => {
    test("should validate correct entry", () => {
      const validEntry = {
        url: "https://example.com",
        css_selector: "#price",
        current_value: "$19.99",
      };

      expect(() => configManager.validateEntry(validEntry)).not.toThrow();
    });

    test("should reject non-object entry", () => {
      expect(() => configManager.validateEntry("not an object")).toThrow(
        "Entry must be an object"
      );

      expect(() => configManager.validateEntry(null)).toThrow(
        "Entry must be an object"
      );
    });

    test("should reject entry missing required fields", () => {
      const entryMissingUrl = {
        css_selector: "#price",
        current_value: "$19.99",
      };

      expect(() => configManager.validateEntry(entryMissingUrl)).toThrow(
        "Missing required field: url"
      );

      const entryMissingSelector = {
        url: "https://example.com",
        current_value: "$19.99",
      };

      expect(() => configManager.validateEntry(entryMissingSelector)).toThrow(
        "Missing required field: css_selector"
      );

      const entryMissingValue = {
        url: "https://example.com",
        css_selector: "#price",
      };

      expect(() => configManager.validateEntry(entryMissingValue)).toThrow(
        "Missing required field: current_value"
      );
    });

    test("should reject entry with non-string fields", () => {
      const entryWithNumberUrl = {
        url: 123,
        css_selector: "#price",
        current_value: "$19.99",
      };

      expect(() => configManager.validateEntry(entryWithNumberUrl)).toThrow(
        "Field url must be a string"
      );

      const entryWithBooleanSelector = {
        url: "https://example.com",
        css_selector: true,
        current_value: "$19.99",
      };

      expect(() =>
        configManager.validateEntry(entryWithBooleanSelector)
      ).toThrow("Field css_selector must be a string");
    });

    test("should reject invalid URL format", () => {
      const entryWithInvalidUrl = {
        url: "not-a-valid-url",
        css_selector: "#price",
        current_value: "$19.99",
      };

      expect(() => configManager.validateEntry(entryWithInvalidUrl)).toThrow(
        "Invalid URL format"
      );
    });

    test("should reject empty CSS selector", () => {
      const entryWithEmptySelector = {
        url: "https://example.com",
        css_selector: "   ",
        current_value: "$19.99",
      };

      expect(() => configManager.validateEntry(entryWithEmptySelector)).toThrow(
        "CSS selector cannot be empty"
      );
    });

    test("should reject entry with unexpected fields", () => {
      const entryWithExtraFields = {
        url: "https://example.com",
        css_selector: "#price",
        current_value: "$19.99",
        extra_field: "not allowed",
        another_field: "also not allowed",
      };

      expect(() => configManager.validateEntry(entryWithExtraFields)).toThrow(
        "Unexpected fields found: extra_field, another_field"
      );
    });

    test("should accept various valid URL formats", () => {
      const validUrls = [
        "https://example.com",
        "http://test.com/path",
        "https://subdomain.example.com/path?query=value",
        "http://localhost:3000",
        "https://example.com:8080/path#fragment",
      ];

      validUrls.forEach((url) => {
        const entry = {
          url,
          css_selector: "#test",
          current_value: "test",
        };
        expect(() => configManager.validateEntry(entry)).not.toThrow();
      });
    });

    test("should accept various valid CSS selectors", () => {
      const validSelectors = [
        "#id",
        ".class",
        "div",
        "div.class",
        "#id .class",
        '[data-test="value"]',
        "div > p",
        "ul li:first-child",
        ".parent .child:nth-of-type(2)",
      ];

      validSelectors.forEach((css_selector) => {
        const entry = {
          url: "https://example.com",
          css_selector,
          current_value: "test",
        };
        expect(() => configManager.validateEntry(entry)).not.toThrow();
      });
    });
  });
});
