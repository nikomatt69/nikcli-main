import { autonomousClaudeInterface } from './chat/autonomous-claude-interface'

/**
 * Unified CLI Entry Point
 * Provides Claude Code-style autonomous terminal interface
 */

async function main() {
  try {
    await autonomousClaudeInterface.start()
  } catch (error) {
    console.error('Failed to start autonomous interface:', error)
    // Ensure cleanup before exit
    try {
      autonomousClaudeInterface.stop()
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError)
    }
    process.exit(1)
  }
}

// Handle process termination gracefully
let isShuttingDown = false

const gracefulShutdown = (signal: string) => {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`\nReceived ${signal}, shutting down gracefully...`)

  try {
    autonomousClaudeInterface.stop()
  } catch (error) {
    console.error('Error during shutdown:', error)
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  gracefulShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason)
  // Don't exit on unhandled rejection, just log it
})

// Start the CLI

main().catch((error) => {
  console.error('Fatal error in main:', error)
  process.exit(1)
})

