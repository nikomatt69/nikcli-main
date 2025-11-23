#!/usr/bin/env node

/**
 * NikCLI - Unified Chat Interface
 * Lifecycle: Banner → Chat → Prompt → Plan → Confirm → Execute → Queue Management
 */

import { EventEmitter } from 'node:events'
import boxen from 'boxen'
import chalk from 'chalk'
import readline from 'readline'

// Core imports
import { advancedAIProvider } from './ai/advanced-ai-provider'
import { WorkflowOrchestrator } from './automation/workflow-orchestrator'
import { ChatOrchestrator } from './chat/chat-orchestrator'
import { agentTodoManager } from './core/agent-todo-manager'
import { simpleConfigManager as configManager } from './core/config-manager'
import { EnhancedSessionManager } from './persistence/enhanced-session-manager'
import { workSessionManager } from './persistence/work-session-manager'
import { agentService } from './services/agent-service'
import { planningService } from './services/planning-service'

// Types
interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

interface ExecutionPlan {
  id: string
  title: string
  description: string
  steps: PlanStep[]
  estimatedDuration: number
  riskLevel: 'low' | 'medium' | 'high'
  requiresApproval: boolean
}

interface PlanStep {
  id: string
  title: string
  description: string
  toolName: string
  parameters: Record<string, any>
  dependencies: string[]
  estimatedTime: number
  requiresPermission: boolean
}

interface QueuedPrompt {
  id: string
  content: string
  timestamp: Date
  priority: 'low' | 'medium' | 'high'
  agentId?: string
}

// ASCII Banner
const banner = `
███╗   ██╗██╗██╗  ██╗ ██████╗██╗     ██╗
████╗  ██║██║██║ ██╔╝██╔════╝██║     ██║
██╔██╗ ██║██║█████╔╝ ██║     ██║     ██║
██║╚██╗██║██║██╔═██╗ ██║     ██║     ██║
██║ ╚████║██║██║  ██╗╚██████╗███████╗██║
╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝
`

/**
 * Unified Chat Interface with Complete Lifecycle Management
 */
export class UnifiedChatInterface extends EventEmitter {
  private rl: readline.Interface
  private session: {
    id: string
    messages: ChatMessage[]
    workingDirectory: string
    planMode: boolean
    isExecuting: boolean
    currentPlan?: ExecutionPlan
    promptQueue: QueuedPrompt[]
    activeAgents: Map<string, any>
  }

  private workflowOrchestrator: WorkflowOrchestrator
  private chatOrchestrator: ChatOrchestrator
  private initialized = false
  private activeTimers: Set<NodeJS.Timeout> = new Set()
  private eventHandlers: Map<string, (...args: any[]) => void> = new Map()
  private cleanupCompleted = false

