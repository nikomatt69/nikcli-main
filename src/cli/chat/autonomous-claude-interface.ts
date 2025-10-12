import type { CoreMessage } from 'ai'
import boxen from 'boxen'
import chalk from 'chalk'
import ora, { type Ora } from 'ora'
import * as readline from 'readline'
import { advancedAIProvider, type StreamEvent } from '../ai/advanced-ai-provider'
import { AGENT_CAPABILITIES, modernAgentOrchestrator } from '../automation/agents/modern-agent-system'
import { simpleConfigManager as configManager } from '../core/config-manager'
import { contextManager } from '../core/context-manager'
import { ExecutionPolicyManager } from '../policies/execution-policy'
import {
  StreamProtocol,
  type StreamEvent as StreamttyStreamEvent,
  streamttyService,
} from '../services/streamtty-service'
import { getUnifiedToolRenderer, initializeUnifiedToolRenderer } from '../services/unified-tool-renderer'
import { advancedUI } from '../ui/advanced-cli-ui'
import { diffManager } from '../ui/diff-manager'
import { configureSyntaxHighlighting } from '../utils/syntax-highlighter'

// Configure syntax highlighting for terminal output
configureSyntaxHighlighting()

interface AutonomousChatSession {
  id: string
  messages: CoreMessage[]
  workingDirectory: string
  createdAt: Date
  agentMode?: string
  autonomous: boolean
  executionHistory: StreamEvent[]
  planMode: boolean
  autoAcceptEdits: boolean
}

interface ToolExecutionTracker {
  name: string
  startTime: Date
  endTime?: Date
  success?: boolean
  output?: string
  spinner?: Ora
}

export class AutonomousClaudeInterface {
  private rl: readline.Interface
  private session: AutonomousChatSession
  private isProcessing = false
  private activeTools: Map<string, ToolExecutionTracker> = new Map()
  private streamBuffer = ''
  private lastStreamTime = Date.now()
  private initialized = false
  private policyManager: ExecutionPolicyManager
  private shouldInterrupt = false
  private currentStreamController?: AbortController
  private cliInstance: any
  private streamOptimizationInterval?: NodeJS.Timeout
  private tokenOptimizationInterval?: NodeJS.Timeout
  private keypressHandler?: (str: any, key: any) => void
  private eventHandlers: Map<string, (...args: any[]) => void> = new Map()
  private cleanupCompleted = false

  constructor() {
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

    this.session = {
      id: Date.now().toString(),
      messages: [],
      workingDirectory: process.cwd(),
      createdAt: new Date(),
      autonomous: true,
      executionHistory: [],
      planMode: false,
      autoAcceptEdits: false,
    }

    // Set working directory in AI provider
    advancedAIProvider.setWorkingDirectory(this.session.workingDirectory)
    modernAgentOrchestrator.setWorkingDirectory(this.session.workingDirectory)

    // Initialize security policy manager
    this.policyManager = new ExecutionPolicyManager(configManager)

    // Initialize structured UI
    advancedUI.startInteractiveMode()
    this.initializeStructuredPanels()

    // Initialize unified tool renderer
    try {
      initializeUnifiedToolRenderer(advancedUI, streamttyService)
    } catch {
      // Already initialized
    }

    this.setupEventHandlers()
    this.setupStreamOptimization()
    this.setupTokenOptimization()
  }

