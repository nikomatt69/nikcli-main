/**
 * NikCLI ACP Service - Integration with official Agent Client Protocol
 * Uses @zed-industries/agent-client-protocol package instead of custom implementation
 */

import { EventEmitter } from 'node:events'
import type { Readable, Writable } from 'node:stream'
import {
  type Agent,
  type AgentCapabilities,
  type AuthenticateRequest,
  type AuthMethod,
  type CancelNotification,
  type InitializeRequest,
  type InitializeResponse,
  type LoadSessionRequest,
  type NewSessionRequest,
  type NewSessionResponse,
  PROTOCOL_VERSION,
  type PromptRequest,
  type PromptResponse,
} from '@zed-industries/agent-client-protocol'
import type { ModelProvider } from '../ai/model-provider'
import type { CacheService } from '../services/cache-service'
import type { MemoryService } from '../services/memory-service'
import type { OrchestratorService } from '../services/orchestrator-service'
import type { ToolService } from '../services/tool-service'

export interface AcpServiceConfig {
  workingDirectory?: string
  debug?: boolean
  timeout?: number
  services?: {
    orchestrator?: new () => OrchestratorService
    toolService?: new () => ToolService
    modelProvider?: new () => ModelProvider
    memoryService?: new () => MemoryService
    cacheService?: new () => CacheService
    permissionService?: new () => SecurityPolicyViolationEvent
  }
}

export interface AcpServiceStats {
  uptime: number
  totalSessions: number
  activeSessions: number
  totalMessages: number
  totalToolExecutions: number
  errorCount: number
}

export class AcpService extends EventEmitter {
  private agent!: NikCLIAgent
  private config: Required<AcpServiceConfig>
  private startTime: Date
  private stats: AcpServiceStats
  private running = false

  constructor(config: AcpServiceConfig = {}) {
    super()

    this.config = {
      workingDirectory: config.workingDirectory || process.cwd(),
      debug: config.debug || false,
      timeout: config.timeout || 30000,
      services: config.services || {},
    }

    this.startTime = new Date()
    this.stats = {
      uptime: 0,
      totalSessions: 0,
      activeSessions: 0,
      totalMessages: 0,
      totalToolExecutions: 0,
      errorCount: 0,
    }

    this.setupComponents()
  }

  private setupComponents(): void {
    // Initialize NikCLI agent
    const agentConfig: NikCLIAgentConfig = {
      workingDirectory: this.config.workingDirectory,
      debug: this.config.debug,
      services: this.config.services,
      capabilities: this.getDefaultCapabilities(),
      authMethods: this.getDefaultAuthMethods(),
    }

    this.agent = new NikCLIAgent(agentConfig)
  }

  private getDefaultCapabilities(): AgentCapabilities {
    return {
      loadSession: true,
      promptCapabilities: {
        image: true,
        audio: false,
        embeddedContext: true,
      },
    }
  }

  private getDefaultAuthMethods(): AuthMethod[] {
    return [
      {
        id: 'api_key',
        name: 'API Key Authentication',
        description: 'Authenticate using NikCLI API keys',
      },
      {
        id: 'none',
        name: 'No Authentication',
        description: 'Skip authentication for development',
      },
    ]
  }

  // ====================== MAIN SERVICE INTERFACE ======================

  async start(input?: Readable, output?: Writable): Promise<void> {
    if (this.running) {
      throw new Error('ACP Service is already running')
    }

    try {
      this.log('Starting NikCLI ACP Service', {
        workingDirectory: this.config.workingDirectory,
        timeout: this.config.timeout,
      })

      // For Zed integration, we need to handle the connection properly
      // The ACP protocol expects the service to be ready for communication
      this.log('ACP Service initialized for Zed integration')

      // Set up proper signal handling for Zed
      this.setupZedSignalHandling()

      this.running = true
      this.log('NikCLI ACP Service started successfully - ready for Zed connection')
      this.emit('started')

      // Keep the service running for Zed
      this.keepAlive()
    } catch (error) {
      this.logError('Failed to start ACP Service', error)
      this.stats.errorCount++
      throw error
    }
  }

  private setupZedSignalHandling(): void {
    // Handle Zed-specific signals
    process.on('SIGTERM', () => {
      this.log('Received SIGTERM from Zed, shutting down gracefully')
      this.gracefulShutdown('SIGTERM')
    })

    process.on('SIGINT', () => {
      this.log('Received SIGINT from Zed, shutting down gracefully')
      this.gracefulShutdown('SIGINT')
    })

    // Handle process exit
    process.on('exit', (code) => {
      this.log(`Process exiting with code: ${code}`)
    })
  }

