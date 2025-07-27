# Web Element Change Detector CLI

A Node.js CLI tool that monitors web pages for changes in specific DOM elements and provides automated notifications when changes occur.

## Features

- 🔍 **Multi-page Monitoring**: Monitor multiple web pages simultaneously
- 🎯 **CSS Selector Targeting**: Use CSS selectors to target specific elements
- 📱 **Slack Notifications**: Get instant notifications via Slack webhooks
- 🔄 **Automatic State Updates**: Automatically update stored values after detecting changes
- 🛡️ **Robust Error Handling**: Graceful error handling with detailed logging
- 🧹 **Resource Cleanup**: Automatic cleanup of Chrome processes and temporary files
- ⚡ **Signal Handling**: Graceful shutdown on SIGINT/SIGTERM signals

## System Requirements

- **Node.js**: Version 16.0.0 or higher
- **Chrome/Chromium**: Google Chrome or Chromium browser installed
- **Memory**: Minimum 512MB available RAM
- **Operating System**: Windows, macOS, or Linux

## Installation

1. Clone this repository:

```bash
git clone <repository-url>
cd detect-web-change
```

2. Install dependencies:

```bash
npm install
```

3. Make sure Google Chrome is installed on your system:
   - **Windows**: Download from https://www.google.com/chrome/
   - **macOS**: Download from https://www.google.com/chrome/ or `brew install --cask google-chrome`
   - **Linux**: Install via package manager or download from https://www.google.com/chrome/

### Global Installation (Optional)

To use `detect-change` command from anywhere on your system:

```bash
npm link
```

This creates a global symlink, allowing you to run the tool from any directory without specifying the full path.

## Configuration

Create a JSON configuration file with monitoring targets and optional settings:

```json
{
  "slack_webhook": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
  "targets": [
    {
      "url": "https://example.com/product/123",
      "css_selector": "#price",
      "current_value": "$19.99"
    },
    {
      "url": "https://news.ycombinator.com",
      "css_selector": ".titleline:first-child a",
      "current_value": "Example News Title"
    }
  ]
}
```

### Configuration Fields

#### Global Settings

- **slack_webhook** (optional): Slack webhook URL for notifications. If provided, this will be used unless overridden by CLI arguments or environment variables.

#### Target Fields

- **url** (required): The webpage URL to monitor
- **css_selector** (required): CSS selector for the target element
- **current_value** (required): The last known value for comparison

### Legacy Format Support

The tool also supports the legacy array format for backward compatibility:

```json
[
  {
    "url": "https://example.com/product/123",
    "css_selector": "#price",
    "current_value": "$19.99"
  }
]
```

## Usage

### Local Usage

```bash
node detect-change.js --input config.json
```

### Global Usage (after npm link)

```bash
# Basic usage from any directory
detect-change --input config.json

# With full path to config
detect-change --input /path/to/config.json

# With Slack webhook override
detect-change --input config.json --slack-webhook https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Using environment variables
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
detect-change --input config.json
```

### Legacy Local Usage

```bash
# With Slack Notifications
node detect-change.js --input config.json --slack-webhook https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Using Environment Variables
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
node detect-change.js --input config.json
```

### Command Line Options

- `--input, -i`: Path to the input configuration JSON file (required)
- `--slack-webhook, -s`: Slack webhook URL for notifications (optional)
- `--help, -h`: Show help information
- `--version, -v`: Show version information

### Global Command Management

After running `npm link`, you can:

```bash
# Check if global command is working
detect-change --help

# Get version information
detect-change --version

# Uninstall global command (if needed)
npm unlink -g web-element-change-detector
```

## Examples

### Example 1: Monitor Product Prices

```json
{
  "slack_webhook": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
  "targets": [
    {
      "url": "https://store.example.com/product/laptop",
      "css_selector": ".price-current",
      "current_value": "$999.99"
    },
    {
      "url": "https://store.example.com/product/phone",
      "css_selector": ".sale-price",
      "current_value": "$599.99"
    }
  ]
}
```

### Example 2: Monitor News Headlines

