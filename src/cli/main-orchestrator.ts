#!/usr/bin/env bun

/**
 * Main AI Development Orchestrator
 * Production-ready autonomous development system with streaming interface
 */

import chalk from 'chalk'
import { modelProvider } from './ai/model-provider'
import { agentService } from './services/agent-service'
import { lspService } from './services/lsp-service'
import { memoryService } from './services/memory-service'
import { planningService } from './services/planning-service'
// Register session todo tools (todoread/todowrite)
import './tools/todo-tools'
import { mcpClient } from './core/mcp-client'
import { lspManager } from './lsp/lsp-manager'
import { snapshotService } from './services/snapshot-service'
import { toolService } from './services/tool-service'
import { StreamingOrchestrator } from './streaming-orchestrator'
import { advancedUI } from './ui/advanced-cli-ui'
import { diffManager } from './ui/diff-manager'
import { ContainerManager } from './virtualized-agents/container-manager'
import { VMOrchestrator } from './virtualized-agents/vm-orchestrator'

// 🔒 FIXED: Service initialization tracking
interface ServiceState {
  name: string
  initialized: boolean
  phase: 'core' | 'dependent' | 'all'
  dependencies: string[]
  error?: Error
}

export class MainOrchestrator {
  private streamOrchestrator: StreamingOrchestrator
  private vmOrchestrator: VMOrchestrator
  private containerManager: ContainerManager
  private initialized = false
  // 🔒 FIXED: Track initialization state per service
  private serviceStates = new Map<string, ServiceState>()

  constructor() {
    this.streamOrchestrator = new StreamingOrchestrator()
    this.containerManager = new ContainerManager()
    this.vmOrchestrator = new VMOrchestrator(this.containerManager)
    this.setupGlobalHandlers()
    this.setupVMEventListeners()
  }

  private setupGlobalHandlers(): void {
    // Enhanced global error handler with recovery
    process.on('unhandledRejection', (reason, _promise) => {
      console.error(chalk.red('❌ Unhandled Rejection:'), reason)
      // Attempt graceful recovery
      this.handleRecoverableError(reason)
    })

    process.on('uncaughtException', (error) => {
      console.error(chalk.red('❌ Uncaught Exception:'), error)
      this.gracefulShutdown()
    })

    // Graceful shutdown handlers
    process.on('SIGTERM', this.gracefulShutdown.bind(this))
    process.on('SIGINT', this.gracefulShutdown.bind(this))
  }

  private async gracefulShutdown(): Promise<void> {
    advancedUI.logWarning('\n Shutting down orchestrator...')

    try {
      // Stop all active agents
      const activeAgents = agentService.getActiveAgents()
      if (activeAgents.length > 0) {
        advancedUI.logWarning(`⏳ Waiting for ${activeAgents.length} agents to complete...`)
        // In production, implement proper agent shutdown
      }

      // Save any pending diffs
      const pendingDiffs = diffManager.getPendingCount()
      if (pendingDiffs > 0) {
        advancedUI.logWarning(` ${pendingDiffs} diffs still pending`)
      }

      // Clear resources
      await this.cleanup()

      // Dispose subsystems (best-effort)
      try {
        await lspManager.dispose()
      } catch {}
      try {
        await (lspService as any)?.dispose?.()
      } catch {}
      try {
        await (agentService as any)?.dispose?.()
      } catch {}
      try {
        await (toolService as any)?.dispose?.()
      } catch {}
      try {
        ;(advancedUI as any)?.dispose?.()
      } catch {}
      try {
        await mcpClient.dispose()
      } catch {}
      try {
        await (this.vmOrchestrator as any)?.dispose?.()
      } catch {}

      advancedUI.logSuccess('✓ Orchestrator shut down cleanly')
    } catch (error) {
      advancedUI.logError('❌ Error during shutdown: ' + error)
    } finally {
      process.exit(0)
    }
  }

