// src/cli/providers/redis/bun-redis-provider.ts
import { EventEmitter } from 'node:events'
import type Redis from 'ioredis'
import chalk from 'chalk'
import type { ConfigType } from '../../core/config-manager'

export interface BunRedisConfig {
  host?: string
  port?: number
  password?: string
  database?: number
  tls?: boolean
  keyPrefix?: string
  ttl?: number
  maxRetries?: number
  retryDelayMs?: number
  // Upstash fallback
  url?: string
  token?: string
}

export interface CacheEntry<T = any> {
  value: T
  timestamp: number
  ttl?: number
  metadata?: Record<string, any>
}

export interface RedisHealth {
  connected: boolean
  latency: number
  status: 'healthy' | 'degraded' | 'unhealthy'
  lastCheck: number
  uptime?: number
  memory?: {
    used: number
    peak?: number
  }
  keyspace?: {
    keys: number
    expires?: number
  }
}

/**
 * Bun-optimized Redis Provider with multiple backend support
 * - ioredis for local/production Redis (TCP, optimal for Bun)
 * - Upstash Redis for HTTP-based cloud Redis (fallback)
 * - Memory cache for offline mode
 */
export class BunRedisProvider extends EventEmitter {
  private client: Redis | any = null
  private config: BunRedisConfig
  private isConnected = false
  private connectionAttempts = 0
  private healthCheckInterval?: NodeJS.Timeout
  private lastHealthCheck?: RedisHealth
  private clientType: 'ioredis' | 'upstash' | 'none' = 'none'

  constructor(config: BunRedisConfig = {}) {
    super()
    this.config = config
    this.initialize()
  }

  /**
   * Initialize Redis connection with smart backend selection
   */
  private async initialize(): Promise<void> {
    // Priority 1: Try ioredis for Bun-optimized TCP connection
    if (this.config.host && this.config.port) {
      await this.connectIORedis()
      if (this.isConnected) {
        this.startHealthChecks()
        return
      }
    }

    // Priority 2: Try Upstash HTTP-based Redis
    if (this.config.url && this.config.token) {
      await this.connectUpstash()
      if (this.isConnected) {
        this.startHealthChecks()
        return
      }
    }

    // Priority 3: Check environment variables for Upstash
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      this.config.url = process.env.UPSTASH_REDIS_REST_URL
      this.config.token = process.env.UPSTASH_REDIS_REST_TOKEN
      await this.connectUpstash()
      if (this.isConnected) {
        this.startHealthChecks()
        return
      }
    }

