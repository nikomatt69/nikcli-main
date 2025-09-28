export * from './audit-middleware'
export * from './logging-middleware'
export * from './middleware-context'
export * from './middleware-manager'
export * from './performance-middleware'
export * from './security-middleware'
export * from './types'
export * from './validation-middleware'

import { AuditMiddleware } from './audit-middleware'
import { LoggingMiddleware } from './logging-middleware'
import { middlewareManager } from './middleware-manager'
import { PerformanceMiddleware } from './performance-middleware'
import { SecurityMiddleware } from './security-middleware'
import { ValidationMiddleware } from './validation-middleware'

export class MiddlewareBootstrap {
  static async initialize(policyManager?: any): Promise<void> {
    console.log('🔧 Initializing middleware system...')

    // Register middleware in order of priority (highest to lowest)

    // Security (Priority: 1000)
    if (policyManager) {
      const securityMiddleware = new SecurityMiddleware(policyManager, {
        enabled: true,
        priority: 1000,
        strictMode: false,
        requireApproval: true,
      })
      middlewareManager.register(securityMiddleware)
    }

    // Logging (Priority: 900)
    const loggingMiddleware = new LoggingMiddleware({
      enabled: true,
      priority: 900,
      logLevel: 'info',
      logToFile: true,
      sanitizeData: true,
    })
    middlewareManager.register(loggingMiddleware)

    // Validation (Priority: 800)
    const validationMiddleware = new ValidationMiddleware({
      enabled: true,
      priority: 800,
      strictMode: false,
      validateArgs: true,
      validateContext: true,
    })
    middlewareManager.register(validationMiddleware)

    // Performance (Priority: 700)
    const performanceMiddleware = new PerformanceMiddleware({
      enabled: true,
      priority: 700,
      trackMemory: true,
      trackCpu: true,
      slowExecutionThreshold: 5000,
    })
    middlewareManager.register(performanceMiddleware)

    // Audit (Priority: 600)
    const auditMiddleware = new AuditMiddleware({
      enabled: true,
      priority: 600,
      auditLevel: 'standard',
      enableCompliance: true,
      enableIntegrityChecks: true,
    })
    middlewareManager.register(auditMiddleware)

    console.log('✓ Middleware system initialized with 5 middleware components')
  }

  static getMiddlewareManager() {
    return middlewareManager
  }

  static async shutdown(): Promise<void> {
    console.log('⚡︎ Shutting down middleware system...')

    // Cleanup resources
    const loggingMiddleware = middlewareManager.getMiddleware('logging') as LoggingMiddleware
    if (loggingMiddleware && typeof loggingMiddleware.destroy === 'function') {
      loggingMiddleware.destroy()
    }

    const auditMiddleware = middlewareManager.getMiddleware('audit') as AuditMiddleware
    if (auditMiddleware && typeof auditMiddleware.destroy === 'function') {
      auditMiddleware.destroy()
    }

    middlewareManager.clearMetrics()

    console.log('✓ Middleware system shutdown complete')
  }
}

export { middlewareManager }
