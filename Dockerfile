# Use Ubuntu base image with Node.js
FROM node:20-slim

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libgconf-2-4 \
    libxtst6 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxfixes3 \
    libnss3 \
    libcups2 \
    libgbm1 \
    cron \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Install Playwright browsers
RUN npx playwright install chromium

# Make docker shell script executable
RUN chmod +x run-detect-change-docker.sh

# Create crontab file
RUN echo "0 0,12,14,16,18,20,22 * * * /app/run-detect-change-docker.sh" > /etc/cron.d/detect-change && \
    chmod 0644 /etc/cron.d/detect-change && \
    crontab /etc/cron.d/detect-change

# Create log file (will be mounted from host)
RUN touch /app/detect-change.log

# Start cron and keep container running
CMD ["sh", "-c", "cron && tail -f /app/detect-change.log"]