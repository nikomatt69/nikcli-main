#!/usr/bin/env node
// Standalone entry point for Background Agents API Server
// Designed for cloud deployment (Railway, Render, etc.)

import dotenv from 'dotenv'
import { type APIServerConfig, BackgroundAgentsAPIServer } from './server'

// Load environment variables
dotenv.config()

/**
 * Parse CORS origins from environment
 */
function parseCorsOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS

  if (!origins) {
    // Default origins - include both development and production URLs
    const defaultOrigins = [
      // Development origins
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8080',
      // Production custom domains
      'https://app.nikcli.store',
      'https://bg.nikcli.store',
    ]

    // In production, always add wildcard patterns for preview deployments
    if (process.env.NODE_ENV === 'production') {
      // Add Vercel wildcard for preview deployments
      defaultOrigins.push('https://*.vercel.app')
      // Add Railway wildcard for preview deployments
      defaultOrigins.push('https://*.railway.app')
      // Allow any origin as fallback
      defaultOrigins.push('*')
    } else {
      // Development: allow all origins
      defaultOrigins.push('*')
    }

    return defaultOrigins
  }

  // Parse and trim origins
  const parsedOrigins = origins
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0)

  // ALWAYS add wildcard support in production, even if ALLOWED_ORIGINS is set
  // This ensures all Vercel preview deployments work without manual configuration
  if (process.env.NODE_ENV === 'production') {
    // Check if we need to add wildcard patterns
    const hasWildcard = parsedOrigins.includes('*')
    const hasVercelWildcard = parsedOrigins.some((o) => o.includes('*.vercel.app'))

    // Always add Vercel wildcard pattern if not present
    if (!hasVercelWildcard) {
      parsedOrigins.push('https://*.vercel.app')
    }

    // Always add explicit wildcard as fallback (allows all origins)
    // This ensures CORS works even if Railway OPTIONS Allowlist is not configured
    if (!hasWildcard) {
      parsedOrigins.push('*')
    }
  }

  console.log(`[CORS] Parsed origins: ${parsedOrigins.join(', ')}`)
  return parsedOrigins
}

/**
 * Parse Redis configuration from environment
 * Background agents prioritize Upstash over local Redis
 */
function parseRedisConfig():
  | {
      host: string
      port: number
      password?: string
      upstash?: {
        url: string
        token: string
      }
    }
  | undefined {
  // ALWAYS check for Upstash REST API first for background agents
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN

  if (upstashUrl && upstashToken) {
    console.log('✓ Background agents: Using Upstash Redis REST API')
    console.log(`   Upstash URL: ${upstashUrl.substring(0, 30)}...`)
    return {
      host: '', // Not used for Upstash REST
      port: 0, // Not used for Upstash REST
      upstash: {
        url: upstashUrl,
        token: upstashToken,
      },
    }
  }

  // If Upstash is not configured, warn and return undefined (use local queue)
  if (!upstashUrl || !upstashToken) {
    console.warn('⚠︎  Background agents: Upstash Redis not configured')
    console.warn('   Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to use Upstash')
    console.warn('   Falling back to local queue (no Redis)')
    return undefined
  }

  // Fallback to standard Redis URL (only if explicitly set via REDIS_URL)
  // This is a fallback, but background agents should use Upstash
  const redisUrl = process.env.REDIS_URL

  if (redisUrl) {
    console.warn('⚠︎  Background agents: REDIS_URL detected, but Upstash is preferred')
    try {
      const url = new URL(redisUrl)
      console.log('   Using standard Redis as fallback')
      return {
        host: url.hostname,
        port: Number.parseInt(url.port || '6379', 10),
        password: url.password || undefined,
      }
    } catch (error) {
      console.error('✖ Failed to parse Redis URL:', error)
      return undefined
    }
  }

  return undefined
}

/**
 * Parse GitHub configuration from environment
 */
function parseGitHubConfig():
  | {
      appId: string
      privateKey: string
      installationId: string
      webhookSecret: string
      githubToken?: string
    }
  | undefined {
  const appId = process.env.GITHUB_APP_ID
  const installationId = process.env.GITHUB_INSTALLATION_ID
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET
  const githubToken = process.env.GITHUB_TOKEN

  // Try to load private key from direct env var or file path
  let privateKey = process.env.GITHUB_PRIVATE_KEY
  const privateKeyPath = process.env.GITHUB_PRIVATE_KEY_PATH

  // If private key is a file path, read it from the file system
  if (!privateKey && privateKeyPath) {
    // Security check: If privateKeyPath looks like a key itself (not a file path), use it directly
    const isLikelyKey = privateKeyPath.includes('BEGIN') || privateKeyPath.length > 100 || privateKeyPath.includes('\n')
    if (isLikelyKey) {
      // It's the key content, not a file path
      privateKey = privateKeyPath
    } else {
      // It's a file path, try to read it
      try {
        const fs = require('fs')
        privateKey = fs.readFileSync(privateKeyPath, 'utf8')
      } catch (error: any) {
        // Security: Don't log the private key path if it looks like a key itself
        const safePath = privateKeyPath.length > 100 ? '[REDACTED - path too long]' : privateKeyPath
        console.error('✖ Failed to read GitHub private key from file:', safePath, error.message)
        return undefined
      }
    }
  }

  if (!appId || !privateKey || !installationId || !webhookSecret) {
    console.warn('⚠︎  GitHub integration not configured (missing env vars)')
    return undefined
  }

  // Validate that private key is in PEM format (required for RS256)
  if (!privateKey.includes('-----BEGIN') || !privateKey.includes('-----END')) {
    console.error('✖ GitHub private key must be in PEM format (RS256 requires RSA key)')
    console.error('   Key should start with "-----BEGIN RSA PRIVATE KEY-----" or "-----BEGIN PRIVATE KEY-----"')
    return undefined
  }

  // Normalize the private key (remove extra whitespace, ensure proper line breaks)
  const normalizedPrivateKey = privateKey.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim()

  return {
    appId,
    privateKey: normalizedPrivateKey,
    installationId,
    webhookSecret,
    githubToken,
  }
}