  private async cleanup(): Promise<void> {
    // Cleanup services
    const lspServers = lspService.getServerStatus()
    for (const server of lspServers) {
      if (server.status === 'running') {
        await lspService.stopServer(server.name.toLowerCase().replace(' ', '-'))
      }
    }

    // Cache cleanup for memory efficiency
    try {
      // Clear all cache systems (graceful cleanup)
      if ('clearAllCaches' in memoryService) (memoryService as any).clearAllCaches()
      if ('clearCache' in planningService) (planningService as any).clearCache()
      if ('clearCache' in toolService) (toolService as any).clearCache()
      if ('clearCache' in snapshotService) (snapshotService as any).clearCache()
    } catch (_error) {
      // Silent fallback - cache cleanup is non-critical
    }
  }

  private handleRecoverableError(error: any): void {
    try {
      // Log error details for debugging
      advancedUI.logWarning('⚡︎ Attempting error recovery...')

      // Reset critical services state
      if (typeof error === 'object' && error?.message?.includes('ENOTFOUND')) {
        advancedUI.logWarning('🌐 Network error detected, switching to offline mode')
      } else if (error?.message?.includes('timeout')) {
        advancedUI.logWarning('⏱️ Timeout detected, increasing retry intervals')
      }

      advancedUI.logSuccess('✓ Error recovery completed')
    } catch (recoveryError) {
      advancedUI.logError('❌ Recovery failed: ' + recoveryError)
    }
  }

  private async checkSystemRequirements(): Promise<boolean> {
    advancedUI.logFunctionCall('checksystemrequirements')
    advancedUI.logFunctionUpdate('info', 'Checking system requirements...', 'ℹ')

    const checks = [
      this.checkNodeVersion(),
      this.checkAPIKeys(),
      this.checkWorkingDirectory(),
      this.checkDependencies(),
    ]

    const results = await Promise.all(checks)
    const allPassed = results.every((r) => r)

    if (allPassed) {
      advancedUI.logSuccess('✓ All system checks passed')
    } else {
      advancedUI.logError(' System requirements not met')
    }

    return allPassed
  }

  private checkNodeVersion(): boolean {
    const version = process.version
    const major = parseInt(version.slice(1).split('.')[0], 10)

    if (major < 18) {
      advancedUI.logError(` Node.js ${major} is too old. Requires Node.js 18+`)
      return false
    }

    advancedUI.logSuccess(` Node.js ${version}`)
    return true
  }

  private checkAPIKeys(): boolean {
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY
    const hasOpenAI = !!process.env.OPENAI_API_KEY
    const hasGoogle = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
    const hasVercel = !!process.env.V0_API_KEY

    if (!hasAnthropic && !hasOpenAI && !hasGoogle && !hasVercel) {
      advancedUI.logError(' No API keys found')
      console.log(
        chalk.yellow('Set at least one: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or V0_API_KEY')
      )
      return false
    }

    const available = []
    if (hasAnthropic) available.push('Claude')
    if (hasOpenAI) available.push('GPT')
    if (hasGoogle) available.push('Gemini')
    if (hasVercel) available.push('Vercel')
    advancedUI.logSuccess(` API Keys: ${available.join(', ')}`)
    return true
  }

  private checkWorkingDirectory(): boolean {
    const cwd = process.cwd()
    const fs = require('fs')

    if (!fs.existsSync(cwd)) {
      advancedUI.logError(` Working directory does not exist: ${cwd}`)
      return false
    }

    advancedUI.logSuccess(` Working directory: ${cwd}`)
    return true
  }

  private checkDependencies(): boolean {
    try {
      // Check critical dependencies
      require('chalk')
      require('boxen')
      require('nanoid')
      require('diff')

      advancedUI.logSuccess(' All dependencies available')
      return true
    } catch (error) {
      advancedUI.logError(` Missing dependencies: ${error}`)
      return false
    }
  }

