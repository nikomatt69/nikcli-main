#!/usr/bin/env node
// Start the Background Agents API Server

import { BackgroundAgentsAPIServer, defaultAPIConfig } from './server'

async function main() {
  console.log('🚀 Starting Background Agents API Server...\n')

  // Override config from environment variables
  const config = {
    ...defaultAPIConfig,
    port: parseInt(process.env.BG_API_PORT || '3000', 10),
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3001', 'http://localhost:8080'],
      credentials: true,
    },
    github: process.env.GITHUB_TOKEN
      ? {
          appId: process.env.GITHUB_APP_ID || '',
          privateKey: process.env.GITHUB_PRIVATE_KEY || '',
          installationId: process.env.GITHUB_INSTALLATION_ID || '',
          webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
          githubToken: process.env.GITHUB_TOKEN,
        }
      : undefined,
  }

  const server = new BackgroundAgentsAPIServer(config)

  try {
    await server.start()
    console.log('\n✨ Server is ready!')
    console.log('\n📍 Endpoints:')
    console.log(`   - Health Check: http://localhost:${config.port}/health`)
    console.log(`   - API v1:       http://localhost:${config.port}/v1`)
    console.log(`   - WebSocket:    ws://localhost:${config.port}/ws`)
    console.log(`   - Web UI:       http://localhost:3001`)
    console.log('\n💡 Tips:')
    console.log('   - Use Ctrl+C to stop the server')
    console.log('   - Visit the Web UI to create and monitor jobs')
    console.log('   - API documentation available at /v1')
  } catch (error: any) {
    console.error('❌ Failed to start server:', error.message)
    process.exit(1)
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down gracefully...')
    await server.stop()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Shutting down gracefully...')
    await server.stop()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
