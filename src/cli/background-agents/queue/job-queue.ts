// src/cli/background-agents/queue/job-queue.ts

import { EventEmitter } from 'node:events'
import IORedis from 'ioredis'
import { Redis as UpstashRedis } from '@upstash/redis'
import type { QueueStats } from '../types'

export interface QueueConfig {
  type: 'local' | 'redis'
  redis?: {
    host: string
    port: number
    password?: string
    db?: number
    maxRetriesPerRequest?: number
    upstash?: {
      url: string
      token: string
    }
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
  private upstashRedis?: UpstashRedis
  private localQueue: QueuedJobData[] = []
  private processing = new Set<string>()
  private maxConcurrentJobs: number
  private processorInterval?: NodeJS.Timeout

  constructor(config: QueueConfig) {
    super()
    this.config = config
    this.maxConcurrentJobs = config.maxConcurrentJobs || 3

    // Prevent unhandled 'error' from crashing the process
    this.on('error', (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('Queue warning:', msg)
    })

    if (config.type === 'redis' && config.redis) {
      this.initRedisQueue()
    }
  }

  /**
   * Handle Upstash errors and disable if limit exceeded
   */
  private handleUpstashError(error: any): void {
    if (error.message?.includes('max requests limit exceeded')) {
      console.error('✖ Upstash limit exceeded, permanently disabling Upstash Redis for this session')
      this.upstashRedis = undefined
      this.config.type = 'local'
    }
  }

  /**
   * Redis helper methods - work with both IORedis and Upstash
   */
  private async redisZadd(key: string, score: number, member: string): Promise<void> {
    if (this.upstashRedis) {
      try {
        await this.upstashRedis.zadd(key, { score, member })
      } catch (error: any) {
        this.handleUpstashError(error)
        throw error
      }
    } else if (this.redis) {
      await this.redis.zadd(key, score, member)
    }
  }

  private async redisZrem(key: string, member: string): Promise<void> {
    if (this.upstashRedis) {
      try {
        await this.upstashRedis.zrem(key, member)
      } catch (error: any) {
        this.handleUpstashError(error)
        throw error
      }
    } else if (this.redis) {
      await this.redis.zrem(key, member)
    }
  }

  private async redisZrangebyscore(key: string, min: number, max: number, limit: number): Promise<string[]> {
    if (this.upstashRedis) {
      try {
        const result = await this.upstashRedis.zrange(key, min, max, { byScore: true, offset: 0, count: limit })
        return result as string[]
      } catch (error: any) {
        this.handleUpstashError(error)
        throw error
      }
    } else if (this.redis) {
      return await this.redis.zrangebyscore(key, min, max, 'LIMIT', 0, limit)
    }
    return []
  }

  private async redisZpopmin(key: string, count: number): Promise<(string | object)[]> {
    if (this.upstashRedis) {
      try {
        const result = await this.upstashRedis.zpopmin(key, count)
        // Upstash returns [member1, score1, member2, score2, ...], we need only members
        // Upstash may deserialize JSON strings automatically, so we return both strings and objects
        if (Array.isArray(result)) {
          return result.filter((_, i) => i % 2 === 0) as (string | object)[]
        }
        return []
      } catch (error: any) {
        this.handleUpstashError(error)
        throw error
      }
    } else if (this.redis) {
      const result = await this.redis.zpopmin(key, count)
      return Array.isArray(result) ? result : []
    }
    return []
  }

  private async redisZcard(key: string): Promise<number> {
    if (this.upstashRedis) {
      try {
        return await this.upstashRedis.zcard(key)
      } catch (error: any) {
        this.handleUpstashError(error)
        throw error
      }
    } else if (this.redis) {
      return await this.redis.zcard(key)
    }
    return 0
  }

  private async redisHset(key: string, field: string, value: string): Promise<void> {
    if (this.upstashRedis) {
      try {
        await this.upstashRedis.hset(key, { [field]: value })
      } catch (error: any) {
        this.handleUpstashError(error)
        throw error
      }
    } else if (this.redis) {
      await this.redis.hset(key, field, value)
    }
  }

  private async redisHdel(key: string, field: string): Promise<number> {
    if (this.upstashRedis) {
      try {
        return await this.upstashRedis.hdel(key, field)
      } catch (error: any) {
        this.handleUpstashError(error)
        throw error
      }
    } else if (this.redis) {
      return await this.redis.hdel(key, field)
    }
    return 0
  }

  private async redisSet(key: string, value: string, ex?: number): Promise<string | null> {
    if (this.upstashRedis) {
      try {
        await this.upstashRedis.set(key, value, ex ? { ex } : {})
        return 'OK'
      } catch (error: any) {
        this.handleUpstashError(error)
        throw error
      }
    } else if (this.redis) {
      if (ex) {
        return await this.redis.set(key, value, 'EX', ex, 'NX')
      }
      return await this.redis.set(key, value)
    }
    return null
  }

  private async redisDel(...keys: string[]): Promise<void> {
    if (this.upstashRedis) {
      try {
        await this.upstashRedis.del(...keys)
      } catch (error: any) {
        this.handleUpstashError(error)
        throw error
      }
    } else if (this.redis) {
      await this.redis.del(...keys)
    }
  }

  /**
   * Initialize Redis queue
   * Background agents prioritize Upstash over local Redis
   */
  private async initRedisQueue(): Promise<void> {
    if (!this.config.redis) return

    // Check if using Upstash REST API (preferred for background agents)
    if (this.config.redis.upstash) {
      console.log('🔄 Background agents: Initializing Upstash Redis REST queue...')
      try {
        this.upstashRedis = new UpstashRedis({
          url: this.config.redis.upstash.url,
          token: this.config.redis.upstash.token,
        })

        // Test connection
        await this.upstashRedis.ping()
        console.log('✓ Background agents: Upstash Redis connected successfully')
        this.config.type = 'redis' // Ensure queue type is set to redis
        this.emit('connected')
      } catch (error: any) {
        console.error('✖ Background agents: Upstash Redis connection failed:', error.message)
        this.emit('error', error)

        // Don't fallback to local Redis - use local queue instead
        this.upstashRedis = undefined
        this.config.type = 'local'
        console.warn('⚠︎  Background agents: Falling back to local queue (no Redis)')
      }
    } else if (this.config.redis.host && this.config.redis.port) {
      // Standard Redis connection (fallback, not recommended for background agents)
      console.warn('⚠︎  Background agents: Using standard Redis (Upstash is preferred)')

      this.redis = new IORedis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db || 0,
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          if (times > 3) {
            console.error('✖ Background agents: Redis connection failed after 3 attempts')
            console.error('   Falling back to local queue')
            this.config.type = 'local'
            return null // Stop retrying
          }
          return Math.min(times * 200, 2000)
        },
      })

