import { EventEmitter } from 'node:events'
import boxen from 'boxen'
import chalk from 'chalk'
import * as readline from 'readline'
import { simpleConfigManager as configManager } from '../core/config-manager'
import { type ModuleContext, ModuleManager } from '../core/module-manager'
import { MiddlewareBootstrap, middlewareManager } from '../middleware'
import { ExecutionPolicyManager } from '../policies/execution-policy'
import { advancedUI } from '../ui/advanced-cli-ui'
import { diffManager } from '../ui/diff-manager'
import { type AgentTask, agentService } from './agent-service'
import { lspService } from './lsp-service'
import { planningService } from './planning-service'
import { toolService } from './tool-service'
import { logger } from '../utils/logger'
import { structuredLogger } from '../utils/structured-logger'
// Ensure session todo tools are registered for Plan Mode
import '../tools/todo-tools'

export interface OrchestratorContext {
  workingDirectory: string
  autonomous: boolean
  planMode: boolean
  autoAcceptEdits: boolean
  isProcessing: boolean
  session: {
    id: string
    messages: any[]
    executionHistory: any[]
  }
}

export class OrchestratorService extends EventEmitter {
  private rl: readline.Interface
  private context: OrchestratorContext
  private policyManager: ExecutionPolicyManager
  private moduleManager: ModuleManager
  private initialized = false
  private middlewareInitialized = false
  private activeAgentTasks: Map<string, AgentTask> = new Map()
  private originalRawMode?: boolean
  private cliInstance: any
  private keypressHandler?: (str: string, key: any) => void
  private todoStoreUnsubscribe?: () => void

