# NikCLI Backend API Server - Production Docker build (Bun-only)

# Stage 1: Dependencies
FROM oven/bun:1.3-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --production

# Stage 2: Runtime
FROM oven/bun:1.3-alpine AS runtime

# Install minimal runtime dependencies
RUN apk add --no-cache \
    git \
    curl \
    bash

WORKDIR /app

# Set environment
ENV NODE_ENV=production
# PORT is provided by Railway dynamically, don't hardcode

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Copy source code (Bun compiles TypeScript at runtime)
COPY src ./src
COPY tsconfig*.json ./

# Expose port (Railway will override with its own PORT)
EXPOSE 8080

# Health check - use PORT env var if available
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Start API server with Bun (no need for tsx - Bun handles TypeScript natively)
CMD ["bun", "run", "src/cli/background-agents/api/index.ts"]
