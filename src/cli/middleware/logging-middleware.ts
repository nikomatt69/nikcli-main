import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import chalk from 'chalk'
import { structuredLogger } from '../utils/structured-logger'
import { ContextSanitizer } from './middleware-context'
import {
  BaseMiddleware,
  type MiddlewareConfig,
  type MiddlewareNext,
  type MiddlewareRequest,
  type MiddlewareResponse,
} from './types'

interface LoggingMiddlewareConfig extends MiddlewareConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  logToFile: boolean
  logFile: string
  maxFileSize: number
  rotateFiles: boolean
  includeArgs: boolean
  includeResponse: boolean
  sanitizeData: boolean
  logRequests: boolean
  logResponses: boolean
  logErrors: boolean
  logPerformance: boolean
}

interface LogEntry {
  timestamp: Date
  requestId: string
  operation: string
  type: 'request' | 'response' | 'error' | 'performance'
  duration?: number
  success?: boolean
  data?: any
  error?: string
  metadata?: Record<string, any>
}

export class LoggingMiddleware extends BaseMiddleware {
  private loggingConfig: LoggingMiddlewareConfig
  private logBuffer: LogEntry[] = []
  private readonly bufferFlushInterval = 5000 // 5 seconds
  private flushTimer?: NodeJS.Timeout

  constructor(config: Partial<LoggingMiddlewareConfig> = {}) {
    const defaultConfig: LoggingMiddlewareConfig = {
      enabled: true,
      priority: 900,
      logLevel: 'info',
      logToFile: true,
      logFile: path.join(require('node:path').resolve(require('../utils/working-dir').getWorkingDirectory()), '.nikcli', 'middleware.log'),
      maxFileSize: 50 * 1024 * 1024, // 50MB
      rotateFiles: true,
      includeArgs: true,
      includeResponse: false,
      sanitizeData: true,
      logRequests: true,
      logResponses: true,
      logErrors: true,
      logPerformance: true,
      ...config,
    }

    super('logging', 'Request/response logging and audit trail', defaultConfig)

    this.loggingConfig = defaultConfig
    this.setupBufferFlushing()
    this.ensureLogDirectory()
  }

  async execute(request: MiddlewareRequest, next: MiddlewareNext): Promise<MiddlewareResponse> {
    const startTime = Date.now()

    if (this.loggingConfig.logRequests) {
      this.logRequest(request)
    }

    try {
      const response = await next()
      const duration = Date.now() - startTime

      if (this.loggingConfig.logResponses) {
        this.logResponse(request, response, duration)
      }

      if (this.loggingConfig.logPerformance) {
        this.logPerformance(request, duration, response.success)
      }

      return response
    } catch (error: any) {
      const duration = Date.now() - startTime

      if (this.loggingConfig.logErrors) {
        this.logError(request, error, duration)
      }

      throw error
    }
  }

  private logRequest(request: MiddlewareRequest): void {
    const sanitizedRequest = this.loggingConfig.sanitizeData ? this.sanitizeRequest(request) : request

    const logEntry: LogEntry = {
      timestamp: new Date(),
      requestId: request.id,
      operation: request.operation,
      type: 'request',
      data: {
        type: request.type,
        args: this.loggingConfig.includeArgs ? sanitizedRequest.args : '[OMITTED]',
        context: {
          workingDirectory: request.context.workingDirectory,
          autonomous: request.context.autonomous,
          planMode: request.context.planMode,
          userId: request.context.userId,
        },
      },
      metadata: sanitizedRequest.metadata,
    }

    this.addLogEntry(logEntry)

    if (this.shouldLogToConsole('info')) {
      console.log(chalk.blue(`📝 [${request.id.slice(0, 8)}] ${request.operation}`))
    }
  }

  private logResponse(request: MiddlewareRequest, response: MiddlewareResponse, duration: number): void {
    const sanitizedResponse = this.loggingConfig.sanitizeData ? this.sanitizeResponse(response) : response

    const logEntry: LogEntry = {
      timestamp: new Date(),
      requestId: request.id,
      operation: request.operation,
      type: 'response',
      duration,
      success: response.success,
      data: this.loggingConfig.includeResponse ? sanitizedResponse.data : '[OMITTED]',
      metadata: {
        ...sanitizedResponse.metadata,
        responseSize: JSON.stringify(response.data || {}).length,
      },
    }

    this.addLogEntry(logEntry)

    if (this.shouldLogToConsole('info')) {
      const statusIcon = response.success ? '✓' : '❌'
      const durationColor = duration > 1000 ? chalk.yellow : chalk.green
      console.log(
        `${statusIcon} [${request.id.slice(0, 8)}] ${request.operation} ` + `${durationColor(`${duration}ms`)}`
      )
    }
  }

