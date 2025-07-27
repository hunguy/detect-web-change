#!/bin/bash

cd /app
# Run your script - log to logs directory
# Environment variables are already set by cron
node detect-change.js --input my-config.json >> logs/detect-change.log 2>&1