import { logger, logInfo, logError } from './error-handler'
import { resourceManager } from './resource-manager'
import { cacheRegistry } from './unified-cache'
import { simpleConfigManager as configManager, ConfigType } from './config-manager'
import { AsyncUtils } from './async-utils'

export interface InitializationOptions {
  configSource?: 'file' | 'env' | 'mixed'
  enableGracefulShutdown?: boolean
  enablePerformanceMonitoring?: boolean
  skipHealthChecks?: boolean
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  uptime: number
  memoryUsage: NodeJS.MemoryUsage
  cacheStats: Record<string, unknown>
  activeResources: number
  lastError?: Error
}

export class SystemInitializer {
  private static instance: SystemInitializer
  private initialized = false
  private config: ConfigType = configManager.getConfig()
  private startTime = Date.now()
  private healthCheckInterval: NodeJS.Timeout | null = null

  static getInstance(): SystemInitializer {
    if (!this.instance) {
      this.instance = new SystemInitializer()
    }
    return this.instance
  }

  async initialize(options: InitializationOptions = {}): Promise<ConfigType> {
    if (this.initialized) {
      logInfo('System already initialized', 'SystemInitializer')
      return this.config!
    }

    const {
      configSource = 'mixed',
      enableGracefulShutdown = true,
      enablePerformanceMonitoring = true,
      skipHealthChecks = false
    } = options

    try {
      logInfo('Initializing system...', 'SystemInitializer', { options })

      // 1. Load configuration
      await this.initializeConfiguration(configSource)

      this.initialized = true
      logInfo('System initialization completed successfully', 'SystemInitializer', {
        initializationTime: Date.now() - this.startTime
      })

      return this.config

    } catch (error) {
      logError('System initialization failed', 'SystemInitializer', error as Error)
      throw error
    }
  }

  private async initializeConfiguration(source: 'file' | 'env' | 'mixed'): Promise<void> {
    try {
      this.config = configManager.getConfig()
      logInfo('Configuration loaded', 'SystemInitializer', {
        workingDirectory: process.cwd(),
        currentModel: this.config.currentModel,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        chatHistory: this.config.chatHistory,
        maxHistoryLength: this.config.maxHistoryLength,
        models: this.config.models,
        monitoring: this.config.monitoring,
        outputStyle: this.config.outputStyle,
        redis: this.config.redis,
        supabase: this.config.supabase,
        apiKeys: this.config.apiKeys,
        environmentVariables: this.config.environmentVariables,
        environmentSources: this.config.environmentSources,
      })
    } catch (error) {
      logError('Failed to load configuration', 'SystemInitializer', error as Error)
    }
  }

  private setupGracefulShutdown(): void {
    process.on('unhandledRejection', async (reason) => {
      logError('Unhandled rejection', 'SystemInitializer', reason as Error)
      await this.shutdown()
    })

    process.on('uncaughtException', async (error) => {
      logError('Uncaught exception', 'SystemInitializer', error)
      await this.shutdown()
    })
    process.on('SIGINT', () => this.shutdown())
    process.on('SIGTERM', () => this.shutdown())
    process.on('SIGUSR2', () => this.shutdown())
  }

  async checkSystemHealth(): Promise<SystemHealth> {
    try {
      const memUsage = process.memoryUsage()
      const uptime = Date.now() - this.startTime
      const activeResources = resourceManager.getResourceCount()
      const cacheStats = cacheRegistry.getAllStats()

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

      return {
        status,
        uptime,
        memoryUsage: memUsage,
        cacheStats,
        activeResources
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        uptime: Date.now() - this.startTime,
        memoryUsage: process.memoryUsage(),
        cacheStats: {},
        activeResources: 0,
        lastError: error as Error
      }
    }
  }

  async shutdown(): Promise<void> {
    logInfo('Shutting down system...', 'SystemInitializer')

    const shutdownTasks = [
      // Stop health checks
      () => {
        if (this.healthCheckInterval) {
          clearInterval(this.healthCheckInterval)
          this.healthCheckInterval = null
        }
      },

      // Dispose resource manager (this will clean up all resources)
      () => resourceManager.dispose(),

      // Dispose cache registry
      () => cacheRegistry.dispose()
    ]

    // Execute shutdown tasks with timeout
    for (const task of shutdownTasks) {
      try {
        await AsyncUtils.withTimeout(
          Promise.resolve(task()),
          { timeoutMs: 5000, timeoutMessage: 'Shutdown task timeout' }
        )
      } catch (error) {
        logError('Error during shutdown task', 'SystemInitializer', error as Error)
      }
    }

    this.initialized = false
    logInfo('System shutdown completed', 'SystemInitializer')
  }

  isInitialized(): boolean {
    return this.initialized
  }

  getConfig(): ConfigType {
    return this.config
  }

  getUptime(): number {
    return Date.now() - this.startTime
  }

  async restart(options?: InitializationOptions): Promise<ConfigType> {
    logInfo('Restarting system...', 'SystemInitializer')

    await this.shutdown()

    // Reset state
    this.initialized = false
    this.config = configManager.getConfig()
    this.startTime = Date.now()

    return this.initialize(options)
  }
}

// Export singleton and utility functions
export const systemInitializer = SystemInitializer.getInstance()

export async function initializeSystem(options?: InitializationOptions): Promise<ConfigType> {
  return systemInitializer.initialize(options)
}

export async function shutdownSystem(): Promise<void> {
  return systemInitializer.shutdown()
}

export async function checkSystemHealth(): Promise<SystemHealth> {
  return systemInitializer.checkSystemHealth()
}

export function isSystemInitialized(): boolean {
  return systemInitializer.isInitialized()
}

export function getSystemConfig(): ConfigType {
  return systemInitializer.getConfig()
}

export function getSystemUptime(): number {
  return systemInitializer.getUptime()
}