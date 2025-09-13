/**
 * Error Types for NikCLI
 * Defines custom error types for better error handling and debugging
 */

// Base CLI Error
export class CLIError extends Error {
  public readonly code: string
  public readonly context?: Record<string, unknown>
  public readonly timestamp: Date

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message)
    this.name = 'CLIError'
    this.code = code
    this.context = context
    this.timestamp = new Date()

    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CLIError)
    }
  }
}

// Specific Error Types
export class ValidationError extends CLIError {
  constructor(message: string, field?: string, value?: unknown) {
    super(message, 'VALIDATION_ERROR', { field, value })
    this.name = 'ValidationError'
  }
}

export class ExecutionError extends CLIError {
  public readonly exitCode?: number
  public readonly command?: string

  constructor(message: string, command?: string, exitCode?: number, context?: Record<string, unknown>) {
    super(message, 'EXECUTION_ERROR', { ...context, command, exitCode })
    this.name = 'ExecutionError'
    this.command = command
    this.exitCode = exitCode
  }
}

export class ConfigurationError extends CLIError {
  constructor(message: string, configKey?: string, value?: unknown) {
    super(message, 'CONFIGURATION_ERROR', { configKey, value })
    this.name = 'ConfigurationError'
  }
}

export class NetworkError extends CLIError {
  public readonly statusCode?: number
  public readonly url?: string

  constructor(message: string, statusCode?: number, url?: string, context?: Record<string, unknown>) {
    super(message, 'NETWORK_ERROR', { ...context, statusCode, url })
    this.name = 'NetworkError'
    this.statusCode = statusCode
    this.url = url
  }
}

export class StreamingError extends CLIError {
  public readonly streamId?: string
  public readonly model?: string

  constructor(message: string, streamId?: string, model?: string, context?: Record<string, unknown>) {
    super(message, 'STREAMING_ERROR', { ...context, streamId, model })
    this.name = 'StreamingError'
    this.streamId = streamId
    this.model = model
  }
}

export class AgentError extends CLIError {
  public readonly agentId?: string
  public readonly taskId?: string

  constructor(message: string, agentId?: string, taskId?: string, context?: Record<string, unknown>) {
    super(message, 'AGENT_ERROR', { ...context, agentId, taskId })
    this.name = 'AgentError'
    this.agentId = agentId
    this.taskId = taskId
  }
}

// Error Handler Types
export interface ErrorHandler<T = unknown> {
  canHandle(error: Error): boolean
  handle(error: Error, context?: T): Promise<void> | void
  priority: number
}

export interface ErrorContext {
  operation: string
  timestamp: Date
  userId?: string
  sessionId?: string
  metadata?: Record<string, unknown>
}

// Error Recovery Types
export interface ErrorRecoveryStrategy {
  name: string
  canRecover(error: CLIError): boolean
  recover(error: CLIError, context: ErrorContext): Promise<boolean>
}

// Error Reporting Types
export interface ErrorReport {
  id: string
  error: CLIError
  context: ErrorContext
  stackTrace: string
  userAgent?: string
  systemInfo?: SystemInfo
  timestamp: Date
}

export interface SystemInfo {
  platform: string
  nodeVersion: string
  cliVersion: string
  workingDirectory: string
  memoryUsage: NodeJS.MemoryUsage
}

// Union type for all possible errors
export type AnyError =
  | CLIError
  | ValidationError
  | ExecutionError
  | ConfigurationError
  | NetworkError
  | StreamingError
  | AgentError
  | Error
