// lib/api/response-helpers.ts

import { NextResponse } from 'next/server'

export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: string
}

export interface PaginatedResponse<T = any> extends APIResponse<T[]> {
  pagination?: {
    total: number
    offset: number
    limit: number
    hasMore: boolean
  }
}

/**
 * Create a success response
 */
export function createSuccessResponse<T>(data: T, message?: string, status = 200): NextResponse<APIResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString(),
    },
    { status }
  )
}

/**
 * Create a paginated success response
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  offset: number,
  limit: number,
  message?: string
): NextResponse<PaginatedResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    message,
    pagination: {
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    },
    timestamp: new Date().toISOString(),
  })
}

/**
 * Create an error response
 */
export function createErrorResponse(error: string, status = 500, details?: any): NextResponse<APIResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      message: error,
      timestamp: new Date().toISOString(),
      ...(details && { details }),
    },
    { status }
  )
}

/**
 * Create a validation error response
 */
export function createValidationErrorResponse(
  errors: string[],
  message = 'Validation failed'
): NextResponse<APIResponse> {
  return NextResponse.json(
    {
      success: false,
      error: message,
      message,
      details: { validationErrors: errors },
      timestamp: new Date().toISOString(),
    },
    { status: 400 }
  )
}

/**
 * Create a not found error response
 */
export function createNotFoundResponse(resource: string, id?: string): NextResponse<APIResponse> {
  const message = id ? `${resource} with ID '${id}' not found` : `${resource} not found`

  return NextResponse.json(
    {
      success: false,
      error: 'Not Found',
      message,
      timestamp: new Date().toISOString(),
    },
    { status: 404 }
  )
}

/**
 * Create an unauthorized error response
 */
export function createUnauthorizedResponse(message = 'Unauthorized access'): NextResponse<APIResponse> {
  return NextResponse.json(
    {
      success: false,
      error: 'Unauthorized',
      message,
      timestamp: new Date().toISOString(),
    },
    { status: 401 }
  )
}

/**
 * Create a rate limit error response
 */
export function createRateLimitResponse(message = 'Rate limit exceeded'): NextResponse<APIResponse> {
  return NextResponse.json(
    {
      success: false,
      error: 'Rate Limit Exceeded',
      message,
      timestamp: new Date().toISOString(),
    },
    { status: 429 }
  )
}

/**
 * Handle API errors consistently
 */
export function handleAPIError(error: any): NextResponse<APIResponse> {
  console.error('API Error:', error)

  // Handle different error types
  if (error.name === 'ValidationError') {
    return createValidationErrorResponse(error.errors?.map((e: any) => e.message) || [error.message])
  }

  if (error.name === 'NotFoundError') {
    return createNotFoundResponse(error.resource || 'Resource', error.id)
  }

  if (error.name === 'UnauthorizedError') {
    return createUnauthorizedResponse(error.message)
  }

  // Default to internal server error
  const message =
    process.env.NODE_ENV === 'development' ? error.message || 'Internal server error' : 'Something went wrong'

  return createErrorResponse(message, 500, {
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  })
}

/**
 * Validate request body against schema
 */
export function validateRequestBody(body: any, requiredFields: string[]): string[] {
  const errors: string[] = []

  if (!body || typeof body !== 'object') {
    errors.push('Request body must be a valid JSON object')
    return errors
  }

  for (const field of requiredFields) {
    if (!(field in body) || body[field] === null || body[field] === undefined) {
      errors.push(`Missing required field: ${field}`)
    } else if (typeof body[field] === 'string' && body[field].trim() === '') {
      errors.push(`Field '${field}' cannot be empty`)
    }
  }

  return errors
}

/**
 * Parse pagination parameters from request
 */
export function parsePaginationParams(searchParams: URLSearchParams) {
  const limit = Math.min(
    parseInt(searchParams.get('limit') || '50', 10),
    100 // Max 100 items per page
  )

  const offset = Math.max(
    parseInt(searchParams.get('offset') || '0', 10),
    0 // No negative offsets
  )

  return { limit, offset }
}

/**
 * CORS helper for API routes
 */
export function setCORSHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-csrf-token')
  return response
}

/**
 * Handle OPTIONS request for CORS preflight
 */
export function handleCORSPreflight(): NextResponse {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-csrf-token',
    },
  })
}
