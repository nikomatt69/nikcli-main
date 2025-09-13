// src/cli/background-agents/adapters/vercel-kv-adapter.ts
// Adapter to use Vercel KV as storage for Background Agents

import { kv } from '@vercel/kv'
import type { BackgroundJob } from '../types'

export interface VercelKVAdapter {
  // Job storage
  storeJob(jobId: string, job: BackgroundJob): Promise<void>
  getJob(jobId: string): Promise<BackgroundJob | null>
  getAllJobs(): Promise<BackgroundJob[]>
  deleteJob(jobId: string): Promise<void>

  // Queue operations
  addToQueue(jobId: string, priority: number): Promise<void>
  getNextJob(): Promise<string | null>
  removeFromQueue(jobId: string): Promise<void>
  getQueueSize(): Promise<number>

  // Stats
  incrementStat(stat: string, delta?: number): Promise<void>
  getStat(stat: string): Promise<number>
  getAllStats(): Promise<Record<string, number>>
}

export class VercelKVBackgroundAgentAdapter implements VercelKVAdapter {
  private readonly JOBS_KEY = 'bg_jobs'
  private readonly JOB_PREFIX = 'bg_job:'
  private readonly QUEUE_KEY = 'bg_queue'
  private readonly STATS_KEY = 'bg_stats'

  /**
   * Store a job in Vercel KV
   */
  async storeJob(jobId: string, job: BackgroundJob): Promise<void> {
    try {
      // Serialize job data
      const serializedJob = {
        ...job,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        logs: job.logs.map((log) => ({
          ...log,
          timestamp: log.timestamp.toISOString(),
        })),
        artifacts: job.artifacts.map((artifact) => ({
          ...artifact,
          createdAt: artifact.createdAt.toISOString(),
        })),
        followUpMessages: job.followUpMessages.map((msg) => ({
          ...msg,
          createdAt: msg.createdAt.toISOString(),
        })),
      }

      // Store individual job
      await kv.set(`${this.JOB_PREFIX}${jobId}`, serializedJob)

      // Add to jobs set
      await kv.sadd(this.JOBS_KEY, jobId)
    } catch (error) {
      console.error('Error storing job in Vercel KV:', error)
      throw error
    }
  }

  /**
   * Get a job from Vercel KV
   */
  async getJob(jobId: string): Promise<BackgroundJob | null> {
    try {
      const serializedJob = (await kv.get(`${this.JOB_PREFIX}${jobId}`)) as any

      if (!serializedJob) {
        return null
      }

      // Deserialize job data
      return {
        ...serializedJob,
        createdAt: new Date(serializedJob.createdAt),
        startedAt: serializedJob.startedAt ? new Date(serializedJob.startedAt) : undefined,
        completedAt: serializedJob.completedAt ? new Date(serializedJob.completedAt) : undefined,
        logs: serializedJob.logs.map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp),
        })),
        artifacts: serializedJob.artifacts.map((artifact: any) => ({
          ...artifact,
          createdAt: new Date(artifact.createdAt),
        })),
        followUpMessages: serializedJob.followUpMessages.map((msg: any) => ({
          ...msg,
          createdAt: new Date(msg.createdAt),
        })),
      } as BackgroundJob
    } catch (error) {
      console.error('Error getting job from Vercel KV:', error)
      return null
    }
  }

  /**
   * Get all jobs from Vercel KV
   */
  async getAllJobs(): Promise<BackgroundJob[]> {
    try {
      const jobIds = (await kv.smembers(this.JOBS_KEY)) as string[]

      if (jobIds.length === 0) {
        return []
      }

      const jobs: BackgroundJob[] = []

      for (const jobId of jobIds) {
        const job = await this.getJob(jobId)
        if (job) {
          jobs.push(job)
        }
      }

      return jobs
    } catch (error) {
      console.error('Error getting all jobs from Vercel KV:', error)
      return []
    }
  }

  /**
   * Delete a job from Vercel KV
   */
  async deleteJob(jobId: string): Promise<void> {
    try {
      await kv.del(`${this.JOB_PREFIX}${jobId}`)
      await kv.srem(this.JOBS_KEY, jobId)
    } catch (error) {
      console.error('Error deleting job from Vercel KV:', error)
      throw error
    }
  }

  /**
   * Add job to queue
   */
  async addToQueue(jobId: string, priority: number): Promise<void> {
    try {
      // Use sorted set for priority queue
      await kv.zadd(this.QUEUE_KEY, { score: priority, member: jobId })
    } catch (error) {
      console.error('Error adding to queue in Vercel KV:', error)
      throw error
    }
  }

  /**
   * Get next job from queue (highest priority)
   */
  async getNextJob(): Promise<string | null> {
    try {
      // Get highest priority job (highest score)
      const result = await kv.zrange(this.QUEUE_KEY, -1, -1)
      return result.length > 0 ? (result[0] as string) : null
    } catch (error) {
      console.error('Error getting next job from Vercel KV:', error)
      return null
    }
  }

  /**
   * Remove job from queue
   */
  async removeFromQueue(jobId: string): Promise<void> {
    try {
      await kv.zrem(this.QUEUE_KEY, jobId)
    } catch (error) {
      console.error('Error removing from queue in Vercel KV:', error)
      throw error
    }
  }

  /**
   * Get queue size
   */
  async getQueueSize(): Promise<number> {
    try {
      return await kv.zcard(this.QUEUE_KEY)
    } catch (error) {
      console.error('Error getting queue size from Vercel KV:', error)
      return 0
    }
  }

  /**
   * Increment a statistic
   */
  async incrementStat(stat: string, delta: number = 1): Promise<void> {
    try {
      await kv.hincrby(this.STATS_KEY, stat, delta)
    } catch (error) {
      console.error('Error incrementing stat in Vercel KV:', error)
      throw error
    }
  }

  /**
   * Get a statistic
   */
  async getStat(stat: string): Promise<number> {
    try {
      const value = await kv.hget(this.STATS_KEY, stat)
      return typeof value === 'number' ? value : parseInt((value as string) || '0', 10)
    } catch (error) {
      console.error('Error getting stat from Vercel KV:', error)
      return 0
    }
  }

  /**
   * Get all statistics
   */
  async getAllStats(): Promise<Record<string, number>> {
    try {
      const stats = (await kv.hgetall(this.STATS_KEY)) as Record<string, string>

      // Convert string values to numbers
      const numericStats: Record<string, number> = {}
      for (const [key, value] of Object.entries(stats)) {
        numericStats[key] = parseInt(value, 10) || 0
      }

      return numericStats
    } catch (error) {
      console.error('Error getting all stats from Vercel KV:', error)
      return {}
    }
  }

  /**
   * Check if running on Vercel
   */
  static isVercelEnvironment(): boolean {
    return Boolean(process.env.VERCEL || process.env.VERCEL_ENV)
  }

  /**
   * Check if KV is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await kv.ping()
      return true
    } catch {
      return false
    }
  }
}

// Export singleton
export const vercelKVAdapter = new VercelKVBackgroundAgentAdapter()
