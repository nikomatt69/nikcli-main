// src/cli/background-agents/api/server.ts

import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { backgroundAgentService } from '../background-agent-service'
import { GitHubIntegration } from '../github/github-integration'
import { JobQueue } from '../queue/job-queue'
import { securityPolicy } from '../security/security-policy'
import type { BackgroundJob, CreateBackgroundJobRequest, JobStatus } from '../types'
import { setupWebRoutes } from './web-routes'
import { BackgroundAgentsWebSocketServer } from './websocket-server'
import { prometheusExporter, type HealthChecker } from '../../monitoring'
import { simpleConfigManager } from '../../core/config-manager'
import { SlackNotifier } from '../integrations/slack-notifier'
import { ChatSessionService } from '../services/chat-session-service'
import { createChatRouter } from './chat-routes'
import { getEnvironmentConfig } from '../config/env-validator'
import { errorHandler, notFoundHandler } from '../middleware/error-handler'

export interface APIServerConfig {
  port: number
  cors: {
    origin: string[]
    credentials: boolean
  }
  rateLimit: {
    windowMs: number
    max: number
  }
  github?: {
    appId: string
    privateKey: string
    installationId: string
    webhookSecret: string
    githubToken?: string
  }
  queue: {
    type: 'local' | 'redis'
    redis?: {
      host: string
      port: number
      password?: string
      upstash?: {
        url: string
        token: string
      }
    }
  }
}

export class BackgroundAgentsAPIServer {
  private app: express.Application
  private server?: any
  private config: APIServerConfig
  private jobQueue: JobQueue
  private githubIntegration?: GitHubIntegration
  private clients: Map<string, express.Response> = new Map()
  private wsServer?: BackgroundAgentsWebSocketServer
  private healthChecker?: HealthChecker
  private slackNotifier?: SlackNotifier
  private chatSessionService: ChatSessionService

  constructor(config: APIServerConfig, healthChecker?: HealthChecker) {
    // Validate environment before proceeding
    const envConfig = getEnvironmentConfig()
    console.log(`[Server] Initializing in ${envConfig.nodeEnv} mode`)

    this.config = config
    this.app = express()
    
    // Trust proxy for Railway/deployment environments (required for express-rate-limit to work correctly)
    // This allows Express to trust the X-Forwarded-* headers from Railway's reverse proxy
    this.app.set('trust proxy', true)
    
    this.healthChecker = healthChecker
    this.jobQueue = new JobQueue({
      type: config.queue.type,
      redis: config.queue.redis,
      maxConcurrentJobs: 3,
      retryAttempts: 3,
      retryDelay: 5000,
    })

    // Initialize GitHub integration if configured
    if (config.github) {
      this.githubIntegration = new GitHubIntegration(config.github)
    }

    // Initialize Slack notifier
    this.slackNotifier = new SlackNotifier(backgroundAgentService)

    // Initialize Chat Session Service
    this.chatSessionService = new ChatSessionService(backgroundAgentService)

    this.setupMiddleware()
    this.setupMonitoring()
    this.setupRoutes()
    this.setupEventListeners()
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS must be applied FIRST, before any other middleware
    // This ensures preflight OPTIONS requests get proper CORS headers

    // Use the origins from config (already parsed with wildcards in production)
    const allowedOrigins = this.config.cors.origin

    // Log CORS configuration on startup
    console.log(`[CORS] Configured allowed origins: ${allowedOrigins.join(', ')}`)

    // Helper function to check if origin is allowed
    const isOriginAllowed = (origin: string | undefined): boolean => {
      if (!origin) {
        return true // Allow requests with no origin
      }

      // Check against explicit allowed origins
      if (allowedOrigins.includes(origin)) {
        return true
      }

      // Check for wildcard patterns
      for (const pattern of allowedOrigins) {
        // Support wildcard pattern like 'https://*.vercel.app'
        if (pattern.includes('*')) {
          const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
          const regex = new RegExp(`^${regexPattern}$`)
          if (regex.test(origin)) {
            return true
          }
        }

        // Support explicit wildcard to allow all origins
        if (pattern === '*') {
          return true
        }
      }

      return false
    }

    // CORS middleware - handles both preflight OPTIONS and regular requests
    const corsOptions = {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Only log rejected origins to reduce log noise
        const allowed = isOriginAllowed(origin)
        if (!allowed) {
          console.warn(`[CORS] ✗ Rejected origin: ${origin}. Allowed origins: ${allowedOrigins.join(', ')}`)
        }
        callback(null, allowed)
      },
      credentials: this.config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-AI-Provider', 'X-AI-Model', 'X-AI-Key'],
      exposedHeaders: ['Content-Type', 'Authorization'],
      optionsSuccessStatus: 200,
      preflightContinue: false,
    }

