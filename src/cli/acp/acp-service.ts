/**
 * NikCLI ACP Service - Integration with official Agent Client Protocol
 * Uses @zed-industries/agent-client-protocol package instead of custom implementation
 */

import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import {
  type Agent
} from '@zed-industries/agent-client-protocol';
import {
  type InitializeRequest,
  type InitializeResponse,
  type AuthenticateRequest,
  type NewSessionRequest,
  type NewSessionResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type CancelNotification,
  type SessionNotification,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
  type AgentCapabilities,
  type ClientCapabilities,
  type AuthMethod,
  PROTOCOL_VERSION,
  AGENT_METHODS,
  CLIENT_METHODS
} from '@zed-industries/agent-client-protocol';

export interface AcpServiceConfig {
  workingDirectory?: string;
  debug?: boolean;
  timeout?: number;
  services?: {
    orchestrator?: any;
    toolService?: any;
    modelProvider?: any;
    memoryService?: any;
    cacheService?: any;
    permissionService?: any;
  };
}

export interface AcpServiceStats {
  uptime: number;
  totalSessions: number;
  activeSessions: number;
  totalMessages: number;
  totalToolExecutions: number;
  errorCount: number;
}

export class AcpService extends EventEmitter {
  private agent!: NikCLIAgent;
  private config: Required<AcpServiceConfig>;
  private startTime: Date;
  private stats: AcpServiceStats;
  private running = false;

  constructor(config: AcpServiceConfig = {}) {
    super();

    this.config = {
      workingDirectory: config.workingDirectory || process.cwd(),
      debug: config.debug || false,
      timeout: config.timeout || 30000,
      services: config.services || {},
    };

    this.startTime = new Date();
    this.stats = {
      uptime: 0,
      totalSessions: 0,
      activeSessions: 0,
      totalMessages: 0,
      totalToolExecutions: 0,
      errorCount: 0,
    };

    this.setupComponents();
  }

  private setupComponents(): void {
    // Initialize NikCLI agent
    const agentConfig: NikCLIAgentConfig = {
      workingDirectory: this.config.workingDirectory,
      debug: this.config.debug,
      services: this.config.services,
      capabilities: this.getDefaultCapabilities(),
      authMethods: this.getDefaultAuthMethods(),
    };

    this.agent = new NikCLIAgent(agentConfig);
  }

  private getDefaultCapabilities(): AgentCapabilities {
    return {
      loadSession: true,
      promptCapabilities: {
        image: true,
        audio: false,
        embeddedContext: true,
      },
    };
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
    ];
  }

  // ====================== MAIN SERVICE INTERFACE ======================

  async start(input?: Readable, output?: Writable): Promise<void> {
    if (this.running) {
      throw new Error('ACP Service is already running');
    }

    try {
      this.log('Starting NikCLI ACP Service', {
        workingDirectory: this.config.workingDirectory,
        timeout: this.config.timeout,
      });

      // For Zed integration, we need to handle the connection properly
      // The ACP protocol expects the service to be ready for communication
      this.log('ACP Service initialized for Zed integration');

      // Set up proper signal handling for Zed
      this.setupZedSignalHandling();

      this.running = true;
      this.log('NikCLI ACP Service started successfully - ready for Zed connection');
      this.emit('started');

      // Keep the service running for Zed
      this.keepAlive();

    } catch (error) {
      this.logError('Failed to start ACP Service', error);
      this.stats.errorCount++;
      throw error;
    }
  }

  private setupZedSignalHandling(): void {
    // Handle Zed-specific signals
    process.on('SIGTERM', () => {
      this.log('Received SIGTERM from Zed, shutting down gracefully');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      this.log('Received SIGINT from Zed, shutting down gracefully');
      this.gracefulShutdown('SIGINT');
    });

    // Handle process exit
    process.on('exit', (code) => {
      this.log(`Process exiting with code: ${code}`);
    });
  }

  private keepAlive(): void {
    // Keep the service running for Zed
    // This prevents the process from exiting immediately
    const keepAliveInterval = setInterval(() => {
      if (!this.running) {
        clearInterval(keepAliveInterval);
        return;
      }

      // Log heartbeat for debugging
      if (this.config.debug) {
        this.log('ACP Service heartbeat - waiting for Zed connection');
      }
    }, 30000); // Every 30 seconds

    // Store the interval for cleanup
    (this as any).keepAliveInterval = keepAliveInterval;
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    this.log('Stopping NikCLI ACP Service');

    try {
      // Clean up keep alive interval
      if ((this as any).keepAliveInterval) {
        clearInterval((this as any).keepAliveInterval);
        (this as any).keepAliveInterval = undefined;
      }

      // Shutdown agent
      this.agent.shutdown();

      this.running = false;
      this.log('NikCLI ACP Service stopped');
      this.emit('stopped');

    } catch (error) {
      this.logError('Error stopping ACP Service', error);
      this.stats.errorCount++;
    }
  }

  // ====================== STATISTICS AND MONITORING ======================

  getStats(): AcpServiceStats {
    const now = new Date();
    this.stats.uptime = now.getTime() - this.startTime.getTime();
    return { ...this.stats };
  }

  getDetailedStats(): any {
    const stats = this.getStats();
    return {
      ...stats,
      memoryUsage: process.memoryUsage(),
      config: {
        workingDirectory: this.config.workingDirectory,
        timeout: this.config.timeout,
        debug: this.config.debug,
      },
    };
  }

  // ====================== SERVICE MANAGEMENT ======================

  isRunning(): boolean {
    return this.running;
  }

  getWorkingDirectory(): string {
    return this.config.workingDirectory;
  }

  updateServices(services: Partial<AcpServiceConfig['services']>): void {
    this.config.services = { ...this.config.services, ...services };
    this.log('Services updated', Object.keys(services || {}));
  }

  // ====================== UTILITIES ======================

  private log(message: string, data?: any): void {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [NikCLI ACP Service] ${message}`, data || '');
    }
  }

  private logError(message: string, error: any): void {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] [NikCLI ACP Service] ERROR: ${message}`, error);
    }
  }

  // ====================== LIFECYCLE HANDLERS ======================

  async gracefulShutdown(signal: string): Promise<void> {
    this.log(`Received ${signal}, initiating graceful shutdown`);

    try {
      await this.stop();
      this.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      this.logError('Error during graceful shutdown', error);
      process.exit(1);
    }
  }
}