  private keepAlive(): void {
    // Keep the service running for Zed
    // This prevents the process from exiting immediately
    try {
      if ((this as any).keepAliveInterval) {
        this.log('Keep-alive interval already exists, skipping creation')
        return
      }

      const keepAliveInterval = setInterval(() => {
        try {
          if (!this.running) {
            this.log('Service stopped, clearing keep-alive interval')
            if ((this as any).keepAliveInterval) {
              clearInterval((this as any).keepAliveInterval)
              ;(this as any).keepAliveInterval = undefined
            }
            return
          }

          // Update stats
          this.stats.uptime = Date.now() - this.startTime.getTime()

          // Log heartbeat for debugging
          if (this.config.debug) {
            this.log('ACP Service heartbeat - waiting for Zed connection', {
              uptime: Math.floor(this.stats.uptime / 1000),
              activeSessions: this.stats.activeSessions,
              memoryUsage: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024)
            })
          }
        } catch (intervalError) {
          this.logError('Error in keep-alive interval', intervalError)
        }
      }, 30000) // Every 30 seconds

      // Store the interval for cleanup
      ;(this as any).keepAliveInterval = keepAliveInterval
      this.log('Keep-alive interval started')

    } catch (error) {
      this.logError('Failed to start keep-alive interval', error)
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return

    this.log('Stopping NikCLI ACP Service')

    let cleanupCompleted = false

    try {
      // Clean up keep alive interval
      if ((this as any).keepAliveInterval) {
        try {
          clearInterval((this as any).keepAliveInterval)
          ;(this as any).keepAliveInterval = undefined
          this.log('Keep-alive interval cleaned up')
        } catch (intervalError) {
          this.logError('Error cleaning up keep-alive interval', intervalError)
        }
      }

      // Shutdown agent with error handling
      try {
        await this.agent.shutdown()
        this.log('Agent shutdown completed')
      } catch (agentError) {
        this.logError('Error during agent shutdown', agentError)
        this.stats.errorCount++
      }

      // Clean up event listeners
      try {
        this.removeAllListeners()
        this.log('Event listeners cleaned up')
      } catch (listenerError) {
        this.logError('Error cleaning up event listeners', listenerError)
      }

      cleanupCompleted = true
      this.running = false
      this.log('NikCLI ACP Service stopped successfully')
      this.emit('stopped')

    } catch (error) {
      this.logError('Error stopping ACP Service', error)
      this.stats.errorCount++
      this.running = false

      // Ensure we still emit stopped event even on error
      try {
        this.emit('stopped')
      } catch (emitError) {
        // Silent fail for emit error
      }
    } finally {
      // Final cleanup that must always run
      try {
        if (!cleanupCompleted) {
          this.log('Performing emergency cleanup')

          // Emergency cleanup
          if ((this as any).keepAliveInterval) {
            clearInterval((this as any).keepAliveInterval)
            ;(this as any).keepAliveInterval = undefined
          }

          this.running = false
          this.removeAllListeners()
        }
      } catch (finalError) {
        // Last resort error handling
        console.error('Critical error in ACP Service final cleanup:', finalError)
      }
    }
  }

  // ====================== STATISTICS AND MONITORING ======================

  getStats(): AcpServiceStats {
    const now = new Date()
    this.stats.uptime = now.getTime() - this.startTime.getTime()
    return { ...this.stats }
  }

  getDetailedStats(): any {
    const stats = this.getStats()
    return {
      ...stats,
      memoryUsage: process.memoryUsage(),
      config: {
        workingDirectory: this.config.workingDirectory,
        timeout: this.config.timeout,
        debug: this.config.debug,
      },
    }
  }

  // ====================== SERVICE MANAGEMENT ======================

  isRunning(): boolean {
    return this.running
  }

  getWorkingDirectory(): string {
    return this.config.workingDirectory
  }

  updateServices(services: Partial<AcpServiceConfig['services']>): void {
    this.config.services = { ...this.config.services, ...services }
    this.log('Services updated', Object.keys(services || {}))
  }

  // ====================== UTILITIES ======================

  private log(message: string, data?: any): void {
    if (this.config.debug) {
      const timestamp = new Date().toISOString()
      console.log(`[${timestamp}] [NikCLI ACP Service] ${message}`, data || '')
    }
  }

