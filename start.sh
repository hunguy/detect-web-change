#!/bin/bash

# Create crontab with current environment variables
echo "SLACK_WEBHOOK_URL=$SLACK_WEBHOOK_URL" > /etc/cron.d/detect-change
echo "PATH=$PATH" >> /etc/cron.d/detect-change
echo "" >> /etc/cron.d/detect-change
echo "0 0,12,14,16,18,20,22 * * * /app/run-detect-change-docker.sh" >> /etc/cron.d/detect-change

# Set proper permissions and install crontab
chmod 0644 /etc/cron.d/detect-change
crontab /etc/cron.d/detect-change

# Start cron daemon
cron

# Keep container running by tailing the log file
tail -f /app/logs/detect-change.log