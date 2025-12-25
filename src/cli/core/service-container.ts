import { EventEmitter } from 'node:events'

/**
 * Service Container - Centralized Dependency Injection
 * Replaces global singleton pattern with explicit dependency management
 */

export interface ServiceConfig {
  configPath?: string
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  enableTelemetry?: boolean
  securityMode?: 'safe' | 'default' | 'developer'
}

export interface ServiceStatus {
  name: string
  initialized: boolean
  healthy: boolean
  lastCheck?: Date
}

export interface IService {
  name: string
  initialize(): Promise<void>
  shutdown(): Promise<void>
  getStatus(): ServiceStatus
}

export abstract class BaseService extends EventEmitter implements IService {
  abstract name: string
  protected _initialized = false
  protected _healthy = true

  async initialize(): Promise<void> {
    if (this._initialized) return
    await this.onInitialize()
    this._initialized = true
    this.emit('initialized', this.name)
  }

  async shutdown(): Promise<void> {
    if (!this._initialized) return
    await this.onShutdown()
    this._initialized = false
    this.emit('shutdown', this.name)
  }

  getStatus(): ServiceStatus {
    return {
      name: this.name,
      initialized: this._initialized,
      healthy: this._healthy,
      lastCheck: new Date(),
    }
  }

  protected async onInitialize(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

type ServiceFactory<T> = (container: ServiceContainer) => T | Promise<T>

interface ServiceRegistration<T = unknown> {
  factory: ServiceFactory<T>
  instance?: T
  singleton: boolean
}

export class ServiceContainer {
  private services = new Map<string, ServiceRegistration>()
  private initializing = new Set<string>()
  private config: ServiceConfig

  constructor(config: ServiceConfig = {}) {
    this.config = {
      logLevel: 'info',
      enableTelemetry: false,
      securityMode: 'default',
      ...config,
    }
  }

  /**
   * Register a singleton service
   */
  registerSingleton<T>(name: string, factory: ServiceFactory<T>): void {
    this.services.set(name, { factory, singleton: true })
  }

  /**
   * Register a transient service (new instance each time)
   */
  registerTransient<T>(name: string, factory: ServiceFactory<T>): void {
    this.services.set(name, { factory, singleton: false })
  }

  /**
   * Register an existing instance
   */
  registerInstance<T>(name: string, instance: T): void {
    this.services.set(name, { factory: () => instance, instance, singleton: true })
  }

  /**
   * Get a service by name
   */
  async get<T>(name: string): Promise<T> {
    const registration = this.services.get(name)
    if (!registration) {
      throw new Error(`Service '${name}' not registered`)
    }

    // Check for circular dependency
    if (this.initializing.has(name)) {
      throw new Error(`Circular dependency detected for service '${name}'`)
    }

    // Return existing singleton instance
    if (registration.singleton && registration.instance !== undefined) {
      return registration.instance as T
    }

    // Create new instance
    this.initializing.add(name)
    try {
      const instance = await registration.factory(this)
      if (registration.singleton) {
        registration.instance = instance
      }
      return instance as T
    } finally {
      this.initializing.delete(name)
    }
  }

  /**
   * Check if service is registered
   */
  has(name: string): boolean {
    return this.services.has(name)
  }

  /**
   * Get configuration
   */
  getConfig(): ServiceConfig {
    return { ...this.config }
  }

  /**
   * Initialize all registered services that implement IService
   */
  async initializeAll(): Promise<void> {
    const initPromises: Promise<void>[] = []

    for (const [name] of this.services) {
      initPromises.push(
        this.get(name)
          .then(async (service) => {
            if (this.isService(service)) {
              await service.initialize()
            }
          })
          .catch((err) => {
            console.error(`Failed to initialize service '${name}':`, err.message)
          })
      )
    }

    await Promise.all(initPromises)
  }

  /**
   * Shutdown all services gracefully
   */
  async shutdownAll(): Promise<void> {
    const shutdownPromises: Promise<void>[] = []

    for (const [name, registration] of this.services) {
      if (registration.instance && this.isService(registration.instance)) {
        shutdownPromises.push(
          registration.instance.shutdown().catch((err) => {
            console.error(`Failed to shutdown service '${name}':`, err.message)
          })
        )
      }
    }

    await Promise.all(shutdownPromises)
    this.services.clear()
  }

  /**
   * Get status of all services
   */
  getServicesStatus(): ServiceStatus[] {
    const statuses: ServiceStatus[] = []

    for (const [name, registration] of this.services) {
      if (registration.instance && this.isService(registration.instance)) {
        statuses.push(registration.instance.getStatus())
      } else {
        statuses.push({
          name,
          initialized: registration.instance !== undefined,
          healthy: true,
        })
      }
    }

    return statuses
  }

  private isService(obj: unknown): obj is IService {
    return obj !== null && typeof obj === 'object' && 'initialize' in obj && 'shutdown' in obj && 'getStatus' in obj
  }
}

// Global container instance (lazy initialized)
let globalContainer: ServiceContainer | null = null

/**
 * Get or create the global service container
 */
export function getServiceContainer(config?: ServiceConfig): ServiceContainer {
  if (!globalContainer) {
    globalContainer = new ServiceContainer(config)
  }
  return globalContainer
}

/**
 * Create a new isolated service container (for testing)
 */
export function createServiceContainer(config?: ServiceConfig): ServiceContainer {
  return new ServiceContainer(config)
}

/**
 * Reset the global container (for testing)
 */
export async function resetServiceContainer(): Promise<void> {
  if (globalContainer) {
    await globalContainer.shutdownAll()
    globalContainer = null
  }
}

/**
 * Standard service registrations for NikCLI
 * Call this to register all core services
 */
export async function registerCoreServices(container: ServiceContainer): Promise<void> {
  // Lazy imports to avoid circular dependencies
  container.registerSingleton('configManager', async () => {
    const { simpleConfigManager } = await import('./config-manager')
    return simpleConfigManager
  })

  container.registerSingleton('logger', async () => {
    const { logger } = await import('./error-handler')
    return logger
  })

  container.registerSingleton('errorHandler', async () => {
    const { errorHandler } = await import('./error-handler')
    return errorHandler
  })

  container.registerSingleton('agentService', async () => {
    const { agentService } = await import('../services/agent-service')
    return agentService
  })

  container.registerSingleton('toolService', async () => {
    const { toolService } = await import('../services/tool-service')
    return toolService
  })

  container.registerSingleton('planningService', async () => {
    const { planningService } = await import('../services/planning-service')
    return planningService
  })

  container.registerSingleton('inputQueue', async () => {
    const { inputQueue } = await import('./input-queue')
    return inputQueue
  })

  container.registerSingleton('sessionManager', async () => {
    const { SessionManager } = await import('../persistence/session-manager')
    return new SessionManager()
  })
}

export default ServiceContainer
