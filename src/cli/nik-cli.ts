import boxen from 'boxen'
import chalk from 'chalk'
import type cliProgress from 'cli-progress'
import inquirer from 'inquirer'
import type { Ora } from 'ora'
import * as path from 'path'
import * as readline from 'readline'
import { advancedAIProvider } from './ai/advanced-ai-provider'
import { modelProvider } from './ai/model-provider'
import type { ModernAIProvider } from './ai/modern-ai-provider'
import { SlashCommandHandler } from './chat/nik-cli-commands'
import { TOKEN_LIMITS } from './config/token-limits'
import { agentLearningSystem } from './core/agent-learning-system'
import { AgentManager } from './core/agent-manager'
import { type CognitiveRouteAnalyzer, createCognitiveRouteAnalyzer } from './core/cognitive-route-analyzer'
// Import existing modules
import { type SimpleConfigManager, simpleConfigManager } from './core/config-manager'
import { intelligentFeedbackWrapper } from './core/intelligent-feedback-wrapper'
import { TokenOptimizer } from './core/performance-optimizer'
import { type ProjectMemoryManager, projectMemory } from './core/project-memory'
import { EnhancedSessionManager } from './persistence/enhanced-session-manager'
import { PlanningManager } from './planning/planning-manager'
import type { ExecutionPlan } from './planning/types'
import { registerAgents } from './register-agents'
import type { StreamingOrchestrator } from './streaming-orchestrator'
import { advancedUI } from './ui/advanced-cli-ui'
// Import BlessedTUI
import { BlessedTUI } from './ui/blessed-tui'
import { createConsoleTokenDisplay } from './ui/token-aware-status-bar'

import { PasteHandler } from './utils/paste-handler'

const _formatCognitive = chalk.hex('#4a4a4a')

import { configureSyntaxHighlighting } from './utils/syntax-highlighter'

// CAD AI System imports

// Configure syntax highlighting for terminal output
configureSyntaxHighlighting()

export interface NikCLIOptions {
  agent?: string
  model?: string
  auto?: boolean
  plan?: boolean
  structuredUI?: boolean
  tui?: boolean // Add tui option
}

export interface TodoOptions {
  list?: boolean
  add?: string
  complete?: string
}

export interface PlanOptions {
  execute?: boolean
  save?: string
}

export interface AgentOptions {
  auto?: boolean
}

export interface AutoOptions {
  planFirst?: boolean
}

export interface ConfigOptions {
  show?: boolean
  model?: string
  key?: string
}

export interface InitOptions {
  force?: boolean
}

export interface CommandResult {
  shouldExit: boolean
  shouldUpdatePrompt: boolean
}

/**
 * Render a Pro/Free plan status panel for CLI usage
 */
export function renderProPanel(options: { tier: 'free' | 'pro' | 'enterprise'; hasKey?: boolean }): void {
  const tier = options.tier
  const hasKey = Boolean(options.hasKey)

  const statusLines: string[] = []
  statusLines.push(chalk.white('Current plan: ') + chalk.green(tier))
  statusLines.push('')

  if (tier === 'free') {
    statusLines.push(chalk.cyan('Free mode (BYOK):'))
    statusLines.push(chalk.gray('• Provide your own OpenRouter key'))
    statusLines.push(chalk.gray('• Configure with: /set-key openrouter <key>'))
    statusLines.push(chalk.gray('• Or set env OPENROUTER_API_KEY'))
  } else {
    statusLines.push(chalk.cyan('Pro mode (Managed):'))
    statusLines.push(chalk.gray('• NikCLI issues and manages your OpenRouter key'))
    statusLines.push(chalk.gray('• Key is fetched after login or via /pro activate'))
  }

  statusLines.push('')
  statusLines.push(chalk.white('Key status: ') + (hasKey ? chalk.green('present') : chalk.yellow('not configured')))

  const panel = boxen(statusLines.join('\n'), {
    padding: 1,
    borderStyle: 'round',
    borderColor: tier === 'free' ? 'cyan' : 'green',
    backgroundColor: tier === 'free' ? '#001a2a' : '#001a00',
    title: 'Plan Status',
  })

  console.log(panel)
}

export interface LiveUpdate {
  type: 'status' | 'progress' | 'log' | 'error' | 'warning' | 'info' | 'step' | 'result'
  content: string
  timestamp: Date
  source?: string
  metadata?: any
  stepId?: string
}

export interface StatusIndicator {
  id: string
  title: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'warning'
  details?: string
  progress?: number
  startTime?: Date
  endTime?: Date
  subItems?: StatusIndicator[]
}

/**
 * NikCLI - Unified CLI interface integrating all existing modules
 * Provides Claude Code-style terminal experience with autonomous agents
 */
export class NikCLI {
  private rl?: readline.Interface
  private configManager: SimpleConfigManager
  private agentManager: AgentManager
  private planningManager: PlanningManager
  private cognitiveRouteAnalyzer?: CognitiveRouteAnalyzer
  private agentLearningSystem: typeof agentLearningSystem
  private intelligentFeedbackWrapper: typeof intelligentFeedbackWrapper
  private projectMemory: ProjectMemoryManager
  private workingDirectory: string
  private currentMode: 'default' | 'plan' | 'vm' = 'default'
  private currentAgent?: string
  private activeVMContainer?: string
  private projectContextFile: string
  private sessionContext: Map<string, any> = new Map()
  private slashHandler: SlashCommandHandler

  // Blessed TUI instance
  private tui?: BlessedTUI
  private useTUI: boolean = false

  private modernAIProvider?: ModernAIProvider
  private vimKeyHandler?: (data: Buffer) => Promise<void>
  private keypressListener?: (chunk: any, key: any) => void