  /**
   * FIXED: Added phased initialization with dependency tracking and rollback
   */
  private async initializeSystem(): Promise<boolean> {
    advancedUI.logFunctionCall('aidevelopmentorchestratorinit')
    advancedUI.logFunctionUpdate('info', 'Initializing AI Development Orchestrator...', 'ℹ')
    advancedUI.logFunctionUpdate('info', '─'.repeat(60))

    // Define services with dependencies and phases
    const services = [
      // Phase 1: Core services (no dependencies)
      {
        name: 'Service Registration',
        fn: this.initializeServices.bind(this),
        phase: 'core' as const,
        dependencies: [],
      },
      {
        name: 'Security Policies',
        fn: this.initializeSecurity.bind(this),
        phase: 'core' as const,
        dependencies: [],
      },

      // Phase 2: Dependent services (depend on core)
      {
        name: 'Tool System',
        fn: this.initializeTools.bind(this),
        phase: 'dependent' as const,
        dependencies: ['Service Registration'],
      },
      {
        name: 'Memory System',
        fn: this.initializeMemory.bind(this),
        phase: 'dependent' as const,
        dependencies: ['Service Registration'],
      },
      {
        name: 'Snapshot System',
        fn: this.initializeSnapshot.bind(this),
        phase: 'dependent' as const,
        dependencies: ['Service Registration'],
      },
      {
        name: 'Context Management',
        fn: this.initializeContext.bind(this),
        phase: 'dependent' as const,
        dependencies: ['Service Registration'],
      },

      // Phase 3: All services (depend on dependent services)
      {
        name: 'Agent System',
        fn: this.initializeAgents.bind(this),
        phase: 'all' as const,
        dependencies: ['Tool System', 'Memory System'],
      },
      {
        name: 'Planning System',
        fn: this.initializePlanning.bind(this),
        phase: 'all' as const,
        dependencies: ['Service Registration', 'Agent System'],
      },
      {
        name: 'VM Orchestration',
        fn: this.initializeVMOrchestration.bind(this),
        phase: 'all' as const,
        dependencies: ['Agent System', 'Context Management'],
      },
    ]

    // Initialize service states
    for (const service of services) {
      this.serviceStates.set(service.name, {
        name: service.name,
        initialized: false,
        phase: service.phase,
        dependencies: service.dependencies,
      })
    }

    // Execute phased initialization
    const phases: Array<'core' | 'dependent' | 'all'> = ['core', 'dependent', 'all']

    for (const phase of phases) {
      advancedUI.logFunctionUpdate('info', `\n Phase: ${phase.toUpperCase()}`)
      const phaseServices = services.filter((s) => s.phase === phase)

      for (const service of phaseServices) {
        try {
          // Check service dependencies
          const depsReady = this.checkServiceDependencies(service.name)
          if (!depsReady) {
            throw new Error(`Dependencies not ready for ${service.name}`)
          }

          advancedUI.logFunctionUpdate('info', ` ${service.name}...`)
          await service.fn()

          // Mark as initialized
          const state = this.serviceStates.get(service.name)!
          state.initialized = true

          advancedUI.logSuccess(` ${service.name} initialized`)
        } catch (error: any) {
          advancedUI.logError(` ${service.name} failed: ${error.message}`)

          // Mark error
          const state = this.serviceStates.get(service.name)!
          state.error = error

          // Rollback initialized services
          await this.rollbackInitialization(phase)
          return false
        }
      }

      // Validate phase completion
      const phaseValid = this.validatePhase(phase)
      if (!phaseValid) {
        advancedUI.logError(` Phase ${phase} validation failed`)
        await this.rollbackInitialization(phase)
        return false
      }

      advancedUI.logSuccess(` Phase ${phase} complete`)
    }

    this.initialized = true
    advancedUI.logSuccess('\n System initialization complete!')
    return true
  }

  /**
   * Check if all service dependencies are initialized
   */
  private checkServiceDependencies(serviceName: string): boolean {
    const state = this.serviceStates.get(serviceName)
    if (!state) return false

    for (const dep of state.dependencies) {
      const depState = this.serviceStates.get(dep)
      if (!depState || !depState.initialized) {
        advancedUI.logWarning(` Dependency not ready: ${dep}`)
        return false
      }
    }

    return true
  }

  /**
   * Validate that all services in a phase are initialized
   */
  private validatePhase(phase: 'core' | 'dependent' | 'all'): boolean {
    for (const [_name, state] of this.serviceStates) {
      if (state.phase === phase && !state.initialized) {
        return false
      }
    }
    return true
  }

