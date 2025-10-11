// JWT Authentication for Background Agents API
// Provides optional authentication for CLI users

import type { NextFunction, Request, Response } from 'express'
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken'

export interface JWTPayload {
  userId: string
  email?: string
  tier?: 'free' | 'pro' | 'enterprise'
  iat: number
  exp: number
}

export interface AuthConfig {
  enabled: boolean
  jwtSecret: Secret
  tokenExpiry?: SignOptions['expiresIn'] // e.g., '7d', 86400
  requireAuth: boolean // If true, all endpoints require auth
  publicEndpoints: string[] // Endpoints that don't require auth
}

/**
 * Default authentication configuration
 */
export const defaultAuthConfig: AuthConfig = {
  enabled: process.env.AUTH_ENABLED === 'true',
  jwtSecret: process.env.JWT_SECRET || 'nikcli-default-secret-change-in-production',
  tokenExpiry: normalizeExpiresIn(process.env.JWT_EXPIRY) ?? '7d',
  requireAuth: process.env.REQUIRE_AUTH === 'true',
  publicEndpoints: [
    '/health',
    '/v1/stats', // Public stats
  ],
}

function normalizeExpiresIn(v?: string): SignOptions['expiresIn'] | undefined {
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : (v as unknown as SignOptions['expiresIn'])
}

/**
 * Generate JWT token for user
 */
export function generateToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  config: AuthConfig = defaultAuthConfig
): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.tokenExpiry,
  })
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string, config: AuthConfig = defaultAuthConfig): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload
    return decoded
  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

/**
 * Express middleware for JWT authentication
 */
export function authMiddleware(config: AuthConfig = defaultAuthConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if auth is disabled
    if (!config.enabled) {
      return next()
    }

    // Check if endpoint is public
    const isPublicEndpoint = config.publicEndpoints.some((endpoint) => req.path.startsWith(endpoint))

    if (isPublicEndpoint) {
      return next()
    }

    // Extract token from Authorization header
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (config.requireAuth) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Missing or invalid authorization token',
        })
      }
      // Optional auth - continue without user info
      return next()
    }

    const token = authHeader.slice(7) // Remove 'Bearer ' prefix

    // Verify token
    const payload = verifyToken(token, config)
    if (!payload) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      })
    }
    // Attach user info to request
    ;(req as any).user = payload

    next()
  }
}

/**
 * Express middleware for rate limiting per user
 */
export function userRateLimitMiddleware() {
  const userLimits = new Map<string, { count: number; resetAt: number }>()

  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as JWTPayload | undefined

    if (!user) {
      // No user, use IP-based rate limiting (handled by express-rate-limit)
      return next()
    }

    const now = Date.now()
    const windowMs = 15 * 60 * 1000 // 15 minutes

    // Get user's tier limits
    const tierLimits = {
      free: 50,
      pro: 200,
      enterprise: 1000,
    }

    const maxRequests = tierLimits[user.tier || 'free']

    // Get or create user's rate limit state
    let userState = userLimits.get(user.userId)

    if (!userState || now > userState.resetAt) {
      // Reset window
      userState = {
        count: 0,
        resetAt: now + windowMs,
      }
      userLimits.set(user.userId, userState)
    }

    // Increment count
    userState.count++

    // Check limit
    if (userState.count > maxRequests) {
      const resetIn = Math.ceil((userState.resetAt - now) / 1000)
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${resetIn} seconds.`,
        resetIn,
        tier: user.tier || 'free',
        limit: maxRequests,
      })
    }

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString())
    res.setHeader('X-RateLimit-Remaining', (maxRequests - userState.count).toString())
    res.setHeader('X-RateLimit-Reset', Math.ceil(userState.resetAt / 1000).toString())

    next()
  }
}

/**
 * Generate CLI authentication token
 * Used for internal CLI-to-server communication
 */
export function generateCliToken(cliVersion: string): string {
  const payload = {
    userId: `cli-${Date.now()}`,
    tier: 'free' as const,
    cliVersion,
  }

  return generateToken(payload)
}

/**
 * Middleware to extract and validate CLI version
 */
export function cliVersionMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const cliVersion = req.headers['x-cli-version'] as string | undefined

    if (cliVersion) {
      ;(req as any).cliVersion = cliVersion
    }

    next()
  }
}

/**
 * Check if user has required tier
 */
export function requireTier(minTier: 'free' | 'pro' | 'enterprise') {
  const tierLevels = {
    free: 0,
    pro: 1,
    enterprise: 2,
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as JWTPayload | undefined

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      })
    }

    const userTier = user.tier || 'free'

    if (tierLevels[userTier] < tierLevels[minTier]) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `This feature requires ${minTier} tier or higher`,
        currentTier: userTier,
        requiredTier: minTier,
      })
    }

    return next()
  }
}
