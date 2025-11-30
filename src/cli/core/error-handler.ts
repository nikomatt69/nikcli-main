import chalk from 'chalk'
import type { MiddlewareContext } from '../middleware/types'
import { breadcrumbTracker, getSentryProvider } from '../monitoring'
import { ExecutionPolicyManager } from '../policies/execution-policy'
import { simpleConfigManager as configManager } from './config-manager'

export type ErrorCategory = 'user' | 'system' | 'network' | 'config' | 'agent' | 'ai'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export class CLIError extends Error {
  constructor(
    message: string,
    public code: string,
    public category: ErrorCategory,
    public recoverable: boolean = true,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'CLIError'
  }
}

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: Date
  context?: string
  error?: Error
  details?: Record<string, unknown>
}

class StructuredLogger {
  private static instance: StructuredLogger
  private logLevel: LogLevel = 'info'
  private entries: LogEntry[] = []
  private maxEntries = 1000

  static getInstance(): StructuredLogger {
    if (!StructuredLogger.instance) {
      StructuredLogger.instance = new StructuredLogger()
    }
    return StructuredLogger.instance
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal']
    return levels.indexOf(level) >= levels.indexOf(this.logLevel)
  }

  private addEntry(entry: LogEntry): void {
    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.shift()
    }
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString()
    const level = entry.level.toUpperCase().padEnd(5)
    const context = entry.context ? `[${entry.context}] ` : ''

    let message = `${timestamp} ${level} ${context}${entry.message}`

    if (entry.error) {
      message += `\n  Error: ${entry.error.message}`
      if (entry.error.stack) {
        message += `\n  Stack: ${entry.error.stack}`
      }
    }

    if (entry.details) {
      message += `\n  Details: ${JSON.stringify(entry.details, null, 2)}`
    }

    return message
  }

  private colorizeLevel(level: LogLevel, message: string): string {
    switch (level) {
      case 'debug':
        return chalk.gray(message)
      case 'info':
        return chalk.blue(message)
      case 'warn':
        return chalk.yellow(message)
      case 'error':
        return chalk.red(message)
      case 'fatal':
        return chalk.bgRed.white(message)
      default:
        return message
    }
  }

  debug(message: string, context?: string, details?: Record<string, unknown>): void {
    this.log('debug', message, context, undefined, details)
  }

  info(message: string, context?: string, details?: Record<string, unknown>): void {
    this.log('info', message, context, undefined, details)
  }

  warn(message: string, context?: string, details?: Record<string, unknown>): void {
    this.log('warn', message, context, undefined, details)
  }

  error(message: string, context?: string, error?: Error, details?: Record<string, unknown>): void {
    this.log('error', message, context, error, details)
  }

  fatal(message: string, context?: string, error?: Error, details?: Record<string, unknown>): void {
    this.log('fatal', message, context, error, details)
  }

  private log(
    level: LogLevel,
    message: string,
    context?: string,
    error?: Error,
    details?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
      error,
      details,
    }

    this.addEntry(entry)

    const formattedMessage = this.formatMessage(entry)
    const colorizedMessage = this.colorizeLevel(level, formattedMessage)

    // Send to Sentry for errors and fatals
    const sentry = getSentryProvider()
    if (sentry && sentry.isInitialized() && (level === 'error' || level === 'fatal')) {
      if (error) {
        sentry.captureError(
          error as Error,
          {
            workingDirectory: process.cwd(),
            session: {
              id: crypto.randomUUID(),
              userId: 'unknown',
            },
            policyManager: new ExecutionPolicyManager(configManager),
            isProcessing: false,
          } as MiddlewareContext
        )
      } else {
        sentry.captureMessage(message as string, level === 'fatal' ? 'fatal' : 'error', {
          workingDirectory: process.cwd(),
          session: {
            id: crypto.randomUUID(),
            userId: 'unknown',
          },
          policyManager: new ExecutionPolicyManager(configManager),
          isProcessing: false,
        })
      }
    }

    // Output to appropriate stream
    if (level === 'error' || level === 'fatal') {
      console.error(colorizedMessage)
    } else {
      console.log(colorizedMessage)
    }
  }

  getRecentLogs(count: number = 50): LogEntry[] {
    return this.entries.slice(-count)
  }

  clear(): void {
    this.entries = []
  }
}

export class ErrorHandler {
  private static logger = StructuredLogger.getInstance()

  static handle(error: Error, context?: string): CLIError {
    const cliError = error instanceof CLIError ? error : new CLIError(error.message, 'UNKNOWN_ERROR', 'system', false)

    ErrorHandler.logger.error(cliError.message, context, cliError, {
      code: cliError.code,
      category: cliError.category,
      recoverable: cliError.recoverable,
      details: cliError.details,
    })

    const sentry = getSentryProvider()
    if (sentry && sentry.isInitialized()) {
      sentry.captureError(
        cliError as Error,
        {
          workingDirectory: process.cwd(),
          session: {
            id: crypto.randomUUID(),
            userId: 'unknown',
          },
          policyManager: new ExecutionPolicyManager(configManager),
          isProcessing: false,
        } as MiddlewareContext
      )

      breadcrumbTracker.trackOperation(`error.${cliError.category}`, {
        error_code: cliError.code,
        error_message: cliError.message,
        recoverable: cliError.recoverable,
      })
    }

    return cliError
  }

  static handleAsync<T>(operation: () => Promise<T>, context?: string, fallback?: T): Promise<T | undefined> {
    return operation().catch((error) => {
      ErrorHandler.handle(error, context)
      return fallback
    })
  }

  static wrapSync<T>(operation: () => T, context?: string, fallback?: T): T | undefined {
    try {
      return operation()
    } catch (error) {
      ErrorHandler.handle(error as Error, context)
      return fallback
    }
  }
}

// Export singleton instances
export const logger = StructuredLogger.getInstance()
export const errorHandler = ErrorHandler

// Utility function to replace console.log usage
export function logInfo(message: string, context?: string, details?: Record<string, unknown>): void {
  logger.info(message, context, details)
}

export function logError(message: string, context?: string, error?: Error): void {
  logger.error(message, context, error)
}

export function logWarn(message: string, context?: string, details?: Record<string, unknown>): void {
  logger.warn(message, context, details)
}

export function logDebug(message: string, context?: string, details?: Record<string, unknown>): void {
  logger.debug(message, context, details)
}
