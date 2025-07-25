const ChromeLauncher = require("./chrome-launcher");
const { spawn } = require("child_process");
const net = require("net");
const fs = require("fs").promises;

// Mock child_process, net, and fs
jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));
jest.mock("net", () => ({
  createServer: jest.fn(),
}));
jest.mock("fs", () => ({
  promises: {
    access: jest.fn(),
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    rm: jest.fn(),
    readdir: jest.fn(),
  },
}));

describe("ChromeLauncher", () => {
  let chromeLauncher;
  let mockProcess;
  let mockServer;

  beforeEach(() => {
    chromeLauncher = new ChromeLauncher();

    // Mock process object
    mockProcess = {
      on: jest.fn(),
      kill: jest.fn(),
      killed: false,
    };

    // Mock server object
    mockServer = {
      listen: jest.fn(),
      close: jest.fn(),
      once: jest.fn(),
      on: jest.fn(),
    };

    spawn.mockReturnValue(mockProcess);
    net.createServer.mockReturnValue(mockServer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with default values", () => {
      expect(chromeLauncher.chromeProcess).toBeNull();
      expect(chromeLauncher.debugPort).toBe(9222);
      expect(chromeLauncher.userDataDir).toContain("chrome-web-detector");
    });
  });

  describe("isPortInUse", () => {
    it("should return false when port is available", async () => {
      // Mock successful server listen (port available)
      mockServer.listen.mockImplementation((port, callback) => {
        callback();
      });
      mockServer.once.mockImplementation((event, callback) => {
        if (event === "close") {
          callback();
        }
      });

      const result = await chromeLauncher.isPortInUse(9222);
      expect(result).toBe(false);
      expect(mockServer.listen).toHaveBeenCalledWith(
        9222,
        expect.any(Function)
      );
      expect(mockServer.close).toHaveBeenCalled();
    });

    it("should return true when port is in use", async () => {
      // Mock server error (port in use)
      mockServer.on.mockImplementation((event, callback) => {
        if (event === "error") {
          callback();
        }
      });

      const result = await chromeLauncher.isPortInUse(9222);
      expect(result).toBe(true);
    });
  });

  describe("getPossibleChromePaths", () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
      });
    });

    it("should return Windows Chrome paths for win32", () => {
      Object.defineProperty(process, "platform", {
        value: "win32",
      });

      const paths = chromeLauncher.getPossibleChromePaths();
      expect(paths).toContain(
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      );
      expect(paths).toContain(
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
      );
    });

    it("should return macOS Chrome paths for darwin", () => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
      });

      const paths = chromeLauncher.getPossibleChromePaths();
      expect(paths).toContain(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      );
      expect(paths).toContain(
        "/Applications/Chromium.app/Contents/MacOS/Chromium"
      );
    });

    it("should return Linux Chrome paths for linux", () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
      });

      const paths = chromeLauncher.getPossibleChromePaths();
      expect(paths).toContain("/usr/bin/google-chrome");
      expect(paths).toContain("/usr/bin/chromium");
    });

    it("should throw error for unsupported platform", () => {
      Object.defineProperty(process, "platform", {
        value: "unsupported",
      });

      expect(() => chromeLauncher.getPossibleChromePaths()).toThrow(
        "Unsupported platform: unsupported"
      );
    });
  });

  describe("launch", () => {
    beforeEach(() => {
      // Mock port availability check to return false (port available)
      chromeLauncher.isPortInUse = jest.fn().mockResolvedValue(false);
      chromeLauncher.waitForDebugPort = jest.fn().mockResolvedValue();
      chromeLauncher.getDebugUrl = jest
        .fn()
        .mockReturnValue("http://localhost:9222");

      // Mock new methods
      chromeLauncher.validateSystemRequirements = jest.fn().mockResolvedValue();
      chromeLauncher.findChromePath = jest
        .fn()
        .mockResolvedValue("/path/to/chrome");

      // Mock fs operations
      fs.access.mockResolvedValue();
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      fs.unlink.mockResolvedValue();
    });

    it("should successfully launch Chrome with correct arguments", async () => {
      const debugUrl = await chromeLauncher.launch();

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining("Chrome"),
        expect.arrayContaining([
          "--remote-debugging-port=9222",
          "--user-data-dir=" + chromeLauncher.userDataDir,
          "--no-first-run",
          "--disable-default-apps",
          "--headless",
        ]),
        expect.objectContaining({
          detached: false,
          stdio: "pipe",
        })
      );

      expect(mockProcess.on).toHaveBeenCalledWith(
        "error",
        expect.any(Function)
      );
      expect(mockProcess.on).toHaveBeenCalledWith("exit", expect.any(Function));
      expect(chromeLauncher.waitForDebugPort).toHaveBeenCalled();
      expect(debugUrl).toBe("http://localhost:9222");
    });

    it("should throw error when debug port is already in use", async () => {
      chromeLauncher.isPortInUse.mockResolvedValue(true);

      await expect(chromeLauncher.launch()).rejects.toThrow(
        "Chrome debug port 9222 is already in use"
      );
    });

    it("should handle debug port timeout", async () => {
      chromeLauncher.waitForDebugPort.mockRejectedValue(
        new Error(
          "Chrome debug port 9222 did not become available within 10000ms"
        )
      );
      chromeLauncher.terminate = jest.fn().mockResolvedValue();

      await expect(chromeLauncher.launch()).rejects.toThrow(
        "Chrome debug port 9222 did not become available within 10000ms"
      );
      expect(chromeLauncher.terminate).toHaveBeenCalled();
    });
  });

  describe("waitForDebugPort", () => {
    it("should resolve when debug port becomes available", async () => {
      let callCount = 0;
      chromeLauncher.isPortInUse = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount > 2); // Available after 2 calls
      });

      await expect(
        chromeLauncher.waitForDebugPort(5000)
      ).resolves.toBeUndefined();
      expect(chromeLauncher.isPortInUse).toHaveBeenCalledTimes(3);
    });

    it("should timeout when debug port does not become available", async () => {
      chromeLauncher.isPortInUse = jest.fn().mockResolvedValue(false);

      await expect(chromeLauncher.waitForDebugPort(100)).rejects.toThrow(
        "Chrome debug port 9222 did not become available within 100ms"
      );
    });
  });

  describe("getDebugUrl", () => {
    it("should return correct debug URL", () => {
      const url = chromeLauncher.getDebugUrl();
      expect(url).toBe("http://localhost:9222");
    });
  });

  describe("terminate", () => {
    it("should terminate Chrome process gracefully", async () => {
      chromeLauncher.chromeProcess = mockProcess;

      const terminatePromise = chromeLauncher.terminate();

      // Simulate process exit
      const exitCallback = mockProcess.on.mock.calls.find(
        (call) => call[0] === "exit"
      )[1];
      exitCallback();

      await terminatePromise;

      expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
      expect(chromeLauncher.chromeProcess).toBeNull();
    });

    it("should force kill Chrome process if graceful termination fails", async () => {
      jest.useFakeTimers();

      chromeLauncher.chromeProcess = mockProcess;
      mockProcess.killed = false;

      const terminatePromise = chromeLauncher.terminate();

      // Fast-forward past force kill timeout
      jest.advanceTimersByTime(6000);

      expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
      expect(mockProcess.kill).toHaveBeenCalledWith("SIGKILL");

      // Simulate process exit after force kill
      const exitCallback = mockProcess.on.mock.calls.find(
        (call) => call[0] === "exit"
      )[1];
      exitCallback();

      await terminatePromise;

      jest.useRealTimers();
    });

    it("should handle case when no Chrome process exists", async () => {
      chromeLauncher.chromeProcess = null;

      await expect(chromeLauncher.terminate()).resolves.toBeUndefined();
    });

    it("should handle case when Chrome process is already killed", async () => {
      chromeLauncher.chromeProcess = { ...mockProcess, killed: true };

      await expect(chromeLauncher.terminate()).resolves.toBeUndefined();
      expect(chromeLauncher.chromeProcess).toBeNull();
    });
  });

  describe("isRunning", () => {
    it("should return true when Chrome process is running", () => {
      chromeLauncher.chromeProcess = mockProcess;
      mockProcess.killed = false;

      expect(chromeLauncher.isRunning()).toBe(true);
    });

    it("should return false when Chrome process is killed", () => {
      chromeLauncher.chromeProcess = mockProcess;
      mockProcess.killed = true;

      expect(chromeLauncher.isRunning()).toBe(false);
    });

    it("should return false when no Chrome process exists", () => {
      chromeLauncher.chromeProcess = null;

      expect(chromeLauncher.isRunning()).toBe(false);
    });
  });
});
