// src/cli/background-agents/queue/job-queue.ts

import { EventEmitter } from 'node:events'
import IORedis from 'ioredis'
import type { QueueStats } from '../types'
import { BunRedisProvider } from '../../providers/redis/bun-redis-provider'

export interface QueueConfig {
  type: 'local' | 'redis' | 'bun-redis'
  redis?: {
    host: string
    port: number
    password?: string
    db?: number
    maxRetriesPerRequest?: number
  }
  bunRedis?: {
    host?: string
    port?: number
    password?: string
    database?: number
    url?: string
    token?: string
    keyPrefix?: string
  }
  maxConcurrentJobs?: number
  retryAttempts?: number
  retryDelay?: number
}

export interface QueuedJobData {
  jobId: string
  priority: number
  attempts: number
  delay?: number
  retryAt?: Date
}

export class JobQueue extends EventEmitter {
  private config: QueueConfig
  private redis?: IORedis
  private bunRedis?: BunRedisProvider
  private localQueue: QueuedJobData[] = []
  private processing = new Set<string>()
  private maxConcurrentJobs: number
  private redisType: 'ioredis' | 'bun-redis' | 'none' = 'none'

  constructor(config: QueueConfig) {
    super()
    this.config = config
    this.maxConcurrentJobs = config.maxConcurrentJobs || 3

    // Prevent unhandled 'error' from crashing the process
    this.on('error', (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('Queue warning:', msg)
    })

    // Initialize queue based on type
    if (config.type === 'bun-redis' && config.bunRedis) {
      this.initBunRedisQueue()
    } else if (config.type === 'redis' && config.redis) {
      this.initRedisQueue()
    }
  }

  /**
   * Initialize Bun Redis queue (optimized for Bun)
   */
  private async initBunRedisQueue(): Promise<void> {
    if (!this.config.bunRedis) return

    this.bunRedis = new BunRedisProvider({
      host: this.config.bunRedis.host,
      port: this.config.bunRedis.port,
      password: this.config.bunRedis.password,
      database: this.config.bunRedis.database,
      url: this.config.bunRedis.url,
      token: this.config.bunRedis.token,
      keyPrefix: this.config.bunRedis.keyPrefix || 'queue:',
    })

    this.bunRedis.on('connected', () => {
      this.redisType = 'bun-redis'
      this.emit('connected')
    })

    this.bunRedis.on('error', (error) => {
      console.error('Bun Redis queue error:', error)
      this.emit('error', error)

      // Gracefully degrade to local queue if Redis disconnects/errors
      try {
        this.bunRedis?.disconnect()
      } catch {}
      this.bunRedis = undefined
      this.config.type = 'local'
      this.redisType = 'none'
    })

    this.bunRedis.on('connection_failed', () => {
      console.error('Bun Redis connection failed, falling back to local queue')
      this.bunRedis = undefined
      this.config.type = 'local'
      this.redisType = 'none'
    })

    // Start job processor
    this.startProcessor()
  }

