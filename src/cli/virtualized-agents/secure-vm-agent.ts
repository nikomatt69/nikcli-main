import { EventEmitter } from 'node:events'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type {
  Agent,
  AgentConfig,
  AgentContext,
  AgentStatus,
  AgentTask,
  AgentTaskResult,
  AgentTodo,
} from '../types/types'
import { advancedUI } from '../ui/advanced-cli-ui'
import { ContainerManager } from './container-manager'
import { APIKeyProxy } from './security/api-key-proxy'
import { TokenManager } from './security/token-manager'
import { VMOrchestrator } from './vm-orchestrator'

/**
 * SecureVirtualizedAgent - Enterprise VM Agent with Complete Security
 *
 * Features:
 * - Runs in isolated Docker container with Ubuntu/Debian
 * - Zero API key exposure - communicates via secure proxy
 * - Complete repository autonomy with VS Code Server
 * - Token budget management and rate limiting
 * - Auto-cleanup and lifecycle management
 */
export class SecureVirtualizedAgent extends EventEmitter implements Agent {
  public readonly id: string
  public readonly name: string
  public readonly description: string
  public readonly capabilities: string[]
  public readonly specialization: string
  public readonly version: string = '0.2.3'

  // Agent properties
  public status: AgentStatus = 'initializing'
  public currentTasks: number = 0
  public maxConcurrentTasks: number = 10

  // VM Infrastructure
  private containerManager: ContainerManager
  private vmOrchestrator: VMOrchestrator
  private apiProxy: APIKeyProxy
  private tokenManager: TokenManager

  // VM State
  private containerId?: string
  private vmState: VMState = 'stopped'
  private repositoryPath?: string
  private vscodeServerPort?: number

  // Security & Resource Management
  private tokenBudget: number
  private tokenUsed: number = 0
  private requestCount: number = 0
  private startTime?: Date
  private sessionJWT?: string

  // Monitoring
  private vmMetrics: VMMetrics

  constructor(workingDirectory: string, config: VMAgentConfig = {}) {
    super()

    this.id = config.agentId || `vm-agent-${Date.now()}`
    this.name = config.name || 'Secure VM Agent'
    this.description = config.description || 'Autonomous development agent with isolated VM environment'
    this.capabilities = config.capabilities || [
      'repository-analysis',
      'code-generation',
      'testing',
      'documentation',
      'refactoring',
      'pull-request-creation',
    ]
    this.specialization = config.specialization || 'autonomous-development'

    // Initialize VM infrastructure
    this.containerManager = new ContainerManager()
    this.vmOrchestrator = new VMOrchestrator(this.containerManager)
    this.apiProxy = APIKeyProxy.getInstance()
    this.tokenManager = TokenManager.getInstance()

    // Resource limits
    this.tokenBudget = config.tokenBudget || 50000 // Default 50k tokens

    // VM metrics
    this.vmMetrics = {
      memoryUsage: 0,
      cpuUsage: 0,
      diskUsage: 0,
      networkActivity: 0,
      uptime: 0,
    }

    this.setupVMEventHandlers()
  }

