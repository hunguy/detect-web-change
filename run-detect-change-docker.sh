#!/bin/bash

cd /app
# Run your script - log to logs directory
node detect-change.js --input my-config.json >> logs/detect-change.log 2>&1