  constructor() {
    super()

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 300,
      completer: (line: string, callback: (err: any, result: [string[], string]) => void) => {
        this.autoComplete(line)
          .then((result) => callback(null, result))
          .catch((err) => callback(err, [[], line]))
      },
    })

    this.context = {
      workingDirectory: process.cwd(),
      autonomous: true,
      planMode: false,
      autoAcceptEdits: false,
      isProcessing: false,
      session: {
        id: Date.now().toString(),
        messages: [],
        executionHistory: [],
      },
    }

    // Initialize services
    this.policyManager = new ExecutionPolicyManager(configManager)

    const moduleContext: ModuleContext = {
      ...this.context,
      policyManager: this.policyManager,
    }

    this.moduleManager = new ModuleManager(moduleContext)

    this.setupEventHandlers()
    this.setupServiceListeners()
  }

  private setupEventHandlers(): void {
    // Handle Ctrl+C gracefully
    this.rl.on('SIGINT', () => {
      if (this.context.isProcessing) {
        structuredLogger.warning('OrchestratorService', 'Stopping current operation')
        this.stopAllOperations()
        this.showPrompt()
      } else {
        this.showGoodbye()
        process.exit(0)
      }
    })

    // Enable raw mode for keypress detection (TTY guard)
    if (process.stdin.isTTY) {
      this.originalRawMode = (process.stdin as any).isRaw || false
      require('readline').emitKeypressEvents(process.stdin)
      if (!(process.stdin as any).isRaw) {
        ;(process.stdin as any).setRawMode(true)
      }
      ;(process.stdin as any).resume()
    }

    // Handle keypress events
    const onKeypress = (_str: string, key: any) => {
      if (key && key.name === 'slash' && !this.context.isProcessing) {
        setTimeout(() => this.showCommandMenu(), 50)
      }

      if (key && key.name === 'tab' && key.shift && !this.context.isProcessing) {
        this.togglePlanMode()
      }

      if (key && key.name === 'a' && key.ctrl && !this.context.isProcessing) {
        this.toggleAutoAccept()
      }
    }
    this.keypressHandler = onKeypress
    process.stdin.on('keypress', onKeypress)

    // Handle input
    this.rl.on('line', async (input: string) => {
      const trimmedInput = input.trim()

      if (!trimmedInput) {
        this.showPrompt()
        return
      }

      await this.handleInput(trimmedInput)
      this.showPrompt()
    })

    this.rl.on('close', () => {
      this.teardownInterface()
      this.showGoodbye()
      process.exit(0)
    })
  }

  private teardownInterface(): void {
    try {
      if (this.keypressHandler) {
        process.stdin.removeListener('keypress', this.keypressHandler)
        this.keypressHandler = undefined
      }
      if (process.stdin.isTTY && typeof this.originalRawMode === 'boolean') {
        ;(process.stdin as any).setRawMode(this.originalRawMode)
      }
    } catch {
      // ignore
    }
  }

  private setupServiceListeners(): void {
    // Listen to agent service events (only if NikCLI is not handling them)
    agentService.on('task_start', (task: AgentTask) => {
      this.activeAgentTasks.set(task.id, task)

      // Avoid duplicate logging if NikCLI is active
      const nikCliActive = (global as any).__nikCLI?.eventsSubscribed
      if (!nikCliActive) {
        structuredLogger.info('OrchestratorService', `Agent ${task.agentType} started`)
        logger.debug('Agent task started', { agentType: task.agentType, taskId: task.id, taskPreview: task.task.slice(0, 50) })
      }
    })

    agentService.on('task_progress', (task: AgentTask, update: any) => {
      // Avoid duplicate logging if NikCLI is active
      const nikCliActive = (global as any).__nikCLI?.eventsSubscribed
      if (!nikCliActive) {
        logger.debug('Agent task progress', { agentType: task.agentType, taskId: task.id, progress: update.progress, description: update.description })
      }
    })

    agentService.on('tool_use', (task: AgentTask, update: any) => {
      // Avoid duplicate logging if NikCLI is active
      const nikCliActive = (global as any).__nikCLI?.eventsSubscribed
      if (!nikCliActive) {
        logger.debug('Agent tool usage', { agentType: task.agentType, taskId: task.id, tool: update.tool, description: update.description })
      }
    })

    agentService.on('task_complete', (task: AgentTask) => {
      this.activeAgentTasks.delete(task.id)
      if (task.status === 'completed') {
        advancedUI.logFunctionUpdate('success', `Agent ${task.agentType} completed successfully`, '✓')
        if (task.result) {
          this.displayAgentResult(task)
        }
      } else {
        advancedUI.logFunctionUpdate('error', `Agent ${task.agentType} failed: ${task.error}`, '✖')
      }

      // Check if all background tasks are complete and return to default mode
      this.checkAndReturnToDefaultMode()
    })
  }

  async start(): Promise<void> {
    console.clear()

    if (!this.checkAPIKeys()) {
      return
    }

    this.showWelcome()

    // Start service initialization in background
    this.initializeServices()

    return new Promise<void>((resolve) => {
      this.showPrompt()

      this.rl.on('close', () => {
        resolve()
      })
    })
  }

  private async initializeServices(): Promise<void> {
    // Initialize middleware system first
    if (!this.middlewareInitialized) {
      await MiddlewareBootstrap.initialize(this.policyManager)
      this.middlewareInitialized = true
    }

    // Initialize all services in background
    toolService.setWorkingDirectory(this.context.workingDirectory)
    planningService.setWorkingDirectory(this.context.workingDirectory)
    lspService.setWorkingDirectory(this.context.workingDirectory)

    // Auto-start LSP servers for detected languages
    await lspService.autoStartServers(this.context.workingDirectory)

    this.initialized = true
    advancedUI.logFunctionUpdate('success', 'All services initialized', '✓')
  }

  private async handleInput(input: string): Promise<void> {
    this.context.isProcessing = true

    try {
      // Execute through middleware pipeline for all operations
      const moduleContext: ModuleContext = {
        ...this.context,
        policyManager: this.policyManager,
      }

      const middlewareResult = await middlewareManager.execute(
        input,
        [input], // args array
        moduleContext,
        input.startsWith('/') ? 'command' : input.startsWith('@') ? 'agent' : 'command'
      )

      if (!(middlewareResult as any).success) {
        advancedUI.logFunctionUpdate(
          'error',
          `Operation blocked: ${(middlewareResult as any).error?.message || 'Unknown error'}`,
          '✖'
        )
        return
      }

      // Handle slash commands
      if (input.startsWith('/')) {
        await this.handleCommand(input)
        return
      }

      // Handle agent-specific requests
      const agentMatch = input.match(/^@(\\w+[-\\w]*)/)
      if (agentMatch) {
        const agentName = agentMatch[1]
        const task = input.replace(agentMatch[0], '').trim()
        await this.executeAgentTask(agentName, task)
        return
      }

      // Handle natural language requests
      await this.handleNaturalLanguageRequest(input)
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Error processing input: ${error.message}`, '✖')
    } finally {
      this.context.isProcessing = false
    }
  }

  private async handleCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.slice(1).split(' ')

    // Handle special orchestrator commands
    switch (cmd) {
      case 'status':
        await this.showStatus()
        break
      case 'services':
        await this.showServices()
        break
      case 'agents':
        await this.showActiveAgents()
        break
      case 'middleware':
        await this.showMiddlewareStatus()
        break
      default:
        // Delegate to module manager
        await this.moduleManager.executeCommand(cmd, args)
        // Update context after module execution
        this.updateModuleContext()
    }
  }

  private async executeAgentTask(agentName: string, task: string): Promise<void> {
    if (!task) {
      structuredLogger.error('OrchestratorService', 'Please specify a task for the agent')
      return
    }

    structuredLogger.info('OrchestratorService', `Launching ${agentName} agent`)
    logger.debug('Agent task launching', { agentName, task })
    advancedUI.logInfo(`Launching ${agentName} agent...`, 'Agent')

    try {
      const taskId = await agentService.executeTask(agentName, task, {})
      logger.debug('Agent task launched', { agentName, taskId })
    } catch (error: any) {
      logger.error('Failed to launch agent', { agentName, error: error.message, stack: error.stack })
      structuredLogger.error('OrchestratorService', `Failed to launch agent: ${error.message}`)
    }
  }

  private async handleNaturalLanguageRequest(input: string): Promise<void> {
    if (!this.initialized) {
      await this.initializeServices()
    }

    structuredLogger.info('OrchestratorService', 'Processing natural language request')
    logger.debug('Natural language request', { inputLength: input.length })

    // Check for VM agent trigger patterns
    if (this.isVMAgentRequest(input)) {
      structuredLogger.info('OrchestratorService', 'VM Agent request detected - launching secure virtualized agent')
      await this.executeVMAgentTask(input)
      return
    }

    if (this.context.planMode) {
      // Enable compact stream to reduce noisy logs in plan mode
      try {
        process.env.NIKCLI_COMPACT = '1'
      } catch {}
      try {
        // Create execution plan first
        structuredLogger.info('OrchestratorService', 'Plan Mode: Creating execution plan')
        const plan = await planningService.createPlan(input, {
          showProgress: true,
          autoExecute: false,
          confirmSteps: !this.context.autonomous,
        })

        if (!this.context.autonomous) {
          const proceed = await this.promptYesNo('Execute this plan? (y/N)')
          if (!proceed) {
            structuredLogger.warning('OrchestratorService', 'Plan execution cancelled')
            structuredLogger.info('OrchestratorService', 'Returning to default chat mode')
            logger.debug('Plan execution cancelled by user')
            return
          }
        }

        await planningService.executePlan(plan.id, {
          showProgress: true,
          autoExecute: this.context.autonomous,
          confirmSteps: !this.context.autonomous,
        })
      } catch (error: any) {
        logger.error('Planning failed', { error: error.message, stack: error.stack })
        structuredLogger.error('OrchestratorService', `Planning failed: ${error.message}`)
        structuredLogger.info('OrchestratorService', 'Returning to default chat mode')
        return
      }
    } else {
      // Direct autonomous execution using appropriate agent
      const bestAgent = this.selectBestAgent(input)
      structuredLogger.info('OrchestratorService', `Selected ${bestAgent} agent for this task`)
      logger.debug('Agent selected', { agent: bestAgent, inputLength: input.length })
      await this.executeAgentTask(bestAgent, input)
    }
  }

  /**
   * Check if request should use VM agent
   */
  private isVMAgentRequest(input: string): boolean {
    const lowerInput = input.toLowerCase()
    const vmTriggers = [
      'analizza la repository',
      'analizza il repository',
      'analyze the repository',
      'analyze repository',
      'clone and analyze',
      'vm agent',
      'isolated environment',
      'autonomous repository',
    ]

    return (
      vmTriggers.some((trigger) => lowerInput.includes(trigger)) ||
      (lowerInput.includes('repository') && lowerInput.includes('analizza'))
    )
  }

  /**
   * Execute VM agent task
   */
  private async executeVMAgentTask(input: string): Promise<void> {
    try {
      structuredLogger.info('OrchestratorService', 'Starting VM Agent with secure environment')

      // Launch vm-agent
      const taskId = await agentService.executeTask('vm-agent', input, {
        createVM: true,
        isolated: true,
        autonomous: true,
      })

      logger.info('VM Agent launched', { taskId })
      structuredLogger.success('OrchestratorService', `VM Agent launched with task ID: ${taskId}`)
      advancedUI.logInfo('Agent will operate in secure isolated environment', 'VM Agent')
      advancedUI.logInfo('Monitor with Ctrl+L for logs, Ctrl+S for security dashboard', 'VM Agent')
    } catch (error: any) {
      logger.error('Failed to launch VM agent', { error: error.message, stack: error.stack })
      structuredLogger.error('OrchestratorService', `Failed to launch VM agent: ${error.message}`)
    }
  }

  private selectBestAgent(input: string): string {
    const lowerInput = input.toLowerCase()

    // Simple keyword-based agent selection
    if (lowerInput.includes('react') || lowerInput.includes('component')) {
      return 'react-expert'
    } else if (lowerInput.includes('backend') || lowerInput.includes('api') || lowerInput.includes('server')) {
      return 'backend-expert'
    } else if (lowerInput.includes('frontend') || lowerInput.includes('ui') || lowerInput.includes('interface')) {
      return 'frontend-expert'
    } else if (lowerInput.includes('deploy') || lowerInput.includes('docker') || lowerInput.includes('ci/cd')) {
      return 'devops-expert'
    } else if (lowerInput.includes('review') || lowerInput.includes('analyze') || lowerInput.includes('check')) {
      return 'code-review'
    } else {
      return 'universal-agent' // Default fallback
    }
  }

  private formatTaskResult(result: any): string {
    if (!result) return 'No result available'

    // Handle string results directly
    if (typeof result === 'string') {
      return result.length > 200 ? result.substring(0, 200) + '...' : result
    }

    // Handle agent factory structure: { success, todosCompleted, todosFailed, results, agent, summary }
    if (result.success !== undefined && result.agent && (result.todosCompleted !== undefined || result.results)) {
      const parts: string[] = []

      // Add success summary
      if (result.todosCompleted && result.totalTodos) {
        parts.push(`✓ Completed ${result.todosCompleted}/${result.totalTodos} tasks`)
      }

      if (result.todosFailed && result.todosFailed > 0) {
        parts.push(`✖ Failed ${result.todosFailed} tasks`)
      }

      // Extract summary if available
      if (result.summary && typeof result.summary === 'string') {
        const summary = result.summary.length > 150 ? result.summary.substring(0, 150) + '...' : result.summary
        parts.push(`📋 ${summary}`)
      }

      return parts.join('\\n') || 'Task completed successfully'
    }

    // Handle task wrapper structure: { taskId, success, result }
    if (result.taskId && result.success !== undefined && result.result) {
      return this.formatTaskResult(result.result)
    }

    // Handle simple success structure
    if (result.success && result.message) {
      const message = result.message.length > 200 ? result.message.substring(0, 200) + '...' : result.message
      return message
    }

    // Handle object with content or message
    if (result.content) {
      const content = result.content.length > 200 ? result.content.substring(0, 200) + '...' : result.content
      return content
    }
    if (result.message) {
      const message = result.message.length > 200 ? result.message.substring(0, 200) + '...' : result.message
      return message
    }

    // Final fallback - try to extract meaningful text
    const text = JSON.stringify(result, null, 2)
    return text.length > 200 ? text.substring(0, 200) + '...' : text
  }

  private displayAgentResult(task: AgentTask): void {
    const { OutputFormatter } = require('../ui/output-formatter')
    const cleanResult = this.formatTaskResult(task.result)
    const duration =
      task.endTime && task.startTime ? Math.round((task.endTime.getTime() - task.startTime.getTime()) / 1000) : 0

    // Apply rich formatting to the result content
    // Content is already markdown - streamttyService will handle rendering
    const formattedResult = cleanResult

    this.cliInstance.printPanel(
      boxen(
        `${chalk.green.bold('🎉 Agent Result')}\\n\\n` +
          `${chalk.blue('Agent:')} ${task.agentType}\\n` +
          `${chalk.blue('Task:')} ${task.task.slice(0, 60)}...\\n` +
          `${chalk.blue('Duration:')} ${duration}s\\n\\n` +
          `${chalk.cyan('Result:')}\\n${formattedResult}`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }
      )
    )
  }

  private checkAndReturnToDefaultMode(): void {
    // Check if all agent tasks are completed (no active agents)
    const activeAgents = agentService.getActiveAgents()
    const queuedTasks = agentService.getQueuedTasks()

    if (activeAgents.length === 0 && queuedTasks.length === 0) {
      // All background tasks completed, return to default mode with prompt
      structuredLogger.info('OrchestratorService', 'All background tasks completed. Returning to default mode.')
      logger.debug('Returning to default mode', { activeAgents: activeAgents.length, queuedTasks: queuedTasks.length })

      // Ensure default mode explicitly
      this.context.planMode = false
      this.context.autoAcceptEdits = false

      try {
        // Access global NikCLI instance to show prompt
        const globalThis = global as any
        const nikCliInstance = globalThis.__nikCLI
        if (nikCliInstance && typeof nikCliInstance.showPrompt === 'function') {
          nikCliInstance.showPrompt()
        }
      } catch (_error) {
        // Fallback
        process.stdout.write('\n')
      }
    }
  }

  private async showStatus(): Promise<void> {
    const activeAgents = agentService.getActiveAgents()
    const queuedTasks = agentService.getQueuedTasks()
    const pendingDiffs = diffManager.getPendingCount()

    this.cliInstance.printPanel(
      boxen(
        `${chalk.blue.bold('🎛️  Orchestrator Status')}\\n\\n` +
          `${chalk.green('Working Directory:')} ${this.context.workingDirectory}\\n` +
          `${chalk.green('Mode:')} ${this.context.autonomous ? 'Autonomous' : 'Manual'}\\n` +
          `${chalk.green('Plan Mode:')} ${this.context.planMode ? 'On' : 'Off'}\\n` +
          `${chalk.green('Auto-Accept:')} ${this.context.autoAcceptEdits ? 'On' : 'Off'}\\n\\n` +
          `${chalk.cyan('Active Agents:')} ${activeAgents.length}/3\\n` +
          `${chalk.cyan('Queued Tasks:')} ${queuedTasks.length}\\n` +
          `${chalk.cyan('Pending Diffs:')} ${pendingDiffs}\\n` +
          `${chalk.cyan('Session Messages:')} ${this.context.session.messages.length}`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        }
      )
    )
  }

  private async showServices(): Promise<void> {
    const lspStatus = lspService.getServerStatus()
    const toolHistory = toolService.getExecutionHistory().slice(-5)
    const planStats = planningService.getStatistics()

    logger.debug('Showing services status', { lspCount: lspStatus.length, toolHistoryCount: toolHistory.length, planStats })

    structuredLogger.info('OrchestratorService', 'Services Status')
    advancedUI.logInfo('Services Status', 'Status')

    lspStatus.forEach((server) => {
      const statusColor =
        server.status === 'running' ? 'green' : server.status === 'error' ? 'red' : 'yellow'
      advancedUI.logInfo(`  ● ${server.name}: ${server.status}`, `LSP (${statusColor})`)
    })

    toolHistory.forEach((exec) => {
      const statusIcon = exec.status === 'completed' ? '✓' : exec.status === 'failed' ? '✖' : '⚡︎'
      advancedUI.logInfo(`  ${statusIcon} ${exec.toolName}: ${exec.status}`, 'Tools')
    })

    advancedUI.logInfo(`  Total Plans: ${planStats.total}`, 'Planning')
    advancedUI.logInfo(`  Active: ${planStats.running}`, 'Planning')
    advancedUI.logInfo(`  Completed: ${planStats.completed}`, 'Planning')
  }

  private async showActiveAgents(): Promise<void> {
    const activeAgents = agentService.getActiveAgents()
    const queuedTasks = agentService.getQueuedTasks()

    logger.debug('Showing agent status', { activeAgents: activeAgents.length, queuedTasks: queuedTasks.length })

    structuredLogger.info('OrchestratorService', 'Agent Status')
    advancedUI.logInfo('Agent Status', 'Agents')

    if (activeAgents.length > 0) {
      advancedUI.logInfo('Active Agents:', 'Agents')
      activeAgents.forEach((agent) => {
        const progress = agent.progress ? `${agent.progress}%` : 'Starting...'
        advancedUI.logInfo(`  ⚡︎ ${agent.agentType}: ${progress}`, 'Active')
        logger.debug('Active agent', { agentType: agent.agentType, progress, taskPreview: agent.task.slice(0, 60) })
      })
    }

    if (queuedTasks.length > 0) {
      advancedUI.logInfo('Queued Tasks:', 'Agents')
      queuedTasks.forEach((task, index) => {
        advancedUI.logInfo(`  ${index + 1}. ${task.agentType}: ${task.task.slice(0, 50)}...`, 'Queued')
      })
    }

    if (activeAgents.length === 0 && queuedTasks.length === 0) {
      structuredLogger.info('OrchestratorService', 'No active agents or queued tasks')
    }
  }

  private showCommandMenu(): void {
    // Delegate to module manager
    structuredLogger.info('OrchestratorService', 'Available Commands')
    advancedUI.logInfo('Available Commands:', 'Help')

    const commands = this.moduleManager.getCommands()
    const categories = ['system', 'file', 'analysis', 'diff', 'security']

    advancedUI.logInfo('Orchestrator Commands:', 'Help')
    advancedUI.logInfo('/status         Show orchestrator and service status', 'Help')
    advancedUI.logInfo('/services       Show detailed service information', 'Help')
    advancedUI.logInfo('/agents         Show active agents and queue', 'Help')

    advancedUI.logInfo('Module Commands:', 'Help')
    categories.forEach((category) => {
      const categoryCommands = commands.filter((c) => c.category === category)
      if (categoryCommands.length > 0) {
        categoryCommands.slice(0, 3).forEach((cmd) => {
          advancedUI.logInfo(`/${cmd.name.padEnd(20)} ${cmd.description}`, 'Module')
        })
      }
    })

    advancedUI.logInfo('Agent Commands:', 'Help')
    advancedUI.logInfo('@agent-name <task>  Execute task with specific agent', 'Help')
    advancedUI.logInfo('Available: ai-analysis, code-review, backend-expert, frontend-expert', 'Help')
    advancedUI.logInfo('         react-expert, devops-expert, system-admin, autonomous-coder', 'Help')

    advancedUI.logInfo('💡 Natural language: Just describe what you want to accomplish', 'Help')
  }

  private checkAPIKeys(): boolean {
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY
    const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY
    const hasGoogleKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
    const hasVercelKey = !!process.env.V0_API_KEY

    if (!hasAnthropicKey && !hasOpenAIKey && !hasOpenRouterKey && !hasGoogleKey && !hasVercelKey) {
      this.cliInstance.printPanel(
        boxen(
          `${chalk.red('⚠︎  No API Keys Found')}\\n\\n` +
            `Please set at least one API key:\\n\\n` +
            `${chalk.blue('• ANTHROPIC_API_KEY')} - for Claude models\\n` +
            `${chalk.blue('• OPENAI_API_KEY')} - for GPT models\\n` +
            `${chalk.blue('• OPENROUTER_API_KEY')} - for OpenRouter models\\n` +
            `${chalk.blue('• GOOGLE_GENERATIVE_AI_API_KEY')} - for Gemini models`,
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
            titleAlignment: 'center',
          }
        )
      )
      return false
    }

    const availableKeys: string[] = []
    if (hasAnthropicKey) availableKeys.push('Claude')
    if (hasOpenAIKey) availableKeys.push('GPT')
    if (hasOpenRouterKey) availableKeys.push('OpenRouter')
    if (hasGoogleKey) availableKeys.push('Gemini')
    if (hasVercelKey) availableKeys.push('Vercel')

    logger.debug('API keys status', { availableKeys: availableKeys.length, keyTypes: availableKeys })
    structuredLogger.success('OrchestratorService', `API Keys: ${availableKeys.join(', ')}`)
    return true
  }

  private showWelcome(): void {
    const title = chalk.cyanBright('🎛️  AI Development Orchestrator')
    const subtitle = chalk.gray('Multi-Agent Autonomous Development System')

    this.cliInstance.printPanel(
      boxen(
        `${title}\n${subtitle}\n\n` +
          `${chalk.blue('🎯 Mode:')} ${this.context.autonomous ? 'Autonomous' : 'Manual'}\n` +
          `${chalk.blue('📁 Directory:')} ${chalk.cyan(this.context.workingDirectory)}\n` +
          `${chalk.blue('🔌 Max Agents:')} 3 parallel\n\n` +
          `${chalk.gray('I orchestrate specialized AI agents to handle your development tasks:')}\n` +
          `• ${chalk.green('Natural language processing')} - Just describe what you want\n` +
          `• ${chalk.green('Intelligent agent selection')} - Best agent for each task\n` +
          `• ${chalk.green('Parallel execution')} - Up to 3 agents working simultaneously\n` +
          `• ${chalk.green('Real-time monitoring')} - See everything happening live\n` +
          `• ${chalk.green('Autonomous operation')} - Minimal interruptions\n\n` +
          `${chalk.yellow('💡 Press / for commands, @ for agents, or just tell me what to do')}`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'double',
          borderColor: 'cyan',
          titleAlignment: 'center',
        }
      )
    )
  }

  private togglePlanMode(): void {
    this.context.planMode = !this.context.planMode
    if (this.context.planMode) {
      try {
        process.env.NIKCLI_COMPACT = '1'
        process.env.NIKCLI_SUPER_COMPACT = '1'
      } catch {}
      structuredLogger.success('OrchestratorService', 'Enhanced Plan Mode Enabled')
      logger.info('Plan mode enabled', { mode: 'enhanced' })
      advancedUI.logInfo('Comprehensive plan generation with risk analysis', 'Plan Mode')
      advancedUI.logInfo('Step-by-step execution with progress tracking', 'Plan Mode')
      advancedUI.logInfo('Enhanced approval system with detailed breakdown', 'Plan Mode')
      advancedUI.logInfo('(shift+tab to cycle modes)', 'Plan Mode')
      advancedUI.logInfo('Tip: use tools "todoread" and "todowrite" to manage the session TODOs', 'Plan Mode')
      // Show Todo Dashboard (session store preferred) or fallback to existing plans
      setTimeout(async () => {
        try {
          const { advancedUI } = await import('../ui/advanced-cli-ui')
          // Switch to interactive redraw to avoid duplicated panels in stream
          // Note: do not alter readline state here
          advancedUI.startInteractiveMode()
          let todos: Array<{ content?: string; status?: string; priority?: string; progress?: number }> = []
          let title = 'Plan Todos'

          // 1) Prefer session TodoStore (Claude-style)
          try {
            const { todoStore } = await import('../store/todo-store')
            const sessionId = this.context.session?.id || `${Date.now()}`
            const list = todoStore.getTodos(String(sessionId))
            if (list && list.length > 0) {
              todos = list.map((t) => ({
                content: t.content,
                status: t.status,
                priority: t.priority,
                progress: t.progress,
              }))
            }
          } catch {}

          // 2) If store empty, prefer enhancedPlanning
          if (todos.length === 0) {
            try {
              const { enhancedPlanning } = await import('../planning/enhanced-planning')
              const plans: any[] = enhancedPlanning.getActivePlans?.() || []
              const latest = plans[plans.length - 1]
              if (latest?.todos) {
                title = latest.title || title
                todos = latest.todos.map((t: any) => ({
                  content: t.title || t.description,
                  status: t.status,
                  priority: t.priority,
                  progress: t.progress,
                }))
              }
            } catch {}
          }

          // 3) If still empty, fallback: planningService active plans
          if (todos.length === 0) {
            try {
              const { planningService } = await import('./planning-service')
              const plans: any[] = planningService.getActivePlans?.() || []
              const latest = plans[plans.length - 1]
              if (latest?.todos) {
                title = latest.title || title
                todos = latest.todos.map((t: any) => ({
                  content: t.title || t.description,
                  status: t.status,
                  priority: t.priority,
                  progress: t.progress,
                }))
              }
            } catch {}
          }

          ;(advancedUI as any).showTodoDashboard?.(todos, title)

          // Attach live updates: refresh dashboard when session todos change
          try {
            const { todoStore } = await import('../store/todo-store')
            const handler = async ({ sessionId }: { sessionId: string }) => {
              try {
                const list = todoStore.getTodos(sessionId)
                const items = list.map((t) => ({
                  content: t.content,
                  status: t.status,
                  priority: t.priority,
                  progress: t.progress,
                }))
                ;(advancedUI as any).showTodoDashboard?.(items, title)
              } catch {}
            }
            todoStore.on('update', handler)
            this.todoStoreUnsubscribe = () => todoStore.off('update', handler)
          } catch {}
        } catch {}
      }, 0)
    } else {
      structuredLogger.warning('OrchestratorService', 'Plan Mode Disabled')
      logger.info('Plan mode disabled', { mode: 'standard' })
      advancedUI.logInfo('Returning to standard mode', 'Plan Mode')
      try {
        delete (process.env as any).NIKCLI_COMPACT
        delete (process.env as any).NIKCLI_SUPER_COMPACT
      } catch {}
      // Ensure input bypass is disabled and prompt resumed
      import('../core/input-queue').then(({ inputQueue }) => inputQueue.disableBypass()).catch(() => {})
      try {
        const nik = (global as any).__nikCLI
        if (nik && typeof nik.renderPromptAfterOutput === 'function') nik.renderPromptAfterOutput()
      } catch {}
      // Disable compact stream
      try {
        delete (process.env as any).NIKCLI_COMPACT
      } catch {}
      // Remove live updates listener if present
      if (this.todoStoreUnsubscribe) {
        try {
          this.todoStoreUnsubscribe()
        } catch {}
        this.todoStoreUnsubscribe = undefined
      }
    }
    this.updateModuleContext()
  }

  private toggleAutoAccept(): void {
    this.context.autoAcceptEdits = !this.context.autoAcceptEdits
    diffManager.setAutoAccept(this.context.autoAcceptEdits)

    if (this.context.autoAcceptEdits) {
      structuredLogger.success('OrchestratorService', 'auto-accept edits on (ctrl+a to toggle)')
    } else {
      structuredLogger.warning('OrchestratorService', 'auto-accept edits off')
    }
    this.updateModuleContext()
  }

  private updateModuleContext(): void {
    this.moduleManager.updateContext({
      ...this.context,
      policyManager: this.policyManager,
    })
  }

  private stopAllOperations(): void {
    // Stop any running agents (simplified)
    this.activeAgentTasks.clear()
    this.context.isProcessing = false
  }

  private async promptYesNo(question: string): Promise<boolean> {
    return new Promise((resolve) => {
      const tempRl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      tempRl.question(chalk.yellow(`${question} `), (answer) => {
        tempRl.close()
        resolve(answer.toLowerCase().startsWith('y'))
      })
    })
  }

  private showPrompt(): void {
    if (!this.context.isProcessing) {
      const workingDir = require('node:path').basename(this.context.workingDirectory)
      const indicators = this.getPromptIndicators()
      const modeIndicator = indicators.length > 0 ? ` ${indicators.join(' ')} ` : ''

      const activeCount = this.activeAgentTasks.size
      const agentIndicator = activeCount > 0 ? chalk.blue(`${activeCount}🔌`) : '🎛️'

      const prompt = `\n┌─[${agentIndicator}:${chalk.green(workingDir)}${modeIndicator}]\n└─❯ `
      this.rl.setPrompt(prompt)
      this.rl.prompt()
    }
  }

  private getPromptIndicators(): string[] {
    const indicators: string[] = []

    if (this.context.planMode) indicators.push(chalk.cyan('plan'))
    if (this.context.autoAcceptEdits) indicators.push(chalk.green('auto-accept'))
    if (!this.context.autonomous) indicators.push(chalk.yellow('manual'))

    const pendingCount = diffManager.getPendingCount()
    if (pendingCount > 0) {
      indicators.push(chalk.yellow(`${pendingCount} diffs`))
    }

    return indicators
  }

  private async autoComplete(line: string): Promise<[string[], string]> {
    try {
      // Use the smart completion manager for intelligent completions
      const { smartCompletionManager } = await import('../core/smart-completion-manager')

      const completions = await smartCompletionManager.getCompletions(line, {
        currentDirectory: this.context.workingDirectory,
        interface: 'orchestrator',
      })

      // Convert to readline format
      const suggestions = completions.map((comp) => comp.completion)
      return [suggestions.length ? suggestions : [], line]
    } catch (_error) {
      // Fallback to original static completion
      const commands = this.moduleManager.getCommandNames()
      const agents = agentService.getAvailableAgents().map((a) => `@${a.name}`)
      const allSuggestions = [...commands, ...agents]

      const hits = allSuggestions.filter((c) => c.startsWith(line))
      return [hits.length ? hits : allSuggestions, line]
    }
  }

  private async showMiddlewareStatus(): Promise<void> {
    structuredLogger.info('OrchestratorService', 'Middleware System Status')
    logger.debug('Showing middleware status')

    // Show middleware manager status
    middlewareManager.showStatus()

    // Show recent middleware events
    const history = middlewareManager.getExecutionHistory(10)
    if (history.length > 0) {
      advancedUI.logInfo('Recent Middleware Events:', 'Middleware')
      history.forEach((event) => {
        const icon =
          event.type === 'complete' ? '✓' : event.type === 'error' ? '✖' : event.type === 'start' ? '⚡︎' : '⏭️'
        const duration = event.duration ? ` (${event.duration}ms)` : ''
        advancedUI.logInfo(`  ${icon} ${event.middlewareName}: ${event.type}${duration}`, 'Middleware')
      })
    }

    // Show performance metrics
    const summary = middlewareManager.getMetricsSummary()
    advancedUI.logInfo('Performance Summary:', 'Middleware')
    advancedUI.logInfo(`  Requests processed: ${summary.totalRequests}`, 'Middleware')
    advancedUI.logInfo(`  Success rate: ${((1 - summary.overallErrorRate) * 100).toFixed(1)}%`, 'Middleware')
    advancedUI.logInfo(`  Average response time: ${summary.averageResponseTime.toFixed(1)}ms`, 'Middleware')
  }

  private showGoodbye(): void {
    const _activeAgents = this.activeAgentTasks.size
    const toolsUsed = toolService.getExecutionHistory().length

    // Shutdown middleware system
    if (this.middlewareInitialized) {
      MiddlewareBootstrap.shutdown()
    }

    this.cliInstance.printPanel(
      boxen(
        `${chalk.cyanBright('🎛️  AI Development Orchestrator')}\n\n` +
          `${chalk.gray('Session completed!')}\n\n` +
          `${chalk.blue('Messages processed:')} ${this.context.session.messages.length}\n` +
          `${chalk.green('Tools executed:')} ${toolsUsed}\n` +
          `${chalk.cyan('Agents launched:')} ${this.context.session.executionHistory.length}\n` +
          `${chalk.yellow('Duration:')} ${Math.round((Date.now() - parseInt(this.context.session.id, 10)) / 1000)}s\n\n` +
          `${chalk.blue('Thanks for using the AI orchestrator! 🚀')}`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
          titleAlignment: 'center',
        }
      )
    )
  }
}

export const orchestratorService = new OrchestratorService()