  private logError(message: string, error: any): void {
    if (this.config.debug) {
      const timestamp = new Date().toISOString()
      console.error(`[${timestamp}] [NikCLI ACP Service] ERROR: ${message}`, error)
    }
  }

  // ====================== LIFECYCLE HANDLERS ======================

  async gracefulShutdown(signal: string): Promise<void> {
    this.log(`Received ${signal}, initiating graceful shutdown`)

    let shutdownCompleted = false
    const shutdownTimeout = setTimeout(() => {
      if (!shutdownCompleted) {
        this.log('Graceful shutdown timed out, forcing exit')
        console.error('ACP Service graceful shutdown timed out after 30 seconds')
        process.exit(1)
      }
    }, 30000) // 30 second timeout

    try {
      // Perform graceful stop
      await this.stop()

      shutdownCompleted = true
      clearTimeout(shutdownTimeout)

      this.log('Graceful shutdown completed successfully')

      // Final cleanup before exit
      try {
        this.removeAllListeners()
      } catch (cleanupError) {
        this.logError('Error during final cleanup', cleanupError)
      }

      process.exit(0)
    } catch (error) {
      shutdownCompleted = true
      clearTimeout(shutdownTimeout)

      this.logError('Error during graceful shutdown', error)
      this.stats.errorCount++

      // Attempt final cleanup even on error
      try {
        this.removeAllListeners()
        if ((this as any).keepAliveInterval) {
          clearInterval((this as any).keepAliveInterval)
          ;(this as any).keepAliveInterval = undefined
        }
      } catch (finalError) {
        console.error('Error during emergency final cleanup:', finalError)
      }

      process.exit(1)
    } finally {
      // Last resort cleanup
      try {
        clearTimeout(shutdownTimeout)
        if ((this as any).keepAliveInterval) {
          clearInterval((this as any).keepAliveInterval)
          ;(this as any).keepAliveInterval = undefined
        }
      } catch (finalError) {
        console.error('Critical error in shutdown finally block:', finalError)
      }
    }
  }
}

// ====================== NIKCLI AGENT IMPLEMENTATION ======================

interface NikCLIAgentConfig {
  workingDirectory: string
  capabilities?: AgentCapabilities
  authMethods?: AuthMethod[]
  services?: AcpServiceConfig['services']
  debug?: boolean
}

class NikCLIAgent implements Agent {
  private sessions: Map<string, SessionData> = new Map()
  private config: Required<NikCLIAgentConfig>

  constructor(config: NikCLIAgentConfig) {
    this.config = {
      workingDirectory: config.workingDirectory || process.cwd(),
      capabilities: config.capabilities || this.getDefaultCapabilities(),
      authMethods: config.authMethods || this.getDefaultAuthMethods(),
      services: config.services || {},
      debug: config.debug || false,
    }
  }

  private getDefaultCapabilities(): AgentCapabilities {
    return {
      loadSession: true,
      promptCapabilities: {
        image: true,
        audio: false,
        embeddedContext: true,
      },
    }
  }

  private getDefaultAuthMethods(): AuthMethod[] {
    return [
      {
        id: 'api_key',
        name: 'API Key Authentication',
        description: 'Authenticate using API keys for AI services',
      },
      {
        id: 'none',
        name: 'No Authentication',
        description: 'Skip authentication (for local development)',
      },
    ]
  }

  // ====================== AGENT INTERFACE IMPLEMENTATION ======================

  async initialize(request: InitializeRequest): Promise<InitializeResponse> {
    try {
      this.log('Initialize request received', { clientCapabilities: request.clientCapabilities })

      // Validate protocol version compatibility
      if (request.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error(`Unsupported protocol version: ${request.protocolVersion}`)
      }

      const response: InitializeResponse = {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: this.config.capabilities,
        authMethods: this.config.authMethods,
      }

      this.log('Initialize response sent', response)
      return response
    } catch (error) {
      this.logError('Initialize failed', error)
      throw error
    }
  }

  async authenticate(request: AuthenticateRequest): Promise<void> {
    try {
      this.log('Authenticate request received', { methodId: request.methodId })

      // Handle different authentication methods
      switch (request.methodId) {
        case 'api_key':
          await this.authenticateApiKey()
          break
        case 'none':
          // No authentication required
          break
        default:
          throw new Error(`Unknown authentication method: ${request.methodId}`)
      }

      this.log('Authentication successful')
    } catch (error) {
      this.logError('Authentication failed', error)
      throw error
    }
  }

