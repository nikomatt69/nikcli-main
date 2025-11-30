import { EventEmitter } from 'node:events'
import { errorHandler, logger } from './error-handler'

export interface Disposable {
  dispose(): void | Promise<void>
}

export interface DisposableResource {
  id: string
  resource: Disposable
  type: 'sync' | 'async'
  created: Date
}

export class ResourceManager extends EventEmitter implements Disposable {
  private static instance: ResourceManager
  private resources = new Map<string, DisposableResource>()
  private disposed = false
  private disposeTimeout = 5000 // 5 seconds

  static getInstance(): ResourceManager {
    if (!ResourceManager.instance) {
      ResourceManager.instance = new ResourceManager()
      ResourceManager.instance.setupGracefulShutdown()
    }
    return ResourceManager.instance
  }

  private setupGracefulShutdown(): void {
    const signals = ['SIGINT', 'SIGTERM', 'SIGUSR2']

    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, cleaning up resources...`, 'ResourceManager')
        await this.dispose()
        process.exit(0)
      })
    })

    process.on('uncaughtException', async (error) => {
      logger.fatal('Uncaught exception, cleaning up resources...', 'ResourceManager', error)
      await this.dispose()
      process.exit(1)
    })

    process.on('unhandledRejection', async (reason) => {
      logger.fatal('Unhandled rejection, cleaning up resources...', 'ResourceManager', reason as Error)
      await this.dispose()
      process.exit(1)
    })
  }

  register<T extends Disposable>(resource: T, id?: string, type: 'sync' | 'async' = 'async'): T {
    if (this.disposed) {
      throw new Error('ResourceManager has been disposed')
    }

    const resourceId = id || this.generateId()

    if (this.resources.has(resourceId)) {
      logger.warn(`Resource with id ${resourceId} already registered, replacing...`, 'ResourceManager')
    }

    this.resources.set(resourceId, {
      id: resourceId,
      resource,
      type,
      created: new Date(),
    })

    logger.debug(`Registered resource: ${resourceId} (type: ${type})`, 'ResourceManager', {
      totalResources: this.resources.size,
    })

    this.emit('resourceRegistered', resourceId, resource)
    return resource
  }

  unregister(id: string): void {
    const resource = this.resources.get(id)
    if (resource) {
      this.resources.delete(id)
      logger.debug(`Unregistered resource: ${id}`, 'ResourceManager', {
        totalResources: this.resources.size,
      })
      this.emit('resourceUnregistered', id, resource.resource)
    }
  }

  getResourceCount(): number {
    return this.resources.size
  }

  getResourceIds(): string[] {
    return Array.from(this.resources.keys())
  }

  private generateId(): string {
    return `resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return
    }

    logger.info(`Disposing ${this.resources.size} resources...`, 'ResourceManager')
    this.disposed = true

    const disposePromises: Promise<void>[] = []
    const syncDisposeOperations: (() => void)[] = []

    for (const [id, { resource, type }] of this.resources) {
      if (type === 'async') {
        disposePromises.push(
          Promise.resolve()
            .then(() => resource.dispose())
            .catch((error) => {
              logger.error(`Failed to dispose resource ${id}`, 'ResourceManager', error)
            })
        )
      } else {
        syncDisposeOperations.push(() => {
          try {
            const result = resource.dispose()
            if (result instanceof Promise) {
              logger.warn(`Resource ${id} marked as sync but returned Promise`, 'ResourceManager')
            }
          } catch (error) {
            logger.error(`Failed to dispose sync resource ${id}`, 'ResourceManager', error as Error)
          }
        })
      }
    }

    // Execute sync operations first
    syncDisposeOperations.forEach((op) => op())

    // Execute async operations with timeout
    if (disposePromises.length > 0) {
      try {
        await Promise.race([
          Promise.all(disposePromises),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Dispose timeout')), this.disposeTimeout)),
        ])
      } catch (error) {
        logger.error('Some resources failed to dispose within timeout', 'ResourceManager', error as Error)
      }
    }

    this.resources.clear()
    this.removeAllListeners()

    logger.info('All resources disposed', 'ResourceManager')
  }
}

// Specific resource wrappers for common patterns
export class ManagedMap<K, V> extends Map<K, V> implements Disposable {
  constructor(entries?: readonly (readonly [K, V])[] | null) {
    super(entries)
    resourceManager.register(this, `map_${this.constructor.name}_${Date.now()}`, 'sync')
  }

  dispose(): void {
    this.clear()
  }
}

export class ManagedSet<T> extends Set<T> implements Disposable {
  constructor(values?: readonly T[] | null) {
    super(values)
    resourceManager.register(this, `set_${this.constructor.name}_${Date.now()}`, 'sync')
  }

  dispose(): void {
    this.clear()
  }
}

export class ManagedEventEmitter extends EventEmitter implements Disposable {
  constructor() {
    super()
    resourceManager.register(this, `emitter_${this.constructor.name}_${Date.now()}`, 'sync')
  }

  dispose(): void {
    this.removeAllListeners()
  }
}

export class ManagedInterval implements Disposable {
  private intervalId: NodeJS.Timeout

  constructor(callback: () => void, ms: number) {
    this.intervalId = setInterval(callback, ms)
    resourceManager.register(this, `interval_${Date.now()}`, 'sync')
  }

  dispose(): void {
    clearInterval(this.intervalId)
  }
}

export class ManagedTimeout implements Disposable {
  private timeoutId: NodeJS.Timeout

  constructor(callback: () => void, ms: number) {
    this.timeoutId = setTimeout(callback, ms)
    resourceManager.register(this, `timeout_${Date.now()}`, 'sync')
  }

  dispose(): void {
    clearTimeout(this.timeoutId)
  }
}

// Export singleton instance
export const resourceManager = ResourceManager.getInstance()

// Utility functions for common use cases
export function createManagedMap<K, V>(entries?: readonly (readonly [K, V])[] | null): ManagedMap<K, V> {
  return new ManagedMap(entries)
}

export function createManagedSet<T>(values?: readonly T[] | null): ManagedSet<T> {
  return new ManagedSet(values)
}

export function createManagedEventEmitter(): ManagedEventEmitter {
  return new ManagedEventEmitter()
}

export function createManagedInterval(callback: () => void, ms: number): ManagedInterval {
  return new ManagedInterval(callback, ms)
}

export function createManagedTimeout(callback: () => void, ms: number): ManagedTimeout {
  return new ManagedTimeout(callback, ms)
}

// Helper to wrap any object with disposal
export function makeDisposable<T extends object>(
  object: T,
  disposeCallback: () => void | Promise<void>
): T & Disposable {
  const disposable = object as T & Disposable
  disposable.dispose = disposeCallback
  return disposable
}
