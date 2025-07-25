#!/bin/bash

# Web Element Change Detector Installation Script

set -e

echo "🔧 Web Element Change Detector Installation"
echo "=========================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16 or higher."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version $NODE_VERSION is not supported. Please upgrade to Node.js 16 or higher."
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm."
    exit 1
fi

echo "✅ npm $(npm -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if Chrome is installed
CHROME_FOUND=false

if command -v google-chrome &> /dev/null; then
    echo "✅ Google Chrome detected: $(google-chrome --version)"
    CHROME_FOUND=true
elif command -v chromium &> /dev/null; then
    echo "✅ Chromium detected: $(chromium --version)"
    CHROME_FOUND=true
elif command -v chromium-browser &> /dev/null; then
    echo "✅ Chromium browser detected: $(chromium-browser --version)"
    CHROME_FOUND=true
elif [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    echo "✅ Google Chrome detected (macOS)"
    CHROME_FOUND=true
elif [ -f "/Applications/Chromium.app/Contents/MacOS/Chromium" ]; then
    echo "✅ Chromium detected (macOS)"
    CHROME_FOUND=true
fi

if [ "$CHROME_FOUND" = false ]; then
    echo "⚠️  Chrome/Chromium not found. Please install Google Chrome:"
    echo "   • Linux: sudo apt install google-chrome-stable"
    echo "   • macOS: brew install --cask google-chrome"
    echo "   • Windows: Download from https://www.google.com/chrome/"
    echo ""
    echo "   The tool may still work if Chrome is installed in a non-standard location."
fi

# Create example configuration if it doesn't exist
if [ ! -f "config.json" ]; then
    echo "📝 Creating example configuration file..."
    cp example-config.json config.json
    echo "✅ Created config.json from example"
fi

# Run a quick test
echo "🧪 Running system validation test..."
if node detect-change.js --help > /dev/null 2>&1; then
    echo "✅ Installation successful!"
else
    echo "❌ Installation test failed. Please check the error messages above."
    exit 1
fi

echo ""
echo "🎉 Installation Complete!"
echo ""
echo "Next steps:"
echo "1. Edit config.json with your monitoring targets"
echo "2. Run: node detect-change.js --input config.json"
echo "3. For Slack notifications: node detect-change.js --input config.json --slack-webhook YOUR_WEBHOOK_URL"
echo ""
echo "For more information, see README.md"