// ====================== NIKCLI AGENT IMPLEMENTATION ======================

interface NikCLIAgentConfig {
  workingDirectory: string;
  capabilities?: AgentCapabilities;
  authMethods?: AuthMethod[];
  services?: any;
  debug?: boolean;
}

class NikCLIAgent implements Agent {
  private sessions: Map<string, SessionData> = new Map();
  private config: Required<NikCLIAgentConfig>;

  constructor(config: NikCLIAgentConfig) {
    this.config = {
      workingDirectory: config.workingDirectory || process.cwd(),
      capabilities: config.capabilities || this.getDefaultCapabilities(),
      authMethods: config.authMethods || this.getDefaultAuthMethods(),
      services: config.services || {},
      debug: config.debug || false,
    };
  }

  private getDefaultCapabilities(): AgentCapabilities {
    return {
      loadSession: true,
      promptCapabilities: {
        image: true,
        audio: false,
        embeddedContext: true,
      },
    };
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
    ];
  }

  // ====================== AGENT INTERFACE IMPLEMENTATION ======================

  async initialize(request: InitializeRequest): Promise<InitializeResponse> {
    try {
      this.log('Initialize request received', { clientCapabilities: request.clientCapabilities });

      // Validate protocol version compatibility
      if (request.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error(`Unsupported protocol version: ${request.protocolVersion}`);
      }

      const response: InitializeResponse = {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: this.config.capabilities,
        authMethods: this.config.authMethods,
      };

      this.log('Initialize response sent', response);
      return response;

    } catch (error) {
      this.logError('Initialize failed', error);
      throw error;
    }
  }

  async authenticate(request: AuthenticateRequest): Promise<void> {
    try {
      this.log('Authenticate request received', { methodId: request.methodId });

      // Handle different authentication methods
      switch (request.methodId) {
        case 'api_key':
          await this.authenticateApiKey();
          break;
        case 'none':
          // No authentication required
          break;
        default:
          throw new Error(`Unknown authentication method: ${request.methodId}`);
      }

      this.log('Authentication successful');

    } catch (error) {
      this.logError('Authentication failed', error);
      throw error;
    }
  }

  private async authenticateApiKey(): Promise<void> {
    // Check if NikCLI has valid API keys configured
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const hasGoogleKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!hasAnthropicKey && !hasOpenAIKey && !hasGoogleKey) {
      throw new Error('No valid API keys found. Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY');
    }
  }

  async newSession(request: NewSessionRequest): Promise<NewSessionResponse> {
    try {
      this.log('New session request received', { cwd: request.cwd });

      // Create new session
      const sessionId = this.createSession(request.cwd);

      const response: NewSessionResponse = {
        sessionId,
      };

      this.log('New session created', response);
      return response;

    } catch (error) {
      this.logError('New session failed', error);
      throw error;
    }
  }

  async loadSession(request: LoadSessionRequest): Promise<void> {
    try {
      this.log('Load session request received', { sessionId: request.sessionId });

      // Check if session exists
      const session = this.sessions.get(request.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${request.sessionId}`);
      }

      if (session.cancelled) {
        throw new Error(`Session cancelled: ${request.sessionId}`);
      }

      this.log('Session loaded successfully', { sessionId: request.sessionId });

    } catch (error) {
      this.logError('Load session failed', error);
      throw error;
    }
  }

  async prompt(request: PromptRequest): Promise<PromptResponse> {
    try {
      this.log('Prompt request received', {
        sessionId: request.sessionId,
        promptBlocks: request.prompt.length
      });

      // Validate session
      const session = this.sessions.get(request.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${request.sessionId}`);
      }

      if (session.cancelled) {
        throw new Error(`Session cancelled: ${request.sessionId}`);
      }

      // Process the prompt using NikCLI's AI capabilities
      const stopReason = await this.processPrompt(request);

      const response: PromptResponse = {
        stopReason,
      };

      this.log('Prompt processing completed', response);
      return response;

    } catch (error) {
      this.logError('Prompt processing failed', error);
      throw error;
    }
  }

  async cancel(notification: CancelNotification): Promise<void> {
    try {
      this.log('Cancel notification received', { sessionId: notification.sessionId });

      const cancelled = this.cancelSession(notification.sessionId);
      if (!cancelled) {
        this.log('Session not found for cancellation', { sessionId: notification.sessionId });
        return;
      }

      this.log('Session cancelled', { sessionId: notification.sessionId });

    } catch (error) {
      this.logError('Cancel failed', error);
    }
  }

  // ====================== SESSION MANAGEMENT ======================

  private createSession(cwd: string): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const session: SessionData = {
      id: sessionId,
      cwd: this.isAbsolutePath(cwd) ? cwd : this.config.workingDirectory,
      createdAt: new Date(),
      lastActivity: new Date(),
      cancelled: false,
    };

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  private cancelSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.cancelled = true;
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }

  private isAbsolutePath(path: string): boolean {
    return path.startsWith('/') || /^[A-Za-z]:\\/.test(path);
  }

  // ====================== PROMPT PROCESSING ======================

  private async processPrompt(request: PromptRequest): Promise<'end_turn' | 'max_tokens' | 'refusal' | 'cancelled'> {
    const session = this.sessions.get(request.sessionId)!;

    try {
      // Convert prompt blocks to text
      const userMessage = this.convertContentBlocksToText(request.prompt);

      // Process with NikCLI's AI system
      if (this.config.services.orchestrator) {
        // Use existing orchestrator service
        await this.processWithOrchestrator(request.sessionId, userMessage, session.cwd);
      } else {
        // Fallback to simple processing
        await this.processWithSimpleResponse(request.sessionId, userMessage);
      }

      return 'end_turn';

    } catch (error) {
      if (session.cancelled) {
        return 'cancelled';
      }

      return 'refusal';
    }
  }

  private async processWithOrchestrator(sessionId: string, message: string, cwd: string): Promise<void> {
    // TODO: Integrate with actual NikCLI orchestrator service
    this.log('Processing with NikCLI orchestrator', { sessionId, cwd, message });
  }

  private async processWithSimpleResponse(sessionId: string, message: string): Promise<void> {
    this.log('Processing with simple response', { sessionId, message });
  }

  private convertContentBlocksToText(blocks: any[]): string {
    return blocks
      .map(block => {
        switch (block.type) {
          case 'text':
            return block.text;
          case 'resource':
            const resourceText = 'text' in block.resource ? block.resource.text : '[Binary resource]';
            return `[Resource: ${block.resource.uri}]\n${resourceText}`;
          case 'resource_link':
            return `[Link: ${block.name} - ${block.uri}]`;
          case 'image':
            return `[Image: ${block.mimeType}]`;
          case 'audio':
            return `[Audio: ${block.mimeType}]`;
          default:
            return '[Unknown content type]';
        }
      })
      .join('\n\n');
  }

  // ====================== UTILITIES ======================

  private log(message: string, data?: any): void {
    if (this.config.debug) {
      console.log(`[NikCLI ACP Agent] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  private logError(message: string, error: any): void {
    if (this.config.debug) {
      console.error(`[NikCLI ACP Agent] ERROR: ${message}`, error);
    }
  }

  // ====================== LIFECYCLE ======================

  shutdown(): void {
    this.log('Shutting down NikCLI ACP Agent');

    // Cancel all active sessions
    for (const [id, session] of this.sessions) {
      if (!session.cancelled) {
        this.cancelSession(id);
      }
    }
  }
}

interface SessionData {
  id: string;
  cwd: string;
  createdAt: Date;
  lastActivity: Date;
  cancelled: boolean;
}

// ====================== SERVICE FACTORY ======================

export class AcpServiceFactory {
  static create(config?: AcpServiceConfig): AcpService {
    return new AcpService(config);
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
    };

    return new AcpService(serviceConfig);
  }
}

// ====================== EXPORTS ======================

export default AcpService;