/**
 * NikCLI ACP (Agent Client Protocol) Module
 * Main entry point for ACP functionality using official @zed-industries/agent-client-protocol package
 */

// Re-export types from the official package
export * from '@zed-industries/agent-client-protocol'

// Export our service
export {
  AcpService,
  type AcpServiceConfig,
  AcpServiceFactory,
  type AcpServiceStats,
} from './acp-service'

// ====================== MAIN ACP ENTRY POINT ======================

import { type AcpService, type AcpServiceConfig, AcpServiceFactory } from './acp-service'

export interface StartAcpModeOptions {
  workingDirectory?: string
  debug?: boolean
  timeout?: number
  services?: AcpServiceConfig['services']
}

/**
 * Start NikCLI in ACP mode
 * This is the main function called when running `nikcli --acp`
 */
export async function startAcpMode(options: StartAcpModeOptions = {}): Promise<AcpService> {
  let service: AcpService | undefined
  let isShuttingDown = false
  let cleanupCompleted = false

  try {
    // Validate options
    if (options.workingDirectory && typeof options.workingDirectory !== 'string') {
      throw new Error('workingDirectory must be a string')
    }

    if (options.timeout && (typeof options.timeout !== 'number' || options.timeout <= 0)) {
      throw new Error('timeout must be a positive number')
    }

    // Create service with validated options
    service = AcpServiceFactory.create({
      workingDirectory: options.workingDirectory || process.cwd(),
      debug: options.debug || process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development',
      timeout: options.timeout || 30000,
      services: options.services || {},
    })

    // Setup graceful shutdown handlers with error handling
    const gracefulShutdown = async (signal: string): Promise<void> => {
      if (isShuttingDown) {
        console.warn(`Shutdown already in progress, ignoring ${signal}`)
        return
      }

      isShuttingDown = true

      try {
        console.log(`Received ${signal}, starting graceful shutdown`)
        await service!.gracefulShutdown(signal)
      } catch (shutdownError) {
        console.error(`Error during graceful shutdown on ${signal}:`, shutdownError)
        process.exit(1)
      }
    }

    // Setup signal handlers with error handling
    const signalHandler = (signal: string) => {
      gracefulShutdown(signal).catch((error) => {
        console.error(`Fatal error in signal handler for ${signal}:`, error)
        process.exit(1)
      })
    }

    process.on('SIGTERM', () => signalHandler('SIGTERM'))
    process.on('SIGINT', () => signalHandler('SIGINT'))
    process.on('SIGHUP', () => signalHandler('SIGHUP'))

    // Handle uncaught exceptions
    const uncaughtExceptionHandler = (error: Error): void => {
      console.error('Uncaught exception in ACP mode:', error)
      if (service) {
        gracefulShutdown('uncaughtException').catch((shutdownError) => {
          console.error('Error during emergency shutdown:', shutdownError)
          process.exit(1)
        })
      } else {
        process.exit(1)
      }
    }

    const unhandledRejectionHandler = (reason: any, promise: Promise<any>): void => {
      console.error('Unhandled rejection in ACP mode:', reason, 'at promise:', promise)
      if (service) {
        gracefulShutdown('unhandledRejection').catch((shutdownError) => {
          console.error('Error during emergency shutdown:', shutdownError)
          process.exit(1)
        })
      } else {
        process.exit(1)
      }
    }

    process.on('uncaughtException', uncaughtExceptionHandler)
    process.on('unhandledRejection', unhandledRejectionHandler)

    // Start the service
    await service.start(process.stdin, process.stdout)

    cleanupCompleted = true
    return service

  } catch (error) {
    // Ensure cleanup even on startup failure
    if (service && !cleanupCompleted) {
      try {
        await service.gracefulShutdown('startupFailure')
      } catch (shutdownError) {
        console.error('Error during emergency cleanup:', shutdownError)
      }
    }

    console.error('Failed to start ACP mode:', error)
    throw error
  }
}

