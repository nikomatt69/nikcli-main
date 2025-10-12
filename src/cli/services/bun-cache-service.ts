// src/cli/services/bun-cache-service.ts
import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { simpleConfigManager } from '../core/config-manager'
import { type SmartCacheManager, smartCache } from '../core/smart-cache-manager'
import { BunRedisProvider, type BunRedisConfig } from '../providers/redis/bun-redis-provider'
import { AsyncLock } from '../utils/async-lock'
import { structuredLogger } from '../utils/structured-logger'

export interface BunCacheServiceOptions {
  redisEnabled?: boolean
  fallbackEnabled?: boolean
  preferredBackend?: 'ioredis' | 'upstash' | 'auto'
  strategies?: {
    tokens?: boolean
    sessions?: boolean
    agents?: boolean
    documentation?: boolean
  }
}

export interface BunCacheStats {
  redis: {
    enabled: boolean
    connected: boolean
    backend: 'ioredis' | 'upstash' | 'none'
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
 * Bun-optimized Cache Service with smart backend selection
 * - Priority 1: ioredis (TCP, optimal for Bun)
 * - Priority 2: Upstash Redis (HTTP, cloud fallback)
 * - Priority 3: SmartCache (in-memory, offline mode)
 */
export class BunCacheService extends EventEmitter {
  private redis: BunRedisProvider
  private smartCache: SmartCacheManager
  private config: BunCacheServiceOptions
  private stats = {
    hits: 0,
    misses: 0,
    redisHits: 0,
    fallbackHits: 0,
    errors: 0,
  }
  private writeLocks = new AsyncLock()

  // Namespace TTL defaults (seconds)
  private namespaceTtl: Record<string, number> = {
    token_cache: 3 * 24 * 60 * 60, // 3 days
    session: 60 * 60, // 1 hour
    profile: 6 * 60 * 60, // 6 hours
    ai: 24 * 60 * 60, // 24 hours
    vector: 5 * 60, // 5 minutes for embeddings
  }

  // Circuit breaker state
  private redisFailureCount = 0
  private redisLastFailureAt = 0
  private redisOpenUntil = 0

  constructor(options?: BunCacheServiceOptions) {
    super()

    const redisConfig = simpleConfigManager.getRedisConfig()
    const redisCredentials = simpleConfigManager.getRedisCredentials()

    this.config = {
      redisEnabled: redisConfig.enabled,
      fallbackEnabled: redisConfig.fallback.enabled,
      preferredBackend: 'auto',
      strategies: redisConfig.strategies,
      ...options,
    }

    // Initialize Bun Redis Provider with smart backend selection
    const bunRedisConfig: BunRedisConfig = {
      // TCP config (ioredis)
      host: redisCredentials.host,
      port: redisCredentials.port,
      // HTTP config (Upstash)
      url: redisCredentials.url,
      token: redisCredentials.token,
      // Common settings
      keyPrefix: redisConfig.keyPrefix,
      ttl: redisConfig.ttl,
      maxRetries: redisConfig.maxRetries,
      retryDelayMs: redisConfig.retryDelayMs,
    }

    this.redis = new BunRedisProvider(bunRedisConfig)
    this.smartCache = smartCache

    this.setupEventHandlers()

    // Persist stats periodically
    setInterval(() => {
      void this.persistStats().catch(() => {})
    }, 60000)
  }

  /**
   * Setup event handlers for Redis provider
   */
  private setupEventHandlers(): void {
    this.redis.on('connected', () => {
      const backend = this.redis.getClientType()
      structuredLogger.info('Bun Cache Service: Redis connected', JSON.stringify({ backend }))
      this.emit('redis_connected', { backend })
    })

    this.redis.on('disconnected', () => {
      structuredLogger.warning('Bun Cache Service: Redis disconnected, falling back to SmartCache', JSON.stringify({}))
      this.emit('redis_disconnected', {})
    })

    this.redis.on('error', (error) => {
      this.stats.errors++
      structuredLogger.error('Bun Cache Service: Redis error', JSON.stringify({ error: error.message }))
      this.emit('redis_error', error)
    })

    this.redis.on('connection_failed', (error) => {
      structuredLogger.error(
        'Bun Cache Service: Redis connection failed permanently',
        JSON.stringify({ error: error.message })
      )
      this.emit('redis_connection_failed', error)
    })

    this.redis.on('no_redis', () => {
      console.log(chalk.yellow('⚠️ Running in memory-only mode (no Redis configured)'))
      this.emit('no_redis')
    })
  }

  /**
   * Set a value in cache with intelligent routing and write coordination
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
    const isOpaque = this.isOpaqueKey(key)
    const chosenStrategy: 'redis' | 'smart' | 'both' = strategy || (isOpaque ? 'redis' : 'both')
    const effectiveTtl = ttl ?? this.resolveTtl(key, context)

    // Acquire lock for coordinated writes
    const release = await this.writeLocks.acquire(`cache-write-${key}`)

    try {
      let redisSuccess = false
      let smartSuccess = false

      // Write-through strategy: write to both caches atomically
      if (chosenStrategy === 'both') {
        const [redisResult, smartResult] = await Promise.allSettled([
          this.shouldUseRedis(chosenStrategy)
            ? this.redis.set(key, value, effectiveTtl, metadata)
            : Promise.resolve(false),
          this.shouldUseFallback(chosenStrategy, false)
            ? this.smartCache.setCachedResponse(key, JSON.stringify(value), context, {
                tokensSaved: this.estimateTokensSaved(value),
                responseTime: metadata?.responseTime || 0,
                ...metadata,
              })
            : Promise.resolve(false),
        ])

        redisSuccess = redisResult.status === 'fulfilled' && redisResult.value === true
        smartSuccess = smartResult.status === 'fulfilled'

        if (redisResult.status === 'rejected') {
          structuredLogger.warning(
            `Bun Cache Service: Redis SET failed for ${key}`,
            JSON.stringify({ error: redisResult.reason?.message })
          )
          this.stats.errors++
        }
        if (smartResult.status === 'rejected') {
          structuredLogger.warning(
            `Bun Cache Service: SmartCache SET failed for ${key}`,
            JSON.stringify({ error: smartResult.reason?.message })
          )
          this.stats.errors++
        }
      } else {
        // Single cache strategy
        if (this.shouldUseRedis(chosenStrategy)) {
          try {
            redisSuccess = await this.redis.set(key, value, effectiveTtl, metadata)
            this.noteRedisSuccess()
          } catch (error: any) {
            structuredLogger.warning(
              `Bun Cache Service: Redis SET failed for ${key}`,
              JSON.stringify({ error: error.message })
            )
            this.stats.errors++
          }
        }

        if (this.shouldUseFallback(chosenStrategy, !redisSuccess)) {
          try {
            await this.smartCache.setCachedResponse(key, JSON.stringify(value), context, {
              tokensSaved: this.estimateTokensSaved(value),
              responseTime: metadata?.responseTime || 0,
              ...metadata,
            })
            smartSuccess = true
          } catch (error: any) {
            structuredLogger.warning(
              `Bun Cache Service: SmartCache SET failed for ${key}`,
              JSON.stringify({ error: error.message })
            )
            this.stats.errors++
          }
        }
      }

      return redisSuccess || smartSuccess
    } catch (error: any) {
      structuredLogger.error(`Bun Cache Service: SET failed for ${key}`, JSON.stringify({ error: error.message }))
      this.stats.errors++
      return false
    } finally {
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
    const isOpaque = this.isOpaqueKey(key)
    const strategyResolved: 'redis' | 'smart' | 'both' = options?.strategy as any
    const { preferLocal = false } = options || {}

    try {
      let result: T | null = null

      // Try Redis first if enabled and not preferring local
      if (this.shouldUseRedis(strategyResolved) && !preferLocal) {
        try {
          const redisEntry = await this.redis.get<T>(key)
          if (redisEntry) {
            this.stats.hits++
            this.stats.redisHits++
            result = redisEntry.value
            this.noteRedisSuccess()

            // Update SmartCache for consistency if both strategies
            if (strategyResolved === 'both' && this.config.fallbackEnabled) {
              try {
                await this.smartCache.setCachedResponse(key, JSON.stringify(result), context, {
                  tokensSaved: this.estimateTokensSaved(result),
                  responseTime: 0,
                })
              } catch {
                // Silent failure for consistency update
              }
            }

            return result
          }
        } catch (error: any) {
          structuredLogger.warning(
            `Bun Cache Service: Redis GET failed for ${key}`,
            JSON.stringify({ error: error.message })
          )
          this.stats.errors++
          this.noteRedisFailure()
        }
      }

      // Try SmartCache as fallback or primary
      if (this.shouldUseFallback(strategyResolved, result === null)) {
        try {
          const smartEntry = await this.smartCache.getCachedResponse(key, context)
          if (smartEntry) {
            this.stats.hits++
            this.stats.fallbackHits++

            try {
              result = JSON.parse(smartEntry.response)
            } catch {
              result = smartEntry.response as any
            }

            // Promote to Redis if available
            if (this.shouldUseRedis('redis')) {
              try {
                await this.redis.set(key, result, undefined, {
                  tokensSaved: smartEntry.metadata.tokensSaved,
                  responseTime: smartEntry.metadata.responseTime,
                })
              } catch {
                // Silent failure for promotion
              }
            }

            return result
          }
        } catch (error: any) {
          structuredLogger.warning(
            `Bun Cache Service: SmartCache GET failed for ${key}`,
            JSON.stringify({ error: error.message })
          )
          this.stats.errors++
        }
      }

      // Cache miss
      this.stats.misses++
      return null
    } catch (error: any) {
      structuredLogger.error(`Bun Cache Service: GET failed for ${key}`, JSON.stringify({ error: error.message }))
      this.stats.errors++
      return null
    }
  }

  /**
   * Batch get operation (optimized for Bun)
   */
  async mget<T>(keys: string[], context: string = ''): Promise<(T | null)[]> {
    if (!this.shouldUseRedis('redis')) {
      // Fallback to sequential gets
      return Promise.all(keys.map((key) => this.get<T>(key, context)))
    }

    try {
      const results = await this.redis.mget<T>(keys)
      return results
    } catch (error: any) {
      structuredLogger.warning('Bun Cache Service: MGET failed', JSON.stringify({ error: error.message }))
      // Fallback to sequential gets
      return Promise.all(keys.map((key) => this.get<T>(key, context)))
    }
  }

  /**
   * Batch set operation (optimized for Bun)
   */
  async mset(data: Record<string, any>, ttl?: number, context: string = ''): Promise<boolean> {
    if (!this.shouldUseRedis('redis')) {
      // Fallback to sequential sets
      const results = await Promise.all(Object.entries(data).map(([key, value]) => this.set(key, value, context, { ttl })))
      return results.every((r) => r)
    }

    try {
      return await this.redis.mset(data, ttl)
    } catch (error: any) {
      structuredLogger.warning('Bun Cache Service: MSET failed', JSON.stringify({ error: error.message }))
      // Fallback to sequential sets
      const results = await Promise.all(Object.entries(data).map(([key, value]) => this.set(key, value, context, { ttl })))
      return results.every((r) => r)
    }
  }

  /**
   * Delete a key from both cache layers
   */
  async delete(key: string): Promise<boolean> {
    let redisDeleted = false

    if (this.config.redisEnabled && this.redis.isHealthy()) {
      try {
        redisDeleted = await this.redis.del(key)
      } catch (error: any) {
        structuredLogger.warning(
          `Bun Cache Service: Redis DELETE failed for ${key}`,
          JSON.stringify({ error: error.message })
        )
      }
    }

    // SmartCache handles its own cleanup via TTL
    return redisDeleted
  }

  /**
   * Check if key exists in any cache layer
   */
  async exists(key: string, context: string = ''): Promise<boolean> {
    if (this.config.redisEnabled && this.redis.isHealthy()) {
      try {
        if (await this.redis.exists(key)) {
          return true
        }
      } catch (error: any) {
        structuredLogger.warning(
          `Bun Cache Service: Redis EXISTS failed for ${key}`,
          JSON.stringify({ error: error.message })
        )
      }
    }

    if (this.config.fallbackEnabled) {
      try {
        const entry = await this.smartCache.getCachedResponse(key, context)
        return entry !== null
      } catch (error: any) {
        structuredLogger.warning(
          `Bun Cache Service: SmartCache EXISTS failed for ${key}`,
          JSON.stringify({ error: error.message })
        )
      }
    }

    return false
  }

  /**
   * Get cache statistics with Bun backend info
   */
  async getStats(): Promise<BunCacheStats> {
    const redisHealth = this.redis.isHealthy() ? this.redis.getLastHealthCheck() : null
    const smartStats = this.smartCache.getCacheStats()
    const backend = this.redis.getClientType()

    const hitRate =
      this.stats.hits + this.stats.misses > 0 ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 : 0

    return {
      redis: {
        enabled: this.config.redisEnabled || false,
        connected: this.redis.isHealthy(),
        backend,
        health: redisHealth,
        entries: redisHealth ? undefined : 0,
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

    if (this.config.redisEnabled && this.redis.isHealthy()) {
      promises.push(
        this.redis.flushAll().catch((error: any) => {
          structuredLogger.warning('Failed to clear Redis cache', JSON.stringify({ error: error.message }))
        })
      )
    }

    if (this.config.fallbackEnabled) {
      this.smartCache.cleanup()
    }

    await Promise.all(promises)

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
   * Determine if Redis should be used
   */
  private shouldUseRedis(strategy: 'redis' | 'smart' | 'both'): boolean {
    const now = Date.now()
    if (now < this.redisOpenUntil) return false
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
    return Math.ceil(stringValue.length / 4)
  }

  /**
   * Check if key is opaque (should prefer Redis)
   */
  private isOpaqueKey(key: string): boolean {
    return /^response:|^session:|^profile:|^auth:/i.test(key)
  }

  /**
   * Resolve TTL for key based on namespace
   */
  private resolveTtl(key: string, context: string): number | undefined {
    const nsFromKey = key.split(':')[0]
    const nsFromCtx = context.split(':')[0]
    const ns = this.namespaceTtl[nsFromKey] ? nsFromKey : this.namespaceTtl[nsFromCtx] ? nsFromCtx : undefined
    return ns ? this.namespaceTtl[ns] : undefined
  }

  /**
   * Note Redis failure for circuit breaker
   */
  private noteRedisFailure(): void {
    const now = Date.now()
    if (now - this.redisLastFailureAt > 10000) this.redisFailureCount = 0
    this.redisLastFailureAt = now
    this.redisFailureCount++
    if (this.redisFailureCount >= 5) {
      this.redisOpenUntil = now + 30000
      this.redisFailureCount = 0
      console.log(chalk.yellow('⚠️ Redis circuit breaker opened for 30s'))
    }
  }

  /**
   * Note Redis success for circuit breaker
   */
  private noteRedisSuccess(): void {
    this.redisFailureCount = 0
    this.redisOpenUntil = 0
  }

  /**
   * Persist stats to Redis
   */
  private async persistStats(): Promise<void> {
    try {
      if (!this.redis.isHealthy()) return
      const payload = {
        ts: Date.now(),
        hits: this.stats.hits,
        misses: this.stats.misses,
        redisHits: this.stats.redisHits,
        fallbackHits: this.stats.fallbackHits,
        errors: this.stats.errors,
        backend: this.redis.getClientType(),
      }
      await this.redis.set('stats:cache', payload, 3600, { type: 'stats' })
    } catch {}
  }

  /**
   * Get service health status
   */
  getHealthStatus(): {
    redis: { healthy: boolean; connected: boolean; backend: string }
    smartCache: { healthy: boolean }
    overall: boolean
  } {
    const redisHealthy = this.redis.isHealthy()
    const backend = this.redis.getClientType()
    const smartCacheHealthy = true

    return {
      redis: {
        healthy: redisHealthy,
        connected: redisHealthy,
        backend,
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
  updateConfig(newConfig: Partial<BunCacheServiceOptions>): void {
    this.config = { ...this.config, ...newConfig }

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

  /**
   * Get current Redis backend type
   */
  getRedisBackend(): 'ioredis' | 'upstash' | 'none' {
    return this.redis.getClientType()
  }
}

// Singleton instance with Bun optimization
export const bunCacheService = new BunCacheService()
