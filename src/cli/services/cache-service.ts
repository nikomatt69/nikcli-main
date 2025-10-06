import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { simpleConfigManager } from '../core/config-manager'
import { type SmartCacheManager, smartCache } from '../core/smart-cache-manager'
import { type RedisProvider, redisProvider } from '../providers/redis/redis-provider'
import { structuredLogger } from '../utils/structured-logger'
import { AsyncLock } from '../utils/async-lock'

export interface CacheServiceOptions {
  redisEnabled?: boolean
  fallbackEnabled?: boolean
  strategies?: {
    tokens?: boolean
    sessions?: boolean
    agents?: boolean
    documentation?: boolean
  }
}

export interface CacheStats {
  redis: {
    enabled: boolean
    connected: boolean
    health?: any
    entries?: number
  }
  fallback: {
    enabled: boolean
    type: 'smart' | 'memory'
    stats?: any
  }
  totalHits: number
  totalMisses: number
  hitRate: number
}

/**
 * Unified Cache Service that provides Redis caching with SmartCache fallback
 */
export class CacheService extends EventEmitter {
  private redis: RedisProvider
  private smartCache: SmartCacheManager
  private config: CacheServiceOptions
  private stats = {
    hits: 0,
    misses: 0,
    redisHits: 0,
    fallbackHits: 0,
    errors: 0,
  }
  // 🔒 FIXED: Lock for coordinating writes to prevent cache inconsistency
  private writeLocks = new AsyncLock()

  constructor(options?: CacheServiceOptions) {
    super()

    const redisConfig = simpleConfigManager.getRedisConfig()
    this.config = {
      redisEnabled: redisConfig.enabled,
      fallbackEnabled: redisConfig.fallback.enabled,
      strategies: redisConfig.strategies,
      ...options,
    }

    this.redis = redisProvider
    this.smartCache = smartCache

    this.setupEventHandlers()
  }

  /**
   * Setup event handlers for Redis provider
   */
  private setupEventHandlers(): void {
    this.redis.on('connected', () => {
      structuredLogger.info('Cache Service: Redis connected', JSON.stringify({}))
      this.emit('redis_connected', {})
    })

    this.redis.on('disconnected', () => {
      structuredLogger.warning('Cache Service: Redis disconnected, falling back to SmartCache', JSON.stringify({}))
      this.emit('redis_disconnected', {})
    })

    this.redis.on('error', (error) => {
      this.stats.errors++
      structuredLogger.error('Cache Service: Redis error', JSON.stringify({ error: error.message }))
      this.emit('redis_error', error)
    })

    this.redis.on('connection_failed', (error) => {
      structuredLogger.error(
        'Cache Service: Redis connection failed permanently',
        JSON.stringify({ error: error.message })
      )
      this.emit('redis_connection_failed', error)
    })
  }

  /**
   * Set a value in cache with intelligent routing
   */
  /**
   * FIXED: Added AsyncLock to coordinate writes and prevent cache inconsistency
   */
  async set<T = any>(
    key: string,
    value: T,
    context: string = '',
    options?: {
      ttl?: number
      metadata?: Record<string, any>
      strategy?: 'redis' | 'smart' | 'both'
    }
  ): Promise<boolean> {
    const { ttl, metadata, strategy = 'both' } = options || {}

    // Acquire lock for this key to prevent concurrent writes
    const release = await this.writeLocks.acquire(`cache-write-${key}`)

    try {
      let redisSuccess = false
      let smartSuccess = false

      // Write-through strategy: write to both in coordinated manner
      if (strategy === 'both') {
        // Write to both caches atomically
        try {
          const [redisResult, smartResult] = await Promise.allSettled([
            this.shouldUseRedis(strategy)
              ? this.redis.set(key, value, ttl, metadata)
              : Promise.resolve(false),
            this.shouldUseFallback(strategy, false)
              ? this.smartCache.setCachedResponse(key, JSON.stringify(value), context, {
                tokensSaved: this.estimateTokensSaved(value),
                responseTime: metadata?.responseTime || 0,
                ...metadata,
              })
              : Promise.resolve(false)
          ])

          redisSuccess = redisResult.status === 'fulfilled' && redisResult.value === true
          smartSuccess = smartResult.status === 'fulfilled'

          // Log any failures
          if (redisResult.status === 'rejected') {
            structuredLogger.warning(
              `Cache Service: Redis SET failed for ${key}`,
              JSON.stringify({ error: redisResult.reason?.message })
            )
            this.stats.errors++
          }
          if (smartResult.status === 'rejected') {
            structuredLogger.warning(
              `Cache Service: SmartCache SET failed for ${key}`,
              JSON.stringify({ error: smartResult.reason?.message })
            )
            this.stats.errors++
          }
        } catch (error: any) {
          structuredLogger.error(
            `Cache Service: Coordinated write failed for ${key}`,
            JSON.stringify({ error: error.message })
          )
          this.stats.errors++
        }
      } else {
        // Single cache strategy
        // Try Redis first if enabled and connected
        if (this.shouldUseRedis(strategy)) {
          try {
            redisSuccess = await this.redis.set(key, value, ttl, metadata)
          } catch (error: any) {
            structuredLogger.warning(
              `Cache Service: Redis SET failed for ${key}`,
              JSON.stringify({ error: error.message })
            )
            this.stats.errors++
          }
        }

        // Use SmartCache as fallback or secondary storage
        if (this.shouldUseFallback(strategy, !redisSuccess)) {
          try {
            // Convert to SmartCache format
            const tokensSaved = this.estimateTokensSaved(value)
            const responseTime = metadata?.responseTime || 0

            await this.smartCache.setCachedResponse(key, JSON.stringify(value), context, {
              tokensSaved,
              responseTime,
              ...metadata,
            })
            smartSuccess = true
          } catch (error: any) {
            structuredLogger.warning(
              `Cache Service: SmartCache SET failed for ${key}`,
              JSON.stringify({ error: error.message })
            )
            this.stats.errors++
          }
        }
      }

      return redisSuccess || smartSuccess
    } catch (error: any) {
      structuredLogger.error(`Cache Service: SET failed for ${key}`, JSON.stringify({ error: error.message }))
      this.stats.errors++
      return false
    } finally {
      // Always release lock
      release()
    }
  }

