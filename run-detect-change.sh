#!/bin/zsh

# Load nvm
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

# Optional: Use specific Node version
nvm use 20
cd /Users/henry/Projects/detect-website-change
# Run your script
node detect-change.js >> detect-change.log 2>&1