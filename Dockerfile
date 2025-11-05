# nikCLI Backend API Server - Production Docker build

# Stage 1: Dependencies
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies (tsx is already in package.json)
# Use --legacy-peer-deps to handle peer dependency conflicts
RUN npm install --production=false --legacy-peer-deps

# Stage 2: Runtime
FROM node:22-alpine AS runtime

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
COPY --from=deps /app/package*.json ./

# Copy source code (tsx compiles TypeScript at runtime)
COPY src ./src
COPY tsconfig*.json ./

# Expose port (Railway will override with its own PORT)
EXPOSE 8080

# Health check - use PORT env var if available
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Start API server with tsx (Node 22+ requires --import instead of --loader)
CMD ["node", "--import", "tsx", "src/cli/background-agents/api/index.ts"]

