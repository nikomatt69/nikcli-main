# nikCLI Backend API Server - Production Docker build

# Stage 1: Dependencies
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files and fix script
COPY package.json ./
COPY scripts/fix-unicorn-magic.js ./scripts/

# Install pnpm for better ESM dependency handling
RUN npm install -g pnpm@latest

# Install dependencies using pnpm (handles ESM packages better)
# pnpm's packageExtensions will automatically fix ESM-only packages
RUN pnpm install --frozen-lockfile=false --shamefully-hoist

# Ensure ESM packages are fixed (pnpm packageExtensions + postinstall script)
RUN node scripts/fix-unicorn-magic.js || echo "ESM fix script completed (some packages may not be installed)"

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
COPY scripts/fix-unicorn-magic.js ./scripts/

# Expose port (Railway will override with its own PORT)
EXPOSE 8080

# Health check - use PORT env var if available
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Start API server with tsx (Node 22+ requires --import instead of --loader)
CMD ["node", "--import", "tsx", "src/cli/background-agents/api/index.ts"]