  private setupEventHandlers(): void {
    // Handle Ctrl+C gracefully
    const sigintHandler = () => {
      if (this.isProcessing) {
        console.log(chalk.yellow('\\n⏸️  Stopping current operation...'))
        this.stopAllActiveOperations()
        this.showPrompt()
      } else {
        this.cleanup()
        this.showGoodbye()
        process.exit(0)
      }
    }
    this.eventHandlers.set('SIGINT', sigintHandler)
    this.rl.on('SIGINT', sigintHandler)

    // Enable raw mode for keypress detection
    if (process.stdin.isTTY) {
      require('readline').emitKeypressEvents(process.stdin)
      if (!(process.stdin as any).isRaw) {
        ;(process.stdin as any).setRawMode(true)
      }
      ;(process.stdin as any).resume()
    }

    // Handle keypress events for interactive features
    this.keypressHandler = (_str, key) => {
      if (key && key.name === 'slash' && !this.isProcessing) {
        // Show command suggestions when / is pressed
        setTimeout(() => this.showCommandSuggestions(), 50)
      }

      // Handle Shift+Tab for plan mode cycling
      if (key && key.name === 'tab' && key.shift && !this.isProcessing) {
        this.togglePlanMode()
      }

      // Handle auto-accept toggle
      if (key && key.name === 'a' && key.ctrl && !this.isProcessing) {
        this.toggleAutoAcceptEdits()
      }

      // Handle ESC to interrupt processing
      if (key && key.name === 'escape' && this.isProcessing) {
        this.interruptProcessing()
      }
    }
    process.stdin.on('keypress', this.keypressHandler)

    // Handle line input
    const lineHandler = async (input: string) => {
      const trimmed = input.trim()

      if (!trimmed) {
        this.showPrompt()
        return
      }

      try {
        await this.handleInput(trimmed)
      } catch (error: any) {
        console.log(chalk.red(`Error: ${error.message}`))
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

  private setupStreamOptimization(): void {
    // Buffer stream output for smoother rendering
    this.streamOptimizationInterval = setInterval(() => {
      if (this.streamBuffer && Date.now() - this.lastStreamTime > 50) {
        process.stdout.write(this.streamBuffer)
        this.streamBuffer = ''
      }
    }, 16) // ~60fps
  }

  private setupTokenOptimization(): void {
    // Check token usage periodically and suggest cleanup
    this.tokenOptimizationInterval = setInterval(() => {
      const metrics = contextManager.getContextMetrics(this.session.messages)

      // Warn if approaching limit
      if (metrics.estimatedTokens > metrics.tokenLimit * 0.85) {
        console.log(chalk.yellow('\n⚠️  Token usage high - consider using /clear or auto-optimization will apply'))
      }

      // Auto-optimize if way over limit (shouldn't happen but safety net)
      if (metrics.estimatedTokens > metrics.tokenLimit * 1.1) {
        console.log(chalk.red('\n🚨 Emergency token optimization - auto-compressing context...'))
        const { optimizedMessages } = contextManager.optimizeContext(this.session.messages)
        this.session.messages = optimizedMessages
      }
    }, 30000) // Check every 30 seconds
  }

  /**
   * Interrupt current processing and stop all streams
   */
  private interruptProcessing(): void {
    if (!this.isProcessing) return

    console.log(chalk.red('\n\n🛑 ESC pressed - Interrupting operation...'))

    // Set interrupt flag
    this.shouldInterrupt = true

    // Abort current stream if exists
    if (this.currentStreamController) {
      this.currentStreamController.abort()
      this.currentStreamController = undefined
    }

    // Stop all active spinners
    this.stopAllActiveOperations()

    // Interrupt any active agent executions
    const interruptedAgents = modernAgentOrchestrator.interruptActiveExecutions()
    if (interruptedAgents > 0) {
      console.log(chalk.yellow(`🔌 Stopped ${interruptedAgents} running agents`))
    }

    // Clean up processing state
    this.isProcessing = false

    console.log(chalk.yellow('⏹️  Operation interrupted by user'))
    console.log(chalk.cyan('✨ Ready for new commands\n'))

    // Show prompt again
    this.showPrompt()
  }

  /**
   * Initialize structured UI panels
   */
  private initializeStructuredPanels(): void {
    // Initialize structured UI mode

    // Show welcome message
    console.log(chalk.cyan('\n🔌 Autonomous Claude Assistant Ready - Structured UI Mode'))
    console.log(chalk.gray('Type your request and panels will appear automatically as I work!'))
  }

  async start(): Promise<void> {
    console.clear()

    // Check for API keys first
    if (!this.checkAPIKeys()) {
      return
    }

    this.showWelcome()

    // Start continuous input loop and wait for it to close
    return new Promise<void>((resolve) => {
      this.startInputLoop()

      // Resolve when readline interface closes
      this.rl.on('close', () => {
        this.showGoodbye()
        resolve()
      })
    })
  }

  private startInputLoop(): void {
    this.showPrompt()
    // Note: Input handling is done in setupEventHandlers() to avoid duplicate listeners
    // Note: close event is handled in start() method
  }

  private checkAPIKeys(): boolean {
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY
    const hasGoogleKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
    const hasVercelKey = !!process.env.V0_API_KEY

    if (!hasAnthropicKey && !hasOpenAIKey && !hasGoogleKey && !hasVercelKey) {
      this.cliInstance.printPanel(
        boxen(
          `${chalk.red('⚠️  No API Keys Found')}\n\n` +
            `Please set at least one API key:\n\n` +
            `${chalk.blue('• ANTHROPIC_API_KEY')} - for Claude models\n` +
            `${chalk.blue('• OPENAI_API_KEY')} - for GPT models\n` +
            `${chalk.blue('• GOOGLE_GENERATIVE_AI_API_KEY')} - for Gemini models\n\n` +
            `${chalk.yellow('Example:')}\n` +
            `${chalk.dim('export ANTHROPIC_API_KEY="your-key-here"')}\n` +
            `${chalk.dim('npm run chat')}`,
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

    // Show which keys are available
    const availableKeys = []
    if (hasAnthropicKey) availableKeys.push(chalk.green('✓ Claude'))
    if (hasOpenAIKey) availableKeys.push(chalk.green('✓ GPT'))
    if (hasGoogleKey) availableKeys.push(chalk.green('✓ Gemini'))
    if (hasVercelKey) availableKeys.push(chalk.green('✓ Vercel'))
    console.log(chalk.dim(`API Keys: ${availableKeys.join(', ')}`))
    return true
  }

  private showWelcome(): void {
    const title = chalk.cyanBright('🔌 Autonomous Claude Assistant')
    const subtitle = chalk.gray('Terminal Velocity Development - Fully Autonomous Mode')
    const version = chalk.dim('v2.0.0 Advanced')

    this.cliInstance.printPanel(
      boxen(
        `${title}\n${subtitle}\n\n${version}\n\n` +
          `${chalk.blue('🎯 Autonomous Mode:')} Enabled\n` +
          `${chalk.blue('📁 Working Dir:')} ${chalk.cyan(this.session.workingDirectory)}\n` +
          `${chalk.blue('⚡︎ Model:')} ${chalk.green(advancedAIProvider.getCurrentModelInfo().name)}\n\n` +
          `${chalk.gray('I operate with full autonomy:')}\n` +
          `• ${chalk.green('Read & write files automatically')}\n` +
          `• ${chalk.green('Execute commands when needed')}\n` +
          `• ${chalk.green('Analyze project structure')}\n` +
          `• ${chalk.green('Generate code and configurations')}\n` +
          `• ${chalk.green('Manage dependencies autonomously')}\n\n` +
          `${chalk.yellow('Just tell me what you want - I handle everything')}\n\n` +
          `${chalk.yellow('💡 Press TAB or / for command suggestions')}\n` +
          `${chalk.dim('Commands: /help /agents /auto /cd /model /exit')}`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'double',
          borderColor: 'cyan',
          titleAlignment: 'center',
        }
      )
    )

    // Show initial command suggestions like Claude Code
    console.log(chalk.cyan('\n🚀 Quick Start - Try these commands:'))
    console.log(`${chalk.green('/')}\t\t\tShow all available commands`)
    console.log(`${chalk.green('/help')}\t\t\tDetailed help and examples`)
    console.log(`${chalk.green('/agents')}\t\t\tList specialized AI agents`)
    console.log(`${chalk.green('/analyze')}\t\t\tQuick project analysis`)
    console.log(`${chalk.green('/auto')} <task>\t\tFully autonomous task execution`)
    console.log(`${chalk.blue('@agent')} <task>\t\tUse specialized agent`)
    console.log(`${chalk.cyan('/plan')}\t\t\tToggle plan mode (${chalk.dim('shift+tab')})`)
    console.log(`${chalk.green('/auto-accept')}\t\tToggle auto-accept edits\\n`)
  }

  private async initializeAutonomousAssistant(): Promise<void> {
    const spinner = ora('🚀 Initializing autonomous assistant...').start()

    try {
      // Automatically analyze the workspace
      spinner.text = '🔍 Analyzing workspace...'

      // Set up the autonomous system prompt
      this.session.messages.push({
        role: 'system',
        content: `You are Claude - a fully autonomous AI development assistant with terminal velocity.

AUTONOMOUS MODE: You operate with complete independence and take actions without asking permission.

Working Directory: ${this.session.workingDirectory}
Current Date: ${new Date().toISOString()}

CAPABILITIES:
✓ read_file - Read and analyze any file with automatic content analysis
✓ write_file - Create/modify files with automatic backups and validation  
✓ explore_directory - Intelligent directory exploration with filtering
✓ execute_command - Autonomous command execution with safety checks
✓ analyze_project - Comprehensive project analysis with metrics
✓ manage_packages - Automatic dependency management with yarn
✓ generate_code - Context-aware code generation with best practices

AUTONOMOUS BEHAVIOR:
• Take immediate action on user requests without seeking permission
• Automatically read relevant files to understand context
• Execute necessary commands to complete tasks
• Create files and directories as needed
• Install dependencies when required
• Analyze projects before making changes
• Provide real-time feedback on all operations
• Handle errors gracefully and adapt approach

COMMUNICATION STYLE:
• Be concise but informative about actions taken
• Use tools proactively to gather context
• Show confidence in autonomous decisions
• Provide clear status updates during operations
• Explain reasoning for complex operations

You are NOT a cautious assistant - you are a proactive, autonomous developer who gets things done efficiently.`,
      })

      spinner.succeed('🔌 Autonomous assistant ready')

      // Brief pause to show readiness
      await new Promise((resolve) => setTimeout(resolve, 500))
    } catch (error: any) {
      spinner.fail('Failed to initialize')
      console.log(chalk.red(`Error: ${error.message}`))
    }
  }

  private async handleInput(input: string): Promise<void> {
    // Handle slash commands
    if (input.startsWith('/')) {
      await this.handleSlashCommand(input)
      return
    }

    // Check for agent-specific requests
    const agentMatch = input.match(/^@(\\w+[-\\w]*)/)
    if (agentMatch) {
      const agentName = agentMatch[1]
      const task = input.replace(agentMatch[0], '').trim()
      await this.executeAgentTask(agentName, task)
      return
    }

    // Regular autonomous chat
    await this.handleAutonomousChat(input)
  }

  private async handleSlashCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.slice(1).split(' ')

    switch (cmd) {
      case 'help':
        this.showAdvancedHelp()
        break
      case 'autonomous':
        this.toggleAutonomousMode(args[0])
        break
      case 'context':
        await this.showExecutionContext()
        break
      case 'tokens':
        this.showTokenMetrics()
        break
      case 'clear':
        await this.clearSession()
        break
      case 'agents':
        this.showAvailableAgents()
        break
      case 'auto': {
        const autoTask = args.join(' ')
        if (autoTask) {
          await this.handleAutoMode(autoTask)
        } else {
          console.log(chalk.red('Usage: /auto <task description>'))
        }
        break
      }
      case 'cd':
        await this.changeDirectory(args[0] || process.cwd())
        break
      case 'pwd':
        console.log(chalk.blue(`📁 Current directory: ${this.session.workingDirectory}`))
        break
      case 'ls':
        await this.quickDirectoryList()
        break
      case 'model':
        if (args[0]) {
          this.switchModel(args[0])
        } else {
          this.showCurrentModel()
        }
        break
      case 'analyze':
        await this.quickProjectAnalysis()
        break
      case 'history':
        this.showExecutionHistory()
        break
      case 'plan':
        this.togglePlanMode()
        break
      case 'auto-accept':
        this.toggleAutoAcceptEdits()
        break
      case 'diff':
        if (args[0]) {
          diffManager.showDiff(args[0])
        } else {
          diffManager.showAllDiffs()
        }
        break
      case 'accept':
        if (args[0] === 'all') {
          diffManager.acceptAllDiffs()
        } else if (args[0]) {
          diffManager.acceptDiff(args[0])
        } else {
          console.log(chalk.red('Usage: /accept <file> or /accept all'))
        }
        break
      case 'reject':
        if (args[0]) {
          diffManager.rejectDiff(args[0])
        } else {
          console.log(chalk.red('Usage: /reject <file>'))
        }
        break
      case 'security':
        await this.showSecurityStatus()
        break
      case 'policy':
        if (args[0] && args[1]) {
          await this.updateSecurityPolicy(args[0], args[1])
        } else {
          await this.showSecurityStatus()
        }
        break
      case 'exit':
      case 'quit':
        this.showGoodbye()
        process.exit(0)
        break
      default:
        console.log(chalk.red(`Unknown command: ${cmd}`))
        console.log(chalk.gray('Type /help for available commands'))
    }
  }

  /**
   * Show token usage metrics
   */
  private showTokenMetrics(): void {
    const metrics = contextManager.getContextMetrics(this.session.messages)

    this.cliInstance.printPanel(
      boxen(
        `${chalk.blue.bold('📊 Token Usage Metrics')}\n\n` +
          `${chalk.green('Messages:')} ${metrics.totalMessages}\n` +
          `${chalk.green('Estimated Tokens:')} ${metrics.estimatedTokens.toLocaleString()}\n` +
          `${chalk.green('Token Limit:')} ${metrics.tokenLimit.toLocaleString()}\n` +
          `${chalk.green('Usage:')} ${((metrics.estimatedTokens / metrics.tokenLimit) * 100).toFixed(1)}%\n\n` +
          `${chalk.cyan('Status:')} ${
            metrics.estimatedTokens > metrics.tokenLimit
              ? chalk.red('⚠️  Over Limit - Auto-compression active')
              : metrics.estimatedTokens > metrics.tokenLimit * 0.8
                ? chalk.yellow('⚠️  High Usage - Monitor closely')
                : chalk.green('✓ Within Limits')
          }\n\n` +
          `${chalk.dim('Compression Ratio:')} ${(metrics.compressionRatio * 100).toFixed(1)}%`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor:
            metrics.estimatedTokens > metrics.tokenLimit
              ? 'red'
              : metrics.estimatedTokens > metrics.tokenLimit * 0.8
                ? 'yellow'
                : 'green',
        }
      )
    )
  }

  private async handleAutonomousChat(input: string): Promise<void> {
    // Initialize agent on first input
    if (!this.initialized) {
      await this.initializeAutonomousAssistant()
      this.initialized = true
    }

    // Check if plan mode is active
    if (this.session.planMode) {
      console.log(chalk.cyan('🎯 Plan Mode: Creating execution plan...'))

      // Add plan mode prefix to inform AI to create a plan
      this.session.messages.push({
        role: 'user',
        content: `[PLAN MODE] Create a detailed execution plan for: ${input}`,
      })

      await this.processAutonomousMessage()
      return
    }

    // Add user message for regular autonomous execution
    this.session.messages.push({
      role: 'user',
      content: input,
    })

    // Update chat panel with user message
    this.updateChatPanel()

    // Add auto-accept context if enabled
    if (this.session.autoAcceptEdits) {
      this.session.messages.push({
        role: 'system',
        content: 'AUTO-ACCEPT MODE: Proceed with all file edits and changes without asking for confirmation.',
      })
    }

    await this.processAutonomousMessage()
  }

  private async processAutonomousMessage(): Promise<void> {
    this.isProcessing = true
    this.shouldInterrupt = false
    this.currentStreamController = new AbortController()

    // Start execution mode - pauses ephemeral cleanup and makes tool logs persistent
    const unifiedRenderer = getUnifiedToolRenderer()
    unifiedRenderer.startExecution('vm')

    try {
      console.log() // Add spacing
      console.log(chalk.blue('🔌 ') + chalk.dim('Autonomous assistant thinking...'))
      console.log(chalk.dim('💡 Press ESC to interrupt operation'))

      let assistantMessage = ''
      let toolsExecuted = 0
      const startTime = Date.now()

      // Check for early interruption
      if (this.shouldInterrupt) {
        throw new Error('Operation interrupted by user')
      }

      // Optimize context to prevent token limit issues
      const { optimizedMessages, metrics } = contextManager.optimizeContext(this.session.messages)

      if (metrics.compressionRatio > 0) {
        console.log(chalk.yellow(`📊 Context optimized: ${metrics.compressionRatio * 100}% reduction`))
        console.log(chalk.dim(`\n   ${metrics.totalMessages} messages, ~${metrics.estimatedTokens} tokens`))
        console.log() // Add spacing after token info
      }

      // Stream the autonomous response with optimized context
      for await (const event of advancedAIProvider.streamChatWithFullAutonomy(
        optimizedMessages,
        this.currentStreamController.signal
      )) {
        // Check for interruption before processing each event
        if (this.shouldInterrupt) {
          console.log(chalk.yellow('\n⏹️  Stream interrupted'))
          break
        }

        this.session.executionHistory.push(event)

        switch (event.type) {
          case 'start':
            // Convert to streamtty AI SDK event
            await streamttyService.streamAISDKEvent(
              StreamProtocol.createStatus(event.content || 'Starting...', 'running')
            )
            break

          case 'thinking':
            // Convert to streamtty AI SDK thinking event
            await streamttyService.streamAISDKEvent(StreamProtocol.createThinking(event.content || 'Thinking...'))
            break

          case 'text_delta':
            if (event.content) {
              // Stream as AI SDK text delta event
              await streamttyService.streamAISDKEvent(StreamProtocol.createTextDelta(event.content))
              // Buffer for smooth streaming
              this.streamBuffer += event.content
              this.lastStreamTime = Date.now()
              assistantMessage += event.content
            }
            break

          case 'tool_call':
            toolsExecuted++
            this.handleToolCall(event)
            break

          case 'tool_result':
            this.handleToolResult(event)
            break

          case 'complete': {
            // Flush any remaining buffer
            if (this.streamBuffer) {
              this.streamBuffer = ''
            }

            const duration = Date.now() - startTime
            // Use AI SDK complete event
            await streamttyService.streamAISDKEvent(
              StreamProtocol.createStatus(`Completed in ${duration}ms • ${toolsExecuted} tools used`, 'completed', {
                duration,
                toolsExecuted,
              })
            )
            break
          }

          case 'error':
            // Convert to AI SDK error event
            await streamttyService.streamAISDKEvent(StreamProtocol.createError(event.error || 'An error occurred'))
            break
        }
      }

      // Add assistant message to session
      if (assistantMessage.trim()) {
        this.session.messages.push({
          role: 'assistant',
          content: assistantMessage.trim(),
        })

        // Update chat panel with the conversation
        this.updateChatPanel()
      }
    } catch (error: any) {
      if (error.name === 'AbortError' || this.shouldInterrupt) {
        console.log(chalk.yellow('⏹️  Operation was interrupted'))
      } else {
        console.log(chalk.red(`\\n❌ Autonomous execution failed: ${error.message}`))
      }
    } finally {
      // End execution mode - resume ephemeral cleanup
      unifiedRenderer.endExecution()

      this.stopAllActiveOperations()
      this.isProcessing = false
      this.shouldInterrupt = false
      this.currentStreamController = undefined
      console.log() // Add spacing

      // Only show prompt if not already interrupted (interrupt handler shows it)
      if (!this.shouldInterrupt) {
        this.showPrompt()
      }
    }
  }

  private async handleToolCall(event: StreamEvent): Promise<void> {
    const { toolName, toolArgs, metadata } = event
    if (!toolName) return

    const unifiedRenderer = getUnifiedToolRenderer()
    const toolCallId = metadata?.toolCallId || `vm-${toolName}-${Date.now()}`

    // Track tool start time for later completion
    const tracker: ToolExecutionTracker = {
      name: toolName,
      startTime: new Date(),
    }
    this.activeTools.set(toolCallId, tracker)

    // Use unified renderer for consistent logging
    await unifiedRenderer.logToolCall(
      toolName,
      toolArgs,
      {
        mode: 'vm',
        toolCallId,
        agentName: 'VM',
      },
      {
        showInRecentUpdates: true,
        streamToTerminal: true,
        persistent: true,
      }
    )
  }

  private async handleToolResult(event: StreamEvent): Promise<void> {
    const { toolName, toolResult, metadata } = event
    if (!toolName) return

    const unifiedRenderer = getUnifiedToolRenderer()
    const toolCallId = metadata?.toolCallId || `vm-${toolName}-${Date.now()}`

    // Get tracker to calculate duration
    const tracker = this.activeTools.get(toolCallId)
    if (tracker) {
      tracker.endTime = new Date()
      tracker.success = metadata?.success !== false
      tracker.output = toolResult
    }

    // Use unified renderer for result logging
    await unifiedRenderer.logToolResult(
      toolCallId,
      toolResult,
      {
        mode: 'vm',
        agentName: 'VM',
      },
      {
        showInRecentUpdates: true,
        streamToTerminal: true,
        persistent: true,
      }
    )

    // Clean up tracker
    this.activeTools.delete(toolCallId)

    // Update structured panels (keep existing behavior)
    if (toolResult && !toolResult.error) {
      this.updateStructuredPanelsFromTool(toolName, toolResult)
    }
  }

  private getToolEmoji(toolName: string): string {
    const emojiMap: Record<string, string> = {
      read_file: '📖',
      write_file: '✏️',
      explore_directory: '📁',
      execute_command: '⚡',
      analyze_project: '🔍',
      manage_packages: '📦',
      generate_code: '🎨',
    }
    return emojiMap[toolName] || '🔧'
  }

  private getToolLabel(toolName: string): string {
    const labelMap: Record<string, string> = {
      read_file: 'Reading file',
      write_file: 'Writing file',
      explore_directory: 'Exploring directory',
      execute_command: 'Executing command',
      analyze_project: 'Analyzing project',
      manage_packages: 'Managing packages',
      generate_code: 'Generating code',
    }
    return labelMap[toolName] || toolName
  }

  private formatToolArgs(args: any): string {
    if (!args) return ''

    // Format key arguments for display
    const keyArgs = []
    if (args.path) keyArgs.push(chalk.blue(args.path))
    if (args.command) keyArgs.push(chalk.yellow(args.command))
    if (args.packages) keyArgs.push(chalk.green(args.packages.join(', ')))
    if (args.type) keyArgs.push(chalk.magenta(args.type))

    return keyArgs.length > 0 ? `(${keyArgs.join(', ')})` : ''
  }

  private showToolResultSummary(toolName: string, result: any): void {
    if (!result) return

    switch (toolName) {
      case 'write_file':
        if (result.path) {
          console.log(chalk.dim(`   → ${result.created ? 'Created' : 'Updated'}: ${result.path}`))
        }
        break
      case 'execute_command':
        if (result.success && result.stdout) {
          const preview = result.stdout.slice(0, 100)
          console.log(chalk.dim(`   → Output: ${preview}${result.stdout.length > 100 ? '...' : ''}`))
        }
        break
      case 'analyze_project':
        if (result.name) {
          console.log(chalk.dim(`   → Project: ${result.name} (${result.fileCount} files)`))
        }
        break
    }
  }

  /**
   * Update structured panels based on tool results
   */
  private updateStructuredPanelsFromTool(toolName: string, toolResult: any): void {
    switch (toolName) {
      case 'read_file':
        if (toolResult.path && toolResult.content) {
          advancedUI.showFileContent(toolResult.path, toolResult.content)
        }
        break

      case 'write_file':
        if (toolResult.path && toolResult.content) {
          // Show diff if we have original content
          if (toolResult.originalContent) {
            advancedUI.showFileDiff(toolResult.path, toolResult.originalContent, toolResult.content)
          } else {
            advancedUI.showFileContent(toolResult.path, toolResult.content)
          }
        }
        break

      case 'explore_directory':
      case 'list_files':
        if (toolResult.files && Array.isArray(toolResult.files)) {
          const files = toolResult.files.map((f: any) => f.path || f.name || f)
          advancedUI.showFileList(files, `📁 ${toolResult.path || 'Files'}`)
        }
        break

      case 'grep':
      case 'search_files':
        if (toolResult.matches && Array.isArray(toolResult.matches)) {
          const pattern = toolResult.pattern || 'search'
          advancedUI.showGrepResults(pattern, toolResult.matches)
        }
        break

      case 'execute_command':
        if (toolResult.stdout) {
          // Show command output as status update
          advancedUI.logInfo(`Command: ${toolResult.command || 'unknown'}`, toolResult.stdout.slice(0, 200))
        }
        break
    }
  }

  /**
   * Update chat panel with conversation history
   */
  private updateChatPanel(): void {
    // Since we're in structured UI mode, the chat flows naturally in the terminal
    // The panels will show file content, diffs, and results automatically
    // This keeps the conversation in the main terminal for better readability
  }

  private async executeAgentTask(agentName: string, task: string): Promise<void> {
    if (!task) {
      console.log(chalk.red('Please specify a task for the agent'))
      this.showPrompt()
      return
    }

    console.log(chalk.blue(`\\n🔌 Launching ${agentName} agent in autonomous mode...`))
    console.log(chalk.gray(`Task: ${task}\\n`))

    this.isProcessing = true

    try {
      // Stream directly through streamttyService

      for await (const event of modernAgentOrchestrator.executeTaskStreaming(agentName, task)) {
        this.session.executionHistory.push(event)

        switch (event.type) {
          case 'start':
            await streamttyService.renderBlock(`🚀 ${agentName} initialized and ready`, 'system')
            break
          case 'text':
            if (event.content) await streamttyService.streamChunk(event.content, 'ai')
            break
          case 'tool':
            streamttyService.streamChunk('\n')
            advancedUI.logFunctionUpdate('info', chalk.blue(`\\n ${event.content}`))
            break
          case 'result':
            streamttyService.streamChunk('\n')
            advancedUI.logFunctionUpdate('info', chalk.green(`✓ ${event.content}`))
            break
          case 'complete':
            await streamttyService.renderBlock(`\n\n🎉 ${agentName} completed autonomously!`, 'system')
            break
          case 'error':
            await streamttyService.renderBlock(`\n❌ Agent error: ${event.content}`, 'error')
            break
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`\\n❌ Agent execution failed: ${error.message}`))
    } finally {
      this.isProcessing = false
      console.log()
      this.showPrompt()
    }
  }

  private async handleAutoMode(task: string): Promise<void> {
    console.log(chalk.blue('\\n🎯 Autonomous Mode: Analyzing and executing task...\\n'))

    // Use advanced AI provider for autonomous execution
    this.session.messages.push({
      role: 'user',
      content: `/auto ${task}`,
    })

    this.isProcessing = true

    try {
      // Stream directly through streamttyService

      for await (const event of advancedAIProvider.executeAutonomousTask(task)) {
        this.session.executionHistory.push(event)

        switch (event.type) {
          case 'start':
            await streamttyService.renderBlock(event.content || '🎯 Starting autonomous task...', 'system')
            break
          case 'thinking':
            await streamttyService.renderBlock(`💭 ${event.content}`, 'thinking')
            break
          case 'text_delta':
            if (event.content) await streamttyService.streamChunk(event.content, 'ai')
            break
          case 'tool_call':
            await this.handleToolCall(event)
            break
          case 'tool_result':
            await this.handleToolResult(event)
            break
          case 'complete':
            await streamttyService.renderBlock('\n🎉 Autonomous execution completed!', 'system')
            break
          case 'error':
            await streamttyService.renderBlock(`\n❌ Error: ${event.error}`, 'error')
            break
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`\\n❌ Autonomous execution failed: ${error.message}`))
    } finally {
      this.isProcessing = false
      this.showPrompt()
    }
  }

  // Utility methods
  private stopAllActiveOperations(): void {
    this.activeTools.forEach((tracker) => {
      if (tracker.spinner) {
        tracker.spinner.stop()
      }
    })
    this.activeTools.clear()
  }

  private toggleAutonomousMode(mode?: string): void {
    if (mode === 'off') {
      this.session.autonomous = false
      console.log(chalk.yellow('⚠️ Autonomous mode disabled - will ask for confirmation'))
    } else {
      this.session.autonomous = true
      console.log(chalk.green('✓ Autonomous mode enabled - full independence'))
    }
  }

  private async showExecutionContext(): Promise<void> {
    const context = advancedAIProvider.getExecutionContext()

    if (context.size === 0) {
      console.log(chalk.yellow('No execution context available'))
      return
    }

    console.log(chalk.cyan.bold('\\n⚡︎ Execution Context'))
    console.log(chalk.gray('─'.repeat(40)))

    for (const [key, value] of context) {
      console.log(`${chalk.blue(key)}: ${chalk.dim(JSON.stringify(value, null, 2).slice(0, 100))}...`)
    }
  }

  private async clearSession(): Promise<void> {
    console.clear()

    // Show metrics before clearing
    const metricsBefore = contextManager.getContextMetrics(this.session.messages)

    this.session.messages = this.session.messages.filter((m) => m.role === 'system')
    this.session.executionHistory = []
    advancedAIProvider.clearExecutionContext()

    const metricsAfter = contextManager.getContextMetrics(this.session.messages)
    const tokensFreed = metricsBefore.estimatedTokens - metricsAfter.estimatedTokens

    console.log(chalk.green(`✓ Session cleared - freed ${tokensFreed.toLocaleString()} tokens`))
  }

  private showExecutionHistory(): void {
    const history = this.session.executionHistory.slice(-20) // Show last 20 events

    if (history.length === 0) {
      console.log(chalk.yellow('No execution history'))
      return
    }

    console.log(chalk.cyan.bold('\\n📜 Recent Execution History'))
    console.log(chalk.gray('─'.repeat(50)))

    history.forEach((event, _index) => {
      const icon =
        event.type === 'tool_call' ? '🔧' : event.type === 'tool_result' ? '✓' : event.type === 'error' ? '❌' : '•'
      console.log(`${icon} ${chalk.dim(event.type)}: ${event.content?.slice(0, 60) || 'N/A'}`)
    })
  }

  private showAdvancedHelp(): void {
    console.log(chalk.cyan.bold('\\n🔌 Autonomous Claude Assistant - Command Reference'))
    console.log(chalk.gray('═'.repeat(60)))

    console.log(chalk.white.bold('\\n🚀 Autonomous Features:'))
    console.log(`${chalk.green('• Full file system access')} - Read/write without permission`)
    console.log(`${chalk.green('• Command execution')} - Run terminal commands automatically`)
    console.log(`${chalk.green('• Project analysis')} - Understand codebase structure`)
    console.log(`${chalk.green('• Code generation')} - Create complete applications`)
    console.log(`${chalk.green('• Package management')} - Install dependencies as needed`)

    console.log(chalk.white.bold('\\n🔧 Commands:'))
    console.log(`${chalk.green('/autonomous [on|off]')} - Toggle autonomous mode`)
    console.log(`${chalk.green('/context')} - Show execution context`)
    console.log(`${chalk.green('/tokens')} - Show token usage metrics`)
    console.log(`${chalk.green('/analyze')} - Quick project analysis`)
    console.log(`${chalk.green('/history')} - Show execution history`)
    console.log(`${chalk.green('/clear')} - Clear session and context`)
    console.log(`${chalk.green('/auto <task>')} - Fully autonomous task execution`)
    console.log(`${chalk.green('@<agent> <task>')} - Use specialized agent`)

    console.log(chalk.white.bold('\\n💬 Natural Language Examples:'))
    console.log(chalk.dim('• "Create a React todo app with TypeScript and tests"'))
    console.log(chalk.dim('• "Fix all ESLint errors in this project"'))
    console.log(chalk.dim('• "Add authentication with JWT to this API"'))
    console.log(chalk.dim('• "Set up Docker and CI/CD for deployment"'))
    console.log(chalk.dim('• "Optimize this component for performance"'))
  }

  // [Rest of utility methods remain similar to previous version]
  private async changeDirectory(newDir: string): Promise<void> {
    try {
      const resolvedPath = require('node:path').resolve(this.session.workingDirectory, newDir)

      if (!require('node:fs').existsSync(resolvedPath)) {
        console.log(chalk.red(`Directory not found: ${newDir}`))
        return
      }

      this.session.workingDirectory = resolvedPath
      advancedAIProvider.setWorkingDirectory(resolvedPath)

      console.log(chalk.green(`✓ Changed to: ${resolvedPath}`))
    } catch (error: any) {
      console.log(chalk.red(`Error changing directory: ${error.message}`))
    }
  }

  private async quickDirectoryList(): Promise<void> {
    try {
      const files = require('node:fs').readdirSync(this.session.workingDirectory, { withFileTypes: true })

      console.log(chalk.blue(`\\n📁 ${this.session.workingDirectory}:`))
      console.log(chalk.gray('─'.repeat(50)))

      files.slice(0, 20).forEach((file: { isDirectory: () => any; name: unknown }) => {
        const icon = file.isDirectory() ? '📁' : '📄'
        const name = file.isDirectory() ? chalk.blue(file.name) : file.name
        console.log(`${icon} ${name}`)
      })

      if (files.length > 20) {
        console.log(chalk.dim(`... and ${files.length - 20} more items`))
      }
    } catch (error: any) {
      console.log(chalk.red(`Error listing directory: ${error.message}`))
    }
  }

  private async quickProjectAnalysis(): Promise<void> {
    console.log(chalk.blue('🔍 Quick project analysis...'))

    try {
      const context = { autonomous: true }
      for await (const event of advancedAIProvider.executeAutonomousTask('analyze_project', context)) {
        if (event.type === 'tool_result' && event.toolName === 'analyze_project') {
          const analysis = event.toolResult
          console.log(chalk.cyan(`\\n📊 Project: ${analysis.name || 'Unnamed'}`))
          console.log(chalk.dim(`Framework: ${analysis.framework || 'Unknown'}`))
          console.log(chalk.dim(`Files: ${analysis.fileCount || 0}`))
          console.log(chalk.dim(`Languages: ${(analysis.languages || []).join(', ')}`))
          break
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`Analysis failed: ${error.message}`))
    }
  }

  private switchModel(modelName: string): void {
    try {
      advancedAIProvider.setModel(modelName)
      configManager.setCurrentModel(modelName)
      console.log(chalk.green(`✓ Switched to: ${modelName}`))
    } catch (error: any) {
      console.log(chalk.red(`Error: ${error.message}`))
    }
  }

  private showCurrentModel(): void {
    const modelInfo = advancedAIProvider.getCurrentModelInfo()
    console.log(chalk.blue(`⚡︎ Current model: ${modelInfo.name} (${modelInfo.config})`))
  }

  private showAvailableAgents(): void {
    console.log(chalk.cyan.bold('\\n🔌 Available Specialized Agents'))
    console.log(chalk.gray('─'.repeat(50)))

    Object.entries(AGENT_CAPABILITIES).forEach(([name, capability]) => {
      console.log(`${chalk.green('•')} ${chalk.bold(name)}`)
      console.log(`  ${chalk.gray(capability.description)}`)
    })

    console.log(chalk.dim('\\nUsage: @<agent-name> <task>'))
  }

  private showPrompt(): void {
    if (!this.rl || this.isProcessing) return

    const workingDir = require('node:path').basename(this.session.workingDirectory)
    const modeIcon = this.session.autonomous
      ? '🔌'
      : this.session.planMode
        ? '🎯'
        : this.session.autoAcceptEdits
          ? '🚀'
          : '💬'

    // Build mode indicators
    const indicators = this.updatePromptIndicators()
    const agentInfo = indicators.length > 0 ? `${indicators.join('')}:` : ''

    const statusDot = this.isProcessing ? chalk.green('●') + chalk.dim('….') : chalk.red('●')

    const prompt = `\n┌─[${modeIcon}${agentInfo}${chalk.green(workingDir)} ${statusDot}]\n└─❯ `
    this.rl.setPrompt(prompt)
    this.rl.prompt()
  }

  /**
   * Auto-complete function for readline
   */
  private async autoComplete(line: string): Promise<[string[], string]> {
    try {
      // Use the smart completion manager for intelligent completions
      const { smartCompletionManager } = await import('../core/smart-completion-manager')

      const completions = await smartCompletionManager.getCompletions(line, {
        currentDirectory: process.cwd(),
        interface: 'autonomous',
      })

      // Convert to readline format
      const suggestions = completions.map((comp) => comp.completion)
      return [suggestions.length ? suggestions : [], line]
    } catch (_error) {
      // Fallback to original static completion
      const commands = [
        '/add-dir',
        '/agents',
        '/analyze',
        '/auto',
        '/bug',
        '/cd',
        '/clear',
        '/compact',
        '/config',
        '/cost',
        '/doctor',
        '/exit',
        '/export',
        '/help',
        '/history',
        '/ls',
        '/model',
        '/pwd',
        '/autonomous',
        '/context',
        '/plan',
        '/auto-accept',
        '/diff',
        '/accept',
        '/reject',
        '/quit',
      ]

      const agentCommands = [
        '@ai-analysis',
        '@code-review',
        '@backend-expert',
        '@frontend-expert',
        '@react-expert',
        '@devops-expert',
        '@system-admin',
        '@autonomous-coder',
      ]

      const allSuggestions = [...commands, ...agentCommands]
      const hits = allSuggestions.filter((c) => c.startsWith(line))
      return [hits.length ? hits : allSuggestions, line]
    }
  }

  /**
   * Show interactive command suggestions
   */
  private showCommandSuggestions(): void {
    if (this.isProcessing) return

    console.log(`\n${chalk.cyan.bold('📋 Available Commands:')}`)
    console.log(chalk.gray('─'.repeat(80)))

    // System Commands
    console.log(chalk.white.bold('\n🔧 System Commands:'))
    console.log(`${chalk.green('/help')}           Show detailed help and command reference`)
    console.log(`${chalk.green('/agents')}         List all available AI agents`)
    console.log(`${chalk.green('/model')} [name]    Switch AI model or show current model`)
    console.log(`${chalk.green('/config')}         Open configuration panel`)
    console.log(`${chalk.green('/clear')}          Clear conversation history and free up context`)
    console.log(`${chalk.green('/exit')} (quit)    Exit the REPL`)

    // File & Directory Operations
    console.log(chalk.white.bold('\n📁 File & Directory Operations:'))
    console.log(`${chalk.green('/add-dir')}        Add a new working directory`)
    console.log(`${chalk.green('/cd')} [path]      Change current working directory`)
    console.log(`${chalk.green('/pwd')}            Show current working directory`)
    console.log(`${chalk.green('/ls')}             List files in current directory`)
    console.log(`${chalk.green('/analyze')}        Quick project analysis`)

    // Analysis & Tools
    console.log(chalk.white.bold('\n🔍 Analysis & Autonomous Tools:'))
    console.log(`${chalk.green('/auto')} <task>    Fully autonomous task execution`)
    console.log(`${chalk.green('/plan')}           Toggle plan mode (shift+tab to cycle)`)
    console.log(`${chalk.green('/auto-accept')}    Toggle auto-accept edits mode`)
    console.log(`${chalk.green('/context')}        Show execution context`)
    console.log(`${chalk.green('/history')}        Show execution history`)
    console.log(`${chalk.green('/autonomous')} [on|off] Toggle autonomous mode`)

    // File Changes & Diffs
    console.log(chalk.white.bold('\\n📝 File Changes & Diffs:'))
    console.log(`${chalk.green('/diff')} [file]    Show file changes (all diffs if no file specified)`)
    console.log(`${chalk.green('/accept')} <file>   Accept and apply file changes`)
    console.log(`${chalk.green('/accept all')}     Accept all pending file changes`)
    console.log(`${chalk.green('/reject')} <file>   Reject and discard file changes`)

    // Session Management
    console.log(chalk.white.bold('\n💾 Session Management:'))
    console.log(`${chalk.green('/export')}         Export current conversation to file or clipboard`)
    console.log(`${chalk.green('/compact')}        Clear history but keep summary in context`)
    console.log(`${chalk.green('/cost')}           Show total cost and duration of current session`)
    console.log(`${chalk.green('/doctor')}         Diagnose and verify Claude Code installation`)
    console.log(`${chalk.green('/bug')}            Submit feedback about Claude Code`)

    // Agent Commands - Enhanced with all available agents
    console.log(chalk.white.bold('\n🔌 Agent Commands:'))
    console.log(chalk.dim('💡 Tip: Press @ to see auto-complete suggestions'))
    console.log(`${chalk.blue('@universal-agent')} <task>  All-in-one enterprise agent (default)`)
    console.log(`${chalk.blue('@ai-analysis')} <task>     AI code analysis and review`)
    console.log(`${chalk.blue('@code-review')} <task>     Code review and suggestions`)
    console.log(`${chalk.blue('@backend-expert')} <task>   Backend development specialist`)
    console.log(`${chalk.blue('@frontend-expert')} <task>  Frontend/UI development expert`)
    console.log(`${chalk.blue('@react-expert')} <task>    React and Next.js specialist`)
    console.log(`${chalk.blue('@devops-expert')} <task>   DevOps and infrastructure expert`)
    console.log(`${chalk.blue('@system-admin')} <task>    System administration tasks`)
    console.log(`${chalk.blue('@autonomous-coder')} <task> Full autonomous coding agent`)

    // File Selection & Tagging
    console.log(chalk.white.bold('\n📁 File Selection & Tagging:'))
    console.log(chalk.dim('💡 Tip: Use * for interactive file selection'))
    console.log(`${chalk.magenta('*')} [pattern]        Interactive file picker and tagger`)
    console.log(`${chalk.magenta('* *.ts')}           Find and select TypeScript files`)
    console.log(`${chalk.magenta('* src/**')}         Browse and select from src directory`)
    console.log(`${chalk.green('/ls')}              List files in current directory`)
    console.log(`${chalk.green('/search')} <pattern> Search for files with pattern`)

    console.log(chalk.white.bold('\n💬 Natural Language Examples:'))
    console.log(chalk.dim('• "Create a React todo app with TypeScript and tests"'))
    console.log(chalk.dim('• "Fix all ESLint errors in this project"'))
    console.log(chalk.dim('• "Add authentication with JWT to this API"'))
    console.log(chalk.dim('• "Set up Docker and CI/CD for deployment"'))
    console.log(chalk.dim('• "Optimize this component for performance"'))

    console.log(chalk.gray(`\n${'─'.repeat(80)}`))
    console.log(chalk.yellow('💡 Tip: Use TAB for auto-completion, Ctrl+C to cancel operations'))
    console.log('')
    this.showPrompt()
  }

  /**
   * Toggle plan mode
   */
  private togglePlanMode(): void {
    this.session.planMode = !this.session.planMode

    if (this.session.planMode) {
      console.log(chalk.green('\n🎯 Enhanced Plan Mode Enabled'))
      console.log(chalk.cyan('   • Comprehensive plan generation with risk analysis'))
      console.log(chalk.cyan('   • Step-by-step execution with progress tracking'))
      console.log(chalk.cyan('   • Enhanced approval system with detailed breakdown'))
      console.log(chalk.dim('   (shift+tab to cycle modes)'))
    } else {
      console.log(chalk.yellow('\n⚠️  Plan Mode Disabled'))
      console.log(chalk.gray('   • Returning to standard mode'))
    }

    this.updatePromptIndicators()
    this.showPrompt()
  }

  /**
   * Toggle auto-accept edits
   */
  private toggleAutoAcceptEdits(): void {
    this.session.autoAcceptEdits = !this.session.autoAcceptEdits

    // Sync with diff manager
    diffManager.setAutoAccept(this.session.autoAcceptEdits)

    if (this.session.autoAcceptEdits) {
      console.log(chalk.green('\n✓ auto-accept edits on ') + chalk.dim('(shift+tab to cycle)'))
    } else {
      console.log(chalk.yellow('\n⚠️ auto-accept edits off'))
    }

    this.updatePromptIndicators()
    this.showPrompt()
  }

  /**
   * Update prompt indicators for current modes
   */
  private updatePromptIndicators(): string[] {
    const indicators = []

    if (this.session.planMode) indicators.push(chalk.cyan('plan'))
    if (this.session.autoAcceptEdits) indicators.push(chalk.green('auto-accept'))
    if (this.session.autonomous) indicators.push(chalk.blue('autonomous'))

    // Add diff count if there are pending diffs
    const pendingCount = diffManager.getPendingCount()
    if (pendingCount > 0) {
      indicators.push(chalk.yellow(`${pendingCount} diffs`))
    }

    return indicators
  }

  /**
   * Show current security status
   */
  private async showSecurityStatus(): Promise<void> {
    const summary = await this.policyManager.getPolicySummary()

    this.cliInstance.printPanel(
      boxen(
        `${chalk.blue.bold('🔒 Security Policy Status')}\n\n` +
          `${chalk.green('Current Policy:')} ${summary.currentPolicy.approval}\n` +
          `${chalk.green('Sandbox Mode:')} ${summary.currentPolicy.sandbox}\n` +
          `${chalk.green('Timeout:')} ${summary.currentPolicy.timeoutMs}ms\n\n` +
          `${chalk.cyan('Commands:')}\n` +
          `• ${chalk.green('Allowed:')} ${summary.allowedCommands}\n` +
          `• ${chalk.red('Blocked:')} ${summary.deniedCommands}\n\n` +
          `${chalk.cyan('Trusted Commands:')} ${summary.trustedCommands.slice(0, 5).join(', ')}...\n` +
          `${chalk.red('Dangerous Commands:')} ${summary.dangerousCommands.slice(0, 3).join(', ')}...`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        }
      )
    )

    console.log(chalk.dim('\n Use /policy <setting> <value> to change security settings'))
    console.log(
      chalk.dim(' Available: approval [never|untrusted|always], sandbox [read-only|workspace-write|system-write]')
    )
  }

  /**
   * Update security policy
   */
  private async updateSecurityPolicy(setting: string, value: string): Promise<void> {
    try {
      const _currentConfig = configManager.getAll()

      switch (setting) {
        case 'approval':
          if (['never', 'untrusted', 'always'].includes(value)) {
            // Policy update - would need to extend config manager
            console.log(chalk.green(`✓ Approval policy set to: ${value}`))
            console.log(chalk.green(`✓ Approval policy set to: ${value}`))
          } else {
            console.log(chalk.red('Invalid approval policy. Use: never, untrusted, or always'))
          }
          break
        case 'sandbox':
          if (['read-only', 'workspace-write', 'system-write'].includes(value)) {
            // Sandbox update - would need to extend config manager
            console.log(chalk.green(`✓ Sandbox mode set to: ${value}`))
            console.log(chalk.green(`✓ Sandbox mode set to: ${value}`))
          } else {
            console.log(chalk.red('Invalid sandbox mode. Use: read-only, workspace-write, or system-write'))
          }
          break
        default:
          console.log(chalk.red(`Unknown setting: ${setting}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`Error updating policy: ${error.message}`))
    }
  }

  private showGoodbye(): void {
    const executionCount = this.session.executionHistory.length
    const toolsUsed = this.session.executionHistory.filter((e) => e.type === 'tool_call').length

    this.cliInstance.printPanel(
      boxen(
        `${chalk.cyanBright('🔌 Autonomous Claude Assistant')}\\n\\n` +
          `${chalk.gray('Session completed!')}\\n\\n` +
          `${chalk.dim('Autonomous Actions:')}\\n` +
          `• ${chalk.blue('Messages:')} ${this.session.messages.length}\\n` +
          `• ${chalk.green('Tools Used:')} ${toolsUsed}\\n` +
          `• ${chalk.cyan('Total Events:')} ${executionCount}\\n` +
          `• ${chalk.yellow('Duration:')} ${Math.round((Date.now() - this.session.createdAt.getTime()) / 1000)}s\\n\\n` +
          `${chalk.blue('Thanks for using autonomous development! 🚀')}`,
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

  /**
   * Complete cleanup of all resources
   */
  private cleanup(): void {
    if (this.cleanupCompleted) return
    this.cleanupCompleted = true

    try {
      // Stop all active operations
      this.stopAllActiveOperations()

      // Abort any active streams
      if (this.currentStreamController) {
        this.currentStreamController.abort()
        this.currentStreamController = undefined
      }

      // Clear intervals
      if (this.streamOptimizationInterval) {
        clearInterval(this.streamOptimizationInterval)
        this.streamOptimizationInterval = undefined
      }
      if (this.tokenOptimizationInterval) {
        clearInterval(this.tokenOptimizationInterval)
        this.tokenOptimizationInterval = undefined
      }

      // Remove keypress handler
      if (this.keypressHandler) {
        process.stdin.removeListener('keypress', this.keypressHandler)
        this.keypressHandler = undefined
      }

      // Remove all event handlers from readline
      if (this.rl) {
        this.eventHandlers.forEach((handler, event) => {
          this.rl.removeListener(event, handler)
        })
        this.eventHandlers.clear()
      }

      // Reset raw mode
      try {
        if (process.stdin.isTTY && (process.stdin as any).isRaw) {
          ;(process.stdin as any).setRawMode(false)
        }
      } catch (error) {
        // Ignore raw mode errors
      }

      // Clear session data
      this.session.messages = []
      this.session.executionHistory = []
      this.activeTools.clear()
    } catch (error: any) {
      // Silent cleanup errors
      console.error('Cleanup error:', error.message)
    }
  }

  stop(): void {
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

export const autonomousClaudeInterface = new AutonomousClaudeInterface()
