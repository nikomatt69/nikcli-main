// src/cli/background-agents/api/mobile/index.ts
// Mobile integration module for BackgroundAgentsAPIServer

import type { Application } from 'express'
import type { Server as HTTPServer } from 'node:http'
import { headlessMode } from '../../../modes/headless-mode'
import { createMobileRouter } from './mobile-routes'
import { MobileWebSocketAdapter } from './mobile-websocket-adapter'
import { MobileAuthManager, createAuthRoutes } from './mobile-auth'

export interface MobileIntegrationConfig {
  jwtSecret: string
  enableAuth?: boolean
  enableCompression?: boolean
  compressionThreshold?: number
}

/**
 * Mobile Integration for NikCLI API Server
 */
export class MobileIntegration {
  private authManager?: MobileAuthManager
  private wsAdapter?: MobileWebSocketAdapter
  private isInitialized = false

  constructor(private config: MobileIntegrationConfig) {}

  /**
   * Initialize mobile integration
   */
  async initialize(app: Application, server: HTTPServer): Promise<void> {
    if (this.isInitialized) {
      throw new Error('MobileIntegration already initialized')
    }

    console.log('📱 Initializing Mobile Integration...')

    // Initialize headless mode (if not already initialized)
    if (!headlessMode.listenerCount('initialized')) {
      // Headless mode will be initialized with NikCLI instance later
      // For now, just ensure it's ready
    }

    // Initialize authentication if enabled
    if (this.config.enableAuth !== false) {
      this.authManager = new MobileAuthManager({
        jwtSecret: this.config.jwtSecret,
        accessTokenTTL: 15 * 60, // 15 minutes
        refreshTokenTTL: 7 * 24 * 60 * 60, // 7 days
        enableDeviceFingerprinting: true,
      })

      // Setup auth routes
      const authRoutes = createAuthRoutes(this.authManager)
      app.use('/api/mobile/auth', authRoutes)

      console.log('📱 ✓ Mobile authentication enabled')
    }

    // Setup mobile routes
    const mobileRouter = createMobileRouter({
      maxMessageSize: 50000,
      streamTimeout: 30000,
      enableCompression: this.config.enableCompression,
    })

    // Apply authentication middleware to protected routes if enabled
    if (this.authManager) {
      app.use('/api/mobile', this.authManager.middleware())
    }

    app.use('/api/mobile', mobileRouter)

    // Initialize WebSocket adapter
    this.wsAdapter = new MobileWebSocketAdapter(server, {
      compressionThreshold: this.config.compressionThreshold || 1024,
      heartbeatInterval: 30000,
      maxMessageSize: 100 * 1024,
      enableCompression: this.config.enableCompression ?? true,
    })

    this.isInitialized = true

    console.log('📱 ✓ Mobile Integration initialized')
    console.log('📱 ✓ Mobile API available at /api/mobile/*')
    console.log('📱 ✓ Mobile WebSocket available at /mobile/ws')
  }

  /**
   * Shutdown mobile integration
   */
  async shutdown(): Promise<void> {
    if (this.wsAdapter) {
      await this.wsAdapter.shutdown()
    }

    if (headlessMode) {
      await headlessMode.shutdown()
    }

    this.isInitialized = false
    console.log('📱 Mobile Integration shutdown')
  }

  /**
   * Get authentication manager
   */
  getAuthManager(): MobileAuthManager | undefined {
    return this.authManager
  }

  /**
   * Get WebSocket adapter
   */
  getWSAdapter(): MobileWebSocketAdapter | undefined {
    return this.wsAdapter
  }
}

/**
 * Helper to setup mobile integration in existing server
 */
export async function setupMobileIntegration(
  app: Application,
  server: HTTPServer,
  config: MobileIntegrationConfig,
): Promise<MobileIntegration> {
  const integration = new MobileIntegration(config)
  await integration.initialize(app, server)
  return integration
}

// Export all mobile components
export { headlessMode } from '../../../modes/headless-mode'
export { createMobileRouter } from './mobile-routes'
export { MobileWebSocketAdapter } from './mobile-websocket-adapter'
export { MobileAuthManager, createAuthRoutes } from './mobile-auth'
export type { HeadlessCommand, HeadlessResponse, HeadlessMessage, ApprovalRequest } from '../../../modes/headless-mode'
export type { MobileWebSocketMessage } from './mobile-websocket-adapter'
export type { TokenPayload, AuthenticatedRequest } from './mobile-auth'
