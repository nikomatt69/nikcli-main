// src/cli/background-agents/api/setup-mobile.ts
// Integration file to add mobile support to BackgroundAgentsAPIServer

import type { Application } from 'express'
import type { Server as HTTPServer } from 'node:http'
import { setupMobileIntegration } from './mobile'
import type { MobileIntegration } from './mobile'

/**
 * Setup mobile integration in BackgroundAgentsAPIServer
 * Call this in the server's start() method
 */
export async function setupMobileAPI(
  app: Application,
  server: HTTPServer,
): Promise<MobileIntegration> {
  // Get JWT secret from environment or generate one
  const jwtSecret = process.env.JWT_SECRET || process.env.MOBILE_JWT_SECRET

  if (!jwtSecret) {
    console.warn('[Mobile API] WARNING: No JWT_SECRET environment variable found.')
    console.warn('[Mobile API] Using generated secret - NOT RECOMMENDED for production!')
    console.warn('[Mobile API] Set JWT_SECRET in your environment variables.')
  }

  const finalSecret = jwtSecret || generateJWTSecret()

  console.log('[Mobile API] Initializing mobile integration...')

  const mobileIntegration = await setupMobileIntegration(app, server, {
    jwtSecret: finalSecret,
    enableAuth: true,
    enableCompression: true,
    compressionThreshold: 1024, // 1KB
  })

  console.log('[Mobile API] ✓ Mobile integration ready')
  console.log('[Mobile API] ✓ Endpoints: /api/mobile/*')
  console.log('[Mobile API] ✓ WebSocket: /mobile/ws')

  return mobileIntegration
}

/**
 * Generate a secure JWT secret (fallback only)
 */
function generateJWTSecret(): string {
  const crypto = require('node:crypto')
  return crypto.randomBytes(64).toString('hex')
}
