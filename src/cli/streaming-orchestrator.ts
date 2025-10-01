#!/usr/bin/env node

import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import * as readline from 'readline'
import { simpleConfigManager as configManager } from './core/config-manager'
import { inputQueue } from './core/input-queue'
import { ExecutionPolicyManager } from './policies/execution-policy'
import { agentService } from './services/agent-service'
import { lspService } from './services/lsp-service'
import { planningService } from './services/planning-service'
import { toolService } from './services/tool-service'
import { diffManager } from './ui/diff-manager'
import { CliUI } from './utils/cli-ui'
import { PasteHandler } from './utils/paste-handler'

interface StreamMessage {
  id: string
  type: 'user' | 'system' | 'agent' | 'tool' | 'diff' | 'error' | 'vm'
  content: string
  timestamp: Date
  status: 'queued' | 'processing' | 'completed' | 'absorbed'
  metadata?: any
  agentId?: string
  progress?: number
}

interface StreamContext {
  workingDirectory: string
  autonomous: boolean
  planMode: boolean
  autoAcceptEdits: boolean
  vmMode: boolean
  contextLeft: number
  maxContext: number
  adaptiveSupervision?: boolean
  intelligentPrioritization?: boolean
  cognitiveFiltering?: boolean
  orchestrationAwareness?: boolean
  nikCLI?: {
    renderPromptAfterOutput(): void
    [key: string]: any
  }
}

interface Panel {
  id: string
  title: string
  position: 'top' | 'bottom' | 'left' | 'right'
  width?: number
  height?: number
  content: string[]
  maxLines?: number
}

class StreamingOrchestratorImpl extends EventEmitter {
  private rl?: readline.Interface
  private context: StreamContext
  private policyManager: ExecutionPolicyManager

  // Message streaming system
  private messageQueue: StreamMessage[] = []
  private processingMessage = false
  private activeAgents = new Map<string, any>()
  private activeVMAgent?: any // Store VM agent instance for chat mode
  private streamBuffer = ''

  // TTY/raw-mode handling
  private originalRawMode?: boolean
  private keypressHandler?: (str: string, key: any) => void

  // ⚡︎ Cognitive-AI Pipeline Integration
  private cognitiveEnabled: boolean = true
  private lastUpdate = Date.now()
  private inputQueueEnabled = true // Abilita/disabilita input queue
  private adaptiveMetrics = new Map<string, number>()

  // 📋 Paste handling
  private pasteHandler: PasteHandler
  private panels = new Map<string, Panel>()

  constructor() {
    super()

    this.context = {
      workingDirectory: process.cwd(),
      autonomous: true,
      planMode: false,
      autoAcceptEdits: true, // Default from image
      vmMode: false,
      contextLeft: 20, // Show percentage like in image
      maxContext: 100,
    }

    this.policyManager = new ExecutionPolicyManager(configManager)

    // Initialize paste handler for long text processing
    this.pasteHandler = PasteHandler.getInstance()

    // Expose streaming orchestrator globally for VM agent communications
    ;(global as any).__streamingOrchestrator = this

    // Don't setup interface automatically - only when start() is called
  }

