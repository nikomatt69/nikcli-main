import { EventEmitter } from 'events'
import { advancedUI } from '../ui/advanced-cli-ui'
import { CliUI } from '../utils/cli-ui'
import type { ContainerManager } from './container-manager'
import type { VMMetrics } from './secure-vm-agent'
import { vmChatBridge } from './vm-chat-bridge'
import { vmSessionManager } from './vm-session-manager'
import { vmWebSocketServer } from './vm-websocket-server'

/**
 * VMOrchestrator - Manages complete lifecycle of VM containers
 *
 * Responsibilities:
 * - Container creation with security isolation
 * - Repository setup and cloning
 * - VS Code Server installation and configuration
 * - Development environment setup
 * - Command execution in secure context
 * - Resource monitoring and management
 * - Cleanup and disposal
 */
export class VMOrchestrator extends EventEmitter {
  private containerManager: ContainerManager
  private activeContainers: Map<string, ContainerInfo> = new Map()
  private containerMetrics: Map<string, VMMetrics> = new Map()
  private bridgeInitialized: boolean = false

  constructor(containerManager: ContainerManager) {
    super()
    this.containerManager = containerManager
    this.setupCleanupHandlers()
    this.initializeCommunicationBridge()
  }

  /**
   * Create secure isolated container for agent
   */
  async createSecureContainer(config: ContainerCreationConfig): Promise<string> {
    try {
      advancedUI.logInfo(`🐳 Creating secure container for agent ${config.agentId}`)

      // Generate unique container name
      const containerName = `nikcli-vm-${config.agentId}-${Date.now()}`

      const volumes = [
        // Create isolated workspace
        `${containerName}-workspace:/workspace`,
        // Persistent toolchain state
        `${containerName}-nikcli-config:/home/node/.nikcli`,
        // Shared socket for Docker-in-Docker if needed
        '/var/run/docker.sock:/var/run/docker.sock',
      ]

      if (config.localRepoPath) {
        volumes.push(`${config.localRepoPath}:/workspace/repo`)
      }

      // Allow callers to provide additional host mounts (e.g., Desktop)
      if (Array.isArray(config.extraVolumes)) {
        for (const extra of config.extraVolumes) {
          if (extra && typeof extra === 'string') {
            volumes.push(extra)
          }
        }
      }

      // Container configuration with security and isolation
      const containerConfig = {
        name: containerName,
        image: config.containerImage || 'node:18-alpine',
        environment: {
          AGENT_ID: config.agentId,
          SESSION_TOKEN: config.sessionToken,
          PROXY_ENDPOINT: config.proxyEndpoint,
        },
        volumes,
        ports: [
          // VS Code Server port (randomized for security)
          `${this.generateVSCodePort()}:8080`,
        ],
        security: {
          // Production security constraints
          readOnlyRootfs: false, // Need write access for development
          noNewPrivileges: true,
          // seccompProfile not supported on macOS
          capabilities: {
            drop: ['ALL'],
            add: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID', 'NET_BIND_SERVICE'],
          },
          // Additional security options
          user: 'node:node',
          privileged: false,
          publishAllPorts: false,
        },
        resources: {
          memory: '2g',
          cpuQuota: '1.0',
          diskQuota: '10g',
        },
        network: {
          // Isolated network with access only to proxy
          mode: 'bridge',
          isolate: true,
        },
      }

      // Create container (already starts with `docker run -d`)
      const containerId = await this.containerManager.createContainer(containerConfig)

      // Store container info
      const containerInfo: ContainerInfo = {
        id: containerId,
        name: containerName,
        agentId: config.agentId,
        repositoryUrl: config.repositoryUrl,
        localRepositoryPath: config.localRepoPath,
        repositoryPath: '/workspace/repo',
        createdAt: new Date(),
        status: 'running',
        vscodePort: this.extractVSCodePort(containerConfig.ports[0]),
      }

      this.activeContainers.set(containerId, containerInfo)

      // Initialize container
      await this.initializeContainer(containerId)

      // Create and register VM agent
      await this.createAndRegisterVMAgent(containerId, config)

      advancedUI.logSuccess(`✓ Secure container created: ${containerId}`)
      this.emit('container:created', { containerId, agentId: config.agentId })

      return containerId
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to create secure container: ${error.message}`)
      throw error
    }
  }

  /**
   * Initialize container with basic tools and security setup
   */
  private async initializeContainer(containerId: string): Promise<void> {
    advancedUI.logInfo(`🔧 Initializing container ${containerId}`)

    const initCommands = [
      // Install base tooling using the available package manager (apk/apt/dnf/yum)
      'if command -v apk >/dev/null 2>&1; then apk add --no-cache git curl build-base python3 bash; ' +
        'elif command -v apt-get >/dev/null 2>&1; then ' +
        'export DEBIAN_FRONTEND=noninteractive; apt-get update && apt-get install -y git curl build-essential python3 python3-pip ca-certificates gnupg && update-ca-certificates || true; ' +
        'elif command -v dnf >/dev/null 2>&1; then dnf install -y git curl python3 gcc gcc-c++ make bash; ' +
        'elif command -v yum >/dev/null 2>&1; then yum install -y git curl python3 gcc gcc-c++ make bash; ' +
        'else echo "No supported package manager found"; fi',

      // Verify installations
      'node --version && npm --version',
      'git --version && curl --version',

      // Create workspace and config directories
      'mkdir -p /workspace /home/node/.nikcli',
      'chown -R node:node /home/node/.nikcli',

      // Setup git configuration for agent
      'git config --global user.email "nikcli-agent@localhost"',
      'git config --global user.name "NikCLI Agent"',
      'git config --global init.defaultBranch main',

      // Initialize persistent toolchain state
      'echo "{\\"initialized\\": true, \\"timestamp\\": \\"$(date -Iseconds)\\"}" > /home/node/.nikcli/container-state.json',
    ]

    for (let i = 0; i < initCommands.length; i++) {
      const command = initCommands[i]
      try {
        advancedUI.logInfo(`Executing init command ${i + 1}/${initCommands.length}`)
        await this.executeCommand(containerId, command)

        // Wait after package installation
        if (i === 0) {
          advancedUI.logInfo('⏳ Waiting for packages to install...')
          await new Promise((resolve) => setTimeout(resolve, 2000)) // Wait 2 seconds
          advancedUI.logSuccess('✓ Packages installed')
        }
      } catch (error: any) {
        advancedUI.logError(`Warning: Init command failed: ${command} - ${error.message}`)

        // If it's the first command (package installation), this is critical
        if (i === 0) {
          throw new Error(`Critical: Package installation failed - ${error.message}`)
        }
      }
    }

    advancedUI.logSuccess(`✓ Container ${containerId} initialized`)
  }

  /**
   * Setup repository in container
   */
  async setupRepository(
    containerId: string,
    repositoryUrl: string,
    options: RepositorySetupOptions = {}
  ): Promise<void> {
    try {
      const containerInfo = this.activeContainers.get(containerId)
      const useLocalPath =
        options.useLocalPath ?? Boolean(containerInfo?.localRepositoryPath) ?? this.looksLikeLocalPath(repositoryUrl)

      const setupMode = useLocalPath ? 'local path' : 'git clone'
      advancedUI.logInfo(`📦 Setting up repository ${repositoryUrl} in container (${setupMode})`)

      const setupCommands = useLocalPath
        ? [
            // Ensure mounted path exists inside container
            'if [ ! -d /workspace/repo ]; then echo "Mounted repository not accessible" >&2; exit 1; fi',

            // Print git status when available, otherwise continue
            'cd /workspace/repo && if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then git status; else echo "Directory is not a git repository"; fi',

            // Install dependencies if package.json exists (npm preferred)
            'cd /workspace/repo && if [ -f package.json ]; then (npm install || npm ci || true); fi',

            // Install Python dependencies if requirements.txt exists and pip3 is available
            'if command -v pip3 >/dev/null 2>&1; then cd /workspace/repo && if [ -f requirements.txt ]; then pip3 install -r requirements.txt; fi; else echo "pip3 not found, skipping python deps"; fi',
          ]
        : [
            // Configure git to skip SSL verification for this clone (temporary workaround)
            'git config --global http.sslverify false',

            // Clone repository to workspace
            `cd /workspace && git clone ${repositoryUrl} repo`,

            // Re-enable SSL verification
            'git config --global http.sslverify true',

            // Install dependencies if package.json exists (npm preferred)
            'cd /workspace/repo && if [ -f package.json ]; then npm install; fi',

            // Install Python dependencies if requirements.txt exists and pip3 is available
            'if command -v pip3 >/dev/null 2>&1; then cd /workspace/repo && if [ -f requirements.txt ]; then pip3 install -r requirements.txt; fi; else echo "pip3 not found, skipping python deps"; fi',

            // Make directory accessible
            'chmod -R 755 /workspace',
          ]

      for (const command of setupCommands) {
        await this.executeCommand(containerId, command)
      }

      // Update container info

      if (containerInfo) {
        containerInfo.repositoryPath = '/workspace/repo'
        containerInfo.localRepositoryPath = useLocalPath
          ? containerInfo.localRepositoryPath || (this.looksLikeLocalPath(repositoryUrl) ? repositoryUrl : undefined)
          : undefined
        this.activeContainers.set(containerId, containerInfo)
      }

      advancedUI.logSuccess(`✓ Repository setup completed in container ${containerId}`)
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to setup repository: ${error.message}`)
      throw error
    }
  }

  /**
   * Setup simple development environment (Node.js only)
   */
  async setupVSCodeServer(containerId: string): Promise<void> {
    try {
      advancedUI.logInfo(`🔨 Setting up development environment in container ${containerId}`)

      const devCommands = [
        // Verify Node.js is working
        'cd /workspace/repo && node --version',

        // Install project dependencies if package.json exists
        'cd /workspace/repo && [ -f package.json ] && npm install || echo "No package.json found, skipping npm install"',
      ]

      for (const command of devCommands) {
        await this.executeCommand(containerId, command)
      }

      advancedUI.logSuccess(`✓ Development environment ready`)
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to setup development environment: ${error.message}`)
      throw error
    }
  }

  /**
   * Get container logs
   */
  async getContainerLogs(containerId: string, lines: number = 100): Promise<string> {
    return await this.containerManager.getContainerLogs(containerId, lines)
  }

  /**
   * Setup complete development environment (simplified)
   */
  async setupDevelopmentEnvironment(containerId: string): Promise<void> {
    try {
      advancedUI.logInfo(`🔨 Setting up shell environment in container ${containerId}`)

      const devCommands = [
        // Setup shell environment
        'echo "cd /workspace/repo" >> ~/.bashrc',
        'echo "alias ll=\'ls -la\'" >> ~/.bashrc',
      ]

      for (const command of devCommands) {
        await this.executeCommand(containerId, command)
      }

      advancedUI.logSuccess(`✓ Shell environment ready`)
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to setup shell environment: ${error.message}`)
      throw error
    }
  }

  /**
   * Execute command in container
   */
  async executeCommand(containerId: string, command: string): Promise<string> {
    try {
      const result = await this.containerManager.executeCommand(containerId, command)

      // Log command execution for debugging
      advancedUI.logInfo(`🔧 Container ${containerId.slice(0, 8)}: ${command}`)

      // Emit command execution event for streaming
      this.emit('command:executed', {
        containerId,
        command,
        result,
        timestamp: new Date(),
      })

      return result
    } catch (error: any) {
      advancedUI.logError(`❌ Command failed in ${containerId.slice(0, 8)}: ${command}`)

      // Emit command error event
      this.emit('command:error', {
        containerId,
        command,
        error: error.message,
        timestamp: new Date(),
      })

      throw error
    }
  }

  /**
   * Execute command with streaming output
   */
  async *executeCommandStreaming(
    containerId: string,
    command: string
  ): AsyncGenerator<CommandStreamChunk, void, unknown> {
    try {
      advancedUI.logInfo(`🌊 Streaming command in ${containerId.slice(0, 8)}: ${command}`)

      // Emit start event
      yield {
        type: 'start',
        containerId,
        command,
        timestamp: new Date(),
      }

      // Execute command and stream output line by line
      const result = await this.containerManager.executeCommand(containerId, command)
      const lines = result.split('\n')

      for (const line of lines) {
        if (line.trim()) {
          yield {
            type: 'output',
            containerId,
            command,
            output: `${line}\n`,
            timestamp: new Date(),
          }

          // Brief delay for readability
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }

      // Emit completion
      yield {
        type: 'complete',
        containerId,
        command,
        finalOutput: result,
        timestamp: new Date(),
      }

      // Emit command execution event for streaming
      this.emit('command:executed', {
        containerId,
        command,
        result,
        timestamp: new Date(),
      })
    } catch (error: any) {
      advancedUI.logError(`❌ Streaming command failed in ${containerId.slice(0, 8)}: ${command}`)

      // Yield error
      yield {
        type: 'error',
        containerId,
        command,
        error: error.message,
        timestamp: new Date(),
      }

      // Emit command error event
      this.emit('command:error', {
        containerId,
        command,
        error: error.message,
        timestamp: new Date(),
      })

      throw error
    }
  }

  /**
   * Create pull request from container
   */
  async createPullRequest(containerId: string, prConfig: PullRequestConfig): Promise<string> {
    try {
      advancedUI.logInfo(`📝 Creating pull request from container ${containerId}`)
      const branchName = prConfig.branch || `automated-changes-${Date.now()}`

      const prCommands = [
        'cd /workspace/repo',
        // Create new branch and switch to it
        `git checkout -b ${branchName}`,
        // Push branch (assumes commits already exist)
        `git push -u origin ${branchName}`,
      ]

      for (const command of prCommands) {
        await this.executeCommand(containerId, command)
      }

      // Create pull request using GitHub API
      const active = this.activeContainers.get(containerId)
      const prUrl = await this.createGitHubPullRequest(
        { ...prConfig, repositoryUrl: active?.repositoryUrl },
        branchName
      )

      advancedUI.logSuccess(`✓ Pull request created: ${prUrl}`)
      return prUrl
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to create pull request: ${error.message}`)
      throw error
    }
  }

  /**
   * Create GitHub pull request with enhanced integration
   */
  private async createGitHubPullRequest(prConfig: any, branchName: string): Promise<string> {
    try {
      const fetchFn: any = (global as any).fetch

      // Extract repository info from URL (supports HTTPS and SSH forms)
      // Examples supported:
      // - https://github.com/owner/repo.git
      // - git@github.com:owner/repo.git
      // - ssh://git@github.com/owner/repo.git
      const repoMatch = prConfig.repositoryUrl?.match(/github\.com[/:]([^/:]+)\/([^/]+)(?:\.git)?/)
      if (!repoMatch) {
        throw new Error('Invalid GitHub repository URL')
      }

      const [, owner, rawRepo] = repoMatch
      const repoName = rawRepo.replace(/\.git$/, '')

      // Get GitHub token from environment with enhanced validation
      const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
      if (!githubToken || !fetchFn) {
        advancedUI.logWarning('⚠️ Missing GitHub token; generating manual PR URL')
        const manualUrl = this.generateManualPRUrl(owner, repoName, branchName, prConfig)
        advancedUI.logInfo(`📋 Manual PR URL: ${manualUrl}`)
        return manualUrl
      }

      // Determine base branch: prefer provided baseBranch, otherwise fetch repository default branch
      let baseBranch: string = prConfig.baseBranch
      if (!baseBranch) {
        try {
          const repoResp = await fetchFn(`https://api.github.com/repos/${owner}/${repoName}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'NikCLI-VM-Agent',
            },
          })
          if (repoResp.ok) {
            const repoInfo = (await repoResp.json()) as { default_branch?: string }
            baseBranch = repoInfo.default_branch || 'main'
          } else {
            baseBranch = 'main'
          }
        } catch {
          baseBranch = 'main'
        }
      }

      const headRef = `${owner}:${branchName}`

      // Create pull request using GitHub API
      const response = await fetchFn(`https://api.github.com/repos/${owner}/${repoName}/pulls`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'NikCLI-VM-Agent',
        },
        body: JSON.stringify({
          title: prConfig.title,
          body: prConfig.description,
          head: headRef,
          base: baseBranch,
          draft: prConfig.draft || false,
        }),
      })

      if (!response.ok) {
        const error = (await response.json()) as Error

        // If a PR already exists for this branch, return it instead of failing
        if (
          response.status === 422 &&
          typeof error?.message === 'string' &&
          error.message.toLowerCase().includes('a pull request already exists')
        ) {
          try {
            const existingResp = await fetchFn(
              `https://api.github.com/repos/${owner}/${repoName}/pulls?head=${encodeURIComponent(headRef)}&state=open`,
              {
                method: 'GET',
                headers: {
                  Authorization: `Bearer ${githubToken}`,
                  Accept: 'application/vnd.github.v3+json',
                  'User-Agent': 'NikCLI-VM-Agent',
                },
              }
            )
            if (existingResp.ok) {
              const prs = (await existingResp.json()) as Array<{ html_url: string }>
              if (Array.isArray(prs) && prs.length > 0) {
                return prs[0].html_url
              }
            }
          } catch {
            // Ignore and fall through to error
          }
        }

        throw new Error(`GitHub API error: ${error?.message || response.statusText}`)
      }

      const pullRequest = (await response.json()) as { html_url: string }
      return pullRequest.html_url
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to create GitHub PR: ${error.message}`)

      // Enhanced fallback with repository validation
      const repoMatch = prConfig.repositoryUrl?.match(/github\.com[/:]([^/:]+)\/([^/]+)(?:\.git)?/)
      if (repoMatch) {
        const [, owner, repo] = repoMatch
        const repoName = repo.replace(/\.git$/, '')
        return this.generateManualPRUrl(owner, repoName, branchName, prConfig)
      }

      throw error
    }
  }

  /**
   * Stop container
   */
  async stopContainer(containerId: string): Promise<void> {
    try {
      advancedUI.logInfo(`🛑 Stopping container ${containerId}`)

      await this.containerManager.stopContainer(containerId)

      // Update container status
      const containerInfo = this.activeContainers.get(containerId)
      if (containerInfo) {
        containerInfo.status = 'stopped'
        this.activeContainers.set(containerId, containerInfo)
      }

      this.emit('container:stopped', { containerId })
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to stop container: ${error.message}`)
      throw error
    }
  }

  /**
   * Remove container and cleanup
   */
  async removeContainer(containerId: string): Promise<void> {
    try {
      advancedUI.logInfo(`🗑️ Removing container ${containerId}`)

      await this.containerManager.removeContainer(containerId)

      // Cleanup local tracking
      this.activeContainers.delete(containerId)
      this.containerMetrics.delete(containerId)

      this.emit('container:removed', { containerId })
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to remove container: ${error.message}`)
      throw error
    }
  }

  /**
   * Get container metrics
   */
  async getContainerMetrics(containerId: string): Promise<VMMetrics> {
    try {
      const stats = await this.containerManager.getContainerStats(containerId)

      const metrics: VMMetrics = {
        memoryUsage: stats.memory_usage || 0,
        cpuUsage: stats.cpu_usage || 0,
        diskUsage: stats.disk_usage || 0,
        networkActivity: stats.network_activity || 0,
        uptime: stats.uptime || 0,
      }

      this.containerMetrics.set(containerId, metrics)
      return metrics
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to get container metrics: ${error.message}`)
      return {
        memoryUsage: 0,
        cpuUsage: 0,
        diskUsage: 0,
        networkActivity: 0,
        uptime: 0,
      }
    }
  }

  /**
   * Get VS Code Server port for container
   */
  async getVSCodePort(containerId: string): Promise<number> {
    const containerInfo = this.activeContainers.get(containerId)
    return containerInfo?.vscodePort || 8080
  }

  /**
   * Get all active containers
   */
  getActiveContainers(): ContainerInfo[] {
    return Array.from(this.activeContainers.values())
  }

  /**
   * Generate random VS Code Server port
   */
  private generateVSCodePort(): number {
    return Math.floor(Math.random() * (9000 - 8080 + 1)) + 8080
  }

  /**
   * Extract VS Code port from port mapping
   */
  private extractVSCodePort(portMapping: string): number {
    const match = portMapping.match(/^(\d+):/)
    return match ? parseInt(match[1], 10) : 8080
  }

  /**
   * Initialize VM communication bridge
   */
  private async initializeCommunicationBridge(): Promise<void> {
    if (this.bridgeInitialized) return

    try {
      // Initialize bridge components
      await vmChatBridge.initialize()

      // Setup event handlers for container lifecycle
      this.on('container:created', async ({ containerId, agentId }) => {
        try {
          // Wait a moment for container to be fully ready
          await new Promise((resolve) => setTimeout(resolve, 2000))

          // Create session for new container
          const session = await vmSessionManager.createSession(containerId, agentId)
          advancedUI.logSuccess(`📝 Created VM session ${session.sessionId} for container ${containerId.slice(0, 12)}`)
        } catch (error: any) {
          advancedUI.logError(`❌ Failed to create session for container ${containerId}: ${error.message}`)
        }
      })

      this.on('container:stopped', ({ containerId }) => {
        // End session when container stops
        const session = vmSessionManager.getSessionByContainer(containerId)
        if (session) {
          vmSessionManager.endSession(session.sessionId, 'container_stopped')
        }
      })

      this.bridgeInitialized = true
      advancedUI.logSuccess('✓ VM communication bridge initialized')
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to initialize VM communication bridge: ${error.message}`)
    }
  }

  /**
   * Register VM agent with communication bridge
   */
  async registerVMAgent(agent: any): Promise<void> {
    try {
      await vmChatBridge.registerVMAgent(agent)
      advancedUI.logSuccess(`🔌 Registered VM agent ${agent.id} with communication bridge`)
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to register VM agent with bridge: ${error.message}`)
      throw error
    }
  }

  /**
   * Send message to VM agent via bridge
   */
  async sendMessageToAgent(agentId: string, message: string): Promise<any> {
    try {
      return await vmChatBridge.sendMessageToAgent(agentId, message)
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to send message to agent ${agentId}: ${error.message}`)
      throw error
    }
  }

  /**
   * Send message with streaming response
   */
  async *sendMessageToAgentStreaming(agentId: string, message: string): AsyncGenerator<any, any, unknown> {
    try {
      for await (const chunk of vmChatBridge.sendMessageToAgentStreaming(agentId, message)) {
        yield chunk
      }
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to stream message to agent ${agentId}: ${error.message}`)
      throw error
    }
  }

  /**
   * Get bridge statistics
   */
  getBridgeStats(): any {
    return vmChatBridge.getBridgeStats()
  }

  /**
   * Create and register VM agent for container
   */
  private async createAndRegisterVMAgent(containerId: string, config: ContainerCreationConfig): Promise<void> {
    try {
      advancedUI.logInfo(`🔌 Creating VM agent for container ${containerId.slice(0, 12)}`)

      // Dynamically import SecureVirtualizedAgent to avoid circular dependencies
      const { SecureVirtualizedAgent } = await import('./secure-vm-agent')

      // Create agent instance
      const agent = new SecureVirtualizedAgent(process.cwd(), {
        agentId: config.agentId,
        name: `VM Agent ${config.agentId}`,
        description: `Autonomous VM agent for ${config.repositoryUrl}`,
        capabilities: config.capabilities,
        specialization: 'autonomous-vm-development',
      })

      // Set container ID
      agent.setContainerId(containerId)

      // Initialize agent
      await agent.initialize()

      // Register with bridge
      await this.registerVMAgent(agent)

      advancedUI.logSuccess(`✓ VM agent ${config.agentId} created and registered`)
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to create VM agent: ${error.message}`)
      throw error
    }
  }

  /**
   * Generate manual PR URL with enhanced parameters
   */
  private generateManualPRUrl(owner: string, repoName: string, branchName: string, prConfig: any): string {
    const baseUrl = `https://github.com/${owner}/${repoName}/compare/${branchName}`
    const params = new URLSearchParams({
      expand: '1',
      title: prConfig.title,
      body: this.enhancePRDescription(prConfig.description),
    })
    return `${baseUrl}?${params.toString()}`
  }

  /**
   * Enhance PR description with VM agent metadata
   */
  private enhancePRDescription(description: string): string {
    const timestamp = new Date().toISOString()
    const metadata = `\n\n---\n🔌 Generated by NikCLI VM Agent\n⏰ ${timestamp}\n🔧 Automated development workflow`
    return `${description}${metadata}`
  }

  private looksLikeLocalPath(repositoryTarget: string): boolean {
    if (!repositoryTarget) {
      return false
    }

    if (/^file:\/\//i.test(repositoryTarget)) {
      return true
    }

    if (/^[a-zA-Z]:\\/.test(repositoryTarget)) {
      return true
    }

    return (
      repositoryTarget.startsWith('/') ||
      repositoryTarget.startsWith('./') ||
      repositoryTarget.startsWith('../') ||
      repositoryTarget.startsWith('~')
    )
  }

  /**
   * Setup cleanup handlers for graceful shutdown
   */
  private setupCleanupHandlers(): void {
    process.on('SIGINT', () => this.cleanupAllContainers())
    process.on('SIGTERM', () => this.cleanupAllContainers())
    process.on('exit', () => this.cleanupAllContainers())
  }

  /**
   * Cleanup all active containers
   */
  private async cleanupAllContainers(): Promise<void> {
    advancedUI.logInfo(`🧹 Cleaning up ${this.activeContainers.size} active containers`)

    // Shutdown communication bridge
    if (this.bridgeInitialized) {
      try {
        await vmChatBridge.shutdown()
        await vmWebSocketServer.stop()
      } catch (error: any) {
        advancedUI.logError(`Error shutting down communication bridge: ${error.message}`)
      }
    }

    const cleanupPromises = Array.from(this.activeContainers.keys()).map(async (containerId) => {
      try {
        await this.stopContainer(containerId)
        await this.removeContainer(containerId)
      } catch (error: any) {
        advancedUI.logError(`Error cleaning up container ${containerId}: ${error.message}`)
      }
    })

    await Promise.allSettled(cleanupPromises)
  }

  /** Public dispose method to cleanup containers and bridge */
  async dispose(): Promise<void> {
    try {
      await this.cleanupAllContainers()
      this.removeAllListeners()
    } catch {
      // ignore
    }
  }
}

// Type definitions
export interface RepositorySetupOptions {
  useLocalPath?: boolean
}

export interface ContainerCreationConfig {
  agentId: string
  repositoryUrl: string
  localRepoPath?: string
  sessionToken: string
  proxyEndpoint: string
  capabilities: string[]
  containerImage?: string
  extraVolumes?: string[]
}

export interface ContainerInfo {
  id: string
  name: string
  agentId: string
  repositoryUrl: string
  localRepositoryPath?: string
  repositoryPath?: string
  createdAt: Date
  status: 'running' | 'stopped' | 'error'
  vscodePort: number
}

export interface PullRequestConfig {
  title: string
  description: string
  branch?: string
  baseBranch?: string
  draft?: boolean
}

export interface CommandStreamChunk {
  type: 'start' | 'output' | 'complete' | 'error'
  containerId: string
  command: string
  output?: string
  finalOutput?: string
  error?: string
  timestamp: Date
}