  // Interactive slash menu state
  private isSlashMenuActive: boolean = false
  private slashMenuCommands: [string, string][] = []
  private slashMenuSelectedIndex: number = 0
  private slashMenuScrollOffset: number = 0
  private currentSlashInput: string = ''
  private readonly SLASH_MENU_MAX_VISIBLE: number = 5
  private tokenDisplay = createConsoleTokenDisplay() // Real-time token display

  // Execution state management
  private executionInProgress: boolean = false
  private indicators: Map<string, StatusIndicator> = new Map()
  private liveUpdates: LiveUpdate[] = []
  private spinners: Map<string, Ora> = new Map()
  private progressBars: Map<string, cliProgress.SingleBar> = new Map()
  private isInteractiveMode: boolean = false
  private fileWatcher: any = null
  private progressTracker: any = null
  private assistantProcessing: boolean = false
  private userInputActive: boolean = false

  // CRITICAL SAFETY: Recursion and crash prevention
  private recursionDepth: number = 0
  private readonly MAX_RECURSION_DEPTH: number = 3
  private cleanupInProgress: boolean = false
  private activeTimers: Set<Timer> = new Set()
  private inquirerInstances: Set<any> = new Set()

  // Parallel agent collaboration system
  private currentCollaborationContext?: {
    sessionId: string
    agents: string[]
    task: string
    logs: Map<string, string[]>
    sharedData: Map<string, any>
  }
  private shouldInterrupt: boolean = false
  private currentStreamController?: AbortController
  private lastGeneratedPlan?: ExecutionPlan
  private advancedUI: any
  private structuredUIEnabled: boolean = false
  private selectedFiles?: Map<string, { files: string[]; timestamp: Date; pattern: string }>
  private sessionTokenUsage: number = 0
  private realTimeCost: number = 0
  private toolchainTokenLimit: number = 150000 // Limite per toolchain
  private toolchainContext: Map<string, number> = new Map()
  private activeSpinner: any = null
  private aiOperationStart: Date | null = null
  private modelPricing: Map<string, { input: number; output: number }> = new Map()
  private tokenOptimizer?: TokenOptimizer
  private streamingOrchestrator?: StreamingOrchestrator
  private cognitiveMode: boolean = true
  private pasteHandler: PasteHandler
  private _pendingPasteContent?: string
  private orchestrationLevel: number = 8
  // Timer used to re-render the prompt after console output in chat mode
  private promptRenderTimer: Timer | null = null
  // Status bar loading animation
  private statusBarTimer: Timer | null = null
  private statusBarStep: number = 0
  private isInquirerActive: boolean = false
  private lastBarSegments: number = -1

  // Clean chat mode: hide ephemeral tool logs from transcript
  private cleanChatMode: boolean = false
  // When true, clear live updates automatically when idle/finished
  private ephemeralLiveUpdates: boolean = false

  // Plan HUD state
  private activePlanForHud?: {
    id: string
    title: string
    description?: string
    userRequest?: string
    estimatedTotalDuration?: number
    riskAssessment?: any
    todos: Array<{
      id: string
      title: string
      description?: string
      status: 'pending' | 'in_progress' | 'completed' | 'failed'
      priority?: string
      progress?: number
      reasoning?: string
      tools?: string[]
    }>
  }
  private planHudUnsubscribe?: () => void
  private planHudVisible: boolean = true

  // Parallel toolchain display state
  private parallelToolchainDisplay?: Map<
    string,
    {
      agentName: string
      toolName: string
      status: 'executing' | 'completed' | 'failed'
      display: string
      timestamp: number
    }
  >

  // When the Plan HUD is visible, suppress verbose Advanced UI functionCall/functionUpdate
  // console prints to avoid duplicated rows alongside the dedicated toolchain rows.
  private suppressToolLogsWhilePlanHudVisible: boolean = this.currentMode !== 'plan'

  // Enhanced services
  private enhancedSessionManager: EnhancedSessionManager
  private isEnhancedMode: boolean = false

  // NEW: Chat UI System
  private chatBuffer: string[] = []
  private maxChatLines: number = 1000
  private terminalHeight: number = 0
  private chatAreaHeight: number = 0
  private isChatMode: boolean = false
  private isPrintingPanel: boolean = false

