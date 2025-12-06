import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import chalk from 'chalk'
import type { Logger as PinoLogger } from 'pino'
import pino from 'pino'
import type { LogEntry, LoggerConfig, LogLevel } from './logger'

/**
 * Enterprise Pino Logger Adapter
 * Drop-in replacement for custom Logger with Pino backend
 * Maintains 100% API compatibility while leveraging Pino's performance
 */
export class PinoLoggerAdapter {
  private static instance: PinoLoggerAdapter
  private config: LoggerConfig
  private logDir: string
  private auditDir: string
  private pinoLogger: PinoLogger
  private auditLogger: PinoLogger
  private childLoggers: Map<string, PinoLogger> = new Map()

  private readonly levelOrder = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4,
  }

  private constructor() {
    this.config = {
      level: 'info',
      enableConsole: true,
      enableFile: true,
      enableAudit: false,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      format: 'json',
    }

    this.logDir = path.join(os.homedir(), '.nikcli', 'logs')
    this.auditDir = path.join(os.homedir(), '.nikcli', 'audit')

    this.ensureDirectories()
    this.pinoLogger = this.createPinoLogger()
    this.auditLogger = this.createAuditLogger()
  }

  static getInstance(): PinoLoggerAdapter {
    if (!PinoLoggerAdapter.instance) {
      PinoLoggerAdapter.instance = new PinoLoggerAdapter()
    }
    return PinoLoggerAdapter.instance
  }

  /**
   * Create main Pino logger with enterprise configuration
   */
  private createPinoLogger(): PinoLogger {
    const isDev = process.env.NODE_ENV !== 'production'
    const logFile = path.join(this.logDir, 'cli.log')

    // Base Pino configuration
    const pinoConfig: pino.LoggerOptions = {
      level: this.config.level,
      formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) => ({
          pid: bindings.pid,
          hostname: bindings.hostname,
        }),
      },
      // Automatic field redaction for security
      redact: {
        paths: [
          '*.password',
          '*.token',
          '*.apiKey',
          '*.secret',
          '*.key',
          '*.credential',
          '*.auth',
          'context.ANTHROPIC_API_KEY',
          'context.OPENAI_API_KEY',
          'context.GOOGLE_GENERATIVE_AI_API_KEY',
          'ANTHROPIC_API_KEY',
          'OPENAI_API_KEY',
          'GOOGLE_GENERATIVE_AI_API_KEY',
        ],
        censor: '[REDACTED]',
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    }

    // Transport configuration for multiple destinations
    if (this.config.enableConsole || this.config.enableFile) {
      const targets: any[] = []

      // Console transport with pretty printing in dev
      if (this.config.enableConsole) {
        if (isDev) {
          targets.push({
            target: 'pino-pretty',
            level: this.config.level,
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
              singleLine: false,
              messageFormat: '{msg}',
            },
          })
        } else {
          targets.push({
            target: 'pino/file',
            level: this.config.level,
            options: {
              destination: 1, // stdout
            },
          })
        }
      }

      // File transport with automatic rotation
      if (this.config.enableFile) {
        targets.push({
          target: 'pino-roll',
          level: 'debug',
          options: {
            file: logFile,
            frequency: 'daily',
            size: this.config.maxFileSize,
            mkdir: true,
          },
        })
      }

      if (targets.length > 0) {
        return pino(
          pinoConfig,
          pino.transport({
            targets,
          })
        )
      }
    }

    return pino(pinoConfig)
  }

  /**
   * Create separate audit logger
   */
  private createAuditLogger(): PinoLogger {
    const auditFile = path.join(this.auditDir, 'audit.log')

    return pino(
      {
        level: 'info',
        formatters: {
          level: (label) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      pino.transport({
        targets: [
          {
            target: 'pino-roll',
            level: 'info',
            options: {
              file: auditFile,
              frequency: 'daily',
              size: this.config.maxFileSize,
              mkdir: true,
            },
          },
        ],
      })
    )
  }

  /**
   * Configure the logger
   */
  async configure(config: Partial<LoggerConfig>): Promise<void> {
    this.config = { ...this.config, ...config }

    if (config.logDir) {
      this.logDir = config.logDir
      this.auditDir = path.join(config.logDir, 'audit')
    }

    this.ensureDirectories()

    // Recreate loggers with new config
    this.pinoLogger = this.createPinoLogger()
    this.auditLogger = this.createAuditLogger()

    await this.info('Logger configured', { config: this.config })
  }

  /**
   * Enable/disable console output
   */
  setConsoleOutput(enabled: boolean): void {
    this.config.enableConsole = enabled
    this.pinoLogger = this.createPinoLogger()
  }

  /**
   * Log an error message
   */
  async error(message: string, context?: Record<string, any>, error?: Error): Promise<void> {
    await this.log('error', message, context, error)
  }

  /**
   * Log a warning message
   */
  async warn(message: string, context?: Record<string, any>): Promise<void> {
    await this.log('warn', message, context)
  }

  /**
   * Log an info message
   */
  async info(message: string, context?: Record<string, any>): Promise<void> {
    await this.log('info', message, context)
  }

  /**
   * Log a debug message
   */
  async debug(message: string, context?: Record<string, any>): Promise<void> {
    await this.log('debug', message, context)
  }

  /**
   * Log a trace message
   */
  async trace(message: string, context?: Record<string, any>): Promise<void> {
    await this.log('trace', message, context)
  }

  /**
   * Log an audit event (always logged regardless of level)
   */
  async audit(action: string, context: Record<string, any>): Promise<void> {
    const auditData = {
      action,
      ...context,
      auditEvent: true,
      timestamp: new Date().toISOString(),
    }

    // Log to audit logger
    this.auditLogger.info(auditData, `AUDIT: ${action}`)

    // Console output if enabled
    if (this.config.enableConsole) {
      console.log(chalk.magenta('🔍 AUDIT:'), chalk.yellow(action), context)
    }
  }

  /**
   * Log with agent context using child logger
   */
  async logAgent(level: LogLevel, agentId: string, message: string, context?: Record<string, any>): Promise<void> {
    const childLogger = this.getChildLogger({ agentId })
    await this.logWithLogger(childLogger, level, message, { ...context, agentId })
  }

  /**
   * Log with task context using child logger
   */
  async logTask(
    level: LogLevel,
    taskId: string,
    agentId: string,
    message: string,
    context?: Record<string, any>
  ): Promise<void> {
    const childLogger = this.getChildLogger({ agentId, taskId })
    await this.logWithLogger(childLogger, level, message, { ...context, taskId, agentId })
  }

  /**
   * Log with session context using child logger
   */
  async logSession(level: LogLevel, sessionId: string, message: string, context?: Record<string, any>): Promise<void> {
    const childLogger = this.getChildLogger({ sessionId })
    await this.logWithLogger(childLogger, level, message, { ...context, sessionId })
  }

  /**
   * Get or create child logger with bindings
   */
  private getChildLogger(bindings: Record<string, string>): PinoLogger {
    const key = JSON.stringify(bindings)

    if (!this.childLoggers.has(key)) {
      this.childLoggers.set(key, this.pinoLogger.child(bindings))
    }

    return this.childLoggers.get(key)!
  }

  /**
   * Core logging method
   */
  private async log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): Promise<void> {
    // Check if this level should be logged
    if (this.levelOrder[level] > this.levelOrder[this.config.level]) {
      return
    }

    await this.logWithLogger(this.pinoLogger, level, message, context, error)
  }

  /**
   * Log with specific logger instance
   */
  private async logWithLogger(
    logger: PinoLogger,
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error
  ): Promise<void> {
    const logData: Record<string, any> = {
      ...context,
    }

    if (error) {
      logData.error = {
        message: error.message,
        name: error.name,
        stack: error.stack,
      }
    }

    // Use Pino's native logging methods
    logger[level](logData, message)

    // Console output with colors (for backward compatibility)
    if (this.config.enableConsole && this.shouldLogToConsole(level)) {
      this.logToConsole(level, message, context, error)
    }
  }

  /**
   * Output log entry to console with colors (backward compatible)
   */
  private logToConsole(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    const timestamp = new Date().toLocaleTimeString()
    const levelStr = level.toUpperCase().padEnd(5)

    let colorFunc: (str: string) => string
    let icon: string

    switch (level) {
      case 'error':
        colorFunc = chalk.red
        icon = '✖'
        break
      case 'warn':
        colorFunc = chalk.yellow
        icon = '⚠︎'
        break
      case 'info':
        colorFunc = chalk.cyan
        icon = 'ℹ️'
        break
      case 'debug':
        colorFunc = chalk.gray
        icon = '🐛'
        break
      case 'trace':
        colorFunc = chalk.dim
        icon = '🔍'
        break
    }

    console.log(`${chalk.gray(timestamp)} ${icon} ${colorFunc(levelStr)} ${message}`)

    if (context && Object.keys(context).length > 0) {
      console.log(chalk.gray('  Context:'), context)
    }

    if (error) {
      console.log(chalk.red('  Error:'), error.message)
      if (level === 'debug' || level === 'trace') {
        console.log(chalk.gray(error.stack))
      }
    }
  }

  /**
   * Check if level should be logged to console
   */
  private shouldLogToConsole(level: LogLevel): boolean {
    const levels = ['error', 'warn', 'info', 'debug', 'trace']
    const currentIndex = levels.indexOf(this.config.level)
    const requestedIndex = levels.indexOf(level)
    return requestedIndex <= currentIndex
  }

  /**
   * Ensure log directories exist
   */
  private ensureDirectories(): void {
    if (!await fileExists(this.logDir)) {
      await mkdirp(this.logDir)
    }

    if (!await fileExists(this.auditDir)) {
      await mkdirp(this.auditDir)
    }
  }

  /**
   * Get logger statistics
   */
  getStats(): {
    bufferedLogs: number
    bufferedAudits: number
    currentLogFile?: string
    currentAuditFile?: string
    config: LoggerConfig
  } {
    return {
      bufferedLogs: 0, // Pino handles buffering internally
      bufferedAudits: 0,
      currentLogFile: path.join(this.logDir, 'cli.log'),
      currentAuditFile: path.join(this.auditDir, 'audit.log'),
      config: { ...this.config },
    }
  }

  /**
   * Force flush all buffers
   */
  async flush(): Promise<void> {
    // Pino flushes automatically, but we can force it
    await new Promise((resolve) => {
      this.pinoLogger.flush(() => {
        this.auditLogger.flush(() => {
          resolve(undefined)
        })
      })
    })
  }

  /**
   * Cleanup and shutdown logger
   */
  async shutdown(): Promise<void> {
    await this.flush()

    // Clear child loggers
    this.childLoggers.clear()
  }
}

/**
 * Convenience functions for common logging patterns
 */
export const pinoLogger = PinoLoggerAdapter.getInstance()

export const logAgent = (level: LogLevel, agentId: string, message: string, context?: Record<string, any>) =>
  pinoLogger.logAgent(level, agentId, message, context)

export const logTask = (
  level: LogLevel,
  taskId: string,
  agentId: string,
  message: string,
  context?: Record<string, any>
) => pinoLogger.logTask(level, taskId, agentId, message, context)

export const logSession = (level: LogLevel, sessionId: string, message: string, context?: Record<string, any>) =>
  pinoLogger.logSession(level, sessionId, message, context)

export const audit = (action: string, context: Record<string, any>) => pinoLogger.audit(action, context)