/**
 * Create ACP service integrated with NikCLI services
 */
export function createIntegratedAcpService(
  nikCliServices: AcpServiceConfig['services'],
  options?: Partial<StartAcpModeOptions>
): AcpService {
  return AcpServiceFactory.createForNikCLI(nikCliServices, options)
}

/**
 * Check if current process is running in ACP mode
 */
export function isAcpMode(): boolean {
  return process.argv.includes('--acp') || process.argv.includes('acp') || process.env.NIKCLI_MODE === 'acp'
}

/**
 * Get ACP mode configuration from command line arguments and environment
 */
export function getAcpModeConfig(): StartAcpModeOptions {
  const config: StartAcpModeOptions = {}

  try {
    // Parse command line arguments with error handling
    const args = process.argv.slice(2)
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      try {
        switch (arg) {
          case '--cwd':
          case '--working-directory':
            if (i + 1 >= args.length) {
              throw new Error(`Missing value for ${arg}`)
            }
            config.workingDirectory = args[i + 1]
            i++ // Skip next argument
            break

          case '--timeout':
            if (i + 1 >= args.length) {
              throw new Error('Missing value for --timeout')
            }
            const timeoutValue = parseInt(args[i + 1], 10)
            if (isNaN(timeoutValue) || timeoutValue <= 0) {
              throw new Error(`Invalid timeout value: ${args[i + 1]}`)
            }
            config.timeout = timeoutValue
            i++
            break

          case '--debug':
            config.debug = true
            break

          case '--no-debug':
            config.debug = false
            break

          default:
            // Unknown argument, skip
            break
        }
      } catch (argError) {
        console.warn(`Error parsing argument ${arg}:`, argError)
      }
    }

    // Override with environment variables with validation
    try {
      if (process.env.NIKCLI_ACP_CWD) {
        config.workingDirectory = process.env.NIKCLI_ACP_CWD
      }

      if (process.env.NIKCLI_ACP_TIMEOUT) {
        const envTimeout = parseInt(process.env.NIKCLI_ACP_TIMEOUT, 10)
        if (isNaN(envTimeout) || envTimeout <= 0) {
          console.warn(`Invalid NIKCLI_ACP_TIMEOUT value: ${process.env.NIKCLI_ACP_TIMEOUT}`)
        } else {
          config.timeout = envTimeout
        }
      }

      if (process.env.NIKCLI_ACP_DEBUG) {
        const debugValue = process.env.NIKCLI_ACP_DEBUG.toLowerCase()
        config.debug = debugValue === 'true' || debugValue === '1' || debugValue === 'yes'
      }
    } catch (envError) {
      console.warn('Error parsing environment variables:', envError)
    }

    return config

  } catch (error) {
    console.error('Error in getAcpModeConfig:', error)
    return {}
  }
}

// ====================== CLI HELPER ======================

/**
 * Main CLI entry point for ACP mode
 * Used when running `nikcli --acp` from command line
 */
export async function runAcpCli(): Promise<void> {
  let service: AcpService | undefined
  let cleanupCompleted = false

  try {
    const config = getAcpModeConfig()

    if (config.debug) {
      console.log('Starting NikCLI in ACP mode with config:', config)
    }

    service = await startAcpMode(config)

    // Service will run until terminated
    // The graceful shutdown handlers will take care of cleanup

  } catch (error) {
    console.error('Failed to start NikCLI ACP mode:', error)

    // Ensure cleanup if service was created
    if (service && !cleanupCompleted) {
      try {
        await service.gracefulShutdown('cliError')
        cleanupCompleted = true
      } catch (cleanupError) {
        console.error('Error during cleanup after CLI failure:', cleanupError)
      }
    }

    process.exit(1)
  } finally {
    // Final cleanup
    if (service && !cleanupCompleted) {
      try {
        await service.gracefulShutdown('finalCleanup')
      } catch (finalError) {
        console.error('Error during final cleanup:', finalError)
      }
    }
  }
}
