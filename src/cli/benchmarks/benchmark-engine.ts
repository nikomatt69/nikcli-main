/**
 * Benchmark Engine
 * Main orchestrator for running benchmarks with different templates and models
 */

import EventEmitter from 'node:events'
import { nanoid } from 'nanoid'
import { MetricsTracker } from './metrics-tracker'
import { ResultsManager } from './results-manager'
import type { BaseBenchmarkTemplate } from './templates/base-template'
import { CustomTemplate } from './templates/custom-template'
import { HumanEvalTemplate } from './templates/humaneval-template'
import { MBPPTemplate } from './templates/mbpp-template'
import { SWEBenchTemplate } from './templates/swe-bench-template'
import type { BenchmarkConfig, BenchmarkSession, BenchmarkStatus, BenchmarkTemplate, TaskResult } from './types'

export interface BenchmarkEvents {
  'status-change': (status: BenchmarkStatus) => void
  'task-complete': (result: TaskResult, progress: number) => void
  'metrics-update': (metrics: any) => void
  error: (error: Error) => void
  complete: (session: BenchmarkSession) => void
}

export class BenchmarkEngine extends EventEmitter {
  private session: BenchmarkSession | null = null
  private metricsTracker: MetricsTracker
  private resultsManager: ResultsManager
  private template: BaseBenchmarkTemplate | null = null
  private currentTaskIndex = 0
  private isPaused = false
  private isStopped = false

  constructor() {
    super()
    this.metricsTracker = new MetricsTracker()
    this.resultsManager = new ResultsManager()
  }

  /**
   * Start a new benchmark session
   */
  async start(
    config: BenchmarkConfig,
    modelExecutor: (prompt: string) => Promise<{
      output: string
      tokensUsed: { input: number; output: number; total: number }
      cost: number
    }>
  ): Promise<string> {
    // Initialize results directory
    await this.resultsManager.initialize()

    // Load template
    this.template = this.createTemplate(config.template)
    await this.template.loadTasks({
      limit: config.iterations || config.filters?.limit,
      difficulty: config.filters?.difficulty,
      tags: config.filters?.tags,
    })

    const tasks = this.template.getTasks()

    // Create session
    const sessionId = this.generateSessionId(config.template, config.model)
    this.session = {
      id: sessionId,
      template: config.template,
      model: config.model,
      status: 'running',
      startTime: new Date(),
      totalTasks: tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      metrics: this.metricsTracker.getMetrics(),
      tasks: [],
      config,
    }

    this.updateStatus('running')
    this.currentTaskIndex = 0
    this.isPaused = false
    this.isStopped = false

    // Start executing tasks
    this.executeTasks(modelExecutor).catch((error) => {
      this.emit('error', error)
    })

    return sessionId
  }

  /**
   * Pause the current benchmark
   */
  pause(): void {
    if (this.session && this.session.status === 'running') {
      this.isPaused = true
      this.updateStatus('paused')
    }
  }

  /**
   * Resume the paused benchmark
   */
  resume(): void {
    if (this.session && this.session.status === 'paused') {
      this.isPaused = false
      this.updateStatus('running')
    }
  }

  /**
   * Stop the current benchmark
   */
  async stop(): Promise<BenchmarkSession | null> {
    if (!this.session) return null

    this.isStopped = true
    this.updateStatus('stopped')
    this.metricsTracker.complete()

    // Finalize session
    this.session.endTime = new Date()
    this.session.metrics = this.metricsTracker.getMetrics()

    // Save session
    await this.resultsManager.saveSession(this.session)

    const completedSession = this.session
    this.session = null

    return completedSession
  }

  /**
   * Get current session
   */
  getCurrentSession(): BenchmarkSession | null {
    return this.session
  }

  /**
   * Get current status
   */
  getStatus(): BenchmarkStatus {
    return this.session?.status || 'idle'
  }

  /**
   * Get current progress
   */
  getProgress(): number {
    if (!this.session) return 0
    return (this.session.completedTasks / this.session.totalTasks) * 100
  }

  /**
   * Execute all tasks in the benchmark
   */
  private async executeTasks(
    modelExecutor: (prompt: string) => Promise<{
      output: string
      tokensUsed: { input: number; output: number; total: number }
      cost: number
    }>
  ): Promise<void> {
    if (!this.template || !this.session) return

    const tasks = this.template.getTasks()

    for (let i = this.currentTaskIndex; i < tasks.length; i++) {
      // Check if paused or stopped
      while (this.isPaused && !this.isStopped) {
        await this.sleep(100)
      }

      if (this.isStopped) {
        break
      }

      const task = tasks[i]

      try {
        // Execute task
        const result = await this.template.executeTask(task, modelExecutor)

        // Record metrics
        this.metricsTracker.recordTask(result, this.session.model)

        // Update session
        this.session.tasks.push(result)
        this.session.completedTasks++
        if (!result.success) {
          this.session.failedTasks++
        }
        this.session.metrics = this.metricsTracker.getMetrics()

        // Emit events
        const progress = (this.session.completedTasks / this.session.totalTasks) * 100
        this.emit('task-complete', result, progress)
        this.emit('metrics-update', this.session.metrics)

        // Save progress periodically (every 10 tasks)
        if (this.session.completedTasks % 10 === 0) {
          await this.resultsManager.saveSession(this.session)
        }

        this.currentTaskIndex = i + 1
      } catch (error) {
        console.error(`Error executing task ${task.id}:`, error)
        this.emit('error', error as Error)
      }
    }

    // Complete benchmark
    if (!this.isStopped) {
      await this.complete()
    }
  }

  /**
   * Complete the benchmark
   */
  private async complete(): Promise<void> {
    if (!this.session) return

    this.updateStatus('completed')
    this.metricsTracker.complete()

    this.session.endTime = new Date()
    this.session.metrics = this.metricsTracker.getMetrics()

    // Save final session
    await this.resultsManager.saveSession(this.session)

    this.emit('complete', this.session)

    const completedSession = this.session
    this.session = null

    // Reset for next run
    this.metricsTracker.reset()
    this.currentTaskIndex = 0
  }

  /**
   * Update session status
   */
  private updateStatus(status: BenchmarkStatus): void {
    if (this.session) {
      this.session.status = status
      this.emit('status-change', status)
    }
  }

  /**
   * Create template instance
   */
  private createTemplate(type: BenchmarkTemplate): BaseBenchmarkTemplate {
    switch (type) {
      case 'swe-bench':
        return new SWEBenchTemplate()
      case 'humaneval':
        return new HumanEvalTemplate()
      case 'mbpp':
        return new MBPPTemplate()
      case 'custom':
        return new CustomTemplate()
      default:
        throw new Error(`Unknown template type: ${type}`)
    }
  }

  /**
   * Generate session ID
   */
  private generateSessionId(template: string, model: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const shortId = nanoid(6)
    const sanitizedModel = model.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    return `${timestamp}_${template}_${sanitizedModel}_${shortId}`
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Get results manager instance
   */
  getResultsManager(): ResultsManager {
    return this.resultsManager
  }
}
