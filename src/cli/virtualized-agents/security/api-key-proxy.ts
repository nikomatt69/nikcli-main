import { EventEmitter } from 'events'
import { createServer, type Server } from 'node:http'
import chalk from 'chalk'
import cors from 'cors'
import express, { type Express, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'

import { advancedAIProvider } from '../../ai/advanced-ai-provider'
import { advancedUI } from '../../ui/advanced-cli-ui'
import { TokenManager } from './token-manager'

/**
 * APIKeyProxy - Secure proxy for AI requests from VM agents
 *
 * Security Features:
 * - API keys never leave the CLI base system
 * - JWT token authentication for VM agents
 * - Request validation and filtering
 * - Rate limiting and budget enforcement
 * - Audit logging for compliance
 * - Zero exposure of credentials to VM environments
 */
export class APIKeyProxy extends EventEmitter {
  private static instance: APIKeyProxy
  private app: Express = express()
  private server: Server | null = null
  private port: number = 0
  private tokenManager: TokenManager

  // Active agents and their sessions
  private activeAgents: Map<string, AgentSession> = new Map()
  private requestAuditLog: RequestAudit[] = []

  // Security settings
  private readonly MAX_REQUESTS_PER_MINUTE = 30
  private readonly MAX_TOKENS_PER_REQUEST = 4000
  private readonly AUDIT_LOG_MAX_SIZE = 10000

  private constructor() {
    super()

    this.tokenManager = TokenManager.getInstance()

    this.setupExpressApp()
    this.setupSecurityMiddleware()
    this.setupRoutes()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): APIKeyProxy {
    if (!APIKeyProxy.instance) {
      APIKeyProxy.instance = new APIKeyProxy()
    }
    return APIKeyProxy.instance
  }

  /**
   * Start the secure proxy server
   */
  async start(port: number = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer(this.app)

      this.server.listen(port, '127.0.0.1', () => {
        const address = this.server?.address()
        this.port = typeof address === 'object' && address ? address.port : port

        advancedUI.logSuccess(`🔐 API Key Proxy started on localhost:${this.port}`)
        this.emit('proxy:started', { port: this.port })

        resolve(this.port)
      })

      this.server.on('error', (error) => {
        advancedUI.logError(`❌ Proxy server error: ${error.message}`)
        reject(error)
      })
    })
  }

  /**
   * Stop the proxy server
   */
  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server?.close(() => {
          advancedUI.logInfo('🛑 API Key Proxy stopped')
          this.emit('proxy:stopped')
          resolve()
        })
      })
    }
  }

  /**
   * Register VM agent for secure communication
   */
  async registerAgent(agentId: string, sessionToken: string): Promise<void> {
    try {
      // Verify session token
      const tokenData = await this.tokenManager.verifyToken(sessionToken)

      if (tokenData.agentId !== agentId) {
        throw new Error('Token agent ID mismatch')
      }

      // Create agent session
      const session: AgentSession = {
        agentId,
        sessionToken,
        registeredAt: new Date(),
        tokenBudget: tokenData.tokenBudget,
        tokenUsed: 0,
        requestCount: 0,
        lastActivity: new Date(),
        capabilities: tokenData.capabilities || [],
      }

      this.activeAgents.set(agentId, session)

      advancedUI.logSuccess(`✓ Agent ${agentId} registered with proxy`)
      this.emit('agent:registered', { agentId, session })
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to register agent ${agentId}: ${error.message}`)
      throw error
    }
  }

  /**
   * Unregister VM agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    const session = this.activeAgents.get(agentId)
    if (session) {
      this.activeAgents.delete(agentId)

      advancedUI.logInfo(`🔓 Agent ${agentId} unregistered from proxy`)
      this.emit('agent:unregistered', { agentId, session })
    }
  }

  /**
   * Make AI request through secure proxy
   */
  async makeAIRequest(request: AIProxyRequest): Promise<AIProxyResponse> {
    try {
      // Validate session
      const session = await this.validateSession(request.agentId, request.sessionToken)

      // Check token budget
      if (session.tokenUsed + this.MAX_TOKENS_PER_REQUEST > session.tokenBudget) {
        throw new Error('Token budget exceeded')
      }

      // Make AI request using existing provider
      const aiResponse = await advancedAIProvider.executeAutonomousTask(request.prompt, {
        model: request.model || 'claude-4-sonnet-20250514',
        temperature: request.temperature || 0.7,
        maxTokens: Math.min(request.maxTokens || 2000, this.MAX_TOKENS_PER_REQUEST),
        context: request.context,
      })

      // Extract content from stream response
      let content = ''
      let tokenUsage = 1000 // Default estimate

      try {
        // Handle async generator response
        for await (const chunk of aiResponse) {
          if (typeof chunk === 'object' && chunk && 'type' in chunk && chunk.type === 'text_delta') {
            content += (chunk as any).delta || ''
          } else if (typeof chunk === 'object' && chunk && 'usage' in chunk) {
            tokenUsage = (chunk as any).usage?.totalTokens || tokenUsage
          } else if (typeof chunk === 'string') {
            content += chunk
          }
        }
      } catch (_streamError) {
        // Fallback for non-streaming response
        content = typeof aiResponse === 'string' ? aiResponse : JSON.stringify(aiResponse)
      }

      // Update session usage
      session.tokenUsed += tokenUsage
      session.requestCount++
      session.lastActivity = new Date()

      // Log request for audit
      this.logRequest({
        agentId: request.agentId,
        timestamp: new Date(),
        prompt: `${request.prompt.slice(0, 100)}...`, // Truncated for privacy
        tokenUsage,
        success: true,
        model: request.model || 'claude-3-5-sonnet-20241022',
      })

      advancedUI.logInfo(`🔌 AI request completed for ${request.agentId}: ${tokenUsage} tokens`)

      return {
        result: content,
        tokenUsage,
        model: request.model || 'claude-3-5-sonnet-20241022',
        success: true,
      }
    } catch (error: any) {
      // Log failed request
      this.logRequest({
        agentId: request.agentId,
        timestamp: new Date(),
        prompt: `${request.prompt.slice(0, 100)}...`,
        tokenUsage: 0,
        success: false,
        error: error.message,
        model: request.model || 'claude-3-5-sonnet-20241022',
      })

      advancedUI.logError(`❌ AI request failed for ${request.agentId}: ${error.message}`)
      throw error
    }
  }

  /**
   * Make streaming AI request through secure proxy for chat
   */
  async *makeStreamingAIRequest(request: AIProxyRequest): AsyncGenerator<AIStreamChunk, void, unknown> {
    try {
      // Validate session
      const session = await this.validateSession(request.agentId, request.sessionToken)

      // Check token budget
      if (session.tokenUsed + this.MAX_TOKENS_PER_REQUEST > session.tokenBudget) {
        throw new Error('Token budget exceeded')
      }

      advancedUI.logInfo(`🌊 Starting streaming AI request for ${request.agentId}`)

      let totalTokenUsage = 0
      let accumulatedContent = ''

      try {
        // Stream AI response using advanced provider's executeAutonomousTask
        for await (const streamEvent of advancedAIProvider.executeAutonomousTask(request.prompt, {
          model: request.model || 'claude-4-sonnet-20250514',
          temperature: request.temperature || 1,
          maxTokens: Math.min(request.maxTokens || 2000, this.MAX_TOKENS_PER_REQUEST),
          context: request.context,
        })) {
          advancedUI.logInfo(
            `📦 Stream event: ${streamEvent.type} - ${streamEvent.content?.slice(0, 50) || 'no content'}`
          )

          // Handle different types of stream events from advanced AI provider
          switch (streamEvent.type) {
            case 'text_delta':
              if (streamEvent.content) {
                accumulatedContent += streamEvent.content

                // DEBUG: Log text_delta to verify it's being received
                console.log(chalk.magenta(`🌊 TEXT_DELTA: ${streamEvent.content.slice(0, 80)}...`))

                // Yield content chunk
                yield {
                  type: 'content',
                  content: streamEvent.content,
                  accumulated: accumulatedContent,
                  agentId: request.agentId,
                }
              }
              break

            case 'start':
            case 'thinking':
              if (streamEvent.content) {
                // Yield system messages as content
                yield {
                  type: 'content',
                  content: `${streamEvent.content}\n`,
                  accumulated: accumulatedContent,
                  agentId: request.agentId,
                }
              }
              break

            case 'tool_call':
              if (streamEvent.toolName && streamEvent.content) {
                const toolMessage = `🔧 Using ${streamEvent.toolName}: ${streamEvent.content}\n`
                yield {
                  type: 'content',
                  content: toolMessage,
                  accumulated: accumulatedContent,
                  agentId: request.agentId,
                }
              }
              break

            case 'tool_result':
              if (streamEvent.content) {
                const resultMessage = `📋 Result: ${streamEvent.content}\n`
                yield {
                  type: 'content',
                  content: resultMessage,
                  accumulated: accumulatedContent,
                  agentId: request.agentId,
                }
              }
              break

            case 'complete':
              // Task completed, estimate token usage
              totalTokenUsage = Math.max(100, Math.floor(accumulatedContent.length / 4))

              yield {
                type: 'usage',
                content: '',
                accumulated: accumulatedContent,
                agentId: request.agentId,
                tokenUsage: totalTokenUsage,
              }
              break

            case 'error':
              // Handle errors from advanced provider
              throw new Error(streamEvent.error || 'Unknown streaming error')
          }
        }
      } catch (streamError: any) {
        advancedUI.logError(`❌ Advanced AI provider streaming error: ${streamError.message}`)
        throw streamError
      }

      // Final usage update
      if (totalTokenUsage === 0) {
        totalTokenUsage = Math.max(100, Math.floor(accumulatedContent.length / 4)) // Estimate based on content length
      }

      // Update session usage
      session.tokenUsed += totalTokenUsage
      session.requestCount++
      session.lastActivity = new Date()

      // Log request for audit
      this.logRequest({
        agentId: request.agentId,
        timestamp: new Date(),
        prompt: `${request.prompt.slice(0, 100)}...`, // Truncated for privacy
        tokenUsage: totalTokenUsage,
        success: true,
        model: request.model || 'claude-3-5-sonnet-20241022',
      })

      // Yield completion signal
      yield {
        type: 'complete',
        content: '',
        accumulated: accumulatedContent,
        agentId: request.agentId,
        tokenUsage: totalTokenUsage,
        success: true,
      }

      advancedUI.logInfo(`🌊 Streaming AI request completed for ${request.agentId}: ${totalTokenUsage} tokens`)
    } catch (error: any) {
      // Log failed request
      this.logRequest({
        agentId: request.agentId,
        timestamp: new Date(),
        prompt: `${request.prompt.slice(0, 100)}...`,
        tokenUsage: 0,
        success: false,
        error: error.message,
        model: request.model || 'claude-3-5-sonnet-20241022',
      })

      // Yield error
      yield {
        type: 'error',
        content: '',
        accumulated: '',
        agentId: request.agentId,
        error: error.message,
      }

      advancedUI.logError(`❌ Streaming AI request failed for ${request.agentId}: ${error.message}`)
      throw error
    }
  }

  /**
   * Get proxy endpoint URL
   */
  async getEndpoint(): Promise<string> {
    if (!this.server) {
      await this.start()
    }
    return `http://127.0.0.1:${this.port}`
  }

  /**
   * Get active agent sessions
   */
  getActiveSessions(): AgentSession[] {
    return Array.from(this.activeAgents.values())
  }

  /**
   * Get audit log
   */
  getAuditLog(limit: number = 100): RequestAudit[] {
    return this.requestAuditLog.slice(-limit)
  }

  /**
   * Setup Express application
   */
  private setupExpressApp(): void {
    this.app = express()

    // Basic middleware
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true }))

    // CORS for localhost only
    this.app.use(
      cors({
        origin: ['http://127.0.0.1', 'http://localhost'],
        credentials: true,
      })
    )
  }

  /**
   * Setup security middleware
   */
  private setupSecurityMiddleware(): void {
    // Security headers
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
          },
        },
      })
    )

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: this.MAX_REQUESTS_PER_MINUTE,
      message: 'Too many requests from this IP',
      standardHeaders: true,
      legacyHeaders: false,
    })

    this.app.use('/api/', limiter)

    // Authentication middleware
    this.app.use('/api/', this.authenticateRequest.bind(this))
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        activeAgents: this.activeAgents.size,
        uptime: process.uptime(),
      })
    })

    // AI request endpoint
    this.app.post('/api/ai/request', this.handleAIRequest.bind(this))

    // AI streaming request endpoint
    this.app.post('/api/ai/stream', this.handleStreamingAIRequest.bind(this))

    // Agent status endpoint
    this.app.get('/api/agent/:agentId/status', this.handleAgentStatus.bind(this))

    // Usage statistics endpoint
    this.app.get('/api/usage/stats', this.handleUsageStats.bind(this))

    // Error handler
    this.app.use(this.errorHandler.bind(this))
  }

  /**
   * Authenticate incoming requests
   */
  private async authenticateRequest(req: Request, res: Response, next: Function): Promise<void> {
    try {
      const authHeader = req.headers.authorization

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid authorization header' })
        return
      }

      const token = authHeader.slice(7)
      const tokenData = await this.tokenManager.verifyToken(token)

      // Add token data to request
      ;(req as any).agentId = tokenData.agentId
      ;(req as any).tokenData = tokenData

      next()
    } catch (_error: any) {
      res.status(401).json({ error: 'Invalid token' })
    }
  }

  /**
   * Handle AI request
   */
  private async handleAIRequest(req: Request, res: Response): Promise<void> {
    try {
      const { prompt, model, temperature, maxTokens, context } = req.body
      const agentId = (req as any).agentId
      const sessionToken = req.headers.authorization?.slice(7)

      if (!prompt) {
        res.status(400).json({ error: 'Missing prompt' })
        return
      }

      const response = await this.makeAIRequest({
        agentId,
        sessionToken: sessionToken!,
        prompt,
        model,
        temperature,
        maxTokens,
        context,
      })

      res.json(response)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  /**
   * Handle streaming AI request
   */
  private async handleStreamingAIRequest(req: Request, res: Response): Promise<void> {
    try {
      const { prompt, model, temperature, maxTokens, context } = req.body
      const agentId = (req as any).agentId
      const sessionToken = req.headers.authorization?.slice(7)

      if (!prompt) {
        res.status(400).json({ error: 'Missing prompt' })
        return
      }

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Transfer-Encoding', 'chunked')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      try {
        // Start streaming response
        for await (const chunk of this.makeStreamingAIRequest({
          agentId,
          sessionToken: sessionToken!,
          prompt,
          model,
          temperature,
          maxTokens,
          context,
        })) {
          // Send chunk as JSON line
          const chunkLine = `${JSON.stringify(chunk)}\n`
          res.write(chunkLine)

          // Flush buffer for real-time streaming
          if ((res as any).flush) {
            ;(res as any).flush()
          }
        }

        // End the response
        res.end()
      } catch (streamError: any) {
        // Send error chunk and end
        const errorChunk = `${JSON.stringify({
          type: 'error',
          error: streamError.message,
          agentId,
        })}\n`
        res.write(errorChunk)
        res.end()
      }
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: error.message })
      }
    }
  }

  /**
   * Handle agent status request
   */
  private async handleAgentStatus(req: Request, res: Response): Promise<void> {
    const agentId = req.params.agentId
    const session = this.activeAgents.get(agentId)

    if (!session) {
      res.status(404).json({ error: 'Agent not found' })
      return
    }

    res.json({
      agentId: session.agentId,
      tokenUsage: {
        used: session.tokenUsed,
        budget: session.tokenBudget,
        remaining: session.tokenBudget - session.tokenUsed,
      },
      requestCount: session.requestCount,
      lastActivity: session.lastActivity,
      capabilities: session.capabilities,
    })
  }

  /**
   * Get security statistics for dashboard
   */
  async getSecurityStats(): Promise<SecurityStats> {
    return {
      isActive: this.server !== null,
      registeredAgents: this.activeAgents.size,
      activeSessions: this.activeAgents.size,
      totalRequests: this.requestAuditLog.length,
      securityViolations: this.requestAuditLog.filter((log) => !log.success).length,
      uptime: this.server ? process.uptime() : 0,
    }
  }

  /**
   * Handle usage statistics request
   */
  private async handleUsageStats(_req: Request, res: Response): Promise<void> {
    const stats = {
      totalAgents: this.activeAgents.size,
      totalRequests: this.requestAuditLog.length,
      totalTokens: Array.from(this.activeAgents.values()).reduce((sum, session) => sum + session.tokenUsed, 0),
      averageTokensPerRequest:
        this.requestAuditLog.length > 0
          ? this.requestAuditLog.reduce((sum, log) => sum + log.tokenUsage, 0) / this.requestAuditLog.length
          : 0,
      recentRequests: this.requestAuditLog.slice(-10),
    }

    res.json(stats)
  }

  /**
   * Validate agent session
   */
  private async validateSession(agentId: string, sessionToken: string): Promise<AgentSession> {
    const session = this.activeAgents.get(agentId)

    if (!session) {
      throw new Error('Agent not registered')
    }

    if (session.sessionToken !== sessionToken) {
      throw new Error('Invalid session token')
    }

    // Check if token is still valid
    await this.tokenManager.verifyToken(sessionToken)

    return session
  }

  /**
   * Log request for audit trail
   */
  private logRequest(audit: RequestAudit): void {
    this.requestAuditLog.push(audit)

    // Maintain log size limit
    if (this.requestAuditLog.length > this.AUDIT_LOG_MAX_SIZE) {
      this.requestAuditLog = this.requestAuditLog.slice(-this.AUDIT_LOG_MAX_SIZE / 2)
    }

    this.emit('request:logged', audit)
  }

  /**
   * Error handler middleware
   */
  private errorHandler(error: any, _req: Request, res: Response, _next: Function): void {
    advancedUI.logError(`❌ Proxy error: ${error.message}`)

    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    })
  }
}

// Type definitions
export interface AgentSession {
  agentId: string
  sessionToken: string
  registeredAt: Date
  tokenBudget: number
  tokenUsed: number
  requestCount: number
  lastActivity: Date
  capabilities: string[]
}

export interface AIProxyRequest {
  agentId: string
  sessionToken: string
  prompt: string
  model?: string
  temperature?: number
  maxTokens?: number
  context?: any
}

export interface AIProxyResponse {
  result: string
  tokenUsage: number
  model: string
  success: boolean
  error?: string
}

export interface RequestAudit {
  agentId: string
  timestamp: Date
  prompt: string
  tokenUsage: number
  success: boolean
  error?: string
  model: string
}

export interface SecurityStats {
  isActive: boolean
  registeredAgents: number
  activeSessions: number
  totalRequests: number
  securityViolations: number
  uptime: number
}

export interface AIStreamChunk {
  type: 'content' | 'usage' | 'complete' | 'error'
  content: string
  accumulated: string
  agentId: string
  tokenUsage?: number
  success?: boolean
  error?: string
}