  constructor(options: NikCLIOptions = {}) {
    this.workingDirectory = process.cwd()
    this.projectContextFile = path.join(this.workingDirectory, 'NIKOCLI.md')

    // Check if TUI is enabled via options or environment variable
    this.useTUI = options.tui || process.env.NIKCLI_TUI === '1'

    if (this.useTUI) {
      this.tui = new BlessedTUI()
      // Redirect console.log to TUI main content area
      const originalConsoleLog = console.log
      console.log = (...args: any[]) => {
        const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ')
        if (this.tui) {
          this.tui.appendMainContent(message)
        } else {
          originalConsoleLog(...args)
        }
      }
    }

    // Compact mode by default (cleaner output unless explicitly disabled)
    try {
      if (!process.env.NIKCLI_COMPACT) process.env.NIKCLI_COMPACT = '1'
    } catch {}

    // Initialize core managers
    this.configManager = simpleConfigManager
    this.agentManager = new AgentManager(this.configManager)
    this.toolchainTokenLimit = TOKEN_LIMITS.CHAT?.MAX_CONTEXT_TOKENS ?? 18000
    // Initialize enhanced services
    this.enhancedSessionManager = new EnhancedSessionManager()
    this.isEnhancedMode = this.configManager.getRedisConfig().enabled || this.configManager.getSupabaseConfig().enabled
    this.planningManager = new PlanningManager(this.workingDirectory)

    // Initialize learning and feedback systems
    this.agentLearningSystem = agentLearningSystem
    this.intelligentFeedbackWrapper = intelligentFeedbackWrapper
    // Initialize cognitive route analyzer
    this.cognitiveRouteAnalyzer = createCognitiveRouteAnalyzer(this.workingDirectory)
    // Initialize project memory
    this.projectMemory = projectMemory
    // Initialize paste handler for long text processing
    this.pasteHandler = PasteHandler.getInstance()

    // IDE diagnostic integration will be initialized on demand
    // No automatic initialization to avoid unwanted file watchers
    this.slashHandler = new SlashCommandHandler(this)
    this.advancedUI = advancedUI

    // Token optimizer will be initialized lazily when needed

    // Register agents
    registerAgents(this.agentManager)

    // Initialize token tracking system
    this.initializeTokenTrackingSystem()

    // Expose this instance globally for command handlers
    ;(global as any).__nikCLI = this

    this.setupEventHandlers()
    // Bridge orchestrator events into NikCLI output
    this.setupOrchestratorEventBridge()
    this.setupAdvancedUIFeatures()
    this.setupPlanningEventListeners()

    // Initialize structured UI system
    this.initializeStructuredUI()

    // Initialize model pricing
    this.initializeModelPricing()

    // Initialize token cache system
    this.initializeTokenCache()

    // Initialize cognitive orchestration system

    // Initialize Vim mode components

    this.initializeCognitiveOrchestration()

    // Initialize chat UI system
    this.initializeChatUI()

    // Render initial prompt
    if (!this.useTUI) {
      this.renderPromptArea()
    } else {
      this.tui?.focusPrompt()
    }
    // Expose NikCLI globally for token management
    ;(global as any).__nikcli = this

    // Patch inquirer to avoid status bar redraw during interactive prompts
    try {
      const originalPrompt = (inquirer as any).prompt?.bind(inquirer)
      if (originalPrompt) {
        ;(inquirer as any).prompt = async (...args: any[]) => {
          this.isInquirerActive = true
          if (!this.useTUI) {
            this.stopStatusBar()
          }
          try {
            return await originalPrompt(...args)
          } finally {
            this.isInquirerActive = false
            if (!this.useTUI) {
              this.renderPromptAfterOutput()
            }
          }
        }
      }
    } catch {
      /* ignore patch errors */
    }

    // Configure clean-chat behavior via env
    try {
      const truthy = (v?: string) => !!v && !['0', 'false', 'off', 'no'].includes(v.toLowerCase())
      const cleanEnv = process.env.NIKCLI_CLEAN_CHAT || process.env.NIKCLI_MINIMAL_STREAM
      // Default to clean mode in non-TTY environments unless explicitly disabled
      this.cleanChatMode = truthy(cleanEnv || (process.stdout.isTTY ? '' : '1'))
      const ephemeralEnv = process.env.NIKCLI_LIVE_UPDATES_EPHEMERAL
      this.ephemeralLiveUpdates = truthy(ephemeralEnv ?? (this.cleanChatMode ? '1' : ''))
    } catch {
      /* ignore env parsing errors */
    }
  }

  /**
   * Get token optimizer instance safely
   */
  private getTokenOptimizer(): TokenOptimizer | null {
    if (!this.tokenOptimizer) {
      try {
        this.tokenOptimizer = new TokenOptimizer({
          level: 'conservative',
          enablePredictive: false,
          enableMicroCache: false, // Assuming a default value
          maxCompressionRatio: 0.5, // Assuming a default value
        })
      } catch (error) {
        console.error('Failed to initialize TokenOptimizer:', error)
        return null
      }
    }
    return this.tokenOptimizer
  }

  /**
   * Initialize the token tracking system, including the token optimizer.
   */
  private initializeTokenTrackingSystem(): void {
    // Initialize context token manager with token limits
    // contextTokenManager.init(TOKEN_LIMITS.CHAT?.MAX_CONTEXT_TOKENS || 18000) // Removed .init()

    // Initialize the token optimizer
    const optimizer = this.getTokenOptimizer()
    if (optimizer) {
      this.tokenOptimizer = optimizer // Initialize lazily
    }
  }

  /**
   * Initialize the token cache system.
   */
  private initializeTokenCache(): void {
    // Initialize enhanced token cache
    // enhancedTokenCache.init() // Removed .init()
    // Initialize completion cache
    // completionCache.init() // Removed .init()
  }

  /**
   * Initialize cognitive orchestration system.
   */
  private initializeCognitiveOrchestration(): void {
    // Placeholder for cognitive orchestration initialization
    // This might involve setting up listeners or initial states for cognitive agents
  }

  /**
   * Initialize chat UI system.
   */
  private initializeChatUI(): void {
    // Placeholder for chat UI initialization
    // This might involve setting up chat buffer, terminal dimensions, etc.
  }

  /**
   * Setup event handlers for various system events.
   */
  private setupEventHandlers(): void {
    // Example: process.on('uncaughtException', this.handleUncaughtException.bind(this));
    // Example: process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
  }

  /**
   * Bridge orchestrator events into NikCLI output.
   */
  private setupOrchestratorEventBridge(): void {
    // Placeholder for bridging orchestrator events
    // This might involve subscribing to events from StreamingOrchestrator and updating UI
  }

  /**
   * Setup advanced UI features.
   */
  private setupAdvancedUIFeatures(): void {
    // Placeholder for advanced UI features setup
    // This might involve setting up specific UI components or behaviors
  }

  /**
   * Setup planning event listeners.
   */
  private setupPlanningEventListeners(): void {
    // Placeholder for planning event listeners setup
    // This might involve subscribing to planning manager events
  }