  /**
   * Initialize legacy IORedis queue
   */
  private async initRedisQueue(): Promise<void> {
    if (!this.config.redis) return

    this.redis = new IORedis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db || 0,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })

    this.redis.on('connect', () => {
      this.redisType = 'ioredis'
      this.emit('connected')
    })

    this.redis.on('error', (error) => {
      console.error('Redis queue error:', error)
      this.emit('error', error)

      // Gracefully degrade to local queue if Redis disconnects/errors
      try {
        this.redis?.disconnect()
      } catch {}
      this.redis = undefined
      this.config.type = 'local'
      this.redisType = 'none'
    })

    // Start job processor
    this.startProcessor()
  }

  /**
   * Add job to queue
   */
  async addJob(jobId: string, priority: number = 0, delay?: number): Promise<void> {
    const queueData: QueuedJobData = {
      jobId,
      priority,
      attempts: 0,
      delay,
      retryAt: delay ? new Date(Date.now() + delay) : undefined,
    }

    if (this.config.type === 'bun-redis' && this.bunRedis) {
      await this.addJobToBunRedis(queueData)
    } else if (this.config.type === 'redis' && this.redis) {
      await this.addJobToRedis(queueData)
    } else {
      this.addJobToLocal(queueData)
    }

    this.emit('job:queued', jobId)
  }

  /**
   * Add job to Bun Redis queue
   */
  private async addJobToBunRedis(queueData: QueuedJobData): Promise<void> {
    if (!this.bunRedis) return

    const key = queueData.delay ? 'background-jobs:delayed' : 'background-jobs:waiting'
    const score = queueData.delay ? Date.now() + queueData.delay : Date.now() - queueData.priority

    await this.bunRedis.zadd(key, score, JSON.stringify(queueData))

    // Set job data
    await this.bunRedis.hset('background-jobs:data', queueData.jobId, queueData)
  }

  /**
   * Add job to Redis queue (legacy)
   */
  private async addJobToRedis(queueData: QueuedJobData): Promise<void> {
    if (!this.redis) return

    const key = queueData.delay ? 'background-jobs:delayed' : 'background-jobs:waiting'
    const score = queueData.delay ? Date.now() + queueData.delay : Date.now() - queueData.priority

    await this.redis.zadd(key, score, JSON.stringify(queueData))

    // Set job data
    await this.redis.hset('background-jobs:data', queueData.jobId, JSON.stringify(queueData))
  }

  /**
   * Add job to local queue
   */
  private addJobToLocal(queueData: QueuedJobData): void {
    if (queueData.delay) {
      // Schedule for later
      setTimeout(() => {
        this.localQueue.push(queueData)
        this.processNextLocal()
      }, queueData.delay)
    } else {
      this.localQueue.push(queueData)
      this.localQueue.sort((a, b) => b.priority - a.priority)
      this.processNextLocal()
    }
  }

  /**
   * Start Redis job processor
   */
  private startProcessor(): void {
    if (this.config.type === 'bun-redis' && this.bunRedis) {
      this.startBunRedisProcessor()
    } else if (this.config.type === 'redis' && this.redis) {
      this.startIORedisProcessor()
    }
  }

  /**
   * Start Bun Redis job processor
   */
  private startBunRedisProcessor(): void {
    if (!this.bunRedis) return

    setInterval(async () => {
      try {
        // Move delayed jobs to waiting queue
        await this.processBunRedisDelayedJobs()

        // Process waiting jobs
        await this.processBunRedisJobs()
      } catch (error) {
        console.error('Bun Redis queue processor error:', error)
      }
    }, 1000)
  }

  /**
   * Start legacy IORedis job processor
   */
  private startIORedisProcessor(): void {
    if (!this.redis) return

    setInterval(async () => {
      try {
        // Move delayed jobs to waiting queue
        await this.processDelayedJobs()

        // Process waiting jobs
        await this.processRedisJobs()
      } catch (error) {
        console.error('Queue processor error:', error)
      }
    }, 1000)
  }

  /**
   * Process delayed jobs in Bun Redis
   */
  private async processBunRedisDelayedJobs(): Promise<void> {
    if (!this.bunRedis) return

    const now = Date.now()
    const delayedJobs = await this.bunRedis.zrangebyscore('background-jobs:delayed', 0, now, 10)

    for (const jobData of delayedJobs) {
      // Move from delayed to waiting
      await this.bunRedis.zrem('background-jobs:delayed', jobData)
      await this.bunRedis.zadd('background-jobs:waiting', now, jobData)
    }
  }

  /**
   * Process Bun Redis jobs with proper locking
   */
  private async processBunRedisJobs(): Promise<void> {
    if (!this.bunRedis) return

    if (this.processing.size >= this.maxConcurrentJobs) {
      return
    }

    const jobs = await this.bunRedis.zpopmin('background-jobs:waiting', 1)
    if (jobs.length === 0) return

    const jobDataStr = jobs[0]
    const queueData: QueuedJobData = JSON.parse(jobDataStr)

    // Try to acquire lock
    const lockAcquired = await this.acquireBunRedisJobLock(queueData.jobId)
    if (!lockAcquired) {
      // Another process is handling this job, put it back
      await this.bunRedis.zadd('background-jobs:waiting', Date.now(), jobDataStr)
      return
    }

    this.processing.add(queueData.jobId)
    this.emit('job:processing', queueData.jobId)

    try {
      // Job will be processed by BackgroundAgentService
      this.emit('job:ready', queueData.jobId)
    } catch (error) {
      console.error(`Failed to process job ${queueData.jobId}:`, error)
      await this.releaseBunRedisJobLock(queueData.jobId)
      await this.retryJob(queueData)
    }
  }

  /**
   * Process delayed jobs in Redis (legacy)
   */
  private async processDelayedJobs(): Promise<void> {
    if (!this.redis) return

    const now = Date.now()
    const delayedJobs = await this.redis.zrangebyscore('background-jobs:delayed', 0, now, 'LIMIT', 0, 10)

    for (const jobData of delayedJobs) {
      // Move from delayed to waiting
      await this.redis.zrem('background-jobs:delayed', jobData)
      await this.redis.zadd('background-jobs:waiting', now, jobData)
    }
  }

  /**
   * Process Redis jobs with proper locking (legacy)
   */
  private async processRedisJobs(): Promise<void> {
    if (!this.redis) return

    if (this.processing.size >= this.maxConcurrentJobs) {
      return
    }

    const jobs = await this.redis.zpopmin('background-jobs:waiting', 1)
    if (jobs.length === 0) return

    const [jobDataStr] = jobs
    const queueData: QueuedJobData = JSON.parse(jobDataStr)

    // Try to acquire lock
    const lockAcquired = await this.acquireJobLock(queueData.jobId)
    if (!lockAcquired) {
      // Another process is handling this job, put it back
      await this.redis.zadd('background-jobs:waiting', Date.now(), jobDataStr)
      return
    }

    this.processing.add(queueData.jobId)
    this.emit('job:processing', queueData.jobId)

    try {
      // Job will be processed by BackgroundAgentService
      this.emit('job:ready', queueData.jobId)
    } catch (error) {
      console.error(`Failed to process job ${queueData.jobId}:`, error)
      await this.releaseJobLock(queueData.jobId)
      await this.retryJob(queueData)
    }
  }

  /**
   * Acquire Bun Redis-based job lock
   */
  private async acquireBunRedisJobLock(jobId: string): Promise<boolean> {
    if (!this.bunRedis) return true

    const lockKey = `background-jobs:lock:${jobId}`
    const lockValue = `${process.pid}-${Date.now()}`

    // Try to acquire lock with 10 minute expiry
    try {
      await this.bunRedis.set(lockKey, lockValue, 600, { type: 'lock' })
      return true
    } catch {
      return false
    }
  }

  /**
   * Release Bun Redis job lock
   */
  private async releaseBunRedisJobLock(jobId: string): Promise<void> {
    if (!this.bunRedis) return

    const lockKey = `background-jobs:lock:${jobId}`
    await this.bunRedis.del(lockKey)
  }

  /**
   * Acquire Redis-based job lock (legacy)
   */
  private async acquireJobLock(jobId: string): Promise<boolean> {
    if (!this.redis) return true

    const lockKey = `background-jobs:lock:${jobId}`
    const lockValue = `${process.pid}-${Date.now()}`

    // Try to acquire lock with 10 minute expiry (EX seconds) and NX (only if not exists)
    const result = await this.redis.set(lockKey, lockValue, 'EX', 600, 'NX')

    return result === 'OK'
  }

  /**
   * Release job lock (legacy)
   */
  private async releaseJobLock(jobId: string): Promise<void> {
    if (!this.redis) return

    const lockKey = `background-jobs:lock:${jobId}`
    await this.redis.del(lockKey)
  }

  /**
   * Process next local job
   */
  private processNextLocal(): void {
    if (this.processing.size >= this.maxConcurrentJobs) {
      return
    }

    const queueData = this.localQueue.shift()
    if (!queueData) return

    this.processing.add(queueData.jobId)
    this.emit('job:processing', queueData.jobId)
    this.emit('job:ready', queueData.jobId)
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId: string): Promise<void> {
    this.processing.delete(jobId)

    if (this.config.type === 'bun-redis' && this.bunRedis) {
      await this.releaseBunRedisJobLock(jobId)
      await this.bunRedis.hdel('background-jobs:data', jobId)
      await this.bunRedis.zadd('background-jobs:completed', Date.now(), jobId)
    } else if (this.config.type === 'redis' && this.redis) {
      await this.releaseJobLock(jobId)
      await this.redis.hdel('background-jobs:data', jobId)
      await this.redis.zadd('background-jobs:completed', Date.now(), jobId)
    }

    this.emit('job:completed', jobId)

    // Process next job
    if (this.config.type === 'local') {
      this.processNextLocal()
    }
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId: string, error: string): Promise<void> {
    this.processing.delete(jobId)

    if (this.config.type === 'bun-redis' && this.bunRedis) {
      await this.releaseBunRedisJobLock(jobId)
      await this.bunRedis.hdel('background-jobs:data', jobId)
      await this.bunRedis.zadd('background-jobs:failed', Date.now(), JSON.stringify({ jobId, error }))
    } else if (this.config.type === 'redis' && this.redis) {
      await this.releaseJobLock(jobId)
      await this.redis.hdel('background-jobs:data', jobId)
      await this.redis.zadd('background-jobs:failed', Date.now(), JSON.stringify({ jobId, error }))
    }

    this.emit('job:failed', jobId, error)

    // Process next job
    if (this.config.type === 'local') {
      this.processNextLocal()
    }
  }

  /**
   * Retry failed job
   */
  private async retryJob(queueData: QueuedJobData): Promise<void> {
    const maxRetries = this.config.retryAttempts || 3
    const retryDelay = this.config.retryDelay || 5000

    if (queueData.attempts >= maxRetries) {
      await this.failJob(queueData.jobId, 'Max retry attempts exceeded')
      return
    }

    queueData.attempts++
    queueData.delay = retryDelay * 2 ** (queueData.attempts - 1) // Exponential backoff

    this.processing.delete(queueData.jobId)
    await this.addJob(queueData.jobId, queueData.priority, queueData.delay)
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    if (this.config.type === 'bun-redis' && this.bunRedis) {
      const waiting = await this.bunRedis.zcard('background-jobs:waiting')
      const delayed = await this.bunRedis.zcard('background-jobs:delayed')
      const completed = await this.bunRedis.zcard('background-jobs:completed')
      const failed = await this.bunRedis.zcard('background-jobs:failed')

      return {
        waiting: waiting + delayed,
        active: this.processing.size,
        completed,
        failed,
        delayed,
      }
    } else if (this.config.type === 'redis' && this.redis) {
      const waiting = await this.redis.zcard('background-jobs:waiting')
      const delayed = await this.redis.zcard('background-jobs:delayed')
      const completed = await this.redis.zcard('background-jobs:completed')
      const failed = await this.redis.zcard('background-jobs:failed')

      return {
        waiting: waiting + delayed,
        active: this.processing.size,
        completed,
        failed,
        delayed,
      }
    } else {
      return {
        waiting: this.localQueue.length,
        active: this.processing.size,
        completed: 0,
        failed: 0,
        delayed: 0,
      }
    }
  }

  /**
   * Remove job from queue
   */
  async removeJob(jobId: string): Promise<boolean> {
    if (this.config.type === 'bun-redis' && this.bunRedis) {
      const removed = await this.bunRedis.hdel('background-jobs:data', jobId)
      await this.bunRedis.zrem('background-jobs:waiting', jobId)
      await this.bunRedis.zrem('background-jobs:delayed', jobId)
      return removed
    } else if (this.config.type === 'redis' && this.redis) {
      const removed = await this.redis.hdel('background-jobs:data', jobId)
      await this.redis.zrem('background-jobs:waiting', jobId)
      await this.redis.zrem('background-jobs:delayed', jobId)
      return removed > 0
    } else {
      const index = this.localQueue.findIndex((job) => job.jobId === jobId)
      if (index >= 0) {
        this.localQueue.splice(index, 1)
        return true
      }
      return false
    }
  }

  /**
   * Clear all jobs
   */
  async clear(): Promise<void> {
    if (this.config.type === 'bun-redis' && this.bunRedis) {
      await this.bunRedis.del('background-jobs:waiting')
      await this.bunRedis.del('background-jobs:delayed')
      await this.bunRedis.del('background-jobs:completed')
      await this.bunRedis.del('background-jobs:failed')
      await this.bunRedis.del('background-jobs:data')
    } else if (this.config.type === 'redis' && this.redis) {
      await this.redis.del(
        'background-jobs:waiting',
        'background-jobs:delayed',
        'background-jobs:completed',
        'background-jobs:failed',
        'background-jobs:data'
      )
    } else {
      this.localQueue.length = 0
    }

    this.processing.clear()
    this.emit('queue:cleared')
  }

  /**
   * Cleanup and close connections
   */
  async close(): Promise<void> {
    if (this.bunRedis) {
      await this.bunRedis.disconnect()
    }
    if (this.redis) {
      await this.redis.quit()
    }
    this.removeAllListeners()
  }

  /**
   * Get current Redis backend type
   */
  getRedisType(): 'ioredis' | 'bun-redis' | 'none' {
    return this.redisType
  }
}
