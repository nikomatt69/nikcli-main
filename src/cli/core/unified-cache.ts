import { errorHandler, logger } from './error-handler'
import { type Disposable, ManagedInterval, ManagedMap, resourceManager } from './resource-manager'

export interface CacheEntry<T> {
  value: T
  timestamp: number
  accessCount: number
  lastAccessed: number
  size: number
}

export interface CacheOptions {
  maxSize?: number
  maxEntries?: number
  ttl?: number // Time to live in milliseconds
  cleanupInterval?: number
  onEvict?: (key: string, entry: CacheEntry<any>) => void
}

export interface CacheStats {
  size: number
  entries: number
  hitRate: number
  memoryUsage: number
  oldestEntry: number
  newestEntry: number
}

export class UnifiedCache<K extends string, V> implements Disposable {
  private cache = new ManagedMap<K, CacheEntry<V>>()
  private options: Required<CacheOptions>
  private hits = 0
  private misses = 0
  private cleanupTimer: ManagedInterval | null = null

  constructor(name: string, options: CacheOptions = {}) {
    this.options = {
      maxSize: options.maxSize ?? 100 * 1024 * 1024, // 100MB default
      maxEntries: options.maxEntries ?? 10000,
      ttl: options.ttl ?? 30 * 60 * 1000, // 30 minutes default
      cleanupInterval: options.cleanupInterval ?? 5 * 60 * 1000, // 5 minutes
      onEvict: options.onEvict ?? (() => {}),
    }

    logger.debug(`Created cache: ${name}`, 'UnifiedCache', {
      maxSize: this.options.maxSize,
      maxEntries: this.options.maxEntries,
      ttl: this.options.ttl,
    })

    this.startCleanup()
    resourceManager.register(this, `cache_${name}`)
  }

  private startCleanup(): void {
    this.cleanupTimer = new ManagedInterval(() => {
      this.cleanup()
    }, this.options.cleanupInterval)
  }

  private calculateSize(value: V): number {
    try {
      if (typeof value === 'string') {
        return value.length * 2 // Rough estimate for UTF-16
      }
      if (typeof value === 'object') {
        return JSON.stringify(value).length * 2
      }
      return 64 // Default size for primitives
    } catch {
      return 64
    }
  }

  set(key: K, value: V): void {
    const size = this.calculateSize(value)
    const now = Date.now()

    const entry: CacheEntry<V> = {
      value,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
      size,
    }

    // Remove existing entry if it exists
    const existing = this.cache.get(key)
    if (existing) {
      this.options.onEvict(key, existing)
    }

    this.cache.set(key, entry)

    // Check if we need to evict entries
    this.evictIfNecessary()

    logger.debug(`Cache set: ${key}`, 'UnifiedCache', {
      size,
      totalEntries: this.cache.size,
    })
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      return undefined
    }

    const now = Date.now()

    // Check if entry has expired
    if (now - entry.timestamp > this.options.ttl) {
      this.cache.delete(key)
      this.options.onEvict(key, entry)
      this.misses++
      return undefined
    }

    // Update access statistics
    entry.lastAccessed = now
    entry.accessCount++
    this.hits++

    logger.debug(`Cache hit: ${key}`, 'UnifiedCache', {
      accessCount: entry.accessCount,
      age: now - entry.timestamp,
    })

