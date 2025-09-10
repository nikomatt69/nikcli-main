// src/cli/background-agents/api/server.ts

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { backgroundAgentService } from '../background-agent-service';
import { JobQueue } from '../queue/job-queue';
import { GitHubIntegration } from '../github/github-integration';
import { securityPolicy } from '../security/security-policy';
import { BackgroundJob, JobStatus, CreateBackgroundJobRequest } from '../types';
import { setupWebRoutes } from './web-routes';
import { BackgroundAgentsWebSocketServer } from './websocket-server';

export interface APIServerConfig {
  port: number;
  cors: {
    origin: string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  github?: {
    appId: string;
    privateKey: string;
    installationId: string;
    webhookSecret: string;
  };
  queue: {
    type: 'local' | 'redis';
    redis?: {
      host: string;
      port: number;
      password?: string;
    };
  };
}

export class BackgroundAgentsAPIServer {
  private app: express.Application;
  private server?: any;
  private config: APIServerConfig;
  private jobQueue: JobQueue;
  private githubIntegration?: GitHubIntegration;
  private clients: Map<string, express.Response> = new Map();
  private wsServer?: BackgroundAgentsWebSocketServer;

  constructor(config: APIServerConfig) {
    this.config = config;
    this.app = express();
    this.jobQueue = new JobQueue({
      type: config.queue.type,
      redis: config.queue.redis,
      maxConcurrentJobs: 3,
      retryAttempts: 3,
      retryDelay: 5000,
    });

    // Initialize GitHub integration if configured
    if (config.github) {
      this.githubIntegration = new GitHubIntegration(config.github);
    }

    this.setupMiddleware();
    this.setupRoutes();
    this.setupEventListeners();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Security
    this.app.use(helmet());
    this.app.use(cors({
      origin: this.config.cors.origin,
      credentials: this.config.cors.credentials,
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.max,
      message: 'Too many requests from this IP',
    });
    this.app.use('/v1/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime(),
      });
    });

    // API v1 routes
    const v1 = express.Router();

    // Jobs
    v1.post('/jobs', this.createJob.bind(this));
    v1.get('/jobs', this.listJobs.bind(this));
    v1.get('/jobs/:id', this.getJob.bind(this));
    v1.delete('/jobs/:id', this.cancelJob.bind(this));
    v1.get('/jobs/:id/stream', this.streamJobLogs.bind(this));
    v1.post('/jobs/:id/message', this.sendFollowUpMessage.bind(this));

    // Stats
    v1.get('/stats', this.getStats.bind(this));

    // Queue management
    v1.get('/queue/stats', this.getQueueStats.bind(this));
    v1.post('/queue/clear', this.clearQueue.bind(this));

    // Security
    v1.get('/security/violations', this.getSecurityViolations.bind(this));
    v1.get('/security/violations/:jobId', this.getJobSecurityReport.bind(this));

    // GitHub webhooks
    if (this.githubIntegration) {
      v1.post('/github/webhook', this.handleGitHubWebhook.bind(this));
    }

    this.app.use('/v1', v1);

    // Setup web interface routes
    setupWebRoutes(this.app);

