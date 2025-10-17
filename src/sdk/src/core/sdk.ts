/**
 * NikCLI SDK Core
 * Main SDK class for initializing and managing TTY applications
 */

import { AgentManager } from './agent-manager'
import { StreamManager } from './stream-manager'
import type {
  SDKConfig,
  AgentConfig,
  AgentTask,
  AgentTaskResult,
  StreamEvent,
  StreamConfig,
  CreateAgentTask,
  UseAgentReturn,
  UseStreamReturn,
  UseTTYReturn,
} from '../types'

/**
 * NikCLI SDK Main Class
 * Central hub for all SDK functionality
 */
export class NikCLISDK {
  private agentManager: AgentManager
  private streamManager: StreamManager
  private config: SDKConfig
  private isInitialized = false

  constructor(config: Partial<SDKConfig> = {}) {
    // Set default configuration
    this.config = {
      apiKeys: {},
      defaultModel: 'claude-3-5-sonnet-20241022',
      workingDirectory: process.cwd(),
      logLevel: 'info',
      enableStreaming: true,
      enableAgents: true,
      enableTools: true,
      maxConcurrentTasks: 5,
      defaultTimeout: 300000,
      retryPolicy: {
        maxAttempts: 3,
        backoffMs: 1000,
        backoffMultiplier: 2,
        retryableErrors: ['NetworkError', 'TimeoutError'],
      },
      ...config,
    }

    // Initialize managers
    this.agentManager = new AgentManager({
      maxConcurrentTasks: this.config.maxConcurrentTasks,
    })

    this.streamManager = new StreamManager({
      enableRealTimeUpdates: this.config.enableStreaming,
      tokenTrackingEnabled: true,
      maxStreamDuration: this.config.defaultTimeout,
    })

    this.setupEventHandlers()
  }

  /**
   * Initialize the SDK
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('SDK is already initialized')
      return
    }

    try {
      console.log('Initializing NikCLI SDK...')

      // Validate API keys
      this.validateApiKeys()

      // Setup working directory
      this.setupWorkingDirectory()

      // Initialize streaming if enabled
      if (this.config.enableStreaming) {
        await this.streamManager.startStream()
      }

      this.isInitialized = true
      console.log('NikCLI SDK initialized successfully')
    } catch (error) {
      console.error('Failed to initialize NikCLI SDK:', error)
      throw error
    }
  }

  /**
   * Validate API keys
   */
  private validateApiKeys(): void {
    const { apiKeys } = this.config
    const hasAnyKey = Object.values(apiKeys).some(key => key && key.length > 0)

    if (!hasAnyKey) {
      console.warn('No API keys provided. Some features may not work.')
    }
  }

  /**
   * Setup working directory
   */
  private setupWorkingDirectory(): void {
    try {
      process.chdir(this.config.workingDirectory)
      console.log(`Working directory set to: ${this.config.workingDirectory}`)
    } catch (error) {
      console.warn(`Failed to set working directory: ${error}`)
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Forward agent events to stream manager
    this.agentManager.addEventListener('agent.registered', (event) => {
      this.streamManager.handleAgentEvent(event)
    })

    this.agentManager.addEventListener('task.started', (event) => {
      this.streamManager.handleAgentEvent(event)
    })

    this.agentManager.addEventListener('task.progress', (event) => {
      this.streamManager.handleAgentEvent(event)
    })

    this.agentManager.addEventListener('task.completed', (event) => {
      this.streamManager.handleAgentEvent(event)
    })

    this.agentManager.addEventListener('task.failed', (event) => {
      this.streamManager.handleAgentEvent(event)
    })

    this.agentManager.addEventListener('error.occurred', (event) => {
      this.streamManager.handleAgentEvent(event)
    })
  }

  /**
   * Get agent manager
   */
  getAgentManager(): AgentManager {
    return this.agentManager
  }

  /**
   * Get stream manager
   */
  getStreamManager(): StreamManager {
    return this.streamManager
  }

  /**
   * Get configuration
   */
  getConfig(): SDKConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SDKConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // Update managers with new config
    if (newConfig.maxConcurrentTasks) {
      // Would need to recreate agent manager with new config
      console.warn('Changing maxConcurrentTasks requires SDK restart')
    }

    if (newConfig.enableStreaming !== undefined) {
      if (newConfig.enableStreaming && !this.streamManager) {
        this.streamManager = new StreamManager()
      } else if (!newConfig.enableStreaming && this.streamManager) {
        this.streamManager.stopStream()
      }
    }
  }