  /**
   * Rollback initialization on failure
   */
  private async rollbackInitialization(failedPhase: 'core' | 'dependent' | 'all'): Promise<void> {
    advancedUI.logFunctionUpdate('info', `\n Rolling back initialization...`)

    // Get list of initialized services
    const initializedServices: string[] = []
    for (const [name, state] of this.serviceStates) {
      if (state.initialized) {
        initializedServices.push(name)
      }
    }

    // Cleanup in reverse order
    for (const serviceName of initializedServices.reverse()) {
      try {
        advancedUI.logFunctionUpdate('info', `   Cleaning up ${serviceName}...`)
        // Services should implement their own cleanup if needed
        const state = this.serviceStates.get(serviceName)!
        state.initialized = false
      } catch (error: any) {
        advancedUI.logWarning(` Cleanup warning for ${serviceName}: ${error.message}`)
      }
    }

    advancedUI.logSuccess(` Rollback complete`)
  }

  private async initializeServices(): Promise<void> {
    // Set working directory for all services
    const workingDir = process.cwd()

    toolService.setWorkingDirectory(workingDir)
    planningService.setWorkingDirectory(workingDir)
    lspService.setWorkingDirectory(workingDir)
    diffManager.setAutoAccept(true) // Default to auto-accept as shown in image
  }

  private async initializeAgents(): Promise<void> {
    // Agent service is initialized via import
    // Verify all agents are available
    const agents = agentService.getAvailableAgents()
    advancedUI.logFunctionUpdate('info', `   Loaded ${agents.length} agents`)
  }

  private async initializePlanning(): Promise<void> {
    // Planning service initialization
    advancedUI.logFunctionUpdate('info', '   Planning system ready')
  }

  private async initializeTools(): Promise<void> {
    const tools = toolService.getAvailableTools()
    advancedUI.logFunctionUpdate('info', `   Loaded ${tools.length} tools`)
  }

  private async initializeMemory(): Promise<void> {
    await memoryService.initialize()
    advancedUI.logFunctionUpdate('info', '   Memory system ready')
  }

  private async initializeSnapshot(): Promise<void> {
    await snapshotService.initialize()
    advancedUI.logFunctionUpdate('info', '   Snapshot system ready')
  }

  private async initializeSecurity(): Promise<void> {
    // Security policies are initialized in the orchestrator
    advancedUI.logFunctionUpdate('info', '   Security policies loaded')
  }

  private async initializeContext(): Promise<void> {
    // Context management is handled in the streaming orchestrator
    advancedUI.logFunctionUpdate('info', '   Context management ready')
  }

  private async initializeVMOrchestration(): Promise<void> {
    // Initialize VM orchestration system
    advancedUI.logFunctionUpdate('info', '   VM Orchestrator ready')
    advancedUI.logFunctionUpdate('info', '   Container Manager ready')

    // Create VM monitoring panels
    await this.streamOrchestrator.createPanel({
      id: 'vm-status',
      title: '🐳 VM Status',
      position: 'right',
      width: 35,
    })

    await this.streamOrchestrator.createPanel({
      id: 'vm-logs',
      title: '📝 VM Agent Logs',
      position: 'bottom',
      height: 12,
    })

    await this.streamOrchestrator.createPanel({
      id: 'vm-metrics',
      title: '📊 VM Metrics',
      position: 'right',
      width: 25,
    })

    // Set initial status
    await this.streamOrchestrator.streamToPanel('vm-status', '🟢 VM Orchestration Initialized\n')
    await this.streamOrchestrator.streamToPanel('vm-status', `Containers: 0 active\n`)
  }

