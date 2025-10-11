import { EventEmitter } from 'events'
import chalk from 'chalk'
import type { ModuleContext } from '../core/module-manager'
import { logger } from '../utils/logger'
import { MiddlewareContextBuilder } from './middleware-context'
import type {
  BaseMiddleware,
  MiddlewareChainResult,
  MiddlewareConfig,
  MiddlewareEvent,
  MiddlewareExecutionContext,
  MiddlewareMetrics,
  MiddlewareNext,
  MiddlewareRegistration,
  MiddlewareRequest,
  MiddlewareResponse,
} from './types'

export class MiddlewareManager extends EventEmitter {
  private middleware: Map<string, MiddlewareRegistration> = new Map()
  private metrics: Map<string, MiddlewareMetrics> = new Map()
  private executionHistory: MiddlewareEvent[] = []
  private readonly maxHistorySize = 1000

  constructor() {
    super()
    this.setupMetricsCollection()
  }

  register(middleware: BaseMiddleware, config?: Partial<MiddlewareConfig>): void {
    const finalConfig: MiddlewareConfig = {
      enabled: true,
      priority: 100,
      timeout: 30000,
      retries: 1,
      ...config,
    }

    const registration: MiddlewareRegistration = {
      name: middleware.name,
      middleware,
      config: finalConfig,
    }

    this.middleware.set(middleware.name, registration)

    this.initializeMetrics(middleware.name)

    logger.info(`Middleware registered: ${middleware.name}`, {
      priority: finalConfig.priority,
      enabled: finalConfig.enabled,
    })

    this.emit('middleware:registered', {
      name: middleware.name,
      config: finalConfig,
    })
  }

  unregister(middlewareName: string): boolean {
    const existed = this.middleware.delete(middlewareName)
    if (existed) {
      this.metrics.delete(middlewareName)
      logger.info(`Middleware unregistered: ${middlewareName}`)
      this.emit('middleware:unregistered', { name: middlewareName })
    }
    return existed
  }

  async execute(
    operation: string,
    args: any[],
    moduleContext: ModuleContext,
    requestType: 'command' | 'agent' | 'tool' | 'file' = 'command'
  ): Promise<MiddlewareChainResult> {
    const context = MiddlewareContextBuilder.forRequest(operation, args, moduleContext)

    const request: MiddlewareRequest = {
      id: context.requestId,
      type: requestType,
      operation,
      args,
      context,
      metadata: {},
    }

    const startTime = Date.now()
    const executedMiddleware: string[] = []
    const skippedMiddleware: string[] = []
    let finalResponse: MiddlewareResponse | undefined
    let finalError: Error | undefined

    try {
      const sortedMiddleware = this.getSortedMiddleware()
      let index = 0

      const next: MiddlewareNext = async (): Promise<MiddlewareResponse> => {
        if (index >= sortedMiddleware.length) {
          return { success: true, data: null }
        }

        const registration = sortedMiddleware[index++]
        const middleware = registration.middleware

        if (!middleware.shouldExecute(request)) {
          skippedMiddleware.push(middleware.name)
          this.recordEvent('skip', middleware.name, request.id)
          return next()
        }

        executedMiddleware.push(middleware.name)

        const executionContext: MiddlewareExecutionContext = {
          request,
          startTime: new Date(),
          aborted: false,
          retries: 0,
        }

        try {
          this.recordEvent('start', middleware.name, request.id)

          const response = await this.executeWithTimeout(
            middleware,
            request,
            next,
            executionContext,
            registration.config.timeout || 30000
          )

          executionContext.endTime = new Date()
          executionContext.duration = executionContext.endTime.getTime() - executionContext.startTime.getTime()
          executionContext.response = response

          this.updateMetrics(middleware.name, executionContext.duration, true)
          this.recordEvent('complete', middleware.name, request.id, executionContext.duration)

          return response
        } catch (error: any) {
          executionContext.endTime = new Date()
          executionContext.duration = executionContext.endTime.getTime() - executionContext.startTime.getTime()

          this.updateMetrics(middleware.name, executionContext.duration, false)
          this.recordEvent('error', middleware.name, request.id, executionContext.duration, error)

          if (registration.config.retries && executionContext.retries < registration.config.retries) {
            executionContext.retries++
            logger.warn(`Retrying middleware ${middleware.name} (attempt ${executionContext.retries})`)
            return next()
          }

          throw error
        }
      }

      finalResponse = await next()

      return {
        success: true,
        response: finalResponse,
        executedMiddleware,
        skippedMiddleware,
        totalDuration: Date.now() - startTime,
        metrics: this.getAllMetrics(),
      }
    } catch (error: any) {
      finalError = error
      logger.error('Middleware chain execution failed', {
        requestId: request.id,
        operation,
        error: error.message,
        executedMiddleware,
        skippedMiddleware,
      })

      return {
        success: false,
        error: finalError,
        executedMiddleware,
        skippedMiddleware,
        totalDuration: Date.now() - startTime,
        metrics: this.getAllMetrics(),
      }
    }
  }