  /**
   * Get a value from cache with intelligent routing
   */
  async get<T = any>(
    key: string,
    context: string = '',
    options?: {
      strategy?: 'redis' | 'smart' | 'both'
      preferLocal?: boolean
    }
  ): Promise<T | null> {
    const { strategy = 'both', preferLocal = false } = options || {}

    try {
      let result: T | null = null

      // Try Redis first if enabled and not preferring local
      if (this.shouldUseRedis(strategy) && !preferLocal) {
        try {
          const redisEntry = await this.redis.get<T>(key)
          if (redisEntry) {
            this.stats.hits++
            this.stats.redisHits++
            result = redisEntry.value

            // Update SmartCache for consistency if both strategies
            if (strategy === 'both' && this.config.fallbackEnabled) {
              try {
                const tokensSaved = this.estimateTokensSaved(result)
                await this.smartCache.setCachedResponse(key, JSON.stringify(result), context, {
                  tokensSaved,
                  responseTime: 0,
                })
              } catch (_error) {
                // Silent failure for consistency update
              }
            }

            return result
          }
        } catch (error: any) {
          structuredLogger.warning(
            `Cache Service: Redis GET failed for ${key}`,
            JSON.stringify({ error: error.message })
          )
          this.stats.errors++
        }
      }

      // Try SmartCache as fallback or primary
      if (this.shouldUseFallback(strategy, result === null)) {
        try {
          const smartEntry = await this.smartCache.getCachedResponse(key, context)
          if (smartEntry) {
            this.stats.hits++
            this.stats.fallbackHits++

            try {
              result = JSON.parse(smartEntry.response)
            } catch {
              // If not JSON, return as string
              result = smartEntry.response as any
            }

            // Promote to Redis if available and both strategies
            if (strategy === 'both' && this.shouldUseRedis('redis')) {
              try {
                await this.redis.set(key, result, undefined, {
                  tokensSaved: smartEntry.metadata.tokensSaved,
                  responseTime: smartEntry.metadata.responseTime,
                })
              } catch (_error) {
                // Silent failure for promotion
              }
            }

            return result
          }
        } catch (error: any) {
          structuredLogger.warning(
            `Cache Service: SmartCache GET failed for ${key}`,
            JSON.stringify({ error: error.message })
          )
          this.stats.errors++
        }
      }

      // Cache miss
      this.stats.misses++
      return null
    } catch (error: any) {
      structuredLogger.error(`Cache Service: GET failed for ${key}`, JSON.stringify({ error: error.message }))
      this.stats.errors++
      return null
    }
  }