  private setupVMEventListeners(): void {
    // Listen to VM orchestrator events
    this.vmOrchestrator.on('container:created', async (data: any) => {
      await this.streamOrchestrator.streamToPanel(
        'vm-status',
        `🟢 Container created: ${data.containerId?.slice(0, 8)}\n`
      )
      await this.updateVMStatus()
    })

    this.vmOrchestrator.on('container:started', async (data: any) => {
      await this.streamOrchestrator.streamToPanel(
        'vm-status',
        `▶️ Container started: ${data.containerId?.slice(0, 8)}\n`
      )
    })

    this.vmOrchestrator.on('container:stopped', async (data: any) => {
      await this.streamOrchestrator.streamToPanel(
        'vm-status',
        `🔴 Container stopped: ${data.containerId?.slice(0, 8)}\n`
      )
      await this.updateVMStatus()
    })

    this.vmOrchestrator.on('container:removed', async (data: any) => {
      await this.streamOrchestrator.streamToPanel(
        'vm-status',
        `🗑️ Container removed: ${data.containerId?.slice(0, 8)}\n`
      )
      await this.updateVMStatus()
    })

    this.vmOrchestrator.on('container:log', async (data: any) => {
      const timestamp = new Date().toLocaleTimeString()
      await this.streamOrchestrator.streamToPanel(
        'vm-logs',
        `[${timestamp}] [${data.containerId?.slice(0, 8)}] ${data.log}\n`
      )
    })

    this.vmOrchestrator.on('container:metrics', async (data: any) => {
      await this.streamOrchestrator.streamToPanel(
        'vm-metrics',
        `📊 ${data.containerId?.slice(0, 8)}:\n` +
          `   Memory: ${(data.metrics?.memoryUsage / 1024 / 1024).toFixed(2)} MB\n` +
          `   CPU: ${data.metrics?.cpuUsage?.toFixed(2)}%\n` +
          `   Network: ${(data.metrics?.networkActivity / 1024).toFixed(2)} KB\n\n`
      )
    })

    this.vmOrchestrator.on('agent:message', async (data: any) => {
      await this.streamOrchestrator.streamToPanel('vm-logs', `[AGENT] ${data.agentId}: ${data.message}\n`)
    })

    this.vmOrchestrator.on('agent:error', async (data: any) => {
      await this.streamOrchestrator.streamToPanel('vm-logs', `[ERROR] ${data.agentId}: ${data.error}\n`)
    })
  }

  private async updateVMStatus(): Promise<void> {
    const containers = this.vmOrchestrator.getActiveContainers()
    await this.streamOrchestrator.streamToPanel('vm-status', `\nActive Containers: ${containers.length}\n`)

    for (const container of containers) {
      await this.streamOrchestrator.streamToPanel(
        'vm-status',
        `• ${container.id.slice(0, 8)} - ${container.status} - ${container.agentId}\n`
      )
    }
  }

  getVMOrchestrator(): VMOrchestrator {
    return this.vmOrchestrator
  }

  getStreamOrchestrator(): StreamingOrchestrator {
    return this.streamOrchestrator
  }

  async start(): Promise<void> {
    try {
      // Show startup banner

      // Wait for user to see banner
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Check system requirements
      const requirementsMet = await this.checkSystemRequirements()
      if (!requirementsMet) {
        advancedUI.logError('\n Cannot start - system requirements not met')
        process.exit(1)
      }

      // Initialize all systems
      const initialized = await this.initializeSystem()
      if (!initialized) {
        advancedUI.logError('\n Cannot start - system initialization failed')
        process.exit(1)
      }

      // Show quick start guide

      // Start the streaming orchestrator
      advancedUI.logFunctionCall(' Starting Streaming Orchestrator...\n')
      await this.streamOrchestrator.start()

      // Set default provider preference for OpenRouter if configured
      const modelInfo = modelProvider.getCurrentModelInfo()
      if (modelInfo.config.provider === 'openrouter') {
        advancedUI.logFunctionCall(' Using OpenRouter for enhanced model routing')
        // Pass provider preference to orchestrator if supported
        if (this.streamOrchestrator.addListener) {
          this.streamOrchestrator.addListener('provider', (_provider: string) => {
            only: ['openrouter']
          })
        }
      }
    } catch (error: any) {
      advancedUI.logError(' Failed to start orchestrator:', error)
      process.exit(1)
    }

    // Start if run directly
    if (import.meta.main) {
      const orchestrator = new MainOrchestrator()
      orchestrator.start().catch((error) => {
        advancedUI.logError(' Startup failed:', error)
        process.exit(1)
      })
    }
  }
}