  constructor() {
    super()

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 500,
      completer: this.autoComplete.bind(this),
    })

    this.session = {
      id: Date.now().toString(),
      messages: [],
      workingDirectory: process.cwd(),
      planMode: false, // Default to chat mode - plan mode is separate
      isExecuting: false,
      promptQueue: [],
      activeAgents: new Map(),
    }

    this.workflowOrchestrator = new WorkflowOrchestrator(this.session.workingDirectory)
    this.chatOrchestrator = new ChatOrchestrator(
      agentService as any,
      agentTodoManager,
      workSessionManager as any,
      configManager
    )

    this.setupEventHandlers()
  }

  /**
   * Setup event handlers for graceful operation
   */
  private setupEventHandlers(): void {
    // Store handlers for later cleanup
    const sigintHandler = () => {
      if (this.session.isExecuting) {
        console.log(chalk.yellow('\n⏸️  Stopping current execution...'))
        this.stopExecution()
        this.showPrompt()
      } else {
        this.cleanup()
        this.showGoodbye()
        process.exit(0)
      }
    }
    this.eventHandlers.set('SIGINT', sigintHandler)
    this.rl.on('SIGINT', sigintHandler)

    // Handle input
    const lineHandler = async (input: string) => {
      const trimmed = input.trim()

      if (!trimmed) {
        this.showPrompt()
        return
      }

      try {
        await this.handleInput(trimmed)
      } catch (error: any) {
        console.log(chalk.red(`Error handling input: ${error.message}`))
      } finally {
        this.showPrompt()
      }
    }
    this.eventHandlers.set('line', lineHandler)
    this.rl.on('line', lineHandler)

    // Handle close
    const closeHandler = () => {
      this.cleanup()
      this.showGoodbye()
      process.exit(0)
    }
    this.eventHandlers.set('close', closeHandler)
    this.rl.on('close', closeHandler)
  }

  /**
   * Main lifecycle: Handle user input
   */
  private async handleInput(input: string): Promise<void> {
    // Add user message to session
    this.session.messages.push({
      role: 'user',
      content: input,
      timestamp: new Date(),
    })

    // Handle slash commands
    if (input.startsWith('/')) {
      await this.handleSlashCommand(input)
      return
    }

    // If currently executing, queue the prompt
    if (this.session.isExecuting) {
      await this.queuePrompt(input)
      return
    }

    // Process the prompt
    await this.processPrompt(input)
  }

  /**
   * Process user prompt through the complete lifecycle
   */
  private async processPrompt(input: string): Promise<void> {
    console.log(chalk.blue('🤔 Processing your request...'))

    try {
      if (this.session.planMode) {
        // PLAN MODE: Generate plan, ask for approval, then execute
        const plan = await this.generatePlan(input)

        if (plan) {
          this.displayPlan(plan)
          const approved = await this.requestPlanApproval()

          if (approved) {
            await this.executePlan(plan)
          } else {
            console.log(chalk.yellow('📝 Plan rejected. Waiting for new prompt...'))
            this.addAssistantMessage('Plan was not approved. Please provide a new request or modify your requirements.')
          }
        } else {
          await this.generateDirectResponse(input)
        }
      } else {
        // DEFAULT CHAT MODE: Check if task is complex, auto-generate todos if needed
        const isComplexTask = await this.assessTaskComplexity(input)

        if (isComplexTask) {
          console.log(chalk.cyan('⚡︎ Detected complex task - auto-generating execution todos...'))

          // Generate todos automatically and orchestrate background agents
          await this.autoGenerateTodosAndOrchestrate(input)
        } else {
          // Simple task - direct response
          await this.generateDirectResponse(input)
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error processing prompt: ${error.message}`))
      this.addAssistantMessage(`I encountered an error: ${error.message}. Please try again.`)
    }
  }

  /**
   * Generate execution plan from user prompt
   */
  private async generatePlan(prompt: string): Promise<ExecutionPlan | null> {
    console.log(chalk.cyan('📋 Generating execution plan (TaskMaster toolchain)...'))

    try {
      // Use the PlanningService (integrated with TaskMaster) to create a plan from the user prompt
      const tmPlan = await planningService.createPlan(prompt, {
        showProgress: true,
        autoExecute: false,
        confirmSteps: true,
        useTaskMaster: true,
        fallbackToLegacy: true,
      })

      // Map TaskMaster/Planning plan to UnifiedChat's local ExecutionPlan structure
      const riskLevel = (tmPlan as any)?.riskAssessment?.overallRisk || 'medium'
      const steps = (tmPlan.steps || []).map((s: any) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        toolName: s.toolName || 'analyze_project',
        parameters: s.toolArgs || {},
        dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
        estimatedTime: Math.max(1, Math.round(((s.estimatedDuration ?? 3000) as number) / 1000)),
        requiresPermission: s.riskLevel === 'high' || s.reversible === false,
      })) as PlanStep[]

      const plan: ExecutionPlan = {
        id: tmPlan.id,
        title: tmPlan.title || 'Execution Plan',
        description: tmPlan.description || 'Generated plan',
        steps,
        estimatedDuration: Math.max(1, Math.round((tmPlan.estimatedTotalDuration || 60000) / 60000)),
        riskLevel: riskLevel,
        requiresApproval: riskLevel === 'high',
      }

      this.session.currentPlan = plan
      return plan
    } catch (error: any) {
      console.log(chalk.red(`❌ Planning failed: ${error.message}`))
      return null
    }
  }

  /**
   * Display the generated plan to user
   */
  private displayPlan(plan: ExecutionPlan): void {
    const planBox = boxen(
      chalk.white.bold(`📋 ${plan.title}\n\n`) +
      chalk.gray(`${plan.description}\n\n`) +
      chalk.blue(`🕒 Estimated Duration: ${plan.estimatedDuration} minutes\n`) +
      chalk.yellow(`⚠️  Risk Level: ${plan.riskLevel.toUpperCase()}\n\n`) +
      chalk.white.bold('📝 Execution Steps:\n') +
      plan.steps
        .map(
          (step, i) =>
            `${i + 1}. ${chalk.cyan(step.title)}\n   ${chalk.dim(step.description)}\n   ${step.requiresPermission ? chalk.red('🔒 Requires permission') : chalk.green('✓ Auto-approved')}`
        )
        .join('\n\n'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: plan.riskLevel === 'high' ? 'red' : plan.riskLevel === 'medium' ? 'yellow' : 'green',
      }
    )

    console.log(planBox)
  }

  /**
   * Request user approval for the plan
   */
  private async requestPlanApproval(): Promise<boolean> {
    return new Promise((resolve) => {
      const question = chalk.yellow.bold('🤔 Do you approve this execution plan? (y/N): ')

      this.rl.question(question, (answer) => {
        const approved = answer.toLowerCase().startsWith('y')
        resolve(approved)
      })
    })
  }

  /**
   * Execute the approved plan autonomously
   */
  private async executePlan(plan: ExecutionPlan): Promise<void> {
    console.log(chalk.green.bold(`🚀 Starting autonomous execution of: ${plan.title}`))

    this.session.isExecuting = true
    this.session.currentPlan = plan

    try {
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]
        if (!step) continue

        console.log(chalk.blue(`\n📍 Step ${i + 1}/${plan.steps.length}: ${step.title}`))

        // Check if permission is required
        if (step.requiresPermission) {
          const permitted = await this.requestStepPermission(step)
          if (!permitted) {
            console.log(chalk.yellow('⏸️  Execution paused - permission denied'))
            break
          }
        }

        // Execute the step
        await this.executeStep(step)

        // Process any queued prompts with secondary agents
        await this.processQueuedPrompts()
      }

      console.log(chalk.green.bold('✓ Plan execution completed successfully!'))
      this.addAssistantMessage(`Successfully completed: ${plan.title}`)
    } catch (error: any) {
      console.log(chalk.red(`❌ Plan execution failed: ${error.message}`))
      this.addAssistantMessage(`Execution failed: ${error.message}`)
    } finally {
      this.session.isExecuting = false
      this.session.currentPlan = undefined

      // Show prompt after execution completes
      const timer = setTimeout(() => {
        this.showPrompt()
        // Remove from active timers
        this.activeTimers.delete(timer)
      }, 100)
      this.activeTimers.add(timer)
    }
  }

  /**
   * Request permission for a specific step
   */
  private async requestStepPermission(step: PlanStep): Promise<boolean> {
    const permissionBox = boxen(
      chalk.yellow.bold('🔒 Permission Required\n\n') +
      chalk.white(`Step: ${step.title}\n`) +
      chalk.gray(`Description: ${step.description}\n`) +
      chalk.cyan(`Tool: ${step.toolName}\n`) +
      chalk.dim(`Parameters: ${JSON.stringify(step.parameters, null, 2)}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
      }
    )

    console.log(permissionBox)

    return new Promise((resolve) => {
      const question = chalk.yellow.bold('Allow this step? (y/N): ')

      this.rl.question(question, (answer) => {
        const allowed = answer.toLowerCase().startsWith('y')
        resolve(allowed)
      })
    })
  }

  /**
   * Execute a single plan step
   */
  private async executeStep(step: PlanStep): Promise<void> {
    console.log(chalk.cyan(`🔧 Executing: ${step.toolName}`))

    try {
      // Simulate tool execution (replace with actual tool calls)
      await new Promise((resolve) => setTimeout(resolve, step.estimatedTime * 100))

      console.log(chalk.green(`✓ Completed: ${step.title}`))
    } catch (error: any) {
      console.log(chalk.red(`❌ Step failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Queue a prompt during execution
   */
  private async queuePrompt(prompt: string): Promise<void> {
    const queuedPrompt: QueuedPrompt = {
      id: Date.now().toString(),
      content: prompt,
      timestamp: new Date(),
      priority: 'medium',
    }

    this.session.promptQueue.push(queuedPrompt)

    console.log(chalk.blue(`📥 Prompt queued (${this.session.promptQueue.length} in queue)`))
    console.log(chalk.dim(`"${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"`))
  }

  /**
   * Process queued prompts with secondary agents
   */
  private async processQueuedPrompts(): Promise<void> {
    if (this.session.promptQueue.length === 0) return

    console.log(
      chalk.magenta(`🔌 Processing ${this.session.promptQueue.length} queued prompts with secondary agents...`)
    )

    // Process each queued prompt
    while (this.session.promptQueue.length > 0) {
      const queuedPrompt = this.session.promptQueue.shift()!

      try {
        // Launch secondary agent for this prompt
        const agentId = `secondary-${Date.now()}`
        console.log(chalk.magenta(`🔌 [${agentId}] Processing: "${queuedPrompt.content.slice(0, 40)}..."`))

        // Simulate secondary agent work
        await new Promise((resolve) => setTimeout(resolve, 1000))

        console.log(chalk.green(`✓ [${agentId}] Completed secondary task`))
      } catch (error: any) {
        console.log(chalk.red(`❌ Secondary agent failed: ${error.message}`))
      }
    }
  }

  /**
   * Assess if a task is complex enough to require todo generation
   */
  private async assessTaskComplexity(input: string): Promise<boolean> {
    const lowerInput = input.toLowerCase()

    // Keywords that indicate complex tasks
    const complexKeywords = [
      'create',
      'build',
      'implement',
      'develop',
      'generate',
      'setup',
      'configure',
      'refactor',
      'migrate',
      'deploy',
      'install',
      'integrate',
      'design',
    ]

    // Keywords that indicate simple tasks
    const simpleKeywords = ['show', 'list', 'check', 'status', 'help', 'what', 'how', 'explain', 'describe']

    // Check for complex indicators
    const hasComplexKeywords = complexKeywords.some((keyword) => lowerInput.includes(keyword))
    const hasSimpleKeywords = simpleKeywords.some((keyword) => lowerInput.includes(keyword))

    // Task is complex if:
    // - Contains complex keywords AND no simple keywords
    // - Is longer than 50 characters (likely detailed request)
    // - Contains multiple sentences
    const isLongTask = input.length > 50
    const hasMultipleSentences = input.split(/[.!?]/).length > 2

    return (hasComplexKeywords && !hasSimpleKeywords) || isLongTask || hasMultipleSentences
  }

  /**
   * Auto-generate todos and orchestrate background agents for complex tasks
   */
  private async autoGenerateTodosAndOrchestrate(input: string): Promise<void> {
    try {
      // Import the todo manager
      const { agentTodoManager } = await import('./core/agent-todo-manager')

      // Create a universal agent ID for this task
      const universalAgentId = 'universal-agent'

      // Generate todos using the Universal Agent cognitive capabilities
      console.log(chalk.blue('📋 Creating execution todos...'))
      const todos = await agentTodoManager.planTodos(universalAgentId, input)

      // Display todos to user


      // Start executing todos with background agents
      console.log(chalk.green('🚀 Starting background execution...'))
      this.addAssistantMessage(
        `I've broken down your request into ${todos.length} actionable steps and started working on them in the background. You can continue chatting while I work.`
      )

      // Execute todos in background (non-blocking)
      this.executeInBackground(todos, universalAgentId)
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to generate todos: ${error.message}`))
      // Fallback to direct response
      await this.generateDirectResponse(input)
    }
  }

  /**
   * Display generated todos to user
   */

  /**
   * Execute todos in background using orchestrated agents
   */
  private executeInBackground(_todos: any[], agentId: string): void {
    // Non-blocking execution
    const timer = setTimeout(async () => {
      try {
        // Remove from active timers at start
        this.activeTimers.delete(timer)

        const { agentTodoManager } = await import('./core/agent-todo-manager')
        await agentTodoManager.executeTodos(agentId)
        console.log(chalk.green('\n✓ Background execution completed!'))
        this.addAssistantMessage('All background tasks have been completed successfully.')
      } catch (error: any) {
        console.log(chalk.red(`\n❌ Background execution failed: ${error.message}`))
        this.addAssistantMessage(`Some background tasks encountered issues: ${error.message}`)
      }
    }, 100) // Small delay to avoid blocking the chat
    this.activeTimers.add(timer)
  }

  /**
   * Generate direct response without planning
   */
  private async generateDirectResponse(_prompt: string): Promise<void> {
    console.log(chalk.cyan('💭 Generating response...'))

    try {
      const response = await advancedAIProvider.generateWithTools([
        {
          role: 'system',
          content: `You are NikCLI, an autonomous AI development assistant. Provide helpful, concise responses.
          Working directory: ${this.session.workingDirectory}`,
        },
        ...this.session.messages.slice(-5), // Last 5 messages for context
      ])

      this.addAssistantMessage(response as any)
      console.log(chalk.white(response as any))
    } catch (error: any) {
      console.log(chalk.red(`❌ Response generation failed: ${error.message}`))
      this.addAssistantMessage('I apologize, but I encountered an error generating a response. Please try again.')
    }
  }

  /**
   * Handle slash commands
   */
  private async handleSlashCommand(command: string): Promise<void> {
    const [cmd, ..._args] = command.slice(1).split(' ')

    switch (cmd.toLowerCase()) {
      case 'help':
      case 'commands':
        this.showHelp()
        break
      case 'plan':
        this.session.planMode = !this.session.planMode
        if (this.session.planMode) {
          console.log(
            chalk.green('📋 Plan mode: ON - I will create detailed plans and ask for approval before execution')
          )
          console.log(
            chalk.dim(
              '   Note: In default mode, I auto-generate todos for complex tasks and execute them in background'
            )
          )
        } else {
          console.log(chalk.yellow('📋 Plan mode: OFF - Back to default chat mode with auto-todo generation'))
        }
        break
      case 'status':
        this.showStatus()
        break
      case 'queue':
        this.showQueue()
        break
      case 'stop':
        if (this.session.isExecuting) {
          this.stopExecution()
        } else {
          console.log(chalk.yellow('No execution in progress'))
        }
        break
      case 'clear':
        console.clear()
        this.displayBanner()
        break
      case 'exit':
        this.showGoodbye()
        process.exit(0)
        break
      default:
        console.log(chalk.red(`Unknown command: /${cmd}. Type /help or /commands for available commands.`))
    }
  }

  /**
   * Stop current execution
   */
  private stopExecution(): void {
    this.session.isExecuting = false
    this.session.currentPlan = undefined
    this.session.promptQueue = []
    // Clean up any pending timers
    this.cleanupTimers()
    console.log(chalk.yellow('⏹️  Execution stopped'))
  }

  /**
   * Show help information
   */
  private showHelp(): void {
    const helpBox = boxen(
      chalk.white.bold('🔌 NikCLI Commands\n\n') +
      chalk.green('/help, /commands') +
      chalk.gray(' - Show this help\n') +
      chalk.green('/plan') +
      chalk.gray('     - Toggle plan mode (currently: ') +
      (this.session.planMode ? chalk.green('ON') : chalk.red('OFF')) +
      chalk.gray(') - Ask approval before execution\n') +
      chalk.green('/status') +
      chalk.gray('   - Show current status\n') +
      chalk.green('/queue') +
      chalk.gray('    - Show prompt queue\n') +
      chalk.green('/stop') +
      chalk.gray('     - Stop current execution\n') +
      chalk.green('/clear') +
      chalk.gray('    - Clear screen\n') +
      chalk.green('/exit') +
      chalk.gray('     - Exit NikCLI\n\n') +
      chalk.yellow('💡 Default mode: Auto-generates todos for complex tasks and executes in background\n') +
      chalk.yellow('💡 Plan mode: Creates detailed plans and asks for approval first'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )

    console.log(helpBox)
  }

  /**
   * Show current status
   */
  private showStatus(): void {
    const statusBox = boxen(
      chalk.white.bold('📊 NikCLI Status\n\n') +
      chalk.blue('Working Directory: ') +
      chalk.cyan(this.session.workingDirectory) +
      '\n' +
      chalk.blue('Plan Mode: ') +
      (this.session.planMode ? chalk.green('ON') : chalk.red('OFF')) +
      '\n' +
      chalk.blue('Executing: ') +
      (this.session.isExecuting ? chalk.yellow('YES') : chalk.green('NO')) +
      '\n' +
      chalk.blue('Current Plan: ') +
      (this.session.currentPlan ? chalk.cyan(this.session.currentPlan.title) : chalk.gray('None')) +
      '\n' +
      chalk.blue('Queued Prompts: ') +
      chalk.yellow(this.session.promptQueue.length.toString()) +
      '\n' +
      chalk.blue('Messages: ') +
      chalk.cyan(this.session.messages.length.toString()),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'blue',
      }
    )

    console.log(statusBox)
  }

  /**
   * Show prompt queue
   */
  private showQueue(): void {
    if (this.session.promptQueue.length === 0) {
      console.log(chalk.gray('📥 Prompt queue is empty'))
      return
    }

    const queueBox = boxen(
      chalk.white.bold(`📥 Prompt Queue (${this.session.promptQueue.length})\n\n`) +
      this.session.promptQueue
        .map(
          (prompt, i) =>
            `${i + 1}. ${chalk.cyan(prompt.content.slice(0, 50))}${prompt.content.length > 50 ? '...' : ''}\n   ${chalk.dim(prompt.timestamp.toLocaleTimeString())}`
        )
        .join('\n\n'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
      }
    )

    console.log(queueBox)
  }

  /**
   * Add assistant message to session
   */
  private addAssistantMessage(content: string): void {
    this.session.messages.push({
      role: 'assistant',
      content,
      timestamp: new Date(),
    })
  }

  /**
   * Auto-completion for commands
   */
  private autoComplete(line: string): [string[], string] {
    const commands = ['/help', '/commands', '/plan', '/status', '/queue', '/stop', '/clear', '/exit']
    const hits = commands.filter((cmd) => cmd.startsWith(line))
    return [hits.length ? hits : commands, line]
  }

  /**
   * Display banner
   */
  private displayBanner(): void {
    console.clear()
    console.log(chalk.cyanBright(banner))

    const welcomeBox = boxen(
      chalk.white.bold('🔌 Autonomous AI Development Assistant\n\n') +
      chalk.gray('• Intelligent planning and execution\n') +
      chalk.gray('• Real-time prompt queue management\n') +
      chalk.gray('• Interactive permission system\n') +
      chalk.gray('• Multi-agent orchestration\n\n') +
      chalk.cyan('Ready to help with your development tasks!'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )

    console.log(welcomeBox)
  }

  /**
   * Show prompt
   */
  private showPrompt(): void {
    const workingDir = require('node:path').basename(this.session.workingDirectory)
    const indicators: string[] = []

    if (this.session.planMode) indicators.push(chalk.green('plan'))
    if (this.session.isExecuting) indicators.push(chalk.yellow('exec'))
    if (this.session.promptQueue.length > 0) indicators.push(chalk.blue(`queue:${this.session.promptQueue.length}`))

    const modeStr = indicators.length > 0 ? ` [${indicators.join(' ')}]` : ''
    const prompt = chalk.cyan(`\n┌─[🔌:${workingDir}${modeStr}]\n└─❯ `)

    this.rl.setPrompt(prompt)
    this.rl.prompt()
  }

  /**
   * Show goodbye message
   */
  private showGoodbye(): void {
    const goodbyeBox = boxen(
      chalk.white.bold('🔌 NikCLI Session Complete\n\n') +
      chalk.gray('Thank you for using NikCLI!\n') +
      chalk.blue(`Messages processed: ${this.session.messages.length}\n`) +
      chalk.green(`Session duration: ${Math.round((Date.now() - parseInt(this.session.id, 10)) / 1000)}s\n\n`) +
      chalk.cyan('Happy coding! 🚀'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
        titleAlignment: 'center',
      }
    )

    console.log(goodbyeBox)
  }

  /**
   * Initialize and start the chat interface
   */
  async start(): Promise<void> {
    try {
      // Check API keys
      if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
        console.log(chalk.red('❌ No API keys found. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY'))
        process.exit(1)
      }

      // Display banner
      this.displayBanner()

      // Initialize services
      console.log(chalk.blue('⚡︎ Initializing services...'))
      await this.chatOrchestrator.initialize()
      console.log(chalk.green('✓ Services initialized'))

      // Show initial prompt
      this.showPrompt()

      this.initialized = true
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to start NikCLI:'), error)
      process.exit(1)
    }
  }

  /**
   * Clean up all active timers to prevent memory leaks
   */
  private cleanupTimers(): void {
    this.activeTimers.forEach((timer) => {
      clearTimeout(timer)
    })
    this.activeTimers.clear()
  }

  /**
   * Complete cleanup of all resources
   */
  private cleanup(): void {
    if (this.cleanupCompleted) return
    this.cleanupCompleted = true

    try {
      // Clean up all timers
      this.cleanupTimers()

      // Remove all event listeners
      if (this.rl) {
        this.eventHandlers.forEach((handler, event) => {
          this.rl.removeListener(event, handler)
        })
        this.eventHandlers.clear()
      }

      // Clear session data
      this.session.activeAgents.clear()
      this.session.promptQueue = []
    } catch (error: any) {
      // Silent cleanup errors to prevent exit issues
      console.error('Cleanup error:', error.message)
    }
  }

  /**
   * Shutdown cleanup - public interface
   */
  public shutdown(): void {
    this.cleanup()
    if (this.rl && !(this.rl as any).closed) {
      try {
        this.rl.close()
      } catch (error) {
        // Ignore close errors
      }
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  const chat = new UnifiedChatInterface()
  await chat.start()
}

// Start if run directly
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red('❌ Startup failed:'), error)
    process.exit(1)
  })
}

export { main }