  /**
   * Initialize structured UI system.
   */
  private initializeStructuredUI(): void {
    // Placeholder for structured UI initialization
    // This might involve setting up structured output formats or components
  }

  /**
   * Render the prompt area.
   */
  private renderPromptArea(): void {
    // This method is now conditionally called based on `useTUI`
    // If TUI is active, BlessedTUI handles the prompt rendering
  }

  /**
   * Stop the status bar animation.
   */
  private stopStatusBar(): void {
    // Placeholder for stopping status bar animation
  }

  /**
   * Render the prompt after console output.
   */
  private renderPromptAfterOutput(): void {
    // Placeholder for rendering prompt after output
  }

  /**
   * Handle user input from the TUI prompt.
   * This method will be called by BlessedTUI when a command is submitted.
   */
  public async handleTUIInput(input: string): Promise<void> {
    if (this.tui) {
      this.tui.appendMainContent(`> ${input}`)
    }
    // Here you would integrate the input with your existing CLI command processing logic
    // For now, let's just echo it back or process a simple command
    if (input.toLowerCase() === 'exit') {
      process.exit(0)
    } else if (input.toLowerCase() === 'clear') {
      // This would require BlessedTUI to have a clear main content method
      // For now, just append a newline
      if (this.tui) this.tui.appendMainContent('\n')
    } else {
      // Simulate processing
      if (this.tui) this.tui.appendMainContent(`Processing command: ${input}`)
      // You would call your existing command handling logic here, e.g., this.processCommand(input)
    }
    this.tui?.focusPrompt()
  }

  /**
   * Process a command from the user.
   * This method would contain the core logic for handling commands.
   */
  public async processCommand(command: string, _options: NikCLIOptions = {}): Promise<CommandResult> {
    // Existing command processing logic would go here.
    // For the TUI, we'll need to ensure output is directed to the TUI's main content area.
    if (this.useTUI && this.tui) {
      this.tui.appendMainContent(`Executing: ${command}`)
    }
    // ... (rest of your command processing logic)
    return { shouldExit: false, shouldUpdatePrompt: true }
  }

  /**
   * Get current session token usage
   */
  public getSessionTokenUsage(): number {
    return this.sessionTokenUsage
  }
  /**
   * Reset session token usage
   */
  public resetSessionTokenUsage(): void {
    this.sessionTokenUsage = 0
    this.contextTokens = 0
    this.realTimeCost = 0
    this.sessionStartTime = new Date()
  }
  /**
   * Manage toolchain token usage to prevent limits
   */
  public manageToolchainTokens(toolName: string, estimatedTokens: number): boolean {
    const currentUsage = this.toolchainContext.get(toolName) || 0
    const newTotal = currentUsage + estimatedTokens
    if (newTotal > this.toolchainTokenLimit) {
      if (this.useTUI && this.tui) {
        this.tui.appendMainContent(chalk.yellow(`⚠️ Toolchain token limit reached for ${toolName}`))
        this.tui.appendMainContent(
          chalk.dim(`   Current: ${currentUsage}, Adding: ${estimatedTokens}, Limit: ${this.toolchainTokenLimit}`)
        )
      } else {
        console.log(chalk.yellow(`⚠️ Toolchain token limit reached for ${toolName}`))
        console.log(
          chalk.dim(`   Current: ${currentUsage}, Adding: ${estimatedTokens}, Limit: ${this.toolchainTokenLimit}`)
        )
      }
      // Clear old context for this tool
      this.toolchainContext.set(toolName, estimatedTokens)
      return false // Indicates limit reached
    }
    this.toolchainContext.set(toolName, newTotal)
    return true // Indicates safe to proceed
  }
  /**
   * Clear toolchain context to free tokens
   */
  public clearToolchainContext(toolName?: string): void {
    if (toolName) {
      this.toolchainContext.delete(toolName)
      if (this.useTUI && this.tui) {
        this.tui.appendMainContent(chalk.blue(`🧹 Cleared context for ${toolName}`))
      } else {
        console.log(chalk.blue(`🧹 Cleared context for ${toolName}`))
      }
    } else {
      this.toolchainContext.clear()
      if (this.useTUI && this.tui) {
        this.tui.appendMainContent(chalk.blue(`🧹 Cleared all toolchain context`))
      } else {
        console.log(chalk.blue(`🧹 Cleared all toolchain context`))
      }
    }
  }
  /**
   * Initialize model pricing data (could be fetched from web API)
   */
  private initializeModelPricing(): void {
    // Anthropic Claude pricing (per 1M tokens)
    this.modelPricing.set('claude-sonnet-4-20250514', { input: 15.0, output: 75.0 })
    this.modelPricing.set('claude-3-5-sonnet-latest', { input: 0.25, output: 1.25 })
    this.modelPricing.set('claude-4-opus-20250514', { input: 3.0, output: 15.0 })
    // OpenAI pricing (per 1M tokens)
    this.modelPricing.set('gpt-4o', { input: 5.0, output: 15.0 })
    this.modelPricing.set('gpt-4o-mini', { input: 0.15, output: 0.6 })
    this.modelPricing.set('gpt-5', { input: 10.0, output: 30.0 })
    // Google Gemini pricing (per 1M tokens)
    this.modelPricing.set('gemini-2.5-pro', { input: 1.25, output: 5.0 })
    this.modelPricing.set('gemini-2.5-flash', { input: 0.075, output: 0.3 })
    this.modelPricing.set('gemini-2.5-flash-lite', { input: 0.075, output: 0.3 })
  }
  /**
   * Calculate cost for tokens used
   */
  private calculateCost(inputTokens: number, outputTokens: number, modelName: string): number {
    const pricing = this.modelPricing.get(modelName)
    if (!pricing) return 0
    const inputCost = (inputTokens / 1000000) * pricing.input
    const outputCost = (outputTokens / 1000000) * pricing.output
    return inputCost + outputCost
  }