```json
{
  "targets": [
    {
      "url": "https://news.ycombinator.com",
      "css_selector": ".titleline:first-child a",
      "current_value": "Current Top Story Title"
    },
    {
      "url": "https://techcrunch.com",
      "css_selector": "h2.post-block__title a",
      "current_value": "Latest Tech News"
    }
  ]
}
```

### Example 3: Monitor API Responses with Slack Integration

```json
{
  "slack_webhook": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
  "targets": [
    {
      "url": "https://api.example.com/status",
      "css_selector": "pre",
      "current_value": "{\"status\": \"operational\"}"
    }
  ]
}
```

## Slack Notifications

When changes are detected, the tool sends formatted notifications to Slack:

```
🔔 Change Detected!
• URL: https://example.com/product/123
• Selector: #price
• Was: $19.99
• Now: $18.49
• Checked: 2025-07-25 11:43 AM
```

### Setting up Slack Webhook

1. Go to your Slack workspace settings
2. Navigate to "Apps" → "Incoming Webhooks"
3. Create a new webhook for your desired channel
4. Copy the webhook URL and use it with the `--slack-webhook` option

## Docker Deployment

### Building and Running with Docker

The application can be deployed using Docker for consistent execution across different environments.

#### Prerequisites

- Docker installed on your target machine
- Your configuration file (`my-config.json` or similar)

#### Build the Docker Image

```bash
# Clone the repository
git clone <repository-url>
cd detect-web-change

# Build the Docker image
docker build -t website-change-detector .
```

#### Run the Container

```bash
# Create logs directory on host
mkdir -p logs

# Option 1: Run with Slack webhook environment variable
docker run -d --name change-detector \
  -e SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL" \
  -v $(pwd)/logs:/app/logs \
  website-change-detector

# Option 2: Run without Slack (uses webhook from config file)
docker run -d --name change-detector \
  -v $(pwd)/logs:/app/logs \
  website-change-detector

# Option 3: Use environment file
echo "SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL" > .env
docker run -d --name change-detector \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  website-change-detector

# Check if container is running
docker ps
```

#### Manual Testing

```bash
# Test the script manually
docker exec change-detector /app/run-detect-change-docker.sh

# Check the logs
tail -f logs/detect-change.log

# Or view container logs
docker logs change-detector
```

#### Container Management

```bash
# Stop the container
docker stop change-detector

# Start the container
docker start change-detector

# Remove the container
docker rm change-detector

# View real-time logs
docker logs -f change-detector

# Access container shell for debugging
docker exec -it change-detector /bin/bash
```

#### Scheduled Execution

The Docker container automatically runs the monitoring script at:

- **00:00** (midnight)
- **12:00** (noon)
- **14:00** (2 PM)
- **16:00** (4 PM)
- **18:00** (6 PM)
- **20:00** (8 PM)
- **22:00** (10 PM)

To modify the schedule, edit the cron expression in the `start.sh` file and rebuild the container.

#### Remote Deployment

For deployment on remote machines (like Oracle Cloud VM):

```bash
# 1. Transfer files to remote machine
scp -r . user@remote-host:/home/user/detect-web-change/

# 2. SSH into remote machine
ssh user@remote-host

# 3. Navigate to project directory
cd detect-web-change

# 4. Build and run with Slack webhook
docker build -t website-change-detector .
mkdir -p logs
docker run -d --name change-detector \
  -e SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL" \
  -v $(pwd)/logs:/app/logs \
  website-change-detector

# Alternative: Create .env file for easier management
echo "SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL" > .env
docker run -d --name change-detector \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  website-change-detector
```

#### Configuration Updates

To update your configuration without rebuilding:

```bash
# Stop the container
docker stop change-detector

# Update your config file (my-config.json) or environment variables
# Then rebuild and restart
docker build -t website-change-detector .
docker rm change-detector

# Restart with updated environment
docker run -d --name change-detector \
  -e SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/NEW/WEBHOOK/URL" \
  -v $(pwd)/logs:/app/logs \
  website-change-detector
```

#### Environment Variable Priority

The application uses Slack webhooks in this priority order:

1. `SLACK_WEBHOOK_URL` environment variable (highest priority)
2. `slack_webhook` field in configuration file
3. No notifications if neither is provided

#### Monitoring Cron Jobs

To verify that cron jobs are running properly in the Docker container:

```bash
# 1. Check if cron daemon is running
docker exec change-detector ps aux | grep cron

# 2. View the installed crontab
docker exec change-detector crontab -l

# 3. Check cron job configuration
docker exec change-detector cat /etc/cron.d/detect-change

# 4. View cron logs (if available)
docker exec change-detector tail -f /var/log/cron.log

# 5. Check application logs for scheduled runs
cat logs/detect-change.log

# 6. Monitor logs in real-time
tail -f logs/detect-change.log

# 7. Check last modification time of log file
ls -la logs/detect-change.log

# 8. Test the script manually to ensure it works
docker exec change-detector /app/run-detect-change-docker.sh

# 9. Check container uptime and status
docker ps
docker stats change-detector
```

#### Debugging Cron Issues

**Cron not running:**

```bash
# Check if cron service started
docker exec change-detector service cron status

# Restart cron if needed
docker exec change-detector service cron restart

# If crontab shows "no crontab for root", reinstall it
docker exec change-detector crontab /etc/cron.d/detect-change
```

**Environment variables not working:**

```bash
# Check what environment variables cron has
docker exec change-detector cat /etc/cron.d/detect-change

# Verify environment variables in container
docker exec change-detector env | grep SLACK
```

**Script not executing:**

```bash
# Check script permissions
docker exec change-detector ls -la /app/run-detect-change-docker.sh

# Test script manually with same environment as cron
docker exec change-detector bash -c "cd /app && ./run-detect-change-docker.sh"
```

**Log file issues:**

```bash
# Check if log directory exists and is writable
docker exec change-detector ls -la /app/logs/

# Check disk space
docker exec change-detector df -h

# Check for permission issues
docker exec change-detector touch /app/logs/test.log
```

#### Temporarily Changing Cron Schedule for Testing

To quickly test with a different schedule without rebuilding:

```bash
# Change to run every minute for testing
docker exec change-detector bash -c 'cat > /etc/cron.d/detect-change << EOF
SLACK_WEBHOOK_URL=$SLACK_WEBHOOK_URL
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

* * * * * root /app/run-detect-change-docker.sh
EOF'

docker exec change-detector chmod 0644 /etc/cron.d/detect-change
docker exec change-detector crontab /etc/cron.d/detect-change
docker exec change-detector service cron restart

# Watch logs to see it running every minute
tail -f logs/detect-change.log

# Change back to original schedule
docker exec change-detector bash -c 'cat > /etc/cron.d/detect-change << EOF
SLACK_WEBHOOK_URL=$SLACK_WEBHOOK_URL
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

0 0,12,14,16,18,20,22 * * * root /app/run-detect-change-docker.sh
EOF'

docker exec change-detector chmod 0644 /etc/cron.d/detect-change
docker exec change-detector crontab /etc/cron.d/detect-change
docker exec change-detector service cron restart
```

#### Setting Up Better Monitoring

For better monitoring, you can modify the start.sh to create a more verbose cron job:

```bash
# Edit start.sh to add cron logging (note: requires 'root' user specification for /etc/cron.d/ files)
echo "0 0,12,14,16,18,20,22 * * * root echo \"\$(date): Starting monitoring...\" >> /app/logs/cron.log && /app/run-detect-change-docker.sh && echo \"\$(date): Monitoring completed\" >> /app/logs/cron.log" >> /etc/cron.d/detect-change
```

#### Troubleshooting Docker Deployment

**Container exits immediately:**

```bash
# Check container logs
docker logs change-detector

# Common issues:
# - Missing config file
# - Chrome/Chromium not found
# - Permission issues
```

**Log files not appearing:**

```bash
# Ensure logs directory exists and has proper permissions
mkdir -p logs
chmod 755 logs

# Check if volume mount is working
docker exec change-detector ls -la /app/logs/
```