  private async executeWithTimeout(
    middleware: BaseMiddleware,
    request: MiddlewareRequest,
    next: MiddlewareNext,
    context: MiddlewareExecutionContext,
    timeout: number
  ): Promise<MiddlewareResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        context.aborted = true
        this.recordEvent('timeout', middleware.name, request.id)
        reject(new Error(`Middleware ${middleware.name} timed out after ${timeout}ms`))
      }, timeout)

      middleware
        .execute(request, next, context)
        .then((response) => {
          clearTimeout(timer)
          if (!context.aborted) {
            resolve(response)
          }
        })
        .catch((error) => {
          clearTimeout(timer)
          if (!context.aborted) {
            reject(error)
          }
        })
    })
  }

  private getSortedMiddleware(): MiddlewareRegistration[] {
    return Array.from(this.middleware.values())
      .filter((registration) => registration.config.enabled)
      .sort((a, b) => (b.config.priority || 0) - (a.config.priority || 0))
  }

  private initializeMetrics(middlewareName: string): void {
    this.metrics.set(middlewareName, {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageExecutionTime: 0,
      errorRate: 0,
    })
  }

  private updateMetrics(middlewareName: string, duration: number, success: boolean): void {
    const metrics = this.metrics.get(middlewareName)
    if (!metrics) return

    metrics.totalRequests++
    metrics.lastExecutionTime = new Date()

    if (success) {
      metrics.successfulRequests++
    } else {
      metrics.failedRequests++
    }

    const totalTime = metrics.averageExecutionTime * (metrics.totalRequests - 1) + duration
    metrics.averageExecutionTime = totalTime / metrics.totalRequests
    metrics.errorRate = metrics.failedRequests / metrics.totalRequests

    this.metrics.set(middlewareName, metrics)
  }

  private recordEvent(
    type: 'start' | 'complete' | 'error' | 'skip' | 'timeout',
    middlewareName: string,
    requestId: string,
    duration?: number,
    error?: Error
  ): void {
    const event: MiddlewareEvent = {
      type,
      middlewareName,
      requestId,
      timestamp: new Date(),
      duration,
      error,
      metadata: {},
    }

    this.executionHistory.push(event)

    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift()
    }

    this.emit('middleware:event', event)
  }

  private setupMetricsCollection(): void {
    setInterval(() => {
      const summary = this.getMetricsSummary()
      this.emit('middleware:metrics', summary)
    }, 60000) // Every minute
  }

  getMiddleware(name: string): BaseMiddleware | undefined {
    return this.middleware.get(name)?.middleware
  }

  getAllMiddleware(): MiddlewareRegistration[] {
    return Array.from(this.middleware.values())
  }

  getMetrics(middlewareName: string): MiddlewareMetrics | undefined {
    return this.metrics.get(middlewareName)
  }

  getAllMetrics(): Record<string, MiddlewareMetrics> {
    const result: Record<string, MiddlewareMetrics> = {}
    for (const [name, metrics] of this.metrics.entries()) {
      result[name] = { ...metrics }
    }
    return result
  }

  getMetricsSummary(): any {
    const summary = {
      totalMiddleware: this.middleware.size,
      enabledMiddleware: Array.from(this.middleware.values()).filter((m) => m.config.enabled).length,
      totalRequests: 0,
      totalSuccessful: 0,
      totalFailed: 0,
      averageResponseTime: 0,
      overallErrorRate: 0,
    }

    let totalTime = 0
    let weightedRequests = 0

    for (const metrics of this.metrics.values()) {
      summary.totalRequests += metrics.totalRequests
      summary.totalSuccessful += metrics.successfulRequests
      summary.totalFailed += metrics.failedRequests
      totalTime += metrics.averageExecutionTime * metrics.totalRequests
      weightedRequests += metrics.totalRequests
    }

    if (weightedRequests > 0) {
      summary.averageResponseTime = totalTime / weightedRequests
      summary.overallErrorRate = summary.totalFailed / summary.totalRequests
    }

    return summary
  }

  getExecutionHistory(limit: number = 100): MiddlewareEvent[] {
    return this.executionHistory.slice(-limit)
  }

  clearMetrics(): void {
    this.metrics.clear()
    this.executionHistory.length = 0
    this.emit('middleware:metrics:cleared')
  }

  enableMiddleware(name: string): boolean {
    const registration = this.middleware.get(name)
    if (registration) {
      registration.config.enabled = true
      this.emit('middleware:enabled', { name })
      return true
    }
    return false
  }

  disableMiddleware(name: string): boolean {
    const registration = this.middleware.get(name)
    if (registration) {
      registration.config.enabled = false
      this.emit('middleware:disabled', { name })
      return true
    }
    return false
  }

  updateMiddlewareConfig(name: string, config: Partial<MiddlewareConfig>): boolean {
    const registration = this.middleware.get(name)
    if (registration) {
      registration.config = { ...registration.config, ...config }
      registration.middleware.updateConfig(registration.config)
      this.emit('middleware:config:updated', { name, config })
      return true
    }
    return false
  }

  showStatus(): void {
    console.log(chalk.cyan.bold('\\n🔧 Middleware System Status'))
    console.log(chalk.gray('─'.repeat(50)))

    const summary = this.getMetricsSummary()
    console.log(chalk.white.bold('\\nOverall Statistics:'))
    console.log(`  Total Middleware: ${summary.totalMiddleware}`)
    console.log(`  Enabled: ${summary.enabledMiddleware}`)
    console.log(`  Total Requests: ${summary.totalRequests}`)
    console.log(`  Success Rate: ${((1 - summary.overallErrorRate) * 100).toFixed(1)}%`)
    console.log(`  Avg Response Time: ${summary.averageResponseTime.toFixed(2)}ms`)

    console.log(chalk.white.bold('\\nRegistered Middleware:'))
    for (const registration of this.middleware.values()) {
      const status = registration.config.enabled ? chalk.green('●') : chalk.red('●')
      const metrics = this.metrics.get(registration.name)
      const requests = metrics ? metrics.totalRequests : 0

      console.log(`  ${status} ${registration.name} (priority: ${registration.config.priority}, requests: ${requests})`)
    }
  }
}

export const middlewareManager = new MiddlewareManager()