  /**
   * Update token usage and real-time cost.
   */
  public updateTokenUsage(inputTokens: number, outputTokens: number, modelName: string): void {
    this.sessionTokenUsage += inputTokens + outputTokens
    this.contextTokens += inputTokens // Only input tokens contribute to context
    this.realTimeCost += this.calculateCost(inputTokens, outputTokens, modelName)

    // Update token display if not using TUI
    if (!this.useTUI) {
      // Assuming a default model and provider for the console display if not explicitly set
      const currentModel = this.modelPricing.keys().next().value || 'unknown-model'
      const currentProvider = 'unknown-provider'
      const maxTokens = TOKEN_LIMITS.CHAT?.MAX_CONTEXT_TOKENS || 18000
      this.tokenDisplay.update(this.sessionTokenUsage, maxTokens, currentProvider, currentModel, this.realTimeCost)
    }
  }

  /**
   * Get the current working directory.
   */
  public getWorkingDirectory(): string {
    return this.workingDirectory
  }

  /**
   * Set the current working directory.
   */
  public setWorkingDirectory(dir: string): void {
    this.workingDirectory = dir
  }

  /**
   * Get the current mode.
   */
  public getCurrentMode(): 'default' | 'plan' | 'vm' {
    return this.currentMode
  }

  /**
   * Set the current mode.
   */
  public setCurrentMode(mode: 'default' | 'plan' | 'vm'): void {
    this.currentMode = mode
  }

  /**
   * Get the current agent.
   */
  public getCurrentAgent(): string | undefined {
    return this.currentAgent
  }

  /**
   * Set the current agent.
   */
  public setCurrentAgent(agent: string): void {
    this.currentAgent = agent
  }

  /**
   * Get the active VM container.
   */
  public getActiveVMContainer(): string | undefined {
    return this.activeVMContainer
  }

  /**
   * Set the active VM container.
   */
  public setActiveVMContainer(container: string): void {
    this.activeVMContainer = container
  }

  /**
   * Get the project context file path.
   */
  public getProjectContextFile(): string {
    return this.projectContextFile
  }

  /**
   * Get the session context.
   */
  public getSessionContext(): Map<string, any> {
    return this.sessionContext
  }

  /**
   * Get the slash handler.
   */
  public getSlashHandler(): SlashCommandHandler {
    return this.slashHandler
  }

  /**
   * Get the agent manager.
   */
  public getAgentManager(): AgentManager {
    return this.agentManager
  }

  /**
   * Get the planning manager.
   */
  public getPlanningManager(): PlanningManager {
    return this.planningManager
  }

  /**
   * Get the cognitive route analyzer.
   */
  public getCognitiveRouteAnalyzer(): CognitiveRouteAnalyzer | undefined {
    return this.cognitiveRouteAnalyzer
  }

  /**
   * Get the agent learning system.
   */
  public getAgentLearningSystem(): typeof agentLearningSystem {
    return this.agentLearningSystem
  }

  /**
   * Get the intelligent feedback wrapper.
   */
  public getIntelligentFeedbackWrapper(): typeof intelligentFeedbackWrapper {
    return this.intelligentFeedbackWrapper
  }

  /**
   * Get the project memory manager.
   */
  public getProjectMemory(): ProjectMemoryManager {
    return this.projectMemory
  }

  /**
   * Get the advanced AI provider.
   */
  public getAdvancedAIProvider(): ModernAIProvider {
    return advancedAIProvider as any
  }

  /**
   * Get the model provider.
   */
  public getModelProvider(): typeof modelProvider {
    return modelProvider
  }

  /**
   * Get the enhanced session manager.
   */
  public getEnhancedSessionManager(): EnhancedSessionManager {
    return this.enhancedSessionManager
  }

  /**
   * Check if enhanced mode is enabled.
   */
  public isEnhancedModeEnabled(): boolean {
    return this.isEnhancedMode
  }

  /**
   * Get the streaming orchestrator.
   */
  public getStreamingOrchestrator(): StreamingOrchestrator | undefined {
    return this.streamingOrchestrator
  }

  /**
   * Set the streaming orchestrator.
   */
  public setStreamingOrchestrator(orchestrator: StreamingOrchestrator): void {
    this.streamingOrchestrator = orchestrator
  }

  /**
   * Get the paste handler.
   */
  public getPasteHandler(): PasteHandler {
    return this.pasteHandler
  }

  /**
   * Get the pending paste content.
   */
  public getPendingPasteContent(): string | undefined {
    return this._pendingPasteContent
  }

  /**
   * Set the pending paste content.
   */
  public setPendingPasteContent(content: string | undefined): void {
    this._pendingPasteContent = content
  }

  /**
   * Get the orchestration level.
   */
  public getOrchestrationLevel(): number {
    return this.orchestrationLevel
  }

  /**
   * Set the orchestration level.
   */
  public setOrchestrationLevel(level: number): void {
    this.orchestrationLevel = level
  }

  /**
   * Get the current collaboration context.
   */
  public getCurrentCollaborationContext(): typeof this.currentCollaborationContext {
    return this.currentCollaborationContext
  }

  /**
   * Set the current collaboration context.
   */
  public setCurrentCollaborationContext(context: typeof this.currentCollaborationContext): void {
    this.currentCollaborationContext = context
  }

  /**
   * Check if an interrupt is pending.
   */
  public shouldInterruptExecution(): boolean {
    return this.shouldInterrupt
  }

