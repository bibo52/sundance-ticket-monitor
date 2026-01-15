# Use Bun's official image
FROM oven/bun:latest

# Install Playwright dependencies for headless Chromium
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libasound2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Install Playwright browsers
RUN bunx playwright install chromium --with-deps

# Copy source code
COPY . .

# Create directory for state file
RUN mkdir -p /app/data

# Run the monitor
CMD ["bun", "run", "monitor"]
