# nikCLI Background Agents Web Interface Dockerfile

FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nikcli -u 1001

# Change ownership of the app directory
RUN chown -R nikcli:nodejs /app
USER nikcli

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "server.js"]