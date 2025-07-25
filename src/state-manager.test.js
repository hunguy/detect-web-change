const fs = require("fs").promises;
const { constants: fsConstants } = require("fs");
const path = require("path");
const StateManager = require("./state-manager");
const ConfigurationManager = require("./config");

// Mock the fs module
jest.mock("fs", () => ({
  promises: {
    access: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
  },
  constants: {
    W_OK: 2,
    F_OK: 0,
    EACCES: "EACCES",
    ENOENT: "ENOENT",
  },
}));

// Mock the ConfigurationManager
jest.mock("./config");

describe("StateManager", () => {
  let stateManager;
  let mockConfigManager;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock ConfigurationManager instance
    mockConfigManager = {
      saveConfig: jest.fn(),
      validateConfig: jest.fn(),
    };

    ConfigurationManager.mockImplementation(() => mockConfigManager);

    stateManager = new StateManager();
  });

  describe("updateConfigValues", () => {
    const sampleConfig = [
      {
        url: "https://example.com/product1",
        css_selector: "#price",
        current_value: "$19.99",
      },
      {
        url: "https://example.com/product2",
        css_selector: ".title",
        current_value: "Product Name",
      },
    ];

    it("should update current_value fields for changed entries", () => {
      const changes = [
        {
          entry: {
            url: "https://example.com/product1",
            css_selector: "#price",
            current_value: "$19.99",
          },
          hasChanged: true,
          newValue: "$18.49",
          oldValue: "$19.99",
        },
      ];

      const result = stateManager.updateConfigValues(sampleConfig, changes);

      expect(result).toHaveLength(2);
      expect(result[0].current_value).toBe("$18.49");
      expect(result[1].current_value).toBe("Product Name"); // Unchanged
    });

    it("should not modify original configuration array", () => {
      const changes = [
        {
          entry: {
            url: "https://example.com/product1",
            css_selector: "#price",
            current_value: "$19.99",
          },
          hasChanged: true,
          newValue: "$18.49",
          oldValue: "$19.99",
        },
      ];

      const originalConfig = JSON.parse(JSON.stringify(sampleConfig));
      stateManager.updateConfigValues(sampleConfig, changes);

      expect(sampleConfig).toEqual(originalConfig);
    });

    it("should handle multiple changes", () => {
      const changes = [
        {
          entry: {
            url: "https://example.com/product1",
            css_selector: "#price",
            current_value: "$19.99",
          },
          hasChanged: true,
          newValue: "$18.49",
          oldValue: "$19.99",
        },
        {
          entry: {
            url: "https://example.com/product2",
            css_selector: ".title",
            current_value: "Product Name",
          },
          hasChanged: true,
          newValue: "New Product Name",
          oldValue: "Product Name",
        },
      ];

      const result = stateManager.updateConfigValues(sampleConfig, changes);

      expect(result[0].current_value).toBe("$18.49");
      expect(result[1].current_value).toBe("New Product Name");
    });

    it("should skip changes where hasChanged is false", () => {
      const changes = [
        {
          entry: {
            url: "https://example.com/product1",
            css_selector: "#price",
            current_value: "$19.99",
          },
          hasChanged: false,
          newValue: "$19.99",
          oldValue: "$19.99",
        },
      ];

      const result = stateManager.updateConfigValues(sampleConfig, changes);

      expect(result[0].current_value).toBe("$19.99"); // Unchanged
    });

    it("should skip invalid change records", () => {
      const changes = [
        {
          // Missing entry field
          hasChanged: true,
          newValue: "$18.49",
          oldValue: "$19.99",
        },
        {
          entry: null,
          hasChanged: true,
          newValue: "$18.49",
          oldValue: "$19.99",
        },
      ];

      const result = stateManager.updateConfigValues(sampleConfig, changes);

      expect(result[0].current_value).toBe("$19.99"); // Unchanged
      expect(result[1].current_value).toBe("Product Name"); // Unchanged
    });

    it("should throw error for non-array configuration", () => {
      expect(() => {
        stateManager.updateConfigValues("not an array", []);
      }).toThrow("Configuration must be an array");
    });

    it("should throw error for non-array changes", () => {
      expect(() => {
        stateManager.updateConfigValues(sampleConfig, "not an array");
      }).toThrow("Changes must be an array");
    });

    it("should handle empty changes array", () => {
      const result = stateManager.updateConfigValues(sampleConfig, []);

      expect(result).toEqual(sampleConfig);
    });

    it("should handle changes for non-existent entries gracefully", () => {
      const changes = [
        {
          entry: {
            url: "https://nonexistent.com",
            css_selector: "#missing",
            current_value: "old",
          },
          hasChanged: true,
          newValue: "new",
          oldValue: "old",
        },
      ];

      const result = stateManager.updateConfigValues(sampleConfig, changes);

      // Original entries should remain unchanged
      expect(result).toEqual(sampleConfig);
    });
  });

  describe("validateWritePermissions", () => {
    const testFilePath = "/test/config.json";
    const testDir = "/test";

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should validate permissions for existing writable file", async () => {
      fs.access
        .mockResolvedValueOnce() // Directory access succeeds
        .mockResolvedValueOnce() // File exists
        .mockResolvedValueOnce(); // File is writable

      await expect(
        stateManager.validateWritePermissions(testFilePath)
      ).resolves.toBeUndefined();

      expect(fs.access).toHaveBeenCalledWith(testDir, fsConstants.W_OK);
      expect(fs.access).toHaveBeenCalledWith(testFilePath, fsConstants.F_OK);
      expect(fs.access).toHaveBeenCalledWith(testFilePath, fsConstants.W_OK);
    });

    it("should validate permissions for non-existent file in writable directory", async () => {
      fs.access
        .mockResolvedValueOnce() // Directory access succeeds
        .mockRejectedValueOnce({ code: "ENOENT" }); // File doesn't exist

      await expect(
        stateManager.validateWritePermissions(testFilePath)
      ).resolves.toBeUndefined();

      expect(fs.access).toHaveBeenCalledWith(testDir, fsConstants.W_OK);
      expect(fs.access).toHaveBeenCalledWith(testFilePath, fsConstants.F_OK);
    });

    it("should throw error for non-existent directory", async () => {
      fs.access.mockRejectedValueOnce({ code: "ENOENT" });

      await expect(
        stateManager.validateWritePermissions(testFilePath)
      ).rejects.toThrow("Directory does not exist: /test");
    });

    it("should throw error for non-writable directory", async () => {
      fs.access.mockRejectedValueOnce({ code: "EACCES" });

      await expect(
        stateManager.validateWritePermissions(testFilePath)
      ).rejects.toThrow("No write permission for directory: /test");
    });

    it("should throw error for non-writable file", async () => {
      fs.access
        .mockResolvedValueOnce() // Directory access succeeds
        .mockResolvedValueOnce() // File exists
        .mockRejectedValueOnce({ code: "EACCES" }); // File is not writable

      await expect(
        stateManager.validateWritePermissions(testFilePath)
      ).rejects.toThrow("No write permission for file: /test/config.json");
    });

    it("should handle unexpected directory access errors", async () => {
      const unexpectedError = new Error("Unexpected error");
      fs.access.mockRejectedValueOnce(unexpectedError);

      await expect(
        stateManager.validateWritePermissions(testFilePath)
      ).rejects.toThrow("Write permission validation failed: Unexpected error");
    });

    it("should handle unexpected file access errors", async () => {
      const unexpectedError = new Error("Unexpected file error");
      fs.access
        .mockResolvedValueOnce() // Directory access succeeds
        .mockRejectedValueOnce(unexpectedError); // Unexpected file error

      await expect(
        stateManager.validateWritePermissions(testFilePath)
      ).rejects.toThrow(
        "Write permission validation failed: Unexpected file error"
      );
    });
  });

  describe("persistConfig", () => {
    const testFilePath = "/test/config.json";
    const testConfig = [
      {
        url: "https://example.com",
        css_selector: "#test",
        current_value: "test value",
      },
    ];

    it("should persist configuration successfully", async () => {
      // Mock successful permission validation
      jest.spyOn(stateManager, "validateWritePermissions").mockResolvedValue();
      mockConfigManager.saveConfig.mockResolvedValue();

      await stateManager.persistConfig(testFilePath, testConfig);

      expect(stateManager.validateWritePermissions).toHaveBeenCalledWith(
        testFilePath
      );
      expect(mockConfigManager.saveConfig).toHaveBeenCalledWith(
        testFilePath,
        testConfig
      );
    });

    it("should throw error if permission validation fails", async () => {
      const permissionError = new Error("Permission denied");
      jest
        .spyOn(stateManager, "validateWritePermissions")
        .mockRejectedValue(permissionError);

      await expect(
        stateManager.persistConfig(testFilePath, testConfig)
      ).rejects.toThrow("Failed to persist configuration: Permission denied");

      expect(mockConfigManager.saveConfig).not.toHaveBeenCalled();
    });

    it("should throw error if saveConfig fails", async () => {
      jest.spyOn(stateManager, "validateWritePermissions").mockResolvedValue();
      const saveError = new Error("Save failed");
      mockConfigManager.saveConfig.mockRejectedValue(saveError);

      await expect(
        stateManager.persistConfig(testFilePath, testConfig)
      ).rejects.toThrow("Failed to persist configuration: Save failed");
    });
  });

  describe("updateAndPersist", () => {
    const testFilePath = "/test/config.json";
    const testConfig = [
      {
        url: "https://example.com/product1",
        css_selector: "#price",
        current_value: "$19.99",
      },
    ];
    const testChanges = [
      {
        entry: {
          url: "https://example.com/product1",
          css_selector: "#price",
          current_value: "$19.99",
        },
        hasChanged: true,
        newValue: "$18.49",
        oldValue: "$19.99",
      },
    ];

    it("should update and persist configuration successfully", async () => {
      jest.spyOn(stateManager, "validateWritePermissions").mockResolvedValue();
      mockConfigManager.saveConfig.mockResolvedValue();

      const result = await stateManager.updateAndPersist(
        testFilePath,
        testConfig,
        testChanges
      );

      expect(result).toHaveLength(1);
      expect(result[0].current_value).toBe("$18.49");
      expect(stateManager.validateWritePermissions).toHaveBeenCalledWith(
        testFilePath
      );
      expect(mockConfigManager.saveConfig).toHaveBeenCalledWith(
        testFilePath,
        result
      );
    });

    it("should throw error if updateConfigValues fails", async () => {
      jest.spyOn(stateManager, "updateConfigValues").mockImplementation(() => {
        throw new Error("Update failed");
      });

      await expect(
        stateManager.updateAndPersist(testFilePath, testConfig, testChanges)
      ).rejects.toThrow(
        "Failed to update and persist configuration: Update failed"
      );
    });

    it("should throw error if persistConfig fails", async () => {
      jest.spyOn(stateManager, "validateWritePermissions").mockResolvedValue();
      const persistError = new Error("Persist failed");
      mockConfigManager.saveConfig.mockRejectedValue(persistError);

      await expect(
        stateManager.updateAndPersist(testFilePath, testConfig, testChanges)
      ).rejects.toThrow(
        "Failed to update and persist configuration: Failed to persist configuration: Persist failed"
      );
    });
  });
});
