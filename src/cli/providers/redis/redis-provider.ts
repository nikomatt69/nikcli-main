import { EventEmitter } from 'node:events'
import { Redis as UpstashRedis } from '@upstash/redis'
import chalk from 'chalk'
import IORedis from 'ioredis'
import { Mutex } from 'async-mutex'
import { type ConfigType, simpleConfigManager } from '../../core/config-manager'
import { advancedUI } from '../../ui/advanced-cli-ui'


export interface RedisProviderOptions {
  url?: string
  token?: string
  keyPrefix?: string
  ttl?: number
  maxRetries?: number
  retryDelayMs?: number
  // Legacy support for ioredis migration
  host?: string
  port?: number
  password?: string
  database?: number
}

export interface CacheEntry<T = any> {
  value: T
  timestamp: number
  ttl?: number
  metadata?: Record<string, any>
}

export interface VectorCacheEntry {
  embedding: number[]
  timestamp: number
  ttl: number
  provider: string
  model: string
  textHash: string
  cost: number
}

export interface RedisHealth {
  connected: boolean
  latency: number
  status: 'healthy' | 'degraded' | 'unhealthy'
  lastCheck: number
  // Optional extended metrics (may not be available with all providers)
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

export class RedisProvider extends EventEmitter {
  private upstashClient: UpstashRedis | null = null
  private ioredisClient: IORedis | null = null
  private config: ConfigType['redis'] & { url?: string; token?: string }
  private isConnected = false
  private connectionAttempts = 0
  private healthCheckInterval?: NodeJS.Timeout
  private lastHealthCheck?: RedisHealth
  private mode: 'local' | 'upstash' = 'local'

  // Race condition protection
  private connectionMutex = new Mutex()
  private connectionPromise?: Promise<void>

  constructor(options?: RedisProviderOptions) {
    super()
    this.config = { ...simpleConfigManager.getRedisConfig(), ...options }

    if (this.config.enabled) {
      this.connect().catch(error => {
        advancedUI.logError(chalk.red(`Failed to connect to Redis: ${error.message}`))
      })
      this.startHealthChecks()
    }
  }

  /**
   * Connect to Redis (local or Upstash) with race condition protection
   * Priority: Local Redis (host/port) > Upstash (url/token)
   */
  private async connect(): Promise<void> {
    // Guard against concurrent connections
    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.connectionPromise = this.connectionMutex.runExclusive(async () => {
      // Double-check after acquiring lock
      if (this.isConnected) {
        return
      }

      try {
        // Check for local Redis configuration first (priority)
        if (this.config.host && this.config.port) {
          this.mode = 'local'
          const redisOptions = {
            host: this.config.host,
            port: this.config.port,
            password: this.config.password || undefined,
            db: this.config.database || 0,
            enableAutoPipelining: true,
            retryStrategy: (times: number) => {
              if (times > this.config.maxRetries) {
                return null
              }
              return this.config.retryDelayMs * times
            },
            lazyConnect: true,
          }

          this.ioredisClient = new IORedis(redisOptions)
          advancedUI.logInfo(chalk.blue(`🔗 Connecting to local Redis at ${this.config.host}:${this.config.port}...`))

          // Setup event listeners for ioredis
          this.ioredisClient.on('error', (err) => {
            advancedUI.logInfo(chalk.yellow(`⚠︎ Redis connection error: ${err.message}`))
          })
        }
        // Fallback to Upstash configuration
        else if (this.config.url && this.config.token) {
          this.mode = 'upstash'
          this.upstashClient = new UpstashRedis({
            url: this.config.url,
            token: this.config.token,
          })
          advancedUI.logInfo(chalk.blue(`🔗 Connecting to Upstash Redis...`))
        } else {
          throw new Error(
            'Redis configuration missing. Please provide host/port for local Redis or url/token for Upstash Redis.'
          )
        }

        // Test connection with a simple ping
        await this.testConnection()
      } catch (error: any) {
        this.handleConnectionError(error)
        throw error
      } finally {
        this.connectionPromise = undefined
      }
    })

    return this.connectionPromise
  }

