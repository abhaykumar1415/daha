FROM node:20-bullseye-slim

# Install system dependencies and Google Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list' \
    && apt-get update && apt-get install -y \
    google-chrome-stable \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Chrome executable path environment variable
ENV CHROME_PATH=/usr/bin/google-chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=true

# Configure working directory
WORKDIR /usr/src/app

# Copy dependency configuration
COPY package*.json ./

# Install project dependencies
RUN npm ci

# Copy application source code
COPY . .

# Build the TypeScript project
RUN npm run build

# Link the CLI globally
RUN npm link

# Default command displays help
ENTRYPOINT ["daha"]
CMD ["--help"]
