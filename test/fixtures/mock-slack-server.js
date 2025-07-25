/**
 * Mock Slack webhook server for testing notifications
 */

const http = require("http");
const url = require("url");

class MockSlackServer {
  constructor(port = 3001) {
    this.port = port;
    this.server = null;
    this.requests = [];
    this.responses = new Map();
    this.isRunning = false;
  }

  /**
   * Start the mock server
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, (err) => {
        if (err) {
          reject(err);
        } else {
          this.isRunning = true;
          resolve();
        }
      });
    });
  }

  /**
   * Stop the mock server
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server && this.isRunning) {
        this.server.close(() => {
          this.isRunning = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming requests
   */
  handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      const request = {
        method: req.method,
        url: req.url,
        path: parsedUrl.pathname,
        query: parsedUrl.query,
        headers: req.headers,
        body: body,
        timestamp: new Date().toISOString(),
      };

      // Parse JSON body if present
      if (req.headers["content-type"] === "application/json" && body) {
        try {
          request.jsonBody = JSON.parse(body);
        } catch (e) {
          request.parseError = e.message;
        }
      }

      this.requests.push(request);

      // Check for configured response
      const responseConfig = this.responses.get(parsedUrl.pathname) || {
        status: 200,
        body: "ok",
      };

      res.writeHead(responseConfig.status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });

      res.end(JSON.stringify(responseConfig.body));
    });
  }

  /**
   * Configure response for a specific path
   */
  setResponse(path, status = 200, body = "ok") {
    this.responses.set(path, { status, body });
  }

  /**
   * Get all received requests
   */
  getRequests() {
    return [...this.requests];
  }

  /**
   * Get requests for a specific path
   */
  getRequestsForPath(path) {
    return this.requests.filter((req) => req.path === path);
  }

  /**
   * Clear all recorded requests
   */
  clearRequests() {
    this.requests = [];
  }

  /**
   * Get the webhook URL for this mock server
   */
  getWebhookUrl(path = "/webhook") {
    return `http://localhost:${this.port}${path}`;
  }

  /**
   * Simulate various error scenarios
   */
  simulateError(path, errorType = "server_error") {
    switch (errorType) {
      case "server_error":
        this.setResponse(path, 500, { error: "Internal Server Error" });
        break;
      case "bad_request":
        this.setResponse(path, 400, { error: "Bad Request" });
        break;
      case "unauthorized":
        this.setResponse(path, 401, { error: "Unauthorized" });
        break;
      case "rate_limit":
        this.setResponse(path, 429, { error: "Rate Limited" });
        break;
      case "timeout":
        // Simulate timeout by not responding
        this.setResponse(path, null, null);
        break;
      default:
        this.setResponse(path, 500, { error: "Unknown Error" });
    }
  }

  /**
   * Validate Slack webhook payload format
   */
  validateSlackPayload(request) {
    const errors = [];

    if (!request.jsonBody) {
      errors.push("Missing JSON body");
      return errors;
    }

    const payload = request.jsonBody;

    // Check for required Slack webhook fields
    if (!payload.text && !payload.attachments && !payload.blocks) {
      errors.push("Missing required field: text, attachments, or blocks");
    }

    // Validate text format if present
    if (payload.text && typeof payload.text !== "string") {
      errors.push("text field must be a string");
    }

    // Check for change detection specific content
    if (payload.text) {
      const requiredPatterns = [
        /Change Detected/i,
        /URL:/i,
        /Selector:/i,
        /Was:/i,
        /Now:/i,
        /Checked:/i,
      ];

      const missingPatterns = requiredPatterns.filter(
        (pattern) => !pattern.test(payload.text)
      );
      if (missingPatterns.length > 0) {
        errors.push(
          `Missing expected content patterns: ${missingPatterns.length} patterns not found`
        );
      }
    }

    return errors;
  }

  /**
   * Get summary of all webhook interactions
   */
  getSummary() {
    const requests = this.getRequests();
    const webhookRequests = requests.filter((req) => req.method === "POST");

    return {
      totalRequests: requests.length,
      webhookRequests: webhookRequests.length,
      successfulRequests: webhookRequests.filter((req) => !req.error).length,
      errors: webhookRequests.filter((req) => req.error).length,
      validPayloads: webhookRequests.filter((req) => {
        const errors = this.validateSlackPayload(req);
        return errors.length === 0;
      }).length,
      isRunning: this.isRunning,
      port: this.port,
    };
  }
}

module.exports = MockSlackServer;