/**
 * Build server configuration from environment variables
 */
function buildServerConfig(): APIServerConfig {
  // Railway provides PORT dynamically via environment variable
  // IMPORTANT: Railway sets PORT automatically - we MUST use it
  // If PORT is not set, Railway will fail to route traffic
  const port = Number.parseInt(process.env.PORT || '8080', 10)

  // Log port configuration for debugging
  console.log(`🌍 Port: ${port}`)
  console.log(`   PORT env var: ${process.env.PORT || 'NOT SET (using default 8080)'}`)

  if (!process.env.PORT) {
    console.warn('⚠︎  WARNING: PORT environment variable not set! Railway may not route traffic correctly.')
    console.warn('   Railway should set PORT automatically. If you see this, check Railway deployment settings.')
  }

  const corsOrigins = parseCorsOrigins()
  const redisConfig = parseRedisConfig()
  const githubConfig = parseGitHubConfig()

  const config: APIServerConfig = {
    port,
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: Number.parseInt(process.env.RATE_LIMIT_MAX || '50000', 10), // Increased to 50000 requests per 15 minutes (with cache, this should be more than enough)
    },
    queue: {
      type: redisConfig ? 'redis' : 'local',
      redis: redisConfig,
    },
    ...(githubConfig && { github: githubConfig }),
  }

  return config
}

/**
 * Start the API server
 */
async function startServer() {
  console.log('🚀 Starting NikCLI Background Agents API Server...')
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🌍 Port: ${process.env.PORT || '3000'}`)

  // Validate required environment variables
  const requiredEnvVars = ['NODE_ENV']
  const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar])

  if (missingVars.length > 0) {
    console.warn(`⚠︎  Missing recommended environment variables: ${missingVars.join(', ')}`)
  }

  // Check AI provider API keys
  const aiProviders = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'OPENROUTER_API_KEY']

  const configuredProviders = aiProviders.filter((envVar) => process.env[envVar])

  if (configuredProviders.length === 0) {
    console.error('✖ No AI provider API keys configured. At least one is required.')
    console.error(
      '   Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or OPENROUTER_API_KEY'
    )
    process.exit(1)
  }

  console.log(`✓ Configured AI providers: ${configuredProviders.length} found`)

  // Build config
  const config = buildServerConfig()

  // Log configuration summary
  const rateLimitMaxEnv = process.env.RATE_LIMIT_MAX
  console.log('\n📋 Server Configuration:')
  console.log(`   - Port: ${config.port}`)
  console.log(`   - CORS Origins: ${config.cors.origin.join(', ')}`)
  console.log(`   - Queue Type: ${config.queue.type}`)
  console.log(`   - GitHub Integration: ${config.github ? 'enabled' : 'disabled'}`)
  console.log(`   - Rate Limit: ${config.rateLimit.max} requests per 15 min`)
  if (rateLimitMaxEnv) {
    console.log(`   - Rate Limit Source: Environment variable RATE_LIMIT_MAX=${rateLimitMaxEnv}`)
  } else {
    console.log(`   - Rate Limit Source: Default value (10000)`)
  }
  console.log()

  // Handle uncaught exceptions and unhandled rejections to prevent server crashes
  process.on('uncaughtException', (error: Error) => {
    console.error('✖ Uncaught Exception:', error)
    console.error('Stack:', error.stack)
    // Don't exit - log and continue (Railway will restart if needed via health check)
  })

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('✖ Unhandled Rejection at:', promise)
    console.error('Reason:', reason)
    // Don't exit - log and continue (Railway will restart if needed via health check)
  })

  // Create and start server
  const server = new BackgroundAgentsAPIServer(config)

  try {
    await server.start()

    console.log('✓ Server started successfully!')
    console.log()
    console.log(`📊 Health check: http://localhost:${config.port}/health`)
    console.log(`📋 API Base URL: http://localhost:${config.port}/v1`)
    console.log(`📡 WebSocket URL: ws://localhost:${config.port}/ws`)
    console.log()

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      console.log(`\n⚠︎  Received ${signal}, shutting down gracefully...`)

      try {
        await server.stop()
        console.log('✓ Server shut down successfully')
        process.exit(0)
      } catch (error) {
        console.error('✖ Error during shutdown:', error)
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    // Log memory usage periodically (every 5 minutes)
    if (process.env.NODE_ENV === 'production') {
      setInterval(
        () => {
          const usage = process.memoryUsage()
          console.log('💾 Memory Usage:', {
            heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
            external: `${Math.round(usage.external / 1024 / 1024)}MB`,
            rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
          })
        },
        5 * 60 * 1000
      )
    }
  } catch (error) {
    console.error('✖ Failed to start server:', error)
    process.exit(1)
  }
}

// Start the server
startServer().catch((error) => {
  console.error('✖ Unhandled error:', error)
  process.exit(1)
})