    console.log(chalk.yellow('⚠️ No Redis configuration found, running in memory-only mode'))
    this.emit('no_redis')
  }

  /**
   * Connect to Redis using ioredis (Bun-optimized TCP)
   */
  private async connectIORedis(): Promise<void> {
    try {
      // Dynamic import ioredis to avoid loading if not needed
      const IORedis = (await import('ioredis')).default

      this.client = new IORedis({
        host: this.config.host!,
        port: this.config.port!,
        password: this.config.password,
        db: this.config.database || 0,
        retryStrategy: (times: number) => {
          if (times > (this.config.maxRetries || 3)) {
            return null // Stop retrying
          }
          return Math.min(times * (this.config.retryDelayMs || 1000), 10000)
        },
        enableReadyCheck: true,
        lazyConnect: true, // Connect on first command for Bun optimization
        connectTimeout: 10000,
        maxRetriesPerRequest: 3,
      })

      this.client.on('connect', () => {
        this.isConnected = true
        this.clientType = 'ioredis'
        this.connectionAttempts = 0
        console.log(chalk.green('✅ Bun Redis (ioredis) connected successfully'))
        console.log(chalk.gray(`   Host: ${this.config.host}:${this.config.port}`))
        this.emit('connected')
      })

      this.client.on('error', (error: Error) => {
        this.handleConnectionError(error, 'ioredis')
      })

      this.client.on('close', () => {
        this.isConnected = false
        console.log(chalk.yellow('🔌 Bun Redis (ioredis) disconnected'))
        this.emit('disconnected')
      })

      // Test connection
      await this.client.connect()
      await this.client.ping()
    } catch (error: any) {
      this.handleConnectionError(error, 'ioredis')
    }
  }

  /**
   * Connect to Upstash Redis (HTTP-based fallback)
   */
  private async connectUpstash(): Promise<void> {
    try {
      const { Redis } = await import('@upstash/redis')

      this.client = new Redis({
        url: this.config.url!,
        token: this.config.token!,
      })

      // Test connection
      await this.client.ping()

      this.isConnected = true
      this.clientType = 'upstash'
      this.connectionAttempts = 0
      console.log(chalk.green('✅ Upstash Redis (HTTP) connected successfully'))
      console.log(chalk.gray(`   URL: ${this.config.url}`))
      this.emit('connected')
    } catch (error: any) {
      this.handleConnectionError(error, 'upstash')
    }
  }

  /**
   * Handle connection errors with retry logic
   */
  private handleConnectionError(error: Error, source: string): void {
    this.isConnected = false
    this.connectionAttempts++

    console.log(chalk.red(`❌ ${source} connection failed (attempt ${this.connectionAttempts}): ${error.message}`))

    if (this.connectionAttempts >= (this.config.maxRetries || 3)) {
      console.log(chalk.red(`💀 Redis connection failed after ${this.config.maxRetries || 3} attempts`))
      this.emit('connection_failed', error)
      return
    }

    this.emit('error', error)
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (this.isConnected) {
        try {
          const health = await this.getHealth()
          this.lastHealthCheck = health
          this.emit('health_check', health)
        } catch (error) {
          console.log(chalk.yellow(`⚠️ Health check failed: ${(error as Error).message}`))
        }
      }
    }, 300000) // 5 minutes
  }

  /**
   * Get Redis health metrics
   */
  async getHealth(): Promise<RedisHealth> {
    if (!this.client || !this.isConnected) {
      return {
        connected: false,
        latency: -1,
        status: 'unhealthy',
        lastCheck: Date.now(),
      }
    }

    const start = Date.now()
    try {
      await this.client.ping()
      const latency = Date.now() - start

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
      if (latency > 1000) status = 'degraded'
      else if (latency > 5000) status = 'unhealthy'

      // Get additional metrics for ioredis
      let memory: RedisHealth['memory']
      let keyspace: RedisHealth['keyspace']

      if (this.clientType === 'ioredis') {
        try {
          const info = await this.client.info('memory')
          const memMatch = info.match(/used_memory:(\d+)/)
          if (memMatch) {
            memory = { used: parseInt(memMatch[1], 10) }
          }

          const dbInfo = await this.client.info('keyspace')
          const keysMatch = dbInfo.match(/keys=(\d+)/)
          if (keysMatch) {
            keyspace = { keys: parseInt(keysMatch[1], 10) }
          }
        } catch {
          // Ignore metrics errors
        }
      }

      return {
        connected: true,
        latency,
        status,
        lastCheck: Date.now(),
        memory,
        keyspace,
      }
    } catch (_error) {
      return {
        connected: false,
        latency: -1,
        status: 'unhealthy',
        lastCheck: Date.now(),
      }
    }
  }

  /**
   * Set a value in cache with TTL
   */
  async set<T = any>(key: string, value: T, ttl?: number, metadata?: Record<string, any>): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available')
    }

    try {
      const entry: CacheEntry<T> = {
        value,
        timestamp: Date.now(),
        ttl,
        metadata,
      }

      const serializedValue = JSON.stringify(entry)
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
      const expireTime = ttl || this.config.ttl || 0

      if (expireTime > 0) {
        if (this.clientType === 'ioredis') {
          await this.client.setex(finalKey, expireTime, serializedValue)
        } else {
          await this.client.setex(finalKey, expireTime, serializedValue)
        }
      } else {
        await this.client.set(finalKey, serializedValue)
      }

      return true
    } catch (error) {
      console.log(chalk.red(`❌ Redis SET failed for key ${key}: ${(error as Error).message}`))
      throw error
    }
  }

  /**
   * Get a value from cache
   */
  async get<T = any>(key: string): Promise<CacheEntry<T> | null> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available')
    }

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
      const serializedValue = await this.client.get(finalKey)

      if (!serializedValue) return null

      let entry: CacheEntry<T>
      try {
        entry = JSON.parse(serializedValue as string)
      } catch (parseError) {
        console.log(chalk.yellow(`⚠️ Corrupted cache data for key ${key}, auto-cleaning...`))
        await this.del(key).catch(() => {})
        return null
      }

      // Check TTL if specified
      if (entry.ttl && entry.timestamp) {
        const age = Date.now() - entry.timestamp
        if (age > entry.ttl * 1000) {
          await this.del(key)
          return null
        }
      }

      return entry
    } catch (error) {
      console.log(chalk.red(`❌ Redis GET failed for key ${key}: ${(error as Error).message}`))
      throw error
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available')
    }

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
      const result = await this.client.del(finalKey)
      return result > 0
    } catch (error) {
      console.log(chalk.red(`❌ Redis DEL failed for key ${key}: ${(error as Error).message}`))
      throw error
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available')
    }

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
      const result = await this.client.exists(finalKey)
      return result > 0
    } catch (error) {
      console.log(chalk.red(`❌ Redis EXISTS failed for key ${key}: ${(error as Error).message}`))
      throw error
    }
  }

  /**
   * Get keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available')
    }

    try {
      const finalPattern = this.config.keyPrefix ? `${this.config.keyPrefix}${pattern}` : pattern
      const result = await this.client.keys(finalPattern)

      if (this.config.keyPrefix) {
        return result.map((key: string) => key.replace(this.config.keyPrefix!, ''))
      }
      return result
    } catch (error) {
      console.log(chalk.red(`❌ Redis KEYS failed for pattern ${pattern}: ${(error as Error).message}`))
      throw error
    }
  }

  /**
   * Batch operations - MGET
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (!this.client || !this.isConnected) {
      return new Array(keys.length).fill(null)
    }

    try {
      const finalKeys = keys.map((k) => (this.config.keyPrefix ? `${this.config.keyPrefix}${k}` : k))
      const results = await this.client.mget(...finalKeys)

      return results.map((r: any) => {
        if (!r) return null
        try {
          return JSON.parse(r)
        } catch {
          return null
        }
      })
    } catch (error) {
      console.log(chalk.red(`❌ Redis MGET failed: ${(error as Error).message}`))
      return new Array(keys.length).fill(null)
    }
  }

  /**
   * Batch operations - MSET
   */
  async mset(data: Record<string, any>, ttl?: number): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false
    }

    try {
      if (this.clientType === 'ioredis') {
        const pipeline = this.client.pipeline()

        Object.entries(data).forEach(([key, value]) => {
          const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
          const serialized = JSON.stringify(value)

          if (ttl) {
            pipeline.setex(finalKey, ttl, serialized)
          } else {
            pipeline.set(finalKey, serialized)
          }
        })

        await pipeline.exec()
      } else {
        // Upstash doesn't support pipeline, do sequential
        for (const [key, value] of Object.entries(data)) {
          await this.set(key, value, ttl)
        }
      }

      return true
    } catch (error) {
      console.log(chalk.red(`❌ Redis MSET failed: ${(error as Error).message}`))
      return false
    }
  }

  /**
   * Hash operations - HGET
   */
  async hget(key: string, field: string): Promise<any | null> {
    if (!this.client || !this.isConnected) return null

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
      const result = await this.client.hget(finalKey, field)
      return result ? JSON.parse(result) : null
    } catch (error) {
      console.log(chalk.red(`❌ Redis HGET failed: ${(error as Error).message}`))
      return null
    }
  }

  /**
   * Hash operations - HSET
   */
  async hset(key: string, field: string, value: any): Promise<boolean> {
    if (!this.client || !this.isConnected) return false

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
      await this.client.hset(finalKey, field, JSON.stringify(value))
      return true
    } catch (error) {
      console.log(chalk.red(`❌ Redis HSET failed: ${(error as Error).message}`))
      return false
    }
  }

  /**
   * Hash operations - HDEL
   */
  async hdel(key: string, field: string): Promise<boolean> {
    if (!this.client || !this.isConnected) return false

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
      const result = await this.client.hdel(finalKey, field)
      return result > 0
    } catch (error) {
      console.log(chalk.red(`❌ Redis HDEL failed: ${(error as Error).message}`))
      return false
    }
  }

  /**
   * Sorted Set - ZADD
   */
  async zadd(key: string, score: number, member: string): Promise<boolean> {
    if (!this.client || !this.isConnected) return false

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
      await this.client.zadd(finalKey, score, member)
      return true
    } catch (error) {
      console.log(chalk.red(`❌ Redis ZADD failed: ${(error as Error).message}`))
      return false
    }
  }

  /**
   * Sorted Set - ZRANGEBYSCORE
   */
  async zrangebyscore(key: string, min: number, max: number, limit?: number): Promise<string[]> {
    if (!this.client || !this.isConnected) return []

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key

      if (limit && this.clientType === 'ioredis') {
        return await this.client.zrangebyscore(finalKey, min, max, 'LIMIT', 0, limit)
      }

      const results = await this.client.zrangebyscore(finalKey, min, max)
      return limit ? results.slice(0, limit) : results
    } catch (error) {
      console.log(chalk.red(`❌ Redis ZRANGEBYSCORE failed: ${(error as Error).message}`))
      return []
    }
  }

  /**
   * Sorted Set - ZREM
   */
  async zrem(key: string, member: string): Promise<boolean> {
    if (!this.client || !this.isConnected) return false

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
      const result = await this.client.zrem(finalKey, member)
      return result > 0
    } catch (error) {
      console.log(chalk.red(`❌ Redis ZREM failed: ${(error as Error).message}`))
      return false
    }
  }

  /**
   * Sorted Set - ZPOPMIN
   */
  async zpopmin(key: string, count: number = 1): Promise<string[]> {
    if (!this.client || !this.isConnected) return []

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key

      if (this.clientType === 'ioredis') {
        const result = await this.client.zpopmin(finalKey, count)
        // ioredis returns [member, score, member, score, ...]
        return result.filter((_: any, i: number) => i % 2 === 0)
      }

      // Upstash fallback
      const members = await this.client.zrange(finalKey, 0, count - 1)
      if (members.length > 0) {
        await this.client.zrem(finalKey, ...members)
      }
      return members
    } catch (error) {
      console.log(chalk.red(`❌ Redis ZPOPMIN failed: ${(error as Error).message}`))
      return []
    }
  }

  /**
   * Sorted Set - ZCARD
   */
  async zcard(key: string): Promise<number> {
    if (!this.client || !this.isConnected) return 0

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
      return await this.client.zcard(finalKey)
    } catch (error) {
      console.log(chalk.red(`❌ Redis ZCARD failed: ${(error as Error).message}`))
      return 0
    }
  }

  /**
   * Pipeline for batch operations (ioredis only)
   */
  pipeline(): any {
    if (!this.isConnected || !this.client || this.clientType !== 'ioredis') {
      throw new Error('Pipeline only available for ioredis connections')
    }
    return this.client.pipeline()
  }

  /**
   * Flush all keys
   */
  async flushAll(): Promise<boolean> {
    if (!this.client || !this.isConnected) return false

    try {
      if (this.clientType === 'ioredis') {
        await this.client.flushdb()
        return true
      }

      // Upstash: scan and delete
      const prefix = this.config.keyPrefix || ''
      let cursor = 0
      do {
        const res = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 1000)
        cursor = res[0]
        const keys: string[] = res[1] || []
        if (keys.length > 0) {
          await this.client.del(...keys)
        }
      } while (cursor !== 0)

      return true
    } catch (error) {
      console.log(chalk.red(`❌ Redis FLUSH failed: ${(error as Error).message}`))
      return false
    }
  }

  /**
   * Ping Redis
   */
  async ping(): Promise<boolean> {
    if (!this.isConnected || !this.client) return false

    try {
      const result = await this.client.ping()
      return result === 'PONG'
    } catch {
      return false
    }
  }

  /**
   * Check health
   */
  isHealthy(): boolean {
    return this.isConnected && this.client !== null
  }

  /**
   * Get last health check
   */
  getLastHealthCheck(): RedisHealth | null {
    return this.lastHealthCheck || null
  }

  /**
   * Get client type
   */
  getClientType(): 'ioredis' | 'upstash' | 'none' {
    return this.clientType
  }

  /**
   * Get configuration
   */
  getConfig(): BunRedisConfig {
    return { ...this.config }
  }

  /**
   * Update configuration and reconnect if needed
   */
  async updateConfig(newConfig: Partial<BunRedisConfig>): Promise<void> {
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...newConfig }

    const connectionChanged =
      oldConfig.host !== this.config.host ||
      oldConfig.port !== this.config.port ||
      oldConfig.url !== this.config.url ||
      oldConfig.token !== this.config.token

    if (connectionChanged) {
      await this.reconnect()
    }
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }

    if (this.client) {
      if (this.clientType === 'ioredis') {
        await this.client.quit()
      }
      this.client = null
    }

    this.isConnected = false
    console.log(chalk.yellow('🔌 Bun Redis disconnected'))
    this.emit('disconnected')
  }

  /**
   * Reconnect
   */
  async reconnect(): Promise<void> {
    await this.disconnect()
    await this.initialize()
  }
}