  private async authenticateApiKey(): Promise<void> {
    try {
      // Check if NikCLI has valid API keys configured
      const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY
      const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY
      const hasGoogleKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
      const hasGatewayKey = !!process.env.AI_GATEWAY_API_KEY

      if (!hasAnthropicKey && !hasOpenAIKey && !hasOpenRouterKey && !hasGoogleKey && !hasGatewayKey) {
        throw new Error(
          'No valid API keys found. Please set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or AI_GATEWAY_API_KEY'
        )
      }

      // Validate API key format (basic validation)
      if (hasAnthropicKey && process.env.ANTHROPIC_API_KEY!.length < 10) {
        throw new Error('ANTHROPIC_API_KEY appears to be invalid (too short)')
      }

      if (hasOpenAIKey && process.env.OPENAI_API_KEY!.length < 10) {
        throw new Error('OPENAI_API_KEY appears to be invalid (too short)')
      }

      if (hasOpenRouterKey && process.env.OPENROUTER_API_KEY!.length < 10) {
        throw new Error('OPENROUTER_API_KEY appears to be invalid (too short)')
      }

      if (hasGoogleKey && process.env.GOOGLE_GENERATIVE_AI_API_KEY!.length < 10) {
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY appears to be invalid (too short)')
      }

      if (hasGatewayKey && process.env.AI_GATEWAY_API_KEY!.length < 10) {
        throw new Error('AI_GATEWAY_API_KEY appears to be invalid (too short)')
      }

      this.log('API key authentication successful', {
        hasAnthropicKey,
        hasOpenAIKey,
        hasOpenRouterKey,
        hasGoogleKey,
        hasGatewayKey
      })

    } catch (error) {
      this.logError('API key authentication failed', error)
      throw error
    }
  }

  async newSession(request: NewSessionRequest): Promise<NewSessionResponse> {
    try {
      this.log('New session request received', { cwd: request.cwd })

      // Create new session
      const sessionId = this.createSession(request.cwd)

      const response: NewSessionResponse = {
        sessionId,
      }

      this.log('New session created', response)
      return response
    } catch (error) {
      this.logError('New session failed', error)
      throw error
    }
  }

  async loadSession(request: LoadSessionRequest): Promise<void> {
    try {
      this.log('Load session request received', { sessionId: request.sessionId })

      // Check if session exists
      const session = this.sessions.get(request.sessionId)
      if (!session) {
        throw new Error(`Session not found: ${request.sessionId}`)
      }

      if (session.cancelled) {
        throw new Error(`Session cancelled: ${request.sessionId}`)
      }

      this.log('Session loaded successfully', { sessionId: request.sessionId })
    } catch (error) {
      this.logError('Load session failed', error)
      throw error
    }
  }

  async prompt(request: PromptRequest): Promise<PromptResponse> {
    try {
      this.log('Prompt request received', {
        sessionId: request.sessionId,
        promptBlocks: request.prompt.length,
      })

      // Validate session
      const session = this.sessions.get(request.sessionId)
      if (!session) {
        throw new Error(`Session not found: ${request.sessionId}`)
      }

      if (session.cancelled) {
        throw new Error(`Session cancelled: ${request.sessionId}`)
      }

      // Process the prompt using NikCLI's AI capabilities
      const stopReason = await this.processPrompt(request)

      const response: PromptResponse = {
        stopReason,
      }

      this.log('Prompt processing completed', response)
      return response
    } catch (error) {
      this.logError('Prompt processing failed', error)
      throw error
    }
  }

  async cancel(notification: CancelNotification): Promise<void> {
    try {
      this.log('Cancel notification received', { sessionId: notification.sessionId })

      const cancelled = this.cancelSession(notification.sessionId)
      if (!cancelled) {
        this.log('Session not found for cancellation', { sessionId: notification.sessionId })
        return
      }

      this.log('Session cancelled', { sessionId: notification.sessionId })
    } catch (error) {
      this.logError('Cancel failed', error)
    }
  }

  // ====================== SESSION MANAGEMENT ======================

