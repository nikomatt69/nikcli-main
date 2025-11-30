// src/cli/background-agents/api/server.ts

import cors from 'cors'
import express from 'express'
import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import helmet from 'helmet'
import { LRUCache } from 'lru-cache'
import { backgroundAgentService } from '../background-agent-service'
import { GitHubIntegration } from '../github/github-integration'
import { JobQueue } from '../queue/job-queue'
import { securityPolicy } from '../security/security-policy'
import type { BackgroundJob, CreateBackgroundJobRequest, JobStatus } from '../types'
import { setupWebRoutes } from './web-routes'
import { slackRouter } from './slack-routes'
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
  // Cache for jobs and stats endpoints to reduce API calls
  private jobsCache: LRUCache<string, { data: any; timestamp: number }>
  private statsCache: LRUCache<string, { data: any; timestamp: number }>

  constructor(config: APIServerConfig, healthChecker?: HealthChecker) {
    // Validate environment before proceeding
    const envConfig = getEnvironmentConfig()
    console.log(`[Server] Initializing in ${envConfig.nodeEnv} mode`)

    this.config = config
    this.app = express()

    // Trust proxy for Railway/deployment environments (required for express-rate-limit to work correctly)
    // Configure trust proxy securely - trust only the first proxy hop (Railway/Vercel reverse proxy)
    // This prevents bypassing rate limiting while still allowing proper IP detection
    if (process.env.NODE_ENV === 'production') {
      // In production, trust only 1 proxy hop (Railway/Vercel reverse proxy)
      this.app.set('trust proxy', 1)
    } else {
      // In development, trust localhost proxy
      this.app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal'])
    }

    this.healthChecker = healthChecker
    this.jobQueue = new JobQueue({
      type: config.queue.type,
      redis: config.queue.redis,
      maxConcurrentJobs: 3,
      retryAttempts: 3,
      retryDelay: 5000,
    })

    // Initialize LRU caches for jobs and stats endpoints
    // Cache TTL: 2 seconds for jobs (frequently polled), 5 seconds for stats
    this.jobsCache = new LRUCache<string, { data: any; timestamp: number }>({
      max: 100, // Cache up to 100 different query combinations
      ttl: 2000, // 2 seconds TTL
    })

    this.statsCache = new LRUCache<string, { data: any; timestamp: number }>({
      max: 10, // Cache up to 10 different stats queries
      ttl: 5000, // 5 seconds TTL
    })

    // Invalidate cache when jobs change
    backgroundAgentService.on('job:created', () => this.jobsCache.clear())
    backgroundAgentService.on('job:started', () => this.jobsCache.clear())
    backgroundAgentService.on('job:completed', () => {
      this.jobsCache.clear()
      this.statsCache.clear()
    })
    backgroundAgentService.on('job:failed', () => {
      this.jobsCache.clear()
      this.statsCache.clear()
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
      // Use ipKeyGenerator helper for proper IPv6 handling
      keyGenerator: (req) => {
        // Use the real IP from X-Forwarded-For header when behind proxy
        const forwarded = req.headers['x-forwarded-for']
        if (forwarded) {
          // X-Forwarded-For can contain multiple IPs, take the first one (client IP)
          const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded
          const clientIp = ips[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown'
          // Use ipKeyGenerator helper for proper IPv6 normalization
          return ipKeyGenerator(clientIp)
        }
        // Use ipKeyGenerator helper for proper IPv6 normalization
        return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown')
      },
      // Validate trust proxy configuration
      validate: {
        trustProxy: false, // Disable trust proxy validation to avoid errors
      },
      windowMs: 1 * 60 * 1000, // 1 minute window
      max: 5000, // Increased to 5000 requests per minute for monitoring endpoints (with cache, this should be more than enough)
      message: 'Too many monitoring requests from this IP',
      skip: (req) => req.method === 'OPTIONS',
      standardHeaders: true,
      legacyHeaders: false,
      // Disable X-Forwarded-For validation since we trust the proxy

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
      // Use ipKeyGenerator helper for proper IPv6 handling
      keyGenerator: (req) => {
        // Use the real IP from X-Forwarded-For header when behind proxy
        const forwarded = req.headers['x-forwarded-for']
        if (forwarded) {
          // X-Forwarded-For can contain multiple IPs, take the first one (client IP)
          const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded
          const clientIp = ips[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown'
          // Use ipKeyGenerator helper for proper IPv6 normalization
          return ipKeyGenerator(clientIp)
        }
        // Use ipKeyGenerator helper for proper IPv6 normalization
        return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown')
      },
      // Validate trust proxy configuration
      validate: {
        trustProxy: false, // Disable trust proxy validation to avoid errors
      },
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

    // Body parsing with raw body preservation for Slack signature verification
    this.app.use((req, res, next) => {
      if (req.path.startsWith('/v1/slack/')) {
        // For Slack endpoints, preserve raw body for signature verification
        express.json({
          limit: '10mb',
          verify: (req: any, _res, buf, encoding) => {
            req.rawBody = buf.toString((encoding as BufferEncoding) || 'utf8')
          }
        })(req, res, next)
      } else {
        // For other endpoints, use standard JSON parsing
        express.json({ limit: '10mb' })(req, res, next)
      }
    })
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
          version: '1.5.0',
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
        version: '1.5.0',
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

    // Models
    v1.get('/models/openrouter', this.getOpenRouterModels.bind(this))

    // Enterprise: User usage and quota endpoints
    v1.get('/users/:userId/usage', this.getUserUsage.bind(this))
    v1.get('/users/:userId/quota', this.getUserQuota.bind(this))
    v1.put('/users/:userId/quota', this.setUserQuota.bind(this))

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

    // Slack routes
    v1.use('/slack', slackRouter)

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
    // CRITICAL: Connect JobQueue to BackgroundAgentService for automatic job execution
    // This was the missing link that prevented jobs from being executed
    backgroundAgentService.setupQueueListeners(this.jobQueue)

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

      // Get AI provider credentials from headers or use OpenRouter defaults
      let aiProvider = (req.headers['x-ai-provider'] as string | undefined)?.toLowerCase()
      let aiModel = req.headers['x-ai-model'] as string | undefined
      let aiKey = req.headers['x-ai-key'] as string | undefined

      // If no credentials provided, use OpenRouter from environment
      if (!aiKey || !aiProvider) {
        const openRouterKey = process.env.OPENROUTER_API_KEY
        if (openRouterKey) {
          aiProvider = 'openrouter'
          aiKey = openRouterKey
          aiModel = aiModel || process.env.OPENROUTER_MODEL || '@preset/nikcli'
          console.log('[API] Using OpenRouter from environment variables (default)')
        } else {
          res.status(400).json({
            error: 'Bad Request',
            message: 'Missing AI provider credentials. Provide x-ai-provider and x-ai-key headers, or set OPENROUTER_API_KEY environment variable.',
          })
          return
        }
      }

      // Mask key in any logs
      const maskedKey = `${aiKey.slice(0, 4)}****${aiKey.slice(-4)}`
      console.log('[API] AI credentials:', { provider: aiProvider, model: aiModel, key: maskedKey })

      // Inject credentials into job context
      if (!request.envVars) {
        request.envVars = {}
      }
      request.envVars.AI_PROVIDER = aiProvider
      request.envVars.AI_MODEL = aiModel || ''
      request.envVars.AI_API_KEY = aiKey

      // Enterprise: Extract userId from header or request body
      const userId = (req.headers['x-user-id'] as string) || request.userId
      if (userId) {
        request.userId = userId
        console.log(`[API] Job created for user: ${userId}`)
      }

      // Enterprise: Check quota before creating job
      if (userId) {
        const { safeDynamicImport } = await import('../utils/esm-fix-loader')
        const usageTrackerModule = await safeDynamicImport('../services/user-usage-tracker', process.cwd())
        const quotaServiceModule = await safeDynamicImport('../services/user-quota-service', process.cwd())
        const usageTracker = usageTrackerModule.getUserUsageTracker()
        const quotaService = quotaServiceModule.getUserQuotaService()

        const usage = usageTracker.getUsageStats(userId)
        if (usage) {
          const quotaCheck = quotaService.checkJobCreationAllowed(userId, usage)
          if (!quotaCheck.allowed) {
            res.status(429).json({
              error: 'Quota Exceeded',
              message: quotaCheck.reason,
              remaining: quotaCheck.remaining,
            })
            return
          }
        }
      }

      // Create job
      console.log(`[API] POST /v1/jobs - Creating job for repo: ${request.repo}, task: ${request.task.substring(0, 50)}...`)
      const jobId = await backgroundAgentService.createJob(request)
      console.log(`[API] Job created with ID: ${jobId}`)

      // Add to queue
      await this.jobQueue.addJob(jobId, request.priority || 5)

      const job = backgroundAgentService.getJob(jobId)
      console.log(`[API] Job retrieved after creation: ${job ? 'found' : 'NOT FOUND'}`)

      res.status(201).json({
        jobId,
        job,
        message: 'Job created successfully',
      })
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
    }
  }

  /**
   * List jobs with filtering (with caching)
   */
  private async listJobs(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { status, limit = '50', offset = '0', repo } = req.query

      // Create cache key from query parameters
      const cacheKey = `jobs:${status || 'all'}:${limit}:${offset}:${repo || 'all'}`

      // Check cache first
      const cached = this.jobsCache.get(cacheKey)
      if (cached) {
        res.setHeader('X-Cache', 'HIT')
        res.setHeader('X-Cache-Age', Math.floor((Date.now() - cached.timestamp) / 1000))
        res.json(cached.data)
        return
      }

      await backgroundAgentService.waitForInitialization()
      const jobs = await backgroundAgentService.listJobs({
        status: status as JobStatus,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      })

      // Log for debugging (only on cache miss)
      console.log(`[API] GET /v1/jobs - Found ${jobs.length} jobs`)

      // Filter by repo if specified
      let filteredJobs = jobs
      if (repo) {
        filteredJobs = jobs.filter((job) => job.repo === repo)
        console.log(`[API] Filtered by repo ${repo}: ${filteredJobs.length} jobs`)
      }

      const responseData = {
        jobs: filteredJobs,
        total: filteredJobs.length,
        offset: parseInt(offset as string, 10),
        limit: parseInt(limit as string, 10),
      }

      // Cache the response
      this.jobsCache.set(cacheKey, {
        data: responseData,
        timestamp: Date.now(),
      })

      res.setHeader('X-Cache', 'MISS')
      res.json(responseData)
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
    }
  }

  /**
   * Get available OpenRouter models
   */
  private async getOpenRouterModels(_req: express.Request, res: express.Response): Promise<void> {
    try {
      console.log('[API] Fetching OpenRouter models...')

      const response = await fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as { data?: any[] }
      const models = Array.isArray(data.data) ? data.data : []

      // Filter and format models
      const formattedModels = models
        .map((model: any) => ({
          id: model.id,
          name: model.name || model.id,
          context_length: model.context_length || 0,
          pricing: {
            prompt: model.pricing?.prompt || '0',
            completion: model.pricing?.completion || '0',
          },
          architecture: {
            modality: model.architecture?.modality || 'text',
            tokenizer: model.architecture?.tokenizer || 'unknown',
          },
          top_provider: model.top_provider || null,
          per_request_limits: model.per_request_limits || null,
        }))
        .filter((model: any) => {
          // Filter out models without IDs
          return model.id && model.id.length > 0
        })
        .sort((a: any, b: any) => {
          // Sort: @preset/nikcli first, then by name
          if (a.id === '@preset/nikcli') return -1
          if (b.id === '@preset/nikcli') return 1
          return a.name.localeCompare(b.name)
        })

      console.log(`[API] Retrieved ${formattedModels.length} OpenRouter models`)

      res.json({
        success: true,
        models: formattedModels,
        total: formattedModels.length,
      })
      return
    } catch (error: any) {
      console.error('[API] Error fetching OpenRouter models:', error)
      res.status(500).json({
        success: false,
        error: 'Failed to fetch OpenRouter models',
        message: error.message,
      })
      return
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
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
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
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
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
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
    }
  }

  /**
   * Enterprise: Get user usage statistics
   */
  private async getUserUsage(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { userId } = req.params

      const { safeDynamicImport } = await import('../utils/esm-fix-loader')
      const usageTrackerModule = await safeDynamicImport('../services/user-usage-tracker', process.cwd())
      const usageTracker = usageTrackerModule.getUserUsageTracker()

      const usage = usageTracker.getUsageStats(userId)
      if (!usage) {
        res.status(404).json({
          error: 'Not Found',
          message: `No usage data found for user: ${userId}`,
        })
        return
      }

      res.json(usage)
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
    }
  }

  /**
   * Enterprise: Get user quota
   */
  private async getUserQuota(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { userId } = req.params

      const { safeDynamicImport } = await import('../utils/esm-fix-loader')
      const quotaServiceModule = await safeDynamicImport('../services/user-quota-service', process.cwd())
      const quotaService = quotaServiceModule.getUserQuotaService()

      const quota = quotaService.getQuota(userId)
      if (!quota) {
        res.status(404).json({
          error: 'Not Found',
          message: `No quota found for user: ${userId}`,
        })
        return
      }

      res.json(quota)
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
    }
  }

  /**
   * Enterprise: Set user quota
   */
  private async setUserQuota(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { userId } = req.params
      const quota = req.body

      const { safeDynamicImport } = await import('../utils/esm-fix-loader')
      const quotaServiceModule = await safeDynamicImport('../services/user-quota-service', process.cwd())
      const quotaService = quotaServiceModule.getUserQuotaService()

      quotaService.setQuota(userId, {
        userId,
        ...quota,
      })

      res.json({
        message: 'Quota updated successfully',
        quota: quotaService.getQuota(userId),
      })
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
    }
  }

  /**
   * Get background agent statistics (with caching)
   */
  private async getStats(_req: express.Request, res: express.Response): Promise<void> {
    try {
      const cacheKey = 'stats:all'

      // Check cache first
      const cached = this.statsCache.get(cacheKey)
      if (cached) {
        res.setHeader('X-Cache', 'HIT')
        res.setHeader('X-Cache-Age', Math.floor((Date.now() - cached.timestamp) / 1000))
        res.json(cached.data)
        return
      }

      const stats = backgroundAgentService.getStats()
      const queueStats = await this.jobQueue.getStats()

      const responseData = {
        jobs: stats,
        queue: queueStats,
        timestamp: new Date().toISOString(),
      }

      // Cache the response
      this.statsCache.set(cacheKey, {
        data: responseData,
        timestamp: Date.now(),
      })

      res.setHeader('X-Cache', 'MISS')
      res.json(responseData)
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
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
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
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
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
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
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
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
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
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
      return
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      })
      return
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
    max: 50000, // 50000 requests per window (increased with caching support)
  },
  queue: {
    type: 'local',
  },
}