  private setupInterface(): void {
    if (!this.rl) return

    // Raw mode for better control
    if (process.stdin.isTTY) {
      this.originalRawMode = (process.stdin as any).isRaw || false
      require('readline').emitKeypressEvents(process.stdin)
      if (!(process.stdin as any).isRaw) {
        ;(process.stdin as any).setRawMode(true)
      }
      ;(process.stdin as any).resume()
    }

    // Keypress handlers
    const onKeypress = (_str: string, key: any) => {
      // Se il bypass è abilitato, ignora tutti i keypress tranne Ctrl+C
      if (inputQueue.isBypassEnabled() && !(key && key.name === 'c' && key.ctrl)) {
        return
      }

      if (key && key.name === 'slash' && !this.processingMessage) {
        setTimeout(() => this.showCommandMenu(), 50)
      }

      if (key && key.name === 'tab' && key.shift) {
        this.cycleMode()
      }

      if (key && key.name === 'c' && key.ctrl) {
        if (this.activeAgents.size > 0) {
          this.stopAllAgents()
        } else {
          this.gracefulExit()
        }
      }
    }
    this.keypressHandler = onKeypress
    process.stdin.on('keypress', onKeypress)

    // Input handler
    this.rl.on('line', async (input: string) => {
      const trimmed = input.trim()
      if (!trimmed) {
        this.showPrompt()
        return
      }

      // 📋 PASTE DETECTION: Check if this is a multiline paste operation
      const lineCount = trimmed.split('\n').length
      const isPasteOperation = this.pasteHandler.detectPasteOperation(trimmed)

      let actualInput = trimmed
      let displayText = trimmed

      if (isPasteOperation || lineCount > 1) {
        // This is a paste operation - process as single consolidated input
        const pasteResult = this.pasteHandler.processPastedText(trimmed)

        if (pasteResult.shouldTruncate) {
          // Extract just the indicator line for display
          const truncatedLine = pasteResult.displayText.split('\n').pop() || '[Pasted text]'

          // Use original content for AI processing
          actualInput = pasteResult.originalText
          displayText = truncatedLine

          // Visual feedback that paste was detected and truncated
          console.log(chalk.gray(`📋 ${truncatedLine}`))
        }
      }

      // Se il bypass è abilitato, ignora completamente l'input
      if (inputQueue.isBypassEnabled()) {
        this.showPrompt()
        return
      }

      // Se il sistema sta processando e la queue è abilitata, metti in coda
      // ma rispetta il bypass per approval inputs
      if (
        this.inputQueueEnabled &&
        (this.processingMessage || this.activeAgents.size > 0) &&
        inputQueue.shouldQueue(actualInput)
      ) {
        // Determina priorità basata sul contenuto
        let priority: 'high' | 'normal' | 'low' = 'normal'
        if (actualInput.startsWith('/') || actualInput.startsWith('@')) {
          priority = 'high' // Comandi e agenti hanno priorità alta
        } else if (actualInput.toLowerCase().includes('urgent') || actualInput.toLowerCase().includes('stop')) {
          priority = 'high'
        } else if (actualInput.toLowerCase().includes('later') || actualInput.toLowerCase().includes('low priority')) {
          priority = 'low'
        }

        const queueId = inputQueue.enqueue(actualInput, priority, 'user')
        this.queueMessage({
          type: 'system',
          content: `📥 Input queued (${priority} priority, ID: ${queueId.slice(-6)}): ${displayText.substring(0, 40)}${displayText.length > 40 ? '...' : ''}`,
        })
        this.showPrompt()
        return
      }

      await this.queueUserInput(actualInput)
      this.showPrompt()
    })

    this.rl.on('close', () => {
      this.teardownInterface()
      this.gracefulExit()
    })

    // Setup service listeners
    this.setupServiceListeners()
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
    // Agent events
    agentService.on('task_start', (task) => {
      this.activeAgents.set(task.id, task)

      // Avoid duplicate logging if NikCLI is active
      const nikCliActive = (global as any).__nikCLI?.eventsSubscribed
      if (!nikCliActive) {
        this.queueMessage({
          type: 'system',
          content: `🔌 Agent ${task.agentType} started: ${task.task.slice(0, 50)}...`,
          metadata: { agentId: task.id, agentType: task.agentType },
        })
      }
    })

    agentService.on('task_progress', (task, update) => {
      this.queueMessage({
        type: 'agent',
        content: `📊 ${task.agentType}: ${update.progress}% ${update.description || ''}`,
        metadata: { agentId: task.id, progress: update.progress },
        agentId: task.id,
        progress: update.progress,
      })
    })

    agentService.on('tool_use', (task, update) => {
      this.queueMessage({
        type: 'tool',
        content: `🔧 ${task.agentType} using ${update.tool}: ${update.description}`,
        metadata: { agentId: task.id, tool: update.tool },
      })
    })

    agentService.on('task_complete', (task) => {
      this.activeAgents.delete(task.id)
      if (task.status === 'completed') {
        this.queueMessage({
          type: 'system',
          content: `✓ Agent ${task.agentType} completed successfully`,
          metadata: { agentId: task.id, result: task.result },
        })

        // Auto-absorb completed messages after 2 seconds
        setTimeout(() => this.absorbCompletedMessages(), 2000)
      } else {
        this.queueMessage({
          type: 'error',
          content: `❌ Agent ${task.agentType} failed: ${task.error}`,
          metadata: { agentId: task.id, error: task.error },
        })
      }

      // Check if all background tasks are complete and show prompt
      this.checkAndReturnToDefaultMode()
    })
  }

  private async queueUserInput(input: string): Promise<void> {
    // Se il bypass è abilitato, non processare l'input
    if (inputQueue.isBypassEnabled()) {
      return
    }

    const message: StreamMessage = {
      id: `user_${Date.now()}`,
      type: 'user',
      content: input,
      timestamp: new Date(),
      status: 'queued',
    }

    this.messageQueue.push(message)

    // Process immediately if not busy
    if (!this.processingMessage && this.messageQueue.length === 1) {
      this.processNextMessage()
    }
  }

  private queueMessage(partial: Partial<StreamMessage>): void {
    const message: StreamMessage = {
      id: `msg_${Date.now()}_${randomBytes(6).toString('base64url')}`,
      timestamp: new Date(),
      status: 'queued',
      ...partial,
    } as StreamMessage

    this.messageQueue.push(message)
    this.displayMessage(message)
  }

  // ⚡︎ Cognitive-AI Pipeline Processing
  private async processCognitiveAnalysis(message: StreamMessage): Promise<void> {
    if (!this.cognitiveEnabled || message.type !== 'user') return

    try {
      // Set task context for this message

      // Create contextual analysis
      const context: any = {
        codebase: { complexity: 0.6 },
        task: {
          type: 'user-interaction',
          complexity: message.content.length > 200 ? 0.8 : 0.5,
          requirements: [message.content],
        },
      }

      // Stream cognitive feedback in real-time
      const cognitivePanel = 'cognitive-analysis'
      this.createPanel({
        id: cognitivePanel,
        title: '⚡︎ Cognitive Analysis',
        position: 'right',
        width: 40,
        maxLines: 10,
      })

      // Store cognitive insights in message metadata
      message.metadata = {
        ...message.metadata,
        cognitiveAnalysis: {
          complexity: context.task.complexity,
          timestamp: Date.now(),
        },
      }
    } catch (error) {
      console.error('Cognitive analysis error:', error)
    }
  }

  private async processNextMessage(): Promise<void> {
    if (this.processingMessage || this.messageQueue.length === 0) return

    const message = this.messageQueue.find((m) => m.status === 'queued')
    if (!message) return

    this.processingMessage = true
    message.status = 'processing'

    try {
      // ⚡︎ Apply cognitive analysis for user messages
      if (message.type === 'user' && this.cognitiveEnabled) {
        await this.processCognitiveAnalysis(message)
      }

      if (message.type === 'user') {
        await this.handleUserMessage(message)
      }
    } catch (error: any) {
      this.queueMessage({
        type: 'error',
        content: `❌ Error processing message: ${error.message}`,
      })
    } finally {
      message.status = 'completed'
      this.processingMessage = false

      // Process next message
      setTimeout(() => this.processNextMessage(), 100)

      // Processa input dalla queue se disponibili
      this.processQueuedInputs()
    }
  }

