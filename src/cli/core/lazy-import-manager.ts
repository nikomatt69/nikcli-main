import { AsyncUtils } from './async-utils'
import { errorHandler, logInfo, logWarn } from './error-handler'
export interface ImportCacheEntry {
  module: any
  loaded: boolean
  loading: boolean
  error?: Error
  timestamp: Date
  usageCount: number
}
export class LazyImportManager {
  private static instance: LazyImportManager
  private importCache = new Map<string, ImportCacheEntry>()
  private maxCacheSize = 50
  private cleanupInterval: NodeJS.Timeout | null = null
  static getInstance(): LazyImportManager {
    if (!LazyImportManager.instance) {
      LazyImportManager.instance = new LazyImportManager()
    }
    return LazyImportManager.instance
  }
  constructor() {
    this.startCleanupTimer()
  }
  /**
   * Dynamic import with caching and error handling
   */
  async lazyImport<T = any>(modulePath: string, options?: {
    timeoutMs?: number
    retryCount?: number
    cacheKey?: string
  }): Promise<T> {
    const cacheKey = options?.cacheKey || modulePath
    // Check cache first
    const cached = this.importCache.get(cacheKey)
    if (cached?.loaded) {
      cached.usageCount++
      logDebug(`Using cached module: ${cacheKey}`, 'LazyImportManager')
      return cached.module as T
    }
    if (cached?.loading) {
      // Module is currently being loaded, wait for it
      logDebug(`Waiting for module to load: ${cacheKey}`, 'LazyImportManager')
      return this.waitForModuleLoad(cacheKey, options?.timeoutMs || 10000)
    }
    // Start loading the module
    this.importCache.set(cacheKey, {
      module: null,
      loaded: false,
      loading: true,
      timestamp: new Date(),
      usageCount: 1
    })
    try {
      const timeoutMs = options?.timeoutMs || 30000
      const retryCount = options?.retryCount || 2
      const module = await AsyncUtils.withRetry(async () => {
        return await import(modulePath)
      }, {
        maxRetries: retryCount,
        baseDelay: 100,
        maxDelay: 2000,
        backoffFactor: 2
      })
      // Cache the loaded module
      this.importCache.set(cacheKey, {
        module,
        loaded: true,
        loading: false,
        timestamp: new Date(),
        usageCount: 1
      })
      logDebug(`Module loaded: ${cacheKey}`, 'LazyImportManager')
      return module as T
    } catch (error) {
      // Update cache with error
      this.importCache.set(cacheKey, {
        module: null,
        loaded: false,
        loading: false,
        error: error as Error,
        timestamp: new Date(),
        usageCount: 1
      })
      logWarn(`Failed to load module: ${cacheKey}`, 'LazyImportManager', error as Record<string, unknown>)
      throw error
    }
  }
  /**
   * Wait for an existing module loading operation
   */
  private async waitForModuleLoad(cacheKey: string, timeoutMs: number): Promise<any> {
    const startTime = Date.now()
    while (Date.now() - startTime < timeoutMs) {
      const entry = this.importCache.get(cacheKey)
      if (entry?.loaded) {
        return entry.module
      }
      if (entry?.error) {
        throw entry.error
      }
      // Wait a bit before checking again
      await AsyncUtils.delay(100)
    }
    throw new Error(`Timeout waiting for module ${cacheKey} to load`)
  }
  /**
   * Preload frequently used modules
   */
  async preloadModules(modulePaths: string[]): Promise<void> {
    logInfo(`Preloading ${modulePaths.length} modules`, 'LazyImportManager')
    const operations = modulePaths.map(path =>
      () => this.lazyImport(path).catch(err => {
        logWarn(`Failed to preload module: ${path}`, 'LazyImportManager', err)
        return null
      })
    )
    // Load modules with controlled concurrency
    await AsyncUtils.parallel(operations, 3)
  }
  /**
   * Get module info without loading it
   */
  getModuleInfo(cacheKey: string): { loaded: boolean; loading: boolean; error?: Error; usageCount: number } | null {
    const entry = this.importCache.get(cacheKey)
    if (!entry) return null
    return {
      loaded: entry.loaded,
      loading: entry.loading,
      error: entry.error,
      usageCount: entry.usageCount
    }
  }
  /**
   * Unload a module from cache
   */
  unloadModule(cacheKey: string): void {
    const entry = this.importCache.get(cacheKey)
    if (entry && entry.loaded) {
      logDebug(`Unloading module from cache: ${cacheKey}`, 'LazyImportManager')
      // Try to cleanup the module if it has a dispose method
      if (entry.module && typeof entry.module.dispose === 'function') {
        try {
          entry.module.dispose()
        } catch (error) {
          logWarn(`Error disposing module: ${cacheKey}`, 'LazyImportManager', error as Record<string, unknown>)
        }
      }
      this.importCache.delete(cacheKey)
    }
  }
  /**
   * Clear all cached modules
   */
  clearCache(): void {
    logDebug(`Clearing import cache (${this.importCache.size} entries)`, 'LazyImportManager')
    for (const [key, entry] of this.importCache) {
      if (entry.loaded && entry.module && typeof entry.module.dispose === 'function') {
        try {
          entry.module.dispose()
        } catch (error) {
          logWarn(`Error disposing module during cache clear: ${key}`, 'LazyImportManager', error as Record<string, unknown>)
        }
      }
    }
    this.importCache.clear()
  }
  /**
   * Get cache statistics
   */
  getCacheStats(): { total: number; loaded: number; loading: number; errors: number } {
    let loaded = 0, loading = 0, errors = 0
    for (const entry of this.importCache.values()) {
      if (entry.loaded) loaded++
      else if (entry.loading) loading++
      else if (entry.error) errors++
    }
    return {
      total: this.importCache.size,
      loaded,
      loading,
      errors
    }
  }
  /**
   * Start cleanup timer for old entries
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEntries()
    }, 5 * 60 * 1000) // Clean up every 5 minutes
  }
  /**
   * Remove old and unused entries from cache
   */
  private cleanupOldEntries(): void {
    const maxAge = 30 * 60 * 1000 // 30 minutes
    const now = Date.now()
    let cleaned = 0
    for (const [key, entry] of this.importCache) {
      const age = now - entry.timestamp.getTime()
      const shouldRemove =
        age > maxAge ||
        (entry.usageCount === 0 && age > 5 * 60 * 1000) || // 5 minutes without usage
        (entry.error && age > 10 * 60 * 1000) // 10 minutes with error
      if (shouldRemove) {
        this.importCache.delete(key)
        cleaned++
      }
      if (shouldRemove) {
        logWarn(`Error disposing module during cleanup: ${key}`, 'LazyImportManager', {
          error: entry.error,
          age: age
        })
      }
    }
    if (cleaned > 0) {
      logDebug(`Cleaned up ${cleaned} old import cache entries`, 'LazyImportManager', {
        remaining: this.importCache.size
      })
    }
  }
  /**
   * Dispose the import manager
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.clearCache()
  }
}
// Export singleton instance
export const lazyImportManager = LazyImportManager.getInstance()
// Utility functions for common import patterns
/**
 * Lazy import with error handling and timeout
 */
export async function lazyImport<T = any>(modulePath: string, timeoutMs?: number): Promise<T> {
  return lazyImportManager.lazyImport<T>(modulePath, { timeoutMs })
}
/**
 * Preload frequently used modules for better startup performance
 */
export async function preloadEssentialModules(): Promise<void> {
  const essentialModules = [
    // Core modules that might be needed early
    '../services/agent-service',
    '../services/tool-service',
    '../services/planning-service',
    '../services/cache-service',
    '../services/memory-service',
    '../services/snapshot-service',
    '../ui/advanced-cli-ui',
    '../context/rag-system'
  ]
  await lazyImportManager.preloadModules(essentialModules)
}
/**
 * Preload AI provider modules that are commonly used
 */
export async function preloadAIModules(): Promise<void> {
  const aiModules = [
    '../ai/adaptive-model-router',
    '../ai/advanced-ai-provider',
    '../ai/rag-inference-layer',
    '../ai/reasoning-detector'
  ]
  await lazyImportManager.preloadModules(aiModules)
}
/**
 * Preload provider modules that are optionally used
 */
export async function preloadProviderModules(): Promise<void> {
  const providerModules = [
    '../providers/vision',
    '../providers/image',
    '../providers/cad-gcode',
    '../providers/redis/redis-provider',
    '../providers/supabase/enhanced-supabase-provider'
  ]
  await lazyImportManager.preloadModules(providerModules)
}
function logDebug(message: string, context?: string, details?: Record<string, unknown>): void {
  // Use the existing logger if available
  if (errorHandler) {
    // This is a placeholder - in the actual implementation, you'd use the proper logger
    console.debug(`[${context}] ${message}`, details)
  } else {
    console.debug(`[LazyImportManager] ${message}`, details)
  }
}