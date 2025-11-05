/**
 * Centralized Error Handler Middleware
 * Handles all errors in a consistent, production-ready way
 */

import type { Request, Response, NextFunction } from 'express'

/**
 * Custom error class with additional context
 */
export class APIError extends Error {
  statusCode: number
  isOperational: boolean
  context?: Record<string, any>

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, any>
  ) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.isOperational = isOperational
    this.context = context
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Specific error types
 */
export class ValidationError extends APIError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 400, true, context)
  }
}

export class AuthenticationError extends APIError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, true)
  }
}

export class AuthorizationError extends APIError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, true)
  }
}

export class NotFoundError extends APIError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`
    super(message, 404, true)
  }
}

export class ConflictError extends APIError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 409, true, context)
  }
}

export class RateLimitError extends APIError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, true)
  }
}

export class ExternalServiceError extends APIError {
  constructor(service: string, originalError?: Error) {
    super(`External service error: ${service}`, 502, true, {
      service,
      originalError: originalError?.message,
    })
  }
}

/**
 * Error response formatter
 */
interface ErrorResponse {
  success: false
  error: {
    message: string
    code?: string
    statusCode: number
    context?: Record<string, any>
    stack?: string
    requestId?: string
  }
}

/**
 * Format error for client response
 */
function formatErrorResponse(
  error: Error | APIError,
  requestId?: string,
  includeStack: boolean = false
): ErrorResponse {
  const isAPIError = error instanceof APIError
  const statusCode = isAPIError ? error.statusCode : 500
  const message = isAPIError && error.isOperational ? error.message : 'Internal server error'

  const response: ErrorResponse = {
    success: false,
    error: {
      message,
      code: error.name,
      statusCode,
      requestId,
    },
  }

  // Add context if available
  if (isAPIError && error.context) {
    response.error.context = error.context
  }

  // Include stack trace only in development
  if (includeStack && error.stack) {
    response.error.stack = error.stack
  }

  return response
}

/**
 * Log error with context
 */
function logError(error: Error | APIError, req: Request): void {
  const isAPIError = error instanceof APIError
  const isOperational = isAPIError && error.isOperational

  const logData = {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      statusCode: isAPIError ? error.statusCode : 500,
      isOperational,
    },
    request: {
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
      body: req.method !== 'GET' ? req.body : undefined,
      query: req.query,
      params: req.params,
    },
    context: isAPIError ? error.context : undefined,
  }

  // Use different log levels based on error type
  if (!isOperational) {
    console.error('[CRITICAL ERROR]', JSON.stringify(logData, null, 2))
  } else if (isAPIError && error.statusCode >= 500) {
    console.error('[SERVER ERROR]', JSON.stringify(logData, null, 2))
  } else if (isAPIError && error.statusCode >= 400) {
    console.warn('[CLIENT ERROR]', JSON.stringify(logData, null, 2))
  } else {
    console.log('[ERROR]', JSON.stringify(logData, null, 2))
  }
}

/**
 * Express error handler middleware
 */
export function errorHandler(
  error: Error | APIError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log the error
  logError(error, req)

  // Determine if we should include stack traces
  const isDevelopment = process.env.NODE_ENV === 'development'
  const includeStack = isDevelopment

  // Get request ID if available
  const requestId = (req as any).id || req.headers['x-request-id'] as string

  // Format error response
  const errorResponse = formatErrorResponse(error, requestId, includeStack)

  // Send response
  res.status(errorResponse.error.statusCode).json(errorResponse)

  // If error is not operational, we might want to restart the process
  // This is a production concern for critical non-recoverable errors
  if (error instanceof APIError && !error.isOperational) {
    console.error('[FATAL] Non-operational error occurred. Consider restarting the process.')
    // In production, you might want to:
    // process.exit(1)
    // Or send alert to monitoring service
  }
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler<T = any>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * Not found handler (404)
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  next(new NotFoundError('Route', req.originalUrl))
}

/**
 * Retry utility for transient errors
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  backoffMultiplier: number = 2
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      // Don't retry client errors (4xx)
      if (error instanceof APIError && error.statusCode >= 400 && error.statusCode < 500) {
        throw error
      }

      // Don't retry on last attempt
      if (attempt === maxRetries - 1) {
        break
      }

      // Calculate delay with exponential backoff
      const delay = delayMs * Math.pow(backoffMultiplier, attempt)
      console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${delay}ms...`)

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('Operation failed after retries')
}

/**
 * Timeout wrapper for operations
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new APIError(timeoutMessage, 408)), timeoutMs)
    ),
  ])
}