  /**
   * Test Redis connection
   */
  private async testConnection(): Promise<void> {
    try {
      if (this.mode === 'local') {
        if (!this.ioredisClient) {
          throw new Error('IORedis client not initialized')
        }
        await this.ioredisClient.connect()
        await this.ioredisClient.ping()
        advancedUI.logInfo(chalk.green(`✓ Local Redis (${this.config.host}:${this.config.port}) connected successfully`))
      } else {
        if (!this.upstashClient) {
          throw new Error('Upstash Redis client not initialized')
        }
        await this.upstashClient.ping()
        advancedUI.logInfo(chalk.green(`✓ Upstash Redis connected successfully`))
      }

      this.isConnected = true
      this.connectionAttempts = 0
      this.emit('connected')
      this.emit('ready')
    } catch (error) {
      this.isConnected = false
      throw error
    }
  }

  /**
   * Handle connection errors with retry logic
   */
  private handleConnectionError(error: Error): void {
    this.isConnected = false
    this.connectionAttempts++

    advancedUI.logInfo(chalk.red(`✖ Redis connection failed (attempt ${this.connectionAttempts}): ${error.message}`))

    // Provide context-specific troubleshooting info
    if (this.config.host && this.config.port) {
      // Local Redis troubleshooting
      advancedUI.logInfo(chalk.yellow(`💡 Local Redis troubleshooting tips:`))
      advancedUI.logInfo(chalk.gray(`   • Check if Redis is running: redis-cli ping`))
      advancedUI.logInfo(chalk.gray(`   • Verify Redis is listening on ${this.config.host}:${this.config.port}`))
      advancedUI.logInfo(chalk.gray(`   • Start Redis: redis-server (or 'brew services start redis' on macOS)`))
      advancedUI.logInfo(chalk.gray(`   • Check Redis config: redis-cli config get bind`))
    } else if (error.message.includes('fetch failed')) {
      // Upstash Redis troubleshooting
      advancedUI.logInfo(chalk.yellow(`💡 Upstash Redis troubleshooting tips:`))
      advancedUI.logInfo(chalk.gray(`   • Check if your Upstash Redis instance is active`))
      advancedUI.logInfo(chalk.gray(`   • Verify URL format: https://your-endpoint.upstash.io`))
      advancedUI.logInfo(chalk.gray(`   • Ensure token is correct (check Upstash dashboard)`))
      advancedUI.logInfo(chalk.gray(`   • Try: /set-key-redis to reconfigure`))
    }

    if (this.connectionAttempts >= this.config.maxRetries) {
      advancedUI.logInfo(
        chalk.red(`💀 Redis connection failed after ${this.config.maxRetries} attempts. Fallback will be used.`)
      )
      this.emit('connection_failed', error)
      return
    }

    // Retry connection
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect()
      }
    }, this.config.retryDelayMs * this.connectionAttempts)

    this.emit('error', error)
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    // Read interval from config if present, default to 300s to reduce noise
    const intervalMs = (this.config as any).healthIntervalMs || 300000
    this.healthCheckInterval = setInterval(async () => {
      if (this.isConnected) {
        try {
          const health = await this.getHealth()
          this.lastHealthCheck = health
          this.emit('health_check', health)
        } catch (error) {
          advancedUI.logInfo(chalk.yellow(`⚠︎ Health check failed: ${(error as Error).message}`))
        }
      }
    }, intervalMs)
  }

  /**
   * Get Redis health metrics
   */
  async getHealth(): Promise<RedisHealth> {
    if (!this.isConnected) {
      return {
        connected: false,
        latency: -1,
        status: 'unhealthy',
        lastCheck: Date.now(),
      }
    }

    const start = Date.now()
    try {
      if (this.mode === 'local' && this.ioredisClient) {
        await this.ioredisClient.ping()
      } else if (this.mode === 'upstash' && this.upstashClient) {
        await this.upstashClient.ping()
      } else {
        throw new Error('No Redis client available')
      }

      const latency = Date.now() - start

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
      if (latency > 1000) {
        status = 'degraded'
      } else if (latency > 5000) {
        status = 'unhealthy'
      }

      return {
        connected: true,
        latency,
        status,
        lastCheck: Date.now(),
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
   * Set a value in cache
   */
  async set<T = any>(key: string, value: T, ttl?: number, metadata?: Record<string, any>): Promise<boolean> {
    if (!this.isConnected) {
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
      const expireTime = ttl || this.config.ttl
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key

      if (this.mode === 'local' && this.ioredisClient) {
        if (expireTime > 0) {
          await this.ioredisClient.setex(finalKey, expireTime, serializedValue)
        } else {
          await this.ioredisClient.set(finalKey, serializedValue)
        }
      } else if (this.mode === 'upstash' && this.upstashClient) {
        if (expireTime > 0) {
          await this.upstashClient.setex(finalKey, expireTime, serializedValue)
        } else {
          await this.upstashClient.set(finalKey, serializedValue)
        }
      } else {
        throw new Error('No Redis client available')
      }

      return true
    } catch (error) {
      advancedUI.logInfo(chalk.red(`✖ Redis SET failed for key ${key}: ${(error as Error).message}`))
      throw error
    }
  }

  /**
   * Get a value from cache
   */
  async get<T = any>(key: string): Promise<CacheEntry<T> | null> {
    if (!this.isConnected) {
      throw new Error('Redis not available')
    }

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
      let serializedValue: string | null = null

      if (this.mode === 'local' && this.ioredisClient) {
        serializedValue = await this.ioredisClient.get(finalKey)
      } else if (this.mode === 'upstash' && this.upstashClient) {
        serializedValue = (await this.upstashClient.get(finalKey)) as string | null
      } else {
        throw new Error('No Redis client available')
      }

      if (!serializedValue) {
        return null
      }

      let entry: CacheEntry<T>
      try {
        entry = JSON.parse(serializedValue)
      } catch (parseError) {
        // Corrupted data detected - auto-clean and return null
        advancedUI.logInfo(chalk.yellow(`⚠︎ Corrupted cache data for key ${key}, auto-cleaning...`))
        await this.del(key).catch(() => { }) // Silent cleanup failure
        return null
      }

      // Check TTL if specified in entry
      if (entry.ttl && entry.timestamp) {
        const age = Date.now() - entry.timestamp
        if (age > entry.ttl * 1000) {
          await this.del(key) // Clean up expired entry
          return null
        }
      }

      return entry
    } catch (error) {
      advancedUI.logInfo(chalk.red(`✖ Redis GET failed for key ${key}: ${(error as Error).message}`))
      throw error
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<boolean> {
    if (!this.isConnected) {
      throw new Error('Redis not available')
    }

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
      let result: number = 0

      if (this.mode === 'local' && this.ioredisClient) {
        result = await this.ioredisClient.del(finalKey)
      } else if (this.mode === 'upstash' && this.upstashClient) {
        result = await this.upstashClient.del(finalKey)
      } else {
        throw new Error('No Redis client available')
      }

      return result > 0
    } catch (error) {
      advancedUI.logInfo(chalk.red(`✖ Redis DEL failed for key ${key}: ${(error as Error).message}`))
      throw error
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isConnected) {
      throw new Error('Redis not available')
    }

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key
      let result: number = 0

      if (this.mode === 'local' && this.ioredisClient) {
        result = await this.ioredisClient.exists(finalKey)
      } else if (this.mode === 'upstash' && this.upstashClient) {
        result = await this.upstashClient.exists(finalKey)
      } else {
        throw new Error('No Redis client available')
      }

      return result > 0
    } catch (error) {
      advancedUI.logInfo(chalk.red(`✖ Redis EXISTS failed for key ${key}: ${(error as Error).message}`))
      throw error
    }
  }

  /**
   * Get keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.isConnected) {
      throw new Error('Redis not available')
    }

    try {
      const finalPattern = this.config.keyPrefix ? `${this.config.keyPrefix}${pattern}` : pattern
      let result: string[] = []

      if (this.mode === 'local' && this.ioredisClient) {
        result = await this.ioredisClient.keys(finalPattern)
      } else if (this.mode === 'upstash' && this.upstashClient) {
        result = await this.upstashClient.keys(finalPattern)
      } else {
        throw new Error('No Redis client available')
      }

      // Remove prefix from returned keys if it exists
      if (this.config.keyPrefix) {
        return result.map((key) => key.replace(this.config.keyPrefix!, ''))
      }
      return result
    } catch (error) {
      advancedUI.logInfo(chalk.red(`✖ Redis KEYS failed for pattern ${pattern}: ${(error as Error).message}`))
      throw error
    }
  }

  /**
   * Flush all keys with prefix
   */
  async flushAll(): Promise<boolean> {
    if (!this.isConnected) {
      throw new Error('Redis not available')
    }

    try {
      if (this.mode === 'local' && this.ioredisClient) {
        // For local Redis, use SCAN and delete in batches (safer than FLUSHDB)
        const prefix = this.config.keyPrefix ? `${this.config.keyPrefix}` : ''
        const stream = this.ioredisClient.scanStream({
          match: `${prefix}*`,
          count: 500,
        })

        const pipeline = this.ioredisClient.pipeline()
        let count = 0

        for await (const keys of stream) {
          for (const key of keys) {
            pipeline.del(key)
            count++
          }
        }

        await pipeline.exec()
        return true
      } else if (this.mode === 'upstash' && this.upstashClient) {
        // Upstash Redis: SCAN and delete in batches
        const prefix = this.config.keyPrefix ? `${this.config.keyPrefix}` : ''
        let cursor = 0
        const batchSize = 500

        do {
          const res = (await this.upstashClient.scan(cursor, {
            match: `${prefix}*`,
            count: batchSize,
          })) as any
          cursor = res[0]
          const keys: string[] = res[1] || []
          if (keys.length > 0) {
            await this.upstashClient.del(...keys)
          }
        } while (cursor !== 0)

        return true
      } else {
        throw new Error('No Redis client available')
      }
    } catch (error) {
      advancedUI.logInfo(chalk.red(`✖ Redis FLUSH failed: ${(error as Error).message}`))
      throw error
    }
  }

  /**
   * Get current connection status
   */
  isHealthy(): boolean {
    if (this.mode === 'local') {
      return this.isConnected && this.ioredisClient !== null
    } else {
      return this.isConnected && this.upstashClient !== null
    }
  }

  /**
   * Get last health check results
   */
  getLastHealthCheck(): RedisHealth | null {
    return this.lastHealthCheck || null
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }

    if (this.mode === 'local' && this.ioredisClient) {
      await this.ioredisClient.quit()
      this.ioredisClient = null
      advancedUI.logInfo(chalk.yellow('🔌 Local Redis disconnected'))
    } else if (this.mode === 'upstash' && this.upstashClient) {
      // Upstash Redis is HTTP-based, so no persistent connection to close
      this.upstashClient = null
      advancedUI.logInfo(chalk.yellow('🔌 Upstash Redis disconnected'))
    }

    this.isConnected = false
    this.emit('disconnected')
  }

  /**
   * Reconnect to Upstash Redis
   */
  async reconnect(): Promise<void> {
    await this.disconnect()
    await this.connect()
  }

  /**
   * Get Redis configuration
   */
  getConfig(): ConfigType['redis'] {
    return { ...this.config }
  }

  /**
   * Update Redis configuration
   */
  async updateConfig(newConfig: Partial<ConfigType['redis'] & { url?: string; token?: string }>): Promise<void> {
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...newConfig }

    // If connection settings changed, reconnect
    const connectionChanged =
      oldConfig.host !== this.config.host ||
      oldConfig.port !== this.config.port ||
      oldConfig.password !== this.config.password ||
      oldConfig.url !== this.config.url ||
      oldConfig.token !== this.config.token

    if (connectionChanged && this.config.enabled) {
      await this.reconnect()
    }

    // Update config manager
    simpleConfigManager.setRedisConfig(newConfig)
  }

  // ===== VECTOR CACHE METHODS =====

  /**
   * Generate cache key for vector embedding
   */
  private generateVectorCacheKey(text: string, provider: string, model: string): string {
    const crypto = require('node:crypto')
    const textHash = crypto.createHash('sha256').update(text).digest('hex').substring(0, 16)
    return `vector:${provider}:${model}:${textHash}`
  }

  /**
   * Cache vector embedding with TTL
   */
  async cacheVector(
    text: string,
    embedding: number[],
    provider: string,
    model: string,
    cost: number = 0,
    ttl: number = 300 // 5 minutes default
  ): Promise<boolean> {
    if (!this.isConnected) {
      return false // Fail silently if Redis unavailable
    }

    try {
      const crypto = require('node:crypto')
      const textHash = crypto.createHash('sha256').update(text).digest('hex')
      const cacheKey = this.generateVectorCacheKey(text, provider, model)

      const vectorEntry: VectorCacheEntry = {
        embedding,
        timestamp: Date.now(),
        ttl,
        provider,
        model,
        textHash,
        cost,
      }

      const serializedValue = JSON.stringify(vectorEntry)
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${cacheKey}` : cacheKey

      if (this.mode === 'local' && this.ioredisClient) {
        await this.ioredisClient.setex(finalKey, ttl, serializedValue)
      } else if (this.mode === 'upstash' && this.upstashClient) {
        await this.upstashClient.setex(finalKey, ttl, serializedValue)
      } else {
        return false
      }

      return true
    } catch (error) {
      advancedUI.logInfo(chalk.yellow(`⚠︎ Vector cache failed for ${provider}:${model}: ${(error as Error).message}`))
      return false
    }
  }

  /**
   * Retrieve cached vector embedding
   */
  async getCachedVector(text: string, provider: string, model: string): Promise<VectorCacheEntry | null> {
    if (!this.isConnected) {
      return null // Fail silently if Redis unavailable
    }

    try {
      const cacheKey = this.generateVectorCacheKey(text, provider, model)
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${cacheKey}` : cacheKey
      let serializedValue: string | null = null

      if (this.mode === 'local' && this.ioredisClient) {
        serializedValue = await this.ioredisClient.get(finalKey)
      } else if (this.mode === 'upstash' && this.upstashClient) {
        serializedValue = (await this.upstashClient.get(finalKey)) as string | null
      } else {
        return null
      }

      if (!serializedValue) {
        return null
      }

      let vectorEntry: VectorCacheEntry
      try {
        vectorEntry = JSON.parse(serializedValue as string)
      } catch (parseError) {
        // Corrupted vector cache data - auto-clean and return null
        await this.del(cacheKey).catch(() => { })
        return null
      }

      // Verify text matches (additional security)
      const crypto = require('node:crypto')
      const textHash = crypto.createHash('sha256').update(text).digest('hex')
      if (vectorEntry.textHash !== textHash) {
        advancedUI.logInfo(chalk.yellow('⚠︎ Vector cache hash mismatch, invalidating entry'))
        await this.del(cacheKey)
        return null
      }

      // Check TTL
      const age = Date.now() - vectorEntry.timestamp
      if (age > vectorEntry.ttl * 1000) {
        await this.del(cacheKey) // Clean up expired entry
        return null
      }

      return vectorEntry
    } catch (error) {
      advancedUI.logInfo(chalk.yellow(`⚠︎ Vector cache retrieval failed: ${(error as Error).message}`))
      return null
    }
  }

  /**
   * Batch cache multiple vectors
   */
  async cacheVectorBatch(
    vectors: Array<{
      text: string
      embedding: number[]
      provider: string
      model: string
      cost?: number
    }>,
    ttl: number = 300
  ): Promise<number> {
    if (!this.isConnected) {
      return 0
    }

    let successCount = 0
    const promises = vectors.map(async (vector) => {
      const success = await this.cacheVector(
        vector.text,
        vector.embedding,
        vector.provider,
        vector.model,
        vector.cost || 0,
        ttl
      )
      if (success) successCount++
    })

    await Promise.allSettled(promises)
    return successCount
  }

  /**
   * Get vector cache statistics
   */
  async getVectorCacheStats(): Promise<{
    totalKeys: number
    cacheHitRate?: number
    avgCacheAge?: number
  }> {
    if (!this.isConnected) {
      return { totalKeys: 0 }
    }

    try {
      const pattern = this.config.keyPrefix ? `${this.config.keyPrefix}vector:*` : 'vector:*'
      let keys: string[] = []

      if (this.mode === 'local' && this.ioredisClient) {
        keys = await this.ioredisClient.keys(pattern)
      } else if (this.mode === 'upstash' && this.upstashClient) {
        keys = await this.upstashClient.keys(pattern)
      } else {
        return { totalKeys: 0 }
      }

      return {
        totalKeys: keys.length,
        // Additional stats could be implemented with more Redis operations
      }
    } catch (error) {
      advancedUI.logInfo(chalk.yellow(`⚠︎ Vector cache stats failed: ${(error as Error).message}`))
      return { totalKeys: 0 }
    }
  }

  /**
   * Clear all vector cache entries
   */
  async clearVectorCache(): Promise<boolean> {
    if (!this.isConnected) {
      return false
    }

    try {
      const pattern = this.config.keyPrefix ? `${this.config.keyPrefix}vector:*` : 'vector:*'
      let keys: string[] = []

      if (this.mode === 'local' && this.ioredisClient) {
        keys = await this.ioredisClient.keys(pattern)
        if (keys.length > 0) {
          await this.ioredisClient.del(...keys)
          advancedUI.logInfo(chalk.green(`✓ Cleared ${keys.length} vector cache entries`))
        }
      } else if (this.mode === 'upstash' && this.upstashClient) {
        keys = await this.upstashClient.keys(pattern)
        if (keys.length > 0) {
          await this.upstashClient.del(...keys)
          advancedUI.logInfo(chalk.green(`✓ Cleared ${keys.length} vector cache entries`))
        }
      } else {
        return false
      }

      return true
    } catch (error) {
      advancedUI.logInfo(chalk.red(`✖ Vector cache clear failed: ${(error as Error).message}`))
      return false
    }
  }
}

// Singleton instance
export const redisProvider = new RedisProvider()