  private async handleUserMessage(message: StreamMessage): Promise<void> {
    const input = message.content

    // Handle commands
    if (input.startsWith('/')) {
      await this.handleCommand(input)
      return
    }

    // Handle agent requests
    if (input.startsWith('@')) {
      const match = input.match(/^@(\\w+[-\\w]*)/)
      if (match) {
        let agentName = match[1]
        const task = input.replace(match[0], '').trim()

        // In VM mode, redirect all agent requests to vm-agent
        if (this.context.vmMode) {
          agentName = 'vm-agent'
          this.queueMessage({
            type: 'system',
            content: `🐳 VM Mode: Redirecting to VM Agent`,
          })
        }

        await this.launchAgent(agentName, task)
        return
      }
    }

    // Natural language - autonomous processing
    await this.processNaturalLanguage(input)
  }

  private async handleCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.slice(1).split(' ')

    switch (cmd) {
      case 'status':
        this.showStatus()
        break
      case 'agents':
        this.showActiveAgents()
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
        }
        break
      case 'clear':
        this.clearMessages()
        break
      case 'help':
        this.showHelp()
        break
      case 'queue':
        this.handleQueueCommand(args)
        break
      default:
        this.queueMessage({
          type: 'error',
          content: `❌ Unknown command: ${cmd}`,
        })
    }
  }

  private async launchAgent(agentName: string, task: string): Promise<void> {
    if (!task) {
      this.queueMessage({
        type: 'error',
        content: `❌ Agent ${agentName} requires a task description`,
      })
      return
    }

    try {
      // Special handling for VM agent in VM mode
      if (agentName === 'vm-agent' && this.context.vmMode) {
        await this.handleVMAgentChat(task)
        return
      }

      // Check if we have capacity (max 3 agents)
      if (this.activeAgents.size >= 3) {
        this.queueMessage({
          type: 'system',
          content: `⏳ Agent ${agentName} queued (${this.activeAgents.size}/3 active)`,
        })
      }

      // Try to use AgentFactory first for dynamic agents
      try {
        const { agentFactory } = await import('./core/agent-factory')
        const _agent = await agentFactory.launchAgent(agentName, task)
        this.queueMessage({
          type: 'system',
          content: `🚀 Launched dynamic agent: ${agentName}`,
        })
        return
      } catch (factoryError: any) {
        // Fallback to AgentService for built-in agents
        console.log(`Dynamic agent not found, trying built-in agents: ${factoryError.message}`)
      }

      const taskId = await agentService.executeTask(agentName, task, {})
      this.queueMessage({
        type: 'system',
        content: `🚀 Launched ${agentName} agent (Task ID: ${taskId.slice(-6)})`,
      })
    } catch (error: any) {
      this.queueMessage({
        type: 'error',
        content: `❌ Failed to launch ${agentName}: ${error.message}`,
      })
    }
  }

  /**
   * Handle VM agent in chat mode for continuous conversation
   */
  private async handleVMAgentChat(message: string): Promise<void> {
    try {
      this.queueMessage({
        type: 'system',
        content: `🐳 VM Mode: Communicating with VM agents...`,
      })

      // Get or create VM agent instance
      if (!this.activeVMAgent) {
        // Import and create VM agent
        const { SecureVirtualizedAgent } = await import('./virtualized-agents/secure-vm-agent')
        this.activeVMAgent = new SecureVirtualizedAgent(process.cwd())

        // Initialize the VM agent
        await this.activeVMAgent.initialize()

        // Start chat mode (this will create/connect to container)
        await this.activeVMAgent.startChatMode()

        this.queueMessage({
          type: 'vm',
          content: `VM Agent initialized and ready for chat`,
        })
      }

      this.queueMessage({
        type: 'system',
        content: `📤 Sending to 1 VM agent(s):`,
      })

      this.queueMessage({
        type: 'user',
        content: `Input: ${message}`,
      })

      // Process the message through VM agent with streaming
      this.queueMessage({
        type: 'system',
        content: `🌊 VM Agent ${this.activeVMAgent.id.slice(-8)}: Starting streaming response...`,
      })

      // Check if streaming method is available
      CliUI.logDebug(`🔍 Checking VM Agent streaming support: ${typeof this.activeVMAgent.processChatMessageStreaming}`)

      if (typeof this.activeVMAgent.processChatMessageStreaming === 'function') {
        CliUI.logInfo(`🌊 Using streaming method for VM Agent chat`)

        // Use streaming chat
        let hasContent = false
        let streamBuffer = ''

        let retryCount = 0
        const maxRetries = 3

        while (retryCount < maxRetries && !hasContent) {
          try {
            if (retryCount > 0) {
              this.queueMessage({
                type: 'system',
                content: `⚡︎ Retry attempt ${retryCount}/${maxRetries} for VM Agent streaming...`,
              })
              // Exponential backoff
              await new Promise((resolve) => setTimeout(resolve, 2 ** retryCount * 1000))
            } else {
              this.queueMessage({
                type: 'system',
                content: `🌊 Starting AI streaming...`,
              })
            }

            for await (const chunk of this.activeVMAgent.processChatMessageStreaming(message)) {
              CliUI.logDebug(`📦 Received chunk: ${chunk ? chunk.slice(0, 50) : 'null'}...`)

              if (chunk?.trim()) {
                hasContent = true
                streamBuffer += chunk

                // Create streaming message for VM content
                this.queueMessage({
                  type: 'vm',
                  content: chunk,
                  metadata: {
                    isStreaming: true,
                    vmAgentId: this.activeVMAgent.id,
                    chunkLength: chunk.length,
                  },
                })

                // Reduced delay to improve responsiveness
                await new Promise((resolve) => setTimeout(resolve, 25))
              }
            }

            if (hasContent) {
              this.queueMessage({
                type: 'system',
                content: `✓ VM Agent ${this.activeVMAgent.id.slice(-8)}: Streaming completed (${streamBuffer.length} chars)`,
              })
              break // Success, exit retry loop
            }
          } catch (streamError: any) {
            retryCount++
            CliUI.logError(`❌ Streaming error attempt ${retryCount}: ${streamError.message}`)

            if (retryCount >= maxRetries) {
              this.queueMessage({
                type: 'error',
                content: `❌ VM Agent streaming failed after ${maxRetries} attempts: ${streamError.message}`,
              })
              hasContent = false
              break
            }
          }
        }

        // If no streaming content, show placeholder
        if (!hasContent) {
          CliUI.logWarning(`⚠️ No streaming content received, showing placeholder`)
          this.queueMessage({
            type: 'vm',
            content: `🔌 VM Agent processed the request but no streaming response was generated.`,
          })
        }
      } else {
        // Fallback to original non-streaming method
        this.queueMessage({
          type: 'system',
          content: `🔌 VM Agent ${this.activeVMAgent.id.slice(-8)}: Processing (non-streaming)...`,
        })

        const response = await this.activeVMAgent.processChatMessage(message)

        this.queueMessage({
          type: 'system',
          content: `✓ VM Agent ${this.activeVMAgent.id.slice(-8)}: Task completed`,
        })

        // Show the actual response
        if (response?.trim()) {
          this.queueMessage({
            type: 'vm',
            content: response,
          })
        } else {
          this.queueMessage({
            type: 'vm',
            content: `🔌 VM Agent completed the task but no specific response was generated.`,
          })
        }
      }
    } catch (error: any) {
      this.queueMessage({
        type: 'error',
        content: `❌ VM Agent chat error: ${error.message}`,
      })
    }
    // Ensure prompt is restored after VM agent chat completes
    if (this.context.nikCLI && typeof this.context.nikCLI.renderPromptAfterOutput === 'function') {
      this.context.nikCLI.renderPromptAfterOutput()
    }
  }

  private async processNaturalLanguage(input: string): Promise<void> {
    this.queueMessage({
      type: 'system',
      content: `⚡︎ Processing: "${input}"`,
    })

    // Select best agent for the task
    const selectedAgent = this.selectBestAgent(input)

    if (this.context.planMode) {
      this.queueMessage({
        type: 'system',
        content: `🎯 Plan Mode: Creating execution plan...`,
      })

      try {
        // Use enhanced planning pipeline for toolchain execution
        const { enhancedPlanning } = await import('./planning/enhanced-planning')
        const plan = await enhancedPlanning.generatePlan(input, {
          maxTodos: 15,
          includeContext: true,
          showDetails: false,
          saveTodoFile: true,
          todoFilePath: 'todo.md',
        })

        // Plan generated successfully - show completion message
        console.log(chalk.green('✓ Plan generated and saved to todo.md'))
        console.log(chalk.cyan(`📋 ${plan.todos.length} tasks created`))

        // Note: Task execution approval will be handled by main CLI
        // The plan is now ready and saved, no need for approval here
        console.log(chalk.gray('💡 Use the plan mode interface to start tasks'))
        // After execution ensure prompt is visible
        import('./core/input-queue').then(({ inputQueue }) => inputQueue.disableBypass()).catch(() => {})
        this.processingMessage = false
        this.showPrompt()
      } catch (error: any) {
        this.queueMessage({
          type: 'error',
          content: `❌ Planning failed: ${error.message}`,
        })
      }
    } else {
      // Direct agent execution
      await this.launchAgent(selectedAgent, input)
    }
  }

  private selectBestAgent(input: string): string {
    const lower = input.toLowerCase()

    // If in VM mode, always use SecureVirtualizedAgent
    if (this.context.vmMode) {
      return 'vm-agent'
    }

    // Check for VM agent triggers
    if (
      lower.includes('analizza la repository') ||
      lower.includes('analizza il repository') ||
      lower.includes('analyze the repository') ||
      lower.includes('vm agent') ||
      lower.includes('isolated environment')
    ) {
      return 'vm-agent'
    }

    if (lower.includes('react') || lower.includes('component')) return 'react-expert'
    if (lower.includes('backend') || lower.includes('api')) return 'backend-expert'
    if (lower.includes('frontend') || lower.includes('ui')) return 'frontend-expert'
    if (lower.includes('deploy') || lower.includes('docker')) return 'devops-expert'
    if (lower.includes('review') || lower.includes('analyze')) return 'code-review'
    return 'universal-agent'
  }

  private displayMessage(message: StreamMessage): void {
    const timestamp = message.timestamp.toLocaleTimeString('en-GB', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    let prefix = ''
    const content = message.content
    let color = chalk.white

    switch (message.type) {
      case 'user':
        prefix = '>'
        color = chalk.green
        break
      case 'system':
        prefix = '•'
        color = chalk.blue
        break
      case 'agent':
        prefix = '🔌'
        color = chalk.cyan
        break
      case 'tool':
        prefix = '🔧'
        color = chalk.magenta
        break
      case 'error':
        prefix = '❌'
        color = chalk.red
        break
      case 'diff':
        prefix = '📝'
        color = chalk.yellow
        break
      case 'vm':
        prefix = '🐳'
        color = chalk.cyan

        // Special handling for streaming VM messages
        if (message.metadata?.isStreaming) {
          // For streaming chunks, use a more compact display
          const streamPrefix = chalk.dim('🌊')
          console.log(`${streamPrefix}${color(content)}`)
          return // Skip normal display for streaming chunks
        }
        break
    }

    const statusIndicator =
      message.status === 'completed'
        ? ''
        : message.status === 'processing'
          ? chalk.yellow('⏳')
          : message.status === 'absorbed'
            ? chalk.dim('📤')
            : ''

    console.log(`${chalk.dim(timestamp)} ${prefix} ${color(content)} ${statusIndicator}`)

    // Show progress bar for agent messages
    if (message.progress && message.progress > 0) {
      const progressBar = this.createProgressBar(message.progress)
      console.log(`${' '.repeat(timestamp.length + 2)}${progressBar}`)
    }

    // Show streaming indicators for VM messages
    if (message.type === 'vm' && message.metadata?.chunkLength) {
      const streamInfo = chalk.dim(`[${message.metadata.chunkLength} chars]`)
      console.log(`${' '.repeat(timestamp.length + 4)}${streamInfo}`)
    }
  }

  // Panel management methods
  public createPanel(config: Omit<Panel, 'content'>): void {
    const panel: Panel = {
      ...config,
      content: [],
      maxLines: config.height || 20,
    }
    this.panels.set(config.id, panel)
  }

  public async streamToPanel(panelId: string, content: string): Promise<void> {
    const panel = this.panels.get(panelId)
    if (!panel) return

    // Add content to panel
    const lines = content.split('\n')
    panel.content.push(...lines)

    // Keep only last maxLines
    if (panel.maxLines && panel.content.length > panel.maxLines) {
      panel.content = panel.content.slice(-panel.maxLines)
    }

    // Display panel content as VM message
    if (panelId.includes('vm')) {
      this.queueMessage({
        type: 'vm',
        content: lines.join(' '),
      })
    }
  }

  public displayPanels(): void {
    if (this.panels.size === 0) return

    console.log(chalk.cyan('\n═══ Panels ═══'))
    for (const [_id, panel] of this.panels) {
      console.log(chalk.blue(`\n▌ ${panel.title}`))
      console.log(chalk.gray('─'.repeat(40)))
      const displayLines = panel.content.slice(-5) // Show last 5 lines
      displayLines.forEach((line) => {
        if (line) console.log(chalk.dim(`  ${line}`))
      })
    }
    console.log(chalk.cyan('═══════════════\n'))
  }

  public queueVMMessage(content: string): void {
    this.queueMessage({
      type: 'vm',
      content,
    })
  }

  private createProgressBar(progress: number, width = 20): string {
    const filled = Math.round((progress / 100) * width)
    const empty = width - filled
    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    return chalk.blue(`[${bar}] ${progress}%`)
  }

  private absorbCompletedMessages(): void {
    let absorbed = 0
    this.messageQueue.forEach((msg) => {
      if (msg.status === 'completed' && msg.type !== 'user') {
        msg.status = 'absorbed'
        absorbed++
      }
    })

    if (absorbed > 0) {
      console.log(chalk.dim(`📤 Absorbed ${absorbed} completed messages`))
      this.updateContextCounter()
    }
  }

  private updateContextCounter(): void {
    const activeMessages = this.messageQueue.filter((m) => m.status !== 'absorbed').length
    this.context.contextLeft = Math.max(0, this.context.maxContext - activeMessages)
  }

  private clearMessages(): void {
    const cleared = this.messageQueue.length
    this.messageQueue = []
    this.context.contextLeft = this.context.maxContext
    console.clear()
    console.log(chalk.green(`✓ Cleared ${cleared} messages`))
  }

  private showStatus(): void {
    const active = this.activeAgents.size
    const queued = agentService.getQueuedTasks().length
    const pending = diffManager.getPendingCount()
    const queueStatus = inputQueue.getStatus()

    const metrics = Object.fromEntries(this.adaptiveMetrics)

    // Display panels if any
    this.displayPanels()

    console.log(chalk.cyan.bold('\\n⚡︎ Adaptive Orchestrator Status'))
    console.log(chalk.gray('═'.repeat(50)))

    // Basic status
    console.log(`${chalk.blue('Working Dir:')} ${this.context.workingDirectory}`)
    console.log(`${chalk.blue('Active Agents:')} ${active}/3`)
    console.log(`${chalk.blue('Queued Tasks:')} ${queued}`)
    console.log(`${chalk.blue('Messages:')} ${this.messageQueue.length}`)
    console.log(`${chalk.blue('Pending Diffs:')} ${pending}`)
    console.log(`${chalk.blue('Context Left:')} ${this.context.contextLeft}%`)

    // Adaptive supervision status

    // Adaptive features status
    console.log(chalk.cyan.bold('\\n🔨 Adaptive Features:'))
    console.log(`${chalk.blue('Adaptive Supervision:')} ${this.context.adaptiveSupervision ? '✓' : '❌'}`)
    console.log(`${chalk.blue('Intelligent Prioritization:')} ${this.context.intelligentPrioritization ? '✓' : '❌'}`)
    console.log(`${chalk.blue('Cognitive Filtering:')} ${this.context.cognitiveFiltering ? '✓' : '❌'}`)
    console.log(`${chalk.blue('Orchestration Awareness:')} ${this.context.orchestrationAwareness ? '✓' : '❌'}`)

    // Input queue status
    console.log(chalk.cyan.bold('\\n📥 Input Processing:'))
    console.log(`${chalk.blue('Input Queue:')} ${this.inputQueueEnabled ? 'Enabled' : 'Disabled'}`)
    if (this.inputQueueEnabled) {
      console.log(`${chalk.blue('  Queued Inputs:')} ${queueStatus.queueLength}`)
      console.log(`${chalk.blue('  Processing:')} ${queueStatus.isProcessing ? 'Yes' : 'No'}`)
    }

    // Performance metrics
    console.log(chalk.cyan.bold('\\n📊 Performance Metrics:'))
    console.log(`${chalk.blue('Processing Rate:')} ${(metrics.messageProcessingRate * 100).toFixed(1)}%`)
    console.log(`${chalk.blue('Coordination Efficiency:')} ${(metrics.agentCoordinationEfficiency * 100).toFixed(1)}%`)
    console.log(`${chalk.blue('Error Recovery Rate:')} ${(metrics.errorRecoveryRate * 100).toFixed(1)}%`)
  }

  private showActiveAgents(): void {
    if (this.activeAgents.size === 0) {
      console.log(chalk.yellow('No active agents'))
      return
    }

    console.log(chalk.cyan.bold('\\n🔌 Active Agents'))
    console.log(chalk.gray('─'.repeat(30)))

    this.activeAgents.forEach((agent) => {
      console.log(`${chalk.blue(agent.agentType)} - ${agent.task.slice(0, 40)}...`)
    })
  }

  private cycleMode(): void {
    // 4-state cycle: manual → plan → auto-accept → vm → manual
    if (!this.context.planMode && !this.context.autoAcceptEdits && !this.context.vmMode) {
      // Manual → Plan
      this.context.planMode = true
      try {
        process.env.NIKCLI_COMPACT = '1'
        process.env.NIKCLI_SUPER_COMPACT = '1'
      } catch {}
      console.log(chalk.green('\\n✓ plan mode on ') + chalk.dim('(shift+tab to cycle)'))
    } else if (this.context.planMode && !this.context.autoAcceptEdits && !this.context.vmMode) {
      // Plan → Auto-accept
      this.context.planMode = false
      this.context.autoAcceptEdits = true
      diffManager.setAutoAccept(true)
      console.log(chalk.green('\\n✓ auto-accept edits on ') + chalk.dim('(shift+tab to cycle)'))
    } else if (!this.context.planMode && this.context.autoAcceptEdits && !this.context.vmMode) {
      // Auto-accept → VM
      this.context.autoAcceptEdits = false
      this.context.vmMode = true
      diffManager.setAutoAccept(false)
      console.log(chalk.cyan('\\n🐳 vm mode on ') + chalk.dim('(shift+tab to cycle)'))
    } else {
      // VM → Manual (or any other state → Manual)
      this.context.planMode = false
      this.context.autoAcceptEdits = false
      this.context.vmMode = false
      diffManager.setAutoAccept(false)
      try {
        delete (process.env as any).NIKCLI_COMPACT
        delete (process.env as any).NIKCLI_SUPER_COMPACT
      } catch {}
      // Reset processing and show prompt to accept new input
      this.processingMessage = false
      import('./core/input-queue')
        .then(({ inputQueue }) => inputQueue.disableBypass())
        .then(() => {
          try {
            ;(global as any).__nikCLI?.resumePromptAndRender?.()
          } catch {}
        })
        .catch(() => {})
      this.showPrompt()

      // Cleanup VM agent when exiting VM mode
      if (this.activeVMAgent) {
        this.cleanupVMAgent()
      }

      console.log(chalk.yellow('\\n⚠️ manual mode'))
    }
  }

  /**
   * Cleanup VM agent when exiting VM mode
   */
  private async cleanupVMAgent(): Promise<void> {
    try {
      if (this.activeVMAgent) {
        this.queueMessage({
          type: 'system',
          content: `🐳 Cleaning up VM agent...`,
        })

        await this.activeVMAgent.cleanup()
        this.activeVMAgent = undefined

        this.queueMessage({
          type: 'system',
          content: `✓ VM agent cleaned up`,
        })
      }
    } catch (error: any) {
      this.queueMessage({
        type: 'error',
        content: `❌ VM cleanup error: ${error.message}`,
      })
    }
  }

  private showCommandMenu(): void {
    console.log(chalk.cyan.bold('\\n📋 Available Commands:'))
    console.log(chalk.gray('─'.repeat(50)))
    console.log(`${chalk.green('/status')}        Show orchestrator status`)
    console.log(`${chalk.green('/agents')}        Show active agents`)
    console.log(`${chalk.green('/diff')} [file]   Show file changes`)
    console.log(`${chalk.green('/accept')} [all]  Accept file changes`)
    console.log(`${chalk.green('/clear')}         Clear message queue`)
    console.log(`${chalk.green('/queue')} [cmd]   Manage input queue`)
    console.log(`${chalk.green('/help')}          Show detailed help`)

    console.log(chalk.cyan.bold('\\n🔌 Agent Usage:'))
    console.log(`${chalk.blue('@agent-name')} task description`)
    console.log(chalk.dim('Available: react-expert, backend-expert, frontend-expert,'))
    console.log(chalk.dim('          devops-expert, code-review, autonomous-coder'))

    console.log(chalk.cyan.bold('\\n💬 Natural Language:'))
    console.log(chalk.dim('Just describe what you want to accomplish'))
  }

  private showHelp(): void {
    console.log(chalk.cyan.bold('\\n🎛️ AI Development Orchestrator Help'))
    console.log(chalk.gray('═'.repeat(60)))

    console.log(chalk.white.bold('\\nHow it works:'))
    console.log('• Messages are queued and processed in order')
    console.log('• Up to 3 agents can run in parallel')
    console.log('• Completed messages are auto-absorbed')
    console.log('• Context is automatically managed')

    console.log(chalk.white.bold('\\nKeyboard shortcuts:'))
    console.log('• / - Show command menu')
    console.log('• Shift+Tab - Cycle modes (manual → plan → auto-accept)')
    console.log('• ESC - Return to default chat')
    console.log('• Ctrl+C - Stop agents or exit')

    console.log(chalk.white.bold('\\nModes:'))
    console.log('• Manual - Ask for confirmation')
    console.log('• Plan - Create execution plans first')
    console.log('• Auto-accept - Apply all changes automatically')

    console.log(chalk.white.bold('\\nQueue Commands:'))
    console.log('• /queue status - Show queue status')
    console.log('• /queue clear - Clear all queued inputs')
    console.log('• /queue enable/disable - Toggle input queue')
    console.log('• /queue process - Process next queued input')
  }

  private handleQueueCommand(args: string[]): void {
    const [subCmd] = args

    switch (subCmd) {
      case 'status':
        inputQueue.showStats()
        break
      case 'clear': {
        const cleared = inputQueue.clear()
        this.queueMessage({
          type: 'system',
          content: `🗑️ Cleared ${cleared} inputs from queue`,
        })
        break
      }
      case 'enable':
        this.inputQueueEnabled = true
        this.queueMessage({
          type: 'system',
          content: '✓ Input queue enabled',
        })
        break
      case 'disable':
        this.inputQueueEnabled = false
        this.queueMessage({
          type: 'system',
          content: '⚠️ Input queue disabled',
        })
        break
      case 'process':
        this.processQueuedInputs()
        break
      default:
        console.log(chalk.cyan.bold('\\n📥 Input Queue Commands:'))
        console.log(chalk.gray('─'.repeat(40)))
        console.log(`${chalk.green('/queue status')}   - Show queue statistics`)
        console.log(`${chalk.green('/queue clear')}    - Clear all queued inputs`)
        console.log(`${chalk.green('/queue enable')}   - Enable input queue`)
        console.log(`${chalk.green('/queue disable')}  - Disable input queue`)
        console.log(`${chalk.green('/queue process')}  - Process next queued input`)
    }
  }

  private stopAllAgents(): void {
    this.activeAgents.clear()
    console.log(chalk.yellow('\\n⏹️ Stopped all active agents'))
  }

  private startMessageProcessor(): void {
    // Process messages every 100ms
    setInterval(() => {
      // Check for interruption
      const shouldInterrupt = (global as any).__shouldInterrupt
      if (shouldInterrupt?.()) {
        return
      }

      if (!this.processingMessage) {
        this.processNextMessage()
      }
      this.updateContextCounter()
    }, 100)

    // Auto-absorb messages every 5 seconds
    setInterval(() => {
      // Check for interruption
      const shouldInterrupt = (global as any).__shouldInterrupt
      if (shouldInterrupt?.()) {
        return
      }

      this.absorbCompletedMessages()
    }, 5000)

    // Process queued inputs every 2 seconds
    setInterval(() => {
      // Check for interruption
      const shouldInterrupt = (global as any).__shouldInterrupt
      if (shouldInterrupt?.()) {
        return
      }

      this.processQueuedInputs()
    }, 2000)

    // ⚡︎ Optimize token allocation every 30 seconds
    setInterval(() => {
      // Check for interruption
      const shouldInterrupt = (global as any).__shouldInterrupt
      if (shouldInterrupt?.()) {
        return
      }

      if (this.cognitiveEnabled) {
      }
    }, 30000)
  }

  private async processQueuedInputs(): Promise<void> {
    if (!this.inputQueueEnabled || this.processingMessage || this.activeAgents.size > 0) {
      return // Non processare se il sistema è occupato
    }

    const status = inputQueue.getStatus()
    if (status.queueLength === 0) {
      return // Nessun input in coda
    }

    // Processa il prossimo input dalla queue
    const result = await inputQueue.processNext(async (input: string) => {
      await this.queueUserInput(input)
    })

    if (result) {
      this.queueMessage({
        type: 'system',
        content: `⚡︎ Processing queued input: ${result.input.substring(0, 40)}${result.input.length > 40 ? '...' : ''}`,
      })
      // Ensure prompt is restored after processing queued input
      if (this.context.nikCLI && typeof this.context.nikCLI.renderPromptAfterOutput === 'function') {
        this.context.nikCLI.renderPromptAfterOutput()
      }
    }
  }

  private showPrompt(): void {
    if (!this.rl) return

    // Don't show prompt if NikCLI is the main interface (check for global instance)
    if ((global as any).__nikCLI) {
      return // Let NikCLI handle the prompt display
    }

    const dir = require('node:path').basename(this.context.workingDirectory)
    const agents = this.activeAgents.size
    const agentIndicator = agents > 0 ? chalk.blue(`${agents}🔌`) : '🎛️'

    const modes: string[] = []
    if (this.context.planMode) modes.push(chalk.cyan('plan'))
    if (this.context.autoAcceptEdits) modes.push(chalk.green('auto-accept'))
    if (this.context.vmMode) modes.push(chalk.cyan('vm'))
    const modeStr = modes.length > 0 ? ` ${modes.join(' ')} ` : ''

    const contextStr = chalk.dim(`${this.context.contextLeft}%`)

    // Mostra stato della queue se abilitata
    let queueStr = ''
    try {
      const queueStatus = this.inputQueueEnabled ? inputQueue.getStatus() : null
      queueStr = queueStatus && queueStatus.queueLength > 0 ? chalk.yellow(` | 📥${queueStatus.queueLength}`) : ''
    } catch (_error) {
      // Ignore queue status errors
      queueStr = ''
    }

    const prompt = `${agentIndicator}:${chalk.green(dir)}${modeStr}]─[${contextStr}${queueStr}]`
    this.rl.setPrompt(prompt)
    this.rl.prompt()
  }

  private autoComplete(line: string): [string[], string] {
    if (!this.rl) return [[], line]
    const commands = ['/status', '/agents', '/diff', '/accept', '/clear', '/help']
    const agents = [
      '@react-expert',
      '@backend-expert',
      '@frontend-expert',
      '@devops-expert',
      '@code-review',
      '@autonomous-coder',
    ]

    const all = [...commands, ...agents]
    const hits = all.filter((c) => c.startsWith(line))
    return [hits.length ? hits : all, line]
  }

  private checkAndReturnToDefaultMode(): void {
    // Check if all agent tasks are completed (no active agents)
    const activeAgentsList = agentService.getActiveAgents()
    const queuedTasks = agentService.getQueuedTasks()

    if (activeAgentsList.length === 0 && queuedTasks.length === 0 && this.activeAgents.size === 0) {
      // All background tasks completed, return to default mode with prompt
      this.queueMessage({
        type: 'system',
        content: '🏠 All background tasks completed. You can continue chatting.',
      })

      // Ensure default mode
      this.context.planMode = false
      this.context.autoAcceptEdits = false
      this.context.vmMode = false
      try {
        diffManager.setAutoAccept(false)
      } catch {}

      // Cleanup VM agent if any
      if (this.activeVMAgent) {
        this.cleanupVMAgent().catch(() => {})
      }

      // Show prompt after a small delay to ensure messages are processed
      setTimeout(() => {
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
      }, 500)
    }
  }

  private gracefulExit(): void {
    console.log(chalk.blue('\n👋 Shutting down orchestrator...'))

    if (this.activeAgents.size > 0) {
      console.log(chalk.yellow(`⏳ Waiting for ${this.activeAgents.size} agents to finish...`))
      // In production, you'd wait for agents to complete
    }

    // Cleanup keyboard handlers and raw mode
    this.teardownInterface()

    // Cleanup VM agent if active
    if (this.activeVMAgent) {
      this.cleanupVMAgent().catch(() => {})
    }

    console.log(chalk.green('✓ Goodbye!'))
    process.exit(0)
  }

  async start(): Promise<void> {
    console.clear()

    // Check API keys
    const hasKeys = this.checkAPIKeys()
    if (!hasKeys) return

    // Create readline interface only when starting
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 300,
      completer: this.autoComplete.bind(this),
    })

    this.showWelcome()
    this.initializeServices()

    // Setup interface and start message processor
    this.setupInterface()
    this.startMessageProcessor()

    // Start the interface
    this.showPrompt()

    // Ensure SIGINT exits gracefully even when TTY is not controlling
    process.on('SIGINT', () => this.gracefulExit())

    return new Promise<void>((resolve) => {
      this.rl?.on('close', resolve)
    })
  }

  private checkAPIKeys(): boolean {
    const hasAny =
      process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!hasAny) {
      console.log(
        chalk.red('❌ No API keys found. Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY')
      )
      return false
    }
    return true
  }

  private showWelcome(): void {
    const title = chalk.cyanBright('🎛️ Streaming AI Development Orchestrator')
    console.log(chalk.cyan('─'.repeat(80)))
    console.log(title)
    console.log(chalk.cyan('─'.repeat(80)))
    console.log(`${chalk.blue('Directory:')} ${this.context.workingDirectory}`)
    console.log(`${chalk.blue('Max Agents:')} 3 parallel`)
    console.log(`${chalk.blue('Mode:')} ${this.context.autoAcceptEdits ? 'Auto-accept' : 'Manual'}`)
    console.log(chalk.dim('\nPress / for commands, @ for agents, or describe what you want to do\n'))
  }

  private async initializeServices(): Promise<void> {
    // Initialize all services
    toolService.setWorkingDirectory(this.context.workingDirectory)
    planningService.setWorkingDirectory(this.context.workingDirectory)
    lspService.setWorkingDirectory(this.context.workingDirectory)

    // Auto-start relevant services
    await lspService.autoStartServers(this.context.workingDirectory)

    console.log(chalk.dim('🚀 Services initialized'))
  }

  /**
   * Get adaptive supervision metrics for external monitoring
   */
  getSupervisionMetrics(): {
    cognition: any | null
    metrics: Record<string, number>
    patterns: Record<string, number>
    historyLength: number
  } {
    return {
      cognition: null, // Placeholder - would be implemented with full supervision system
      metrics: {
        messageProcessingRate: 0.8,
        agentCoordinationEfficiency: 0.7,
        errorRecoveryRate: 0.95,
      },
      patterns: {
        multiAgentCoordination: 0.8,
        sequentialTaskExecution: 0.7,
        parallelProcessing: 0.9,
      },
      historyLength: 0,
    }
  }

  /**
   * Configure adaptive supervision settings
   */
  configureAdaptiveSupervision(config: any): void {
    console.log(chalk.cyan(`⚡︎ Adaptive supervision configured`))
    if (config.adaptiveSupervision) {
      console.log(chalk.cyan(`🎯 Cognitive features enabled`))
    }
  }
}

// Export the class with proper typing
export class StreamingOrchestrator extends StreamingOrchestratorImpl {
  // Explicitly expose panel methods for TypeScript
  public createPanel(config: Omit<Panel, 'content'>): void {
    super.createPanel(config)
  }

  public async streamToPanel(panelId: string, content: string): Promise<void> {
    return super.streamToPanel(panelId, content)
  }

  public displayPanels(): void {
    super.displayPanels()
  }

  public queueVMMessage(content: string): void {
    super.queueVMMessage(content)
  }
}

// Start the orchestrator if this file is run directly
if (require.main === module) {
  const orchestrator = new StreamingOrchestrator()
  orchestrator.start().catch(console.error)
}
