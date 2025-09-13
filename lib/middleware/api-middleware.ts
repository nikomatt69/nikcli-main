// lib/middleware/api-middleware.ts

import { NextRequest, NextResponse } from 'next/server'
import { APP_CONFIG, RATE_LIMIT_CONFIG } from '@/lib/config/environment'

// In-memory store for rate limiting (in production, use Redis/KV)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

/**
 * Rate limiting middleware
 */
export async function rateLimit(request: NextRequest): Promise<NextResponse | null> {
  // Skip rate limiting in development
  if (APP_CONFIG.isDevelopment) {
    return null
  }

  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
  const now = Date.now()
  const _windowStart = now - RATE_LIMIT_CONFIG.windowMs

  // Clean up expired entries
  for (const [key, data] of rateLimitStore.entries()) {
    if (data.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }

  // Get or create rate limit data for this IP
  const rateLimitData = rateLimitStore.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_CONFIG.windowMs }

  // Check if window has reset
  if (now > rateLimitData.resetTime) {
    rateLimitData.count = 0
    rateLimitData.resetTime = now + RATE_LIMIT_CONFIG.windowMs
  }

  rateLimitData.count++
  rateLimitStore.set(ip, rateLimitData)

  // Check if limit exceeded
  if (rateLimitData.count > RATE_LIMIT_CONFIG.max) {
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${RATE_LIMIT_CONFIG.max} requests per ${RATE_LIMIT_CONFIG.windowMs / 1000 / 60} minutes`,
        retryAfter: Math.ceil((rateLimitData.resetTime - now) / 1000),
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': RATE_LIMIT_CONFIG.max.toString(),
          'X-RateLimit-Remaining': Math.max(0, RATE_LIMIT_CONFIG.max - rateLimitData.count).toString(),
          'X-RateLimit-Reset': new Date(rateLimitData.resetTime).toISOString(),
          'Retry-After': Math.ceil((rateLimitData.resetTime - now) / 1000).toString(),
        },
      }
    )
  }

  return null // No rate limit applied
}

/**
 * Security headers middleware
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  // Basic security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Content Security Policy for API endpoints
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none';"
  )

  // HSTS in production
  if (APP_CONFIG.isProduction) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  return response
}

/**
 * CORS middleware
 */
export function addCORSHeaders(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get('origin')

  // Allow all origins in development, specific origins in production
  if (APP_CONFIG.isDevelopment) {
    response.headers.set('Access-Control-Allow-Origin', '*')
  } else {
    // In production, you might want to be more restrictive
    const allowedOrigins = [
      'https://nikcli-frontend.vercel.app',
      'https://nikcli-main.vercel.app',
      // Add your actual domains
    ]

    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin)
    }
  }

  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With')
  response.headers.set('Access-Control-Max-Age', '86400') // 24 hours

  return response
}

/**
 * Request logging middleware
 */
export function logRequest(request: NextRequest): void {
  if (APP_CONFIG.isDevelopment) {
    const timestamp = new Date().toISOString()
    const method = request.method
    const url = new URL(request.url)
    const path = url.pathname + url.search
    const userAgent = request.headers.get('user-agent') || 'Unknown'
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'

    console.log(`[${timestamp}] ${method} ${path} - ${ip} - ${userAgent}`)
  }
}

/**
 * Combined middleware for API routes
 */
export async function apiMiddleware(request: NextRequest): Promise<NextResponse | null> {
  // Log request
  logRequest(request)

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 200 })
    return addCORSHeaders(request, addSecurityHeaders(response))
  }

  // Apply rate limiting
  const rateLimitResponse = await rateLimit(request)
  if (rateLimitResponse) {
    return addCORSHeaders(request, addSecurityHeaders(rateLimitResponse))
  }

  return null // No middleware intervention needed
}

/**
 * Wrap response with standard middleware
 */
export function wrapAPIResponse(request: NextRequest, response: NextResponse): NextResponse {
  return addCORSHeaders(request, addSecurityHeaders(response))
}