    // Serve Next.js static files in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static('.next/static'));
    }

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`,
      });
    });

    // Error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('API Error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
      });
    });
  }

  /**
   * Setup event listeners for real-time updates
   */
  private setupEventListeners(): void {
    // Job events
    backgroundAgentService.on('job:created', (job: BackgroundJob) => {
      this.broadcastToClients('job:created', job);
    });

    backgroundAgentService.on('job:started', (job: BackgroundJob) => {
      this.broadcastToClients('job:started', job);
    });

    backgroundAgentService.on('job:completed', (job: BackgroundJob) => {
      this.broadcastToClients('job:completed', job);
    });

    backgroundAgentService.on('job:failed', (job: BackgroundJob) => {
      this.broadcastToClients('job:failed', job);
    });

    backgroundAgentService.on('job:log', (jobId: string, logEntry: any) => {
      this.broadcastToClients('job:log', { jobId, logEntry });
    });

    // Queue events
    this.jobQueue.on('job:queued', (jobId: string) => {
      this.broadcastToClients('queue:job:queued', { jobId });
    });

    this.jobQueue.on('job:processing', (jobId: string) => {
      this.broadcastToClients('queue:job:processing', { jobId });
    });

    this.jobQueue.on('job:completed', (jobId: string) => {
      this.broadcastToClients('queue:job:completed', { jobId });
    });
  }

  /**
   * Create a new background job
   */
  private async createJob(req: express.Request, res: express.Response): Promise<void> {
    try {
      const request: CreateBackgroundJobRequest = req.body;

      // Validate request
      if (!request.repo || !request.task) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required fields: repo, task',
        });
        return;
      }

      // Create job
      const jobId = await backgroundAgentService.createJob(request);

      // Add to queue
      await this.jobQueue.addJob(jobId, request.priority || 5);

      const job = backgroundAgentService.getJob(jobId);

      res.status(201).json({
        jobId,
        job,
        message: 'Job created successfully',
      });

    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }

  /**
   * List jobs with filtering
   */
  private async listJobs(req: express.Request, res: express.Response): Promise<void> {
    try {
      const {
        status,
        limit = '50',
        offset = '0',
        repo,
      } = req.query;

      const jobs = backgroundAgentService.listJobs({
        status: status as JobStatus,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });

      // Filter by repo if specified
      let filteredJobs = jobs;
      if (repo) {
        filteredJobs = jobs.filter(job => job.repo === repo);
      }

      res.json({
        jobs: filteredJobs,
        total: filteredJobs.length,
        offset: parseInt(offset as string),
        limit: parseInt(limit as string),
      });

    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }

  /**
   * Get job by ID
   */
  private async getJob(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const job = backgroundAgentService.getJob(id);

      if (!job) {
        res.status(404).json({
          error: 'Not Found',
          message: `Job ${id} not found`,
        });
        return;
      }

      res.json({ job });

    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }

  /**
   * Cancel job
   */
  private async cancelJob(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const success = await backgroundAgentService.cancelJob(id);

      if (!success) {
        res.status(404).json({
          error: 'Not Found',
          message: `Job ${id} not found or cannot be cancelled`,
        });
        return;
      }

      res.json({
        message: `Job ${id} cancelled successfully`,
      });

    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }

  /**
   * Stream job logs using Server-Sent Events
   */
  private streamJobLogs(req: express.Request, res: express.Response): void {
    const { id } = req.params;
    const job = backgroundAgentService.getJob(id);

    if (!job) {
      res.status(404).json({
        error: 'Not Found',
        message: `Job ${id} not found`,
      });
      return;
    }

    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    const clientId = `${id}-${Date.now()}`;
    this.clients.set(clientId, res);

    // Send existing logs
    job.logs.forEach(log => {
      res.write(`data: ${JSON.stringify({ type: 'log', data: log })}\n\n`);
    });

    // Send initial job status
    res.write(`data: ${JSON.stringify({ type: 'job', data: job })}\n\n`);

    // Setup job-specific event listener
    const logHandler = (jobId: string, logEntry: any) => {
      if (jobId === id) {
        res.write(`data: ${JSON.stringify({ type: 'log', data: logEntry })}\n\n`);
      }
    };

    const jobHandler = (eventJob: BackgroundJob) => {
      if (eventJob.id === id) {
        res.write(`data: ${JSON.stringify({ type: 'job', data: eventJob })}\n\n`);
      }
    };

    backgroundAgentService.on('job:log', logHandler);
    backgroundAgentService.on('job:started', jobHandler);
    backgroundAgentService.on('job:completed', jobHandler);
    backgroundAgentService.on('job:failed', jobHandler);

    // Handle client disconnect
    req.on('close', () => {
      this.clients.delete(clientId);
      backgroundAgentService.off('job:log', logHandler);
      backgroundAgentService.off('job:started', jobHandler);
      backgroundAgentService.off('job:completed', jobHandler);
      backgroundAgentService.off('job:failed', jobHandler);
    });

    // Send periodic heartbeat
    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', data: { timestamp: Date.now() } })}\n\n`);
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
    });
  }

  /**
   * Send follow-up message to job
   */
  private async sendFollowUpMessage(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const { message, priority = 'normal' } = req.body;

      if (!message) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Message is required',
        });
        return;
      }

      const messageId = await backgroundAgentService.sendFollowUpMessage(id, message, priority);

      res.json({
        messageId,
        message: 'Follow-up message sent successfully',
      });

    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }

  /**
   * Get background agent statistics
   */
  private async getStats(req: express.Request, res: express.Response): Promise<void> {
    try {
      const stats = backgroundAgentService.getStats();
      const queueStats = await this.jobQueue.getStats();

      res.json({
        jobs: stats,
        queue: queueStats,
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }

  /**
   * Get queue statistics
   */
  private async getQueueStats(req: express.Request, res: express.Response): Promise<void> {
    try {
      const stats = await this.jobQueue.getStats();

      res.json({
        queue: stats,
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }

  /**
   * Clear job queue
   */
  private async clearQueue(req: express.Request, res: express.Response): Promise<void> {
    try {
      await this.jobQueue.clear();

      res.json({
        message: 'Queue cleared successfully',
      });

    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }

  /**
   * Get security violations
   */
  private getSecurityViolations(req: express.Request, res: express.Response): void {
    try {
      const violations = securityPolicy.getViolations();

      res.json({
        violations,
        total: violations.length,
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }

  /**
   * Get security report for specific job
   */
  private getJobSecurityReport(req: express.Request, res: express.Response): void {
    try {
      const { jobId } = req.params;
      const report = securityPolicy.generateSecurityReport(jobId);

      res.json({
        jobId,
        report,
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
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
        });
        return;
      }

      const signature = req.headers['x-hub-signature-256'] as string;
      const event = req.headers['x-github-event'] as string;
      const payload = req.body;

      // Verify webhook signature
      const rawBody = JSON.stringify(payload);
      const isValid = GitHubIntegration.verifyWebhookSignature(
        rawBody,
        signature,
        this.config.github!.webhookSecret
      );

      if (!isValid) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid webhook signature',
        });
        return;
      }

      // Handle webhook event
      await this.githubIntegration.handleWebhookEvent(event, payload);

      res.json({
        message: 'Webhook processed successfully',
      });

    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }

  /**
   * Broadcast message to all connected SSE clients
   */
  private broadcastToClients(event: string, data: any): void {
    const message = `data: ${JSON.stringify({ type: event, data })}\n\n`;

    for (const [clientId, response] of this.clients.entries()) {
      try {
        response.write(message);
      } catch (error) {
        // Client disconnected
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, () => {
          console.log(`🚀 Background Agents API server running on port ${this.config.port}`);
          console.log(`📊 Health check: http://localhost:${this.config.port}/health`);
          console.log(`📋 API docs: http://localhost:${this.config.port}/v1`);
          
          // Initialize WebSocket server
          this.wsServer = new BackgroundAgentsWebSocketServer(this.server);
          console.log(`📡 WebSocket server ready on ws://localhost:${this.config.port}/ws`);
          
          resolve();
        });

        this.server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            reject(new Error(`Port ${this.config.port} is already in use`));
          } else {
            reject(error);
          }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        // Close all SSE connections
        for (const response of this.clients.values()) {
          response.end();
        }
        this.clients.clear();

        // Shutdown WebSocket server
        if (this.wsServer) {
          this.wsServer.shutdown();
        }

        this.server.close(() => {
          console.log('🛑 Background Agents API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
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
};