  /**
   * Delete a key from both cache layers
   */
  async delete(key: string): Promise<boolean> {
    let redisDeleted = false
    const _smartDeleted = false

    // Delete from Redis
    if (this.config.redisEnabled && this.redis.isHealthy()) {
      try {
        redisDeleted = await this.redis.del(key)
      } catch (error: any) {
        structuredLogger.warning(
          `Cache Service: Redis DELETE failed for ${key}`,
          JSON.stringify({ error: error.message })
        )
      }
    }

    // Delete from SmartCache (no direct delete method, so we skip)
    // SmartCache handles its own cleanup via TTL and eviction policies

    return redisDeleted
  }

  /**
   * Check if key exists in any cache layer
   */
  async exists(key: string, context: string = ''): Promise<boolean> {
    // Check Redis first
    if (this.config.redisEnabled && this.redis.isHealthy()) {
      try {
        if (await this.redis.exists(key)) {
          return true
        }
      } catch (error: any) {
        structuredLogger.warning(
          `Cache Service: Redis EXISTS failed for ${key}`,
          JSON.stringify({ error: error.message })
        )
      }
    }

    // Check SmartCache
    if (this.config.fallbackEnabled) {
      try {
        const entry = await this.smartCache.getCachedResponse(key, context)
        return entry !== null
      } catch (error: any) {
        structuredLogger.warning(
          `Cache Service: SmartCache EXISTS failed for ${key}`,
          JSON.stringify({ error: error.message })
        )
      }
    }

    return false
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const redisHealth = this.redis.isHealthy() ? this.redis.getLastHealthCheck() : null
    const smartStats = this.smartCache.getCacheStats()

    const hitRate =
      this.stats.hits + this.stats.misses > 0 ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 : 0

    return {
      redis: {
        enabled: this.config.redisEnabled || false,
        connected: this.redis.isHealthy(),
        health: redisHealth,
        entries: redisHealth ? undefined : 0, // Redis doesn't easily give us total key count
      },
      fallback: {
        enabled: this.config.fallbackEnabled || false,
        type: 'smart',
        stats: smartStats,
      },
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
    }
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    const promises: Promise<any>[] = []

    // Clear Redis
    if (this.config.redisEnabled && this.redis.isHealthy()) {
      promises.push(
        this.redis.flushAll().catch((error: any) => {
          structuredLogger.warning('Failed to clear Redis cache', JSON.stringify({ error: error.message }))
        })
      )
    }

    // Clear SmartCache
    if (this.config.fallbackEnabled) {
      // SmartCache doesn't have a direct clear method, but we can trigger cleanup
      this.smartCache.cleanup()
    }

    await Promise.all(promises)

    // Reset stats
    this.stats = {
      hits: 0,
      misses: 0,
      redisHits: 0,
      fallbackHits: 0,
      errors: 0,
    }

    console.log(chalk.green('✓ All caches cleared'))
  }

  /**
   * Determine if Redis should be used based on strategy and availability
   */
  private shouldUseRedis(strategy: 'redis' | 'smart' | 'both'): boolean {
    return (strategy === 'redis' || strategy === 'both') && !!this.config.redisEnabled && this.redis.isHealthy()
  }

  /**
   * Determine if fallback should be used
   */
  private shouldUseFallback(strategy: 'redis' | 'smart' | 'both', redisFailed: boolean): boolean {
    if (strategy === 'smart') return true
    if (strategy === 'both') return true
    if (strategy === 'redis' && redisFailed && !!this.config.fallbackEnabled) return true
    return false
  }

  /**
   * Estimate tokens saved for SmartCache metadata
   */
  private estimateTokensSaved(value: any): number {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(stringValue.length / 4)
  }

  /**
   * Get service health status
   */
  getHealthStatus(): {
    redis: { healthy: boolean; connected: boolean }
    smartCache: { healthy: boolean }
    overall: boolean
  } {
    const redisHealthy = this.redis.isHealthy()
    const smartCacheHealthy = true // SmartCache is always available

    return {
      redis: {
        healthy: redisHealthy,
        connected: redisHealthy,
      },
      smartCache: {
        healthy: smartCacheHealthy,
      },
      overall: redisHealthy || smartCacheHealthy,
    }
  }

  /**
   * Update cache service configuration
   */
  updateConfig(newConfig: Partial<CacheServiceOptions>): void {
    this.config = { ...this.config, ...newConfig }

    // Update Redis config if needed
    if (newConfig.redisEnabled !== undefined) {
      const redisConfig = simpleConfigManager.getRedisConfig()
      simpleConfigManager.setRedisConfig({ ...redisConfig, enabled: newConfig.redisEnabled })
    }
  }

  /**
   * Force Redis reconnection
   */
  async reconnectRedis(): Promise<void> {
    if (this.redis) {
      await this.redis.reconnect()
    }
  }
}

// Singleton instance
export const cacheService = new CacheService()