      this.redis.on('connect', () => {
        console.log('✓ Background agents: Standard Redis connected successfully')
        this.emit('connected')
      })

      this.redis.on('error', (error) => {
        console.error('✖ Background agents: Redis queue error:', error.message)
        this.emit('error', error)

        // Gracefully degrade to local queue if Redis disconnects/errors
        try {
          this.redis?.disconnect()
        } catch { }
        this.redis = undefined
        this.config.type = 'local'
        console.warn('⚠︎  Background agents: Falling back to local queue')
      })
    } else {
      console.warn('⚠︎  Background agents: No valid Redis configuration found, using local queue')
      this.config.type = 'local'
    }

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

    if (this.config.type === 'redis' && (this.redis || this.upstashRedis)) {
      await this.addJobToRedis(queueData)
    } else {
      this.addJobToLocal(queueData)
    }

    this.emit('job:queued', jobId)
  }

  /**
   * Add job to Redis queue
   */
  private async addJobToRedis(queueData: QueuedJobData): Promise<void> {
    const key = queueData.delay ? 'background-jobs:delayed' : 'background-jobs:waiting'
    const score = queueData.delay ? Date.now() + queueData.delay : Date.now() - queueData.priority

    await this.redisZadd(key, score, JSON.stringify(queueData))
    await this.redisHset('background-jobs:data', queueData.jobId, JSON.stringify(queueData))
  }

  /**
   * Add job to local queue
   */
  private addJobToLocal(queueData: QueuedJobData): void {
    if (queueData.delay) {
      // Schedule for later
      setTimeout(() => {
        this.insertJobSorted(queueData)
        this.processNextLocal()
      }, queueData.delay)
    } else {
      this.insertJobSorted(queueData)
      this.processNextLocal()
    }
  }

  /**
   * Insert job maintaining sorted order (descending priority)
   * Uses binary search for O(log n) search + O(n) insertion
   * Better than O(n log n) full sort on every addition
   */
  private insertJobSorted(queueData: QueuedJobData): void {
    if (this.localQueue.length === 0) {
      this.localQueue.push(queueData)
      return
    }

    // Binary search for insertion point
    let left = 0
    let right = this.localQueue.length

    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      if (this.localQueue[mid].priority < queueData.priority) {
        right = mid
      } else {
        left = mid + 1
      }
    }

    this.localQueue.splice(left, 0, queueData)
  }

  /**
   * Start Redis job processor
   */
  private startProcessor(): void {
    if (this.config.type !== 'redis' || (!this.redis && !this.upstashRedis)) return

    this.processorInterval = setInterval(async () => {
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
   * Process delayed jobs in Redis
   */
  private async processDelayedJobs(): Promise<void> {
    const now = Date.now()
    const delayedJobs = await this.redisZrangebyscore('background-jobs:delayed', 0, now, 10)

    for (const jobData of delayedJobs) {
      // Move from delayed to waiting
      await this.redisZrem('background-jobs:delayed', jobData)
      await this.redisZadd('background-jobs:waiting', now, jobData)
    }
  }

  /**
   * Process Redis jobs with proper locking
   */
  private async processRedisJobs(): Promise<void> {
    if (this.processing.size >= this.maxConcurrentJobs) {
      return
    }

    const jobs = await this.redisZpopmin('background-jobs:waiting', 1)
    if (jobs.length === 0) return

    const [jobDataStr] = jobs
    // Handle case where jobDataStr might already be an object (from Upstash)
    let queueData: QueuedJobData
    if (typeof jobDataStr === 'string') {
      queueData = JSON.parse(jobDataStr)
    } else if (typeof jobDataStr === 'object' && jobDataStr !== null) {
      queueData = jobDataStr as QueuedJobData
    } else {
      console.error('Invalid job data format:', typeof jobDataStr, jobDataStr)
      return
    }

    // Try to acquire lock
    const lockAcquired = await this.acquireJobLock(queueData.jobId)
    if (!lockAcquired) {
      // Another process is handling this job, put it back
      // Ensure we store as JSON string
      const jobDataToStore = typeof jobDataStr === 'string' ? jobDataStr : JSON.stringify(queueData)
      await this.redisZadd('background-jobs:waiting', Date.now(), jobDataToStore)
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
   * Acquire Redis-based job lock
   */
  private async acquireJobLock(jobId: string): Promise<boolean> {
    const lockKey = `background-jobs:lock:${jobId}`
    const lockValue = `${process.pid}-${Date.now()}`

    // Try to acquire lock with 10 minute expiry (EX seconds) and NX (only if not exists)
    const result = await this.redisSet(lockKey, lockValue, 600)

    return result === 'OK'
  }

  /**
   * Release job lock
   */
  private async releaseJobLock(jobId: string): Promise<void> {
    const lockKey = `background-jobs:lock:${jobId}`
    await this.redisDel(lockKey)
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

    if (this.config.type === 'redis' && (this.redis || this.upstashRedis)) {
      await this.releaseJobLock(jobId)
      await this.redisHdel('background-jobs:data', jobId)
      await this.redisZadd('background-jobs:completed', Date.now(), jobId)
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

    if (this.config.type === 'redis' && (this.redis || this.upstashRedis)) {
      await this.releaseJobLock(jobId)
      await this.redisHdel('background-jobs:data', jobId)
      await this.redisZadd('background-jobs:failed', Date.now(), JSON.stringify({ jobId, error }))
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
    if (this.config.type === 'redis' && (this.redis || this.upstashRedis)) {
      const waiting = await this.redisZcard('background-jobs:waiting')
      const delayed = await this.redisZcard('background-jobs:delayed')
      const completed = await this.redisZcard('background-jobs:completed')
      const failed = await this.redisZcard('background-jobs:failed')

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
    if (this.config.type === 'redis' && (this.redis || this.upstashRedis)) {
      const removed = await this.redisHdel('background-jobs:data', jobId)
      await this.redisZrem('background-jobs:waiting', jobId)
      await this.redisZrem('background-jobs:delayed', jobId)
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
    if (this.config.type === 'redis' && (this.redis || this.upstashRedis)) {
      await this.redisDel(
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
    // Clear processor interval to prevent memory leak
    if (this.processorInterval) {
      clearInterval(this.processorInterval)
      this.processorInterval = undefined
    }

    if (this.redis) {
      await this.redis.quit()
    }

    // Upstash REST client doesn't need explicit disconnect
    this.upstashRedis = undefined

    this.removeAllListeners()
  }
}