  /**
   * Set the interrupt flag.
   */
  public setInterruptExecution(interrupt: boolean): void {
    this.shouldInterrupt = interrupt
  }

  /**
   * Get the current stream controller.
   */
  public getCurrentStreamController(): AbortController | undefined {
    return this.currentStreamController
  }

  /**
   * Set the current stream controller.
   */
  public setCurrentStreamController(controller: AbortController | undefined): void {
    this.currentStreamController = controller
  }

  /**
   * Get the last generated plan.
   */
  public getLastGeneratedPlan(): ExecutionPlan | undefined {
    return this.lastGeneratedPlan
  }

  /**
   * Set the last generated plan.
   */
  public setLastGeneratedPlan(plan: ExecutionPlan | undefined): void {
    this.lastGeneratedPlan = plan
  }

  /**
   * Check if structured UI is enabled.
   */
  public isStructuredUIEnabled(): boolean {
    return this.structuredUIEnabled
  }

  /**
   * Set structured UI enabled status.
   */
  public setStructuredUIEnabled(enabled: boolean): void {
    this.structuredUIEnabled = enabled
  }

  /**
   * Get selected files.
   */
  public getSelectedFiles(): Map<string, { files: string[]; timestamp: Date; pattern: string }> | undefined {
    return this.selectedFiles
  }

  /**
   * Set selected files.
   */
  public setSelectedFiles(files: Map<string, { files: string[]; timestamp: Date; pattern: string }> | undefined): void {
    this.selectedFiles = files
  }

  /**
   * Get the toolchain token limit.
   */
  public getToolchainTokenLimit(): number {
    return this.toolchainTokenLimit
  }

  /**
   * Get the toolchain context.
   */
  public getToolchainContext(): Map<string, number> {
    return this.toolchainContext
  }

  /**
   * Get the active spinner.
   */
  public getActiveSpinner(): any {
    return this.activeSpinner
  }

  /**
   * Set the active spinner.
   */
  public setActiveSpinner(spinner: any): void {
    this.activeSpinner = spinner
  }

  /**
   * Get the AI operation start time.
   */
  public getAiOperationStart(): Date | null {
    return this.aiOperationStart
  }

  /**
   * Set the AI operation start time.
   */
  public setAiOperationStart(time: Date | null): void {
    this.aiOperationStart = time
  }

  /**
   * Get the model pricing map.
   */
  public getModelPricing(): Map<string, { input: number; output: number }> {
    return this.modelPricing
  }

  /**
   * Check if cognitive mode is enabled.
   */
  public isCognitiveMode(): boolean {
    return this.cognitiveMode
  }

  /**
   * Set cognitive mode status.
   */
  public setCognitiveMode(mode: boolean): void {
    this.cognitiveMode = mode
  }

  /**
   * Get the prompt render timer.
   */
  public getPromptRenderTimer(): Timer | null {
    return this.promptRenderTimer
  }

  /**
   * Set the prompt render timer.
   */
  public setPromptRenderTimer(timer: Timer | null): void {
    this.promptRenderTimer = timer
  }

  /**
   * Get the status bar timer.
   */
  public getStatusBarTimer(): Timer | null {
    return this.statusBarTimer
  }

  /**
   * Set the status bar timer.
   */
  public setStatusBarTimer(timer: Timer | null): void {
    this.statusBarTimer = timer
  }

  /**
   * Get the status bar step.
   */
  public getStatusBarStep(): number {
    return this.statusBarStep
  }

  /**
   * Set the status bar step.
   */
  public setStatusBarStep(step: number): void {
    this.statusBarStep = step
  }

  /**
   * Check if inquirer is active.
   */
  public isInquirerActiveStatus(): boolean {
    return this.isInquirerActive
  }

  /**
   * Set inquirer active status.
   */
  public setIsInquirerActive(status: boolean): void {
    this.isInquirerActive = status
  }

  /**
   * Get the last bar segments.
   */
  public getLastBarSegments(): number {
    return this.lastBarSegments
  }

  /**
   * Set the last bar segments.
   */
  public setLastBarSegments(segments: number): void {
    this.lastBarSegments = segments
  }

  /**
   * Check if clean chat mode is enabled.
   */
  public isCleanChatMode(): boolean {
    return this.cleanChatMode
  }

  /**
   * Set clean chat mode status.
   */
  public setCleanChatMode(mode: boolean): void {
    this.cleanChatMode = mode
  }

  /**
   * Check if ephemeral live updates are enabled.
   */
  public isEphemeralLiveUpdates(): boolean {
    return this.ephemeralLiveUpdates
  }

  /**
   * Set ephemeral live updates status.
   */
  public setEphemeralLiveUpdates(status: boolean): void {
    this.ephemeralLiveUpdates = status
  }

  /**
   * Get the active plan for HUD.
   */
  public getActivePlanForHud(): typeof this.activePlanForHud {
    return this.activePlanForHud
  }

  /**
   * Set the active plan for HUD.
   */
  public setActivePlanForHud(plan: typeof this.activePlanForHud): void {
    this.activePlanForHud = plan
  }

  /**
   * Get the plan HUD unsubscribe function.
   */
  public getPlanHudUnsubscribe(): (() => void) | undefined {
    return this.planHudUnsubscribe
  }

  /**
   * Set the plan HUD unsubscribe function.
   */
  public setPlanHudUnsubscribe(unsubscribe: (() => void) | undefined): void {
    this.planHudUnsubscribe = unsubscribe
  }

  /**
   * Check if plan HUD is visible.
   */
  public isPlanHudVisible(): boolean {
    return this.planHudVisible
  }

  /**
   * Set plan HUD visibility.
   */
  public setPlanHudVisible(visible: boolean): void {
    this.planHudVisible = visible
  }

