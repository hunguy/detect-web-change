const MonitoringWorkflow = require("../detect-change").MonitoringWorkflow;

// Mock all dependencies
jest.mock("./config");
jest.mock("./chrome-launcher");
jest.mock("./browser-controller");
jest.mock("./page-monitor");
jest.mock("./change-detector");
jest.mock("./slack-notifier");
jest.mock("./state-manager");

const ConfigurationManager = require("./config");
const ChromeLauncher = require("./chrome-launcher");
const BrowserController = require("./browser-controller");
const PageMonitor = require("./page-monitor");
const ChangeDetector = require("./change-detector");
const SlackNotifier = require("./slack-notifier");
const StateManager = require("./state-manager");

describe("MonitoringWorkflow", () => {
  let workflow;
  let mockConfig;
  let mockChromeLauncher;
  let mockBrowserController;
  let mockPageMonitor;
  let mockChangeDetector;
  let mockSlackNotifier;
  let mockStateManager;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockConfig = {
      loadConfig: jest.fn(),
    };
    mockChromeLauncher = {
      launch: jest.fn(),
      terminate: jest.fn(),
      isRunning: jest.fn(),
    };
    mockBrowserController = {
      connect: jest.fn(),
      createPage: jest.fn(),
      closePage: jest.fn(),
      disconnect: jest.fn(),
      isConnectedToBrowser: jest.fn(),
    };
    mockPageMonitor = {
      navigateAndExtract: jest.fn(),
    };
    mockChangeDetector = {
      processEntry: jest.fn(),
    };
    mockSlackNotifier = {
      sendChangeNotification: jest.fn(),
    };
    mockStateManager = {
      updateAndPersist: jest.fn(),
    };

    // Mock constructors
    ConfigurationManager.mockImplementation(() => mockConfig);
    ChromeLauncher.mockImplementation(() => mockChromeLauncher);
    BrowserController.mockImplementation(() => mockBrowserController);
    PageMonitor.mockImplementation(() => mockPageMonitor);
    ChangeDetector.mockImplementation(() => mockChangeDetector);
    SlackNotifier.mockImplementation(() => mockSlackNotifier);
    StateManager.mockImplementation(() => mockStateManager);

    workflow = new MonitoringWorkflow();
  });

  describe("initialization", () => {
    test("should initialize with correct configuration", async () => {
      await workflow.initialize(
        "/path/to/config.json",
        "https://hooks.slack.com/webhook"
      );

      expect(workflow.session.configPath).toBe("/path/to/config.json");
      expect(workflow.session.slackWebhook).toBe(
        "https://hooks.slack.com/webhook"
      );
      expect(workflow.slackNotifier).toBeDefined();
    });

    test("should initialize without Slack webhook", async () => {
      await workflow.initialize("/path/to/config.json");

      expect(workflow.session.configPath).toBe("/path/to/config.json");
      expect(workflow.session.slackWebhook).toBeUndefined();
      expect(workflow.slackNotifier).toBeNull();
    });
  });

  describe("workflow execution", () => {
    beforeEach(async () => {
      await workflow.initialize(
        "/path/to/config.json",
        "https://hooks.slack.com/webhook"
      );
    });

    test("should execute complete workflow successfully", async () => {
      const mockConfigData = [
        {
          url: "https://example.com",
          css_selector: "#test",
          current_value: "old value",
        },
      ];

      const mockPage = { id: "page1" };
      const mockResult = {
        entry: mockConfigData[0],
        hasChanged: true,
        oldValue: "old value",
        newValue: "new value",
        timestamp: new Date().toISOString(),
      };

      // Setup mocks
      mockConfig.loadConfig.mockResolvedValue(mockConfigData);
      mockChromeLauncher.launch.mockResolvedValue("http://localhost:9222");
      mockBrowserController.connect.mockResolvedValue();
      mockBrowserController.createPage.mockResolvedValue(mockPage);
      mockBrowserController.closePage.mockResolvedValue();
      mockBrowserController.disconnect.mockResolvedValue();
      mockBrowserController.isConnectedToBrowser.mockReturnValue(true);
      mockChromeLauncher.terminate.mockResolvedValue();
      mockChromeLauncher.isRunning.mockReturnValue(true);
      mockPageMonitor.navigateAndExtract.mockResolvedValue("new value");
      mockChangeDetector.processEntry.mockReturnValue(mockResult);
      mockSlackNotifier.sendChangeNotification.mockResolvedValue(true);
      mockStateManager.updateAndPersist.mockResolvedValue(mockConfigData);

      const session = await workflow.execute();

      // Verify workflow steps
      expect(mockConfig.loadConfig).toHaveBeenCalledWith(
        "/path/to/config.json"
      );
      expect(mockChromeLauncher.launch).toHaveBeenCalled();
      expect(mockBrowserController.connect).toHaveBeenCalledWith(
        "http://localhost:9222"
      );
      expect(mockBrowserController.createPage).toHaveBeenCalled();
      expect(mockPageMonitor.navigateAndExtract).toHaveBeenCalledWith(
        mockPage,
        "https://example.com",
        "#test"
      );
      expect(mockChangeDetector.processEntry).toHaveBeenCalledWith(
        mockConfigData[0],
        "new value"
      );
      expect(mockSlackNotifier.sendChangeNotification).toHaveBeenCalledWith(
        mockResult
      );
      expect(mockStateManager.updateAndPersist).toHaveBeenCalledWith(
        "/path/to/config.json",
        mockConfigData,
        [mockResult]
      );

      // Verify cleanup
      expect(mockBrowserController.closePage).toHaveBeenCalledWith(mockPage);
      expect(mockBrowserController.disconnect).toHaveBeenCalled();
      expect(mockChromeLauncher.terminate).toHaveBeenCalled();

      // Verify session results
      expect(session.results).toHaveLength(1);
      expect(session.results[0]).toEqual(mockResult);
      expect(session.errors).toHaveLength(0);
    });

    test("should handle individual target errors with isolation", async () => {
      const mockConfigData = [
        {
          url: "https://example.com",
          css_selector: "#test",
          current_value: "old value",
        },
        {
          url: "https://example2.com",
          css_selector: "#test2",
          current_value: "old value 2",
        },
      ];

      const mockPage = { id: "page1" };
      const mockResult = {
        entry: mockConfigData[1],
        hasChanged: false,
        oldValue: "old value 2",
        newValue: "old value 2",
        timestamp: new Date().toISOString(),
      };

      // Setup mocks - first target fails, second succeeds
      mockConfig.loadConfig.mockResolvedValue(mockConfigData);
      mockChromeLauncher.launch.mockResolvedValue("http://localhost:9222");
      mockBrowserController.connect.mockResolvedValue();
      mockBrowserController.createPage.mockResolvedValue(mockPage);
      mockBrowserController.closePage.mockResolvedValue();
      mockBrowserController.disconnect.mockResolvedValue();
      mockBrowserController.isConnectedToBrowser.mockReturnValue(true);
      mockChromeLauncher.terminate.mockResolvedValue();
      mockChromeLauncher.isRunning.mockReturnValue(true);
      mockPageMonitor.navigateAndExtract
        .mockRejectedValueOnce(new Error("Navigation failed"))
        .mockResolvedValueOnce("old value 2");
      mockChangeDetector.processEntry.mockReturnValue(mockResult);
      mockStateManager.updateAndPersist.mockResolvedValue(mockConfigData);

      const session = await workflow.execute();

      // Verify both targets were processed
      expect(session.results).toHaveLength(2);
      expect(session.results[0].error).toBe("Navigation failed");
      expect(session.results[1]).toEqual(mockResult);
      expect(session.errors).toHaveLength(1);
      expect(session.errors[0].type).toBe("TARGET_ERROR");
    });

    test("should send notifications before state updates for consistency", async () => {
      const mockConfigData = [
        {
          url: "https://example.com",
          css_selector: "#test",
          current_value: "old value",
        },
        {
          url: "https://example2.com",
          css_selector: "#test2",
          current_value: "old value 2",
        },
      ];

      const mockPage = { id: "page1" };
      const mockResult1 = {
        entry: mockConfigData[0],
        hasChanged: true,
        oldValue: "old value",
        newValue: "new value",
        timestamp: new Date().toISOString(),
      };
      const mockResult2 = {
        entry: mockConfigData[1],
        hasChanged: true,
        oldValue: "old value 2",
        newValue: "new value 2",
        timestamp: new Date().toISOString(),
      };

      // Setup mocks
      mockConfig.loadConfig.mockResolvedValue(mockConfigData);
      mockChromeLauncher.launch.mockResolvedValue("http://localhost:9222");
      mockBrowserController.connect.mockResolvedValue();
      mockBrowserController.createPage.mockResolvedValue(mockPage);
      mockBrowserController.closePage.mockResolvedValue();
      mockBrowserController.disconnect.mockResolvedValue();
      mockBrowserController.isConnectedToBrowser.mockReturnValue(true);
      mockChromeLauncher.terminate.mockResolvedValue();
      mockChromeLauncher.isRunning.mockReturnValue(true);
      mockPageMonitor.navigateAndExtract
        .mockResolvedValueOnce("new value")
        .mockResolvedValueOnce("new value 2");
      mockChangeDetector.processEntry
        .mockReturnValueOnce(mockResult1)
        .mockReturnValueOnce(mockResult2);
      mockSlackNotifier.sendChangeNotification.mockResolvedValue(true);
      mockStateManager.updateAndPersist.mockResolvedValue(mockConfigData);

      await workflow.execute();

      // Verify that all notifications were sent before state update
      expect(mockSlackNotifier.sendChangeNotification).toHaveBeenCalledTimes(2);
      expect(mockSlackNotifier.sendChangeNotification).toHaveBeenNthCalledWith(
        1,
        mockResult1
      );
      expect(mockSlackNotifier.sendChangeNotification).toHaveBeenNthCalledWith(
        2,
        mockResult2
      );
      expect(mockStateManager.updateAndPersist).toHaveBeenCalledWith(
        "/path/to/config.json",
        mockConfigData,
        [mockResult1, mockResult2]
      );

      // Verify that notifications were called before state update
      const notificationCalls =
        mockSlackNotifier.sendChangeNotification.mock.invocationCallOrder;
      const stateUpdateCall =
        mockStateManager.updateAndPersist.mock.invocationCallOrder[0];
      expect(notificationCalls[0]).toBeLessThan(stateUpdateCall);
      expect(notificationCalls[1]).toBeLessThan(stateUpdateCall);
    });

    test("should continue processing if individual notifications fail", async () => {
      const mockConfigData = [
        {
          url: "https://example.com",
          css_selector: "#test",
          current_value: "old value",
        },
        {
          url: "https://example2.com",
          css_selector: "#test2",
          current_value: "old value 2",
        },
      ];

      const mockPage = { id: "page1" };
      const mockResult1 = {
        entry: mockConfigData[0],
        hasChanged: true,
        oldValue: "old value",
        newValue: "new value",
        timestamp: new Date().toISOString(),
      };
      const mockResult2 = {
        entry: mockConfigData[1],
        hasChanged: true,
        oldValue: "old value 2",
        newValue: "new value 2",
        timestamp: new Date().toISOString(),
      };

      // Setup mocks
      mockConfig.loadConfig.mockResolvedValue(mockConfigData);
      mockChromeLauncher.launch.mockResolvedValue("http://localhost:9222");
      mockBrowserController.connect.mockResolvedValue();
      mockBrowserController.createPage.mockResolvedValue(mockPage);
      mockBrowserController.closePage.mockResolvedValue();
      mockBrowserController.disconnect.mockResolvedValue();
      mockBrowserController.isConnectedToBrowser.mockReturnValue(true);
      mockChromeLauncher.terminate.mockResolvedValue();
      mockChromeLauncher.isRunning.mockReturnValue(true);
      mockPageMonitor.navigateAndExtract
        .mockResolvedValueOnce("new value")
        .mockResolvedValueOnce("new value 2");
      mockChangeDetector.processEntry
        .mockReturnValueOnce(mockResult1)
        .mockReturnValueOnce(mockResult2);

      // First notification fails, second succeeds
      mockSlackNotifier.sendChangeNotification
        .mockRejectedValueOnce(new Error("Slack webhook failed"))
        .mockResolvedValueOnce(true);
      mockStateManager.updateAndPersist.mockResolvedValue(mockConfigData);

      const session = await workflow.execute();

      // Verify both notifications were attempted
      expect(mockSlackNotifier.sendChangeNotification).toHaveBeenCalledTimes(2);

      // Verify state was still updated despite notification failure
      expect(mockStateManager.updateAndPersist).toHaveBeenCalledWith(
        "/path/to/config.json",
        mockConfigData,
        [mockResult1, mockResult2]
      );

      // Verify notification error was logged
      expect(session.errors).toHaveLength(1);
      expect(session.errors[0].type).toBe("NOTIFICATION_ERROR");
      expect(session.errors[0].message).toBe("Slack webhook failed");
    });

    test("should handle cleanup on failure", async () => {
      mockConfig.loadConfig.mockRejectedValue(new Error("Config load failed"));
      mockBrowserController.isConnectedToBrowser.mockReturnValue(true);
      mockChromeLauncher.isRunning.mockReturnValue(true);
      mockBrowserController.disconnect.mockResolvedValue();
      mockChromeLauncher.terminate.mockResolvedValue();

      await expect(workflow.execute()).rejects.toThrow("Config load failed");

      // Verify cleanup was attempted
      expect(mockBrowserController.disconnect).toHaveBeenCalled();
      expect(mockChromeLauncher.terminate).toHaveBeenCalled();
    });
  });

  describe("session summary", () => {
    test("should provide accurate session summary", () => {
      workflow.session.startTime = new Date("2023-01-01T10:00:00Z");
      workflow.session.endTime = new Date("2023-01-01T10:00:05Z");
      workflow.session.results = [
        { hasChanged: true },
        { hasChanged: false },
        { hasChanged: true },
      ];
      workflow.session.errors = [{ type: "TARGET_ERROR" }];

      const summary = workflow.getSessionSummary();

      expect(summary.duration).toBe(5);
      expect(summary.total).toBe(3);
      expect(summary.changes).toBe(2);
      expect(summary.errors).toBe(1);
      expect(summary.success).toBe(false);
    });
  });
});
