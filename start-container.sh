#!/bin/bash

# Ensure logs directory exists
mkdir -p logs

# Ensure config.json exists as a file
if [ -d "config.json" ]; then
  echo "Warning: config.json is a directory, removing it..."
  rm -rf config.json
fi

if [ ! -f "config.json" ]; then
  echo "Creating default config.json from my-config.json..."
  if [ -f "my-config.json" ]; then
    cp my-config.json config.json
  else
    echo "Error: Neither config.json nor my-config.json exists!"
    exit 1
  fi
fi

echo "Starting Docker container with config.json mounted as file..."

# Run Docker container
docker run -d --name change-detector \
  -e SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-https://hooks.slack.com/services/YOUR/WEBHOOK/URL}" \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/config.json:/app/config.json \
  website-change-detector

echo "Container started successfully!"
echo "Check logs with: tail -f logs/detect-change.log"
echo "Check container status with: docker ps"