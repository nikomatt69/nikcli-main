import { EventEmitter } from 'node:events'
import boxen from 'boxen'
import chalk from 'chalk'
import * as readline from 'readline'
import { simpleConfigManager as configManager } from '../core/config-manager'
import { type ModuleContext, ModuleManager } from '../core/module-manager'
import { MiddlewareBootstrap, middlewareManager } from '../middleware'
import { ExecutionPolicyManager } from '../policies/execution-policy'
import { diffManager } from '../ui/diff-manager'
import { type AgentTask, agentService } from './agent-service'
import { lspService } from './lsp-service'
import { planningService } from './planning-service'
import { toolService } from './tool-service'
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
        console.log(chalk.yellow('\\n⏸️  Stopping current operation...'))
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
    const onKeypress = (str: string, key: any) => {
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
        console.log(chalk.blue(`🤖 Agent ${task.agentType} started: ${task.task.slice(0, 50)}...`))
      }
    })

    agentService.on('task_progress', (task: AgentTask, update: any) => {
      // Avoid duplicate logging if NikCLI is active
      const nikCliActive = (global as any).__nikCLI?.eventsSubscribed
      if (!nikCliActive) {
        console.log(chalk.cyan(`  📊 ${task.agentType}: ${update.progress}% - ${update.description || ''}`))
      }
    })

    agentService.on('tool_use', (task: AgentTask, update: any) => {
      // Avoid duplicate logging if NikCLI is active
      const nikCliActive = (global as any).__nikCLI?.eventsSubscribed
      if (!nikCliActive) {
        console.log(chalk.magenta(`  🔧 ${task.agentType} using ${update.tool}: ${update.description}`))
      }
    })

    agentService.on('task_complete', (task: AgentTask) => {
      this.activeAgentTasks.delete(task.id)
      if (task.status === 'completed') {
        console.log(chalk.green(`✅ Agent ${task.agentType} completed successfully`))
        if (task.result) {
          this.displayAgentResult(task)
        }
      } else {
        console.log(chalk.red(`❌ Agent ${task.agentType} failed: ${task.error}`))
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
    console.log(chalk.dim('🚀 All services initialized'))
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

      if (!middlewareResult.success) {
        console.log(chalk.red(`❌ Operation blocked: ${middlewareResult.error?.message || 'Unknown error'}`))
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
      console.log(chalk.red(`❌ Error processing input: ${error.message}`))
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
      console.log(chalk.red('Please specify a task for the agent'))
      return
    }

    console.log(chalk.blue(`\\n🤖 Launching ${agentName} agent...`))
    console.log(chalk.gray(`Task: ${task}\\n`))

    try {
      const taskId = await agentService.executeTask(agentName, task, {})
      console.log(chalk.dim(`Task ID: ${taskId}`))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to launch agent: ${error.message}`))
    }
  }

  private async handleNaturalLanguageRequest(input: string): Promise<void> {
    if (!this.initialized) {
      await this.initializeServices()
    }

    console.log(chalk.blue('🧠 Processing natural language request...'))

    // Check for VM agent trigger patterns
    if (this.isVMAgentRequest(input)) {
      console.log(chalk.cyan('🤖 VM Agent request detected - launching secure virtualized agent'))
      await this.executeVMAgentTask(input)
      return
    }

    if (this.context.planMode) {
      // Enable compact stream to reduce noisy logs in plan mode
      try { process.env.NIKCLI_COMPACT = '1' } catch {}
      try {
        // Create execution plan first
        console.log(chalk.cyan('🎯 Plan Mode: Creating execution plan...'))
        const plan = await planningService.createPlan(input, {
          showProgress: true,
          autoExecute: false,
          confirmSteps: !this.context.autonomous,
        })

        if (!this.context.autonomous) {
          const proceed = await this.promptYesNo('Execute this plan? (y/N)')
          if (!proceed) {
            console.log(chalk.yellow('Plan execution cancelled'))
            console.log(chalk.blue('💬 Returning to default chat mode...'))
            console.log(chalk.gray('   You can provide a new request or modify your requirements.'))
            return
          }
        }

        await planningService.executePlan(plan.id, {
          showProgress: true,
          autoExecute: this.context.autonomous,
          confirmSteps: !this.context.autonomous,
        })
      } catch (error: any) {
        console.log(chalk.red(`❌ Planning failed: ${error.message}`))
        console.log(chalk.blue('💬 Returning to default chat mode...'))
        console.log(chalk.gray('   Please try again with a different request.'))
        return
      }
    } else {
      // Direct autonomous execution using appropriate agent
      const bestAgent = this.selectBestAgent(input)
      console.log(chalk.blue(`🎯 Selected ${bestAgent} agent for this task`))
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
      console.log(chalk.blue('🐳 Starting VM Agent with secure environment...'))

      // Launch vm-agent
      const taskId = await agentService.executeTask('vm-agent', input, {
        createVM: true,
        isolated: true,
        autonomous: true,
      })

      console.log(chalk.green(`✅ VM Agent launched with task ID: ${taskId}`))
      console.log(chalk.dim('🔐 Agent will operate in secure isolated environment'))
      console.log(chalk.dim('📊 Monitor with Ctrl+L for logs, Ctrl+S for security dashboard'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to launch VM agent: ${error.message}`))
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

  private displayAgentResult(task: AgentTask): void {
    console.log(
      boxen(
        `${chalk.green.bold('🎉 Agent Result')}\\n\\n` +
          `${chalk.blue('Agent:')} ${task.agentType}\\n` +
          `${chalk.blue('Task:')} ${task.task.slice(0, 60)}...\\n` +
          `${chalk.blue('Duration:')} ${
            task.endTime && task.startTime ? Math.round((task.endTime.getTime() - task.startTime.getTime()) / 1000) : 0
          }s\\n\\n` +
          `${chalk.cyan('Result:')} ${JSON.stringify(task.result, null, 2).slice(0, 200)}...`,
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
      console.log(chalk.gray('─'.repeat(50)))
      console.log(chalk.cyan('🏠 All background tasks completed. Returning to default mode.'))

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

    console.log(
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

    console.log(chalk.cyan.bold('\\n🔧 Services Status'))
    console.log(chalk.gray('─'.repeat(50)))

    console.log(chalk.white.bold('\\nLSP Servers:'))
    lspStatus.forEach((server) => {
      const statusColor =
        server.status === 'running' ? chalk.green : server.status === 'error' ? chalk.red : chalk.yellow
      console.log(`  ${statusColor('●')} ${server.name}: ${server.status}`)
    })

    console.log(chalk.white.bold('\\nRecent Tool Usage:'))
    toolHistory.forEach((exec) => {
      const statusIcon = exec.status === 'completed' ? '✅' : exec.status === 'failed' ? '❌' : '🔄'
      console.log(`  ${statusIcon} ${exec.toolName}: ${exec.status}`)
    })

    console.log(chalk.white.bold('\\nPlanning Statistics:'))
    console.log(`  Total Plans: ${planStats.total}`)
    console.log(`  Active: ${planStats.running}`)
    console.log(`  Completed: ${planStats.completed}`)
  }

  private async showActiveAgents(): Promise<void> {
    const activeAgents = agentService.getActiveAgents()
    const queuedTasks = agentService.getQueuedTasks()

    console.log(chalk.cyan.bold('\\n🤖 Agent Status'))
    console.log(chalk.gray('─'.repeat(50)))

    if (activeAgents.length > 0) {
      console.log(chalk.white.bold('\\nActive Agents:'))
      activeAgents.forEach((agent) => {
        const progress = agent.progress ? `${agent.progress}%` : 'Starting...'
        console.log(`  🔄 ${chalk.blue(agent.agentType)}: ${progress}`)
        console.log(`     ${chalk.dim(agent.task.slice(0, 60))}...`)
      })
    }

    if (queuedTasks.length > 0) {
      console.log(chalk.white.bold('\\nQueued Tasks:'))
      queuedTasks.forEach((task, index) => {
        console.log(`  ${index + 1}. ${chalk.yellow(task.agentType)}: ${task.task.slice(0, 50)}...`)
      })
    }

    if (activeAgents.length === 0 && queuedTasks.length === 0) {
      console.log(chalk.dim('No active agents or queued tasks'))
    }
  }

  private showCommandMenu(): void {
    // Delegate to module manager
    console.log('\\n' + chalk.cyan.bold('📋 Available Commands:'))
    console.log(chalk.gray('─'.repeat(60)))

    console.log(chalk.white.bold('\\n🎛️  Orchestrator Commands:'))
    console.log(`${chalk.green('/status')}         Show orchestrator and service status`)
    console.log(`${chalk.green('/services')}       Show detailed service information`)
    console.log(`${chalk.green('/agents')}         Show active agents and queue`)

    console.log(chalk.white.bold('\\n🔧 Module Commands:'))
    const commands = this.moduleManager.getCommands()
    const categories = ['system', 'file', 'analysis', 'diff', 'security']

    categories.forEach((category) => {
      const categoryCommands = commands.filter((c) => c.category === category)
      if (categoryCommands.length > 0) {
        categoryCommands.slice(0, 3).forEach((cmd) => {
          console.log(`${chalk.green(`/${cmd.name}`).padEnd(20)} ${cmd.description}`)
        })
      }
    })

    console.log(chalk.white.bold('\\n🤖 Agent Commands:'))
    console.log(`${chalk.blue('@agent-name')} <task>  Execute task with specific agent`)
    console.log(`${chalk.dim('Available:')} ai-analysis, code-review, backend-expert, frontend-expert`)
    console.log(`${chalk.dim('         ')} react-expert, devops-expert, system-admin, autonomous-coder`)

    console.log(chalk.gray('\\n' + '─'.repeat(60)))
    console.log(chalk.yellow('💡 Natural language: Just describe what you want to accomplish'))
  }

  private checkAPIKeys(): boolean {
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY
    const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY
    const hasGoogleKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
    const hasVercelKey = !!process.env.V0_API_KEY

    if (!hasAnthropicKey && !hasOpenAIKey && !hasOpenRouterKey && !hasGoogleKey && !hasVercelKey) {
      console.log(
        boxen(
          `${chalk.red('⚠️  No API Keys Found')}\\n\\n` +
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

    const availableKeys = []
    if (hasAnthropicKey) availableKeys.push(chalk.green('✓ Claude'))
    if (hasOpenAIKey) availableKeys.push(chalk.green('✓ GPT'))
    if (hasOpenRouterKey) availableKeys.push(chalk.green('✓ OpenRouter'))
    if (hasGoogleKey) availableKeys.push(chalk.green('✓ Gemini'))
    if (hasVercelKey) availableKeys.push(chalk.green('✓ Vercel'))
    console.log(chalk.dim(`API Keys: ${availableKeys.join(', ')}`))
    return true
  }

  private showWelcome(): void {
    const title = chalk.cyanBright('🎛️  AI Development Orchestrator')
    const subtitle = chalk.gray('Multi-Agent Autonomous Development System')

    console.log(
      boxen(
        `${title}\n${subtitle}\n\n` +
          `${chalk.blue('🎯 Mode:')} ${this.context.autonomous ? 'Autonomous' : 'Manual'}\n` +
          `${chalk.blue('📁 Directory:')} ${chalk.cyan(this.context.workingDirectory)}\n` +
          `${chalk.blue('🤖 Max Agents:')} 3 parallel\n\n` +
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
      console.log(chalk.green('\n🎯 Enhanced Plan Mode Enabled'))
      console.log(chalk.cyan('   • Comprehensive plan generation with risk analysis'))
      console.log(chalk.cyan('   • Step-by-step execution with progress tracking'))
      console.log(chalk.cyan('   • Enhanced approval system with detailed breakdown'))
      console.log(chalk.dim('   (shift+tab to cycle modes)'))
      console.log(chalk.gray('   Tip: use tools "todoread" and "todowrite" to manage the session TODOs'))
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
            const sessionId = (this.context.session && this.context.session.id) || `${Date.now()}`
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
              const plans = enhancedPlanning.getActivePlans?.() || []
              const latest = plans[plans.length - 1]
              if (latest && latest.todos) {
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
              const plans = planningService.getActivePlans?.() || []
              const latest = plans[plans.length - 1]
              if (latest && latest.todos) {
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
      console.log(chalk.yellow('\n⚠️  Plan Mode Disabled'))
      console.log(chalk.gray('   • Returning to standard mode'))
      try {
        delete (process.env as any).NIKCLI_COMPACT
        delete (process.env as any).NIKCLI_SUPER_COMPACT
      } catch {}
      // Ensure input bypass is disabled and prompt resumed
      import('../core/input-queue')
        .then(({ inputQueue }) => inputQueue.disableBypass())
        .catch(() => {})
      try {
        const nik = (global as any).__nikCLI
        if (nik && typeof nik.renderPromptAfterOutput === 'function') nik.renderPromptAfterOutput()
      } catch {}
      // Disable compact stream
      try { delete (process.env as any).NIKCLI_COMPACT } catch {}
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
      console.log(chalk.green('\\n✅ auto-accept edits on ') + chalk.dim('(ctrl+a to toggle)'))
    } else {
      console.log(chalk.yellow('\\n⚠️ auto-accept edits off'))
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
      const agentIndicator = activeCount > 0 ? chalk.blue(`${activeCount}🤖`) : '🎛️'

      const prompt = `\n┌─[${agentIndicator}:${chalk.green(workingDir)}${modeIndicator}]\n└─❯ `
      this.rl.setPrompt(prompt)
      this.rl.prompt()
    }
  }

  private getPromptIndicators(): string[] {
    const indicators = []

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
    console.log(chalk.cyan.bold('\n🔧 Middleware System Status'))
    console.log(chalk.gray('─'.repeat(60)))

    // Show middleware manager status
    middlewareManager.showStatus()

    // Show recent middleware events
    const history = middlewareManager.getExecutionHistory(10)
    if (history.length > 0) {
      console.log(chalk.white.bold('\nRecent Middleware Events:'))
      history.forEach((event) => {
        const icon =
          event.type === 'complete' ? '✅' : event.type === 'error' ? '❌' : event.type === 'start' ? '🔄' : '⏭️'
        const duration = event.duration ? ` (${event.duration}ms)` : ''
        console.log(`  ${icon} ${event.middlewareName}: ${event.type}${duration}`)
      })
    }

    // Show performance metrics
    const summary = middlewareManager.getMetricsSummary()
    console.log(chalk.white.bold('\nPerformance Summary:'))
    console.log(`  Requests processed: ${summary.totalRequests}`)
    console.log(`  Success rate: ${((1 - summary.overallErrorRate) * 100).toFixed(1)}%`)
    console.log(`  Average response time: ${summary.averageResponseTime.toFixed(1)}ms`)
  }

  private showGoodbye(): void {
    const _activeAgents = this.activeAgentTasks.size
    const toolsUsed = toolService.getExecutionHistory().length

    // Shutdown middleware system
    if (this.middlewareInitialized) {
      MiddlewareBootstrap.shutdown()
    }

    console.log(
      boxen(
        `${chalk.cyanBright('🎛️  AI Development Orchestrator')}\n\n` +
          `${chalk.gray('Session completed!')}\n\n` +
          `${chalk.blue('Messages processed:')} ${this.context.session.messages.length}\n` +
          `${chalk.green('Tools executed:')} ${toolsUsed}\n` +
          `${chalk.cyan('Agents launched:')} ${this.context.session.executionHistory.length}\n` +
          `${chalk.yellow('Duration:')} ${Math.round((Date.now() - parseInt(this.context.session.id)) / 1000)}s\n\n` +
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