    // Apply CORS middleware globally
    this.app.use(cors(corsOptions))

    // CRITICAL: Handle ALL OPTIONS requests FIRST, before any other middleware can interfere
    // This MUST be early in the middleware chain to catch preflight requests
    // Railway may block OPTIONS before they reach us, but if they do reach us, we handle them here
    this.app.use((req, res, next) => {
      // Handle OPTIONS preflight requests immediately
      if (req.method === 'OPTIONS') {
        const origin = req.headers.origin as string | undefined

        console.log(`[CORS] OPTIONS preflight request for: ${req.path} from origin: ${origin}`)

        // Check if origin is allowed
        const allowed = isOriginAllowed(origin)

        if (allowed) {
          if (origin) {
            res.header('Access-Control-Allow-Origin', origin)
            res.header('Access-Control-Allow-Credentials', 'true')
          }
          res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
          res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-AI-Provider, X-AI-Model, X-AI-Key')
          res.header('Access-Control-Max-Age', '86400') // 24 hours
          console.log(`[CORS] ✓ OPTIONS preflight allowed for: ${req.path}`)
        } else {
          console.warn(`[CORS] ✗ OPTIONS preflight rejected for: ${req.path} from: ${origin}`)
        }

        res.status(200).end()
        return
      }

      // For non-OPTIONS requests, add CORS headers if origin is present and allowed
      const origin = req.headers.origin as string | undefined
      if (origin && isOriginAllowed(origin)) {
        res.header('Access-Control-Allow-Origin', origin)
        res.header('Access-Control-Allow-Credentials', 'true')
        res.header('Access-Control-Expose-Headers', 'Content-Type, Authorization')
      }

      next()
    })