  private logError(request: MiddlewareRequest, error: Error, duration: number): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      requestId: request.id,
      operation: request.operation,
      type: 'error',
      duration,
      success: false,
      error: error.message,
      metadata: {
        errorName: error.name,
        stackTrace: error.stack,
      },
    }

    this.addLogEntry(logEntry)

    if (this.shouldLogToConsole('error')) {
      console.log(
        chalk.red(`❌ [${request.id.slice(0, 8)}] ${request.operation} `) + chalk.red(`FAILED: ${error.message}`)
      )
    }
  }

  private logPerformance(request: MiddlewareRequest, duration: number, success: boolean): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      requestId: request.id,
      operation: request.operation,
      type: 'performance',
      duration,
      success,
      metadata: {
        performanceCategory: this.categorizePerformance(duration),
        requestType: request.type,
      },
    }

    this.addLogEntry(logEntry)

    // Log slow operations
    if (duration > 5000 && this.shouldLogToConsole('warn')) {
      console.log(
        `${chalk.yellow(`⚠️ [${request.id.slice(0, 8)}] SLOW OPERATION: `)}${request.operation} took ${duration}ms`
      )
    }
  }

  private categorizePerformance(duration: number): string {
    if (duration < 100) return 'fast'
    if (duration < 1000) return 'normal'
    if (duration < 5000) return 'slow'
    return 'very_slow'
  }

  private sanitizeRequest(request: MiddlewareRequest): MiddlewareRequest {
    return {
      ...request,
      context: ContextSanitizer.sanitizeForLogging(request.context),
      args: this.sanitizeArgs(request.args),
      metadata: this.sanitizeMetadata(request.metadata),
    }
  }

  private sanitizeResponse(response: MiddlewareResponse): MiddlewareResponse {
    return {
      ...response,
      data: this.sanitizeData(response.data),
      metadata: response.metadata ? this.sanitizeMetadata(response.metadata) : undefined,
    }
  }

  private sanitizeArgs(args: any[]): any[] {
    return args.map((arg) => this.sanitizeData(arg))
  }

  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {}

    for (const [key, value] of Object.entries(metadata)) {
      sanitized[key] = this.sanitizeData(value)
    }

    return sanitized
  }

  private sanitizeData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return this.sanitizeString(String(data))
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeData(item))
    }

    const sanitized: any = {}
    const sensitiveKeys = [
      'password',
      'token',
      'key',
      'secret',
      'credential',
      'auth',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GOOGLE_GENERATIVE_AI_API_KEY',
    ]

    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()))) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeData(value)
      } else {
        sanitized[key] = this.sanitizeString(String(value))
      }
    }

    return sanitized
  }

  private sanitizeString(str: string): string {
    const patterns = [
      { pattern: /([A-Za-z0-9+/]{40,}={0,2})/g, replacement: '[API_KEY]' },
      { pattern: /(sk-[A-Za-z0-9]{20,})/g, replacement: '[SECRET_KEY]' },
      { pattern: /(ghp_[A-Za-z0-9]{36})/g, replacement: '[GITHUB_TOKEN]' },
      { pattern: /([A-Fa-f0-9]{32})/g, replacement: '[HASH_32]' },
      { pattern: /([A-Fa-f0-9]{40})/g, replacement: '[HASH_40]' },
    ]

    let sanitized = str
    patterns.forEach(({ pattern, replacement }) => {
      sanitized = sanitized.replace(pattern, replacement)
    })

    return sanitized
  }

  private addLogEntry(entry: LogEntry): void {
    this.logBuffer.push(entry)

    // Also log to console structuredLogger if appropriate
    if (this.shouldLogToSystemLogger(entry)) {
      const logData = {
        requestId: entry.requestId,
        operation: entry.operation,
        type: entry.type,
        duration: entry.duration,
        success: entry.success,
        ...entry.metadata,
      }

      switch (entry.type) {
        case 'error':
          structuredLogger.error(entry.error || 'Unknown error', JSON.stringify(logData))
          break
        case 'request':
          structuredLogger.info(`Request: ${entry.operation}`, JSON.stringify(logData))
          break
        case 'response':
          structuredLogger.info(`Response: ${entry.operation}`, JSON.stringify(logData))
          break
        case 'performance':
          if (entry.duration && entry.duration > 1000) {
            structuredLogger.warning(`Performance: ${entry.operation}`, JSON.stringify(logData))
          }
          break
      }
    }
  }

  private shouldLogToConsole(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error']
    const currentIndex = levels.indexOf(this.loggingConfig.logLevel)
    const requestedIndex = levels.indexOf(level)
    return requestedIndex >= currentIndex
  }

  private shouldLogToSystemLogger(entry: LogEntry): boolean {
    switch (entry.type) {
      case 'error':
        return this.shouldLogToConsole('error')
      case 'request':
      case 'response':
        return this.shouldLogToConsole('debug')
      case 'performance':
        return this.shouldLogToConsole('info')
      default:
        return this.shouldLogToConsole('info')
    }
  }

  private setupBufferFlushing(): void {
    this.flushTimer = setInterval(async () => {
      await this.flushLogs()
    }, this.bufferFlushInterval)

    // Flush on process exit
    process.on('SIGINT', () => this.flushLogs())
    process.on('SIGTERM', () => this.flushLogs())
    process.on('exit', () => this.flushLogs())
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      const logDir = path.dirname(this.loggingConfig.logFile)
      await fs.mkdir(logDir, { recursive: true })
    } catch (_error) {
      // Directory might already exist
    }
  }

  private async flushLogs(): Promise<void> {
    if (!this.loggingConfig.logToFile || this.logBuffer.length === 0) {
      return
    }

    try {
      const entries = this.logBuffer.splice(0) // Clear buffer and get entries
      const logLines = `${entries.map((entry) => JSON.stringify(entry)).join('\\n')}\\n`

      await this.rotateLogFileIfNeeded()
      await fs.appendFile(this.loggingConfig.logFile, logLines, 'utf8')
    } catch (error) {
      console.error(chalk.red('Failed to flush logs to file:'), error)
    }
  }

  private async rotateLogFileIfNeeded(): Promise<void> {
    if (!this.loggingConfig.rotateFiles) return

    try {
      const stats = await fs.stat(this.loggingConfig.logFile)
      if (stats.size < this.loggingConfig.maxFileSize) return

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const rotatedFile = this.loggingConfig.logFile.replace('.log', `-${timestamp}.log`)

      await fs.rename(this.loggingConfig.logFile, rotatedFile)

      console.log(chalk.yellow(`📦 Rotated log file to ${rotatedFile}`))
    } catch (_error) {
      // File might not exist yet
    }
  }

  async getLogEntries(
    limit: number = 100,
    filter?: {
      type?: 'request' | 'response' | 'error' | 'performance'
      operation?: string
      success?: boolean
      since?: Date
    }
  ): Promise<LogEntry[]> {
    let entries = [...this.logBuffer]

    if (this.loggingConfig.logToFile) {
      try {
        const logContent = await fs.readFile(this.loggingConfig.logFile, 'utf8')
        const fileEntries = logContent
          .split('\\n')
          .filter((line) => line.trim())
          .map((line) => {
            try {
              return JSON.parse(line) as LogEntry
            } catch {
              return null
            }
          })
          .filter((entry): entry is LogEntry => entry !== null)

        entries = [...fileEntries, ...entries]
      } catch (_error) {
        // Log file might not exist yet
      }
    }

    if (filter) {
      entries = entries.filter((entry) => {
        if (filter.type && entry.type !== filter.type) return false
        if (filter.operation && !entry.operation.includes(filter.operation)) return false
        if (filter.success !== undefined && entry.success !== filter.success) return false
        if (filter.since && new Date(entry.timestamp) < filter.since) return false
        return true
      })
    }

    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit)
  }

  async clearLogs(): Promise<void> {
    this.logBuffer.length = 0

    if (this.loggingConfig.logToFile) {
      try {
        await fs.unlink(this.loggingConfig.logFile)
      } catch (_error) {
        // File might not exist
      }
    }
  }

  getStatistics(): {
    totalEntries: number
    requestCount: number
    errorCount: number
    averageResponseTime: number
    errorRate: number
  } {
    const entries = this.logBuffer
    const responses = entries.filter((e) => e.type === 'response' || e.type === 'error')
    const errors = entries.filter((e) => e.type === 'error')

    const totalDuration = responses.reduce((sum, entry) => sum + (entry.duration || 0), 0)
    const avgResponseTime = responses.length > 0 ? totalDuration / responses.length : 0

    return {
      totalEntries: entries.length,
      requestCount: responses.length,
      errorCount: errors.length,
      averageResponseTime: Math.round(avgResponseTime),
      errorRate: responses.length > 0 ? errors.length / responses.length : 0,
    }
  }

  updateLoggingConfig(config: Partial<LoggingMiddlewareConfig>): void {
    this.loggingConfig = { ...this.loggingConfig, ...config }
    this.updateConfig(this.loggingConfig)
  }

  getLoggingConfig(): LoggingMiddlewareConfig {
    return { ...this.loggingConfig }
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }
    this.flushLogs()
  }
}