  /**
   * Get the parallel toolchain display.
   */
  public getParallelToolchainDisplay(): typeof this.parallelToolchainDisplay {
    return this.parallelToolchainDisplay
  }

  /**
   * Set the parallel toolchain display.
   */
  public setParallelToolchainDisplay(display: typeof this.parallelToolchainDisplay): void {
    this.parallelToolchainDisplay = display
  }

  /**
   * Check if tool logs are suppressed while plan HUD is visible.
   */
  public isSuppressToolLogsWhilePlanHudVisible(): boolean {
    return this.suppressToolLogsWhilePlanHudVisible
  }

  /**
   * Set suppress tool logs while plan HUD visible status.
   */
  public setSuppressToolLogsWhilePlanHudVisible(suppress: boolean): void {
    this.suppressToolLogsWhilePlanHudVisible = suppress
  }

  /**
   * Get the chat buffer.
   */
  public getChatBuffer(): string[] {
    return this.chatBuffer
  }

  /**
   * Add a message to the chat buffer.
   */
  public addChatMessage(message: string): void {
    this.chatBuffer.push(message)
    if (this.chatBuffer.length > this.maxChatLines) {
      this.chatBuffer.shift()
    }
    if (this.useTUI && this.tui) {
      this.tui.appendMainContent(message)
    }
  }

  /**
   * Get the maximum chat lines.
   */
  public getMaxChatLines(): number {
    return this.maxChatLines
  }

  /**
   * Set the maximum chat lines.
   */
  public setMaxChatLines(lines: number): void {
    this.maxChatLines = lines
  }

  /**
   * Get the terminal height.
   */
  public getTerminalHeight(): number {
    return this.terminalHeight
  }

  /**
   * Set the terminal height.
   */
  public setTerminalHeight(height: number): void {
    this.terminalHeight = height
  }

  /**
   * Get the chat area height.
   */
  public getChatAreaHeight(): number {
    return this.chatAreaHeight
  }

  /**
   * Set the chat area height.
   */
  public setChatAreaHeight(height: number): void {
    this.chatAreaHeight = height
  }

  /**
   * Check if chat mode is enabled.
   */
  public isChatModeEnabled(): boolean {
    return this.isChatMode
  }

  /**
   * Set chat mode status.
   */
  public setChatModeEnabled(enabled: boolean): void {
    this.isChatMode = enabled
  }

  /**
   * Check if printing panel is active.
   */
  public isPrintingPanelActive(): boolean {
    return this.isPrintingPanel
  }

  /**
   * Set printing panel active status.
   */
  public setPrintingPanelActive(active: boolean): void {
    this.isPrintingPanel = active
  }

  /**
   * Get the recursion depth.
   */
  public getRecursionDepth(): number {
    return this.recursionDepth
  }

  /**
   * Increment recursion depth.
   */
  public incrementRecursionDepth(): void {
    this.recursionDepth++
  }

  /**
   * Decrement recursion depth.
   */
  public decrementRecursionDepth(): void {
    this.recursionDepth--
  }

  /**
   * Get the maximum recursion depth.
   */
  public getMaxRecursionDepth(): number {
    return this.MAX_RECURSION_DEPTH
  }

  /**
   * Check if cleanup is in progress.
   */
  public isCleanupInProgress(): boolean {
    return this.cleanupInProgress
  }

  /**
   * Set cleanup in progress status.
   */
  public setCleanupInProgress(status: boolean): void {
    this.cleanupInProgress = status
  }

  /**
   * Get active timers.
   */
  public getActiveTimers(): Set<Timer> {
    return this.activeTimers
  }

  /**
   * Get inquirer instances.
   */
  public getInquirerInstances(): Set<any> {
    return this.inquirerInstances
  }

  /**
   * Get the advanced UI instance.
   */
  public getAdvancedUI(): any {
    return this.advancedUI
  }

  /**
   * Get the config manager.
   */
  public getConfigManager(): SimpleConfigManager {
    return this.configManager
  }

  /**
   * Get the current execution in progress status.
   */
  public isExecutionInProgress(): boolean {
    return this.executionInProgress
  }

  /**
   * Set the execution in progress status.
   */
  public setExecutionInProgress(status: boolean): void {
    this.executionInProgress = status
  }

  /**
   * Get the status indicators.
   */
  public getIndicators(): Map<string, StatusIndicator> {
    return this.indicators
  }

  /**
   * Get the live updates.
   */
  public getLiveUpdates(): LiveUpdate[] {
    return this.liveUpdates
  }

  /**
   * Get the spinners.
   */
  public getSpinners(): Map<string, Ora> {
    return this.spinners
  }

  /**
   * Get the progress bars.
   */
  public getProgressBars(): Map<string, cliProgress.SingleBar> {
    return this.progressBars
  }

  /**
   * Check if interactive mode is enabled.
   */
  public isInteractiveModeEnabled(): boolean {
    return this.isInteractiveMode
  }

  /**
   * Set interactive mode status.
   */
  public setInteractiveModeEnabled(enabled: boolean): void {
    this.isInteractiveMode = enabled
  }

  /**
   * Get the file watcher.
   */
  public getFileWatcher(): any {
    return this.fileWatcher
  }

  /**
   * Set the file watcher.
   */
  public setFileWatcher(watcher: any): void {
    this.fileWatcher = watcher
  }

  /**
   * Get the progress tracker.
   */
  public getProgressTracker(): any {
    return this.progressTracker
  }

  /**
   * Set the progress tracker.
   */
  public setProgressTracker(tracker: any): void {
    this.progressTracker = tracker
  }

  /**
   * Check if assistant processing is active.
   */
  public isAssistantProcessing(): boolean {
    return this.assistantProcessing
  }

