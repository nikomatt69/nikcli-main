import { logger, logInfo, logError } from './error-handler'
import { resourceManager } from './resource-manager'
import { cacheRegistry } from './unified-cache'
import { typedConfigManager, type TypedConfig } from './typed-config'
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
  private config: TypedConfig | null = null
  private startTime = Date.now()
  private healthCheckInterval: NodeJS.Timeout | null = null

  static getInstance(): SystemInitializer {
    if (!this.instance) {
      this.instance = new SystemInitializer()
    }
    return this.instance
  }

  async initialize(options: InitializationOptions = {}): Promise<TypedConfig> {
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

      // 2. Setup logging based on config
      this.setupLogging()

      // 3. Initialize core systems
      await this.initializeCoreSystems()

      // 4. Setup monitoring and health checks
      if (enablePerformanceMonitoring) {
        this.setupPerformanceMonitoring()
      }

      if (!skipHealthChecks) {
        this.setupHealthChecks()
      }

      // 5. Setup graceful shutdown
      if (enableGracefulShutdown) {
        this.setupGracefulShutdown()
      }

      this.initialized = true
      logInfo('System initialization completed successfully', 'SystemInitializer', {
        initializationTime: Date.now() - this.startTime
      })

      return this.config!

    } catch (error) {
      logError('System initialization failed', 'SystemInitializer', error as Error)
      throw error
    }
  }

  private async initializeConfiguration(source: 'file' | 'env' | 'mixed'): Promise<void> {
    try {
      this.config = await typedConfigManager.loadConfig(source)
      logInfo('Configuration loaded', 'SystemInitializer', {
        environment: this.config.base.environment,
        source
      })
    } catch (error) {
      logError('Failed to load configuration', 'SystemInitializer', error as Error)
      throw error
    }
  }

  private setupLogging(): void {
    if (this.config) {
      logger.setLogLevel(this.config.base.logLevel)
      logInfo(`Logging configured with level: ${this.config.base.logLevel}`, 'SystemInitializer')
    }
  }

  private async initializeCoreSystems(): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded')
    }

    // Initialize caches if enabled
    if (this.config.cache.enabled) {
      logInfo('Cache system enabled', 'SystemInitializer', {
        maxSize: this.config.cache.maxSize,
        maxEntries: this.config.cache.maxEntries
      })
    }

    // Initialize other systems as needed
    logInfo('Core systems initialized', 'SystemInitializer')
  }

  private setupPerformanceMonitoring(): void {
    if (!this.config?.performance.enableMetrics) {
      return
    }

    const interval = this.config.performance.metricsInterval

    setInterval(() => {
      const memUsage = process.memoryUsage()
      const cacheStats = cacheRegistry.getAllStats()

      logInfo('Performance metrics', 'SystemInitializer', {
        memory: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
        },
        uptime: Date.now() - this.startTime,
        activeResources: resourceManager.getResourceCount(),
        cacheStats
      })

      // Check memory usage against limits
      if (this.config?.performance.maxMemoryUsage &&
          memUsage.rss > this.config.performance.maxMemoryUsage) {
        logger.warn(
          'Memory usage exceeds configured limit',
          'SystemInitializer',
          {
            current: memUsage.rss,
            limit: this.config.performance.maxMemoryUsage
          }
        )
      }
    }, interval)

    logInfo('Performance monitoring enabled', 'SystemInitializer', { interval })
  }

  private setupHealthChecks(): void {
    const interval = 60000 // 1 minute

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.checkSystemHealth()

        if (health.status === 'unhealthy') {
          logger.error('System health check failed', 'SystemInitializer', health.lastError)
        } else if (health.status === 'degraded') {
          logger.warn('System health degraded', 'SystemInitializer', {
            memoryUsage: health.memoryUsage,
            activeResources: health.activeResources
          })
        }
      } catch (error) {
        logger.error('Health check error', 'SystemInitializer', error as Error)
      }
    }, interval)

    logInfo('Health checks enabled', 'SystemInitializer', { interval })
  }

  private setupGracefulShutdown(): void {
    const signals = ['SIGINT', 'SIGTERM', 'SIGUSR2']

    const shutdownHandler = async (signal: string) => {
      logInfo(`Received ${signal}, initiating graceful shutdown...`, 'SystemInitializer')

      try {
        await this.shutdown()
        logInfo('Graceful shutdown completed', 'SystemInitializer')
        process.exit(0)
      } catch (error) {
        logError('Error during shutdown', 'SystemInitializer', error as Error)
        process.exit(1)
      }
    }

    signals.forEach(signal => {
      process.on(signal, () => shutdownHandler(signal))
    })

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      logError('Uncaught exception', 'SystemInitializer', error)
      await this.shutdown()
      process.exit(1)
    })

    process.on('unhandledRejection', async (reason) => {
      logError('Unhandled rejection', 'SystemInitializer', reason as Error)
      await this.shutdown()
      process.exit(1)
    })

    logInfo('Graceful shutdown handlers registered', 'SystemInitializer')
  }

  async checkSystemHealth(): Promise<SystemHealth> {
    try {
      const memUsage = process.memoryUsage()
      const uptime = Date.now() - this.startTime
      const activeResources = resourceManager.getResourceCount()
      const cacheStats = cacheRegistry.getAllStats()

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

      // Check memory usage
      if (this.config?.performance.maxMemoryUsage &&
          memUsage.rss > this.config.performance.maxMemoryUsage * 0.9) {
        status = 'degraded'
      }

      if (this.config?.performance.maxMemoryUsage &&
          memUsage.rss > this.config.performance.maxMemoryUsage) {
        status = 'unhealthy'
      }

      // Check resource count (potential memory leaks)
      if (activeResources > 1000) {
        status = status === 'unhealthy' ? 'unhealthy' : 'degraded'
      }

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

  getConfig(): TypedConfig | null {
    return this.config
  }

  getUptime(): number {
    return Date.now() - this.startTime
  }

  async restart(options?: InitializationOptions): Promise<TypedConfig> {
    logInfo('Restarting system...', 'SystemInitializer')

    await this.shutdown()

    // Reset state
    this.initialized = false
    this.config = null
    this.startTime = Date.now()

    return this.initialize(options)
  }
}

// Export singleton and utility functions
export const systemInitializer = SystemInitializer.getInstance()

export async function initializeSystem(options?: InitializationOptions): Promise<TypedConfig> {
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

export function getSystemConfig(): TypedConfig | null {
  return systemInitializer.getConfig()
}

export function getSystemUptime(): number {
  return systemInitializer.getUptime()
}