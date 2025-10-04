#!/usr/bin/env node
// Standalone entry point for Background Agents API Server
// Designed for cloud deployment (Railway, Render, etc.)

import dotenv from 'dotenv'
import { BackgroundAgentsAPIServer, type APIServerConfig } from './server'

// Load environment variables
dotenv.config()

/**
 * Parse CORS origins from environment
 */
function parseCorsOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS

  if (!origins) {
    // Default allowed origins for development
    return ['http://localhost:3001', 'http://localhost:8080', '*']
  }

  return origins.split(',').map((o) => o.trim())
}

/**
 * Parse Redis configuration from environment
 */
function parseRedisConfig():
  | {
      host: string
      port: number
      password?: string
    }
  | undefined {
  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL

  if (!redisUrl) {
    return undefined
  }

  try {
    const url = new URL(redisUrl)

    return {
      host: url.hostname,
      port: Number.parseInt(url.port || '6379', 10),
      password: url.password || undefined,
    }
  } catch (error) {
    console.error('❌ Failed to parse Redis URL:', error)
    return undefined
  }
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
  const privateKey = process.env.GITHUB_PRIVATE_KEY
  const installationId = process.env.GITHUB_INSTALLATION_ID
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET
  const githubToken = process.env.GITHUB_TOKEN

  if (!appId || !privateKey || !installationId || !webhookSecret) {
    console.warn('⚠️  GitHub integration not configured (missing env vars)')
    return undefined
  }

  return {
    appId,
    privateKey,
    installationId,
    webhookSecret,
    githubToken,
  }
}

/**
 * Build server configuration from environment variables
 */
function buildServerConfig(): APIServerConfig {
  const port = Number.parseInt(process.env.PORT || '3000', 10)
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
      max: Number.parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
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
    console.warn(
      `⚠️  Missing recommended environment variables: ${missingVars.join(', ')}`
    )
  }

  // Check AI provider API keys
  const aiProviders = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
  ]

  const configuredProviders = aiProviders.filter(
    (envVar) => process.env[envVar]
  )

  if (configuredProviders.length === 0) {
    console.error(
      '❌ No AI provider API keys configured. At least one is required.'
    )
    console.error('   Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY')
    process.exit(1)
  }

  console.log(
    `✅ Configured AI providers: ${configuredProviders.length} found`
  )

  // Build config
  const config = buildServerConfig()

  // Log configuration summary
  console.log('\n📋 Server Configuration:')
  console.log(`   - Port: ${config.port}`)
  console.log(`   - CORS Origins: ${config.cors.origin.join(', ')}`)
  console.log(`   - Queue Type: ${config.queue.type}`)
  console.log(
    `   - GitHub Integration: ${config.github ? 'enabled' : 'disabled'}`
  )
  console.log(`   - Rate Limit: ${config.rateLimit.max} requests per 15 min`)
  console.log()

  // Create and start server
  const server = new BackgroundAgentsAPIServer(config)

  try {
    await server.start()

    console.log('✅ Server started successfully!')
    console.log()
    console.log(`📊 Health check: http://localhost:${config.port}/health`)
    console.log(`📋 API Base URL: http://localhost:${config.port}/v1`)
    console.log(`📡 WebSocket URL: ws://localhost:${config.port}/ws`)
    console.log()

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`)

      try {
        await server.stop()
        console.log('✅ Server shut down successfully')
        process.exit(0)
      } catch (error) {
        console.error('❌ Error during shutdown:', error)
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    // Log memory usage periodically (every 5 minutes)
    if (process.env.NODE_ENV === 'production') {
      setInterval(() => {
        const usage = process.memoryUsage()
        console.log('💾 Memory Usage:', {
          heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
          external: `${Math.round(usage.external / 1024 / 1024)}MB`,
          rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
        })
      }, 5 * 60 * 1000)
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

// Start the server
startServer().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})

