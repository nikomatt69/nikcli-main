# nikCLI Background Agents - Multi-stage Docker build

# Stage 1: Build environment
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Stage 2: Runtime environment
FROM node:18-alpine AS runtime

# Install system dependencies
RUN apk add --no-cache \
    git \
    openssh-client \
    bash \
    curl \
    docker-cli \
    tmux

# Create app user
RUN addgroup -g 1001 -S nikd && \
    adduser -S nikd -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=nikd:nikd /app/dist ./dist
COPY --from=builder --chown=nikd:nikd /app/node_modules ./node_modules
COPY --from=builder --chown=nikd:nikd /app/package.json ./

# Create workspace directory
RUN mkdir -p /workspace && chown nikd:nikd /workspace

# Switch to app user
USER nikd

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the daemon
CMD ["node", "dist/cli/nikd.js", "start"]

# Stage 3: Development environment (optional)
FROM runtime AS development

USER root

# Install development tools
RUN apk add --no-cache \
    python3 \
    make \
    g++

# Install development dependencies
COPY --from=builder /app/package*.json ./
RUN yarn install --frozen-lockfile --include=dev

USER nikd

# Development command
CMD ["yarn", "dev"]
