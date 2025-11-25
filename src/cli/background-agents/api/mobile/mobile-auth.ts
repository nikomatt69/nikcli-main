// src/cli/background-agents/api/mobile/mobile-auth.ts
// Mobile authentication and authorization system

import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import { nanoid } from 'nanoid'
import crypto from 'node:crypto'

export interface MobileAuthConfig {
  jwtSecret: string
  accessTokenTTL?: number // seconds
  refreshTokenTTL?: number // seconds
  enableDeviceFingerprinting?: boolean
}

export interface TokenPayload {
  userId: string
  deviceId: string
  deviceInfo?: {
    platform?: string
    model?: string
    appVersion?: string
  }
  permissions: string[]
  type: 'access' | 'refresh'
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string
    deviceId: string
    permissions: string[]
  }
}

/**
 * Mobile Authentication Manager
 */
export class MobileAuthManager {
  private config: Required<MobileAuthConfig>
  private refreshTokens: Map<string, RefreshTokenData> = new Map()
  private revokedTokens: Set<string> = new Set()

  constructor(config: MobileAuthConfig) {
    this.config = {
      jwtSecret: config.jwtSecret,
      accessTokenTTL: config.accessTokenTTL || 15 * 60, // 15 minutes
      refreshTokenTTL: config.refreshTokenTTL || 7 * 24 * 60 * 60, // 7 days
      enableDeviceFingerprinting: config.enableDeviceFingerprinting ?? true,
    }

    // Cleanup expired tokens every hour
    setInterval(() => this.cleanupExpiredTokens(), 60 * 60 * 1000)
  }

  /**
   * Generate device fingerprint from request
   */
  generateDeviceFingerprint(req: Request): string {
    const components = [
      req.headers['user-agent'] || '',
      req.headers['accept-language'] || '',
      req.headers['accept-encoding'] || '',
      // Don't use IP as it may change on mobile networks
    ]

    const hash = crypto.createHash('sha256')
    hash.update(components.join('|'))
    return hash.digest('hex').substring(0, 16)
  }