**Chrome executable errors:**
The Docker image includes Playwright's Chromium. If you see Chrome executable errors, the container may need to be rebuilt with updated dependencies.

## Scheduling

Use cron (Linux/macOS) or Task Scheduler (Windows) to run the tool periodically:

### Cron Example (every 30 minutes)

```bash
# Using global command (after npm link)
*/30 * * * * detect-change --input /path/to/config.json

# Using local installation
*/30 * * * * /usr/bin/node /path/to/detect-change.js --input /path/to/config.json

# Or run the shell script
* * * * * /bin/zsh run-detect-change.sh
```

### Systemd Timer Example

Create `/etc/systemd/system/web-monitor.service`:

```ini
[Unit]
Description=Web Element Change Detector
After=network.target

[Service]
Type=oneshot
# Using global command (after npm link)
ExecStart=detect-change --input /path/to/config.json
# Or using local installation
# ExecStart=/usr/bin/node /path/to/detect-change.js --input /path/to/config.json
User=your-username
Environment=SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

Create `/etc/systemd/system/web-monitor.timer`:

```ini
[Unit]
Description=Run Web Element Change Detector every 30 minutes
Requires=web-monitor.service

[Timer]
OnCalendar=*:0/30
Persistent=true

[Install]
WantedBy=timers.target
```

Enable and start:

```bash
sudo systemctl enable web-monitor.timer
sudo systemctl start web-monitor.timer
```

## Exit Codes

The tool uses standard exit codes to indicate the result:

- **0**: Success - monitoring completed without critical errors
- **1**: Error - critical errors occurred during monitoring
- **130**: Interrupted - process was interrupted by SIGINT (Ctrl+C)
- **143**: Terminated - process was terminated by SIGTERM

## Error Handling

The tool implements comprehensive error handling:

- **Configuration Errors**: Invalid JSON, missing fields, file permissions
- **Chrome Launch Errors**: Port conflicts, missing executable, system requirements
- **Network Errors**: Connection timeouts, DNS failures, server errors
- **Element Extraction Errors**: Missing selectors, page load failures
- **Notification Errors**: Slack webhook failures (non-critical)
- **Persistence Errors**: File write failures

### Graceful Degradation

- Individual target failures don't stop processing of other targets
- Notification failures don't prevent state updates
- Non-critical errors are logged as warnings

## Troubleshooting

### Chrome Not Found

```
Error: Chrome executable not found. Searched paths: ...
```

**Solution**: Install Google Chrome or ensure it's in the expected location.

### Port Already in Use

```
Error: Chrome debug port 9222 is already in use
```

**Solution**: Close existing Chrome instances or kill processes using port 9222.

### Permission Denied

```
Error: Cannot create user data directory
```

**Solution**: Ensure write permissions to the temporary directory.

### Element Not Found

```
Warning: CSS selector not found on page
```

**Solution**: Verify the CSS selector is correct and the element exists.

### Low Memory Warning

```
Warning: Low available memory: 256MB. Chrome may not start properly.
```

**Solution**: Close other applications to free up memory.

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Project Structure

```
├── src/                    # Source code
│   ├── cli.js             # CLI argument parsing
│   ├── config.js          # Configuration management
│   ├── chrome-launcher.js # Chrome process management
│   ├── browser-controller.js # Playwright browser control
│   ├── page-monitor.js    # Page navigation and extraction
│   ├── change-detector.js # Change detection logic
│   ├── slack-notifier.js  # Slack notification system
│   ├── state-manager.js   # State persistence
│   ├── logger.js          # Logging utilities
│   └── error-handler.js   # Error handling system
├── test/                  # Test files
│   ├── integration/       # Integration tests
│   └── fixtures/          # Test fixtures and mocks
├── detect-change.js       # Main entry point
├── example-config.json    # Example configuration
└── README.md             # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:

1. Check the troubleshooting section above
2. Review existing GitHub issues
3. Create a new issue with detailed information about your problem

---

**Note**: This tool launches Chrome in headless mode and connects to it programmatically. Ensure your system meets the requirements and Chrome is properly installed.