    return entry.value
  }

  has(key: K): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    // Check if expired
    if (Date.now() - entry.timestamp > this.options.ttl) {
      this.cache.delete(key)
      this.options.onEvict(key, entry)
      return false
    }

    return true
  }

  delete(key: K): boolean {
    const entry = this.cache.get(key)
    if (entry) {
      this.options.onEvict(key, entry)
      return this.cache.delete(key)
    }
    return false
  }

  clear(): void {
    for (const [key, entry] of this.cache) {
      this.options.onEvict(key, entry)
    }
    this.cache.clear()
    this.hits = 0
    this.misses = 0

    logger.debug('Cache cleared', 'UnifiedCache')
  }

  private evictIfNecessary(): void {
    // Check entry count
    if (this.cache.size > this.options.maxEntries) {
      this.evictLeastRecentlyUsed(this.cache.size - this.options.maxEntries)
    }

    // Check memory usage
    const currentSize = this.getCurrentSize()
    if (currentSize > this.options.maxSize) {
      this.evictBySize(currentSize - this.options.maxSize)
    }
  }

  private evictLeastRecentlyUsed(count: number): void {
    const entries = Array.from(this.cache.entries()).sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)

    for (let i = 0; i < count && i < entries.length; i++) {
      const [key, entry] = entries[i]
      this.cache.delete(key)
      this.options.onEvict(key, entry)
    }

    logger.debug(`Evicted ${count} LRU entries`, 'UnifiedCache')
  }

  private evictBySize(targetSize: number): void {
    let freedSize = 0
    const entries = Array.from(this.cache.entries()).sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)

    for (const [key, entry] of entries) {
      if (freedSize >= targetSize) break

      this.cache.delete(key)
      this.options.onEvict(key, entry)
      freedSize += entry.size
    }

    logger.debug(`Evicted entries totaling ${freedSize} bytes`, 'UnifiedCache')
  }

  private getCurrentSize(): number {
    let totalSize = 0
    for (const entry of this.cache.values()) {
      totalSize += entry.size
    }
    return totalSize
  }

  private cleanup(): void {
    const now = Date.now()
    const expiredKeys: K[] = []

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.options.ttl) {
        expiredKeys.push(key)
      }
    }

    for (const key of expiredKeys) {
      const entry = this.cache.get(key)
      if (entry) {
        this.cache.delete(key)
        this.options.onEvict(key, entry)
      }
    }

    if (expiredKeys.length > 0) {
      logger.debug(`Cleaned up ${expiredKeys.length} expired entries`, 'UnifiedCache')
    }
  }

  getStats(): CacheStats {
    const entries = Array.from(this.cache.values())
    const totalRequests = this.hits + this.misses
    const now = Date.now()

    return {
      size: this.getCurrentSize(),
      entries: this.cache.size,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
      memoryUsage: this.getCurrentSize(),
      oldestEntry: entries.length > 0 ? Math.min(...entries.map((e) => now - e.timestamp)) : 0,
      newestEntry: entries.length > 0 ? Math.max(...entries.map((e) => now - e.timestamp)) : 0,
    }
  }

  async dispose(): Promise<void> {
    if (this.cleanupTimer) {
      this.cleanupTimer.dispose()
      this.cleanupTimer = null
    }

    this.clear()
    logger.debug('Cache disposed', 'UnifiedCache')
  }
}

// Cache registry for managing multiple named caches
export class CacheRegistry implements Disposable {
  private static instance: CacheRegistry
  private caches = new ManagedMap<string, UnifiedCache<any, any>>()

  static getInstance(): CacheRegistry {
    if (!CacheRegistry.instance) {
      CacheRegistry.instance = new CacheRegistry()
      resourceManager.register(CacheRegistry.instance, 'cacheRegistry')
    }
    return CacheRegistry.instance
  }

  createCache<K extends string, V>(name: string, options?: CacheOptions): UnifiedCache<K, V> {
    if (this.caches.has(name)) {
      logger.warn(`Cache ${name} already exists, returning existing instance`, 'CacheRegistry')
      return this.caches.get(name)!
    }

    const cache = new UnifiedCache<K, V>(name, options)
    this.caches.set(name, cache)

    logger.info(`Created cache: ${name}`, 'CacheRegistry', {
      totalCaches: this.caches.size,
    })

    return cache
  }

  getCache<K extends string, V>(name: string): UnifiedCache<K, V> | undefined {
    return this.caches.get(name)
  }

  deleteCache(name: string): boolean {
    const cache = this.caches.get(name)
    if (cache) {
      cache.dispose()
      return this.caches.delete(name)
    }
    return false
  }

  getAllStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {}
    for (const [name, cache] of this.caches) {
      stats[name] = cache.getStats()
    }
    return stats
  }

  async dispose(): Promise<void> {
    for (const [name, cache] of this.caches) {
      await cache.dispose()
    }
    this.caches.clear()

    logger.info('All caches disposed', 'CacheRegistry')
  }
}

// Export singleton and utility functions
export const cacheRegistry = CacheRegistry.getInstance()

export function createCache<K extends string, V>(name: string, options?: CacheOptions): UnifiedCache<K, V> {
  return cacheRegistry.createCache<K, V>(name, options)
}

export function getCache<K extends string, V>(name: string): UnifiedCache<K, V> | undefined {
  return cacheRegistry.getCache<K, V>(name)
}

// Pre-configured cache types for common use cases
export const tokenCache = createCache<string, any>('tokens', {
  maxEntries: 5000,
  ttl: 10 * 60 * 1000, // 10 minutes
  maxSize: 50 * 1024 * 1024, // 50MB
})

export const completionCache = createCache<string, any>('completions', {
  maxEntries: 1000,
  ttl: 30 * 60 * 1000, // 30 minutes
  maxSize: 100 * 1024 * 1024, // 100MB
})

export const semanticCache = createCache<string, any>('semantic', {
  maxEntries: 2000,
  ttl: 60 * 60 * 1000, // 1 hour
  maxSize: 200 * 1024 * 1024, // 200MB
})
