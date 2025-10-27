import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import chalk from 'chalk'

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace'

export interface LogEntry {
  timestamp: Date
  level: LogLevel
  message: string
  context?: Record<string, any>
  sessionId?: string
  agentId?: string
  taskId?: string
  userId?: string
  error?: Error
}

export interface LoggerConfig {
  level: LogLevel
  logDir?: string
  enableConsole?: boolean
  enableFile?: boolean
  enableAudit?: boolean
  maxFileSize?: number // bytes
  maxFiles?: number
  format?: 'json' | 'text'
}

/**
 * Enterprise Logger with structured logging, audit trails, and monitoring
 */
export class Logger {
  private static instance: Logger
  private config: LoggerConfig
  private logDir: string
  private auditDir: string
  private currentLogFile?: string
  private currentAuditFile?: string
  private logBuffer: LogEntry[] = []
  private auditBuffer: LogEntry[] = []
  private flushTimer?: NodeJS.Timeout

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
    this.setupPeriodicFlush()
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
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

    await this.info('Logger configured', { config: this.config })
  }

  /**
   * Enable/disable console output
   */
  setConsoleOutput(enabled: boolean): void {
    this.config.enableConsole = enabled
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
    const entry: LogEntry = {
      timestamp: new Date(),
      level: 'info',
      message: `AUDIT: ${action}`,
      context: {
        ...context,
        auditEvent: true,
        action,
      },
    }

    this.auditBuffer.push(entry)

    if (this.config.enableConsole) {
      console.log(chalk.magenta('🔍 AUDIT:'), chalk.yellow(action), context)
    }

    // Force flush audit events immediately for security
    await this.flushAuditBuffer()
  }

  /**
   * Log with agent context
   */
  async logAgent(level: LogLevel, agentId: string, message: string, context?: Record<string, any>): Promise<void> {
    await this.log(level, message, { ...context, agentId })
  }

  /**
   * Log with task context
   */
  async logTask(
    level: LogLevel,
    taskId: string,
    agentId: string,
    message: string,
    context?: Record<string, any>
  ): Promise<void> {
    await this.log(level, message, { ...context, taskId, agentId })
  }

  /**
   * Log with session context
   */
  async logSession(level: LogLevel, sessionId: string, message: string, context?: Record<string, any>): Promise<void> {
    await this.log(level, message, { ...context, sessionId })
  }

  /**
   * Core logging method
   */
  private async log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): Promise<void> {
    // Check if this level should be logged
    if (this.levelOrder[level] > this.levelOrder[this.config.level]) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
      error,
    }

    // Add to buffer
    this.logBuffer.push(entry)

    // Console output
    if (this.config.enableConsole) {
      this.logToConsole(entry)
    }

    // If buffer is getting full, flush immediately
    if (this.logBuffer.length > 100) {
      await this.flushLogBuffer()
    }
  }

  /**
   * Output log entry to console with colors
   */
  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toLocaleTimeString()
    const level = entry.level.toUpperCase().padEnd(5)

    let colorFunc: (str: string) => string
    let icon: string

    switch (entry.level) {
      case 'error':
        colorFunc = chalk.red
        icon = '❌'
        break
      case 'warn':
        colorFunc = chalk.yellow
        icon = '⚠️'
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

    console.log(`${chalk.gray(timestamp)} ${icon} ${colorFunc(level)} ${entry.message}`)

    if (entry.context && Object.keys(entry.context).length > 0) {
      console.log(chalk.gray('  Context:'), entry.context)
    }

    if (entry.error) {
      console.log(chalk.red('  Error:'), entry.error.message)
      if (entry.level === 'debug' || entry.level === 'trace') {
        console.log(chalk.gray(entry.error.stack))
      }
    }
  }

  /**
   * Ensure log directories exist
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }

    if (!fs.existsSync(this.auditDir)) {
      fs.mkdirSync(this.auditDir, { recursive: true })
    }
  }

  /**
   * Setup periodic buffer flushing
   */
  private setupPeriodicFlush(): void {
    this.flushTimer = setInterval(async () => {
      await this.flushLogBuffer()
      await this.flushAuditBuffer()
    }, 5000) // Flush every 5 seconds
  }

  /**
   * Flush log buffer to file
   */
  private async flushLogBuffer(): Promise<void> {
    if (this.logBuffer.length === 0 || !this.config.enableFile) {
      return
    }

    try {
      const logFile = await this.getCurrentLogFile()
      const logData = `${this.logBuffer.map((entry) => this.formatLogEntry(entry)).join('\n')}\n`

      fs.appendFileSync(logFile, logData)
      this.logBuffer = []

      // Rotate log files if needed
      await this.rotateLogFiles()
    } catch (error: any) {
      console.error('Failed to flush log buffer:', error.message)
    }
  }

  /**
   * Flush audit buffer to file
   */
  private async flushAuditBuffer(): Promise<void> {
    if (this.auditBuffer.length === 0 || !this.config.enableAudit) {
      return
    }

    try {
      const auditFile = await this.getCurrentAuditFile()
      const auditData = `${this.auditBuffer.map((entry) => this.formatLogEntry(entry)).join('\n')}\n`

      fs.appendFileSync(auditFile, auditData)
      this.auditBuffer = []
    } catch (error: any) {
      console.error('Failed to flush audit buffer:', error.message)
    }
  }

  /**
   * Get current log file path
   */
  private async getCurrentLogFile(): Promise<string> {
    if (!this.currentLogFile) {
      const date = new Date().toISOString().split('T')[0]
      this.currentLogFile = path.join(this.logDir, `cli-${date}.log`)
    }
    return this.currentLogFile
  }

  /**
   * Get current audit file path
   */
  private async getCurrentAuditFile(): Promise<string> {
    if (!this.currentAuditFile) {
      const date = new Date().toISOString().split('T')[0]
      this.currentAuditFile = path.join(this.auditDir, `audit-${date}.log`)
    }
    return this.currentAuditFile
  }

  /**
   * Format log entry for file output
   */
  private formatLogEntry(entry: LogEntry): string {
    if (this.config.format === 'json') {
      return JSON.stringify({
        timestamp: entry.timestamp.toISOString(),
        level: entry.level,
        message: entry.message,
        context: entry.context,
        sessionId: entry.sessionId,
        agentId: entry.agentId,
        taskId: entry.taskId,
        userId: entry.userId,
        error: entry.error
          ? {
              message: entry.error.message,
              stack: entry.error.stack,
              name: entry.error.name,
            }
          : undefined,
      })
    } else {
      const timestamp = entry.timestamp.toISOString()
      const level = entry.level.toUpperCase().padEnd(5)
      let line = `${timestamp} ${level} ${entry.message}`

      if (entry.context) {
        line += ` | Context: ${JSON.stringify(entry.context)}`
      }

      if (entry.error) {
        line += ` | Error: ${entry.error.message}`
      }

      return line
    }
  }

  /**
   * Rotate log files to prevent them from getting too large
   */
  private async rotateLogFiles(): Promise<void> {
    try {
      const logFile = await this.getCurrentLogFile()
      const stats = fs.statSync(logFile)

      if (stats.size > this.config.maxFileSize!) {
        // Rotate current log file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const rotatedFile = logFile.replace('.log', `-${timestamp}.log`)
        fs.renameSync(logFile, rotatedFile)

        // Reset current log file
        this.currentLogFile = undefined

        // Clean up old log files
        await this.cleanupOldLogFiles()
      }
    } catch (error: any) {
      console.error('Failed to rotate log files:', error.message)
    }
  }

  /**
   * Clean up old log files beyond retention limit
   */
  private async cleanupOldLogFiles(): Promise<void> {
    try {
      const files = fs
        .readdirSync(this.logDir)
        .filter((file) => file.startsWith('cli-') && file.endsWith('.log'))
        .map((file) => ({
          name: file,
          path: path.join(this.logDir, file),
          mtime: fs.statSync(path.join(this.logDir, file)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

      // Keep only the most recent files
      if (files.length > this.config.maxFiles!) {
        const filesToDelete = files.slice(this.config.maxFiles!)
        filesToDelete.forEach((file) => {
          fs.unlinkSync(file.path)
        })
      }
    } catch (error: any) {
      console.error('Failed to cleanup old log files:', error.message)
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
      bufferedLogs: this.logBuffer.length,
      bufferedAudits: this.auditBuffer.length,
      currentLogFile: this.currentLogFile,
      currentAuditFile: this.currentAuditFile,
      config: { ...this.config },
    }
  }

  /**
   * Force flush all buffers
   */
  async flush(): Promise<void> {
    await this.flushLogBuffer()
    await this.flushAuditBuffer()
  }

  /**
   * Cleanup and shutdown logger
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }

    await this.flush()
  }
}

/**
 * Convenience functions for common logging patterns
 */

// Feature flag to enable Pino logger (enterprise performance optimization)
// Default: ENABLED (use NIKCLI_PINO_LOGGER=false to disable)
const USE_PINO_LOGGER = process.env.NIKCLI_PINO_LOGGER !== 'false'

// Conditional logger initialization - drop-in replacement with zero breaking changes
function initializeLogger(): Logger {
  if (USE_PINO_LOGGER) {
    try {
      // Dynamic import for Pino adapter (now default)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PinoLoggerAdapter } = require('./pino-logger-adapter')
      return PinoLoggerAdapter.getInstance()
    } catch (error) {
      console.warn('⚠️  Failed to load Pino logger, falling back to custom logger:', error)
      return Logger.getInstance()
    }
  }
  return Logger.getInstance()
}

export const logger = initializeLogger()

export const logAgent = (level: LogLevel, agentId: string, message: string, context?: Record<string, any>) =>
  logger.logAgent(level, agentId, message, context)

export const logTask = (
  level: LogLevel,
  taskId: string,
  agentId: string,
  message: string,
  context?: Record<string, any>
) => logger.logTask(level, taskId, agentId, message, context)

export const logSession = (level: LogLevel, sessionId: string, message: string, context?: Record<string, any>) =>
  logger.logSession(level, sessionId, message, context)

export const audit = (action: string, context: Record<string, any>) => logger.audit(action, context)
