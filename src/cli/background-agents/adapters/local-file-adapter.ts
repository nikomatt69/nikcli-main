// src/cli/background-agents/adapters/local-file-adapter.ts
// Adapter to use local filesystem as storage for Background Agents

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { BackgroundJob } from '../types'

export interface LocalFileAdapter {
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

  // Availability check
  isAvailable(): Promise<boolean>
}

export class LocalFileBackgroundAgentAdapter implements LocalFileAdapter {
  private readonly baseDir: string
  private readonly jobsFile: string
  private readonly queueFile: string
  private readonly statsFile: string

  constructor(baseDir?: string) {
    this.baseDir = baseDir || join(homedir(), '.nikcli', 'background-jobs')
    this.jobsFile = join(this.baseDir, 'jobs.json')
    this.queueFile = join(this.baseDir, 'queue.json')
    this.statsFile = join(this.baseDir, 'stats.json')

    // Ensure directory exists
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true })
    }
  }

  /**
   * Check if adapter is available (always true for local file adapter)
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Ensure directory exists
      if (!existsSync(this.baseDir)) {
        mkdirSync(this.baseDir, { recursive: true })
      }
      return true
    } catch {
      return false
    }
  }

  /**
   * Store a job in local file
   */
  async storeJob(jobId: string, job: BackgroundJob): Promise<void> {
    try {
      const jobs = await this.getAllJobs()
      const existingIndex = jobs.findIndex((j) => j.id === jobId)

      // Serialize job data
      const serializedJob: any = {
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

      if (existingIndex >= 0) {
        jobs[existingIndex] = serializedJob as any
      } else {
        jobs.push(serializedJob as any)
      }

      writeFileSync(this.jobsFile, JSON.stringify(jobs, null, 2), 'utf-8')
    } catch (error) {
      console.error('Error storing job in local file:', error)
      throw error
    }
  }

  /**
   * Get a job from local file
   */
  async getJob(jobId: string): Promise<BackgroundJob | null> {
    try {
      const jobs = await this.getAllJobs()
      const job = jobs.find((j) => j.id === jobId)
      return job ? this.deserializeJob(job as any) : null
    } catch (error) {
      console.error('Error getting job from local file:', error)
      return null
    }
  }

  /**
   * Get all jobs from local file
   */
  async getAllJobs(): Promise<BackgroundJob[]> {
    try {
      if (!existsSync(this.jobsFile)) {
        return []
      }

      const content = readFileSync(this.jobsFile, 'utf-8')
      const jobs = JSON.parse(content) as any[]

      return jobs.map((job) => this.deserializeJob(job))
    } catch (error) {
      // If file doesn't exist or is invalid, return empty array
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      console.error('Error reading jobs from local file:', error)
      return []
    }
  }

  /**
   * Delete a job from local file
   */
  async deleteJob(jobId: string): Promise<void> {
    try {
      const jobs = await this.getAllJobs()
      const filteredJobs = jobs.filter((j) => j.id !== jobId)
      writeFileSync(this.jobsFile, JSON.stringify(filteredJobs, null, 2), 'utf-8')
    } catch (error) {
      console.error('Error deleting job from local file:', error)
      throw error
    }
  }

  /**
   * Add job to queue
   */
  async addToQueue(jobId: string, priority: number): Promise<void> {
    try {
      const queue = await this.getQueue()
      queue.push({ jobId, priority, timestamp: Date.now() })
      queue.sort((a, b) => b.priority - a.priority)
      writeFileSync(this.queueFile, JSON.stringify(queue, null, 2), 'utf-8')
    } catch (error) {
      console.error('Error adding job to queue:', error)
      throw error
    }
  }

  /**
   * Get next job from queue
   */
  async getNextJob(): Promise<string | null> {
    try {
      const queue = await this.getQueue()
      if (queue.length === 0) {
        return null
      }
      const next = queue.shift()
      if (next) {
        writeFileSync(this.queueFile, JSON.stringify(queue, null, 2), 'utf-8')
        return next.jobId
      }
      return null
    } catch (error) {
      console.error('Error getting next job from queue:', error)
      return null
    }
  }

  /**
   * Remove job from queue
   */
  async removeFromQueue(jobId: string): Promise<void> {
    try {
      const queue = await this.getQueue()
      const filteredQueue = queue.filter((item) => item.jobId !== jobId)
      writeFileSync(this.queueFile, JSON.stringify(filteredQueue, null, 2), 'utf-8')
    } catch (error) {
      console.error('Error removing job from queue:', error)
      throw error
    }
  }

  /**
   * Get queue size
   */
  async getQueueSize(): Promise<number> {
    try {
      const queue = await this.getQueue()
      return queue.length
    } catch {
      return 0
    }
  }

  /**
   * Increment a stat
   */
  async incrementStat(stat: string, delta: number = 1): Promise<void> {
    try {
      const stats = await this.getAllStats()
      stats[stat] = (stats[stat] || 0) + delta
      writeFileSync(this.statsFile, JSON.stringify(stats, null, 2), 'utf-8')
    } catch (error) {
      console.error('Error incrementing stat:', error)
      throw error
    }
  }

  /**
   * Get a stat value
   */
  async getStat(stat: string): Promise<number> {
    try {
      const stats = await this.getAllStats()
      return stats[stat] || 0
    } catch {
      return 0
    }
  }

  /**
   * Get all stats
   */
  async getAllStats(): Promise<Record<string, number>> {
    try {
      if (!existsSync(this.statsFile)) {
        return {}
      }
      const content = readFileSync(this.statsFile, 'utf-8')
      return JSON.parse(content)
    } catch {
      return {}
    }
  }

  /**
   * Get queue data
   */
  private async getQueue(): Promise<Array<{ jobId: string; priority: number; timestamp: number }>> {
    try {
      if (!existsSync(this.queueFile)) {
        return []
      }
      const content = readFileSync(this.queueFile, 'utf-8')
      return JSON.parse(content)
    } catch {
      return []
    }
  }

  /**
   * Deserialize job from stored format
   */
  private deserializeJob(job: any): BackgroundJob {
    return {
      ...job,
      createdAt: new Date(job.createdAt),
      startedAt: job.startedAt ? new Date(job.startedAt) : undefined,
      completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
      logs: job.logs.map((log: any) => ({
        ...log,
        timestamp: new Date(log.timestamp),
      })),
      artifacts: job.artifacts.map((artifact: any) => ({
        ...artifact,
        createdAt: new Date(artifact.createdAt),
      })),
      followUpMessages: job.followUpMessages.map((msg: any) => ({
        ...msg,
        createdAt: new Date(msg.createdAt),
      })),
    } as BackgroundJob
  }
}

// Export singleton instance
export const localFileAdapter = new LocalFileBackgroundAgentAdapter()