  /**
   * Login and generate tokens
   */
  async login(
    userId: string,
    deviceInfo: any,
    req: Request,
  ): Promise<{
    accessToken: string
    refreshToken: string
    expiresIn: number
  }> {
    // Generate or retrieve device ID
    const deviceId = this.config.enableDeviceFingerprinting
      ? this.generateDeviceFingerprint(req)
      : nanoid()

    // Default permissions for mobile users
    const permissions = [
      'chat:send',
      'chat:read',
      'commands:execute',
      'files:read',
      'files:write',
      'agents:execute',
      'workspace:connect',
    ]

    // Generate access token
    const accessToken = this.generateAccessToken({
      userId,
      deviceId,
      deviceInfo,
      permissions,
    })

    // Generate refresh token
    const refreshToken = this.generateRefreshToken({
      userId,
      deviceId,
      deviceInfo,
      permissions,
    })

    // Store refresh token
    this.refreshTokens.set(refreshToken, {
      userId,
      deviceId,
      deviceInfo,
      permissions,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.refreshTokenTTL * 1000,
    })

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.accessTokenTTL,
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refresh(refreshToken: string): Promise<{
    accessToken: string
    refreshToken: string
    expiresIn: number
  }> {
    // Check if token is revoked
    if (this.revokedTokens.has(refreshToken)) {
      throw new Error('Refresh token has been revoked')
    }

    // Verify refresh token
    const payload = this.verifyToken(refreshToken)
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type')
    }

    // Check if refresh token exists
    const tokenData = this.refreshTokens.get(refreshToken)
    if (!tokenData) {
      throw new Error('Refresh token not found')
    }

    // Check if expired
    if (Date.now() > tokenData.expiresAt) {
      this.refreshTokens.delete(refreshToken)
      throw new Error('Refresh token expired')
    }

    // Generate new tokens
    const newAccessToken = this.generateAccessToken({
      userId: payload.userId,
      deviceId: payload.deviceId,
      deviceInfo: payload.deviceInfo,
      permissions: payload.permissions,
    })

    const newRefreshToken = this.generateRefreshToken({
      userId: payload.userId,
      deviceId: payload.deviceId,
      deviceInfo: payload.deviceInfo,
      permissions: payload.permissions,
    })

    // Delete old refresh token
    this.refreshTokens.delete(refreshToken)

    // Store new refresh token
    this.refreshTokens.set(newRefreshToken, {
      userId: payload.userId,
      deviceId: payload.deviceId,
      deviceInfo: payload.deviceInfo,
      permissions: payload.permissions,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.refreshTokenTTL * 1000,
    })

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.config.accessTokenTTL,
    }
  }

  /**
   * Logout and revoke tokens
   */
  async logout(refreshToken: string): Promise<void> {
    this.revokedTokens.add(refreshToken)
    this.refreshTokens.delete(refreshToken)
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): TokenPayload {
    const payload = this.verifyToken(token)
    if (payload.type !== 'access') {
      throw new Error('Invalid token type')
    }
    return payload
  }

  /**
   * Generate access token
   */
  private generateAccessToken(data: Omit<TokenPayload, 'type'>): string {
    const payload: TokenPayload = {
      ...data,
      type: 'access',
    }

    return jwt.sign(payload, this.config.jwtSecret, {
      expiresIn: this.config.accessTokenTTL,
      algorithm: 'HS256',
    })
  }

  /**
   * Generate refresh token
   */
  private generateRefreshToken(data: Omit<TokenPayload, 'type'>): string {
    const payload: TokenPayload = {
      ...data,
      type: 'refresh',
    }

    return jwt.sign(payload, this.config.jwtSecret, {
      expiresIn: this.config.refreshTokenTTL,
      algorithm: 'HS256',
    })
  }

  /**
   * Verify token (access or refresh)
   */
  private verifyToken(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret, {
        algorithms: ['HS256'],
      }) as TokenPayload

      return payload
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired')
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token')
      }
      throw error
    }
  }

  /**
   * Cleanup expired tokens
   */
  private cleanupExpiredTokens(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [token, data] of this.refreshTokens) {
      if (now > data.expiresAt) {
        this.refreshTokens.delete(token)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired refresh tokens`)
    }
  }

  /**
   * Express middleware for authentication
   */
  middleware() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'Missing or invalid Authorization header',
          })
        }

        const token = authHeader.substring(7) // Remove 'Bearer ' prefix

        // Verify token
        const payload = this.verifyAccessToken(token)

        // Attach user to request
        req.user = {
          userId: payload.userId,
          deviceId: payload.deviceId,
          permissions: payload.permissions,
        }

        next()
      } catch (error) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: error instanceof Error ? error.message : 'Authentication failed',
        })
      }
    }
  }

  /**
   * Permission check middleware
   */
  requirePermission(...permissions: string[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
        })
      }

      const hasPermission = permissions.every((perm) => req.user?.permissions.includes(perm))

      if (!hasPermission) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: `Missing required permissions: ${permissions.join(', ')}`,
        })
      }

      next()
    }
  }
}

interface RefreshTokenData {
  userId: string
  deviceId: string
  deviceInfo?: any
  permissions: string[]
  createdAt: number
  expiresAt: number
}

/**
 * Create authentication routes
 */
export function createAuthRoutes(authManager: MobileAuthManager) {
  const router = require('express').Router()

  /**
   * POST /auth/login
   * Login with user credentials (or create anonymous session)
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { userId, deviceInfo } = req.body

      // For MVP, allow anonymous sessions
      const finalUserId = userId || `anonymous_${nanoid()}`

      const tokens = await authManager.login(finalUserId, deviceInfo, req)

      res.json({
        success: true,
        userId: finalUserId,
        ...tokens,
      })
    } catch (error) {
      console.error('Error in /auth/login:', error)
      res.status(500).json({
        error: 'LOGIN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * POST /auth/refresh
   * Refresh access token
   */
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body

      if (!refreshToken) {
        return res.status(400).json({
          error: 'MISSING_TOKEN',
          message: 'refreshToken is required',
        })
      }

      const tokens = await authManager.refresh(refreshToken)

      res.json({
        success: true,
        ...tokens,
      })
    } catch (error) {
      console.error('Error in /auth/refresh:', error)
      res.status(401).json({
        error: 'REFRESH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * POST /auth/logout
   * Logout and revoke tokens
   */
  router.post('/logout', async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body

      if (refreshToken) {
        await authManager.logout(refreshToken)
      }

      res.json({
        success: true,
      })
    } catch (error) {
      console.error('Error in /auth/logout:', error)
      res.status(500).json({
        error: 'LOGOUT_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  return router
}