  /**
   * Register an agent
   */
  async registerAgent(agent: AgentConfig): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('SDK must be initialized before registering agents')
    }

    await this.agentManager.registerAgent(agent)
  }

  /**
   * Execute a task
   */
  async executeTask(task: CreateAgentTask, preferredAgentId?: string): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('SDK must be initialized before executing tasks')
    }

    return this.agentManager.scheduleTask(task, preferredAgentId)
  }

  /**
   * Send a message through the stream
   */
  async sendMessage(message: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('SDK must be initialized before sending messages')
    }

    if (!this.config.enableStreaming) {
      throw new Error('Streaming is disabled')
    }

    await this.streamManager.sendMessage(message, metadata)
  }

  /**
   * Get system statistics
   */
  getStats() {
    return {
      initialized: this.isInitialized,
      config: this.config,
      agents: this.agentManager.getStats(),
      stream: this.streamManager.getStats(),
    }
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    console.log('Cleaning up NikCLI SDK...')

    await Promise.all([
      this.agentManager.cleanup(),
      this.streamManager.cleanup(),
    ])

    this.isInitialized = false
    console.log('NikCLI SDK cleanup completed')
  }

  /**
   * Create a useAgent hook (for React integration)
   */
  createUseAgentHook(agentId: string): UseAgentReturn {
    const agent = this.agentManager.getAgent(agentId)
    const metrics = agent ? this.agentManager.getAgentMetrics(agentId) : null

    return {
      agent,
      status: agent ? 'ready' : 'offline',
      metrics: metrics || {
        tasksExecuted: 0,
        tasksSucceeded: 0,
        tasksFailed: 0,
        tasksInProgress: 0,
        averageExecutionTime: 0,
        totalExecutionTime: 0,
        successRate: 0,
        tokensConsumed: 0,
        apiCallsTotal: 0,
        lastActive: new Date(),
        uptime: 0,
        productivity: 0,
        accuracy: 0,
      },
      tasks: [], // Would need to implement task tracking
      executeTask: async (task) => {
        const taskId = await this.executeTask(task, agentId)
        // Would need to return actual result
        return {
          taskId,
          agentId,
          status: 'completed',
          startTime: new Date(),
          endTime: new Date(),
        }
      },
      cancelTask: async (taskId) => {
        await this.agentManager.cancelTask(taskId)
      },
      refresh: async () => {
        // Refresh agent data
      },
      error: null,
      loading: false,
    }
  }

  /**
   * Create a useStream hook (for React integration)
   */
  createUseStreamHook(): UseStreamReturn {
    return {
      events: this.streamManager.getEvents(),
      isStreaming: this.streamManager['isStreaming'],
      startStream: async (config) => {
        if (config) {
          this.streamManager.updateConfig(config)
        }
        await this.streamManager.startStream()
      },
      stopStream: () => {
        this.streamManager.stopStream()
      },
      sendMessage: async (message) => {
        await this.sendMessage(message)
      },
      clearEvents: () => {
        this.streamManager.clearEvents()
      },
      error: null,
    }
  }

  /**
   * Create a useTTY hook (for React integration)
   */
  createUseTTYHook(): UseTTYReturn {
    return {
      input: '',
      output: '',
      history: [],
      setInput: (value) => {
        // Would need to implement input state management
      },
      submitInput: async () => {
        // Would need to implement input submission
      },
      clearOutput: () => {
        this.streamManager.clearEvents()
      },
      addToHistory: (item) => {
        // Would need to implement history management
      },
      navigateHistory: (direction) => {
        // Would need to implement history navigation
      },
      error: null,
      loading: false,
    }
  }
}

/**
 * Create SDK instance
 */
export function createSDK(config?: Partial<SDKConfig>): NikCLISDK {
  return new NikCLISDK(config)
}

/**
 * Default SDK instance
 */
let defaultSDK: NikCLISDK | null = null

/**
 * Get or create default SDK instance
 */
export function getSDK(config?: Partial<SDKConfig>): NikCLISDK {
  if (!defaultSDK) {
    defaultSDK = new NikCLISDK(config)
  }
  return defaultSDK
}

/**
 * Initialize default SDK
 */
export async function initializeSDK(config?: Partial<SDKConfig>): Promise<NikCLISDK> {
  const sdk = getSDK(config)
  await sdk.initialize()
  return sdk
}