  private createSession(cwd: string): string {
    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

      // Validate and normalize working directory
      let sessionCwd: string
      try {
        sessionCwd = this.isAbsolutePath(cwd) ? cwd : this.config.workingDirectory

        // Basic path validation
        if (!sessionCwd || sessionCwd.trim() === '') {
          sessionCwd = this.config.workingDirectory
        }

        // Ensure path exists or can be created
        const path = require('path')
        const fs = require('fs')

        if (!fs.existsSync(sessionCwd)) {
          this.log(`Session directory does not exist, using fallback: ${sessionCwd}`)
          sessionCwd = this.config.workingDirectory
        }
      } catch (pathError) {
        this.logError('Error validating session path', pathError)
        sessionCwd = this.config.workingDirectory
      }

      const session: SessionData = {
        id: sessionId,
        cwd: sessionCwd,
        createdAt: new Date(),
        lastActivity: new Date(),
        cancelled: false,
      }

      this.sessions.set(sessionId, session)

      // Update stats
      this.stats.totalSessions++
      this.stats.activeSessions++

      this.log('Session created successfully', {
        sessionId,
        cwd: sessionCwd,
        totalSessions: this.stats.totalSessions
      })

      return sessionId

    } catch (error) {
      this.logError('Failed to create session', error)
      throw new Error(`Session creation failed: ${error}`)
    }
  }

  private cancelSession(sessionId: string): boolean {
    try {
      const session = this.sessions.get(sessionId)
      if (session) {
        if (!session.cancelled) {
          session.cancelled = true
          session.lastActivity = new Date()

          // Update stats
          this.stats.activeSessions = Math.max(0, this.stats.activeSessions - 1)

          this.log('Session cancelled successfully', {
            sessionId,
            activeSessions: this.stats.activeSessions
          })

          // Emit session cancelled event
          this.emit('sessionCancelled', { sessionId, session })
        }

        return true
      }

      this.log('Session not found for cancellation', { sessionId })
      return false

    } catch (error) {
      this.logError('Error cancelling session', error)
      return false
    }
  }

  private isAbsolutePath(path: string): boolean {
    return path.startsWith('/') || /^[A-Za-z]:\\/.test(path)
  }

  // ====================== PROMPT PROCESSING ======================

  private async processPrompt(request: PromptRequest): Promise<'end_turn' | 'max_tokens' | 'refusal' | 'cancelled'> {
    try {
      const session = this.sessions.get(request.sessionId)
      if (!session) {
        this.logError('Session not found for prompt processing', { sessionId: request.sessionId })
        return 'refusal'
      }

      if (session.cancelled) {
        this.log('Session is cancelled, stopping prompt processing', { sessionId: request.sessionId })
        return 'cancelled'
      }

      // Update session activity
      session.lastActivity = new Date()

      // Convert prompt blocks to text with error handling
      let userMessage: string
      try {
        userMessage = this.convertContentBlocksToText(request.prompt)
        if (!userMessage || userMessage.trim().length === 0) {
          throw new Error('Empty or invalid prompt content')
        }
      } catch (contentError) {
        this.logError('Error converting prompt content', contentError)
        return 'refusal'
      }

      // Process with NikCLI's AI system
      try {
        if (this.config.services.orchestrator) {
          // Use existing orchestrator service
          await this.processWithOrchestrator(request.sessionId, userMessage, session.cwd)
        } else {
          // Fallback to simple processing
          await this.processWithSimpleResponse(request.sessionId, userMessage)
        }

        // Update stats
        this.stats.totalMessages++

        return 'end_turn'

      } catch (processingError) {
        this.logError('Error processing prompt', processingError)
        this.stats.errorCount++

        if (session.cancelled) {
          return 'cancelled'
        }

        return 'refusal'
      }

    } catch (error) {
      this.logError('Critical error in prompt processing', error)
      this.stats.errorCount++
      return 'refusal'
    }
  }

  private async processWithOrchestrator(sessionId: string, message: string, cwd: string): Promise<void> {
    try {
      // TODO: Integrate with actual NikCLI orchestrator service
      this.log('Processing with NikCLI orchestrator', { sessionId, cwd, message })

      // For now, simulate orchestrator processing
      // In production, this would call the actual orchestrator service
      await new Promise(resolve => setTimeout(resolve, 100)) // Small delay to simulate processing

      // Update tool execution stats
      this.stats.totalToolExecutions++

      this.log('Orchestrator processing completed', { sessionId })

    } catch (error) {
      this.logError('Error in orchestrator processing', error)
      throw error
    }
  }

  private async processWithSimpleResponse(sessionId: string, message: string): Promise<void> {
    try {
      this.log('Processing with simple response', { sessionId, message })

      // Basic response processing
      // In production, this might use a simple AI model or rule-based system
      await new Promise(resolve => setTimeout(resolve, 50)) // Small delay

      this.log('Simple response processing completed', { sessionId })

    } catch (error) {
      this.logError('Error in simple response processing', error)
      throw error
    }
  }

  private convertContentBlocksToText(blocks: any[]): string {
    try {
      if (!Array.isArray(blocks)) {
        throw new Error('Blocks parameter must be an array')
      }

      if (blocks.length === 0) {
        return ''
      }

      const convertedBlocks = blocks.map((block, index) => {
        try {
          if (!block || typeof block !== 'object') {
            return `[Invalid block ${index}]`
          }

          switch (block.type) {
            case 'text':
              return block.text || '[Empty text block]'

            case 'resource':
              if (!block.resource) {
                return '[Invalid resource block]'
              }
              const resourceText = 'text' in block.resource ? block.resource.text : '[Binary resource]'
              return `[Resource: ${block.resource.uri || 'unknown'}]\n${resourceText}`

            case 'resource_link':
              return `[Link: ${block.name || 'unnamed'} - ${block.uri || 'unknown'}]`

            case 'image':
              return `[Image: ${block.mimeType || 'unknown type'}]`

            case 'audio':
              return `[Audio: ${block.mimeType || 'unknown type'}]`

            default:
              return `[Unknown content type: ${block.type || 'undefined'}]`
          }
        } catch (blockError) {
          this.logError(`Error processing block ${index}`, blockError)
          return `[Error processing block ${index}]`
        }
      })

      const result = convertedBlocks.join('\n\n')

      if (result.length === 0) {
        return '[No content]'
      }

      return result

    } catch (error) {
      this.logError('Error converting content blocks to text', error)
      return '[Error converting content]'
    }
  }

  // ====================== UTILITIES ======================

  private log(message: string, data?: any): void {
    if (this.config.debug) {
      console.log(`[NikCLI ACP Agent] ${message}`, data ? JSON.stringify(data, null, 2) : '')
    }
  }

  private logError(message: string, error: any): void {
    if (this.config.debug) {
      console.error(`[NikCLI ACP Agent] ERROR: ${message}`, error)
    }
  }

  // ====================== LIFECYCLE ======================

  shutdown(): void {
    this.log('Shutting down NikCLI ACP Agent')

    try {
      // Cancel all active sessions with error handling
      const sessionIds = Array.from(this.sessions.keys())
      let cancelledCount = 0
      let errorCount = 0

      for (const sessionId of sessionIds) {
        try {
          const session = this.sessions.get(sessionId)
          if (session && !session.cancelled) {
            const cancelled = this.cancelSession(sessionId)
            if (cancelled) {
              cancelledCount++
            }
          }
        } catch (sessionError) {
          this.logError(`Error cancelling session ${sessionId}`, sessionError)
          errorCount++
        }
      }

      this.log('Session cleanup completed', {
        totalSessions: sessionIds.length,
        cancelled: cancelledCount,
        errors: errorCount
      })

      // Clear all sessions
      try {
        this.sessions.clear()
        this.log('All sessions cleared from memory')
      } catch (clearError) {
        this.logError('Error clearing sessions', clearError)
      }

    } catch (error) {
      this.logError('Critical error during agent shutdown', error)
    }
  }
}

interface SessionData {
  id: string
  cwd: string
  createdAt: Date
  lastActivity: Date
  cancelled: boolean
}

// ====================== SERVICE FACTORY ======================

export class AcpServiceFactory {
  static create(config?: AcpServiceConfig): AcpService {
    return new AcpService(config)
  }

  static createForNikCLI(nikCliServices: any, config?: Partial<AcpServiceConfig>): AcpService {
    const serviceConfig: AcpServiceConfig = {
      workingDirectory: process.cwd(),
      debug: process.env.NODE_ENV !== 'production',
      timeout: 30000,
      services: {
        orchestrator: nikCliServices.orchestrator,
        toolService: nikCliServices.toolService,
        modelProvider: nikCliServices.modelProvider,
        memoryService: nikCliServices.memoryService,
        cacheService: nikCliServices.cacheService,
        permissionService: nikCliServices.permissionService,
      },
      ...config,
    }

    return new AcpService(serviceConfig)
  }
}

// ====================== EXPORTS ======================

export default AcpService