  /**
   * Set assistant processing status.
   */
  public setAssistantProcessing(status: boolean): void {
    this.assistantProcessing = status
  }

  /**
   * Check if user input is active.
   */
  public isUserInputActive(): boolean {
    return this.userInputActive
  }

  /**
   * Set user input active status.
   */
  public setUserInputActive(status: boolean): void {
    this.userInputActive = status
  }

  /**
   * Get the token display.
   */
  public getTokenDisplay(): any {
    return this.tokenDisplay
  }

  /**
   * Get the slash menu active status.
   */
  public isSlashMenuActiveStatus(): boolean {
    return this.isSlashMenuActive
  }

  /**
   * Set the slash menu active status.
   */
  public setSlashMenuActiveStatus(status: boolean): void {
    this.isSlashMenuActive = status
  }

  /**
   * Get the slash menu commands.
   */
  public getSlashMenuCommands(): [string, string][] {
    return this.slashMenuCommands
  }

  /**
   * Set the slash menu commands.
   */
  public setSlashMenuCommands(commands: [string, string][]): void {
    this.slashMenuCommands = commands
  }

  /**
   * Get the slash menu selected index.
   */
  public getSlashMenuSelectedIndex(): number {
    return this.slashMenuSelectedIndex
  }

  /**
   * Set the slash menu selected index.
   */
  public setSlashMenuSelectedIndex(index: number): void {
    this.slashMenuSelectedIndex = index
  }

  /**
   * Get the slash menu scroll offset.
   */
  public getSlashMenuScrollOffset(): number {
    return this.slashMenuScrollOffset
  }

  /**
   * Set the slash menu scroll offset.
   */
  public setSlashMenuScrollOffset(offset: number): void {
    this.slashMenuScrollOffset = offset
  }

  /**
   * Get the current slash input.
   */
  public getCurrentSlashInput(): string {
    return this.currentSlashInput
  }

  /**
   * Set the current slash input.
   */
  public setCurrentSlashInput(input: string): void {
    this.currentSlashInput = input
  }

  /**
   * Get the slash menu maximum visible items.
   */
  public getSlashMenuMaxVisible(): number {
    return this.SLASH_MENU_MAX_VISIBLE
  }

  /**
   * Get the modern AI provider.
   */
  public getModernAIProvider(): ModernAIProvider | undefined {
    return this.modernAIProvider
  }

  /**
   * Set the modern AI provider.
   */
  public setModernAIProvider(provider: ModernAIProvider | undefined): void {
    this.modernAIProvider = provider
  }

  /**
   * Get the Vim key handler.
   */
  public getVimKeyHandler(): ((data: Buffer) => Promise<void>) | undefined {
    return this.vimKeyHandler
  }

  /**
   * Set the Vim key handler.
   */
  public setVimKeyHandler(handler: ((data: Buffer) => Promise<void>) | undefined): void {
    this.vimKeyHandler = handler
  }

  /**
   * Get the keypress listener.
   */
  public getKeypressListener(): ((chunk: any, key: any) => void) | undefined {
    return this.keypressListener
  }

  /**
   * Set the keypress listener.
   */
  public setKeypressListener(listener: ((chunk: any, key: any) => void) | undefined): void {
    this.keypressListener = listener
  }

  /**
   * Get the readline interface.
   */
  public getReadlineInterface(): readline.Interface | undefined {
    return this.rl
  }

  /**
   * Set the readline interface.
   */
  public setReadlineInterface(rl: readline.Interface | undefined): void {
    this.rl = rl
  }

  /**
   * Get the Blessed TUI instance.
   */
  public getTUI(): BlessedTUI | undefined {
    return this.tui
  }

  /**
   * Check if TUI is being used.
   */
  public isTUIEnabled(): boolean {
    return this.useTUI
  }

  /**
   * Set TUI enabled status.
   */
  public setTUIEnabled(enabled: boolean): void {
    this.useTUI = enabled
  }

  /**
   * Start the CLI, either in TUI mode or regular console mode.
   */
  public async start(options: NikCLIOptions = {}): Promise<void> {
    if (this.useTUI && this.tui) {
      this.tui.render()
      // The TUI handles its own input loop, so we don't need readline here.
      // We'll need to expose a way for the TUI to send commands back to NikCLI.
      // This is handled by the submit event on promptInput in BlessedTUI.
    } else {
      // Original readline setup for non-TUI mode
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '> ',
      })

      this.rl
        .on('line', async (line) => {
          const input = line.trim()
          if (input) {
            const result = await this.processCommand(input, options)
            if (result.shouldExit) {
              this.rl?.close()
              process.exit(0)
            } else if (result.shouldUpdatePrompt) {
              this.rl?.prompt()
            }
          } else {
            this.rl?.prompt()
          }
        })
        .on('close', () => {
          console.log('Exiting NikCLI.')
          process.exit(0)
        })

      this.rl.prompt()
    }
  }

  /**
   * Main entry point for the CLI.
   */
  public static async run(options: NikCLIOptions = {}): Promise<void> {
    const cli = new NikCLI(options)
    await cli.start(options)
  }
}

// This is the original main execution block, modified to use the new NikCLI class
// and support the TUI option.

// Example usage:
// NikCLI.run({ tui: true })
// NikCLI.run() // Regular CLI mode

// To run from command line with TUI:
// node dist/cli/nik-cli.js --tui
// or set environment variable NIKCLI_TUI=1

// You would typically parse command line arguments here to determine options
// For demonstration, let's assume a simple argument parsing.

const args = process.argv.slice(2)
const options: NikCLIOptions = {}

if (args.includes('--tui')) {
  options.tui = true
}

NikCLI.run(options)