  /**
   * Initialize VM agent with security setup
   */
  protected async onInitialize(): Promise<void> {
    try {
      advancedUI.logInfo(`🔐 Initializing secure VM agent: ${this.id}`)

      // Generate secure session token
      this.sessionJWT = await this.tokenManager.generateSessionToken(this.id, {
        tokenBudget: this.tokenBudget,
        capabilities: this.capabilities,
        ttl: 3600, // 1 hour
      })

      // Register with API proxy
      await this.apiProxy.registerAgent(this.id, this.sessionJWT)

      advancedUI.logSuccess(`✓ VM agent ${this.id} security initialized`)
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to initialize VM agent security: ${error.message}`)
      throw error
    }
  }

  /**
   * Initialize the agent (Agent interface)
   */
  async initialize(_context?: AgentContext): Promise<void> {
    try {
      this.status = 'initializing'
      advancedUI.logInfo(`🔐 Initializing secure VM agent: ${this.id}`)

      // Ensure API proxy is started
      try {
        await this.apiProxy.getEndpoint()
      } catch (_proxyError) {
        advancedUI.logInfo(`🚀 Starting API proxy server...`)
        await this.apiProxy.start()
      }

      // Generate secure session token
      this.sessionJWT = await this.tokenManager.generateSessionToken(this.id, {
        tokenBudget: this.tokenBudget,
        capabilities: this.capabilities,
        ttl: 3600, // 1 hour
      })

      // Register with API proxy
      await this.apiProxy.registerAgent(this.id, this.sessionJWT)

      this.status = 'ready'
      advancedUI.logSuccess(`✓ VM agent ${this.id} security initialized`)
    } catch (error: any) {
      this.status = 'error'
      advancedUI.logError(`❌ Failed to initialize VM agent security: ${error.message}`)
      throw error
    }
  }

  /**
   * Execute task (Agent interface)
   */
  async executeTask(task: AgentTask): Promise<AgentTaskResult> {
    const startTime = new Date()
    this.currentTasks++
    this.status = 'busy'

    try {
      advancedUI.logInfo(`🚀 VM Agent ${this.id} starting autonomous task`)

      // Parse repository URL from task
      const repoUrl = this.extractRepositoryUrl(task)
      if (!repoUrl) {
        throw new Error('No repository URL found in task')
      }

      // Start VM environment
      await this.startVMEnvironment(repoUrl)

      // Execute autonomous workflow
      const result = await this.executeAutonomousWorkflow(task)

      // Create pull request if requested
      if (task.data?.createPR !== false) {
        await this.createPullRequest(result)
      }

      this.status = 'ready'
      this.currentTasks--

      return {
        taskId: task.id,
        agentId: this.id,
        status: 'completed',
        startTime,
        endTime: new Date(),
        result,
        duration: Date.now() - startTime.getTime(),
      }
    } catch (error: any) {
      this.status = 'error'
      this.currentTasks--

      advancedUI.logError(`❌ VM Agent task failed: ${error.message}`)

      return {
        taskId: task.id,
        agentId: this.id,
        status: 'failed',
        startTime,
        endTime: new Date(),
        error: error.message,
        duration: Date.now() - startTime.getTime(),
      }
    }
  }

  /**
   * Get metrics (Agent interface)
   */
  getMetrics(): any {
    return {
      vmState: this.vmState,
      tokenUsage: this.getTokenUsage(),
      containerId: this.containerId,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      vscodePort: this.vscodeServerPort,
      requestCount: this.requestCount,
    }
  }

  /**
   * Check if agent can handle task (Agent interface)
   */
  canHandle(task: AgentTask): boolean {
    // Check if task requires repository analysis or autonomous development
    const taskDesc = task.description.toLowerCase()
    const hasRepo = this.extractRepositoryUrl(task) !== null

    return (
      hasRepo ||
      taskDesc.includes('repository') ||
      taskDesc.includes('analizza') ||
      taskDesc.includes('autonomous') ||
      this.capabilities.some((cap) => taskDesc.includes(cap.toLowerCase()))
    )
  }

  /**
   * Execute autonomous repository task (internal)
   */
  protected async onExecuteTask(task: AgentTask): Promise<any> {
    try {
      advancedUI.logInfo(`🚀 VM Agent ${this.id} starting autonomous task`)

      // Parse repository URL from task
      const repoUrl = this.extractRepositoryUrl(task)
      if (!repoUrl) {
        throw new Error('No repository URL found in task')
      }

      // Start VM environment
      await this.startVMEnvironment(repoUrl)

      // Execute autonomous workflow
      const result = await this.executeAutonomousWorkflow(task)

      // Create pull request if requested
      if (task.data?.createPR !== false) {
        await this.createPullRequest(result)
      }

      return result
    } catch (error: any) {
      advancedUI.logError(`❌ VM Agent task failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Stop VM agent and cleanup
   */
  protected async onStop(): Promise<void> {
    try {
      advancedUI.logInfo(`🛑 Stopping VM agent: ${this.id}`)

      // Stop VM environment
      if (this.containerId) {
        await this.stopVMEnvironment()
      }

      // Cleanup security credentials
      await this.cleanupSecurity()

      advancedUI.logSuccess(`✓ VM agent ${this.id} stopped and cleaned up`)
    } catch (error: any) {
      advancedUI.logError(`❌ Error stopping VM agent: ${error.message}`)
    }
  }

  // Required Agent interface methods

  /**
   * Run method (legacy compatibility)
   */
  async run(task: AgentTask): Promise<AgentTaskResult> {
    const startTime = new Date()

    try {
      const result = await this.onExecuteTask(task)

      return {
        taskId: task.id,
        agentId: this.id,
        status: 'completed',
        startTime,
        endTime: new Date(),
        result,
        duration: Date.now() - startTime.getTime(),
      }
    } catch (error: any) {
      return {
        taskId: task.id,
        agentId: this.id,
        status: 'failed',
        startTime,
        endTime: new Date(),
        error: error.message,
        duration: Date.now() - startTime.getTime(),
      }
    }
  }

  /**
   * Execute todo (legacy compatibility)
   */
  async executeTodo(todo: AgentTodo): Promise<void> {
    const task: AgentTask = {
      id: todo.id,
      title: todo.title,
      description: todo.description,
      type: 'vm-todo' as const,
      priority: todo.priority,
      status: 'pending',
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
      data: { todo },
      progress: 0,
    }

    await this.executeTask(task)
  }

  /**
   * Get agent status
   */
  getStatus(): AgentStatus {
    return this.status
  }

  /**
   * Get agent capabilities
   */
  getCapabilities(): string[] {
    return [...this.capabilities]
  }

  /**
   * Update guidance (not applicable for VM agents)
   */
  updateGuidance(_guidance: string): void {
    // VM agents operate autonomously and don't use guidance
    advancedUI.logInfo(`VM agent ${this.id} ignoring guidance update`)
  }

  /**
   * Update configuration
   */
  updateConfiguration(config: Partial<AgentConfig>): void {
    if (config.maxConcurrentTasks) {
      this.maxConcurrentTasks = config.maxConcurrentTasks
    }

    if (config.maxTokens) {
      this.tokenBudget = config.maxTokens
    }

    advancedUI.logInfo(`VM agent ${this.id} configuration updated`)
  }

  /**
   * Cleanup method (Agent interface)
   */
  async cleanup(): Promise<void> {
    return await this.onStop()
  }

  /**
   * Start isolated VM environment for repository work
   */
  private async startVMEnvironment(repoUrl: string): Promise<void> {
    try {
      this.vmState = 'starting'
      this.startTime = new Date()

      const { target: repositoryTarget, isLocal } = this.resolveRepositoryTarget(repoUrl)

      advancedUI.logInfo(`🐳 Creating isolated VM container for ${repositoryTarget}`)

      // Create secure container
      this.containerId = await this.vmOrchestrator.createSecureContainer({
        agentId: this.id,
        repositoryUrl: repositoryTarget,
        localRepoPath: isLocal ? repositoryTarget : undefined,
        sessionToken: this.sessionJWT!,
        proxyEndpoint: await this.apiProxy.getEndpoint(),
        capabilities: this.capabilities,
      })

      // Setup repository and environment
      await this.vmOrchestrator.setupRepository(this.containerId, repositoryTarget, {
        useLocalPath: isLocal,
      })
      this.repositoryPath = '/workspace/repo'
      await this.vmOrchestrator.setupVSCodeServer(this.containerId)
      await this.vmOrchestrator.setupDevelopmentEnvironment(this.containerId)

      this.vmState = 'running'
      this.vscodeServerPort = await this.vmOrchestrator.getVSCodePort(this.containerId)

      advancedUI.logSuccess(`✓ VM environment ready - VS Code available on port ${this.vscodeServerPort}`)
    } catch (error: any) {
      this.vmState = 'error'
      throw new Error(`Failed to start VM environment: ${error.message}`)
    }
  }

  /**
   * Execute autonomous development workflow in VM
   */
  private async executeAutonomousWorkflow(task: AgentTask): Promise<any> {
    if (!this.containerId) {
      throw new Error('VM environment not initialized')
    }

    advancedUI.logInfo(`🔌 Executing autonomous workflow in VM`)

    // Execute autonomous development commands in VM
    const workflow = [
      'cd /workspace/repo && git status',
      'cd /workspace/repo && if [ -f package.json ]; then (npm ci || npm install); else echo "No package.json found"; fi',
      'cd /workspace/repo && if [ -f package.json ]; then (npm test || npm run test || echo "No tests configured"); else echo "No package.json found"; fi',
      `echo "Analyzing repository for: ${task.description}"`,
      // Additional autonomous commands will be added by the AI agent
    ]

    const results = []
    for (const command of workflow) {
      const result = await this.vmOrchestrator.executeCommand(this.containerId, command)
      results.push(result)

      // Update token usage tracking
      this.trackTokenUsage(100) // Estimate tokens per command
    }

    // The actual autonomous development work happens here
    // The VM agent will use AI calls through the secure proxy
    const developmentResult = await this.performAutonomousDevelopment(task)

    return {
      workflowResults: results,
      developmentResult,
      vmMetrics: await this.getVMMetrics(),
      tokenUsage: this.tokenUsed,
    }
  }

  /**
   * Perform autonomous development using AI through secure proxy
   */
  private async performAutonomousDevelopment(task: AgentTask): Promise<any> {
    // This will make AI calls through the secure proxy
    // The actual implementation will depend on the specific task

    const aiRequest = {
      agentId: this.id,
      sessionToken: this.sessionJWT!,
      prompt: `Autonomous development task: ${task.description}`,
      context: {
        repository: this.repositoryPath,
        capabilities: this.capabilities,
      },
    }

    // Make secure AI call through proxy
    const response = await this.apiProxy.makeAIRequest(aiRequest)

    // Track token usage
    this.trackTokenUsage(response.tokenUsage || 1000)

    return response.result
  }

  /**
   * Create pull request with autonomous changes
   */
  private async createPullRequest(result: any): Promise<string> {
    if (!this.containerId) {
      throw new Error('VM environment not available')
    }

    advancedUI.logInfo(`📝 Creating pull request for autonomous changes`)

    // Commit changes
    await this.vmOrchestrator.executeCommand(
      this.containerId,
      'cd /workspace/repo && git add . && git commit -m "Autonomous development changes by VM agent" || echo "No changes to commit"'
    )

    // Push and create PR (simplified - real implementation would use GitHub API)
    const prUrl = await this.vmOrchestrator.createPullRequest(this.containerId, {
      title: `Autonomous development by ${this.id}`,
      description: `Automated changes generated by VM agent\n\nResults: ${JSON.stringify(result, null, 2)}`,
    })

    advancedUI.logSuccess(`✓ Pull request created: ${prUrl}`)
    return prUrl
  }

  /**
   * Stop VM environment and cleanup
   */
  private async stopVMEnvironment(): Promise<void> {
    if (!this.containerId) return

    try {
      this.vmState = 'stopping'

      // Stop and remove container
      await this.vmOrchestrator.stopContainer(this.containerId)
      await this.vmOrchestrator.removeContainer(this.containerId)

      this.vmState = 'stopped'
      this.containerId = undefined
    } catch (error: any) {
      advancedUI.logError(`Error stopping VM: ${error.message}`)
    }
  }

  /**
   * Cleanup security credentials
   */
  private async cleanupSecurity(): Promise<void> {
    if (this.sessionJWT) {
      await this.tokenManager.revokeToken(this.sessionJWT)
      await this.apiProxy.unregisterAgent(this.id)
      this.sessionJWT = undefined
    }
  }

  /**
   * Track token usage and enforce budget
   */
  private trackTokenUsage(tokens: number): void {
    this.tokenUsed += tokens
    this.requestCount++

    if (this.tokenUsed > this.tokenBudget) {
      advancedUI.logError(`⚠️ Token budget exceeded: ${this.tokenUsed}/${this.tokenBudget}`)
      throw new Error('Token budget exceeded')
    }

    // Log usage periodically
    if (this.requestCount % 10 === 0) {
      advancedUI.logInfo(`📊 Token usage: ${this.tokenUsed}/${this.tokenBudget} (${this.requestCount} requests)`)
    }
  }

  /**
   * Get current VM metrics
   */
  private async getVMMetrics(): Promise<VMMetrics> {
    if (!this.containerId) {
      return this.vmMetrics
    }

    return await this.vmOrchestrator.getContainerMetrics(this.containerId)
  }

  /**
   * Extract repository URL from task description
   */
  private extractRepositoryUrl(task: AgentTask): string | null {
    const taskData = task.data as Record<string, any> | undefined
    const dataRepository =
      taskData?.repositoryUrl || taskData?.repositoryPath || taskData?.localRepoPath || taskData?.repoUrl

    if (typeof dataRepository === 'string' && dataRepository.trim().length > 0) {
      return dataRepository.trim()
    }

    const githubPattern = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?/i
    const githubMatch = task.description.match(githubPattern)
    if (githubMatch) {
      return githubMatch[0]
    }

    const filePattern = /file:\/\/[\S]+/i
    const fileMatch = task.description.match(filePattern)
    if (fileMatch) {
      return fileMatch[0]
    }

    const pathPattern = /(?:~|\.{1,2}|\/)\S+/
    const pathMatch = task.description.match(pathPattern)

    return pathMatch ? pathMatch[0] : null
  }

  private resolveRepositoryTarget(repository: string): { target: string; isLocal: boolean } {
    const repositoryInput = repository?.trim()

    if (!repositoryInput) {
      throw new Error('A repository URL or local path is required to start the VM environment')
    }

    const remotePattern = /^(https?:\/\/|git@)/i
    if (remotePattern.test(repositoryInput)) {
      return { target: repositoryInput, isLocal: false }
    }

    if (/^file:\/\//i.test(repositoryInput)) {
      const fileUrl = new URL(repositoryInput)
      const decodedPath = decodeURIComponent(fileUrl.pathname)
      return this.resolveRepositoryTarget(decodedPath)
    }

    let resolvedPath = repositoryInput
    if (repositoryInput.startsWith('~')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE
      if (!homeDir) {
        throw new Error('Unable to resolve ~ in repository path: HOME directory not set')
      }
      resolvedPath = resolve(homeDir, repositoryInput.slice(1))
    } else {
      resolvedPath = resolve(repositoryInput)
    }

    if (!existsSync(resolvedPath)) {
      throw new Error(`Local repository path not found: ${resolvedPath}`)
    }

    if (!statSync(resolvedPath).isDirectory()) {
      throw new Error(`Local repository path must be a directory: ${resolvedPath}`)
    }

    return { target: resolvedPath, isLocal: true }
  }

  /**
   * Setup VM event handlers
   */
  private setupVMEventHandlers(): void {
    // Handle VM events for monitoring and logging
    this.on('vm:started', (containerId: string) => {
      advancedUI.logSuccess(`🐳 VM container started: ${containerId}`)
      this.emitVMCommunication(`Container ${containerId.slice(0, 12)} started successfully`)
    })

    this.on('vm:stopped', (containerId: string) => {
      advancedUI.logInfo(`🛑 VM container stopped: ${containerId}`)
      this.emitVMCommunication(`Container ${containerId.slice(0, 12)} stopped`)
    })

    this.on('vm:error', (error: Error) => {
      advancedUI.logError(`❌ VM error: ${error.message}`)
      this.emitVMCommunication(`Error: ${error.message}`)
    })

    this.on('vm:command', (command: string, result: any) => {
      this.emitVMCommunication(
        `Executed: ${command} | Result: ${typeof result === 'string' ? result.slice(0, 100) : 'Success'}`
      )
    })

    this.on('vm:ai-request', (prompt: string) => {
      this.emitVMCommunication(`AI Request: ${prompt.slice(0, 80)}...`)
    })

    this.on('vm:ai-response', (response: string) => {
      this.emitVMCommunication(`AI Response received (${response.length} chars)`)
    })
  }

  /**
   * Emit VM communication to streaming system
   */
  private emitVMCommunication(message: string): void {
    // Emit to global event bus for streaming orchestrator
    if (global && (global as any).__streamingOrchestrator) {
      ;(global as any).__streamingOrchestrator.queueMessage({
        type: 'vm',
        content: `[${this.id.slice(0, 8)}] ${message}`,
        metadata: {
          vmAgentId: this.id,
          vmState: this.vmState,
          containerId: this.containerId,
        },
      })
    }
  }

  /**
   * Start chat mode - keeps VM agent active for continuous conversation
   */
  public async startChatMode(repositoryUrl?: string): Promise<void> {
    try {
      advancedUI.logInfo(`🐳 Starting VM Chat Mode for agent: ${this.id}`)

      // Initialize if not already done
      if (this.status === 'initializing') {
        await this.initialize()
      }

      // If we don't have a running container, try to connect to an existing one or create new
      if (this.vmState !== 'running') {
        if (repositoryUrl) {
          await this.startVMEnvironment(repositoryUrl)
        } else {
          // Try to connect to an existing container
          const containers = this.vmOrchestrator.getActiveContainers()
          if (containers.length > 0) {
            // Connect to the first available container
            const container = containers[0]
            this.containerId = container.id
            this.vmState = 'running'
            this.vscodeServerPort = container.vscodePort
            this.repositoryPath = container.repositoryPath || '/workspace/repo'

            advancedUI.logInfo(`🔗 Connected to existing container: ${container.id.slice(0, 12)}`)
          } else {
            throw new Error('No repository URL provided and no existing containers available')
          }
        }
      }

      // Set status to ready for chat
      this.status = 'ready'
      this.emitVMCommunication(`VM Chat Mode active - ready for conversation`)

      advancedUI.logSuccess(`✓ VM Chat Mode activated for agent: ${this.id}`)
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to start VM Chat Mode: ${error.message}`)
      this.status = 'error'
      throw error
    }
  }

  /**
   * Process chat message in VM environment
   */
  public async processChatMessage(message: string): Promise<string> {
    try {
      if (this.vmState !== 'running') {
        throw new Error('VM environment not running. Use startChatMode() first.')
      }

      this.status = 'busy'
      this.emitVMCommunication(`Processing message: ${message.slice(0, 50)}...`)

      // For now, use a direct approach with container commands and AI analysis
      let response = ''

      // Execute commands in the container based on the message
      if (
        message.toLowerCase().includes('analyze') ||
        message.toLowerCase().includes('analizza') ||
        message.toLowerCase().includes('anallyze')
      ) {
        // Repository analysis
        advancedUI.logInfo(`🔍 Starting repository analysis...`)
        const repoInfo = await this.analyzeRepository()
        response = `🔍 **Repository Analysis:**\n\n${repoInfo}`
        advancedUI.logInfo(`✓ Repository analysis completed, response length: ${response.length}`)
      } else if (message.toLowerCase().includes('status')) {
        // Container status
        const status = await this.getContainerStatus()
        response = `📊 **Container Status:**\n\n${status}`
      } else {
        // General AI chat through secure proxy
        try {
          const aiResult = await this.performAutonomousDevelopment({
            id: `chat-${Date.now()}`,
            title: 'Chat Message',
            description: message,
            type: 'user_request' as const,
            priority: 'medium',
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
            data: { isChat: true },
            progress: 0,
          })

          response = aiResult || `✓ Task completed successfully in VM environment`
        } catch (_aiError) {
          response = `🔌 VM Agent processed your request: "${message}"\n\nContainer is active and ready for commands.`
        }
      }

      this.status = 'ready'
      this.emitVMCommunication(`Message processed successfully`)

      advancedUI.logInfo(`🔍 Returning response: ${response.slice(0, 100)}${response.length > 100 ? '...' : ''}`)
      return response
    } catch (error: any) {
      this.status = 'ready' // Return to ready even on error
      this.emitVMCommunication(`Error processing message: ${error.message}`)
      return `❌ Error processing message: ${error.message}`
    }
  }

  /**
   * Process chat message with streaming AI response
   */
  public async *processChatMessageStreaming(message: string): AsyncGenerator<string, void, unknown> {
    try {
      if (this.vmState !== 'running') {
        throw new Error('VM environment not running. Use startChatMode() first.')
      }

      this.status = 'busy'
      this.emitVMCommunication(`🌊 Streaming AI processing: ${message.slice(0, 50)}...`)

      // Execute commands in the container based on the message first (non-streaming)
      if (
        message.toLowerCase().includes('analyze') ||
        message.toLowerCase().includes('analizza') ||
        message.toLowerCase().includes('anallyze')
      ) {
        // Repository analysis
        yield '🔍 **Starting repository analysis...**\n\n'
        const repoInfo = await this.analyzeRepository()
        yield `**Repository Analysis:**\n\n${repoInfo}`
      } else if (message.toLowerCase().includes('status')) {
        // Container status
        yield '📊 **Getting container status...**\n\n'
        const status = await this.getContainerStatus()
        yield `**Container Status:**\n\n${status}`
      } else {
        // General AI chat through secure proxy with streaming
        yield '🔌 **Processing with AI...**\n\n'

        try {
          // Use streaming AI request through secure proxy
          const aiRequest = {
            agentId: this.id,
            sessionToken: this.sessionJWT!,
            prompt: `VM Agent Chat: User says "${message}". You are an autonomous development agent running in a secure VM environment. Respond helpfully and conversationally.`,
            context: {
              repository: this.repositoryPath,
              capabilities: this.capabilities,
              containerState: this.vmState,
              isStreamingChat: true,
            },
          }

          // Stream AI response
          for await (const chunk of this.apiProxy.makeStreamingAIRequest(aiRequest)) {
            if (chunk.type === 'content' && chunk.content) {
              // Emit streaming content
              this.emitVMCommunication(`AI chunk: ${chunk.content.slice(0, 30)}...`)
              yield chunk.content
            } else if (chunk.type === 'usage') {
              // Track token usage
              this.trackTokenUsage(chunk.tokenUsage || 0)
              this.emitVMCommunication(`Token usage: ${chunk.tokenUsage}`)
            } else if (chunk.type === 'complete') {
              // AI request completed
              this.emitVMCommunication(`AI streaming completed: ${chunk.tokenUsage} tokens`)
            } else if (chunk.type === 'error') {
              // Handle streaming error
              this.emitVMCommunication(`AI streaming error: ${chunk.error}`)
              yield `\n\n❌ AI Error: ${chunk.error}`
              break
            }
          }
        } catch (aiError: any) {
          yield `\n\n🔌 VM Agent processed your request: "${message}"\n\nContainer is active and ready for commands.`
          this.emitVMCommunication(`AI fallback: ${aiError.message}`)
        }
      }

      this.status = 'ready'
      this.emitVMCommunication(`🌊 Streaming message processing completed`)
    } catch (error: any) {
      this.status = 'ready' // Return to ready even on error
      this.emitVMCommunication(`Streaming error: ${error.message}`)
      yield `❌ Error processing message: ${error.message}`
    }
  }

  /**
   * Analyze repository in the VM container
   */
  private async analyzeRepository(): Promise<string> {
    if (!this.containerId) {
      return 'No container available for analysis'
    }

    try {
      const commands = [
        'cd /workspace/repo && pwd',
        'cd /workspace/repo && ls -la',
        'cd /workspace/repo && find . -name "*.json" -o -name "*.md" -o -name "*.js" -o -name "*.ts" | head -10',
        'cd /workspace/repo && if [ -f package.json ]; then cat package.json | head -20; fi',
        'cd /workspace/repo && if [ -f README.md ]; then head -10 README.md; fi',
      ]

      const results = []
      for (const command of commands) {
        try {
          const result = await this.vmOrchestrator.executeCommand(this.containerId, command)
          results.push(`$ ${command}\n${result}`)
        } catch (error) {
          results.push(`$ ${command}\nError: ${error}`)
        }
      }

      return results.join('\n\n---\n\n')
    } catch (error: any) {
      return `Analysis error: ${error.message}`
    }
  }

  /**
   * Get container status information
   */
  private async getContainerStatus(): Promise<string> {
    if (!this.containerId) {
      return 'No container available'
    }

    try {
      const metrics = await this.getVMMetrics()
      const containers = this.vmOrchestrator.getActiveContainers()
      const containerInfo = containers.find((c) => c.id === this.containerId)

      const status = [
        `Container ID: ${this.containerId.slice(0, 12)}`,
        `State: ${this.vmState}`,
        `Status: ${this.status}`,
        `Repository: ${containerInfo?.repositoryUrl || 'N/A'}`,
        `VS Code Port: ${this.vscodeServerPort || 'N/A'}`,
        `Memory Usage: ${metrics.memoryUsage} MB`,
        `CPU Usage: ${metrics.cpuUsage}%`,
        `Uptime: ${Math.floor(metrics.uptime / 60)} minutes`,
        `Token Usage: ${this.tokenUsed}/${this.tokenBudget}`,
        `Created: ${containerInfo?.createdAt?.toLocaleString() || 'N/A'}`,
      ]

      return status.join('\n')
    } catch (error: any) {
      return `Status error: ${error.message}`
    }
  }

  // Getters for monitoring
  public getVMState(): VMState {
    return this.vmState
  }

  public getContainerId(): string | undefined {
    return this.containerId
  }

  /**
   * Execute command in container
   */
  async executeCommand(
    command: string,
    _options?: { timeout?: number; capture?: boolean }
  ): Promise<{ stdout?: string; stderr?: string }> {
    if (!this.containerId) {
      throw new Error('Container not available')
    }

    try {
      const result = await this.vmOrchestrator.executeCommand(this.containerId, command)
      return {
        stdout: result,
        stderr: undefined,
      }
    } catch (error: any) {
      return {
        stdout: undefined,
        stderr: error.message,
      }
    }
  }

  public getTokenUsage(): { used: number; budget: number; remaining: number } {
    return {
      used: this.tokenUsed,
      budget: this.tokenBudget,
      remaining: this.tokenBudget - this.tokenUsed,
    }
  }

  public getVSCodePort(): number | undefined {
    return this.vscodeServerPort
  }

  public setContainerId(containerId: string): void {
    this.containerId = containerId
    this.vmState = 'running'
  }
}

// Type definitions
export interface VMAgentConfig {
  agentId?: string
  name?: string
  description?: string
  capabilities?: string[]
  specialization?: string
  tokenBudget?: number
  containerImage?: string
  resourceLimits?: {
    memory?: string
    cpu?: string
    disk?: string
  }
}

export interface VMMetrics {
  memoryUsage: number
  cpuUsage: number
  diskUsage: number
  networkActivity: number
  uptime: number
}

export type VMState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

export interface SecurityCredentials {
  sessionToken: string
  proxyEndpoint: string
  tokenBudget: number
  capabilities: string[]
}