    // Security - configure helmet AFTER CORS to not interfere
    this.app.use(
      helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        crossOriginEmbedderPolicy: false,
      })
    )

    // Rate limiting configuration
    // More permissive rate limiter for monitoring endpoints (stats, jobs GET)
    const monitoringLimiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute window
      max: 1000, // Drastically increased to 1000 requests per minute for monitoring endpoints
      message: 'Too many monitoring requests from this IP',
      skip: (req) => req.method === 'OPTIONS',
      standardHeaders: true,
      legacyHeaders: false,
      // Disable X-Forwarded-For validation since we trust the proxy
      validate: {
        xForwardedForHeader: false,
      },
      handler: (req, res) => {
        const resetTime = Math.ceil((Date.now() + 1 * 60 * 1000) / 1000) // Reset in 1 minute
        const retryAfter = 60 // seconds until reset
        
        res.setHeader('Retry-After', retryAfter.toString())
        res.setHeader('X-RateLimit-Reset', resetTime.toString())
        res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded for monitoring endpoints. Try again in 60 seconds.',
          retryAfter,
          resetTime,
        })
      },
    })

    // Standard rate limiter for other endpoints
    const standardLimiter = rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.max,
      message: 'Too many requests from this IP',
      skip: (req) => {
        // Skip OPTIONS requests (preflight)
        if (req.method === 'OPTIONS') return true
        // Skip monitoring endpoints that have their own limiter
        if (req.path === '/v1/stats') return true
        if (req.path === '/v1/jobs' && req.method === 'GET') return true
        // Skip chat endpoints that are frequently polled
        if (req.path.startsWith('/v1/chat')) return true
        // Skip POST /v1/jobs (job creation) - already has validation and shouldn't be rate limited heavily
        if (req.path === '/v1/jobs' && req.method === 'POST') return true
        return false
      },
      standardHeaders: true,
      legacyHeaders: false,
      // Disable X-Forwarded-For validation since we trust the proxy
      validate: {
        xForwardedForHeader: false,
      },
      handler: (req, res) => {
        const resetTime = Math.ceil((Date.now() + this.config.rateLimit.windowMs) / 1000)
        const retryAfter = Math.ceil(this.config.rateLimit.windowMs / 1000) // seconds until reset
        
        res.setHeader('Retry-After', retryAfter.toString())
        res.setHeader('X-RateLimit-Reset', resetTime.toString())
        res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          retryAfter,
          resetTime,
        })
      },
    })

    // Apply monitoring limiter to stats endpoint (more permissive)
    this.app.use('/v1/stats', monitoringLimiter)
    
    // Apply monitoring limiter to jobs GET endpoint (list jobs)
    this.app.use('/v1/jobs', (req, res, next) => {
      // Only apply monitoring limiter to GET requests (list jobs)
      if (req.method === 'GET') {
        return monitoringLimiter(req, res, next)
      }
      // For other methods, continue to next middleware (standard limiter will handle them)
      next()
    })

    // Apply monitoring limiter to chat endpoints (frequently polled)
    this.app.use('/v1/chat', monitoringLimiter)

    // Apply standard limiter to all v1 endpoints (it will skip monitoring endpoints)
    this.app.use('/v1/', standardLimiter)

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))

    // Request logging (only for non-health-check requests to reduce noise)
    this.app.use((req, _res, next) => {
      // Skip logging health checks and OPTIONS requests to reduce log noise
      if (req.path !== '/health' && req.method !== 'OPTIONS') {
        console.log(`${new Date().toISOString()} ${req.method} ${req.path}`)
      }
      next()
    })
  }

  /**
   * Setup monitoring endpoints and middleware
   */
  private setupMonitoring(): void {
    const config = simpleConfigManager.getConfig()

    // Prometheus metrics middleware
    this.app.use((req, res, next) => {
      const start = Date.now()
      prometheusExporter.httpRequestsInFlight.inc()

      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000
        prometheusExporter.httpRequestsTotal.inc({
          method: req.method,
          route: req.route?.path || req.path,
          status_code: res.statusCode.toString(),
        })
        prometheusExporter.httpRequestDuration.observe(
          {
            method: req.method,
            route: req.route?.path || req.path,
            status_code: res.statusCode.toString(),
          },
          duration
        )
        prometheusExporter.httpRequestsInFlight.dec()
      })

      next()
    })

    // Prometheus metrics endpoint
    if (config.monitoring.prometheus.enabled) {
      this.app.get(config.monitoring.prometheus.path, async (_req, res) => {
        res.setHeader('Content-Type', prometheusExporter.getContentType())
        res.send(await prometheusExporter.getMetrics())
      })
    }

    // Enhanced health check endpoint
    this.app.get('/health', async (_req, res) => {
      if (this.healthChecker) {
        const health = await this.healthChecker.check()
        const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 503 : 500
        res.status(statusCode).json(health)
      } else {
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '0.5.0',
          uptime: process.uptime(),
        })
      }
    })

    // Readiness probe endpoint
    this.app.get('/ready', async (_req, res) => {
      if (this.healthChecker) {
        const readiness = await this.healthChecker.readinessProbe()
        const statusCode = readiness.ready ? 200 : 503
        res.status(statusCode).json(readiness)
      } else {
        res.status(200).json({ ready: true, timestamp: new Date() })
      }
    })

    // Liveness probe endpoint
    this.app.get('/live', (_req, res) => {
      if (this.healthChecker) {
        const liveness = this.healthChecker.livenessProbe()
        res.status(200).json(liveness)
      } else {
        res.status(200).json({ alive: true, timestamp: new Date() })
      }
    })
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Root route - API info
    this.app.get('/', (_req, res) => {
      res.json({
        name: 'NikCLI Background Agents API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          health: '/health',
          api: '/v1',
          docs: '/v1',
        },
        timestamp: new Date().toISOString(),
      })
    })

    // Favicon handler - return 204 No Content to avoid 404 errors
    this.app.get('/favicon.ico', (_req, res) => {
      res.status(204).end()
    })

    // API v1 routes
    const v1 = express.Router()

    // Jobs
    v1.post('/jobs', this.createJob.bind(this))
    v1.get('/jobs', this.listJobs.bind(this))
    v1.get('/jobs/:id', this.getJob.bind(this))
    v1.delete('/jobs/:id', this.cancelJob.bind(this))
    v1.get('/jobs/:id/stream', this.streamJobLogs.bind(this))
    v1.post('/jobs/:id/message', this.sendFollowUpMessage.bind(this))

    // Stats
    v1.get('/stats', this.getStats.bind(this))

    // Queue management
    v1.get('/queue/stats', this.getQueueStats.bind(this))
    v1.post('/queue/clear', this.clearQueue.bind(this))

    // Security
    v1.get('/security/violations', this.getSecurityViolations.bind(this))
    v1.get('/security/violations/:jobId', this.getJobSecurityReport.bind(this))

    // GitHub webhooks
    if (this.githubIntegration) {
      v1.post('/github/webhook', this.handleGitHubWebhook.bind(this))
    }

    // Chat routes
    const chatRouter = createChatRouter(this.chatSessionService)
    v1.use('/chat', chatRouter)

    this.app.use('/v1', v1)

    // Setup web interface routes
    setupWebRoutes(this.app)

    // 404 handler (must be before error handler)
    this.app.use(notFoundHandler)

    // Centralized error handler (must be last)
    this.app.use(errorHandler)
  }

  /**
   * Setup event listeners for real-time updates
   */
  private setupEventListeners(): void {
    // Job events
    backgroundAgentService.on('job:created', (job: BackgroundJob) => {
      this.broadcastToClients('job:created', job)
    })

    backgroundAgentService.on('job:started', (job: BackgroundJob) => {
      this.broadcastToClients('job:started', job)
    })

    backgroundAgentService.on('job:completed', (job: BackgroundJob) => {
      this.broadcastToClients('job:completed', job)
    })

    backgroundAgentService.on('job:failed', (job: BackgroundJob) => {
      this.broadcastToClients('job:failed', job)
    })

    backgroundAgentService.on('job:log', (jobId: string, logEntry: any) => {
      this.broadcastToClients('job:log', { jobId, logEntry })
    })

    // Queue events
    this.jobQueue.on('job:queued', (jobId: string) => {
      this.broadcastToClients('queue:job:queued', { jobId })
    })

    this.jobQueue.on('job:processing', (jobId: string) => {
      this.broadcastToClients('queue:job:processing', { jobId })
    })

    this.jobQueue.on('job:completed', (jobId: string) => {
      this.broadcastToClients('queue:job:completed', { jobId })
    })
  }

  /**
   * Create a new background job
   */
  private async createJob(req: express.Request, res: express.Response): Promise<void> {
    try {
      const request: CreateBackgroundJobRequest = req.body

      // Validate request
      if (!request.repo || !request.task) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required fields: repo, task',
        })
        return
      }

      // Require AI provider credentials from headers
      const aiProvider = (req.headers['x-ai-provider'] as string | undefined)?.toLowerCase()
      const aiModel = req.headers['x-ai-model'] as string | undefined
      const aiKey = req.headers['x-ai-key'] as string | undefined

      if (!aiKey || !aiProvider) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Missing AI provider credentials (x-ai-provider, x-ai-key)',
        })
        return
      }

      // Mask key in any logs
      const maskedKey = `${aiKey.slice(0, 4)}****${aiKey.slice(-4)}`
      console.log('AI credentials received:', { provider: aiProvider, model: aiModel, key: maskedKey })

      // TODO: inject credentials into job context (in-memory only)

      // Create job
      const jobId = await backgroundAgentService.createJob(request)

      // Add to queue
      await this.jobQueue.addJob(jobId, request.priority || 5)

      const job = backgroundAgentService.getJob(jobId)

      res.status(201).json({
        jobId,
        job,
        message: 'Job created successfully',
      })
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
    }
  }

  /**
   * List jobs with filtering
   */
  private async listJobs(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { status, limit = '50', offset = '0', repo } = req.query

      const jobs = backgroundAgentService.listJobs({
        status: status as JobStatus,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      })

      // Filter by repo if specified
      let filteredJobs = jobs
      if (repo) {
        filteredJobs = jobs.filter((job) => job.repo === repo)
      }

      res.json({
        jobs: filteredJobs,
        total: filteredJobs.length,
        offset: parseInt(offset as string, 10),
        limit: parseInt(limit as string, 10),
      })
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
    }
  }

  /**
   * Get job by ID
   */
  private async getJob(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params
      const job = backgroundAgentService.getJob(id)

      if (!job) {
        res.status(404).json({
          error: 'Not Found',
          message: `Job ${id} not found`,
        })
        return
      }

      res.json({ job })
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
    }
  }

  /**
   * Cancel job
   */
  private async cancelJob(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params
      const success = await backgroundAgentService.cancelJob(id)

      if (!success) {
        res.status(404).json({
          error: 'Not Found',
          message: `Job ${id} not found or cannot be cancelled`,
        })
        return
      }

      res.json({
        message: `Job ${id} cancelled successfully`,
      })
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
    }
  }

  /**
   * Stream job logs using Server-Sent Events
   */
  private streamJobLogs(req: express.Request, res: express.Response): void {
    const { id } = req.params
    const job = backgroundAgentService.getJob(id)

    if (!job) {
      res.status(404).json({
        error: 'Not Found',
        message: `Job ${id} not found`,
      })
      return
    }

    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    })

    const clientId = `${id}-${Date.now()}`
    this.clients.set(clientId, res)

    // Send existing logs
    job.logs.forEach((log) => {
      res.write(`data: ${JSON.stringify({ type: 'log', data: log })}\n\n`)
    })

    // Send initial job status
    res.write(`data: ${JSON.stringify({ type: 'job', data: job })}\n\n`)

    // Setup job-specific event listener
    const logHandler = (jobId: string, logEntry: any) => {
      if (jobId === id) {
        res.write(`data: ${JSON.stringify({ type: 'log', data: logEntry })}\n\n`)
      }
    }

    const jobHandler = (eventJob: BackgroundJob) => {
      if (eventJob.id === id) {
        res.write(`data: ${JSON.stringify({ type: 'job', data: eventJob })}\n\n`)
      }
    }

    backgroundAgentService.on('job:log', logHandler)
    backgroundAgentService.on('job:started', jobHandler)
    backgroundAgentService.on('job:completed', jobHandler)
    backgroundAgentService.on('job:failed', jobHandler)

    // Handle client disconnect
    req.on('close', () => {
      this.clients.delete(clientId)
      backgroundAgentService.off('job:log', logHandler)
      backgroundAgentService.off('job:started', jobHandler)
      backgroundAgentService.off('job:completed', jobHandler)
      backgroundAgentService.off('job:failed', jobHandler)
    })

    // Send periodic heartbeat
    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', data: { timestamp: Date.now() } })}\n\n`)
    }, 30000)

    req.on('close', () => {
      clearInterval(heartbeat)
    })
  }

  /**
   * Send follow-up message to job
   */
  private async sendFollowUpMessage(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params
      const { message, priority = 'normal' } = req.body

      if (!message) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Message is required',
        })
        return
      }

      const messageId = await backgroundAgentService.sendFollowUpMessage(id, message, priority)

      res.json({
        messageId,
        message: 'Follow-up message sent successfully',
      })
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
    }
  }

  /**
   * Get background agent statistics
   */
  private async getStats(_req: express.Request, res: express.Response): Promise<void> {
    try {
      const stats = backgroundAgentService.getStats()
      const queueStats = await this.jobQueue.getStats()

      res.json({
        jobs: stats,
        queue: queueStats,
        timestamp: new Date().toISOString(),
      })
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
    }
  }

  /**
   * Get queue statistics
   */
  private async getQueueStats(_req: express.Request, res: express.Response): Promise<void> {
    try {
      const stats = await this.jobQueue.getStats()

      res.json({
        queue: stats,
        timestamp: new Date().toISOString(),
      })
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
    }
  }

  /**
   * Clear job queue
   */
  private async clearQueue(_req: express.Request, res: express.Response): Promise<void> {
    try {
      await this.jobQueue.clear()

      res.json({
        message: 'Queue cleared successfully',
      })
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
    }
  }

  /**
   * Get security violations
   */
  private getSecurityViolations(_req: express.Request, res: express.Response): void {
    try {
      const violations = securityPolicy.getViolations()

      res.json({
        violations,
        total: violations.length,
        timestamp: new Date().toISOString(),
      })
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
    }
  }

  /**
   * Get security report for specific job
   */
  private getJobSecurityReport(req: express.Request, res: express.Response): void {
    try {
      const { jobId } = req.params
      const report = securityPolicy.generateSecurityReport(jobId)

      res.json({
        jobId,
        report,
        timestamp: new Date().toISOString(),
      })
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
    }
  }

  /**
   * Handle GitHub webhook events
   */
  private async handleGitHubWebhook(req: express.Request, res: express.Response): Promise<void> {
    try {
      if (!this.githubIntegration) {
        res.status(501).json({
          error: 'Not Implemented',
          message: 'GitHub integration not configured',
        })
        return
      }

      const signature = req.headers['x-hub-signature-256'] as string
      const event = req.headers['x-github-event'] as string
      const payload = req.body

      // Verify webhook signature
      const rawBody = JSON.stringify(payload)
      const isValid = GitHubIntegration.verifyWebhookSignature(rawBody, signature, this.config.github!.webhookSecret)

      if (!isValid) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid webhook signature',
        })
        return
      }

      // Handle webhook event
      await this.githubIntegration.handleWebhookEvent(event, payload)

      res.json({
        message: 'Webhook processed successfully',
      })
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
    }
  }

  /**
   * Broadcast message to all connected SSE clients
   */
  private broadcastToClients(event: string, data: any): void {
    const message = `data: ${JSON.stringify({ type: event, data })}\n\n`

    for (const [clientId, response] of this.clients.entries()) {
      try {
        response.write(message)
      } catch (_error) {
        // Client disconnected
        this.clients.delete(clientId)
      }
    }
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Listen on 0.0.0.0 to accept connections from Railway's load balancer
        // Railway routes external traffic to the container, so we need to listen on all interfaces
        this.server = this.app.listen(this.config.port, '0.0.0.0', () => {
          console.log(`🚀 Background Agents API server running on port ${this.config.port}`)
          console.log(`📊 Health check: http://0.0.0.0:${this.config.port}/health`)
          console.log(`📋 API docs: http://0.0.0.0:${this.config.port}/v1`)

          // Initialize WebSocket server
          this.wsServer = new BackgroundAgentsWebSocketServer(this.server)
          console.log(`📡 WebSocket server ready on ws://0.0.0.0:${this.config.port}/ws`)

          resolve()
        })

        this.server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            reject(new Error(`Port ${this.config.port} is already in use`))
          } else {
            reject(error)
          }
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        // Close all SSE connections
        for (const response of this.clients.values()) {
          response.end()
        }
        this.clients.clear()

        // Shutdown WebSocket server
        if (this.wsServer) {
          this.wsServer.shutdown()
        }

        this.server.close(() => {
          console.log('🛑 Background Agents API server stopped')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}

// Default configuration
export const defaultAPIConfig: APIServerConfig = {
  port: 3000,
  cors: {
    origin: ['http://localhost:3001', 'http://localhost:8080'],
    credentials: true,
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
  },
  queue: {
    type: 'local',
  },
}
