import { cacheService } from "../services/cache-service"

export interface CacheOptions {
  ttl?: number
  tags?: string[]
  metadata?: Record<string, any>
}

export interface CacheStats {
  totalEntries: number
  totalSize: number
  totalHits: number
  totalMisses: number
  hitRate: number
}

/**
 * Cache Provider wrapper around CacheService
 * Provides a simplified interface for cache operations
 */
export class CacheProvider {
  private namespace: string
  private defaultTTL: number
  private stats: {
    hits: number
    misses: number
  } = {
    hits: 0,
    misses: 0,
  }

  constructor(namespace: string, options?: { defaultTTL?: number; maxMemorySize?: number }) {
    this.namespace = namespace
    this.defaultTTL = options?.defaultTTL || 300000 // 5 minutes default
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const namespacedKey = `${this.namespace}:${key}`
    const value = await cacheService.get<T>(namespacedKey, this.namespace)

    if (value !== null) {
      this.stats.hits++
    } else {
      this.stats.misses++
    }

    return value
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const namespacedKey = `${this.namespace}:${key}`
    const ttl = options?.ttl || this.defaultTTL

    await cacheService.set(namespacedKey, value, this.namespace, {
      ttl,
      metadata: options?.metadata,
    })
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    const namespacedKey = `${this.namespace}:${key}`
    return await cacheService.delete(namespacedKey)
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const namespacedKey = `${this.namespace}:${key}`
    return await cacheService.exists(namespacedKey, this.namespace)
  }

  /**
   * Clear all cache entries (not directly supported, uses service clearAll)
   */
  async clear(): Promise<void> {
    // CacheService does not support namespace-specific clearing
    // This would clear everything
    await cacheService.clearAll()
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0

    return {
      totalEntries: 0, // Not tracked at provider level
      totalSize: 0, // Not tracked at provider level
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      hitRate,
    }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
    }
  }
}

/**
 * Global Cache Manager
 */
class GlobalCacheManager {
  private providers: Map<string, CacheProvider> = new Map()

  getCache(namespace: string, options?: { defaultTTL?: number; maxMemorySize?: number }): CacheProvider {
    if (!this.providers.has(namespace)) {
      this.providers.set(namespace, new CacheProvider(namespace, options))
    }
    return this.providers.get(namespace)!
  }

  clearAll(): void {
    this.providers.clear()
  }
}

export const globalCacheManager = new GlobalCacheManager()

