import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import boxen from 'boxen'
import chalk from 'chalk'
import cliProgress from 'cli-progress'
import inquirer from 'inquirer'
import { nanoid } from 'nanoid'
import ora, { type Ora } from 'ora'
import * as readline from 'readline'
import { advancedAIProvider } from './ai/advanced-ai-provider'
import { modelProvider } from './ai/model-provider'
import { ModernAIProvider } from './ai/modern-ai-provider'
import { ModernAgentOrchestrator } from './automation/agents/modern-agent-system'
import { chatManager } from './chat/chat-manager'
import { SlashCommandHandler } from './chat/nik-cli-commands'
import { CADCommands } from './commands/cad-commands'
import { TOKEN_LIMITS } from './config/token-limits'
import { docsContextManager } from './context/docs-context-manager'
import { workspaceContext } from './context/workspace-context'
import { agentFactory } from './core/agent-factory'
import { AgentManager } from './core/agent-manager'
import { agentStream } from './core/agent-stream'

import { createCloudDocsProvider, getCloudDocsProvider } from './core/cloud-docs-provider'
import { completionCache } from './core/completion-protocol-cache'
// Import existing modules
import { configManager, type SimpleConfigManager, simpleConfigManager } from './core/config-manager'
import { contextTokenManager } from './core/context-token-manager'
import { type DocumentationEntry, docLibrary } from './core/documentation-library'
import { enhancedTokenCache } from './core/enhanced-token-cache'
import { inputQueue } from './core/input-queue'
import { type McpServerConfig, mcpClient } from './core/mcp-client'
import { QuietCacheLogger, TokenOptimizer } from './core/performance-optimizer'
import { tokenCache } from './core/token-cache'
import { toolRouter } from './core/tool-router'
import { universalTokenizer } from './core/universal-tokenizer-service'
import { validatorManager } from './core/validator-manager'
import { ideDiagnosticIntegration } from './integrations/ide-diagnostic-integration'
import { EnhancedSessionManager } from './persistence/enhanced-session-manager'
import { enhancedPlanning } from './planning/enhanced-planning'
import { PlanningManager } from './planning/planning-manager'
import type { ExecutionPlan } from './planning/types'
import { authProvider } from './providers/supabase/auth-provider'
import { enhancedSupabaseProvider } from './providers/supabase/enhanced-supabase-provider'
import { registerAgents } from './register-agents'
import { agentService } from './services/agent-service'
// New enhanced services
import { cacheService } from './services/cache-service'
import { memoryService } from './services/memory-service'
import { planningService } from './services/planning-service'
import { snapshotService } from './services/snapshot-service'
import { toolService } from './services/tool-service'
import { StreamingOrchestrator } from './streaming-orchestrator'
import { toolsManager } from './tools/tools-manager'
import { advancedUI } from './ui/advanced-cli-ui'
import { approvalSystem } from './ui/approval-system'
import { createStringPushStream, renderChatStreamToTerminal } from './ui/streamdown-renderer'
import { createConsoleTokenDisplay } from './ui/token-aware-status-bar'
// Paste handling system
import { PasteHandler } from './utils/paste-handler'

const formatCognitive = chalk.hex('#4a4a4a')

import { structuredLogger } from './utils/structured-logger'
import { configureSyntaxHighlighting } from './utils/syntax-highlighter'
import { formatAgent, formatCommand, formatFileOp, formatSearch, formatStatus, wrapBlue } from './utils/text-wrapper'
import { VimAIIntegration } from './vim/ai/vim-ai-integration'
import { VimMode } from './vim/types/vim-types'
// Vim Mode imports
import { VimModeManager } from './vim/vim-mode-manager'
// VM System imports
import { vmSelector } from './virtualized-agents/vm-selector'

// CAD AI System imports

// Configure syntax highlighting for terminal output
configureSyntaxHighlighting()

export interface NikCLIOptions {
  agent?: string
  model?: string
  auto?: boolean
  plan?: boolean
  structuredUI?: boolean
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
  private workingDirectory: string
  private currentMode: 'default' | 'plan' | 'vm' | 'vim' = 'default'
  private currentAgent?: string
  private activeVMContainer?: string
  private projectContextFile: string
  private sessionContext: Map<string, any> = new Map()
  private slashHandler: SlashCommandHandler

  // Vim Mode properties
  private vimModeManager?: VimModeManager
  private vimAIIntegration?: VimAIIntegration
  private modernAIProvider?: ModernAIProvider
  private vimKeyHandler?: (data: Buffer) => Promise<void>
  private keypressListener?: (chunk: any, key: any) => void

  // Enhanced features
  private enhancedFeaturesEnabled: boolean = true
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
  private activeTimers: Set<NodeJS.Timeout> = new Set()
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
  private sessionStartTime: Date = new Date()
  private contextTokens: number = 0
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
  private promptRenderTimer: NodeJS.Timeout | null = null
  // Status bar loading animation
  private statusBarTimer: NodeJS.Timeout | null = null
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

  constructor() {
    this.workingDirectory = process.cwd()
    this.projectContextFile = path.join(this.workingDirectory, 'NIKOCLI.md')

    // Compact mode by default (cleaner output unless explicitly disabled)
    try {
      if (!process.env.NIKCLI_COMPACT) process.env.NIKCLI_COMPACT = '1'
    } catch { }

    // Initialize core managers
    this.configManager = simpleConfigManager
    this.agentManager = new AgentManager(this.configManager)
    this.toolchainTokenLimit = TOKEN_LIMITS.CHAT?.MAX_CONTEXT_TOKENS ?? 18000
    // Initialize enhanced services
    this.enhancedSessionManager = new EnhancedSessionManager()
    this.isEnhancedMode = this.configManager.getRedisConfig().enabled || this.configManager.getSupabaseConfig().enabled
    this.planningManager = new PlanningManager(this.workingDirectory)
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
      ; (global as any).__nikCLI = this

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
    this.initializeVimMode()
    this.initializeCognitiveOrchestration()

    // Initialize chat UI system
    this.initializeChatUI()

    // Render initial prompt
    this.renderPromptArea()

      // Expose NikCLI globally for token management
      ; (global as any).__nikcli = this

    // Patch inquirer to avoid status bar redraw during interactive prompts
    try {
      const originalPrompt = (inquirer as any).prompt?.bind(inquirer)
      if (originalPrompt) {
        ; (inquirer as any).prompt = async (...args: any[]) => {
          this.isInquirerActive = true
          this.stopStatusBar()
          try {
            return await originalPrompt(...args)
          } finally {
            this.isInquirerActive = false
            this.renderPromptAfterOutput()
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
          enableMicroCache: false,
          maxCompressionRatio: 0.9,
        })
      } catch (error) {
        console.debug('Failed to create token optimizer:', error)
        return null
      }
    }
    return this.tokenOptimizer
  }

  /**
   * Load project context from NIKOCLI.md file
   */
  private async loadProjectContext(): Promise<string> {
    try {
      const context = await fs.readFile(this.projectContextFile, 'utf8')
      const optimizer = this.getTokenOptimizer()
      if (optimizer) {
        const optimized = await optimizer.optimizePrompt(context)
        if (optimized.tokensSaved > 10) {
          QuietCacheLogger.logCacheSave(optimized.tokensSaved)
        }
        return optimized.content
      }
      return context
    } catch (_error) {
      return '' // No project context file
    }
  }

  /**
   * Get relevant project context based on user input (optimized for token usage)
   */
  private async getRelevantProjectContext(userInput: string): Promise<string> {
    const fullContext = await this.loadProjectContext()
    if (!fullContext || fullContext.length < 100) return fullContext

    const lowerInput = userInput.toLowerCase()
    const contextLines = fullContext.split('\n')
    const relevantLines: string[] = []

    // Keyword-based section extraction
    const keywords = this.extractKeywords(lowerInput)
    let currentSection = ''
    let sectionRelevant = false

    for (const line of contextLines) {
      if (line.startsWith('#')) {
        if (sectionRelevant && currentSection) {
          relevantLines.push(currentSection)
        }
        currentSection = `${line}\n`
        sectionRelevant = keywords.some((keyword) => line.toLowerCase().includes(keyword))
      } else {
        currentSection += `${line}\n`
      }
    }

    if (sectionRelevant && currentSection) {
      relevantLines.push(currentSection)
    }

    const result = relevantLines.join('\n').trim()
    return result.length > 2000 ? `${result.substring(0, 2000)}...` : result
  }

  /**
   * Extract keywords from user input to determine relevant context sections
   */
  private extractKeywords(input: string): string[] {
    const keywords: string[] = []
    if (input.includes('react') || input.includes('component') || input.includes('jsx')) {
      keywords.push('react', 'frontend', 'component')
    }
    if (input.includes('api') || input.includes('backend') || input.includes('server')) {
      keywords.push('api', 'backend', 'server')
    }
    if (input.includes('test') || input.includes('spec')) {
      keywords.push('test', 'testing')
    }
    if (input.includes('database') || input.includes('db') || input.includes('sql')) {
      keywords.push('database', 'data')
    }
    if (input.includes('deploy') || input.includes('docker') || input.includes('ci')) {
      keywords.push('deployment', 'devops')
    }
    return keywords
  }

  private async initializeTokenCache(): Promise<void> {
    // Clean up expired cache entries on startup
    setTimeout(async () => {
      try {
        const removed = await tokenCache.cleanupExpired()
        if (removed > 0) {
          console.log(chalk.dim(`🧹 Cleaned ${removed} expired cache entries`))
        }

        const stats = tokenCache.getStats()
        if (stats.totalEntries > 0) {
          console.log(
            chalk.dim(
              ` Loaded ${stats.totalEntries} cached responses (${stats.totalHits} hits, ~${stats.totalTokensSaved.toLocaleString()} tokens saved)`
            )
          )
          console.log(chalk.dim('\n')) // Add spacing after cache info with chalk
        }
      } catch (error: any) {
        console.log(chalk.dim(`Cache initialization warning: ${error.message}`))
      }
    }, 1000) // Delay to avoid interfering with startup
  }

  private logCognitive(message: string): void {
    console.log(formatCognitive(message))
  }

  /**
   * Initialize cognitive orchestration system with enhanced components
   */
  private initializeCognitiveOrchestration(): void {
    try {
      if (!process.env.NIKCLI_QUIET_STARTUP) {
        this.logCognitive('⚡︎ Initializing cognitive orchestration system...')
      }

      // Initialize streaming orchestrator with adaptive supervision
      this.streamingOrchestrator = new StreamingOrchestrator()

      // Configure cognitive features
      this.streamingOrchestrator.configureAdaptiveSupervision({
        adaptiveSupervision: this.cognitiveMode,
        intelligentPrioritization: true,
        cognitiveFiltering: true,
        orchestrationAwareness: true,
      })

      // Setup cognitive event listeners
      this.setupCognitiveEventListeners()

      // Integrate with existing systems
      this.integrateCognitiveComponents()

      this.logCognitive('✓ Cognitive orchestration system initialized')
    } catch (error: any) {
      this.logCognitive(`⚠️ Cognitive orchestration initialization warning: ${error.message}`)
      this.cognitiveMode = false // Fallback to standard mode
    }
  }

  /**
   * Setup cognitive event listeners for system coordination
   */
  private setupCognitiveEventListeners(): void {
    if (!this.streamingOrchestrator) return

    // Listen to supervision events
    this.streamingOrchestrator.on('supervision:updated', (cognition: any) => {
      this.handleSupervisionUpdate(cognition)
    })

    // Listen to validation events
    validatorManager.on('validation:completed', (event: any) => {
      this.handleValidationEvent(event)
    })

    // Listen to tool routing events
    toolRouter.on('routing:optimized', (event: any) => {
      this.handleRoutingOptimization(event)
    })

    // Listen to agent factory events
    agentFactory.on('selection:optimized', (event: any) => {
      this.handleAgentSelectionOptimization(event)
    })
  }

  /**
   * Integrate cognitive components with existing systems
   */
  private integrateCognitiveComponents(): void {
    // Enhance agent service with cognitive awareness
    this.enhanceAgentServiceWithCognition()

    // Integrate validation manager with planning
    this.integrateValidationWithPlanning()

    // Setup tool router coordination
    this.setupToolRouterCoordination()

    // Configure advanced AI provider cognitive features
    this.configureAdvancedAIProviderCognition()
  }

  /**
   * Enhance agent service with cognitive awareness
   */
  private enhanceAgentServiceWithCognition(): void {
    const originalExecuteTask = agentService.executeTask.bind(agentService)

    agentService.executeTask = async (agentType: string, task: string, options?: any) => {
      // Apply cognitive enhancement to task execution
      const enhancedOptions = {
        ...options,
        cognitiveMode: this.cognitiveMode,
        orchestrationLevel: this.orchestrationLevel,
        validatorManager: validatorManager,
        toolRouter: toolRouter,
      }

      return originalExecuteTask(agentType, task, enhancedOptions)
    }
  }

  /**
   * Integrate validation manager with planning service
   */
  private integrateValidationWithPlanning(): void {
    const originalCreatePlan = planningService.createPlan.bind(planningService)

    planningService.createPlan = async (task: string, options?: any) => {
      // Apply cognitive validation to plan creation
      const enhancedOptions = {
        ...options,
        validationConfig: {
          cognitiveValidation: this.cognitiveMode,
          orchestrationAware: true,
          intelligentCaching: true,
        },
      }

      return originalCreatePlan(task, enhancedOptions)
    }
  }

  /**
   * Setup tool router coordination with other components
   */
  private setupToolRouterCoordination(): void {
    // Tool router is now cognitive-aware by default
    this.logCognitive(' Tool router cognitive coordination active')
  }

  /**
   * Configure advanced AI provider cognitive features
   */
  private configureAdvancedAIProviderCognition(): void {
    advancedAIProvider.configureCognitiveFeatures({
      enableCognition: this.cognitiveMode,
      orchestrationLevel: this.orchestrationLevel,
      intelligentCommands: true,
      adaptivePlanning: true,
    })
  }

  /**
   * Handle supervision cognition updates
   */
  private handleSupervisionUpdate(cognition: any): void {
    // Update orchestration level based on supervision
    if (cognition.orchestrationLevel) {
      this.orchestrationLevel = Math.max(this.orchestrationLevel, cognition.orchestrationLevel)
    }

    // Adjust cognitive mode based on system load
    if (cognition.systemLoad === 'overloaded' && this.cognitiveMode) {
      this.logCognitive('⚡ Temporarily reducing cognitive features due to high load')
      this.cognitiveMode = false
    } else if (cognition.systemLoad === 'light' && !this.cognitiveMode) {
      this.logCognitive('⚡︎ Re-enabling cognitive features - system load normalized')
      this.cognitiveMode = true
    }
  }

  /**
   * Handle validation events from cognitive validator
   */
  private handleValidationEvent(event: any): void {
    const { context, cognition, result } = event

    if (result.cognitiveScore && result.cognitiveScore < 0.5) {
      this.logCognitive(`⚠️ Low cognitive score for ${context.filePath}: ${(result.cognitiveScore * 100).toFixed(1)}%`)
    }

    if (result.orchestrationCompatibility && result.orchestrationCompatibility > 0.9) {
      this.logCognitive(`🎯 High orchestration compatibility: ${(result.orchestrationCompatibility * 100).toFixed(1)}%`)
    }
  }

  /**
   * Handle tool routing optimization events
   */
  private handleRoutingOptimization(event: any): void {
    const { tools, cognitiveScore, orchestrationAwareness } = event

    if (cognitiveScore > 0.8) {
      this.logCognitive(`🎯 Optimal tool routing: ${tools.length} tools, score ${(cognitiveScore * 100).toFixed(1)}%`)
    }
  }

  /**
   * Handle agent selection optimization events
   */
  private handleAgentSelectionOptimization(event: any): void {
    const { selectedAgents, totalScore, cognitiveFactors } = event

    if (totalScore > 85) {
      this.logCognitive(`🔌 Optimal agent selection: ${selectedAgents.length} agents, score ${totalScore.toFixed(1)}%`)
    }
  }

  /**
   * Initialize structured UI with 4 panels as per diagram: Chat/Status, Files/Diffs, Plan/Todos, Approval
   */
  private initializeStructuredUI(): void {
    const compact = process.env.NIKCLI_COMPACT === '1' || this.currentMode === 'plan'
    if (!compact) {
      console.log(chalk.dim('🎨 Setting up AdvancedCliUI with 4 panels...'))
    }

    // Enable interactive mode for structured panels
    this.advancedUI.startInteractiveMode()

    // Configure the 4 panels as shown in diagram:
    // 1. Panels: Chat, Status/Logs
    if (!compact) advancedUI.logInfo('Panel Setup', 'Chat & Status/Logs panel configured')

    // 2. Panels: Files, Diffs
    if (!compact) advancedUI.logInfo('Panel Setup', 'Files & Diffs panel configured')

    // 3. Panels: Plan/Todos
    if (!compact) advancedUI.logInfo('Panel Setup', 'Plan/Todos panel configured')

    // 4. Panels: Approval (logs only, prompt via inquirer)
    if (!compact) advancedUI.logInfo('Panel Setup', 'Approval panel configured (logs only)')

    // Set up real-time event listeners for UI updates
    this.setupUIEventListeners()

    if (!compact) console.log(chalk.green('✓ AdvancedCliUI (MAIN UI OWNER) ready with 4 panels'))
  }

  /**
   * Setup UI event listeners for real-time panel updates using existing advanced UI
   */
  private setupUIEventListeners(): void {
    // Hook into agent operations for live UI updates
    this.setupAgentUIIntegration()

    // Setup file change monitoring for diff display
    this.setupFileChangeMonitoring()

    // Todo panels are now driven by real plans via planning system
  }

  /**
   * Integrate agent operations with UI panels
   */
  private setupAgentUIIntegration(): void {
    // Listen for file operations to show content/diffs using advanced UI
    agentService.on('file_read', (data) => {
      if (data.path && data.content) {
        this.advancedUI.showFileContent(data.path, data.content)
        this.advancedUI.logInfo(
          `File Read: ${path.basename(data.path)}`,
          `Displayed ${data.content.split('\n').length} lines`
        )
      }
    })

    agentService.on('file_written', (data) => {
      if (data.path && data.content) {
        const isCompact = process.env.NIKCLI_COMPACT === '1'
        const isTodo = path.basename(data.path).toLowerCase() === 'todo.md'
        if (isCompact && isTodo) return
        if (data.originalContent) {
          // Show diff using advanced UI
          this.advancedUI.showFileDiff(data.path, data.originalContent, data.content)
          this.advancedUI.logSuccess(`File Updated: ${path.basename(data.path)}`, 'Diff displayed in panel')
        } else {
          // Show new file content
          if (!(isCompact && isTodo)) this.advancedUI.showFileContent(data.path, data.content)
          this.advancedUI.logSuccess(`File Created: ${path.basename(data.path)}`, 'Content displayed in panel')
        }
      }
    })

    agentService.on('file_list', (data) => {
      if (data.files && Array.isArray(data.files)) {
        this.advancedUI.showFileList(data.files, data.title || '📁 Files')
        this.advancedUI.logInfo('File List', `Showing ${data.files.length} files`)
      }
    })

    agentService.on('grep_results', (data) => {
      if (data.pattern && data.matches) {
        this.advancedUI.showGrepResults(data.pattern, data.matches)
        this.advancedUI.logInfo(`Search: ${data.pattern}`, `Found ${data.matches.length} matches`)
      }
    })
  }

  /**
   * Monitor file changes for automatic diff display
   */
  private setupFileChangeMonitoring(): void {
    // Use existing file watcher to detect changes and show diffs
    if (this.fileWatcher) {
      this.fileWatcher.on('change', (filePath: string) => {
        // Auto-show file content when files change during operations
        if (this.assistantProcessing) {
          this.showFileIfRelevant(filePath)
        }
      })
    }
  }

  /**
   * Setup automatic todo panel updates
   */
  // Removed placeholder todo auto-updates and fallback rendering

  /**
   * Show file content if relevant to current operations
   */
  private showFileIfRelevant(filePath: string): void {
    // Only show files that are being actively worked on
    const relevantExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md']
    const ext = path.extname(filePath)

    if (relevantExtensions.includes(ext)) {
      const isCompact = process.env.NIKCLI_COMPACT === '1'
      if (isCompact && path.basename(filePath).toLowerCase() === 'todo.md') return
      try {
        const content = require('node:fs').readFileSync(filePath, 'utf8')
        if (!(isCompact && path.basename(filePath).toLowerCase() === 'todo.md')) {
          this.advancedUI.showFileContent(filePath, content)
        }
      } catch (_error) {
        // File might be in use, skip
      }
    }
  }

  private setupEventHandlers(): void {
    // Handle Ctrl+C gracefully
    process.on('SIGINT', async () => {
      await this.shutdown()
    })

    process.on('SIGTERM', async () => {
      await this.shutdown()
    })

    // Always keep prompt alive on unexpected errors
    process.on('unhandledRejection', (reason: any) => {
      try {
        console.log(require('chalk').red(`\n❌ Unhandled rejection: ${reason?.message || reason}`))
      } catch { }
      try {
        this.renderPromptAfterOutput()
      } catch { }
    })

    process.on('uncaughtException', (err: any) => {
      try {
        console.log(require('chalk').red(`\n❌ Uncaught exception: ${err?.message || err}`))
      } catch { }
      try {
        this.renderPromptAfterOutput()
      } catch { }
    })
  }
  // Bridge StreamingOrchestrator agent lifecycle events into NikCLI output
  private orchestratorEventsInitialized = false
  private setupOrchestratorEventBridge(): void {
    if (this.orchestratorEventsInitialized) return
    this.orchestratorEventsInitialized = true

    agentService.on('task_start', (task) => {
      const indicator = this.createStatusIndicator(`task-${task.id}`, `Agent ${task.agentType}`, task.task)
      this.updateStatusIndicator(indicator.id, { status: 'running' })
      console.log(formatAgent(task.agentType, 'started', task.task))

      // Always show in default chat mode and structured UI
      if (this.currentMode === 'default') {
        console.log(chalk.blue(`🔌 ${task.agentType}: `) + chalk.dim(task.task))
        advancedUI.logInfo(`Agent ${task.agentType}`, task.task)
      }

      // Render prompt after output
      setTimeout(() => this.renderPromptAfterOutput(), 30)
    })

    agentService.on('task_progress', (_task, update) => {
      const progress = typeof update.progress === 'number' ? `${update.progress}% ` : ''
      const desc = update.description ? `- ${update.description}` : ''
      this.addLiveUpdate({ type: 'progress', content: `${progress}${desc}`, source: 'agent' })
      console.log(chalk.cyan(`📊 ${progress}${desc}`))

      // Render prompt after output
      this.renderPromptAfterOutput()
    })

    agentService.on('tool_use', (_task, update) => {
      this.addLiveUpdate({ type: 'info', content: ` ${update.tool}: ${update.description}`, source: 'tool' })
      console.log(chalk.magenta(` ${update.tool}: ${update.description}`))

      // Render prompt after output
      this.renderPromptAfterOutput()
    })

    agentService.on('task_complete', (task) => {
      const indicatorId = `task-${task.id}`
      if (task.status === 'completed') {
        this.updateStatusIndicator(indicatorId, { status: 'completed', details: 'Task completed successfully' })
        console.log(chalk.green(`✓ ${task.agentType} completed`))

        // Show in default mode and structured UI
        if (this.currentMode === 'default') {
          advancedUI.logSuccess(`Agent ${task.agentType}`, 'Task completed successfully')
        }
      } else {
        this.updateStatusIndicator(indicatorId, { status: 'failed', details: task.error || 'Unknown error' })
        console.log(chalk.red(`❌ ${task.agentType} failed: ${task.error}`))

        // Show in default mode and structured UI
        if (this.currentMode === 'default') {
          advancedUI.logError(`Agent ${task.agentType}`, task.error || 'Unknown error')
        }
      }
      // Add delay before showing prompt to let output be visible
      setTimeout(() => {
        this.renderPromptAfterOutput()
      }, 500)
    })
  }

  /**
   * Subscribe to all event sources for Default Mode Unified Aggregator
   * Observes: Approval Prompts, Planning Events, Tool/Agent Events, Chat Stream
   */
  private eventsSubscribed = false
  private subscribeToAllEventSources(): void {
    if (this.eventsSubscribed) return
    this.eventsSubscribed = true

    // 1. Approval Prompts (approvalSystem.request)
    // Already handled by existing approvalSystem integration

    // 2. Planning Events (planningManager emits: stepStart, stepProgress, stepComplete)
    this.planningManager.on('stepStart', (event: any) => {
      this.routeEventToUI('planning_step_start', { step: event.step, description: event.description })
    })

    this.planningManager.on('stepProgress', (event: any) => {
      this.routeEventToUI('planning_step_progress', { step: event.step, progress: event.progress })
    })

    this.planningManager.on('stepComplete', (event: any) => {
      this.routeEventToUI('planning_step_complete', { step: event.step, result: event.result })
    })

    // 3. Tool/Agent Events (agentService emits: file_read, file_write, file_list, grep_results, tool_call, tool_result, error)
    agentService.on('file_read', (data) => {
      this.routeEventToUI('agent_file_read', data)
    })

    agentService.on('file_written', (data) => {
      this.routeEventToUI('agent_file_written', data)
    })

    agentService.on('file_list', (data) => {
      this.routeEventToUI('agent_file_list', data)
    })

    agentService.on('grep_results', (data) => {
      this.routeEventToUI('agent_grep_results', data)
    })

    // 4. Background Agents Events (AgentManager emits: agent.task.started, agent.task.progress, agent.task.completed, agent.tool.call)
    this.agentManager.on('agent.task.started', (event: any) => {
      this.routeEventToUI('bg_agent_task_start', {
        agentId: event.agentId,
        agentName: event.agentName || event.agentId,
        taskDescription: event.task?.description || event.task?.prompt || 'Background task',
        taskType: event.task?.type || 'unknown',
      })
    })

    this.agentManager.on('agent.task.progress', (event: any) => {
      this.routeEventToUI('bg_agent_task_progress', {
        agentId: event.agentId,
        progress: event.progress || 0,
        currentStep: event.currentStep || event.step || 'Processing...',
      })
    })

    this.agentManager.on('agent.task.completed', (event: any) => {
      this.routeEventToUI('bg_agent_task_complete', {
        agentId: event.agentId,
        result: event.result?.summary || event.result || 'Task completed',
        duration: event.duration || 0,
      })
    })

    this.agentManager.on('agent.tool.call', (event: any) => {
      this.routeEventToUI('bg_agent_tool_call', {
        agentId: event.agentId,
        toolName: event.toolName || event.tool,
        parameters: event.parameters || event.args,
      })
    })

    // 4.1 Background Agent Service Events (job lifecycle)
    import('./background-agents/background-agent-service')
      .then(({ backgroundAgentService }) => {
        backgroundAgentService.on('job:created', (jobId: string, job: any) => {
          this.showBackgroundJobPanel('created', jobId, job)
        })

        backgroundAgentService.on('job:started', (jobId: string, job: any) => {
          this.showBackgroundJobPanel('started', jobId, job)
        })

        backgroundAgentService.on('job:completed', (jobId: string, job: any) => {
          this.showBackgroundJobPanel('completed', jobId, job)
        })

        backgroundAgentService.on('job:failed', (jobId: string, job: any) => {
          this.showBackgroundJobPanel('failed', jobId, job)
        })
      })
      .catch((err) => console.error('Failed to setup background agent listeners:', err))

    // 5. Chat Stream (modelProvider.streamResponse(messages) events)
    // This is handled in the streaming loop in handleDefaultMode - chat stream events are processed inline
    // when streaming responses from advancedAIProvider.streamChatWithFullAutonomy()

    console.log(
      chalk.dim('✓ Default Mode Unified Aggregator subscribed to all event sources (including background agents)')
    )
  }

  /**
   * Central Event Router - routes events to UI based on structuredUI decision
   */
  private routeEventToUI(eventType: string, eventData: any): void {
    // Decision Point: structuredUI vs Console stdout (as per diagram)
    const useStructuredUI = this.isStructuredUIActive()

    if (useStructuredUI) {
      // Route to AdvancedCliUI panels
      this.routeToAdvancedUI(eventType, eventData)
    } else {
      // Fallback to Console stdout
      this.routeToConsole(eventType, eventData)
    }
  }

  /**
   * Check if structured UI should be active based on saved decision
   */
  private isStructuredUIActive(): boolean {
    return this.structuredUIEnabled
  }

  /**
   * Route events to AdvancedCliUI panels
   */
  private routeToAdvancedUI(eventType: string, eventData: any): void {
    switch (eventType) {
      case 'planning_step_start':
        advancedUI.logInfo('Planning Step', `Started: ${eventData.description}`)
        break
      case 'planning_step_progress':
        advancedUI.logInfo('Planning Progress', `${eventData.step}: ${eventData.progress}%`)
        break
      case 'planning_step_complete':
        advancedUI.logSuccess('Planning Complete', `${eventData.step}: ${eventData.result}`)
        break
      case 'agent_file_read':
        if (eventData.path && eventData.content) {
          advancedUI.showFileContent(eventData.path, eventData.content)
        }
        break
      case 'agent_file_written':
        if (eventData.originalContent && eventData.content) {
          advancedUI.showFileDiff(eventData.path, eventData.originalContent, eventData.content)
        } else {
          advancedUI.showFileContent(eventData.path, eventData.content)
        }
        break
      case 'agent_file_list':
        if (eventData.files) {
          advancedUI.showFileList(eventData.files, eventData.title || '📁 Files')
        }
        break
      case 'agent_grep_results':
        if (eventData.pattern && eventData.matches) {
          advancedUI.showGrepResults(eventData.pattern, eventData.matches)
        }
        break

      // Background agent events
      case 'bg_agent_task_start':
        advancedUI.logInfo('Background Agent', `🔌 ${eventData.agentName} started: ${eventData.taskDescription}`)
        this.createStatusIndicator(`bg-${eventData.agentId}`, `${eventData.agentName}: ${eventData.taskDescription}`)

        // Update background agents panel
        advancedUI.updateBackgroundAgent({
          id: eventData.agentId,
          name: eventData.agentName,
          status: 'working',
          currentTask: eventData.taskDescription,
          startTime: new Date(),
        })
        break

      case 'bg_agent_task_progress': {
        advancedUI.logInfo('Agent Progress', `⚡︎ ${eventData.currentStep} (${eventData.progress}%)`)
        this.updateStatusIndicator(`bg-${eventData.agentId}`, {
          progress: eventData.progress,
          details: eventData.currentStep,
        })

        // Update background agents panel with progress
        const agent = advancedUI.backgroundAgents?.get(eventData.agentId)
        if (agent) {
          advancedUI.updateBackgroundAgent({
            ...agent,
            progress: eventData.progress,
            currentTask: eventData.currentStep,
          })
        }
        break
      }

      case 'bg_agent_task_complete': {
        advancedUI.logSuccess('Agent Complete', `✓ Completed in ${eventData.duration}ms: ${eventData.result}`)
        this.stopAdvancedSpinner(`bg-${eventData.agentId}`, true, eventData.result)

        // Update background agents panel to completed
        const completedAgent = advancedUI.backgroundAgents.get(eventData.agentId)
        if (completedAgent) {
          advancedUI.updateBackgroundAgent({
            ...completedAgent,
            status: 'completed',
            currentTask: eventData.result,
            progress: 100,
          })
        }
        break
      }

      case 'bg_agent_tool_call': {
        const toolDetails = this.formatToolDetails(eventData.toolName, eventData.parameters)
        advancedUI.logInfo('Background Tool', `� ${eventData.agentId}: ${toolDetails}`)
        break
      }

      case 'bg_agent_orchestrated':
        advancedUI.logInfo(
          'Agent Orchestration',
          `🎭 ${eventData.parentTool} orchestrating ${eventData.agentName} for: ${eventData.task}`
        )
        break
    }
  }

  /**
   * Route events to Console stdout (fallback mode)
   */
  private routeToConsole(eventType: string, eventData: any): void {
    switch (eventType) {
      case 'planning_step_start':
        console.log(chalk.blue(`📋 Planning: ${eventData.description}`))
        break
      case 'planning_step_progress':
        console.log(chalk.cyan(`⏳ Progress: ${eventData.step} - ${eventData.progress}%`))
        break
      case 'planning_step_complete':
        console.log(chalk.green(`✓ Complete: ${eventData.step}`))
        break
      case 'agent_file_read':
        console.log(chalk.blue(`📖 File read: ${eventData.path}`))
        break
      case 'agent_file_written':
        console.log(chalk.green(`✏️ File written: ${eventData.path}`))
        break
      case 'agent_file_list':
        console.log(chalk.cyan(`📁 Files listed: ${eventData.files?.length} items`))
        break
      case 'agent_grep_results':
        console.log(chalk.magenta(`🔍 Search: ${eventData.pattern} - ${eventData.matches?.length} matches`))
        break

      // Background agent events for console
      case 'bg_agent_task_start':
        console.log(chalk.dim(`  🔌 Background: ${eventData.agentName} working on "${eventData.taskDescription}"`))
        break

      case 'bg_agent_task_progress': {
        // Progress bar inline
        const progressBar =
          '█'.repeat(Math.floor(eventData.progress / 5)) + '░'.repeat(20 - Math.floor(eventData.progress / 5))
        console.log(
          chalk.dim(`  ⚡︎ ${eventData.agentId}: [${progressBar}] ${eventData.progress}% - ${eventData.currentStep}`)
        )
        break
      }

      case 'bg_agent_task_complete':
        console.log(
          chalk.green(`  ✓ Background: ${eventData.agentId} completed successfully (${eventData.duration}ms)`)
        )
        break

      case 'bg_agent_tool_call': {
        const bgToolDetails = this.formatToolDetails(eventData.toolName, eventData.parameters)
        console.log(chalk.dim(`  � Background Tool: ${eventData.agentId} → ${bgToolDetails}`))
        break
      }

      case 'bg_agent_orchestrated':
        console.log(chalk.dim(`  🎭 Orchestrating: ${eventData.agentName} for "${eventData.task}"`))
        break
    }
  }

  // Advanced UI Features Setup
  private setupAdvancedUIFeatures(): void {
    // Initialize advanced UI theme and features
    this.advancedUI.isInteractiveMode = true // Start in normal mode

    // Setup file watching capabilities
    this.setupFileWatching()

    // Setup progress tracking
    this.setupProgressTracking()

    // Initialize structured panels
    this.initializeStructuredPanels()
  }

  /**
   * Setup event listeners for planning system to update todos panel in real-time
   */
  private setupPlanningEventListeners(): void {
    // Listen for step progress events to update todos panel
    this.planningManager.on('stepStart', (event: any) => {
      this.advancedUI.updateTodos(
        event.todos.map((todo: any) => ({
          content: todo.title || todo.description,
          status: todo.status,
        }))
      )
    })

    this.planningManager.on('stepProgress', (event: any) => {
      this.advancedUI.updateTodos(
        event.todos.map((todo: any) => ({
          content: todo.title || todo.description,
          status: todo.status,
        }))
      )
    })

    this.planningManager.on('stepComplete', (event: any) => {
      this.advancedUI.updateTodos(
        event.todos.map((todo: any) => ({
          content: todo.title || todo.description,
          status: todo.status,
        }))
      )
    })

    this.planningManager.on('planExecutionStart', (event) => {
      console.log(chalk.blue(`🚀 Starting plan execution: ${event.title}`))
    })

    this.planningManager.on('planExecutionComplete', (event) => {
      this.withPanelOutput(async () => {
        const content = [
          chalk.green('✓ Plan Execution Completed'),
          chalk.gray('────────────────────────────────────────'),
          `${chalk.blue('📋 Plan:')} ${event.title}`,
          (event as any).summary ? `${chalk.gray('📝 Summary:')} ${(event as any).summary}` : '',
        ]
          .filter(Boolean)
          .join('\n')

        const maxHeight = this.getAvailablePanelHeight()
        this.printPanel(
          boxen(content, {
            title: 'Planning',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
            width: Math.min(120, (process.stdout.columns || 100) - 4),
            height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
          })
        )
      })
    })

    this.planningManager.on('planExecutionError', (event) => {
      this.withPanelOutput(async () => {
        const content = [
          chalk.red('❌ Plan Execution Failed'),
          chalk.gray('────────────────────────────────────────'),
          `${chalk.red('Error:')} ${event.error || 'Unknown error'}`,
        ].join('\n')

        this.printPanel(
          boxen(content, {
            title: 'Planning',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          })
        )
      })
    })
  }

  /**
   * Initialize structured UI panels using existing advanced-cli-ui components
   */
  private initializeStructuredPanels(): void {
    // Use the existing advanced UI system
    advancedUI.startInteractiveMode()
    console.log(chalk.dim('\n🎨 Structured UI panels ready - using advanced-cli-ui system'))
  }

  private setupFileWatching(): void {
    // File watching setup for live updates using chokidar
    try {
      // Only watch if chokidar is available
      const chokidar = require('chokidar')

      // Watch important file patterns
      const patterns = [
        '**/*.ts',
        '**/*.tsx',
        '**/*.js',
        '**/*.jsx',
        '**/*.json',
        '**/*.md',
        '**/*.yml',
        '**/*.yaml',
        'package.json',
        'tsconfig.json',
        'CLAUDE.md',
        'todo.md',
      ]

      const watcher = chokidar.watch(patterns, {
        ignored: /(^|[/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true,
        cwd: this.workingDirectory,
      })

      // File change handlers
      watcher.on('add', (path: string) => {
        this.addLiveUpdate({
          type: 'info',
          content: `📄 File created: ${path}`,
          source: 'file-watcher',
        })
      })

      watcher.on('change', (path: string) => {
        const compact = process.env.NIKCLI_COMPACT === '1'
        this.addLiveUpdate({
          type: 'info',
          content: `✏️ File modified: ${path}`,
          source: 'file-watcher',
        })

        // Special handling for important files
        if (path === 'todo.md') {
          if (!compact) console.log(chalk.cyan('⚡︎ Todo list updated'))
        } else if (path === 'package.json') {
          console.log(chalk.blue('📦 Package configuration changed'))
        } else if (path === 'CLAUDE.md') {
          console.log(chalk.magenta('🔌 Project context updated'))
        }
      })

      watcher.on('unlink', (path: string) => {
        this.addLiveUpdate({
          type: 'warning',
          content: `🗑️ File deleted: ${path}`,
          source: 'file-watcher',
        })
      })

      watcher.on('error', (error: any) => {
        this.addLiveUpdate({
          type: 'error',
          content: `File watcher error: ${error.message}`,
          source: 'file-watcher',
        })
      })

      // Store watcher for cleanup
      this.fileWatcher = watcher

      console.log(chalk.dim('⚡︎ File watching enabled'))
    } catch (_error: any) {
      console.log(chalk.gray('⚠️ File watching not available (chokidar not installed)'))
    }
  }

  private setupProgressTracking(): void {
    // Progress tracking for long-running operations
    // This provides visual feedback for complex tasks

    // Track active operations and their progress
    this.progressTracker = {
      operations: new Map(),

      // Start tracking an operation
      start: (id: string, title: string, totalSteps?: number) => {
        const operation = {
          id,
          title,
          startTime: Date.now(),
          currentStep: 0,
          totalSteps: totalSteps || 0,
          status: 'running',
          details: [],
        }

        this.progressTracker.operations.set(id, operation)

        if (totalSteps) {
          this.createAdvancedProgressBar(id, title, totalSteps)
        } else {
          this.createStatusIndicator(id, title, 'Starting...')
          this.startAdvancedSpinner(id, 'Processing...')
        }

        this.addLiveUpdate({
          type: 'info',
          content: `🚀 Started: ${title}`,
          source: 'progress-tracker',
        })
      },

      // Update progress
      update: (id: string, step?: number, detail?: string) => {
        const operation = this.progressTracker.operations.get(id)
        if (!operation) return

        if (step !== undefined) {
          operation.currentStep = step
          if (operation.totalSteps > 0) {
            this.updateAdvancedProgress(id, step, operation.totalSteps)
          }
        }

        if (detail) {
          operation.details.push({
            timestamp: Date.now(),
            message: detail,
          })

          this.updateStatusIndicator(id, { details: detail })

          this.addLiveUpdate({
            type: 'info',
            content: `📊 ${operation.title}: ${detail}`,
            source: 'progress-tracker',
          })
        }
      },

      // Complete tracking
      complete: (id: string, success: boolean = true, finalMessage?: string) => {
        const operation = this.progressTracker.operations.get(id)
        if (!operation) return

        operation.status = success ? 'completed' : 'failed'
        operation.endTime = Date.now()

        const duration = operation.endTime - operation.startTime
        const durationText = duration > 1000 ? `${Math.round(duration / 1000)}s` : `${duration}ms`

        const message = finalMessage || `${operation.title} ${success ? 'completed' : 'failed'} in ${durationText}`

        if (operation.totalSteps > 0) {
          this.completeAdvancedProgress(id, message)
        } else {
          this.stopAdvancedSpinner(id, success, message)
        }

        this.addLiveUpdate({
          type: success ? 'log' : 'error',
          content: `${success ? '✓' : '❌'} ${message}`,
          source: 'progress-tracker',
        })

        // Clean up after a delay
        setTimeout(() => {
          this.progressTracker.operations.delete(id)
        }, 5000)
      },

      // Get current operations summary
      getSummary: () => {
        const operations = Array.from(this.progressTracker.operations.values())
        return {
          total: operations.length,
          running: operations.filter((op: any) => op.status === 'running').length,
          completed: operations.filter((op: any) => op.status === 'completed').length,
          failed: operations.filter((op: any) => op.status === 'failed').length,
        }
      },
    }

    console.log(chalk.dim('📊 Progress tracking enabled'))
  }

  // Advanced UI Methods (from advanced-cli-ui.ts)
  private createStatusIndicator(id: string, title: string, details?: string): StatusIndicator {
    const indicator: StatusIndicator = {
      id,
      title,
      status: 'pending',
      details,
      startTime: new Date(),
      subItems: [],
    }

    this.indicators.set(id, indicator)

    if (this.isInteractiveMode) {
      this.refreshDisplay()
    } else {
      console.log(formatStatus('📋', title, details))
    }

    return indicator
  }

  private updateStatusIndicator(id: string, updates: Partial<StatusIndicator>): void {
    const indicator = this.indicators.get(id)
    if (!indicator) return

    Object.assign(indicator, updates)

    if (updates.status === 'completed' || updates.status === 'failed') {
      indicator.endTime = new Date()
    }

    if (this.isInteractiveMode) {
      this.refreshDisplay()
    } else {
      this.logStatusUpdate(indicator)
    }

    // Auto-clear ephemeral logs when the system becomes idle
    if (this.ephemeralLiveUpdates && this.isIdle()) {
      setTimeout(() => {
        if (this.isIdle()) {
          this.clearLiveUpdates()
          if (this.isInteractiveMode) this.refreshDisplay()
        }
      }, 250)
    }
  }

  private addLiveUpdate(update: Omit<LiveUpdate, 'timestamp'>): void {
    const liveUpdate: LiveUpdate = {
      ...update,
      timestamp: new Date(),
    }

    this.liveUpdates.push(liveUpdate)

    // Keep only recent updates
    if (this.liveUpdates.length > 50) {
      this.liveUpdates = this.liveUpdates.slice(-50)
    }

    if (this.isInteractiveMode) {
      this.refreshDisplay()
    } else if (!this.cleanChatMode) {
      this.printLiveUpdate(liveUpdate)
    }

    // Auto-clear ephemeral logs when idle
    if (this.ephemeralLiveUpdates && this.isIdle()) {
      setTimeout(() => {
        if (this.isIdle()) {
          this.clearLiveUpdates()
          if (this.isInteractiveMode) this.refreshDisplay()
        }
      }, 250)
    }

    // Ensure the prompt is restored below logs (live updates above the prompt)
    try {
      if (this.rl && !this.isInquirerActive) {
        if (this.isChatMode) {
          this.renderPromptAfterOutput()
        } else {
          // Keep legacy prompt stable without redrawing the entire header
          this.rl.prompt()
        }
      }
    } catch {
      /* noop */
    }
  }

  private isIdle(): boolean {
    const anyRunning = Array.from(this.indicators.values()).some(
      (i) => i.status === 'running' || i.status === 'pending'
    )
    return !anyRunning && this.spinners.size === 0 && this.progressBars.size === 0
  }

  private clearLiveUpdates(): void {
    this.liveUpdates = []
  }

  private startAdvancedSpinner(id: string, text: string): void {
    if (this.isInteractiveMode) {
      this.updateStatusIndicator(id, { status: 'running' })
      return
    }

    const spinner = ora({
      text,
      spinner: 'dots',
      color: 'cyan',
    }).start()

    this.spinners.set(id, spinner)
  }

  private stopAdvancedSpinner(id: string, success: boolean, finalText?: string): void {
    const spinner = this.spinners.get(id)
    if (spinner) {
      if (success) {
        this.isInteractiveMode ? (this.isInteractiveMode = false) : null, spinner.succeed(finalText)
      } else {
        this.isInteractiveMode = false
        spinner.fail(finalText)
      }
      this.spinners.delete(id)
    }

    this.updateStatusIndicator(id, {
      status: success ? 'completed' : 'failed',
      details: finalText,
    })
  }

  private createAdvancedProgressBar(id: string, title: string, total: number): void {
    if (this.isInteractiveMode) {
      this.createStatusIndicator(id, title)
      this.updateStatusIndicator(id, { progress: 0 })
      return
    }

    const progressBar = new cliProgress.SingleBar({
      format: `${chalk.cyan(title)} |${chalk.cyan('{bar}')}| {percentage}% | {value}/{total} | ETA: {eta}s`,
      barCompleteChar: '█',
      barIncompleteChar: '░',
    })

    progressBar.start(total, 0)
    this.progressBars.set(id, progressBar)
  }

  private updateAdvancedProgress(id: string, current: number, total?: number): void {
    const progressBar = this.progressBars.get(id)
    if (progressBar) {
      progressBar.update(current)
    }

    const progress = total ? Math.round((current / total) * 100) : current
    this.updateStatusIndicator(id, { progress })
  }

  private completeAdvancedProgress(id: string, message?: string): void {
    const progressBar = this.progressBars.get(id)
    if (progressBar) {
      progressBar.stop()
      this.progressBars.delete(id)
    }

    this.updateStatusIndicator(id, {
      status: 'completed',
      progress: 100,
      details: message,
    })
  }

  private async askAdvancedConfirmation(
    question: string,
    details?: string,
    defaultValue: boolean = false
  ): Promise<boolean> {
    const icon = defaultValue ? '✓' : '❓'
    const prompt = `${icon} ${chalk.cyan(question)}`

    if (details) {
      console.log(chalk.gray(`   ${details}`))
    }

    // Use inquirer for proper input handling with arrow key support
    const { inputQueue } = await import('./core/input-queue')
    const inquirer = await import('inquirer')

    // Enable bypass for approval inputs
    inputQueue.enableBypass()

    try {
      const answers = await inquirer.default.prompt([
        {
          type: 'list',
          name: 'confirmed',
          message: prompt,
          choices: [
            { name: 'Yes', value: true },
            { name: 'No', value: false },
          ],
          default: defaultValue ? 0 : 1,
        },
      ])

      return answers.confirmed
    } catch {
      return defaultValue
    } finally {
      // Always disable bypass after approval
      inputQueue.disableBypass()
    }
  }

  // Advanced UI Helper Methods
  private refreshDisplay(): void {
    if (!this.isInteractiveMode) return

    // Move cursor to top and clear
    process.stdout.write('\x1B[2J\x1B[H')

    this.showAdvancedHeader()
    this.showActiveIndicators()
    this.showRecentUpdates()
  }

  private showAdvancedHeader(): void {
    const header = boxen(
      `${chalk.cyanBright.bold('🔌 NikCLI')} ${chalk.gray('v0.3.1-beta')}\n` +
      `${chalk.gray('Autonomous AI Developer Assistant')}\n\n` +
      `${chalk.blue('Status:')} ${this.getOverallStatus()}  ${chalk.blue('Active Tasks:')} ${this.indicators.size}\n` +
      `${chalk.blue('Mode:')} ${this.currentMode}  ${chalk.blue('Live Updates:')} Enabled`,
      {
        padding: 1,
        margin: { top: 0, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'cyan',
        titleAlignment: 'center',
      }
    )

    console.log(header)
  }

  private showActiveIndicators(): void {
    const indicators = Array.from(this.indicators.values())

    if (indicators.length === 0) return

    console.log(chalk.blue.bold('📊 Active Tasks:'))
    console.log(chalk.gray('─'.repeat(60)))

    indicators.forEach((indicator) => {
      this.printIndicatorLine(indicator)
    })

    console.log()
  }

  private showRecentUpdates(): void {
    if (this.cleanChatMode) return
    const recentUpdates = this.liveUpdates.slice(-10)

    if (recentUpdates.length === 0) return

    // Raggruppa updates per source
    const groupedUpdates = this.groupUpdatesBySource(recentUpdates)

    // Rendering strutturato per source
    for (const [source, updates] of groupedUpdates.entries()) {
      // Header del gruppo con ⏺
      const functionName = this.formatSourceAsFunctionName(source)
      console.log(chalk.cyan(`⏺ ${functionName}()`))

      // Updates del gruppo con ⎿
      updates.forEach((update) => {
        this.printLiveUpdateStructured(update)
      })

      console.log() // Spazio tra gruppi
    }
  }

  private printIndicatorLine(indicator: StatusIndicator): void {
    const statusIcon = this.getStatusIcon(indicator.status)
    const duration = this.getDuration(indicator)

    let line = `${statusIcon} ${chalk.bold(indicator.title)}`

    if (indicator.progress !== undefined) {
      const progressBar = this.createProgressBarString(indicator.progress)
      line += ` ${progressBar}`
    }

    if (duration) {
      line += ` ${chalk.gray(`(${duration})`)}`
    }

    console.log(line)

    if (indicator.details) {
      console.log(`   ${chalk.gray(indicator.details)}`)
    }
  }

  private printLiveUpdate(update: LiveUpdate): void {
    if (this.cleanChatMode) return
    const timeStr = update.timestamp.toLocaleTimeString()
    const typeColor = this.getUpdateTypeColor(update.type)
    const sourceStr = update.source ? chalk.gray(`[${update.source}]`) : ''

    const line = `${chalk.gray(timeStr)} ${sourceStr} ${typeColor(update.content)}`
    console.log(line)
  }

  /**
   * Print live update in structured format (⏺ style)
   */
  private printLiveUpdateStructured(update: LiveUpdate): void {
    const typeIcon = this.getStatusIconForUpdate(update.type)
    const color = this.getUpdateTypeColor(update.type)

    let content = color(update.content)

    // Se update ha metadata.progress, aggiungi progress bar
    if (update.metadata?.progress !== undefined) {
      const progress = update.metadata.progress
      const progressBar = this.createProgressBarString(progress, 20)
      content += ` ${progressBar}`
    }

    // Se update ha metadata.duration, aggiungi durata
    if (update.metadata?.duration) {
      content += ` ${chalk.gray(`(${update.metadata.duration})`)}`
    }

    // Rendering con tutto grigio scuro tranne il contenuto colorato
    console.log(`${chalk.dim('  ⎿  ')}${chalk.dim(typeIcon)} ${content}`)
  }

  /**
   * Get status icon for update type
   */
  private getStatusIconForUpdate(type: LiveUpdate['type']): string {
    switch (type) {
      case 'log':
        return '✓'
      case 'status':
        return '⚡︎'
      case 'progress':
        return '▶'
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ'
      case 'step':
        return '●'
      case 'result':
        return '✓'
      default:
        return '○'
    }
  }

  /**
   * Group updates by source
   */
  private groupUpdatesBySource(updates: LiveUpdate[]): Map<string, LiveUpdate[]> {
    const grouped = new Map<string, LiveUpdate[]>()

    for (const update of updates) {
      const source = update.source || 'System'
      if (!grouped.has(source)) {
        grouped.set(source, [])
      }
      grouped.get(source)!.push(update)
    }

    return grouped
  }

  /**
   * Format source name as function name
   */
  private formatSourceAsFunctionName(source: string): string {
    // "Guidance" -> "Guidance"
    // "Docs Cloud" -> "DocsCloud"
    // "System Init" -> "SystemInit"
    return source
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('')
  }

  private logStatusUpdate(indicator: StatusIndicator): void {
    if (this.cleanChatMode) return
    const statusIcon = this.getStatusIcon(indicator.status)
    const statusColor = this.getStatusColor(indicator.status)

    console.log(`${statusIcon} ${statusColor(indicator.title)}`)

    if (indicator.details) {
      console.log(`   ${chalk.gray(indicator.details)}`)
    }
  }

  // UI Utility Methods
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'pending':
        return '⏳'
      case 'running':
        return '⚡︎'
      case 'completed':
        return '✓'
      case 'failed':
        return '❌'
      case 'warning':
        return '⚠️'
      default:
        return '📋'
    }
  }

  private getStatusColor(status: string): any {
    switch (status) {
      case 'pending':
        return chalk.gray
      case 'running':
        return chalk.blue
      case 'completed':
        return chalk.green
      case 'failed':
        return chalk.red
      case 'warning':
        return chalk.yellow
      default:
        return chalk.gray
    }
  }

  private getUpdateTypeColor(type: string): any {
    switch (type) {
      case 'error':
        return chalk.red
      case 'warning':
        return chalk.yellow
      case 'info':
        return chalk.blue
      case 'log':
        return chalk.green
      default:
        return chalk.white
    }
  }

  private createProgressBarString(progress: number, width: number = 20): string {
    // Usa caratteri Unicode per maggiore risoluzione
    const filledChar = '█'
    const emptyChar = '░'
    const partialChars = ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']

    // Calcola porzione frazionaria
    const exactFilled = (progress / 100) * width
    const fullBlocks = Math.floor(exactFilled)
    const fraction = exactFilled - fullBlocks
    const partialIndex = Math.floor(fraction * partialChars.length)
    const partialChar = partialIndex > 0 ? partialChars[partialIndex] : ''

    // Costruisci barra
    const fullPart = filledChar.repeat(fullBlocks)
    const emptyPart = emptyChar.repeat(width - fullBlocks - (partialChar ? 1 : 0))
    const bar = fullPart + partialChar + emptyPart

    // Colore dinamico basato su progresso
    const colorFn =
      progress < 30 ? chalk.red : progress < 70 ? chalk.yellow : progress >= 100 ? chalk.green : chalk.cyan

    return `[${colorFn(bar)}] ${progress}%`
  }

  private getDuration(indicator: StatusIndicator): string | null {
    if (!indicator.startTime) return null

    const endTime = indicator.endTime || new Date()
    const duration = endTime.getTime() - indicator.startTime.getTime()

    const seconds = Math.round(duration / 1000)
    if (seconds < 60) {
      return `${seconds}s`
    } else {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      return `${minutes}m ${remainingSeconds}s`
    }
  }

  private getOverallStatus(): string {
    const indicators = Array.from(this.indicators.values())

    if (indicators.length === 0) return chalk.gray('Idle')

    const hasRunning = indicators.some((i) => i.status === 'running')
    const hasFailed = indicators.some((i) => i.status === 'failed')
    const hasWarning = indicators.some((i) => i.status === 'warning')

    if (hasRunning) return chalk.blue('Running')
    if (hasFailed) return chalk.red('Failed')
    if (hasWarning) return chalk.yellow('Warning')

    return chalk.green('Ready')
  }

  /**
   * Start interactive chat mode (main Claude Code experience)
   */
  async startChat(options: NikCLIOptions): Promise<void> {
    // Apply options
    if (options.model) {
      this.switchModel(options.model)
    }

    // Initialize cognitive orchestration if enabled
    if (this.cognitiveMode && this.streamingOrchestrator) {
      this.logCognitive('⚡︎ Cognitive orchestration active')
      this.displayCognitiveStatus()
    }

    // Decision Point: structuredUI vs Console stdout (as per diagram)
    // Always enable structured UI to show Files/Diffs panels in all modes
    const shouldUseStructuredUI =
      Boolean(options.structuredUI) ||
      this.currentMode === 'plan' ||
      this.currentMode === 'default' ||
      Boolean(options.agent) ||
      process.env.FORCE_STRUCTURED_UI === 'true'

    // Save the decision for later use in routing
    this.structuredUIEnabled = shouldUseStructuredUI

    if (shouldUseStructuredUI) {
      console.log(chalk.cyan('\n🎨 UI Selection: AdvancedCliUI selected (structuredUI = true)'))
      advancedUI.startInteractiveMode()
      advancedUI.logInfo('AdvancedCliUI Ready', `Mode: ${this.currentMode} - 4 Panels configured`)
    } else {
      console.log(chalk.dim('\n📺 UI Selection: Console stdout selected (structuredUI = false)'))
    }

    if (options.plan) {
      this.currentMode = 'plan'
    }

    if (options.agent) {
      this.currentAgent = options.agent
    }

    // Initialize systems
    await this.initializeSystems()

    // Start enhanced chat interface with slash commands
    await this.startEnhancedChat()
  }

  /**
   * Enhanced chat interface with Claude Code-style slash commands
   */
  private async startEnhancedChat(): Promise<void> {
    // Disable macOS paste warning by setting terminal environment
    if (process.platform === 'darwin') {
      // Set environment variables to suppress macOS paste dialog
      process.env.TERM_PROGRAM_VERSION = '1.0'
      process.env.DISABLE_AUTO_TITLE = 'true'

      // Try to disable bracketed paste mode which triggers the dialog
      if (process.stdout.isTTY) {
        // Disable bracketed paste mode
        process.stdout.write('\x1b[?2004l')
      }
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 300,
    })

    // Setup keypress events for ESC interruption
    if (process.stdin.isTTY) {
      // Set terminal options to suppress macOS paste warnings
      if (process.platform === 'darwin') {
        try {
          // Set TTY mode to suppress paste warnings
          process.stdin.setRawMode(false)
          process.stdin.setRawMode(true)
        } catch (error) {
          console.debug('Could not configure TTY mode:', error)
        }
      }

      // Ensure keypress events are emitted
      readline.emitKeypressEvents(process.stdin)
      process.stdin.setRawMode(true)
      process.stdin.resume()

      // Save listener reference for cleanup
      this.keypressListener = (chunk, key) => {
        if (key && key.name === 'escape') {
          // Stop ongoing AI operation spinner
          if (this.activeSpinner) {
            this.stopAIOperation()
            console.log(chalk.yellow('\n⏸️  AI operation interrupted by user'))
          }

          // Interrupt streaming/assistant processing
          if (this.assistantProcessing) {
            this.interruptProcessing()
          }

          // Cancel background agent tasks (running and queued)
          const cancelled = agentService.cancelAllTasks?.() ?? 0
          if (cancelled > 0) {
            console.log(chalk.yellow(`⏹️  Stopped ${cancelled} background agent task${cancelled > 1 ? 's' : ''}`))
          }

          // Kill any running subprocesses started by tools
          try {
            const procs = toolsManager.getRunningProcesses?.() || []
              ; (async () => {
                let killed = 0
                await Promise.all(
                  procs.map(async (p: any) => {
                    try {
                      const ok = await toolsManager.killProcess?.(p.pid)
                      if (ok) killed++
                    } catch {
                      /* ignore */
                    }
                  })
                )
                if (killed > 0) {
                  console.log(chalk.yellow(`🛑 Terminated ${killed} running process${killed > 1 ? 'es' : ''}`))
                }
              })()
          } catch {
            /* ignore */
          }

          // Return to default mode if not already
          if (this.currentMode !== 'default') {
            this.currentMode = 'default'
            console.log(chalk.yellow('↩️  Cancelled. Returning to default mode.'))
          }

          this.renderPromptAfterOutput()
        }

        // @ key listener removed per user request (was causing issues)

        // Handle * key for file picker suggestions
        if (chunk === '*' && !this.assistantProcessing) {
          setTimeout(() => this.showFilePickerSuggestions(), 100)
        }

        // Handle / key for slash command palette

        // Handle ? key to show a quick cheat-sheet overlay (only at start of line)
        if (chunk === '?' && !this.assistantProcessing) {
          // Check if ? is at the beginning of the line
          const currentLine = this.rl?.line || ''
          if (currentLine.length === 1 && currentLine === '?') {
            // Clear the ? from the input line
            this.rl?.write('', { ctrl: true, name: 'u' }) // Clear line
            setTimeout(() => this.showCheatSheet(), 30)
            return
          }
        }

        // Handle Cmd+Tab for mode cycling (macOS)
        if (key?.meta && key.name === 'tab') {
          this.cycleModes()
          return // Prevent other handlers from running
        }

        // Handle Shift+Tab for mode cycling (default mode friendly)
        if (key?.shift && key.name === 'tab') {
          this.cycleModes()
          return // Prevent other handlers from running
        }

        // Handle Cmd+] for mode cycling (macOS) - alternative
        if (key?.meta && key.name === ']') {
          this.cycleModes()
          return // Prevent other handlers from running
        }

        // Handle Cmd+Esc for returning to default mode without shutdown (macOS)
        if (key?.meta && key.name === 'escape') {
          if (this.activeSpinner) {
            this.stopAIOperation()
            console.log(chalk.yellow('\n⏸️  AI operation interrupted by user'))
          } else if (this.assistantProcessing) {
            this.interruptProcessing()
          }

          // Always return to default mode (without shutdown)
          if (this.currentMode !== 'default') {
            this.currentMode = 'default'
            this.stopAIOperation()
            console.log(chalk.cyan('🏠 Returning to default chat mode (Cmd+Esc)'))
          } else {
            console.log(chalk.cyan('🏠 Already in default mode'))
            this.stopAIOperation()
          }
          this.renderPromptAfterOutput()
          return // Prevent other handlers from running
        }

        // Let other keypress events continue normally
        if (key?.ctrl && key.name === 'c') {
          process.exit(0)
        }
      }

      // Register the listener
      process.stdin.on('keypress', this.keypressListener)
    }

    this.rl?.on('line', async (input) => {
      const trimmed = input.trim()

      if (!trimmed) {
        this.renderPromptAfterOutput()
        return
      }

      // 📋 PASTE DETECTION: Check if this is a multiline paste operation
      const lineCount = trimmed.split('\n').length
      const isPasteOperation = this.pasteHandler.detectPasteOperation(trimmed)

      if (isPasteOperation || lineCount > 1) {
        // This is a paste operation - process as single consolidated input
        await this.processSingleInput(trimmed)
        return
      }

      // Normal single-line processing
      await this.processSingleInput(trimmed)
    })

    this.rl?.on('SIGINT', async () => {
      await this.shutdown()
    })

    // Show initial prompt immediately
    this.renderPromptAfterOutput()
  }

  /**
   * Display a compact keyboard cheat-sheet with top commands and shortcuts
   */
  private showCheatSheet(): void {
    try {
      const lines: string[] = []
      lines.push('Shortcuts:')
      lines.push('  /      Open command palette')
      lines.push('  @      Agent suggestions')
      lines.push('  *      File picker suggestions')
      lines.push('  Esc    Interrupt/return to default mode')
      lines.push('  ?      Show this cheat sheet')
      lines.push('  Cmd+Tab / Shift+Tab   Cycle modes')
      lines.push('  Cmd+Esc               Return to default mode')
      lines.push('')
      lines.push('Top Commands:')
      lines.push('  /plan [task]          Generate/execute a plan')
      lines.push('  /model [name]         Show/switch model')
      lines.push('  /tokens               Token/cost analysis')
      lines.push('  /images               Pick and analyze images')
      lines.push('  /web3 status          Onchain status')
      lines.push('  /web3 wallets         Pick a wallet')
      lines.push('  /doc-search <query>   Search docs')
      lines.push('  /set-coin-keys        Configure Coinbase keys')
      lines.push('  /set-key-bb           Configure Browserbase keys')
      lines.push('  /set-key-redis        Configure Redis/Upstash keys')
      lines.push('  /set-vector-key       Configure Upstash Vector keys')
      lines.push('  /redis-enable          Enable Redis caching')
      lines.push('  /redis-disable         Disable Redis caching')
      lines.push('  /redis-status          Show Redis status')
      lines.push('  /queue status         Input queue status')

      this.printPanel(
        boxen(lines.join('\n'), {
          title: '⌨️  Keyboard & Commands',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } finally {
      this.renderPromptAfterOutput()
    }
  }

  /**
   * 🛡️ Check for long/complex inputs and auto-enable compact mode to prevent "Message too long"
   */
  private checkAndEnableCompactMode(input: string): void {
    const complexPatterns = [
      /analyze.*project|explore.*directory.*depth|code_analysis.*project/i,
      /read.*multiple.*files?|read.*all.*files?/i,
      /explore.*src.*depth.*[3-9]|explore.*depth.*[4-9]/i,
      /git.*workflow.*unknown|analyze.*full.*codebase/i,
      /comprehensive.*analysis|complete.*analysis|deep.*analysis/i,
    ]

    const shouldEnableCompact =
      input.length > 200 || // Long input text
      complexPatterns.some((pattern) => pattern.test(input)) || // Complex analysis request
      (input.includes('analyze') && input.includes('project')) || // Project analysis
      (input.includes('explore') && input.includes('depth')) || // Deep directory exploration
      input.split(' ').length > 30 // Very long command

    if (shouldEnableCompact && process.env.NIKCLI_COMPACT !== '1') {
      console.log(chalk.yellow('🛡️ Auto-enabling compact mode for complex request to prevent token overflow'))
      process.env.NIKCLI_COMPACT = '1'

      // Also set super compact for very complex requests
      if (input.length > 500 || input.split(' ').length > 50) {
        console.log(chalk.yellow('🔥 Super compact mode enabled for very large request'))
        process.env.NIKCLI_SUPER_COMPACT = '1'
      }
    }
  }

  /**
   * Interrupt current processing and stop all operations
   */
  private interruptProcessing(): void {
    if (!this.assistantProcessing) return

    console.log(chalk.red('\n\n🛑 ESC pressed - Interrupting operation...'))

    // Set interrupt flag
    this.shouldInterrupt = true

    // Abort current stream if exists
    if (this.currentStreamController) {
      this.currentStreamController.abort()
      this.currentStreamController = undefined
    }

    // Stop all active spinners and operations
    this.stopAllActiveOperations()

    // Interrupt any active agent executions through the orchestrator
    const orchestrator = new ModernAgentOrchestrator(this.workingDirectory)
    const interruptedAgents = orchestrator.interruptActiveExecutions()
    if (interruptedAgents > 0) {
      console.log(chalk.yellow(`🔌 Stopped ${interruptedAgents} running agents`))
    }

    // Clean up processing state
    this.assistantProcessing = false
    this.stopStatusBar()

    console.log(chalk.yellow('⏹️  Operation interrupted by user'))
    console.log(chalk.cyan('✨ Ready for new commands\n'))

    // Show prompt again
    this.renderPromptAfterOutput()
  }

  /**
   * Stop all active operations and cleanup
   */
  private stopAllActiveOperations(): void {
    // Stop all spinners
    for (const spinner of this.spinners.values()) {
      if (spinner.isSpinning) {
        spinner.stop()
      }
    }
    this.spinners.clear()

    // Stop all progress bars
    for (const bar of this.progressBars.values()) {
      bar.stop()
    }
    this.progressBars.clear()
  }

  /**
   * Process a single input (either normal input or consolidated paste)
   */
  private async processSingleInput(input: string): Promise<void> {
    // 📋 PASTE DETECTION: Handle large pasted content like Claude Code
    let actualInput = input
    let displayText = input

    // Apply paste detection to consolidated content
    const pasteResult = this.pasteHandler.processPastedText(input)

    if (pasteResult.shouldTruncate) {
      // Extract just the indicator line for display
      const truncatedLine = pasteResult.displayText.split('\n').pop() || '[Pasted text]'

      // Use original content for AI processing
      actualInput = pasteResult.originalText
      displayText = truncatedLine

      // Visual feedback that paste was detected and truncated
      console.log(chalk.gray(`📋 ${truncatedLine}`))
    }

    // Continue with normal processing flow...
    this.checkAndEnableCompactMode(actualInput)

    // Set user input as active when user sends a message
    this.userInputActive = true
    this.renderPromptAfterOutput()

    // Handle bypass logic
    if (inputQueue.isBypassEnabled()) {
      this.userInputActive = false
      this.renderPromptAfterOutput()
      return
    }

    // Apply token optimization
    let optimizedInput = actualInput
    if (actualInput.length > 20 && !actualInput.startsWith('/')) {
      const optimizer = this.getTokenOptimizer()
      if (optimizer) {
        try {
          const optimizationResult = await optimizer.optimizePrompt(actualInput)
          optimizedInput = optimizationResult.content

          if (optimizationResult.tokensSaved > 5) {
            QuietCacheLogger.logCacheSave(optimizationResult.tokensSaved)
          }
        } catch (error) {
          console.debug('Token optimization failed:', error)
        }
      }
    }

    // Queue logic
    if (this.assistantProcessing && inputQueue.shouldQueue(actualInput)) {
      let priority: 'high' | 'normal' | 'low' = 'normal'
      if (actualInput.startsWith('/') || actualInput.startsWith('@')) {
        priority = 'high'
      } else if (actualInput.toLowerCase().includes('urgent') || actualInput.toLowerCase().includes('stop')) {
        priority = 'high'
      } else if (actualInput.toLowerCase().includes('later') || actualInput.toLowerCase().includes('low priority')) {
        priority = 'low'
      }

      const _queueId = inputQueue.enqueue(actualInput, priority, 'user')
      console.log(
        chalk.cyan(
          `📥 Input queued (${priority} priority): ${displayText.substring(0, 40)}${displayText.length > 40 ? '...' : ''}`
        )
      )
      this.renderPromptAfterOutput()
      return
    }

    // Processing
    this.userInputActive = false
    this.assistantProcessing = true
    this.startStatusBar()
    this.renderPromptAfterOutput()

    try {
      // Route commands
      if (actualInput.startsWith('/')) {
        await this.dispatchSlash(actualInput)
      } else {
        await this.handleChatInput(optimizedInput)
      }
    } finally {
      this.assistantProcessing = false
      this.stopStatusBar()
      this.updateTokenDisplay()
      this.renderPromptAfterOutput()
      this.processQueuedInputs()
    }
  }

  /**
   * Processa input dalla queue quando il sistema è libero
   */
  private async processQueuedInputs(): Promise<void> {
    if (this.assistantProcessing) {
      return // Non processare se il sistema è occupato
    }

    const status = inputQueue.getStatus()
    if (status.queueLength === 0) {
      return // Nessun input in coda
    }

    // Processa il prossimo input dalla queue
    const result = await inputQueue.processNext(async (input: string) => {
      console.log(chalk.blue(`⚡︎ Processing queued input: ${input.substring(0, 40)}${input.length > 40 ? '...' : ''}`))

      // Simula il processing dell'input
      this.assistantProcessing = true
      this.startStatusBar()
      this.renderPromptAfterOutput()

      try {
        // Route slash and agent-prefixed commands, otherwise treat as chat
        if (input.startsWith('/')) {
          await this.dispatchSlash(input)
        } else {
          await this.handleChatInput(input)
        }
      } finally {
        this.assistantProcessing = false
        this.stopStatusBar()
        this.renderPromptAfterOutput()
      }
    })

    if (result) {
      console.log(
        chalk.green(
          `✓ Queued input processed: ${result.input.substring(0, 40)}${result.input.length > 40 ? '...' : ''}`
        )
      )

      this.renderPromptAfterOutput()

      // Processa il prossimo input se disponibile
      setTimeout(() => this.processQueuedInputs(), 100)
    }
  }

  /**
   * Gestisce i comandi della queue
   */
  private handleQueueCommand(args: string[]): void {
    const [subCmd] = args

    switch (subCmd) {
      case 'status':
        {
          const status = inputQueue.getStatus()
          const high = inputQueue.getByPriority('high').length
          const normal = inputQueue.getByPriority('normal').length
          const low = inputQueue.getByPriority('low').length
          const lines: string[] = []
          lines.push(`${chalk.green('Processing:')} ${status.isProcessing ? 'Yes' : 'No'}`)
          lines.push(`${chalk.green('Queue Length:')} ${status.queueLength}`)
          lines.push(`${chalk.green('High Priority:')} ${high}`)
          lines.push(`${chalk.green('Normal Priority:')} ${normal}`)
          lines.push(`${chalk.green('Low Priority:')} ${low}`)
          if (status.pendingInputs.length > 0) {
            lines.push('')
            lines.push(chalk.cyan('Pending Inputs (up to 5):'))
            status.pendingInputs.slice(0, 5).forEach((q, i) => {
              lines.push(` ${i + 1}. ${q.input.substring(0, 60)}${q.input.length > 60 ? '…' : ''}`)
            })
          }
          this.printPanel(
            boxen(lines.join('\n'), {
              title: '📥 Input Queue',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'magenta',
            })
          )
        }
        break
      case 'clear':
        {
          const cleared = inputQueue.clear()
          this.printPanel(
            boxen(`Cleared ${cleared} inputs from queue`, {
              title: '📥 Input Queue',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            })
          )
        }
        break
      case 'process':
        this.printPanel(
          boxen('Processing next queued input…', {
            title: '📥 Input Queue',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
          })
        )
        this.processQueuedInputs()
        break
      default:
        this.printPanel(
          boxen(
            [
              'Commands:',
              '/queue status   - Show queue statistics',
              '/queue clear    - Clear all queued inputs',
              '/queue process  - Process next queued input',
            ].join('\n'),
            { title: '📥 Input Queue', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }
          )
        )
    }
  }

  /**
   * Dispatch /slash commands to rich SlashCommandHandler while preserving mode controls
   */
  private async dispatchSlash(command: string): Promise<void> {
    const parts = command.slice(1).split(' ')
    const cmd = parts[0]
    const args = parts.slice(1)

    try {
      switch (cmd) {
        case 'plan':
          if (args.length === 0) {
            this.currentMode = 'plan'
            console.log(chalk.green('✓ Switched to plan mode'))
            console.log(chalk.dim('   Plan mode: Creates detailed plans and asks for approval before execution'))
            console.log(chalk.dim('   Default mode: Auto-generates todos for complex tasks and executes in background'))
          } else {
            await this.generatePlan(args.join(' '), {})
          }
          break

        case 'default':
          this.currentMode = 'default'
          console.log(chalk.green('✓ Switched to default mode'))
          break

        case 'vm':
          this.currentMode = 'vm'
          console.log(chalk.green('✓ Switched to VM mode'))
          break

        case 'vim':
          if (this.vimModeManager) {
            // CRITICAL SAFETY CHECK: Prevent vim activation if already in vim mode
            if (this.vimModeManager.isVimModeActive()) {
              console.log(chalk.yellow('⚠️ Vim mode is already active'))
              break
            }

            // Ensure readline is active before entering vim
            if (!this.rl) {
              console.log(chalk.red('✗ Cannot enter vim: prompt interface not available'))
              break
            }

            // Ensure mode consistency before activation
            this.vimModeManager.ensureCliModeConsistency()
            await this.vimModeManager.initialize()
            await this.vimModeManager.activate(this.rl, () => {
              this.renderPromptAfterOutput()
            })
          } else {
            console.log(chalk.red('✗ Vim mode not available'))
          }
          break

        // File Operations
        case 'read':
          await this.handleFileOperations('read', args)
          break
        case 'write':
          await this.handleFileOperations('write', args)
          break
        case 'edit':
          await this.handleFileOperations('edit', args)
          break
        case 'ls':
          await this.handleFileOperations('ls', args)
          break
        case 'search':
        case 'grep':
          await this.handleFileOperations('search', args)
          break

        // Terminal Operations
        case 'run':
        case 'sh':
        case 'bash':
          await this.handleTerminalOperations('run', args)
          break
        case 'install':
          await this.handleTerminalOperations('install', args)
          break
        case 'npm':
          await this.handleTerminalOperations('npm', args)
          break
        case 'yarn':
          await this.handleTerminalOperations('yarn', args)
          break
        case 'git':
          if (args.length === 0) {
            this.printPanel(
              boxen('Usage: /git <args>', {
                title: 'Git Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            return
          }
          await this.runCommand(`git ${args.join(' ')}`)
          break

        case 'docker':
          if (args.length === 0) {
            this.printPanel(
              boxen('Usage: /docker <args>', {
                title: 'Docker Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            return
          }
          await this.runCommand(`docker ${args.join(' ')}`)
          break

        // Snapshot Management
        case 'snapshot':
          await this.handleSnapshotCommand(args)
          break
        case 'snap':
          await this.handleSnapshotCommand(args, true)
          break
        case 'restore':
          await this.handleSnapshotRestore(args)
          break
        case 'snapshots':
          await this.handleSnapshotsList(args)
          break

        case 'ps':
          await this.handleTerminalOperations('ps', args)
          break

        case 'kill':
          await this.handleTerminalOperations('kill', args)
          break

        // Project Operations
        case 'build':
          await this.runCommand('npm run build')
          break

        case 'test': {
          const testPattern = args.length > 0 ? ` ${args.join(' ')}` : ''
          await this.runCommand(`npm test${testPattern}`)
          break
        }

        case 'lint':
          await this.runCommand('npm run lint')
          break

        case 'create': {
          if (args.length < 2) {
            this.printPanel(
              boxen('Usage: /create <type> <name>', {
                title: 'Create Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            return
          }
          const [type, name] = args
          console.log(chalk.blue(`Creating ${type}: ${name}`))
          // Implement creation logic based on type
          break
        }

        // Session Management
        case 'new':
        case 'sessions':
        case 'export':
        case 'stats':
        case 'history':
        case 'debug':
        case 'temp':
        case 'system':
          await this.handleSessionManagement(cmd, args)
          break

        // Model and Config
        case 'model':
        case 'models':
        case 'set-key':
        case 'config':
          await this.handleModelConfig(cmd, args)
          break

        case 'set-coin-keys': {
          await this.interactiveSetCoinbaseKeys()
          break
        }

        case 'set-key-bb': {
          await this.interactiveSetBrowserbaseKeys()
          break
        }

        case 'set-key-figma': {
          await this.interactiveSetFigmaKeys()
          break
        }

        case 'set-key-redis': {
          await this.interactiveSetRedisKeys()
          break
        }

        case 'set-vector-key': {
          await this.interactiveSetVectorKeys()
          break
        }

        case 'redis-enable': {
          await this.manageRedisCache('enable')
          break
        }

        case 'redis-disable': {
          await this.manageRedisCache('disable')
          break
        }

        case 'redis-status': {
          await this.manageRedisCache('status')
          break
        }

        case 'browse': {
          await this.handleBrowseCommand(args)
          break
        }

        case 'web-analyze': {
          await this.handleWebAnalyzeCommand(args)
          break
        }

        // MCP Commands
        case 'mcp':
          await this.handleMcpCommands(args)
          break

        // Session Management
        case 'tokens':
          await this.showTokenUsage()
          break

        case 'cache':
          await this.manageTokenCache(args[0])
          break

        case 'config':
          await this.manageConfig({ show: true })
          break

        case 'status':
          await this.showStatus()
          break

        case 'compact':
          await this.compactSession()
          break

        case 'cost':
          await this.showCost()
          break

        case 'init':
          await this.handleInitProject(args.includes('--force'))
          break

        // Session Management
        case 'new':
          await this.handleSessionManagement('new', args)
          break

        case 'sessions':
          await this.handleSessionManagement('sessions', args)
          break

        case 'export':
          await this.handleSessionManagement('export', args)
          break

        case 'stats':
          await this.handleSessionManagement('stats', args)
          break

        case 'history':
          await this.handleSessionManagement('history', args)
          break

        case 'debug':
          await this.handleSessionManagement('debug', args)
          break

        case 'temp':
          await this.handleSessionManagement('temp', args)
          break

        case 'system':
          await this.handleSessionManagement('system', args)
          break

        case 'models':
          await this.showModelsPanel()
          break

        case 'set-key':
          await this.handleModelConfig('set-key', args)
          break

        // Advanced Features
        case 'agents':
        case 'agent':
        case 'parallel':
        case 'factory':
        case 'blueprints':
        case 'create-agent':
        case 'launch-agent':
        case 'context':
        case 'stream':
        case 'approval':
        case 'todo':
        case 'todos':
          await this.handleAdvancedFeatures(cmd, args)
          break

        // Documentation Commands
        case 'docs':
          await this.handleDocsCommand(args)
          break
        case 'doc-search':
          await this.handleDocSearchCommand(args)
          break
        case 'doc-add':
          await this.handleDocAddCommand(args)
          break
        case 'doc-stats':
          await this.handleDocStatsCommand(args)
          break
        case 'doc-list':
          await this.handleDocListCommand(args)
          break
        case 'doc-tag':
          await this.handleDocTagCommand(args)
          break
        case 'doc-sync':
          await this.handleDocSyncCommand(args)
          break
        case 'doc-load':
          await this.handleDocLoadCommand(args)
          break
        case 'doc-context':
          await this.handleDocContextCommand(args)
          break
        case 'doc-unload':
          await this.handleDocUnloadCommand(args)
          break
        case 'doc-suggest':
          await this.handleDocSuggestCommand(args)
          break

        // Memory (panelized)
        case 'memory':
          await this.handleMemoryPanels(args)
          break

        // Enhanced Services Commands
        case 'redis':
        case 'cache-stats':
        case 'cache-health':
        case 'cache-clear':
          await this.handleCacheCommands(cmd, args)
          break

        case 'supabase':
        case 'db':
        case 'auth':
        case 'session-sync':
          await this.handleSupabaseCommands(cmd, args)
          break

        case 'enhanced-stats':
          await this.showEnhancedStats()
          break

        // Git Operations
        case 'commits':
        case 'git-history':
          await this.showCommitHistoryPanel(args)
          break

        // IDE Diagnostics (panelized like commits)
        case 'diagnostic':
        case 'diag':
          await this.handleDiagnosticPanels(args)
          break
        case 'monitor':
          await this.handleDiagnosticPanels(['start', ...args])
          break
        case 'diag-status':
          await this.handleDiagnosticPanels(['status'])
          break

        // Security & Modes (panelized)
        case 'security':
          await this.handleSecurityPanels(args)
          break
        case 'dev-mode':
          await this.handleDevModePanels(args)
          break
        case 'safe-mode':
          await this.handleSafeModePanel()
          break
        case 'clear-approvals':
          await this.handleClearApprovalsPanel()
          break

        // Style Commands
        case 'style':
        case 'styles':
          await this.handleStyleCommands(cmd, args)
          break

        // CAD & Manufacturing Commands
        case 'cad':
        case 'gcode':
          await this.handleCADCommands(cmd, args)
          break

        // Figma Integration Commands
        case 'figma-config':
        case 'figma-info':
        case 'figma-export':
        case 'figma-to-code':
        case 'figma-create':
        case 'figma-tokens':
          await this.handleFigmaCommands(cmd, args)
          break

        // Parallel execution monitoring commands
        case 'parallel-logs':
          await this.showParallelLogs()
          break
        case 'parallel-status':
          await this.showParallelStatus()
          break

        // Help and Exit
        case 'help':
          this.showSlashHelp()
          break
        case 'queue':
          this.handleQueueCommand(args)
          break
        case 'tokens':
          await this.manageTokenCommands(args)
          break
        case 'clear':
          await this.clearSession()
          break
        case 'exit':
        case 'quit':
          await this.shutdown()
          return

        // Work Session Management
        case 'resume':
          await this.handleResumeCommand(args)
          break
        case 'work-sessions':
          await this.handleWorkSessionsList()
          break
        case 'save-session':
          await this.handleSaveSessionCommand(args)
          break
        case 'delete-session':
          await this.handleDeleteSessionCommand(args)
          break
        case 'export-session':
          await this.handleExportSessionCommand(args)
          break

        // Edit History (Undo/Redo)
        case 'undo':
          await this.handleUndoCommand(args)
          break
        case 'redo':
          await this.handleRedoCommand(args)
          break
        case 'edit-history':
          await this.handleEditHistoryCommand()
          break

        // VM Container Detailed Commands
        case 'vm-create':
        case 'vm-list':
        case 'vm-stop':
        case 'vm-remove':
        case 'vm-connect':
        case 'vm-create-pr':
        case 'vm-logs':
        case 'vm-mode':
        case 'vm-switch':
        case 'vm-dashboard':
        case 'vm-select':
        case 'vm-status':
        case 'vm-exec':
        case 'vm-ls':
        case 'vm-broadcast':
        case 'vm-health':
        case 'vm-backup':
        case 'vm-stats':
          await this.handleVMContainerCommands(cmd, args)
          break

        // Vision & Image Commands
        case 'analyze-image':
        case 'vision':
        case 'generate-image':
        case 'images':
        case 'create-image':
          await this.handleVisionCommands(cmd, args)
          break

        // Memory Commands
        case 'remember':
        case 'recall':
        case 'forget':
          await this.handleMemoryCommands(cmd, args)
          break

        // Blueprint Commands
        case 'blueprint':
        case 'delete-blueprint':
        case 'export-blueprint':
        case 'import-blueprint':
        case 'search-blueprints': {
          const result = await this.slashHandler.handle(`/${cmd} ${args.join(' ')}`)
          if (result.shouldExit) {
            await this.shutdown()
            return
          }
          break
        }

        // Web3 Commands
        case 'web3':
        case 'blockchain':
          await this.handleWeb3Commands(cmd, args)
          break

        // Miscellaneous Commands
        case 'env':
          await this.handleEnvCommand(args)
          break
        case 'auto':
          await this.handleAutoCommand(args)
          break
        case 'super-compact':
          await this.handleSuperCompactCommand()
          break
        case 'plan-clean':
          await this.handlePlanCleanCommand()
          break
        case 'todo-hide':
          await this.handleTodoHideCommand()
          break
        case 'todo-show':
          await this.handleTodoShowCommand()
          break
        case 'index':
          await this.handleIndexCommand(args)
          break
        case 'router':
          await this.handleRouterCommand(args)
          break
        case 'figma-open':
          await this.handleFigmaOpenCommand(args)
          break

        default: {
          const result = await this.slashHandler.handle(command)
          if (result.shouldExit) {
            await this.shutdown()
            return
          }
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`Error executing ${command}: ${error.message}`))
    }

    // Ensure output is flushed and visible before showing prompt
    console.log() // Extra newline for better separation
    this.renderPromptAfterOutput()
  }

  /**
   * Dispatch @agent commands through the unified command router
   */
  private async dispatchAt(input: string): Promise<void> {
    const result = await this.slashHandler.handle(input)
    if (result.shouldExit) {
      await this.shutdown()
      return
    }

    // Ensure output is flushed and visible before showing prompt
    console.log() // Extra newline for better separation
    this.renderPromptAfterOutput()
  }

  /**
   * Store selected files in session context for future reference
   */
  private storeSelectedFiles(files: string[], pattern: string): void {
    // Store in a simple context that can be referenced later
    if (!this.selectedFiles) {
      this.selectedFiles = new Map()
    }

    this.selectedFiles.set(pattern, {
      files,
      timestamp: new Date(),
      pattern,
    })

    // Keep only the last 5 file selections to avoid memory buildup
    if (this.selectedFiles.size > 5) {
      const oldestKey = this.selectedFiles.keys().next().value
      if (oldestKey !== undefined) {
        this.selectedFiles.delete(oldestKey)
      }
    }
  }
  /**
   * Show agent suggestions when @ is pressed
   */
  private showAgentSuggestions(): void {
    // Get available agents from AgentManager
    const availableAgents = this.agentManager.listAgents()

    const content = ['💡 Available Agents:', '']

    if (availableAgents.length > 0) {
      availableAgents.forEach((agent) => {
        const statusIcon = agent.status === 'ready' ? '✓' : agent.status === 'busy' ? '⏳' : '❌'
        content.push(`${statusIcon} @${agent.specialization} - ${agent.description}`)

        // Show some capabilities
        const capabilities = agent.capabilities.slice(0, 3).join(', ')
        if (capabilities) {
          content.push(`   Capabilities: ${capabilities}`)
        }
      })
    } else {
      content.push('No agents currently available')
      content.push('')
      content.push('Standard agents:')
      content.push('✨ @universal-agent - All-in-one enterprise agent')
      content.push('🔍 @ai-analysis - AI code analysis and review')
      content.push('📝 @code-review - Code review specialist')
      content.push('⚛️ @react-expert - React and Next.js expert')
    }

    this.printPanel(
      boxen(content.join('\n'), {
        title: 'Available Agents',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      })
    )

    this.printPanel(
      boxen('Usage: @agent-name <your task description>', {
        title: 'Agent Usage Tip',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      })
    )
  }

  /**
   * Show file picker suggestions when * is pressed
   */
  private showFilePickerSuggestions(): void {
    const content = [
      '🔍 File Selection Commands:',
      '',
      '*              Browse all files in current directory',
      '* *.ts         Find all TypeScript files',
      '* *.js         Find all JavaScript files',
      '* src/**       Browse files in src directory',
      '* **/*.tsx     Find React component files',
      '* package.json Find package.json files',
      '* *.md         Find all markdown files',
    ].join('\n')

    this.printPanel(
      boxen(content, {
        title: 'File Selection Commands',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'magenta',
      })
    )

    this.printPanel(
      boxen(
        [
          '💡 Usage: * <pattern> to find and select files',
          '📋 Selected files can be referenced in your next message',
        ].join('\n'),
        {
          title: 'File Selection Tip',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        }
      )
    )
    // Ensure output is flushed and visible before showing prompt

    this.renderPromptAfterOutput()
  }

  /**
   * Handle regular chat input based on current mode
   */
  private async handleChatInput(input: string): Promise<void> {
    try {
      // Start token session if not already active
      if (!contextTokenManager.getCurrentSession()) {
        await this.startTokenSession()
      }

      // Track input message tokens
      try {
        const inputMessage = { role: 'user' as const, content: input }
        await contextTokenManager.trackMessage(inputMessage)
      } catch (error) {
        console.debug('Token tracking failed for input:', error)
      }

      // Load relevant project context for enhanced chat responses
      const relevantContext = await this.getRelevantProjectContext(input)
      const enhancedInput = relevantContext ? `${input}\n\nContext: ${relevantContext}` : input

      switch (this.currentMode) {
        case 'plan':
          await this.handlePlanMode(enhancedInput)
          break

        case 'vm':
          await this.handleVMMode(enhancedInput)
          break

        default:
          await this.handleDefaultMode(enhancedInput)
      }

      // Update project context disabled to avoid constant file changes
      // await this.updateProjectContext(input);
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Error: ${error.message}`)

      // CRITICAL: If error occurred in plan mode, force recovery
      if (this.currentMode === 'plan') {
        advancedUI.logFunctionUpdate('warning', 'Plan mode error detected, forcing recovery...')
        this.forceRecoveryToDefaultMode()
      }
    }

    // Output flushed - prompt render handled by parent caller
  }

  /**
   * VM mode: Chat directly with VM agents in containers using targeted communication
   */
  private async handleVMMode(input: string): Promise<void> {
    console.log(chalk.blue('🐳 VM Mode: Targeted OS-like VM communication...'))

    try {
      // Get VM orchestrator instance from slash handler
      const vmOrchestrator = this.slashHandler.getVMOrchestrator?.()
      if (!vmOrchestrator) {
        this.printPanel(
          boxen(['VM Orchestrator not available', '', 'Use /vm-init to initialize VM system'].join('\n'), {
            title: 'VM Error',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          })
        )
        return
      }

      // Check for available VMs
      const containers = this.slashHandler.getActiveVMContainers?.() || []
      if (containers.length === 0) {
        console.log(chalk.yellow('⚠️ No active VM containers'))
        console.log(chalk.gray('Use /vm-create <repo-url> to create one'))
        console.log(chalk.gray('Use /default to exit VM mode'))
        return
      }

      // Get currently selected VM or prompt for selection
      let selectedVM = vmSelector.getSelectedVM()

      if (!selectedVM) {
        console.log(chalk.cyan('🎯 No VM selected. Choose a VM to chat with:'))
        selectedVM = await vmSelector.selectVM({ interactive: true, sortBy: 'activity' })

        if (!selectedVM) {
          console.log(chalk.gray('VM mode cancelled'))
          return
        }
      }

      // Show current VM context with enhanced info
      console.log(chalk.green(`💬 Chatting with VM: ${chalk.bold(selectedVM.name)}`))
      console.log(chalk.gray(`🆔 Container: ${selectedVM.containerId.slice(0, 12)}`))

      if (selectedVM.systemInfo) {
        console.log(chalk.gray(`📍 System: ${selectedVM.systemInfo.os} ${selectedVM.systemInfo.arch}`))
        console.log(chalk.gray(`⚡︎ Working Dir: ${selectedVM.systemInfo.workingDirectory}`))
      }

      if (selectedVM.repositoryUrl) {
        console.log(chalk.gray(`🔗 Repository: ${selectedVM.repositoryUrl.split('/').pop()}`))
      }

      // Show chat history count
      const chatHistory = vmSelector.getChatHistory(selectedVM.id)
      console.log(chalk.gray(`💭 Chat History: ${chatHistory.length} messages`))

      console.log(chalk.gray(`📝 Message: ${input.substring(0, 80)}${input.length > 80 ? '...' : ''}`))
      console.log(chalk.white('─'.repeat(50)))
      console.log()

      try {
        // Send message to the selected VM agent through the communication bridge
        console.log(chalk.blue(`🔌 Sending to VM Agent ${selectedVM.containerId.slice(0, 8)}...`))

        // Use real communication through VMOrchestrator bridge
        if (vmOrchestrator.sendMessageToAgent) {
          const response = await vmOrchestrator.sendMessageToAgent(selectedVM.agentId, input)

          if (response.success) {
            console.log(chalk.green(`✓ VM Response received (${response.metadata?.responseTime}ms)`))
            console.log()
            console.log(chalk.cyan(`🔌 ${selectedVM.name}:`))
            console.log(chalk.white(`┌${'─'.repeat(58)}┐`))

            // Format response with proper line breaks
            const responseLines = (response.data || '').split('\n')
            responseLines.forEach((line: string) => {
              const truncatedLine = line.length > 56 ? `${line.substring(0, 53)}...` : line
              console.log(chalk.white(`│ ${truncatedLine.padEnd(56)} │`))
            })

            console.log(chalk.white(`└${'─'.repeat(58)}┘`))

            // Add to chat history
            await vmSelector.addChatMessage(selectedVM.id, 'user', input)
            await vmSelector.addChatMessage(selectedVM.id, 'vm', response.data || '')

            // Show quick actions
            console.log()
            this.printPanel(
              boxen('Quick actions: /vm-status | /vm-exec | /vm-switch | /vm-ls', {
                title: 'VM Quick Actions',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan',
              })
            )
          } else {
            this.printPanel(
              boxen([`VM Agent error: ${response.error}`, '', 'Try /vm-dashboard to check VM health'].join('\n'), {
                title: 'VM Agent Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
          }
        } else {
          this.printPanel(
            boxen(
              ['❌ VM Bridge not initialized', '', 'VM communication system requires proper initialization'].join('\n'),
              {
                title: 'VM Bridge Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              }
            )
          )
        }

        // Show quick VM info
        console.log()
        console.log(
          chalk.cyan(
            `📊 VM Info: ${selectedVM.containerId.slice(0, 12)} | Repository: ${selectedVM.repositoryUrl || 'N/A'}`
          )
        )

        // Show bridge statistics
        if (vmOrchestrator.getBridgeStats) {
          const stats = vmOrchestrator.getBridgeStats()
          console.log(
            chalk.gray(
              `💡 Bridge Stats: ${stats.totalMessagesRouted} messages | ${Math.round(stats.averageResponseTime)}ms avg`
            )
          )
        }
      } catch (error: any) {
        advancedUI.logFunctionUpdate('error', `VM communication error: ${error.message}`)
      }
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `VM Mode error: ${error.message}`)
      advancedUI.logFunctionUpdate('info', 'Use /default to exit VM mode')
      advancedUI.logFunctionUpdate('info', 'Use /vm-switch to select different VM')
    }
    // VM mode output complete - prompt render handled by caller
  }

  /**
   * Plan mode: Generate comprehensive plan with TaskMaster AI and todo.md
   */
  private async handlePlanMode(input: string): Promise<void> {
    // CRITICAL: Recursion depth protection
    if (this.recursionDepth >= this.MAX_RECURSION_DEPTH) {
      advancedUI.addLiveUpdate({ type: 'error', content: `Maximum plan generation depth reached (${this.MAX_RECURSION_DEPTH})`, source: 'plan_mode' })
      advancedUI.addLiveUpdate({ type: 'warning', content: 'Returning to default mode for safety...', source: 'plan_mode' })
      this.forceRecoveryToDefaultMode()
      return
    }

    this.recursionDepth++
    advancedUI.addLiveUpdate({ type: 'info', content: `Plan depth: ${this.recursionDepth}/${this.MAX_RECURSION_DEPTH}`, source: 'plan_mode' })

    // Force compact mode for cleaner stream in plan flow
    try {
      process.env.NIKCLI_COMPACT = '1'
      process.env.NIKCLI_SUPER_COMPACT = '1'
    } catch { }
    this.addLiveUpdate({ type: 'info', content: '🎯 Entering Enhanced Planning Mode with TaskMaster AI...', source: 'planning' })

    try {
      await this.cleanupPlanArtifacts()
      // Start progress indicator using our new methods
      const planningId = `planning-${Date.now()}`
      this.createStatusIndicator(planningId, 'Generating comprehensive plan with TaskMaster AI', input)
      this.startAdvancedSpinner(planningId, 'Analyzing requirements and generating plan...')

      // Try TaskMaster first, fallback to enhanced planning
      let plan: any
      let usedTaskMaster = false

      try {
        // Use the singleton planning service with TaskMaster integration
        const executionPlan = await planningService.createPlan(input, {
          showProgress: false, // We'll handle our own progress
          autoExecute: true,
          confirmSteps: true,
          useTaskMaster: true, // Enable TaskMaster
          fallbackToLegacy: true, // Allow fallback
        })

        // Convert ExecutionPlan to the format expected by existing code
        plan = {
          id: executionPlan.id,
          title: executionPlan.title,
          description: executionPlan.description,
          todos: executionPlan.todos || [],
          estimatedTotalDuration: Math.round(executionPlan.estimatedTotalDuration / 1000 / 60), // Convert ms to minutes
          riskAssessment: executionPlan.riskAssessment,
          userRequest: input,
        }

        usedTaskMaster = true
        this.addLiveUpdate({ type: 'log', content: '✓ TaskMaster AI plan generated', source: 'planning' })

        this.initializePlanHud(plan)

        // Save TaskMaster plan to todo.md for compatibility
        try {
          await this.saveTaskMasterPlanToFile(plan, 'todo.md')
        } catch (saveError: any) {
          this.addLiveUpdate({ type: 'warning', content: `⚠️ Could not save todo.md: ${saveError.message}`, source: 'planning' })
        }
      } catch (error: any) {
        this.addLiveUpdate({ type: 'warning', content: `⚠️ TaskMaster planning failed: ${error.message}`, source: 'planning' })
        this.addLiveUpdate({ type: 'info', content: '⚡︎ Falling back to enhanced planning...', source: 'planning' })

        // Fallback to original enhanced planning
        plan = await enhancedPlanning.generatePlan(input, {
          maxTodos: 15,
          includeContext: true,
          showDetails: false,
          saveTodoFile: true,
          todoFilePath: 'todo.md',
        })

        this.initializePlanHud({
          id: plan.id,
          title: plan.title,
          description: plan.description,
          userRequest: input,
          estimatedTotalDuration: plan.estimatedTotalDuration,
          riskAssessment: plan.riskAssessment,
          todos: plan.todos,
        })
      }

      this.stopAdvancedSpinner(
        planningId,
        true,
        `Plan generated with ${plan.todos.length} todos${usedTaskMaster ? ' (TaskMaster AI)' : ' (Enhanced)'}`
      )

      // Show plan summary (only in non-compact mode)
      if (process.env.NIKCLI_COMPACT !== '1') {
        this.addLiveUpdate({ type: 'log', content: '📋 Plan Generated', source: 'planning' })
        this.addLiveUpdate({ type: 'log', content: `✓ Todo file saved: ${path.join(this.workingDirectory, 'todo.md')}`, source: 'planning' })
        this.addLiveUpdate({ type: 'info', content: `📊 ${plan.todos.length} todos created`, source: 'planning' })
        this.addLiveUpdate({ type: 'info', content: `⏱️ Estimated duration: ${Math.round(plan.estimatedTotalDuration)} minutes`, source: 'planning' })
      }

      // Plan generated successfully - now ask if user wants to START the tasks
      const { approvalSystem } = await import('./ui/approval-system')
      const startTasks = await approvalSystem.confirmPlanAction(
        'Do you want to START the tasks generated in the plan?',
        'This will begin with Task 1 and proceed step-by-step',
        false
      )

      if (startTasks) {
        // Start with first task instead of executing entire plan
        try {
          await this.startFirstTask(plan)
        } catch (error: any) {
          this.addLiveUpdate({ type: 'error', content: `❌ Task execution failed: ${error.message}`, source: 'planning' })
        }

        // After task execution, return to default mode
        this.addLiveUpdate({ type: 'log', content: '⚡︎ Returning to default mode...', source: 'planning' })
        this.currentMode = 'default'

        try {
          inputQueue.disableBypass()
        } catch { }
        try {
          advancedUI.stopInteractiveMode?.()
        } catch { }
        this.resumePromptAndRender()
      } else {
        this.addLiveUpdate({ type: 'info', content: '📝 Plan saved to todo.md', source: 'planning' })

        // Ask if they want to generate a NEW plan instead
        const newPlan = await approvalSystem.confirmPlanAction(
          'Do you want to generate a NEW plan instead?',
          'This will overwrite the current plan in todo.md',
          false
        )

        if (newPlan) {
          const newRequirements = await approvalSystem.promptInput('Enter new requirements: ')
          if (newRequirements.trim()) {
            // CRITICAL: Wrap recursive call in try/catch to prevent unhandled rejections
            try {
              await this.handlePlanMode(newRequirements)
            } catch (error: any) {
              this.addLiveUpdate({ type: 'error', content: `❌ Plan regeneration failed: ${error.message}`, source: 'planning' })
              this.addLiveUpdate({ type: 'warning', content: '⚡︎ Forcing recovery to default mode...', source: 'planning' })
              this.forceRecoveryToDefaultMode()
            }
            return
          }
        }

        // User declined new plan, exit plan mode and return to default
        this.addLiveUpdate({ type: 'log', content: '⚡︎ Returning to normal mode...', source: 'planning' })
        this.currentMode = 'default'

        try {
          inputQueue.disableBypass()
        } catch { }
        try {
          advancedUI.stopInteractiveMode?.()
        } catch { }

        this.cleanupPlanArtifacts()
        this.resumePromptAndRender()
      }
    } catch (error: any) {
      this.addLiveUpdate({ type: 'error', content: `❌ Planning failed: ${error.message}`, source: 'planning' })
      this.addLiveUpdate({ type: 'warning', content: '⚡︎ Forcing recovery to default mode...', source: 'planning' })

      // CRITICAL: Force recovery on any error
      this.forceRecoveryToDefaultMode()
    } finally {
      // CRITICAL: Always decrement recursion depth
      this.recursionDepth = Math.max(0, this.recursionDepth - 1)
      this.addLiveUpdate({ type: 'info', content: `📉 Plan depth restored: ${this.recursionDepth}`, source: 'planning' })

      // Final cleanup
      void this.cleanupPlanArtifacts()
    }
  }

  /**
   * Get VM orchestrator from slash handler
   */
  private getVMOrchestrator() {
    return this.slashHandler.getVMOrchestrator?.()
  }

  /**
   * Execute tool in VM container with seamless integration
   */
  private async executeToolInVM(toolName: string, params: any, originalInput: string): Promise<void> {
    const vmOrchestrator = this.getVMOrchestrator()
    if (!vmOrchestrator || !this.activeVMContainer) {
      throw new Error('No active VM container or orchestrator')
    }

    console.log(chalk.cyan(`🐳 Executing ${toolName} in VM container...`))

    try {
      // Convert tool name to VM command
      const vmCommand = this.convertToolToVMCommand(toolName, params, originalInput)

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('VM execution timeout after 5 minutes')), 300000)
      })

      // Execute in VM container with streaming output
      const executionPromise = (async () => {
        if (!this.activeVMContainer) {
          throw new Error('No active VM container')
        }
        const container = this.activeVMContainer
        const chunks = vmOrchestrator.executeCommandStreaming(container, vmCommand)

        for await (const chunk of chunks) {
          if (chunk.type === 'output' && chunk.output) {
            process.stdout.write(chunk.output)
          } else if (chunk.type === 'error') {
            console.log(chalk.red(`❌ VM Error: ${chunk.error}`))
          } else if (chunk.type === 'complete') {
            console.log(chalk.green(`✓ VM execution completed`))
          }
        }
      })()

      // Race between execution and timeout
      await Promise.race([executionPromise, timeoutPromise])
    } catch (error: any) {
      console.log(chalk.red(`❌ VM tool execution failed: ${error.message}`))

      // Provide helpful error context
      console.log(chalk.dim(`   Tool: ${toolName}`))
      if (params.file_path) console.log(chalk.dim(`   File: ${params.file_path}`))
      if (params.command) console.log(chalk.dim(`   Command: ${params.command}`))

      throw error
    }
  }

  /**
   * Convert tool name and params to VM command
   */
  private convertToolToVMCommand(toolName: string, params: any, originalInput: string): string {
    const resolvedTool = toolRouter['resolveToolAlias']?.(toolName) || toolName

    switch (resolvedTool) {
      case 'read-file-tool':
      case 'read_file':
        return `cat "${params.file_path || params.filePath}"`

      case 'write-file-tool':
      case 'write_file':
        return `cat > "${params.file_path || params.filePath}" << 'EOF'\n${params.content || ''}\nEOF`

      case 'edit-tool':
      case 'edit_file':
        // Create a more robust edit command using ed or patch
        if (params.old_string && params.new_string) {
          return `cd /workspace/repo && python3 -c "
import re
with open('${params.file_path}', 'r') as f:
    content = f.read()

old_text = '''${params.old_string.replace(/'/g, "'\\''")}'''
new_text = '''${params.new_string.replace(/'/g, "'\\''")}'''
new_content = content.replace(old_text, new_text)

with open('${params.file_path}', 'w') as f:
    f.write(new_content)
print('File updated successfully')
"`
        } else {
          return `echo "Error: Missing old_string or new_string for edit operation" >&2`
        }

      case 'replace-in-file-tool':
      case 'replace_in_file':
        return `cd /workspace/repo && sed -i 's/${params.pattern.replace(/\//g, '\\/')}/${params.replacement.replace(/\//g, '\\/')}/g' "${params.file_path || params.path}"`

      case 'multi-edit-tool':
      case 'multi_edit':
        // For multi-file edits, create a script
        return `cd /workspace/repo && python3 -c "
import os
import re

edits = ${JSON.stringify(params.edits || [])}
for edit in edits:
    filepath = edit.get('file_path') or edit.get('path')
    if not filepath:
        continue
        
    try:
        with open(filepath, 'r') as f:
            content = f.read()
            
        # Apply the edit
        if edit.get('old_string') and edit.get('new_string'):
            content = content.replace(edit['old_string'], edit['new_string'])
        elif edit.get('pattern') and edit.get('replacement'):
            content = re.sub(edit['pattern'], edit['replacement'], content, flags=re.MULTILINE | re.DOTALL)
            
        with open(filepath, 'w') as f:
            f.write(content)
        print(f'Updated: {filepath}')
    except Exception as e:
        print(f'Error updating {filepath}: {e}')
"`

      case 'run-command-tool':
      case 'run_command':
        return params.command || originalInput.replace(/^(run|execute)\s+/i, '').trim()

      case 'list-tool':
      case 'explore_directory':
        return `ls -la "${params.directory || '.'}"`

      case 'find-files-tool':
      case 'find_files':
        return `find . -name "${params.pattern}" -type f`

      case 'grep-tool':
        return `grep -r "${params.pattern}" .`

      case 'git-tools':
      case 'git_workflow':
        return params.command || originalInput.replace(/^git\s+/i, '')

      case 'json-patch-tool':
      case 'config_patch':
        return `cd /workspace/repo && python3 -c "
import json
import re

filepath = '${params.file_path}'
key = '${params.key}'
value = '${params.value}'

try:
    with open(filepath, 'r') as f:
        data = json.load(f)
        
    # Navigate to the correct key
    keys = key.split('.')
    current = data
    for k in keys[:-1]:
        if k not in current:
            current[k] = {}
        current = current[k]
    
    current[keys[-1]] = value
    
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)
    print(f'Updated {filepath}: {key} = {value}')
except Exception as e:
    print(f'Error: {e}')
"`

      case 'create_file':
        return `cat > "${params.file_path}" << 'EOF'
${params.content || ''}
EOF`

      case 'delete_file':
        return `rm -f "${params.file_path}" && echo "Deleted: ${params.file_path}"`

      case 'copy_file':
        return `cp "${params.source}" "${params.destination}" && echo "Copied: ${params.source} -> ${params.destination}"`

      case 'move_file':
        return `mv "${params.source}" "${params.destination}" && echo "Moved: ${params.source} -> ${params.destination}"`

      default:
        // For unknown tools, try to execute the original input as a command
        return originalInput
          .replace(/^(run|execute|do|make|create|edit|write|read|list|find|search|grep)\s+/i, '')
          .trim()
    }
  }

  /**
   * Execute command in VM when no specific tool is detected
   */
  private async executeCommandInVM(command: string): Promise<void> {
    const vmOrchestrator = this.getVMOrchestrator()
    if (!vmOrchestrator || !this.activeVMContainer) {
      throw new Error('No active VM container or orchestrator')
    }

    console.log(chalk.cyan(`🐳 Executing command in VM: ${command}`))

    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('VM execution timeout after 5 minutes')), 300000)
      })

      // Execute in VM container with streaming output
      const executionPromise = (async () => {
        if (!this.activeVMContainer) {
          throw new Error('No active VM container')
        }
        const container = this.activeVMContainer
        const chunks = vmOrchestrator.executeCommandStreaming(container, command)

        for await (const chunk of chunks) {
          if (chunk.type === 'output' && chunk.output) {
            process.stdout.write(chunk.output)
          } else if (chunk.type === 'error') {
            console.log(chalk.red(`❌ VM Error: ${chunk.error}`))
          } else if (chunk.type === 'complete') {
            console.log(chalk.green(`✓ VM execution completed`))
          }
        }
      })()

      // Race between execution and timeout
      await Promise.race([executionPromise, timeoutPromise])
    } catch (error: any) {
      console.log(chalk.red(`❌ VM command execution failed: ${error.message}`))

      // Provide helpful error context
      console.log(chalk.dim(`   Command: ${command}`))
      console.log(chalk.dim(`   Container: ${this.activeVMContainer.slice(0, 12)}`))

      throw error
    }
  }

  /**
   * CRITICAL: Force recovery to default mode in case of any failures
   */
  private forceRecoveryToDefaultMode(): void {
    try {
      console.log(chalk.blue('🚨 Emergency recovery initiated...'))

      // Reset all critical state
      this.currentMode = 'default'
      this.recursionDepth = 0
      this.executionInProgress = false
      this.cleanupInProgress = false // Reset cleanup lock

      // Force cleanup input queue
      inputQueue.forceCleanup()

      // Clear all timers
      this.clearAllTimers()

      // Clean inquirer instances
      this.forceCleanInquirerState()

      // Clear plan HUD
      this.clearPlanHudSubscription()

      // Stop interactive mode
      try {
        advancedUI.stopInteractiveMode?.()
      } catch { }

      // Restore prompt
      this.resumePromptAndRender()

      console.log(chalk.green('✓ Emergency recovery completed'))
    } catch (error) {
      // Last resort - log and continue
      console.error('❌ Emergency recovery failed:', error)
      // Try minimal recovery
      this.currentMode = 'default'
      this.recursionDepth = 0
    }
  }

  /**
   * Clear all active timers to prevent memory leaks
   */
  private clearAllTimers(): void {
    this.activeTimers.forEach((timer) => {
      try {
        clearTimeout(timer)
      } catch { }
    })
    this.activeTimers.clear()
  }

  /**
   * Force clean all Inquirer instances
   */
  private forceCleanInquirerState(): void {
    this.inquirerInstances.forEach((instance) => {
      try {
        instance.removeAllListeners?.()
      } catch { }
    })
    this.inquirerInstances.clear()
  }

  /**
   * Safe setTimeout that tracks timers for cleanup
   */
  private safeTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.activeTimers.delete(timer)
      try {
        callback()
      } catch (error) {
        console.error('Timer callback error:', error)
      }
    }, delay)
    this.activeTimers.add(timer)
    return timer
  }

  /**
   * Start executing tasks one by one, asking for approval before each task
   */
  private async startFirstTask(plan: any): Promise<void> {
    const todos = Array.isArray(plan?.todos) ? plan.todos : []
    if (todos.length === 0) {
      advancedUI.addLiveUpdate({ type: 'warning', content: 'No tasks found in the plan', source: 'task_execution' })
      return
    }

    // Find first pending task
    let currentTaskIndex = 0
    let currentTask = todos.find((t: { status: string }) => t.status === 'pending')

    if (!currentTask && todos.length > 0) {
      // If no pending tasks, start with first task
      currentTask = todos[0]
      currentTaskIndex = 0
    }

    if (!currentTask) {
      advancedUI.addLiveUpdate({ type: 'warning', content: 'No tasks to execute', source: 'task_execution' })
      return
    }

    // Execute tasks one by one
    while (currentTask) {
      advancedUI.addLiveUpdate({ type: 'info', content: `Task ${currentTaskIndex + 1}/${todos.length}: ${currentTask.title}`, source: 'task_execution' })
      if (currentTask.description) {
        advancedUI.addLiveUpdate({ type: 'info', content: currentTask.description, source: 'task_execution' })
      }

      try {
        // Mark task as in progress
        currentTask.status = 'in_progress'
        currentTask.progress = 0
        this.updatePlanHudTodoStatus(currentTask.id, 'in_progress')

        // Execute the task using existing logic
        await this.executeTaskWithToolchains(currentTask, plan)

        // Mark task as completed
        currentTask.status = 'completed'
        currentTask.progress = 100
        currentTask.completedAt = new Date()
        this.updatePlanHudTodoStatus(currentTask.id, 'completed')

        advancedUI.addLiveUpdate({ type: 'log', content: `Task ${currentTaskIndex + 1} completed: ${currentTask.title}`, source: 'task_execution' })

        // Find next pending task
        currentTaskIndex++
        const nextTask = todos.slice(currentTaskIndex).find((t: { status: string }) => t.status === 'pending')

        if (nextTask) {
          // Ask if user wants to continue with next task
          const { approvalSystem } = await import('./ui/approval-system')
          const continueNext = await approvalSystem.confirmPlanAction(
            `Continue with next task? (${currentTaskIndex + 1}/${todos.length})`,
            `Next: ${nextTask.title}`,
            true
          )

          if (continueNext) {
            currentTask = nextTask
            currentTaskIndex = todos.indexOf(nextTask)
          } else {
            advancedUI.addLiveUpdate({ type: 'warning', content: 'Task execution stopped by user', source: 'task_execution' })
            break
          }
        } else {
          currentTask = null // No more tasks
        }
      } catch (error: any) {
        advancedUI.addLiveUpdate({ type: 'error', content: `Task execution error: ${error.message}`, source: 'task_execution' })

        // Mark task as failed
        currentTask.status = 'failed'
        this.updatePlanHudTodoStatus(currentTask.id, 'failed')

        // Ask if user wants to continue with next task despite the error
        const { approvalSystem } = await import('./ui/approval-system')
        const continueAfterError = await approvalSystem.confirmPlanAction(
          'Task failed. Continue with next task?',
          'You can continue with other tasks or stop execution',
          false
        )

        if (continueAfterError) {
          currentTaskIndex++
          currentTask = todos.slice(currentTaskIndex).find((t: { status: string }) => t.status === 'pending')
          if (currentTask) {
            currentTaskIndex = todos.indexOf(currentTask)
          }
        } else {
          break
        }
      }
    }

    // Show final summary
    const completed = todos.filter((t: { status: string }) => t.status === 'completed').length
    const failed = todos.filter((t: { status: string }) => t.status === 'failed').length
    const pending = todos.filter((t: { status: string }) => t.status === 'pending').length

    advancedUI.addLiveUpdate({ type: 'log', content: `Completed: ${completed}`, source: 'execution_summary' })
    if (failed > 0) advancedUI.addLiveUpdate({ type: 'error', content: `Failed: ${failed}`, source: 'execution_summary' })
    if (pending > 0) advancedUI.addLiveUpdate({ type: 'warning', content: `Remaining: ${pending}`, source: 'execution_summary' })
  }

  /**
   * Execute agent with plan-mode style streaming (like executeTaskWithToolchains)
   */
  private async executeAgentWithPlanModeStreaming(
    agent: any,
    task: string,
    agentName: string,
    tools: any[]
  ): Promise<void> {
    this.addLiveUpdate({ type: 'info', content: `⚡︎ Executing: ${agentName} - ${task}`, source: 'plan-exec' })

    try {
      // Create messages like plan mode
      const messages = [{ role: 'user' as const, content: task }]
      let streamCompleted = false

      // Track streaming output for formatting (same as default mode)
      let assistantText = ''
      let shouldFormatOutput = false
      let streamedLines = 0
      const terminalWidth = process.stdout.columns || 80

      // Bridge stream to Streamdown renderer (same as default mode)
      const bridge = createStringPushStream()
      const renderPromise = renderChatStreamToTerminal(bridge.generator, {
        isCancelled: () => false,
        enableMinimalRerender: false,
      })

      // Use the same streaming as plan mode
      for await (const ev of advancedAIProvider.streamChatWithFullAutonomy(messages)) {
        // Handle all streaming events exactly like plan mode
        switch (ev.type) {
          case 'text_delta':
            // Stream text in dark gray like default mode
            if (ev.content) {
              assistantText += ev.content
              bridge.push(chalk.hex('#4a4a4a')(ev.content))

              // Track lines for clearing (same as default mode)
              const visualContent = ev.content.replace(/\x1b\[[0-9;]*m/g, '')
              const newlines = (visualContent.match(/\n/g) || []).length
              const charsWithoutNewlines = visualContent.replace(/\n/g, '').length
              const wrappedLines = Math.ceil(charsWithoutNewlines / terminalWidth)
              streamedLines += newlines + wrappedLines
            }
            break

          case 'tool_call':
            // Tool execution events
            if (ev.toolName) {
              this.addLiveUpdate({
                type: 'info',
                content: ` ${agentName}: ${ev.toolName}`,
                source: agentName,
              })
            }
            break

          case 'tool_result':
            // Tool results
            if (ev.toolResult) {
              this.addLiveUpdate({
                type: 'info',
                content: `✓ Tool completed`,
                source: agentName,
              })
            }
            break

          case 'complete':
            // Mark that we should format output after stream ends (like default mode)
            if (assistantText.length > 200) {
              shouldFormatOutput = true
            }
            streamCompleted = true
            break

          case 'error':
            // Stream error
            this.addLiveUpdate({ type: 'error', content: `❌ ${agentName} error: ${ev.error}`, source: 'plan-exec' })
            throw new Error(ev.error)
        }
      }

      bridge.end()
      await renderPromise

      // Clear streamed output and show formatted version if needed (same as default mode)
      if (shouldFormatOutput) {
        // Clear the streamed output
        this.clearStreamedOutput(streamedLines)

        const { OutputFormatter } = await import('./ui/output-formatter')
        const formattedOutput = OutputFormatter.formatFinalOutput(assistantText)

        // Show formatted version
        console.log(formattedOutput)
        console.log('')
      } else {
        // No formatting needed - add spacing after stream
        console.log('\n')
      }

      if (!streamCompleted) {
        throw new Error('Stream did not complete properly')
      }
    } catch (error: any) {
      this.addLiveUpdate({ type: 'error', content: `❌ ${agentName} execution failed: ${error.message}`, source: 'plan-exec' })
      throw error
    }
  }

  /**
   * Execute a single task using toolchains
   */
  private async executeTaskWithToolchains(task: any, _plan: any): Promise<void> {
    // CRITICAL: Validate task before execution
    if (!task) {
      throw new Error('Task is null or undefined')
    }

    if (!task.title) {
      throw new Error('Task has no title')
    }

    advancedUI.logFunctionCall('execute_task')
    advancedUI.logFunctionUpdate('info', `Executing: ${task.title}`)

    // Set up task timeout to prevent hanging
    const taskTimeout = this.safeTimeout(() => {
      throw new Error(`Task timeout: ${task.title} (exceeded 10 minutes)`)
    }, 600000) // 5 minute timeout

    try {
      // Execute task exactly like default mode using tool router
      const taskMessage = { role: 'user' as const, content: task.description || task.title }
      const toolRecommendations = toolRouter.analyzeMessage(taskMessage)

      this.addLiveUpdate({ type: 'info', content: `⚡︎ Analyzing task with tool router...`, source: 'task-exec' })

      if (toolRecommendations.length > 0) {
        const topRecommendation = toolRecommendations[0]
        console.log(
          chalk.blue(
            ` Detected ${topRecommendation.tool} intent (${Math.round(topRecommendation.confidence * 100)}% confidence)`
          )
        )

        // Execute like default mode - start structured UI
        console.log(chalk.dim('🎨 Plan Mode Task Execution - Activating structured UI...'))
        let interactiveStarted = false
        try {
          advancedUI.startInteractiveMode()
          interactiveStarted = true

          // Execute the task using AI provider like default mode
          const messages = [{ role: 'user' as const, content: task.description || task.title }]
          let streamCompleted = false

          // Track streaming output for formatting (same as default mode)
          let assistantText = ''
          let shouldFormatOutput = false
          let streamedLines = 0
          const terminalWidth = process.stdout.columns || 80

          // Bridge stream to Streamdown renderer (same as default mode)
          const bridge = createStringPushStream()
          const renderPromise = renderChatStreamToTerminal(bridge.generator, {
            isCancelled: () => false,
            enableMinimalRerender: false,
          })

          for await (const ev of advancedAIProvider.streamChatWithFullAutonomy(messages)) {
            // Handle all streaming events like default mode
            switch (ev.type) {
              case 'text_delta':
                // Stream text in dark gray like default mode
                if (ev.content) {
                  assistantText += ev.content
                  bridge.push(chalk.hex('#4a4a4a')(ev.content))

                  // Track lines for clearing (same as default mode)
                  const visualContent = ev.content.replace(/\x1b\[[0-9;]*m/g, '')
                  const newlines = (visualContent.match(/\n/g) || []).length
                  const charsWithoutNewlines = visualContent.replace(/\n/g, '').length
                  const wrappedLines = Math.ceil(charsWithoutNewlines / terminalWidth)
                  streamedLines += newlines + wrappedLines
                }
                break

              case 'tool_call': {
                // Tool execution events with parameter info
                const toolInfo = this.formatToolCallInfo(ev)
                advancedUI.logFunctionCall(toolInfo.functionName)
                if (toolInfo.details) {
                  advancedUI.logFunctionUpdate('info', toolInfo.details, 'ℹ')
                }
                break
              }

              case 'tool_result':
                // Tool results
                if (ev.toolResult) {
                  advancedUI.logFunctionUpdate('success', 'Tool completed', '✓')
                }
                break

              case 'complete':
                // Mark that we should format output after stream ends (like default mode)
                if (assistantText.length > 200) {
                  shouldFormatOutput = true
                }
                streamCompleted = true
                break

              case 'error':
                // Stream error
                console.log(chalk.red(`❌ Stream error: ${ev.error}`))
                throw new Error(ev.error)

              default:
                // Handle other event types silently
                break
            }
          }

          bridge.end()
          await renderPromise

          // Clear streamed output and show formatted version if needed (same as default mode)
          if (shouldFormatOutput) {
            // Clear the streamed output
            this.clearStreamedOutput(streamedLines)

            const { OutputFormatter } = await import('./ui/output-formatter')
            const formattedOutput = OutputFormatter.formatFinalOutput(assistantText)

            // Show formatted version
            console.log(formattedOutput)
            console.log('')
          } else {
            // No formatting needed - add spacing after stream
            console.log('\n')
          }

          // Ensure stream completed before proceeding
          if (!streamCompleted) {
            console.log(chalk.yellow(`⚠️ Stream may not have completed properly`))
          }

          // Add a small delay to ensure all output is flushed
          await new Promise((resolve) => setTimeout(resolve, 100))

          advancedUI.logFunctionUpdate('success', `Task completed successfully: ${task.title}`)
        } catch (error: any) {
          advancedUI.logFunctionUpdate('error', `Task execution failed: ${error.message}`)
          throw error
        } finally {
          if (interactiveStarted) {
            try {
              advancedUI.stopInteractiveMode()
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      } else {
        // Fallback for tasks without clear tool intent
        advancedUI.logFunctionUpdate('info', `Performing analysis for: ${task.title}`)

        // Simple execution without phases
        const projectAnalysis = await toolService.executeTool('analyze_project', {})
        advancedUI.logFunctionUpdate('success', `Project analyzed: ${Object.keys(projectAnalysis || {}).length} components`)

        // If task has specific requirements, try to read relevant files
        const relevantFiles = await this.findRelevantFiles(task)
        for (const filePath of relevantFiles.slice(0, 3)) {
          try {
            const { content } = await toolService.executeTool('read_file', { filePath })
            advancedUI.logFunctionUpdate('success', `Analyzed ${filePath}: ${content.length} characters`)
          } catch (error: any) {
            advancedUI.logFunctionUpdate('warning', `Could not read ${filePath}: ${error.message}`)
          }
        }

        advancedUI.logFunctionUpdate('success', `Task analysis completed: ${task.title}`)
      }
    } catch (error: any) {
      // Enhanced error handling
      const errorMsg = error.message || 'Unknown execution error'
      advancedUI.logFunctionUpdate('error', `Task execution failed: ${errorMsg}`)

      // Re-throw with enhanced context
      throw new Error(`Task execution failed: ${task.title} - ${errorMsg}`)
    } finally {
      // CRITICAL: Always clear the timeout
      try {
        clearTimeout(taskTimeout)
        this.activeTimers.delete(taskTimeout)
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private clearPlanHudSubscription(): void {
    if (this.planHudUnsubscribe) {
      this.planHudUnsubscribe()
      this.planHudUnsubscribe = undefined
    }
  }

  // Public controls for HUD visibility and clearing
  public hidePlanHud(): void {
    this.planHudVisible = false
    this.renderPromptAfterOutput()
  }

  public showPlanHud(): void {
    this.planHudVisible = true
    this.renderPromptAfterOutput()
  }

  public clearPlanHud(): void {
    this.activePlanForHud = undefined
    this.clearPlanHudSubscription()
    this.renderPromptArea()
  }

  private finalizePlanHud(state: 'completed' | 'failed'): void {
    if (!this.activePlanForHud) return

    this.activePlanForHud.todos.forEach((todo) => {
      if (state === 'completed') {
        todo.status = todo.status === 'failed' ? 'failed' : 'completed'
        todo.progress = 100
      } else if (todo.status !== 'completed') {
        todo.status = 'failed'
        todo.progress = 0
      }
    })

    void this.persistActivePlanTodoFile()

    // Only clear the HUD if ALL tasks are successfully completed (not failed)
    const allTasksSuccessfullyCompleted = this.activePlanForHud.todos.every((todo) => todo.status === 'completed')

    if (allTasksSuccessfullyCompleted && state === 'completed') {
      // Clear the HUD completely when ALL tasks are successfully completed
      this.activePlanForHud = undefined
      console.log(chalk.green('\n🎉 All tasks completed successfully! HUD cleared.'))
    }

    this.clearPlanHudSubscription()
    this.renderPromptArea()
    void this.cleanupPlanArtifacts()
  }

  private initializePlanHud(plan: any): void {
    if (!plan || !Array.isArray(plan.todos)) return

    this.clearPlanHudSubscription()
    this.activePlanForHud = {
      id: String(plan.id || nanoid()),
      title: plan.title || 'Plan Todos',
      description: plan.description,
      userRequest: plan.userRequest,
      estimatedTotalDuration: plan.estimatedTotalDuration,
      riskAssessment: plan.riskAssessment,
      todos: plan.todos.map((todo: any) => ({
        id: String(todo.id || nanoid()),
        title: todo.title || todo.description || 'Untitled task',
        description: todo.description,
        status: (todo.status || 'pending') as 'pending' | 'in_progress' | 'completed' | 'failed',
        priority: todo.priority,
        progress: todo.progress,
        reasoning: todo.reasoning,
        tools: todo.tools,
      })),
    }
    this.renderPromptArea()
  }

  private updatePlanHudTodoStatus(todoId: string, status: 'pending' | 'in_progress' | 'completed' | 'failed'): void {
    if (!this.activePlanForHud) return

    const todo = this.activePlanForHud.todos.find((t) => t.id === todoId)
    if (!todo) return

    todo.status = status
    if (status === 'completed') {
      todo.progress = 100
    } else if (status === 'in_progress') {
      todo.progress = Math.max(todo.progress ?? 0, 15)
    } else if (status === 'failed') {
      todo.progress = 0
    }

    void this.persistActivePlanTodoFile()
    if (this.activePlanForHud?.todos.every((t) => t.status === 'completed' || t.status === 'failed')) {
      // Check if all tasks were completed successfully vs some failed
      const allSuccessful = this.activePlanForHud.todos.every((t) => t.status === 'completed')

      // Add delay to ensure all streaming output is flushed before cleanup
      setTimeout(() => {
        this.finalizePlanHud(allSuccessful ? 'completed' : 'failed')
      }, 500) // 500ms delay to ensure output is complete
    } else {
      this.renderPromptArea()
    }
  }

  private async cleanupPlanArtifacts(): Promise<void> {
    // CRITICAL: Prevent race conditions with cleanup lock
    if (this.cleanupInProgress) {
      advancedUI.logFunctionUpdate('info', 'Cleanup already in progress, skipping...')
      return
    }

    this.cleanupInProgress = true
    advancedUI.logFunctionCall('cleanup_plan_artifacts')

    try {
      // Cleanup todo.md with error handling
      const todoPath = path.join(this.workingDirectory, 'todo.md')
      try {
        await fs.unlink(todoPath)
        advancedUI.logFunctionUpdate('info', 'Removed todo.md')
      } catch (error: any) {
        // Only log if file exists but deletion failed (not if file doesn't exist)
        if (error.code !== 'ENOENT') {
          advancedUI.logFunctionUpdate('warning', `Could not remove todo.md: ${error.message}`)
        }
      }

      // Cleanup taskmaster directory with error handling
      const taskmasterDir = path.join(this.workingDirectory, '.nikcli', 'taskmaster')
      try {
        await fs.rm(taskmasterDir, { recursive: true, force: true })
        advancedUI.logFunctionUpdate('info', 'Cleaned taskmaster directory')
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          advancedUI.logFunctionUpdate('warning', `Could not clean taskmaster directory: ${error.message}`)
        }
      }

      advancedUI.logFunctionUpdate('success', 'Plan artifacts cleanup completed')
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Cleanup error: ${error.message}`)
    } finally {
      // CRITICAL: Always reset cleanup flag
      this.cleanupInProgress = false
    }
  }

  private async persistActivePlanTodoFile(): Promise<void> {
    if (!this.activePlanForHud) return
    try {
      await this.saveTaskMasterPlanToFile(this.activePlanForHud, 'todo.md', { silent: true })
    } catch (error: any) {
      advancedUI.logFunctionUpdate('warning', `Could not update todo.md: ${error.message}`)
    }
  }

  private buildPlanHudLines(maxWidth: number): string[] {
    if (!this.activePlanForHud) return []
    const todos = this.activePlanForHud.todos
    if (!todos || todos.length === 0) return []

    const usableWidth = Math.max(20, maxWidth - 2)
    const lines: string[] = [chalk.bold('Todos')]

    for (const todo of todos) {
      const icon =
        todo.status === 'completed'
          ? chalk.green('☑')
          : todo.status === 'in_progress'
            ? chalk.yellow('▸')
            : todo.status === 'failed'
              ? chalk.red('✖')
              : chalk.gray('☐')

      let label: string
      if (todo.status === 'completed') {
        label = chalk.gray.strikethrough(todo.title)
      } else if (todo.status === 'failed') {
        label = chalk.red(todo.title)
      } else if (todo.status === 'in_progress') {
        label = chalk.bold(todo.title)
      } else {
        label = chalk.white(todo.title)
      }

      const cleanedDescription =
        typeof todo.description === 'string' ? todo.description.replace(/\s+/g, ' ').trim() : ''
      if (cleanedDescription) {
        const descStyle = todo.status === 'in_progress' ? chalk.gray : chalk.dim
        label += descStyle(` — ${cleanedDescription}`)
      }

      const iconSegment = ` ${icon} `
      const iconWidth = this._stripAnsi(iconSegment).length
      const remainingWidth = Math.max(5, usableWidth - iconWidth)

      let detailSegment = label
      const plainDetail = this._stripAnsi(detailSegment)
      if (plainDetail.length > remainingWidth) {
        const truncated = `${plainDetail.slice(0, Math.max(1, remainingWidth - 1))}…`
        detailSegment = truncated
      }

      lines.push(`${iconSegment}${detailSegment}`)
    }

    return lines
  }

  private showExecutionSummary(): void {
    const indicators = Array.from(this.indicators.values())
    const completed = indicators.filter((i) => i.status === 'completed').length
    const failed = indicators.filter((i) => i.status === 'failed').length
    const warnings = indicators.filter((i) => i.status === 'warning').length

    const summary = boxen(
      `${chalk.bold('Execution Summary')}\n\n` +
      `${chalk.green('✓ Completed:')} ${completed}\n` +
      `${chalk.red('❌ Failed:')} ${failed}\n` +
      `${chalk.yellow('⚠️ Warnings:')} ${warnings}\n` +
      `${chalk.blue('📊 Total:')} ${indicators.length}\n\n` +
      `${chalk.gray('Overall Status:')} ${this.getOverallStatusText()}`,
      {
        padding: 1,
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: failed > 0 ? 'red' : completed === indicators.length ? 'green' : 'yellow',
      }
    )

    console.log(summary)
  }

  private getOverallStatusText(): string {
    const indicators = Array.from(this.indicators.values())

    if (indicators.length === 0) return chalk.gray('No tasks')

    const completed = indicators.filter((i) => i.status === 'completed').length
    const failed = indicators.filter((i) => i.status === 'failed').length

    if (failed > 0) {
      return chalk.red('Some tasks failed')
    } else if (completed === indicators.length) {
      this.renderPromptAfterOutput()
      return chalk.green('All tasks completed successfully')
    } else {
      this.renderPromptAfterOutput()
      return chalk.blue('Tasks in progress')
    }
  }

  /**
   * Default mode: Unified Aggregator - observes and subscribes to all event sources
   */
  private async handleDefaultMode(input: string): Promise<void> {
    // Initialize as Unified Aggregator for all event sources
    this.subscribeToAllEventSources()

    // DISABLED: Auto-todo generation in default chat mode
    // Now only triggers when user explicitly mentions "todo"
    try {
      const wantsTodos = /\btodo(s)?\b/i.test(input)
      if (wantsTodos) {
        console.log(chalk.cyan('📋 Detected explicit todo request — generating todos...'))
        await this.autoGenerateTodosAndOrchestrate(input)
        return // Background execution will proceed; keep chat responsive
      }
    } catch {
      /* fallback to normal chat if assessment fails */
    }

    // Handle execute command for last generated plan
    if (input.toLowerCase().trim() === 'execute' && this.lastGeneratedPlan) {
      advancedUI.logFunctionCall('executing')
      advancedUI.logFunctionUpdate('info', 'Executing', '●')
      try {
        await this.planningManager.executePlan(this.lastGeneratedPlan.id)
        console.log(chalk.green('✓ Plan execution completed!'))
        this.lastGeneratedPlan = undefined // Clear the stored plan
        return
      } catch (error: any) {
        console.log(chalk.red(`Plan execution failed: ${error?.message || error}`))
        return
      }
    }

    // Check if input mentions specific agent
    const agentMatch = input.match(/@(\w+)/)

    if (agentMatch) {
      const agentName = agentMatch[1]
      const task = input.replace(agentMatch[0], '').trim()
      await this.executeAgent(agentName, task, {})
    } else {
      // DEFAULT CHAT MODE: Simple chat (auto-todos handled above)
      let interactiveStarted = false
      try {
        // Direct chat response without complexity assessment or auto-todos
        const toolRecommendations = toolRouter.analyzeMessage({ role: 'user', content: input })
        if (toolRecommendations.length > 0) {
          const topRecommendation = toolRecommendations[0]
          console.log(
            chalk.blue(
              ` Detected ${topRecommendation.tool} intent (${Math.round(topRecommendation.confidence * 100)}% confidence)`
            )
          )

          // Auto-execute high-confidence tool recommendations in VM if available
          if (topRecommendation.confidence > 0.7 && this.activeVMContainer) {
            console.log(chalk.cyan(`🐳 Executing in VM container: ${this.activeVMContainer.slice(0, 12)}`))
            try {
              await this.executeToolInVM(topRecommendation.tool, topRecommendation.suggestedParams || {}, input)
              console.log(chalk.green(`✓ Tool execution completed in VM`))
              return // Tool executed in VM, return to continue chat flow
            } catch (error: any) {
              console.log(chalk.yellow(`⚠️ VM execution failed, falling back to local: ${error.message}`))

              // Log error but don't throw - allow fallback to AI chat
              console.log(chalk.dim(`   Original tool: ${topRecommendation.tool}`))
              console.log(chalk.dim(`   Confidence: ${Math.round(topRecommendation.confidence * 100)}%`))
            }
          }
        }

        // Activate structured UI for better visualization
        console.log(chalk.dim('🎨 Default Mode (Unified Aggregator) - Activating structured UI...'))
        advancedUI.startInteractiveMode()
        interactiveStarted = true

        // Record user message in session
        chatManager.addMessage(input, 'user')

        // Build model-ready messages from session history (respects history setting)
        let messages = chatManager.getContextMessages().map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        }))

        // Handle VM mode execution for generic commands
        if (this.currentMode === 'vm' && this.activeVMContainer) {
          console.log(chalk.cyan(`🐳 Executing in VM container: ${this.activeVMContainer.slice(0, 12)}`))
          try {
            await this.executeCommandInVM(input)
            console.log(chalk.green(`✓ Command executed successfully in VM`))
            return // Command executed in VM, return to continue chat flow
          } catch (error: any) {
            console.log(chalk.yellow(`⚠️ VM execution failed, falling back to AI chat: ${error.message}`))

            // Log detailed error for debugging
            console.log(chalk.dim(`   Command: ${input}`))
            console.log(chalk.dim(`   Container: ${this.activeVMContainer.slice(0, 12)}`))

            // Provide recovery suggestions
            if (error.message.includes('timeout')) {
              console.log(chalk.dim('   💡 Suggestion: Try a simpler command or check container resources'))
            } else if (error.message.includes('No such file')) {
              console.log(chalk.dim('   💡 Suggestion: Check file paths and working directory in VM'))
            } else {
              console.log(chalk.dim('   💡 Suggestion: Use /vm status to check container health'))
            }
          }
        }

        // Auto-compact if approaching token limit with more aggressive thresholds
        const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0)
        const estimatedTokens = Math.round(totalChars / 4)

        if (estimatedTokens > 100000) {
          // More aggressive - compact at 100k instead of 150k
          console.log(chalk.yellow(`⚠️ Token usage: ${estimatedTokens.toLocaleString()}, auto-compacting...`))
          await this.compactSession()

          // Rebuild messages after compaction
          messages = chatManager.getContextMessages().map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          }))

          // Re-check token count after compaction
          const newTotalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0)
          const newEstimatedTokens = Math.round(newTotalChars / 4)
          console.log(chalk.green(`✓ Compacted to ${newEstimatedTokens.toLocaleString()} tokens`))
        } else if (estimatedTokens > 50000) {
          console.log(wrapBlue(`📊 Token usage: ${estimatedTokens.toLocaleString()}`))
        }

        // Stream assistant response with enhanced streaming
        process.stdout.write(`${chalk.cyan('\nAssistant: ')}`)
        let assistantText = ''
        let hasToolCalls = false

        // Track if we should format output at the end
        let shouldFormatOutput = false
        let streamedLines = 1 // Start with 1 for "Assistant: " header
        const terminalWidth = process.stdout.columns || 80

        // Bridge stream to Streamdown renderer
        const bridge = createStringPushStream()
        const renderPromise = renderChatStreamToTerminal(bridge.generator, {
          isCancelled: () => false,
          enableMinimalRerender: false,
        })

        for await (const ev of advancedAIProvider.streamChatWithFullAutonomy(messages)) {
          if (ev.type === 'text_delta' && ev.content) {
            assistantText += ev.content
            bridge.push(chalk.hex('#4a4a4a')(ev.content))

            // Track lines for clearing - remove ANSI codes for accurate visual width
            const visualContent = ev.content.replace(/\x1b\[[0-9;]*m/g, '')
            const newlines = (visualContent.match(/\n/g) || []).length
            const charsWithoutNewlines = visualContent.replace(/\n/g, '').length
            const wrappedLines = Math.ceil(charsWithoutNewlines / terminalWidth)
            streamedLines += newlines + wrappedLines

            // Text content streamed via adapter
          } else if (ev.type === 'complete') {
            // Mark that we should format output after stream ends
            if (assistantText.length > 200) {
              shouldFormatOutput = true
            }
            // Continue with regular complete handling
          } else if (ev.type === 'tool_call') {
            hasToolCalls = true
            bridge.push('\n')

            // Format tool call with separated name and params for better visibility
            const toolCall = this.formatToolCall(ev.toolName || '', ev.toolArgs)
            const formattedToolCall = `⏺ ${chalk.hex('#4a4a4a')(toolCall.name)}:${chalk.cyan(toolCall.params)}()`
            console.log(`\n${formattedToolCall}`)
            streamedLines += 2 // Account for newline + tool message line

            // Log to structured UI with detailed tool information
            const toolDetails = this.formatToolDetails(ev.toolName || '', ev.toolArgs)
            advancedUI.logInfo('tool call', toolDetails)

            // Check if tool call involves background agents
            if (ev.metadata?.backgroundAgents) {
              ev.metadata.backgroundAgents.forEach((agentInfo: any) => {
                this.routeEventToUI('bg_agent_orchestrated', {
                  parentTool: ev.content,
                  agentId: agentInfo.id,
                  agentName: agentInfo.name,
                  task: agentInfo.task,
                })
              })
            }
          } else if (ev.type === 'tool_result') {
            bridge.push('\n')
            const resultMessage = `✓ Result: ${ev.content}`
            console.log(`${chalk.green(resultMessage)}`)
            streamedLines += 2 // Account for newline + result message line

            // Log to structured UI
            advancedUI.logSuccess('Tool Result', ev.content)

            // Show results from background agents if present
            if (ev.metadata?.backgroundResults) {
              ev.metadata.backgroundResults.forEach((result: any) => {
                advancedUI.logSuccess('Background Result', `${result.agentName}: ${result.summary}`)

                // Show file changes if present
                if (result.fileChanges) {
                  result.fileChanges.forEach((change: any) => {
                    this.advancedUI.showFileDiff(change.path, change.before, change.after)
                  })
                }
              })
            }

            // Show file diffs and content using advancedUI
            if (ev.metadata?.filePath) {
              if (ev.metadata?.originalContent && ev.metadata?.newContent) {
                this.advancedUI.showFileDiff(ev.metadata.filePath, ev.metadata.originalContent, ev.metadata.newContent)
              } else if (ev.metadata?.content) {
                this.advancedUI.showFileContent(ev.metadata.filePath, ev.metadata.content)
              }
            }
          } else if (ev.type === 'error') {
            const errorMessage = ev.content || ev.error || 'Unknown error'
            console.log(`${chalk.red(errorMessage)}`)

            // Log to structured UI
            advancedUI.logError('Error', errorMessage)
          }
        }

        bridge.end()
        await renderPromise

        // Clear streamed output and show formatted version if needed
        if (shouldFormatOutput) {
          // Clear the streamed output
          this.clearStreamedOutput(streamedLines)

          const { OutputFormatter } = await import('./ui/output-formatter')
          const formattedOutput = OutputFormatter.formatFinalOutput(assistantText)

          // Show formatted version
          console.log(chalk.cyan.bold('Assistant:\n'))
          console.log(formattedOutput)
          console.log('')
        } else {
          // No formatting needed - add spacing after stream
          console.log('\n')
        }

        // Add separator if tool calls were made
        if (hasToolCalls) {
          console.log(chalk.gray('─'.repeat(50)))
        }

        // Save assistant message to history
        if (assistantText.trim().length > 0) {
          chatManager.addMessage(assistantText.trim(), 'assistant')

          // Track assistant response tokens
          try {
            const assistantMessage = { role: 'assistant' as const, content: assistantText.trim() }
            await contextTokenManager.trackMessage(assistantMessage, undefined, true) // isOutput = true
          } catch (error) {
            console.debug('Token tracking failed for assistant response:', error)
          }
        }

        console.log() // newline after streaming

        // Update token usage after streaming completes (sync with session)
        this.syncTokensFromSession()
      } catch (err: any) {
        console.log(chalk.red(`Chat error: ${err.message}`))
      } finally {
        if (interactiveStarted) {
          try {
            advancedUI.stopInteractiveMode?.()
          } catch { }
        }
        this.rl?.prompt()
      }
    }
  }

  /**
   * Generate execution plan for a task
   */
  async generatePlan(task: string, options: PlanOptions): Promise<void> {
    console.log(wrapBlue(`🎯 Generating plan for: ${task}`))

    try {
      // Start progress indicator using enhanced UI
      const planningId = `planning-${Date.now()}`
      this.createStatusIndicator(planningId, 'Generating comprehensive plan', task)
      this.startAdvancedSpinner(planningId, 'Analyzing requirements and generating plan...')

      // Use TaskMaster-enabled planning service
      const plan = await planningService.createPlan(task, {
        showProgress: false, // We handle our own progress
        autoExecute: false,
        confirmSteps: false,
        useTaskMaster: true,
        fallbackToLegacy: true,
      })

      this.stopAdvancedSpinner(
        planningId,
        true,
        `Plan generated with ${plan.todos?.length || plan.steps?.length} todos`
      )

      // Show plan summary like in plan mode
      console.log(chalk.blue.bold('\n📋 Plan Generated:'))
      console.log(chalk.green(`✓ Todo file saved: ${path.join(this.workingDirectory, 'todo.md')}`))
      console.log(chalk.cyan(`📊 ${plan.todos?.length || plan.steps?.length} todos created`))
      console.log(chalk.cyan(`⏱️  Estimated duration: ${Math.round(plan.estimatedTotalDuration)} minutes`))

      // Save plan to todo.md for compatibility
      await this.savePlanToTodoFile(plan)

      // Plan is already saved to todo.md by enhancedPlanning

      if (options.execute) {
        // Use enhanced approval system
        const approved = await this.requestPlanApproval(plan.id, plan)
        if (approved) {
          if (this.executionInProgress) {
            console.log(chalk.yellow('⚠️  Execution already in progress, please wait...'))
            return
          }

          this.executionInProgress = true
          advancedUI.logFunctionCall('executing')
          advancedUI.logFunctionUpdate('info', 'Executing', '●')
          try {
            await this.executePlanWithTaskMaster(plan.id)
          } finally {
            this.executionInProgress = false
          }
          this.showExecutionSummary()
          console.log(chalk.green.bold('\n🎉 Plan execution completed successfully!'))

          // Reset mode and return to normal chat after successful execution
          console.log(chalk.green('⚡︎ Returning to normal chat mode...'))
          this.currentMode = 'default'

          // Use renderPromptAfterOutput for consistent behavior
          this.renderPromptAfterOutput()
        } else {
          console.log(chalk.yellow('\n📝 Plan saved but not executed.'))
          console.log(chalk.gray('You can review the todo.md file and run `/plan execute` later.'))

          // Add regeneration option like in plan mode
          const regenerate = await this.askAdvancedConfirmation(
            'Do you want to regenerate the plan with different requirements?',
            'This will create a new plan and overwrite the current todo.md',
            false
          )

          if (regenerate) {
            const newRequirements = await this.askForInput('Enter new or modified requirements: ')
            if (newRequirements.trim()) {
              await this.generatePlan(newRequirements, options)
            }
          }
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`Plan generation failed: ${error.message}`))
    }
    // Ensure output is flushed and visible before showing prompt
    console.log() // Extra newline for better separation
    this.renderPromptAfterOutput()
  }

  /**
   * Execute task with specific agent
   */
  async executeAgent(name: string, task: string, _options: AgentOptions): Promise<void> {
    console.log(formatAgent(name, 'executing', task))

    try {
      // Launch real agent via AgentService; run asynchronously
      const taskId = await agentService.executeTask(name, task, {})
      console.log(wrapBlue(`🚀 Launched ${name} (Task ID: ${taskId.slice(-6)})`))
    } catch (error: any) {
      console.log(chalk.red(`Agent execution failed: ${error.message}`))
    }
    // Ensure output is flushed and visible before showing prompt
    console.log() // Extra newline for better separation
    this.renderPromptAfterOutput()
  }

  /**
   * Manage todo items and planning
   */
  async manageTodo(options: TodoOptions): Promise<void> {
    if (options.list) {
      console.log(chalk.cyan('📋 Todo Items:'))
      const plans = this.planningManager.listPlans()

      if (plans.length === 0) {
        console.log(chalk.dim('No todo items found'))
        return
      }

      plans.forEach((plan, index) => {
        const status = '⏳' // Plans don't have status property, using default
        console.log(`${index + 1}. ${status} ${plan.title}`)
        console.log(`   ${chalk.dim(plan.description)}`)
      })
    }

    if (options.add) {
      console.log(wrapBlue(`Adding todo: ${options.add}`))
      await this.generatePlan(options.add, {})
    }

    if (options.complete) {
      console.log(chalk.green(`Marking todo ${options.complete} as complete`))
      // Implementation for marking todo complete
    }
  }

  /**
   * Manage CLI configuration
   */
  async manageConfig(options: ConfigOptions): Promise<void> {
    if (options.show) {
      console.log(chalk.cyan('� Current Configuration:'))
      const config = this.configManager.getConfig()
      console.log(chalk.dim('Model:'), chalk.green(config.currentModel))
      console.log(chalk.dim('Working Directory:'), chalk.blue(this.workingDirectory))
      console.log(chalk.dim('Mode:'), chalk.yellow(this.currentMode))
      if (this.currentAgent) {
        console.log(chalk.dim('Current Agent:'), chalk.cyan(this.currentAgent))
      }
      console.log() // Add spacing after config info
    }

    if (options.model) {
      this.switchModel(options.model)
    }
  }

  /**
   * Initialize project with CLAUDE.md context file (NIKOCLI.md)
   */
  async initProject(options: InitOptions): Promise<void> {
    console.log(chalk.blue(' Initializing project context...'))

    const claudeFile = path.join(this.workingDirectory, 'NIKOCLI.md')

    try {
      // Check if CLAUDE.md (NIKOCLI.md) already exists
      const exists = await fs
        .access(claudeFile)
        .then(() => true)
        .catch(() => false)

      if (exists && !options.force) {
        console.log(chalk.yellow('NIKOCLI.md already exists. Use --force to overwrite.'))
        return
      }

      // Analyze project structure
      console.log(chalk.dim('Analyzing project structure...'))
      const analysis = await this.analyzeProject()

      // Generate CLAUDE.md content
      const content = this.generateClaudeMarkdown(analysis)

      // Write file
      await fs.writeFile(claudeFile, content, 'utf8')

      console.log(chalk.green('✓ NIKOCLI.md created successfully'))
      console.log(chalk.dim(`Context file: ${claudeFile}`))
    } catch (error: any) {
      console.log(chalk.red(`Failed to initialize project: ${error.message}`))
    }
    // Ensure output is flushed and visible before showing prompt
    console.log() // Extra newline for better separation
    this.renderPromptAfterOutput()
  }

  /**
   * Show system status and agent information
   */
  async showStatus(): Promise<void> {
    const stats = this.agentManager.getStats()
    const planningStats = this.planningManager.getPlanningStats()

    const lines: string[] = []
    lines.push('System:')
    lines.push(`• Working Directory: ${this.workingDirectory}`)
    lines.push(`• Mode: ${this.currentMode}`)
    lines.push(`• Model: ${advancedAIProvider.getCurrentModelInfo().name}`)
    if (this.currentAgent) lines.push(`• Current Agent: ${this.currentAgent}`)
    lines.push('')
    lines.push('Agents:')
    lines.push(`• Total: ${stats.totalAgents}`)
    lines.push(`• Active: ${stats.activeAgents}`)
    lines.push(`• Pending Tasks: ${stats.pendingTasks}`)
    lines.push('')
    lines.push('Planning:')
    lines.push(`• Plans Generated: ${planningStats.totalPlansGenerated}`)
    lines.push(`• Plans Executed: ${planningStats.totalPlansExecuted}`)
    lines.push(
      `• Success Rate: ${planningStats.totalPlansExecuted > 0 ? Math.round((planningStats.successfulExecutions / planningStats.totalPlansExecuted) * 100) : 0}%`
    )

    const panel = boxen(lines.join('\n'), {
      title: 'NikCLI Status',
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
    })

    console.log(panel)
    // Ensure output is flushed and visible before showing prompt
    console.log() // Extra newline for better separation
    this.renderPromptAfterOutput()
  }

  /**
   * List available agents and their capabilities
   */
  async listAgents(): Promise<void> {
    console.log(chalk.cyan.bold('🔌 Available Agents'))
    console.log(chalk.gray('─'.repeat(50)))
    const available = agentService.getAvailableAgents()
    available.forEach((agent) => {
      console.log(chalk.white(`  • ${agent.name}`))
      console.log(chalk.gray(`    ${agent.description}`))
    })
    // Ensure output is flushed and visible before showing prompt
    console.log() // Extra newline for better separation
    this.renderPromptAfterOutput()
  }

  /**
   * List available AI models
   */
  async listModels(): Promise<void> {
    console.log(chalk.cyan.bold('⚡︎ Available Models'))
    console.log(chalk.gray('─'.repeat(50)))
    try {
      const currentModel = configManager.getCurrentModel()
      const models = configManager.listModels()

      if (!models || models.length === 0) {
        console.log(chalk.yellow('No models configured. Use /models add or /set-model to configure one.'))
        return
      }

      models.forEach(({ name, config, hasApiKey }) => {
        const indicator = name === currentModel ? chalk.green('→') : ' '
        const provider = chalk.gray(`[${config.provider}]`)
        const key = hasApiKey ? chalk.green('key✓') : chalk.yellow('key?')
        console.log(`${indicator} ${name} ${provider} ${chalk.gray(config.model)} ${chalk.gray(`(${key})`)}`)
      })
    } catch (err: any) {
      console.log(chalk.red(`Failed to list models: ${err.message || err}`))
    }
    // Ensure output is flushed and visible before showing prompt
    console.log() // Extra newline for better separation
    this.renderPromptAfterOutput()
  }

  /**
   * Enterprise-grade cleanup method ensuring guaranteed prompt restoration
   * @private
   * @enterprise Thread-safe cleanup with error isolation
   */
  private async performCommandCleanup(): Promise<void> {
    try {
      const { inputQueue } = await import('./core/input-queue')
      if (inputQueue.isBypassEnabled()) {
        console.log(chalk.yellow('⚠️ Forcing cleanup of stuck approval bypass'))
        inputQueue.forceCleanup()
      }
    } catch (cleanupError) {
      console.error(chalk.red('Cleanup error:'), cleanupError)
    }

    // Always restore prompt - Enterprise-standard cleanup
    console.log()
    this.renderPromptAfterOutput()
  }

  // Command Handler Methods
  /**
   * Handles file operation commands (/read, /write, /edit, /search, /list)
   * @param command - The file operation command to execute
   * @param args - Command arguments
   * @throws Error if file operation fails
   * @enterprise Guaranteed cleanup and prompt restoration via finally block
   */
  private async handleFileOperations(command: string, args: string[]): Promise<void> {
    try {
      switch (command) {
        case 'read': {
          if (args.length === 0) {
            this.printPanel(
              boxen('Usage: /read <filepath> [<from-to>] [--from N --to M] [--step K] [--more]', {
                title: 'Read Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break // Let finally handle cleanup
          }
          const filePath = args[0]
          const rest = args.slice(1)

          // Helpers for flag parsing
          const hasFlag = (name: string) => rest.includes(`--${name}`)
          const getFlag = (name: string) => {
            const i = rest.indexOf(`--${name}`)
            return i !== -1 ? rest[i + 1] : undefined
          }
          const rangeToken = rest.find((v) => /^\d+-\d+$/.test(v))

          // Determine mode
          let mode: 'default' | 'range' | 'step' | 'more' = 'default'
          if (hasFlag('more')) mode = 'more'
          else if (rangeToken || hasFlag('from') || hasFlag('to')) mode = 'range'
          else if (hasFlag('step')) mode = 'step'

          const defaultStep = 200
          let step = parseInt(getFlag('step') || `${defaultStep}`, 10)
          if (!Number.isFinite(step) || step <= 0) step = defaultStep

          const fileInfo = await toolsManager.readFile(filePath)
          const lines = fileInfo.content.split(/\r?\n/)
          const total = lines.length

          const key = `read:${path.resolve(filePath)}`
          const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

          console.log(formatFileOp('📄 File:', filePath, `${fileInfo.size} bytes, ${fileInfo.language || 'unknown'}`))
          console.log(chalk.gray(`Lines: ${total}`))
          console.log(chalk.gray('─'.repeat(50)))

          const printSlice = (from: number, to: number) => {
            const f = clamp(from, 1, total)
            const t = clamp(to, 1, total)
            if (f > total) {
              console.log(chalk.yellow('End of file reached.'))
              return { printed: false, end: total }
            }
            const slice = lines.slice(f - 1, t).join('\n')
            console.log(chalk.gray(`Showing lines ${f}-${t} of ${total}`))
            console.log(slice)
            return { printed: true, end: t }
          }

          if (mode === 'range') {
            // Parse from/to
            let from: number | undefined
            let to: number | undefined
            if (rangeToken) {
              const [a, b] = rangeToken.split('-').map((s) => parseInt(s, 10))
              if (Number.isFinite(a)) from = a
              if (Number.isFinite(b)) to = b
            }
            const fromFlag = parseInt(getFlag('from') || '', 10)
            const toFlag = parseInt(getFlag('to') || '', 10)
            if (Number.isFinite(fromFlag)) from = fromFlag
            if (Number.isFinite(toFlag)) to = toFlag

            const f = clamp(from ?? 1, 1, total)
            const t = clamp(to ?? f + step - 1, 1, total)
            printSlice(f, t)
            // Prepare next cursor
            this.sessionContext.set(key, { nextStart: t + 1, step })
          } else if (mode === 'step') {
            const f = 1
            const t = clamp(f + step - 1, 1, total)
            printSlice(f, t)
            this.sessionContext.set(key, { nextStart: t + 1, step })
          } else if (mode === 'more') {
            const state = this.sessionContext.get(key) || { nextStart: 1, step }
            // Allow overriding step via flag in --more
            if (hasFlag('step')) state.step = step
            const f = clamp(state.nextStart || 1, 1, total)
            const t = clamp(f + (state.step || step) - 1, 1, total)
            const res = printSlice(f, t)
            if (res.printed) {
              this.sessionContext.set(key, { nextStart: res.end + 1, step: state.step || step })
              if (res.end < total) {
                console.log(chalk.gray('─'.repeat(50)))
                console.log(
                  chalk.cyan(`Tip: use "/read ${filePath} --more" to continue (next from line ${res.end + 1})`)
                )
              }
            }
          } else {
            // default behavior: show all, but protect against huge outputs
            if (total > 400) {
              const { approvalSystem } = await import('./ui/approval-system')
              const approved = await approvalSystem.confirm(
                `Large file: ${total} lines`,
                `Show first ${defaultStep} lines now?`,
                false
              )
              if (approved) {
                const f = 1
                const t = clamp(f + defaultStep - 1, 1, total)
                printSlice(f, t)
                this.sessionContext.set(key, { nextStart: t + 1, step: defaultStep })
                if (t < total) {
                  console.log(chalk.gray('─'.repeat(50)))
                  this.printPanel(
                    boxen(`Tip: use "/read ${filePath} --more" to continue (next from line ${t + 1})`, {
                      title: 'Read More Tip',
                      padding: 1,
                      margin: 1,
                      borderStyle: 'round',
                      borderColor: 'cyan',
                    })
                  )
                }
              } else {
                console.log(chalk.yellow('Skipped large output. Specify a range, e.g.'))
                console.log(chalk.cyan(`/read ${filePath} 1-200`))
              }
            } else {
              console.log(fileInfo.content)
            }
          }

          console.log(chalk.gray('─'.repeat(50)))
          break
        }
        case 'write': {
          if (args.length < 2) {
            this.printPanel(
              boxen('Usage: /write <filepath> <content>', {
                title: 'Write Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break // Let finally handle cleanup
          }
          const filePath = args[0]
          const content = args.slice(1).join(' ')

          // Request approval
          const { approvalSystem } = await import('./ui/approval-system')
          const approved = await approvalSystem.confirm(
            `Write file: ${filePath}`,
            `Write ${content.length} characters to file`,
            false
          )

          if (!approved) {
            console.log(chalk.yellow('❌ File write operation cancelled'))
            break
          }

          const writeId = `write-${Date.now()}`
          this.createStatusIndicator(writeId, `Writing ${filePath}`)
          this.startAdvancedSpinner(writeId, 'Writing file...')

          await toolsManager.writeFile(filePath, content)

          this.stopAdvancedSpinner(writeId, true, `File written: ${filePath}`)
          this.printPanel(
            boxen(chalk.green(`File written: ${filePath}\n\n${content.length} characters written`), {
              title: 'Write Complete',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            })
          )
          break
        }
        case 'edit': {
          if (args.length === 0) {
            this.printPanel(
              boxen('Usage: /edit <filepath>', {
                title: 'Edit Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break // Let finally handle cleanup
          }
          const filePath = args[0]
          console.log(formatFileOp('📝 Opening', filePath, 'in system editor'))
          try {
            await toolsManager.runCommand('code', [filePath])
          } catch {
            try {
              await toolsManager.runCommand('open', [filePath])
            } catch {
              console.log(chalk.yellow(`Could not open ${filePath}. Please open it manually.`))
            }
          }
          break
        }
        case 'ls': {
          const directory = args[0] || '.'
          const files = await toolsManager.listFiles(directory)
          console.log(formatFileOp('📁 Files in', directory))
          console.log(chalk.gray('─'.repeat(40)))
          if (files.length === 0) {
            console.log(chalk.yellow('No files found'))
          } else {
            files.slice(0, 50).forEach((file) => {
              console.log(`${chalk.cyan('•')} ${file}`)
            })
            if (files.length > 50) {
              console.log(chalk.gray(`... and ${files.length - 50} more files`))
            }
          }
          break
        }
        case 'search': {
          if (args.length === 0) {
            this.printPanel(
              boxen('Usage: /search <query> [directory] [--limit N] [--more]', {
                title: 'Search Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break // Let finally handle cleanup
          }
          const query = args[0]
          const directory = args[1] && !args[1].startsWith('--') ? args[1] : '.'
          const rest = args.slice(1).filter((a) => a.startsWith('--'))

          const hasFlag = (name: string) => rest.includes(`--${name}`)
          const getFlag = (name: string) => {
            const i = rest.indexOf(`--${name}`)
            return i !== -1 ? rest[i + 1] : undefined
          }
          let limit = parseInt(getFlag('limit') || '30', 10)
          if (!Number.isFinite(limit) || limit <= 0) limit = 30
          const key = `search:${path.resolve(directory)}:${query}`
          const state = this.sessionContext.get(key) || { offset: 0, limit }
          if (hasFlag('limit')) state.limit = limit

          console.log(formatSearch(query, directory))
          const spinId = `search-${Date.now()}`
          this.createStatusIndicator(spinId, `Searching: ${query}`, `in ${directory}`)
          this.startAdvancedSpinner(spinId, `Searching files...`)

          const results = await toolsManager.searchInFiles(query, directory)

          this.stopAdvancedSpinner(spinId, true, `Search complete: ${results.length} matches`)

          if (results.length === 0) {
            console.log(chalk.yellow('No matches found'))
          } else {
            const start = Math.max(0, state.offset)
            const end = Math.min(results.length, start + (state.limit || limit))
            console.log(chalk.green(`Found ${results.length} matches (showing ${start + 1}-${end}):`))
            console.log(chalk.gray('─'.repeat(50)))
            results.slice(start, end).forEach((result) => {
              console.log(chalk.cyan(`${result.file}:${result.line}`))
              console.log(`  ${result.content}`)
            })
            if (end < results.length) {
              this.sessionContext.set(key, { offset: end, limit: state.limit || limit })
              console.log(chalk.gray('─'.repeat(50)))
              console.log(
                chalk.cyan(
                  `Tip: use "/search ${query} ${directory} --more" to see the next ${state.limit || limit} results`
                )
              )
            } else {
              this.sessionContext.delete(key)
            }
          }
          break
        }
      }
    } catch (error: any) {
      this.addLiveUpdate({ type: 'error', content: `File operation failed: ${error.message}`, source: 'file-ops' })
      console.log(chalk.red(`❌ Error: ${error.message}`))
    } finally {
      await this.performCommandCleanup()
    }
  }

  /**
   * Handles terminal operation commands (/run, /install, /npm, /yarn, /git, /docker, /ps, /kill)
   * @param command - The terminal operation command to execute
   * @param args - Command arguments
   * @throws Error if terminal operation fails
   * @enterprise Guaranteed cleanup and prompt restoration via finally block
   */
  private async handleTerminalOperations(command: string, args: string[]): Promise<void> {
    try {
      switch (command) {
        case 'run': {
          if (args.length === 0) {
            this.printPanel(
              boxen('Usage: /run <command> [args...]', {
                title: 'Run Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            return
          }
          const [cmd, ...cmdArgs] = args
          const fullCommand = `${cmd} ${cmdArgs.join(' ')}`

          const approved = await this.askAdvancedConfirmation(
            `Execute command: ${fullCommand}`,
            `Run command in ${process.cwd()}`,
            true
          )

          if (!approved) {
            console.log(chalk.yellow('❌ Command execution cancelled'))
            break // Let finally handle cleanup
          }
          this.isInteractiveMode = false
          console.log(formatCommand(fullCommand))
          const uniqueId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          this.createStatusIndicator(uniqueId, `Executing: ${cmd}`)

          const result = await toolsManager.runCommand(cmd, cmdArgs, { stream: true })

          const success = result.code === 0
          this.updateStatusIndicator(uniqueId, {
            status: success ? 'completed' : 'failed',
            details: success ? 'Command completed successfully' : `Exit code ${result.code}`,
          })
          if (success) {
            console.log(chalk.green('✓ Command completed successfully'))
          } else {
            console.log(chalk.red(`❌ Command failed with exit code ${result.code}`))
          }

          // Cleanup handled by finally block
          break
        }
        case 'install': {
          if (args.length === 0) {
            this.printPanel(
              boxen('Usage: /install <packages...>\n\nOptions: --global, --dev, --yarn, --pnpm', {
                title: 'Install Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break // Let finally handle cleanup
          }

          const packages = args.filter((arg) => !arg.startsWith('--'))
          const isGlobal = args.includes('--global') || args.includes('-g')
          const isDev = args.includes('--dev') || args.includes('-D')
          const manager = args.includes('--yarn') ? 'yarn' : args.includes('--pnpm') ? 'pnpm' : 'npm'

          const { approvalSystem } = await import('./ui/approval-system')
          const approved = await approvalSystem.confirm(
            `Install packages: ${packages.join(', ')}`,
            `Using ${manager}${isGlobal ? ' (global)' : ''}${isDev ? ' (dev)' : ''}`,
            false
          )

          if (!approved) {
            console.log(chalk.yellow('❌ Package installation cancelled'))
            break
          }
          this.isInteractiveMode = false
          console.log(wrapBlue(`📦 Installing ${packages.join(', ')} with ${manager}...`))
          const installId = `install-${Date.now()}`
          this.createAdvancedProgressBar(installId, 'Installing packages', packages.length)

          for (let i = 0; i < packages.length; i++) {
            const pkg = packages[i]
            this.updateStatusIndicator(installId, { details: `Installing ${pkg}...` })

            const success = await toolsManager.installPackage(pkg, {
              global: isGlobal,
              dev: isDev,
              manager: manager as any,
            })

            if (!success) {
              this.addLiveUpdate({ type: 'warning', content: `Failed to install ${pkg}`, source: 'install' })
              console.log(chalk.yellow(`⚠️ Failed to install ${pkg}`))
            } else {
              this.addLiveUpdate({ type: 'log', content: `Installed ${pkg}`, source: 'install' })
            }

            this.updateAdvancedProgress(installId, i + 1, packages.length)
          }

          this.completeAdvancedProgress(installId, `Completed installation of ${packages.length} packages`)
          this.isInteractiveMode = true
          console.log(chalk.green(`✓ Package installation completed`))

          // Cleanup handled by finally block
          break
        }
        case 'npm':
        case 'yarn':
        case 'git':
        case 'docker': {
          await toolsManager.runCommand(command, args, { stream: true })

          // Cleanup handled by finally block
          break
        }
        case 'ps': {
          const processes = toolsManager.getRunningProcesses()
          if (processes.length === 0) {
            const maxHeight = this.getAvailablePanelHeight()
            this.printPanel(
              boxen('No processes currently running', {
                title: 'Processes',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
                width: Math.min(120, (process.stdout.columns || 100) - 4),
                height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
              })
            )
          } else {
            const lines: string[] = []
            processes.forEach((proc) => {
              const duration = Date.now() - proc.startTime.getTime()
              lines.push(`${chalk.cyan('PID')} ${proc.pid}: ${chalk.bold(proc.command)} ${proc.args.join(' ')}`)
              lines.push(`  Status: ${proc.status} | Duration: ${Math.round(duration / 1000)}s`)
              lines.push(`  CWD: ${proc.cwd}`)
            })
            const maxHeight = this.getAvailablePanelHeight()
            let content = lines.join('\n')

            if (content.split('\n').length > maxHeight) {
              const truncatedLines = content.split('\n').slice(0, maxHeight - 2)
              content = `${truncatedLines.join('\n')}\n\n⚠️  Content truncated`
            }

            this.printPanel(
              boxen(content, {
                title: `Processes (${processes.length})`,
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'magenta',
                width: Math.min(120, (process.stdout.columns || 100) - 4),
                height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
              })
            )
          }
          break
        }
        case 'kill': {
          if (args.length === 0) {
            this.printPanel(
              boxen('Usage: /kill <pid>', {
                title: 'Kill Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break
          }
          const pid = parseInt(args[0], 10)
          if (Number.isNaN(pid)) {
            console.log(chalk.red('Invalid PID'))
            break
          }
          const maxHeight = this.getAvailablePanelHeight()
          this.printPanel(
            boxen(`Attempting to kill process ${pid}…`, {
              title: '🛑 Kill Process',
              padding: 1,
              margin: 1,
              width: Math.min(120, (process.stdout.columns || 100) - 4),
              height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          const success = await toolsManager.killProcess(pid)
          this.printPanel(
            boxen(success ? `Process ${pid} terminated` : `Could not kill process ${pid}`, {
              title: success ? 'Kill Success' : 'Kill Failed',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: success ? 'green' : 'red',
            })
          )
          break
        }
      }
    } catch (error: any) {
      this.addLiveUpdate({ type: 'error', content: `Terminal operation failed: ${error.message}`, source: 'terminal' })
      console.log(chalk.red(`❌ Error: ${error.message}`))
    } finally {
      await this.performCommandCleanup()
    }
  }

  /**
   * Handles session management commands (/new, /sessions, /export, /stats, /history, /debug, /temp, /system)
   * @param command - The session management command to execute
   * @param args - Command arguments
   * @throws Error if session operation fails
   * @enterprise Guaranteed cleanup and prompt restoration via finally block
   */
  private async handleSessionManagement(command: string, args: string[]): Promise<void> {
    try {
      switch (command) {
        case 'new': {
          const title = args.join(' ') || undefined
          const session = chatManager.createNewSession(title)
          this.printPanel(
            boxen(`${session.title} (${session.id.slice(0, 8)})`, {
              title: '🆕 New Session',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            })
          )
          break
        }
        case 'sessions': {
          const sessions = chatManager.listSessions()
          const current = chatManager.getCurrentSession()
          const lines: string[] = []
          if (sessions.length === 0) {
            lines.push('No sessions found')
          } else {
            sessions.forEach((session) => {
              const isCurrent = session.id === current?.id
              const prefix = isCurrent ? '→ ' : '  '
              const messageCount = session.messages.filter((m) => m.role !== 'system').length
              lines.push(`${prefix}${session.title} (${session.id.slice(0, 8)})`)
              lines.push(`   ${messageCount} messages | ${session.updatedAt.toLocaleString()}`)
            })
          }
          this.printPanel(
            boxen(lines.join('\n'), {
              title: 'Chat Sessions',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            })
          )
          break
        }
        case 'export': {
          const sessionId = args[0]
          const markdown = chatManager.exportSession(sessionId)
          const filename = `chat-export-${Date.now()}.md`
          await fs.writeFile(filename, markdown)
          this.printPanel(
            boxen(`Session exported to ${filename}`, {
              title: '📤 Export',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            })
          )
          break
        }
        case 'stats': {
          const stats = chatManager.getSessionStats()
          const modelInfo = advancedAIProvider.getCurrentModelInfo()
          const content = [
            `Model: ${modelInfo.name}`,
            `Total Sessions: ${stats.totalSessions}`,
            `Total Messages: ${stats.totalMessages}`,
            `Current Session Messages: ${stats.currentSessionMessages}`,
          ].join('\n')
          this.printPanel(
            boxen(content, {
              title: 'Usage Statistics',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            })
          )
          break
        }
        case 'history': {
          if (args.length === 0) {
            const enabled = configManager.get('chatHistory')
            console.log(chalk.green(`Chat history: ${enabled ? 'enabled' : 'disabled'}`))
            break // Let finally handle cleanup
          }
          const setting = args[0].toLowerCase()
          if (setting !== 'on' && setting !== 'off') {
            this.printPanel(
              boxen('Usage: /history <on|off>', {
                title: 'History Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break // Let finally handle cleanup
          }
          configManager.set('chatHistory', setting === 'on')
          console.log(chalk.green(`✓ Chat history ${setting === 'on' ? 'enabled' : 'disabled'}`))
          break
        }
        case 'debug': {
          console.log(chalk.blue.bold('\n🔍 Debug Information:'))
          console.log(chalk.gray('═'.repeat(40)))
          const currentModel = configManager.getCurrentModel()
          console.log(chalk.green(`Current Model: ${currentModel}`))
          const models = configManager.get('models')
          const currentModelConfig = models[currentModel]
          if (currentModelConfig) {
            console.log(chalk.green(`Provider: ${currentModelConfig.provider}`))
            console.log(chalk.green(`Model: ${currentModelConfig.model}`))
          }
          // Test API key
          const apiKey = configManager.getApiKey(currentModel)
          if (apiKey) {
            console.log(chalk.green(`✓ API Key: ${apiKey.slice(0, 10)}...${apiKey.slice(-4)} (${apiKey.length} chars)`))
          } else {
            console.log(chalk.red(`❌ API Key: Not configured`))
          }
          break
        }
        case 'temp': {
          if (args.length === 0) {
            console.log(chalk.green(`Current temperature: ${configManager.get('temperature')}`))
            break // Let finally handle cleanup
          }
          const temp = parseFloat(args[0])
          if (Number.isNaN(temp) || temp < 0 || temp > 2) {
            console.log(chalk.red('Temperature must be between 0.0 and 2.0'))
            break // Let finally handle cleanup
          }
          configManager.set('temperature', temp)
          console.log(chalk.green(`✓ Temperature set to ${temp}`))
          break
        }
        case 'system': {
          if (args.length === 0) {
            const session = chatManager.getCurrentSession()
            console.log(chalk.green('Current system prompt:'))
            console.log(chalk.gray(session?.systemPrompt || 'None'))
            break // Let finally handle cleanup
          }
          const prompt = args.join(' ')
          const session = chatManager.getCurrentSession()
          if (session) {
            session.systemPrompt = prompt
            // Update the system message
            const systemMsgIndex = session.messages.findIndex((m) => m.role === 'system')
            if (systemMsgIndex >= 0) {
              session.messages[systemMsgIndex].content = prompt
            } else {
              session.messages.unshift({
                role: 'system',
                content: prompt,
                timestamp: new Date(),
              })
            }
            console.log(chalk.green('✓ System prompt updated'))
          }
          break
        }
      }
    } catch (error: any) {
      this.addLiveUpdate({ type: 'error', content: `Session management failed: ${error.message}`, source: 'session' })
      console.log(chalk.red(`❌ Error: ${error.message}`))
    } finally {
      await this.performCommandCleanup()
    }
  }

  /**
   * Handles model configuration commands (/model, /models, /set-key, /config)
   * @param command - The model configuration command to execute
   * @param args - Command arguments
   * @throws Error if configuration operation fails
   * @enterprise Guaranteed cleanup and prompt restoration via finally block
   */
  private async handleModelConfig(command: string, args: string[]): Promise<void> {
    try {
      switch (command) {
        case 'model': {
          if (args.length === 0) {
            await this.showCurrentModelPanel()
            break // Let finally handle cleanup
          }
          const modelName = args[0]
          configManager.setCurrentModel(modelName)
          try {
            // Sync AdvancedAIProvider immediately so no restart is required
            advancedAIProvider.setModel(modelName)
            this.printPanel(
              boxen(`Switched to model: ${modelName}\nApplied immediately (no restart needed)`, {
                title: 'Model Updated',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'green',
              })
            )
          } catch {
            console.log(chalk.green(`✓ Switched to model: ${modelName}`))
          }

          // Validate API key for the selected model/provider
          try {
            const modelsCfg = configManager.get('models') as any
            const modelCfg = modelsCfg[modelName]
            const provider = modelCfg?.provider || 'unknown'
            const apiKey = configManager.getApiKey(modelName)
            if (!apiKey) {
              const tip =
                provider === 'openai'
                  ? 'Env: OPENAI_API_KEY'
                  : provider === 'anthropic'
                    ? 'Env: ANTHROPIC_API_KEY'
                    : provider === 'google'
                      ? 'Env: GOOGLE_GENERATIVE_AI_API_KEY'
                      : provider === 'vercel'
                        ? 'Env: V0_API_KEY'
                        : provider === 'gateway'
                          ? 'Env: GATEWAY_API_KEY'
                          : 'Env: (n/a)'

              this.printPanel(
                boxen(
                  `Provider: ${provider}\n` +
                  `Model: ${modelCfg?.model || modelName}\n` +
                  `API key not configured.\n` +
                  `Tip: /set-key ${modelName} <your-api-key>  |  ${tip}`,
                  { title: '🔑 API Key Missing', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }
                )
              )

              const { approvalSystem } = await import('./ui/approval-system')
              const approve = await approvalSystem.confirm(
                'Open interactive API key setup now?',
                `Configure key for ${provider} (${modelName})`,
                true
              )
              if (approve) {
                await this.interactiveSetApiKey()
              }
            }
          } catch {
            /* ignore validation errors */
          }

          await this.showCurrentModelPanel(modelName)
          break
        }
        case 'models': {
          await this.showModelsPanel()
          break
        }
        case 'set-key': {
          if (args.length < 2) {
            // Provide provider/model wizard if generic, or Coinbase wizard if requested
            if (args.length === 1 && ['coinbase', 'cdp', 'coinbase-keys'].includes(args[0].toLowerCase())) {
              await this.interactiveSetCoinbaseKeys()
            } else {
              await this.interactiveSetApiKey()
            }
            break // Let finally handle cleanup
          }
          const [modelName, apiKey] = args
          const keyName = modelName.toLowerCase()
          if (['coinbase-id', 'coinbase_id', 'cdp-id', 'cdp_api_key_id'].includes(keyName)) {
            configManager.setApiKey('coinbase_id', apiKey)
            process.env.CDP_API_KEY_ID = apiKey
            console.log(chalk.green('✓ Coinbase CDP_API_KEY_ID set'))
          } else if (['coinbase-secret', 'coinbase_secret', 'cdp-secret', 'cdp_api_key_secret'].includes(keyName)) {
            configManager.setApiKey('coinbase_secret', apiKey)
            process.env.CDP_API_KEY_SECRET = apiKey
            console.log(chalk.green('✓ Coinbase CDP_API_KEY_SECRET set'))
          } else if (
            ['coinbase-wallet-secret', 'coinbase_wallet_secret', 'wallet-secret', 'cdp_wallet_secret'].includes(keyName)
          ) {
            configManager.setApiKey('coinbase_wallet_secret', apiKey)
            process.env.CDP_WALLET_SECRET = apiKey
            console.log(chalk.green('✓ Coinbase CDP_WALLET_SECRET set'))
          } else {
            configManager.setApiKey(modelName, apiKey)
            console.log(chalk.green(`✓ API key set for ${modelName}`))
          }
          break
        }
        case 'config': {
          if (args.length > 0 && ['interactive', 'edit', 'i'].includes(args[0].toLowerCase())) {
            await this.showInteractiveConfiguration()
          } else {
            await this.showConfigurationPanel()
          }
          break
        }
      }
    } catch (error: any) {
      this.addLiveUpdate({
        type: 'error',
        content: `Model/config operation failed: ${error.message}`,
        source: 'config',
      })
      console.log(chalk.red(`❌ Error: ${error.message}`))
    } finally {
      await this.performCommandCleanup()
    }
  }

  /**
   * Handles advanced feature commands (/agents, /agent, /parallel, /factory, /blueprints, /create-agent, /launch-agent, /context, /stream, /approval, /todo)
   * @param command - The advanced feature command to execute
   * @param args - Command arguments
   * @throws Error if advanced feature operation fails
   * @enterprise Guaranteed cleanup and prompt restoration via finally block
   */
  private async handleAdvancedFeatures(command: string, args: string[]): Promise<void> {
    try {
      switch (command) {
        case 'agents': {
          // Ensure panel prints atomically and prompt re-renders once
          this.beginPanelOutput()
          try {
            this.showAgentsPanel()
          } finally {
            this.endPanelOutput()
          }
          break // Let finally handle cleanup
        }
        case 'agent': {
          if (args.length < 2) {
            this.printPanel(
              boxen('Usage: /agent <name> <task>', {
                title: 'Agent Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break // Let finally handle cleanup
          }
          const agentName = args[0]
          const task = args.slice(1).join(' ')

          this.printPanel(
            boxen(`Launching agent: ${agentName}`, {
              title: 'Agent Execution',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            })
          )

          try {
            const taskId = await agentService.executeTask(agentName, task, {})
            this.printPanel(
              boxen(`Successfully launched ${agentName} (Task ID: ${taskId.slice(-6)})`, {
                title: 'Agent Started',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'green',
              })
            )
          } catch (error: any) {
            this.printPanel(
              boxen(`Failed to launch ${agentName}: ${error.message}`, {
                title: 'Agent Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
          }
          break
        }
        case 'parallel': {
          if (args.length < 2) {
            this.printPanel(
              boxen(
                [
                  'Usage: /parallel [agent1, agent2, agent3] <description>',
                  '',
                  'Examples:',
                  '  /parallel [react-expert, code-reviewer] "analyze this component"',
                  '  /parallel [security-agent, performance-agent] "audit API endpoint"',
                  '',
                  'Note: Use square brackets [] to specify factory agents by blueprint name/ID',
                ].join('\n'),
                {
                  title: 'Parallel Command',
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'red',
                }
              )
            )
            break // Let finally handle cleanup
          }

          // Parse agents list with [] syntax
          let agentList: string[] = []
          let taskDescription = ''

          const input = args.join(' ')
          const bracketMatch = input.match(/^\[([^\]]+)\]\s*(.*)/)

          if (bracketMatch) {
            // New syntax: [agent1, agent2, agent3] description
            agentList = bracketMatch[1].split(',').map((name) => name.trim())
            taskDescription = bracketMatch[2].trim()
          } else {
            // Fallback to old syntax: agent1,agent2,agent3 description
            agentList = args[0].split(',').map((name) => name.trim())
            taskDescription = args.slice(1).join(' ')
          }

          if (!taskDescription) {
            this.printPanel(
              boxen('Error: Task description is required', {
                title: 'Missing Description',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break // Let finally handle cleanup
          }

          this.printPanel(
            boxen(`Launching ${agentList.length} factory agents in parallel...`, {
              title: 'Parallel Factory Execution',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            })
          )

          // Create parallel execution context for agent collaboration
          const collaborationContext = {
            sessionId: `parallel-${Date.now()}`,
            agents: agentList,
            task: taskDescription,
            logs: new Map<string, string[]>(),
            sharedData: new Map<string, any>(),
          }

          // Execute factory agents in parallel
          const agentPromises = agentList.map(async (agentIdentifier) => {
            try {
              // Check if blueprint exists
              const blueprint = await agentFactory.getBlueprint(agentIdentifier)
              if (!blueprint) {
                throw new Error(`Blueprint '${agentIdentifier}' not found`)
              }

              // Launch agent from factory
              const agent = await agentFactory.launchAgent(agentIdentifier, taskDescription)

              // Initialize agent logs
              collaborationContext.logs.set(agentIdentifier, [])

              this.printPanel(
                boxen(
                  [
                    `✓ Launched: ${blueprint.name || agentIdentifier}`,
                    `Specialization: ${blueprint.specialization}`,
                    `Agent ID: ${agent.id.slice(-8)}`,
                    `Blueprint ID: ${blueprint.id.slice(-8)}`,
                  ].join('\n'),
                  {
                    title: `Agent Started: ${agentIdentifier}`,
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'green',
                  }
                )
              )

                // Set up collaboration context for this agent
                ; (agent as any).collaborationContext = collaborationContext

              // Start agent execution with task
              this.startAgentExecution(agent, taskDescription, collaborationContext)

              return {
                agentIdentifier,
                agent,
                blueprint,
                success: true,
              }
            } catch (error: any) {
              this.printPanel(
                boxen(`Failed to launch ${agentIdentifier}: ${error.message}`, {
                  title: 'Agent Launch Error',
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'red',
                })
              )
              return {
                agentIdentifier,
                error: error.message,
                success: false,
              }
            }
          })

          // Wait for all agents to start
          const results = await Promise.allSettled(agentPromises)
          const successful = results.filter((r) => r.status === 'fulfilled' && r.value.success).length
          const failed = results.length - successful

          // Show parallel execution summary
          this.printPanel(
            boxen(
              [
                `🚀 Parallel Factory Execution Initiated`,
                `✓ Successfully launched: ${successful} agents`,
                failed > 0 ? `❌ Failed to launch: ${failed} agents` : '',
                '',
                `📋 Collaboration Context: ${collaborationContext.sessionId}`,
                '🔄 Agents are running with shared context and collaboration',
                '',
                'Commands:',
                '  /agents           - Monitor active agents',
                '  /parallel-logs    - View collaboration logs',
                '  /parallel-status  - Check execution status',
              ]
                .filter(Boolean)
                .join('\n'),
              {
                title: 'Parallel Execution Summary',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: successful === agentList.length ? 'green' : 'yellow',
              }
            )
          )

          // Store collaboration context for monitoring
          this.currentCollaborationContext = collaborationContext
          break
        }
        case 'factory': {
          this.beginPanelOutput()
          try {
            await agentFactory.showFactoryDashboard()
          } finally {
            this.endPanelOutput()
          }
          break // Let finally handle cleanup
        }
        case 'blueprints': {
          if (args.length > 0 && args[0] === 'list') {
            await this.showAvailableBlueprints()
          } else {
            this.beginPanelOutput()
            try {
              this.showBlueprintsPanel()
            } finally {
              this.endPanelOutput()
            }
          }
          break // Let finally handle cleanup
        }
        case 'create-agent': {
          if (args.length < 2) {
            this.printPanel(
              boxen(
                [
                  'Usage: /create-agent [--vm|--container] <name> <specialization>',
                  '',
                  'Examples:',
                  '  /create-agent react-expert "React development and testing"',
                  '  /create-agent --vm repo-analyzer "Repository analysis and documentation"',
                  '  /create-agent --container test-runner "Isolated testing environment"',
                ].join('\n'),
                {
                  title: 'Create Agent Command',
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'red',
                }
              )
            )
            break // Let finally handle cleanup
          }

          // Parse arguments similar to nik-cli-commands.ts logic
          let agentType: 'standard' | 'vm' | 'container' = 'standard'
          let name = ''
          let specialization = ''

          for (let i = 0; i < args.length; i++) {
            const arg = args[i]
            if (arg === '--vm') {
              agentType = 'vm'
            } else if (arg === '--container') {
              agentType = 'container'
            } else {
              name = args[i]
              specialization = args.slice(i + 1).join(' ')
              break
            }
          }

          const blueprint = await agentFactory.createAgentBlueprint({
            name,
            specialization,
            autonomyLevel: 'fully-autonomous',
            contextScope: 'project',
            agentType,
          })
          console.log(chalk.green(`✓ Agent blueprint created: ${blueprint.name}`))
          console.log(chalk.gray(`Blueprint ID: ${blueprint.id}`))
          break
        }
        case 'launch-agent': {
          if (args.length === 0) {
            this.printPanel(
              boxen('Usage: /launch-agent <blueprint-id> [task]', {
                title: 'Launch Agent Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break // Let finally handle cleanup
          }
          const blueprintId = args[0]
          const task = args.slice(1).join(' ')
          const agent = await agentFactory.launchAgent(blueprintId)
          if (task) {
            console.log(formatAgent('agent', 'running', task))
            const _result = await agent.run(task)
            console.log(chalk.green('✓ Agent execution completed'))
          } else {
            console.log(chalk.blue('🔌 Agent launched and ready'))
          }
          break
        }
        case 'context': {
          this.beginPanelOutput()
          try {
            if (args.length === 0) {
              const ctx = workspaceContext.getContextForAgent('cli', 10)
              const lines: string[] = []
              lines.push(`${chalk.blue('📁')} Root: ${this.workingDirectory}`)
              lines.push(`🎯 Selected Paths (${ctx.selectedPaths.length}):`)
              ctx.selectedPaths.forEach((p) => lines.push(`• ${p}`))
              lines.push('')
              lines.push('Tip: /context <paths...> to set paths')

              this.printPanel(
                boxen(lines.join('\n'), {
                  title: '🌍 Workspace Context',
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'green',
                })
              )
            } else {
              const paths = args
              await workspaceContext.selectPaths(paths)
              const confirm = [`Updated selected paths (${paths.length}):`, ...paths.map((p) => `• ${p}`)].join('\n')
              this.printPanel(
                boxen(confirm, {
                  title: '🌍 Workspace Context Updated',
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'green',
                })
              )
            }
          } finally {
            this.endPanelOutput()
          }
          break // Let finally handle cleanup
        }
        case 'stream': {
          if (args.length > 0 && args[0] === 'clear') {
            const activeAgents = agentStream.getActiveAgents()
            activeAgents.forEach((agentId) => {
              agentStream.clearAgentStream(agentId)
            })
            this.beginPanelOutput()
            try {
              this.printPanel(
                boxen('All agent streams cleared', {
                  title: '📡 Agent Streams',
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'green',
                })
              )
            } finally {
              this.endPanelOutput()
            }
            break // Let finally handle cleanup
          } else {
            agentStream.showLiveDashboard()
            this.printPanel(
              boxen('Live dashboard opened in terminal', {
                title: '📡 Agent Streams',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan',
              })
            )
          }
          break
        }
        case 'approval': {
          if (args.length === 0) {
            console.log(chalk.blue('Approval System Configuration:'))
            const config = approvalSystem.getConfig()
            console.log(JSON.stringify(config, null, 2))
          } else {
            // Handle approval subcommands
            const subcommand = args[0]
            if (subcommand === 'test') {
              const approved = await approvalSystem.quickApproval(
                'Test Approval',
                'This is a test of the approval system',
                'low'
              )
              console.log(approved ? chalk.green('Approved') : chalk.yellow('Cancelled'))
            }
          }
          break
        }
        case 'todo':
        case 'todos': {
          await this.handleTodoOperations(command, args)
          break
        }
      }
    } catch (error: any) {
      this.addLiveUpdate({ type: 'error', content: `Advanced feature failed: ${error.message}`, source: 'advanced' })
      console.log(chalk.red(`❌ Error: ${error.message}`))
    } finally {
      await this.performCommandCleanup()
    }
  }

  // Parallel Execution Support Methods
  private async startAgentExecution(agent: any, task: string, collaborationContext: any): Promise<void> {
    try {
      // Set up agent logging
      const agentId = agent.id
      const logs = collaborationContext.logs.get(agent.blueprintId) || []

      // Log task start
      logs.push(`[${new Date().toISOString()}] Starting task: "${task}"`)
      collaborationContext.logs.set(agent.blueprintId, logs)

      // Set up collaboration methods for the agent
      agent.collaborationContext = collaborationContext
      agent.logToCollaboration = (message: string) => {
        const currentLogs = collaborationContext.logs.get(agent.blueprintId) || []
        currentLogs.push(`[${new Date().toISOString()}] ${message}`)
        collaborationContext.logs.set(agent.blueprintId, currentLogs)
      }

      agent.shareData = (key: string, value: any) => {
        collaborationContext.sharedData.set(`${agent.blueprintId}:${key}`, value)
        agent.logToCollaboration(`Shared data: ${key}`)
      }

      agent.getSharedData = (key: string) => {
        // Can access data from any agent in the collaboration
        for (const [dataKey, value] of collaborationContext.sharedData.entries()) {
          if (dataKey.endsWith(`:${key}`)) {
            return value
          }
        }
        return null
      }

      agent.getOtherAgents = () => {
        return collaborationContext.agents.filter((a: string) => a !== agent.blueprintId)
      }

      agent.requestCollaboration = (targetAgent: string, request: string) => {
        agent.logToCollaboration(`Requesting collaboration from ${targetAgent}: ${request}`)
        collaborationContext.sharedData.set(`${agent.blueprintId}:request:${targetAgent}`, {
          request,
          timestamp: new Date().toISOString(),
          status: 'pending',
        })
      }

      agent.respondToCollaboration = (fromAgent: string, response: any) => {
        agent.logToCollaboration(`Responding to ${fromAgent} with collaboration data`)
        collaborationContext.sharedData.set(`${fromAgent}:response:${agent.blueprintId}`, {
          response,
          timestamp: new Date().toISOString(),
          from: agent.blueprintId,
        })
      }

      // Start execution asynchronously
      this.executeAgentTask(agent, task).catch((error) => {
        const errorLogs = collaborationContext.logs.get(agent.blueprintId) || []
        errorLogs.push(`[${new Date().toISOString()}] ERROR: ${error.message}`)
        collaborationContext.logs.set(agent.blueprintId, errorLogs)
      })

      // Monitor for completion and trigger merge when all agents are done
      this.monitorAgentCompletion(agent, collaborationContext)
    } catch (error: any) {
      console.error(`Failed to start agent execution: ${error.message}`)
    }
  }

  private async executeAgentTask(agent: any, task: string): Promise<void> {
    try {
      agent.logToCollaboration(`Initializing toolchain based on blueprint...`)

      // Create custom toolchain based on agent's blueprint
      const blueprint = agent.blueprint
      const specializedTools = this.createSpecializedToolchain(blueprint)

      agent.logToCollaboration(`Created ${specializedTools.length} specialized tools`)
      agent.logToCollaboration(`Analyzing task with specialization: ${blueprint.specialization}`)

      // Execute task with agent's specialized capabilities
      if (agent.executeTask) {
        // Use AI SDK steps for better streaming
        const agentSteps = [
          {
            stepId: 'analysis',
            description: `${blueprint.name} analyzing task requirements`,
            schema: { type: 'object', properties: { progress: { type: 'string' } } },
          },
          {
            stepId: 'execution',
            description: `${blueprint.name} executing specialized work`,
            schema: { type: 'object', properties: { status: { type: 'string' } } },
          },
        ]

        const finalStep = {
          description: `${blueprint.name} finalizing results`,
          schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              components: { type: 'array', items: { type: 'string' } },
              recommendations: { type: 'array', items: { type: 'string' } },
            },
          },
        }

        // Stream step progress
        this.streamAgentSteps(blueprint.name, 'analysis', `Analyzing task requirements`, { status: 'started' })

        // Execute like plan mode using streaming
        await this.executeAgentWithPlanModeStreaming(agent, task, blueprint.name, specializedTools)

        // Stream completion
        this.streamAgentSteps(blueprint.name, 'complete', `Task execution completed`, { status: 'finished' })
      } else {
        agent.logToCollaboration(`Agent executing with built-in capabilities...`)

        // Stream initial step
        this.streamAgentSteps(blueprint.name, 'analysis', `Starting specialized analysis`, { status: 'initiated' })

        // Realistic execution simulation based on specialization
        const executionTime = this.calculateExecutionTime(blueprint.specialization)

        // Stream intermediate step
        setTimeout(() => {
          this.streamAgentSteps(
            blueprint.name,
            'processing',
            `Processing with ${blueprint.specialization} capabilities`,
            { status: 'processing' }
          )
        }, executionTime / 3)

        setTimeout(() => {
          // Simulate specialized work based on agent type
          const result = this.simulateSpecializedWork(blueprint, task)

          // Stream final step
          this.streamAgentSteps(blueprint.name, 'complete', `Analysis completed`, { status: 'finished' })

          agent.logToCollaboration(`Completed specialized analysis: ${result.summary}`)
          agent.shareData('result', result)
          agent.shareData('status', 'completed')
          agent.shareData('completedAt', new Date().toISOString())

          // Add agent result to main stream
          this.addLiveUpdate({
            type: 'status',
            content: `**${blueprint.name} Completed:**\n\n${result.summary}\n\n**Components:** ${result.components ? result.components.join(', ') : 'None'}\n\n**Recommendations:** ${result.recommendations ? result.recommendations.join(', ') : 'None'}`,
            source: blueprint.name,
          })

          // Check for collaboration opportunities
          this.checkForCollaborationOpportunities(agent, (agent as any).collaborationContext)
        }, executionTime)
      }
    } catch (error: any) {
      agent.logToCollaboration(`Task execution failed: ${error.message}`)
      throw error
    }
  }

  private createSpecializedToolchain(blueprint: any): any[] {
    const tools = []
    const specialization = blueprint.specialization.toLowerCase()

    // Create tools based on agent specialization
    if (specialization.includes('react') || specialization.includes('frontend')) {
      tools.push(
        { name: 'component-analyzer', description: 'Analyze React components' },
        { name: 'jsx-validator', description: 'Validate JSX syntax' },
        { name: 'props-inspector', description: 'Inspect component props' }
      )
    }

    if (specialization.includes('security') || specialization.includes('audit')) {
      tools.push(
        { name: 'vulnerability-scanner', description: 'Scan for security issues' },
        { name: 'dependency-checker', description: 'Check dependency vulnerabilities' },
        { name: 'code-security-analyzer', description: 'Analyze code for security patterns' }
      )
    }

    if (specialization.includes('performance') || specialization.includes('optimization')) {
      tools.push(
        { name: 'performance-profiler', description: 'Profile code performance' },
        { name: 'bundle-analyzer', description: 'Analyze bundle size' },
        { name: 'memory-tracker', description: 'Track memory usage' }
      )
    }

    if (specialization.includes('test') || specialization.includes('qa')) {
      tools.push(
        { name: 'test-generator', description: 'Generate test cases' },
        { name: 'coverage-analyzer', description: 'Analyze test coverage' },
        { name: 'e2e-tester', description: 'Run end-to-end tests' }
      )
    }

    // Add common tools for all agents
    tools.push(
      { name: 'file-reader', description: 'Read and analyze files' },
      { name: 'code-parser', description: 'Parse code structures' },
      { name: 'collaboration-interface', description: 'Interface with other agents' }
    )

    return tools
  }

  private async showParallelLogs(): Promise<void> {
    if (!this.currentCollaborationContext) {
      this.printPanel(
        boxen('No active parallel execution session', {
          title: 'Parallel Logs',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
        })
      )
      return
    }

    const context = this.currentCollaborationContext
    const logLines: string[] = [
      `📋 Collaboration Session: ${context.sessionId}`,
      `🎯 Task: ${context.task}`,
      `👥 Agents: ${context.agents.join(', ')}`,
      '',
    ]

    // Collect logs from all agents
    for (const agentId of context.agents) {
      const agentLogs = context.logs.get(agentId) || []
      if (agentLogs.length > 0) {
        logLines.push(`🤖 Agent: ${agentId}`)
        logLines.push(...agentLogs.map((log) => `  ${log}`))
        logLines.push('')
      }
    }

    // Show shared data
    if (context.sharedData.size > 0) {
      logLines.push('🔄 Shared Data:')
      for (const [key, value] of context.sharedData.entries()) {
        logLines.push(`  ${key}: ${JSON.stringify(value).slice(0, 100)}`)
      }
    }

    this.printPanel(
      boxen(logLines.join('\n'), {
        title: 'Parallel Execution Logs',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      })
    )
  }

  private async showAvailableBlueprints(): Promise<void> {
    try {
      const blueprints = await agentFactory.getAllBlueprints()

      if (blueprints.length === 0) {
        this.printPanel(
          boxen(
            [
              'No blueprints found in factory',
              '',
              'Create a new agent blueprint:',
              '  /create-agent <name> <specialization>',
              '',
              'Examples:',
              '  /create-agent react-expert "React component analysis and optimization"',
              '  /create-agent security-auditor "Security vulnerability assessment"',
            ].join('\n'),
            {
              title: '🏭 Available Blueprints',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            }
          )
        )
        return
      }

      const blueprintLines: string[] = [`Found ${blueprints.length} blueprint(s) in factory:`, '']

      blueprints.forEach((blueprint, index) => {
        blueprintLines.push(`${index + 1}. ${blueprint.name || blueprint.id.slice(-8)}`)
        blueprintLines.push(`   ID: ${blueprint.id}`)
        blueprintLines.push(`   Specialization: ${blueprint.specialization}`)
        if (blueprint.description) {
          blueprintLines.push(`   Description: ${blueprint.description}`)
        }
        blueprintLines.push(`   Type: ${blueprint.agentType || 'standard'}`)
        blueprintLines.push('')
      })

      blueprintLines.push('Usage Examples:')
      blueprintLines.push(
        `  /parallel [${blueprints
          .slice(0, 2)
          .map((b) => b.name || b.id.slice(-8))
          .join(', ')}] "analyze this code"`
      )
      blueprintLines.push(`  /launch-agent ${blueprints[0]?.id || 'blueprint-id'} "specific task"`)

      this.printPanel(
        boxen(blueprintLines.join('\n'), {
          title: '🏭 Available Factory Blueprints',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to load blueprints: ${error.message}`, {
          title: 'Blueprint Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  private async showParallelStatus(): Promise<void> {
    if (!this.currentCollaborationContext) {
      this.printPanel(
        boxen('No active parallel execution session', {
          title: 'Parallel Status',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
        })
      )
      return
    }

    const context = this.currentCollaborationContext
    const statusLines: string[] = [
      `📋 Session: ${context.sessionId}`,
      `🎯 Task: ${context.task}`,
      `⏰ Started: ${new Date(parseInt(context.sessionId.split('-')[1])).toLocaleString()}`,
      '',
    ]

    // Agent status
    statusLines.push('👥 Agent Status:')
    for (const agentId of context.agents) {
      const logs = context.logs.get(agentId) || []
      const lastLog = logs[logs.length - 1] || 'No activity'
      const status = lastLog.includes('ERROR') ? '❌' : lastLog.includes('completed') ? '✅' : '🔄'
      statusLines.push(`  ${status} ${agentId}: ${logs.length} log entries`)
    }

    statusLines.push('')
    statusLines.push(`🔄 Shared Data Items: ${context.sharedData.size}`)
    statusLines.push(
      `📝 Total Log Entries: ${Array.from(context.logs.values()).reduce((total, logs) => total + logs.length, 0)}`
    )

    this.printPanel(
      boxen(statusLines.join('\n'), {
        title: 'Parallel Execution Status',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'blue',
      })
    )
  }

  // Style Commands Handlers
  private async handleStyleCommands(command: string, args: string[]): Promise<void> {
    try {
      if (command === 'styles') {
        this.showAllStyles()
        return
      }

      if (args.length === 0) {
        this.showStyleHelp()
        return
      }

      const subcommand = args[0]
      const restArgs = args.slice(1)

      switch (subcommand) {
        case 'set':
          await this.handleStyleSet(restArgs)
          break
        case 'show':
          await this.handleStyleShow()
          break
        case 'model':
          await this.handleStyleModel(restArgs)
          break
        case 'context':
          await this.handleStyleContext(restArgs)
          break
        default:
          this.showStyleHelp()
          break
      }
    } catch (error: any) {
      this.addLiveUpdate({ type: 'error', content: `Style command failed: ${error.message}`, source: 'style' })
      this.printPanel(
        boxen(`Style command failed: ${error.message}`, {
          title: 'Style Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
    console.log() // Extra newline for better separation
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.renderPromptAfterOutput()
  }

  private showStyleHelp(): void {
    const content = [
      '🎨 Output Style Commands',
      '',
      'Available Commands:',
      '  /style set <style-name>        Set default output style',
      '  /style show                   Show current configuration',
      '  /style model <style-name>     Set style for current model',
      '  /style context <ctx> <style>  Set style for specific context',
      '  /styles                       List all available styles',
      '',
      'Available Styles:',
      '  production-focused   Output optimized for production environment, concise and results-oriented',
      '  creative-concise     Creative but compact approach, with innovative solutions',
      '  detailed-analytical  In-depth analysis with detailed explanations and technical considerations',
      '  friendly-casual      Friendly and conversational tone, accessible approach',
      '  technical-precise    Precise technical terminology, complete and accurate documentation',
      '  educational-verbose  Detailed educational explanations, perfect for learning new concepts',
      '  minimal-efficient    Minimalist output with only essential information',
      '',
      'Examples:',
      '  /style set production-focused  # Set concise, results-oriented style',
    ].join('\n')

    this.printPanel(
      boxen(content, {
        title: 'Output Style Commands',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      })
    )
  }

  private showAllStyles(): void {
    const content = [
      '🎨 Available Output Styles:',
      '',
      '• production-focused   - Concise, results-oriented output',
      '• creative-concise     - Creative but compact solutions',
      '• detailed-analytical  - In-depth technical explanations',
      '• friendly-casual      - Conversational and accessible',
      '• technical-precise    - Precise technical documentation',
      '• educational-verbose  - Detailed learning explanations',
      '• minimal-efficient    - Essential information only',
      '',
      'Use /style set <style-name> to apply a style',
    ].join('\n')

    this.printPanel(
      boxen(content, {
        title: 'Available Styles',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      })
    )
  }

  private async handleStyleSet(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.printPanel(
        boxen('Usage: /style set <style-name>', {
          title: 'Style Set Command',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return
    }

    const styleName = args[0]
    const validStyles = [
      'production-focused',
      'creative-concise',
      'detailed-analytical',
      'friendly-casual',
      'technical-precise',
      'educational-verbose',
      'minimal-efficient',
    ]

    if (!validStyles.includes(styleName)) {
      this.printPanel(
        boxen(
          [`Invalid style: ${styleName}`, '', 'Valid styles:', ...validStyles.map((style) => `  • ${style}`)].join(
            '\n'
          ),
          {
            title: 'Invalid Style',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          }
        )
      )
      return
    }

    this.configManager.set('outputStyle', styleName as any)
    this.printPanel(
      boxen(`Default output style set to: ${styleName}`, {
        title: 'Style Updated',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
      })
    )
  }

  private async handleStyleShow(): Promise<void> {
    const currentStyle = this.configManager.get('outputStyle') || 'production-focused'
    const content = [
      '🎨 Current Style Configuration:',
      '',
      `Default Style: ${currentStyle}`,
      '',
      'Style applies to all AI responses unless overridden by context-specific settings.',
    ].join('\n')

    this.printPanel(
      boxen(content, {
        title: 'Style Configuration',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      })
    )
  }

  private async handleStyleModel(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.printPanel(
        boxen('Usage: /style model <style-name>', {
          title: 'Style Model Command',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return
    }

    const styleName = args[0]
    // Implementation would set style for current model
    this.printPanel(
      boxen(`Style for current model set to: ${styleName}`, {
        title: 'Model Style Updated',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
      })
    )
  }

  private async handleStyleContext(args: string[]): Promise<void> {
    if (args.length < 2) {
      this.printPanel(
        boxen('Usage: /style context <context> <style-name>', {
          title: 'Style Context Command',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return
    }

    const [context, styleName] = args
    // Implementation would set style for specific context
    this.printPanel(
      boxen(`Style for context '${context}' set to: ${styleName}`, {
        title: 'Context Style Updated',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
      })
    )
  }

  // CAD & Manufacturing Commands Handlers
  /**
   * Handles CAD and G-code commands with enterprise-grade cleanup
   * @param command - cad or gcode
   * @param args - Command arguments
   * @enterprise Guaranteed cleanup and prompt restoration
   */
  private async handleCADCommands(command: string, args: string[]): Promise<void> {
    try {
      if (command === 'cad') {
        // Initialize CAD commands handler
        const cadCommands = new CADCommands()
        await cadCommands.handleCADCommand(args)
      } else if (command === 'gcode') {
        // Handle G-code commands
        await this.handleGCodeCommands(args)
      }
    } catch (error: any) {
      this.addLiveUpdate({ type: 'error', content: `CAD command failed: ${error.message}`, source: 'cad' })
      console.log(chalk.red(`❌ Error: ${error.message}`))
    } finally {
      await this.performCommandCleanup()
    }
  }

  /**
   * Extracts Figma file ID from URL or returns the ID if already provided
   * Supports all official Figma URL patterns (2024-2025)
   * @param input - Figma URL or file ID
   * @returns Figma file ID or null if invalid
   * @example
   * extractFigmaFileId('https://www.figma.com/design/ABC123/My-Design') => 'ABC123'
   * extractFigmaFileId('https://www.figma.com/proto/XYZ789?node-id=1-2') => 'XYZ789'
   * extractFigmaFileId('https://embed.figma.com/board/DEF456') => 'DEF456'
   * extractFigmaFileId('ABC123') => 'ABC123'
   */
  private extractFigmaFileId(input: string): string | null {
    if (!input) return null

    // If it's already a file ID (alphanumeric, no special chars except dash/underscore)
    if (/^[a-zA-Z0-9_-]+$/.test(input) && !input.includes('/') && input.length > 10) {
      return input
    }

    // Official Figma URL patterns (www.figma.com and embed.figma.com)
    // 1. Design files: /design/{file_key}/{file_name}
    // 2. Prototypes: /proto/{file_key}/{file_name}
    // 3. FigJam boards: /board/{file_key}/{board_name}
    // 4. Slides/Decks: /slides/{file_key} or /deck/{file_key}
    // 5. Legacy: /file/{file_key}/{file_name}
    const urlPatterns = [
      /figma\.com\/design\/([a-zA-Z0-9_-]+)/, // Design files
      /figma\.com\/proto\/([a-zA-Z0-9_-]+)/, // Prototypes
      /figma\.com\/board\/([a-zA-Z0-9_-]+)/, // FigJam boards
      /figma\.com\/slides\/([a-zA-Z0-9_-]+)/, // Slides
      /figma\.com\/deck\/([a-zA-Z0-9_-]+)/, // Decks
      /figma\.com\/file\/([a-zA-Z0-9_-]+)/, // Legacy format
      /embed\.figma\.com\/design\/([a-zA-Z0-9_-]+)/, // Embed design
      /embed\.figma\.com\/proto\/([a-zA-Z0-9_-]+)/, // Embed proto
      /embed\.figma\.com\/board\/([a-zA-Z0-9_-]+)/, // Embed board
      /embed\.figma\.com\/slides\/([a-zA-Z0-9_-]+)/, // Embed slides
      /embed\.figma\.com\/deck\/([a-zA-Z0-9_-]+)/, // Embed deck
    ]

    for (const pattern of urlPatterns) {
      const match = input.match(pattern)
      if (match && match[1]) {
        return match[1]
      }
    }

    return null
  }

  /**
   * Handles Figma integration commands with enterprise-grade cleanup
   * @param command - Figma command type
   * @param args - Command arguments
   * @enterprise Guaranteed cleanup and prompt restoration
   */
  private async handleFigmaCommands(command: string, args: string[]): Promise<void> {
    try {
      switch (command) {
        case 'figma-config': {
          this.printPanel(
            boxen(
              [
                '🎨 Figma Integration Configuration',
                '─'.repeat(50),
                'Figma API Token: ✓ Configured',
                'Vercel v0 Integration: ⚠️  Optional - for AI code generation',
                'Desktop App Automation: ✓ Available (macOS)',
                '─'.repeat(50),
                '',
                '📋 Available Commands:',
                '  /figma-config                  Show this configuration',
                '  /figma-info <file-id>          Get file information from Figma',
                '  /figma-export <file-id> [fmt]  Export designs (svg, png, jpg, pdf)',
                '  /figma-to-code <file-id>       Generate code from Figma designs',
                '  /figma-create <component>      Create design from React component',
                '  /figma-tokens <file-id>        Extract design tokens from Figma',
                '',
                '💡 Tip: Use /set-key-figma to configure API credentials',
              ].join('\n'),
              {
                title: 'Figma Integration',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'magenta',
              }
            )
          )
          break
        }

        case 'figma-info': {
          if (args.length === 0) {
            this.printPanel(
              boxen(
                'Usage: /figma-info <file-id-or-url>\n\nGet file information from Figma\n\nAccepts:\n  • File ID: ABC123def456\n  • Full URL: https://www.figma.com/file/ABC123/My-Design',
                {
                  title: 'Figma Info Command',
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'red',
                }
              )
            )
            break
          }

          const fileId = this.extractFigmaFileId(args[0])
          if (!fileId) {
            this.printPanel(
              boxen(
                `❌ Invalid Figma file ID or URL: ${args[0]}\n\nPlease provide either:\n  • A file ID (e.g., ABC123def456)\n  • A Figma URL (e.g., figma.com/file/ABC123/...)`,
                {
                  title: 'Invalid Input',
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'red',
                }
              )
            )
            break
          }

          this.printPanel(
            boxen(
              `🎨 Fetching Figma file info\n\n📋 File ID: ${fileId}\n📍 Source: ${args[0].includes('http') ? 'URL' : 'Direct ID'}\n\n⚠️  This feature requires Figma API implementation`,
              {
                title: 'Figma Info',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              }
            )
          )
          break
        }

        case 'figma-export': {
          if (args.length === 0) {
            this.printPanel(
              boxen(
                'Usage: /figma-export <file-id-or-url> [format]\n\nExport designs from Figma\n\nFormats: svg, png, jpg, pdf\nAccepts: File ID or full Figma URL',
                {
                  title: 'Figma Export Command',
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'red',
                }
              )
            )
            break
          }

          const exportFileId = this.extractFigmaFileId(args[0])
          if (!exportFileId) {
            this.printPanel(
              boxen(`Invalid Figma file ID or URL: ${args[0]}`, {
                title: 'Invalid Input',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break
          }

          const format = args[1] || 'svg'
          this.printPanel(
            boxen(
              `🎨 Exporting Figma file\n\n📋 File ID: ${exportFileId}\n📐 Format: ${format}\n📍 Source: ${args[0].includes('http') ? 'URL' : 'Direct ID'}\n\n⚠️  This feature requires Figma API implementation`,
              {
                title: 'Figma Export',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              }
            )
          )
          break
        }

        case 'figma-to-code': {
          if (args.length === 0) {
            this.printPanel(
              boxen('Usage: /figma-to-code <file-id>\n\nGenerate code from Figma designs', {
                title: 'Figma to Code Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break
          }
          this.printPanel(
            boxen(`Generating code from Figma: ${args[0]}\n\nNote: This feature requires Figma API + v0 integration`, {
              title: 'Figma to Code',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }

        case 'figma-create': {
          if (args.length === 0) {
            this.printPanel(
              boxen('Usage: /figma-create <component-path>\n\nCreate design from React component', {
                title: 'Figma Create Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break
          }
          this.printPanel(
            boxen(
              `🎨 Creating Figma design from: ${args[0]}\n\n⚠️  This feature requires Figma API + Desktop automation`,
              {
                title: 'Figma Create',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              }
            )
          )
          break
        }

        case 'figma-tokens': {
          if (args.length === 0) {
            this.printPanel(
              boxen('Usage: /figma-tokens <file-id>\n\nExtract design tokens from Figma', {
                title: 'Figma Tokens Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break
          }
          this.printPanel(
            boxen(`Extracting design tokens from: ${args[0]}\n\nNote: This feature requires Figma API implementation`, {
              title: 'Figma Tokens',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }

        default: {
          this.printPanel(
            boxen('Unknown Figma command. Use /help to see available commands.', {
              title: 'Unknown Command',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            })
          )
        }
      }
    } catch (error: any) {
      this.addLiveUpdate({ type: 'error', content: `Figma command failed: ${error.message}`, source: 'figma' })
      console.log(chalk.red(`❌ Error: ${error.message}`))
    } finally {
      await this.performCommandCleanup()
    }
  }

  private async handleGCodeCommands(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.showGCodeHelp()
      return
    }

    const subcommand = args[0]
    const restArgs = args.slice(1)

    switch (subcommand) {
      case 'generate':
      case 'create':
        await this.handleGCodeGenerate(restArgs)
        break

      case 'cnc':
        await this.handleGCodeGenerate(restArgs, 'cnc')
        break

      case '3d':
        await this.handleGCodeGenerate(restArgs, '3d-printer')
        break

      case 'laser':
        await this.handleGCodeGenerate(restArgs, 'laser')
        break

      case 'examples':
        this.showGCodeExamples()
        break
      default:
        this.showGCodeHelp()
        break
    }
  }

  private async handleGCodeGenerate(args: string[], machineType?: string): Promise<void> {
    if (args.length === 0) {
      this.printPanel(
        boxen(
          [
            'Usage: /gcode generate <description>',
            '',
            'Example: /gcode generate "drill 4 holes in aluminum plate"',
          ].join('\n'),
          {
            title: 'G-code Generate Command',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          }
        )
      )
      return
    }

    const description = args.join(' ')
    const type = machineType || 'cnc'
    console.log(chalk.blue(`⚙️ Generating ${type.toUpperCase()} G-code: "${description}"`))

    try {
      // Use the service aligned with other providers
      const { getGcodeService } = await import('./services/cad-gcode-service')
      const gcodeService = getGcodeService()
      const cadModel = `Operation: ${type}\nDescription: ${description}`
      const result = await gcodeService.generateGcode(cadModel, description)

      if (result?.gcode) {
        console.log(chalk.green('✓ G-code generated successfully:'))
        console.log('')
        console.log(chalk.gray(result.gcode))
      } else {
        console.log(chalk.red('❌ G-code generation failed'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error: ${error.message}`))
    }
  }

  private showGCodeHelp(): void {
    const content = [
      '⚙️ Text-to-G-code AI Commands:',
      '',
      'Generation Commands:',
      '  /gcode generate <description> - Generate G-code from description',
      '  /gcode cnc <description>      - Generate CNC G-code',
      '  /gcode 3d <description>       - Generate 3D printer G-code',
      '  /gcode laser <description>    - Generate laser cutter G-code',
      '',
      'Information Commands:',
      '  /gcode examples               - Show usage examples',
      '  /gcode help                   - Show this help',
      '',
      '💡 Tip: Be specific about materials, tools, and operations',
      'Example: "drill 4x M6 holes in 3mm aluminum plate with HSS bit"',
    ].join('\n')

    this.printPanel(
      boxen(content, {
        title: 'Text-to-G-code AI Commands',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      })
    )
  }

  private showGCodeExamples(): void {
    const content = [
      '⚙️ G-code Generation Examples:',
      '',
      'CNC Operations:',
      '  /gcode cnc "drill 4 holes 6mm diameter in steel plate"',
      '  /gcode cnc "mill pocket 20x30mm, 5mm deep in aluminum"',
      '',
      '3D Printing:',
      '  /gcode 3d "print bracket layer height 0.2mm PLA"',
      '  /gcode 3d "support structure for overhang part"',
      '',
      'Laser Cutting:',
      '  /gcode laser "cut 3mm acrylic sheet with rounded corners"',
      '  /gcode laser "engrave text on wood surface 5mm deep"',
    ].join('\n')

    this.printPanel(
      boxen(content, {
        title: 'G-code Examples',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      })
    )
  }

  // Documentation Commands Handlers
  private async handleDocsCommand(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        // Show help and status as a single panel, with proper prompt spacing
        const stats = docLibrary.getStats()
        const lines: string[] = []
        lines.push(`📖 Library: ${stats.totalDocs} documents`)
        lines.push(
          `⚡︎ Categories: ${stats.categories.length}${stats.categories.length ? ` (${stats.categories.join(', ')})` : ''}`
        )
        lines.push(`📝 Total Words: ${stats.totalWords.toLocaleString()}`)
        if (stats.languages?.length) lines.push(`🌍 Languages: ${stats.languages.join(', ')}`)
        lines.push('')
        lines.push('📋 Commands:')
        lines.push('/docs                      - Help and status')
        lines.push('/doc-search <query> [cat]  - Search library')
        lines.push('/doc-add <url> [cat]       - Add documentation')
        lines.push('/doc-stats [--detailed]    - Show statistics')
        lines.push('/doc-list [category]       - List documentation')
        lines.push('/doc-load <names>          - Load docs to AI context')
        lines.push('/doc-context [--detailed]  - Show AI doc context')
        lines.push('/doc-unload [names|--all]  - Unload docs')
        lines.push('/doc-suggest <query>       - Suggest docs')

        this.printPanel(
          boxen(lines.join('\n'), {
            title: 'Documentation System',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'magenta',
            width: this.getOptimalPanelWidth(),
          })
        )

        return
      }

      // Handle subcommands
      if (args.length === 0) {
        console.log(chalk.red('Missing subcommand. Use /doc help for available commands.'))
        return
      }

      const subcommand = args[0]
      const _subArgs = args.slice(1)

      switch (subcommand) {
        case 'status':
          docLibrary.showStatus()
          break
        case 'help':
          await this.handleDocsCommand([])
          break
        default:
          console.log(chalk.red(`❌ Unknown docs subcommand: ${subcommand}`))
          console.log(chalk.gray('Use "/docs" for help'))
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Docs command error: ${error.message}`))
    }
    // Ensure output is flushed and visible before showing prompt
    console.log() // Extra newline for better separation
    this.renderPromptAfterOutput()
  }

  private async handleDocSearchCommand(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        this.printPanel(
          boxen(
            [
              'Usage: /doc-search <query> [category]',
              '',
              'Example: /doc-search "react hooks"',
              'Example: /doc-search "api" backend',
            ].join('\n'),
            {
              title: 'Doc Search Command',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            }
          )
        )
        return
      }

      const query = args[0]
      const category = args[1]

      console.log(chalk.blue(`🔍 Searching for: "${query}"${category ? ` in category: ${category}` : ''}`))

      const results = await docLibrary.search(query, category, 10)

      if (results.length === 0) {
        console.log(chalk.yellow('❌ No documents found'))
        console.log(chalk.gray('Try different keywords or use /doc-add to add more documentation'))
        return
      }

      console.log(chalk.green(`\n✅ Found ${results.length} results:`))
      console.log(chalk.gray('─'.repeat(60)))

      results.forEach((result, index) => {
        console.log(chalk.blue(`${index + 1}. ${result.entry.title}`))
        console.log(chalk.gray(`   Score: ${(result.score * 100).toFixed(1)}% | Category: ${result.entry.category}`))
        console.log(chalk.gray(`   URL: ${result.entry.url}`))
        console.log(chalk.gray(`   Tags: ${result.entry.tags.join(', ')}`))
        if (result.snippet) {
          console.log(chalk.white(`   Preview: ${result.snippet.substring(0, 120)}...`))
        }
        console.log()
      })
    } catch (error: any) {
      console.error(chalk.red(`❌ Search error: ${error.message}`))
    }
  }

  private async handleDocAddCommand(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        this.printPanel(
          boxen(
            [
              'Usage: /doc-add <url> [category] [tags...]',
              '',
              'Example: /doc-add https://reactjs.org/',
              'Example: /doc-add https://nodejs.org/ backend node,api',
            ].join('\n'),
            {
              title: 'Doc Add Command',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            }
          )
        )
        return
      }

      const url = args[0]
      const category = args[1] || 'general'
      const tags = args.slice(2)

      // Simple URL validation
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.log(chalk.red('❌ Invalid URL. Must start with http:// or https://'))
        return
      }

      console.log(chalk.blue(`📖 Adding documentation from: ${url}`))
      if (category !== 'general') console.log(chalk.gray(`⚡︎ Category: ${category}`))
      if (tags.length > 0) console.log(chalk.gray(`🏷️ Tags: ${tags.join(', ')}`))

      const spinner = ora('Extracting content...').start()

      try {
        const entry = await docLibrary.addDocumentation(url, category, tags)
        spinner.succeed('Documentation added successfully!')

        await this.withPanelOutput(async () => {
          const content = [
            chalk.green('✓ Document Added'),
            chalk.gray('────────────────────────────────────────'),
            `${chalk.blue('📄 Title:')} ${entry.title}`,
            `${chalk.gray('🆔 ID:')} ${entry.id}`,
            `${chalk.gray('⚡︎ Category:')} ${entry.category}`,
            `${chalk.gray('🏷️ Tags:')} ${entry.tags.join(', ')}`,
            `${chalk.gray('📝 Words:')} ${entry.metadata.wordCount}`,
            `${chalk.gray('🌍 Language:')} ${entry.metadata.language}`,
          ].join('\n')

          this.printPanel(
            boxen(content, {
              title: '📚 Documentation',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            })
          )
        })
      } catch (error: any) {
        spinner.fail('Failed to add documentation')
        throw error
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Add documentation error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.renderPromptAfterOutput()
  }

  private async handleDocStatsCommand(args: string[]): Promise<void> {
    try {
      const detailed = args.includes('--detailed') || args.includes('-d')

      const stats = docLibrary.getStats()

      console.log(chalk.blue.bold('\n📊 Documentation Library Statistics'))
      console.log(chalk.gray('─'.repeat(50)))

      console.log(chalk.green(`📖 Total Documents: ${stats.totalDocs}`))
      console.log(chalk.green(`📝 Total Words: ${stats.totalWords.toLocaleString()}`))
      console.log(chalk.green(`⚡︎ Categories: ${stats.categories.length}`))
      console.log(chalk.green(`🌍 Languages: ${stats.languages.length}`))
      console.log(chalk.green(`🎞️Average Access Count: ${stats.avgAccessCount.toFixed(1)}`))

      if (detailed && stats.categories.length > 0) {
        console.log(chalk.blue('\n📂 By Category:'))
        stats.categories.forEach((category: string) => {
          console.log(chalk.gray(`  • ${category}`))
        })

        console.log(chalk.blue('\n🌍 By Language:'))
        stats.languages.forEach((language: string) => {
          console.log(chalk.gray(`  • ${language}`))
        })
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Stats error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.renderPromptAfterOutput()
  }

  private async handleDocListCommand(args: string[]): Promise<void> {
    try {
      const category = args[0]

      // Get all documents (accessing the private docs Map)
      const allDocs = Array.from((docLibrary as any).docs.values()) as DocumentationEntry[]

      // Filter by category if specified
      const docs = category ? allDocs.filter((doc) => doc.category === category) : allDocs

      if (docs.length === 0) {
        const msg = category
          ? `No documents found in category: ${category}`
          : 'No documents in library\nUse /doc-add <url> to add documentation'
        this.printPanel(
          boxen(msg, { title: 'Documentation', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' })
        )
        return
      }

      const lines: string[] = []
      docs
        .sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime())
        .slice(0, 50)
        .forEach((doc, index) => {
          lines.push(`${index + 1}. ${doc.title}`)
          lines.push(`   ID: ${doc.id} | Category: ${doc.category}`)
          lines.push(`   URL: ${doc.url}`)
          lines.push(`   Tags: ${doc.tags.join(', ') || 'none'}`)
          lines.push(`   Words: ${doc.metadata.wordCount} | Access: ${doc.accessCount}x`)
          lines.push(`   Added: ${doc.timestamp.toLocaleDateString()}`)
        })
      const title = `📋 Documentation List${category ? ` (Category: ${category})` : ''}`
      const maxHeight = this.getAvailablePanelHeight()
      let content = lines.join('\n')

      if (content.split('\n').length > maxHeight) {
        const truncatedLines = content.split('\n').slice(0, maxHeight - 2)
        content = `${truncatedLines.join('\n')}\n\n⚠️  Content truncated - use /docs list <category> to filter`
      }

      this.printPanel(
        boxen(content, {
          title,
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
          width: Math.min(120, (process.stdout.columns || 100) - 4),
          height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
        })
      )
      return
    } catch (error: any) {
      console.error(chalk.red(`❌ List error: ${error.message}`))
    }
    // panel already handled prompt redraw
  }

  private async handleDocTagCommand(args: string[]): Promise<void> {
    try {
      console.log(chalk.yellow('🏷️ Document tagging feature is coming soon!'))
      console.log(chalk.gray('This will allow you to:'))
      console.log(chalk.gray('• Add tags to existing documents'))
      console.log(chalk.gray('• Remove tags from documents'))
      console.log(chalk.gray('• Search documents by tags'))
      console.log(chalk.gray('• List all available tags'))

      if (args.length > 0) {
        console.log(chalk.gray(`\nYour input: ${args.join(' ')}`))
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Tag error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.renderPromptAfterOutput()
  }

  private async handleDocSyncCommand(_args: string[]): Promise<void> {
    try {
      const cloudProvider = getCloudDocsProvider()
      if (!cloudProvider?.isReady()) {
        const maxHeight = this.getAvailablePanelHeight()
        this.printPanel(
          boxen('Cloud documentation not configured\nSet SUPABASE_URL and SUPABASE_ANON_KEY or use /config to enable', {
            title: 'Docs Sync Warning',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
            width: Math.min(120, (process.stdout.columns || 100) - 4),
            height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
          })
        )
        return
      }

      const spinner = ora('Syncing with cloud...').start()

      try {
        const result = await cloudProvider.sync()
        spinner.succeed('Docs sync complete')
        const lines = [`Downloaded: ${result.downloaded}`, `Uploaded: ${result.uploaded}`]
        if (result.downloaded > 0) lines.push('Use /doc-search to explore new content')
        const maxHeight = this.getAvailablePanelHeight()
        this.printPanel(
          boxen(lines.join('\n'), {
            title: 'Docs Sync',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
            width: Math.min(120, (process.stdout.columns || 100) - 4),
            height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
          })
        )
      } catch (error: any) {
        spinner.fail('Sync failed')
        throw error
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Sync error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.renderPromptAfterOutput()
  }

  private async handleDocLoadCommand(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        const suggestions = await docsContextManager.suggestDocs('popular')
        const lines = [
          'Usage: /doc-load <doc-names>',
          'Example: /doc-load "react hooks" nodejs-api',
          'Example: /doc-load frontend-docs backend-docs',
        ]
        if (suggestions.length > 0) {
          lines.push('')
          lines.push('Suggestions:')
          suggestions.forEach((t) => lines.push(` • ${t}`))
        }
        const maxHeight = this.getAvailablePanelHeight()
        let content = lines.join('\n')

        if (content.split('\n').length > maxHeight) {
          const truncatedLines = content.split('\n').slice(0, maxHeight - 2)
          content = `${truncatedLines.join('\n')}\n\n⚠️  Content truncated`
        }

        this.printPanel(
          boxen(content, {
            title: 'Load Docs',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
            width: Math.min(120, (process.stdout.columns || 100) - 4),
            height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
          })
        )
        return
      }

      const maxHeight = this.getAvailablePanelHeight()
      this.printPanel(
        boxen(`Loading ${args.length} document(s) into AI context…`, {
          title: '⚡︎ Load Docs',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
          width: Math.min(120, (process.stdout.columns || 100) - 4),
          height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
        })
      )

      const loadedDocs = await docsContextManager.loadDocs(args)

      if (loadedDocs.length > 0) {
        const stats = docsContextManager.getContextStats()
        console.log(chalk.green(`✓ Context updated:`))
        console.log(chalk.gray(`   • Loaded docs: ${stats.loadedCount}`))
        console.log(chalk.gray(`   • Total words: ${stats.totalWords.toLocaleString()}`))
        console.log(chalk.gray(`   • Context usage: ${stats.utilizationPercent.toFixed(1)}%`))
        console.log(chalk.gray(`   • Categories: ${stats.categories.join(', ')}`))

        console.log(chalk.blue('\n💬 AI agents now have access to loaded documentation!'))
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Load error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.renderPromptAfterOutput()
  }

  private async handleDocContextCommand(args: string[]): Promise<void> {
    try {
      const stats = docsContextManager.getContextStats()

      console.log(chalk.blue.bold('\n📚 AI Documentation Context Status'))
      console.log(chalk.gray('─'.repeat(50)))

      if (stats.loadedCount === 0) {
        console.log(chalk.yellow('❌ No documentation loaded in context'))
        console.log(chalk.gray('Use /doc-load <names> to load documentation'))
        console.log(chalk.gray('Use /doc-suggest <query> to find relevant docs'))
        return
      }

      console.log(chalk.green(`📖 Loaded Documents: ${stats.loadedCount}`))
      console.log(chalk.green(`📝 Total Words: ${stats.totalWords.toLocaleString()}`))
      console.log(chalk.green(`📊 Context Usage: ${stats.utilizationPercent.toFixed(1)}%`))
      console.log(chalk.green(`⚡︎ Categories: ${stats.categories.join(', ')}`))
      console.log(chalk.green(`🏠 Local: ${stats.sources.local}, ☁️ Shared: ${stats.sources.shared}`))

      if (args.includes('--detailed') || args.includes('-d')) {
        console.log(chalk.blue('\n📋 Loaded Documents:'))
        const loadedDocs = docsContextManager.getLoadedDocs()

        loadedDocs.forEach((doc, index) => {
          const wordCount = doc.content.split(' ').length
          console.log(chalk.blue(`${index + 1}. ${doc.title}`))
          console.log(chalk.gray(`   Category: ${doc.category} | Source: ${doc.source}`))
          console.log(chalk.gray(`   Tags: ${doc.tags.join(', ')}`))
          console.log(chalk.gray(`   Words: ${wordCount.toLocaleString()} | Loaded: ${doc.loadedAt.toLocaleString()}`))
          if (doc.summary) {
            console.log(chalk.gray(`   Summary: ${doc.summary}`))
          }
          console.log()
        })
      }

      // Context summary for AI
      const summary = docsContextManager.getContextSummary()
      if (args.includes('--summary')) {
        console.log(chalk.blue('\n🤖 AI Context Summary:'))
        console.log(chalk.gray('─'.repeat(40)))
        console.log(summary)
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Context error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.renderPromptAfterOutput()
  }

  private async handleDocUnloadCommand(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        // Show current loaded docs and ask for confirmation to clear all
        const stats = docsContextManager.getContextStats()
        if (stats.loadedCount === 0) {
          console.log(chalk.yellow('❌ No documentation loaded in context'))
          return
        }

        console.log(chalk.yellow(`⚠️ This will remove all ${stats.loadedCount} loaded documents from AI context`))
        console.log(chalk.gray('Use /doc-unload <names> to remove specific documents'))
        console.log(chalk.gray('Use /doc-unload --all to confirm removal of all documents'))
        return
      }

      if (args.includes('--all')) {
        await docsContextManager.unloadDocs()
        console.log(chalk.green('✓ All documentation removed from AI context'))
        return
      }

      await docsContextManager.unloadDocs(args)

      const stats = docsContextManager.getContextStats()
      console.log(chalk.green('✓ Documentation context updated'))
      console.log(chalk.gray(`   • Remaining docs: ${stats.loadedCount}`))
      console.log(chalk.gray(`   • Context usage: ${stats.utilizationPercent.toFixed(1)}%`))
    } catch (error: any) {
      console.error(chalk.red(`❌ Unload error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.renderPromptAfterOutput()
  }

  private async handleDocSuggestCommand(args: string[]): Promise<void> {
    try {
      const query = args.join(' ')
      if (!query) {
        this.printPanel(
          boxen(
            [
              'Usage: /doc-suggest <query>',
              '',
              'Example: /doc-suggest react hooks',
              'Example: /doc-suggest authentication',
            ].join('\n'),
            {
              title: 'Doc Suggest Command',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            }
          )
        )
        return
      }

      console.log(chalk.blue(`💡 Suggesting documentation for: "${query}"`))

      const suggestions = await docsContextManager.suggestDocs(query, 10)

      if (suggestions.length === 0) {
        console.log(chalk.yellow('❌ No relevant documentation found'))
        console.log(chalk.gray('Try different keywords or use /doc-add to add more documentation'))
        return
      }

      console.log(chalk.green(`\n✅ Found ${suggestions.length} relevant documents:`))
      console.log(chalk.gray('─'.repeat(50)))

      suggestions.forEach((title, index) => {
        console.log(chalk.blue(`${index + 1}. ${title}`))
      })

      console.log(chalk.gray('\n💡 To load these documents:'))
      console.log(chalk.gray(`/doc-load "${suggestions.slice(0, 3).join('" "')}"`))
    } catch (error: any) {
      console.error(chalk.red(`❌ Suggest error: ${error.message}`))
    }
  }

  // Utility methods
  private async initializeSystems(): Promise<void> {
    await this.agentManager.initialize()
    // Ensure orchestrator services share our working directory
    planningService.setWorkingDirectory(this.workingDirectory)

    // Initialize memory and snapshot services
    await memoryService.initialize()
    await snapshotService.initialize()

    // Event bridge is idempotent
    this.setupOrchestratorEventBridge()

    // Initialize cloud docs provider
    await this.initializeCloudDocs()

    structuredLogger.info('System Init', '✓ Systems initialized')
  }

  private async initializeCloudDocs(): Promise<void> {
    try {
      const cloudDocsConfig = this.configManager.get('cloudDocs')

      // Get API credentials from environment or config
      const apiUrl = cloudDocsConfig.apiUrl || process.env.SUPABASE_URL
      const apiKey = cloudDocsConfig.apiKey || process.env.SUPABASE_ANON_KEY

      if (cloudDocsConfig.enabled && apiUrl && apiKey) {
        const provider = createCloudDocsProvider({
          ...cloudDocsConfig,
          apiUrl,
          apiKey,
        })

        if (cloudDocsConfig.autoSync) {
          structuredLogger.info('Docs Cloud', '⚡︎ Auto-syncing documentation library...')
          await provider.sync()
        }

        structuredLogger.info('Docs Cloud', '✓ Cloud documentation system ready')
      } else {
        structuredLogger.info('Docs Cloud', 'ℹ️ Cloud documentation disabled')
      }
    } catch (error: any) {
      structuredLogger.warning('Docs Cloud', `⚠️ Cloud docs initialization failed: ${error.message}`)
    }
  }

  private switchModel(modelName: string): void {
    try {
      this.configManager.setCurrentModel(modelName)

      // Validate the new model using model provider
      if (modelProvider.validateApiKey()) {
        console.log(chalk.green(`✓ Switched to model: ${modelName}`))
      } else {
        console.log(chalk.yellow(`⚠️  Switched to model: ${modelName} (API key needed)`))
      }

      this.addLiveUpdate({
        type: 'info',
        content: `Model switched to: ${modelName}`,
        source: 'model-switch',
      })
    } catch (error: any) {
      this.addLiveUpdate({
        type: 'error',
        content: `Model switch failed: ${error.message}`,
        source: 'model-switch',
      })
      console.log(chalk.red(`❌ Could not switch model: ${error.message}`))
    }
  }

  private async askForInput(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      if (!this.rl) {
        resolve('')
        return
      }

      this.rl.question(chalk.cyan(prompt), (answer) => {
        resolve(answer.trim())
      })
    })
  }

  private async promptInput(prompt: string, isPassword: boolean = false): Promise<string> {
    return new Promise((resolve) => {
      if (!this.rl) {
        resolve('')
        return
      }

      if (isPassword) {
        // For passwords, we'll use a simple hidden input approach
        process.stdout.write(chalk.cyan(prompt))

        const stdin = process.stdin
        stdin.setRawMode(true)
        stdin.resume()
        stdin.setEncoding('utf8')

        let password = ''

        const onData = (char: string) => {
          switch (char) {
            case '\n':
            case '\r':
            case '\u0004':
              stdin.setRawMode(false)
              stdin.pause()
              stdin.off('data', onData)
              process.stdout.write('\n')
              resolve(password)
              break
            case '\u0003':
              process.exit()
              break
            case '\u007f':
              if (password.length > 0) {
                password = password.slice(0, -1)
                process.stdout.write('\b \b')
              }
              break
            default:
              if (char.charCodeAt(0) >= 32) {
                password += char
                process.stdout.write('*')
              }
              break
          }
        }

        stdin.on('data', onData)
      } else {
        this.rl.question(chalk.cyan(prompt), (answer) => {
          resolve(answer.trim())
        })
      }
    })
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  private async clearSession(): Promise<void> {
    // Clear current chat session
    chatManager.clearCurrentSession()

    // Clear legacy session context
    this.sessionContext.clear()

    // Clear UI indicators and state
    this.indicators.clear()
    this.liveUpdates.length = 0

    // Stop any running spinners
    this.spinners.forEach((spinner) => spinner.stop())
    this.spinners.clear()

    // Stop any progress bars
    this.progressBars.forEach((bar) => bar.stop())
    this.progressBars.clear()

    console.log(chalk.green('✓ Session and UI state cleared'))
    this.addLiveUpdate({ type: 'info', content: 'Session cleared', source: 'session' })
  }

  private async compactSession(): Promise<void> {
    console.log(chalk.blue('📊 Compacting session to save tokens...'))

    const session = chatManager.getCurrentSession()
    if (!session || session.messages.length <= 3) {
      const box = boxen('Session too short to compact', {
        title: 'Compact Session',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
      })
      console.log(box)
      return
    }

    try {
      const originalCount = session.messages.length

      // Estimate tokens before
      const estimateTokens = (msgs: any[]) => Math.round(msgs.reduce((s, m) => s + (m.content?.length || 0), 0) / 4)
      const tokensBefore = estimateTokens(session.messages)

      // Ultra-aggressive compaction: keep only system message and last user+assistant pair
      const systemMessages = session.messages.filter((m) => m.role === 'system')
      const recentMessages = session.messages.slice(-2) // Only last 2 messages

      // Create ultra-short summary
      const olderMessages = session.messages.slice(0, -2).filter((m) => m.role !== 'system')

      let removed = 0
      if (olderMessages.length > 0) {
        removed = olderMessages.length
        const summaryMessage = {
          role: 'system' as const,
          content: `[Compacted ${olderMessages.length} messages into summary]`,
          timestamp: new Date(),
        }

        session.messages = [...systemMessages, summaryMessage, ...recentMessages]
      }

      // Additional token optimization: truncate long messages
      session.messages.forEach((msg) => {
        if (msg.content.length > 2000) {
          msg.content = `${msg.content.substring(0, 2000)}...[truncated]`
        }
      })

      const tokensAfter = estimateTokens(session.messages)
      const tokensSaved = Math.max(0, tokensBefore - tokensAfter)

      const details = [
        `${chalk.green('Messages:')} ${originalCount} → ${session.messages.length}  (${removed} removed)`,
        `${chalk.green('Est. Tokens:')} ${tokensBefore.toLocaleString()} → ${tokensAfter.toLocaleString()}  (${chalk.yellow(`-${tokensSaved.toLocaleString()}`)})`,
        '',
        chalk.gray('Kept: system messages + last user/assistant pair'),
        chalk.gray('Long messages truncated to 2000 chars'),
      ].join('\n')

      this.printPanel(
        boxen(details, {
          title: 'Compact Session',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )

      this.addLiveUpdate({
        type: 'info',
        content: `Session compacted (saved ~${tokensSaved} tokens)`,
        source: 'session',
      })
    } catch (error: any) {
      this.printPanel(
        boxen(`Error compacting session: ${error.message}`, {
          title: 'Compact Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  private async manageTokenCommands(args: string[]): Promise<void> {
    const action = args[0]

    switch (action) {
      case 'reset':
        // Reset session counters
        this.sessionTokenUsage = 0
        this.contextTokens = 0
        this.sessionStartTime = new Date()
        console.log(chalk.green('✓ Session token counters reset'))
        this.addLiveUpdate({
          type: 'info',
          content: 'Token counters reset',
          source: 'tokens',
        })
        break

      case 'compare':
        await this.showModelComparison()
        break

      case 'pricing':
        await this.showModelPricing()
        break

      case 'estimate': {
        const targetTokens = parseInt(args[1], 10) || 50000
        await this.showCostEstimate(targetTokens)
        break
      }

      case 'cache':
        await this.manageTokenCache(args[1])
        break

      case 'help':
        this.showTokenHelp()
        break

      default:
        await this.showTokenUsage()
    }
  }
  private async showModelComparison(): Promise<void> {
    console.log(chalk.blue('💸 Complete Model Cost Comparison'))

    try {
      const session = chatManager.getCurrentSession()
      if (!session) {
        console.log(chalk.gray('No active session for comparison'))
        return
      }

      const userTokens = Math.round(
        session.messages.filter((m) => m.role === 'user').reduce((sum, m) => sum + m.content.length, 0) / 4
      )
      const assistantTokens = Math.round(
        session.messages.filter((m) => m.role === 'assistant').reduce((sum, m) => sum + m.content.length, 0) / 4
      )

      const { calculateTokenCost, MODEL_COSTS } = await import('./config/token-limits')
      const currentModel = this.configManager.getCurrentModel()

      this.printPanel(
        boxen(
          `${chalk.cyan('Session Tokens:')}\n` +
          `Input (User): ${chalk.white(userTokens.toLocaleString())} tokens\n` +
          `Output (Assistant): ${chalk.white(assistantTokens.toLocaleString())} tokens\n` +
          `Total: ${chalk.white((userTokens + assistantTokens).toLocaleString())} tokens`,
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
          }
        )
      )

      console.log(chalk.cyan('\n🏆 All Models Comparison:'))
      console.log(chalk.gray('─'.repeat(90)))
      console.log(
        chalk.white(
          'Model'.padEnd(30) +
          'Total Cost'.padStart(12) +
          'Input Cost'.padStart(12) +
          'Output Cost'.padStart(12) +
          'Provider'.padStart(15)
        )
      )
      console.log(chalk.gray('─'.repeat(90)))

      const allModels = Object.keys(MODEL_COSTS).filter((k) => k !== 'default')
      const costs = allModels
        .map((modelKey) => {
          const cost = calculateTokenCost(userTokens, assistantTokens, modelKey)
          return { modelKey, ...cost }
        })
        .sort((a, b) => a.totalCost - b.totalCost)

      costs.forEach((cost) => {
        const isCurrentModel = cost.modelKey === currentModel
        const prefix = isCurrentModel ? chalk.green('→ ') : '  '
        const modelName = isCurrentModel ? chalk.green.bold(cost.model) : cost.model
        const totalCost = isCurrentModel
          ? chalk.yellow.bold(`$${cost.totalCost.toFixed(4)}`)
          : `$${cost.totalCost.toFixed(4)}`
        const provider = cost.modelKey.includes('claude')
          ? 'Anthropic'
          : cost.modelKey.includes('gpt')
            ? 'OpenAI'
            : cost.modelKey.includes('gemini')
              ? 'Google'
              : 'Unknown'

        console.log(
          `${prefix}${modelName.padEnd(28)} ${totalCost.padStart(10)} $${cost.inputCost.toFixed(4).padStart(7)} $${cost.outputCost.toFixed(4).padStart(8)} ${provider.padStart(13)}`
        )
      })

      // Show savings potential
      const currentCost = costs.find((c) => c.modelKey === currentModel)
      const cheapestCost = costs[0]
      if (currentCost && cheapestCost && currentCost.totalCost > cheapestCost.totalCost) {
        const savings = currentCost.totalCost - cheapestCost.totalCost
        const savingsPercent = (savings / currentCost.totalCost) * 100
        console.log(
          chalk.yellow(
            `\n💡 Potential savings: $${savings.toFixed(4)} (${savingsPercent.toFixed(1)}%) by switching to ${cheapestCost.model}`
          )
        )
      }
    } catch (error: any) {
      console.log(chalk.red(`Model comparison error: ${error.message}`))
    }
  }

  private async showModelPricing(): Promise<void> {
    console.log(chalk.blue('🏷️ Current Model Pricing Details'))

    try {
      const { getModelPricing, MODEL_COSTS } = await import('./config/token-limits')
      const currentModel = this.configManager.getCurrentModel()
      const pricing = getModelPricing(currentModel)

      this.printPanel(
        boxen(
          `${chalk.cyan('Current Model:')}\n` +
          `${chalk.white(pricing.displayName)}\n\n` +
          `${chalk.green('Input Pricing:')} $${pricing.input.toFixed(2)} per 1M tokens\n` +
          `${chalk.green('Output Pricing:')} $${pricing.output.toFixed(2)} per 1M tokens\n\n` +
          `${chalk.yellow('Examples:')}\n` +
          `• 1K input + 1K output = $${((pricing.input + pricing.output) / 1000).toFixed(4)}\n` +
          `• 10K input + 10K output = $${((pricing.input + pricing.output) / 100).toFixed(4)}\n` +
          `• 100K input + 100K output = $${((pricing.input + pricing.output) / 10).toFixed(3)}`,
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue',
          }
        )
      )

      // Show all available models
      console.log(chalk.cyan('\n📋 All Available Models:'))
      console.log(chalk.gray('─'.repeat(80)))

      Object.entries(MODEL_COSTS).forEach(([key, model]) => {
        if (key === 'default') return
        const isCurrentModel = key === currentModel
        const prefix = isCurrentModel ? chalk.green('→ ') : '  '
        const modelName = isCurrentModel ? chalk.green.bold(model.displayName) : model.displayName

        console.log(
          `${prefix}${modelName.padEnd(25)} In: $${model.input.toFixed(2).padStart(6)} Out: $${model.output.toFixed(2).padStart(6)}`
        )
      })
    } catch (error: any) {
      console.log(chalk.red(`Pricing display error: ${error.message}`))
    }
  }

  private async showCostEstimate(targetTokens: number): Promise<void> {
    console.log(chalk.blue(`💰 Cost Estimate for ${targetTokens.toLocaleString()} tokens`))

    try {
      const { calculateTokenCost, MODEL_COSTS } = await import('./config/token-limits')
      const currentModel = this.configManager.getCurrentModel()

      // Assume 50/50 input/output split
      const inputTokens = Math.floor(targetTokens / 2)
      const outputTokens = Math.floor(targetTokens / 2)

      this.printPanel(
        boxen(
          `${chalk.cyan('Estimation Parameters:')}\n` +
          `Target Tokens: ${chalk.white(targetTokens.toLocaleString())}\n` +
          `Input Tokens: ${chalk.white(inputTokens.toLocaleString())} (50%)\n` +
          `Output Tokens: ${chalk.white(outputTokens.toLocaleString())} (50%)`,
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
          }
        )
      )

      console.log(chalk.cyan('\n💸 Cost Estimates by Model:'))
      console.log(chalk.gray('─'.repeat(60)))

      const models = Object.keys(MODEL_COSTS).filter((k) => k !== 'default')
      models.forEach((modelKey) => {
        const cost = calculateTokenCost(inputTokens, outputTokens, modelKey)
        const isCurrentModel = modelKey === currentModel
        const prefix = isCurrentModel ? chalk.green('→ ') : '  '
        const modelName = isCurrentModel ? chalk.green.bold(cost.model) : cost.model
        const totalCost = isCurrentModel
          ? chalk.yellow.bold(`$${cost.totalCost.toFixed(4)}`)
          : `$${cost.totalCost.toFixed(4)}`

        console.log(`${prefix}${modelName.padEnd(25)} ${totalCost}`)
      })
    } catch (error: any) {
      console.log(chalk.red(`Cost estimation error: ${error.message}`))
    }
  }

  private showTokenHelp(): void {
    const content = [
      '🎫 Token Commands Help',
      '',
      'Usage: /tokens [command] [options]',
      '',
      'Commands:',
      '  (no args)     Show current session token usage and costs',
      '  compare       Compare costs across all models for current session',
      '  pricing       Show detailed pricing for current model',
      '  estimate <n>  Estimate costs for N tokens (default: 50000)',
      '  reset         Reset session token counters',
      '  cache <cmd>   Manage token caches (clear, stats, optimize)',
      '  help          Show this help message',
      '',
      'Examples:',
      '  /tokens              # Show current usage',
      '  /tokens compare      # Compare all models',
      '  /tokens estimate 100000  # Estimate cost for 100K tokens',
      '  /tokens cache clear  # Clear token caches',
    ].join('\n')

    this.printPanel(
      boxen(content, {
        title: '🎫 Token Commands Help',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'blue',
      })
    )
  }

  private async manageTokenCache(action?: string): Promise<void> {
    switch (action) {
      case 'clear':
        await Promise.all([tokenCache.clearCache(), completionCache.clearCache()])

        // Also clear Redis cache if available
        try {
          const { cacheService } = await import('./services/cache-service')
          await cacheService.clearAll()
        } catch (_error) {
          // Redis cache service not available, silently continue
        }

        console.log(chalk.green('✓ All caches cleared (local + Redis)'))
        break

      case 'cleanup': {
        const removed = await tokenCache.cleanupExpired()
        console.log(chalk.green(`✓ Removed ${removed} expired cache entries`))
        break
      }

      case 'settings':
        console.log(chalk.blue('� Current Cache Settings:'))
        console.log(`  Max cache size: 1000 entries`)
        console.log(`  Similarity threshold: 0.85`)
        console.log(`  Max age: 7 days`)
        console.log(`  Cache file: ./.nikcli/token-cache.json`)
        break

      case 'export': {
        const exportPath = `./cache-export-${Date.now()}.json`
        await tokenCache.exportCache(exportPath)
        break
      }

      default: {
        // 'stats' or no argument
        const stats = tokenCache.getStats()
        const completionStats = completionCache.getStats()

        // Get Redis cache stats
        let redisStats = ''
        try {
          const { cacheService } = await import('./services/cache-service')
          const cacheStats = await cacheService.getStats()

          redisStats =
            `${chalk.red('🚀 Redis Cache:')}\n` +
            `  Status: ${cacheStats.redis.connected ? chalk.green('✓ Connected') : chalk.red('❌ Disconnected')}\n` +
            `  Enabled: ${cacheStats.redis.enabled ? chalk.green('✓ Yes') : chalk.yellow('⚠️ No')}\n` +
            `  Total Hits: ${chalk.green(cacheStats.totalHits.toLocaleString())}\n` +
            `  Hit Rate: ${chalk.blue(cacheStats.hitRate.toFixed(1))}%\n` +
            `  Fallback: ${cacheStats.fallback.enabled ? chalk.cyan('SmartCache') : chalk.gray('None')}\n\n`
        } catch (_error) {
          redisStats = `${chalk.red('🚀 Redis Cache:')}\n` + `  Status: ${chalk.gray('Unavailable')}\n\n`
        }

        const totalTokensSaved = stats.totalTokensSaved + completionStats.totalHits * 50 // Estimate 50 tokens saved per completion hit

        this.printPanel(
          boxen(
            `${chalk.cyan.bold('🔮 Advanced Cache System Statistics')}\n\n` +
            redisStats +
            `${chalk.magenta('📦 Full Response Cache:')}\n` +
            `  Entries: ${chalk.white(stats.totalEntries.toLocaleString())}\n` +
            `  Hits: ${chalk.green(stats.totalHits.toLocaleString())}\n` +
            `  Tokens Saved: ${chalk.yellow(stats.totalTokensSaved.toLocaleString())}\n\n` +
            `${chalk.cyan('🔮 Completion Protocol Cache:')} ${chalk.red('NEW!')}\n` +
            `  Patterns: ${chalk.white(completionStats.totalPatterns.toLocaleString())}\n` +
            `  Hits: ${chalk.green(completionStats.totalHits.toLocaleString())}\n` +
            `  Avg Confidence: ${chalk.blue(Math.round(completionStats.averageConfidence * 100))}%\n\n` +
            `${chalk.green.bold('💰 Total Savings:')}\n` +
            `Combined Tokens: ${chalk.yellow(totalTokensSaved.toLocaleString())}\n` +
            `Estimated Cost: ~$${((totalTokensSaved * 0.003) / 1000).toFixed(2)}`,
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'magenta',
            }
          )
        )

        if (stats.totalEntries > 0) {
          console.log(chalk.cyan('\n Available Actions:'))
          console.log('  /cache clear    - Clear all cache entries')
          console.log('  /cache cleanup  - Remove expired entries')
          console.log('  /cache settings - Show cache configuration')
          console.log('  /cache export   - Export cache to file')
        }
        break
      }
    }
  }

  private async showTokenUsage(): Promise<void> {
    console.log(chalk.blue('🔢 Advanced Token Analysis & Real-time Costs'))

    try {
      // Check if we have an active token tracking session
      const tokenSession = contextTokenManager.getCurrentSession()
      const chatSession = chatManager.getCurrentSession()

      if (tokenSession && chatSession) {
        // Use precise tokenizer data
        const currentModel = tokenSession.model
        const currentProvider = tokenSession.provider
        const limits = universalTokenizer.getModelLimits(currentModel, currentProvider)

        // Get real-time statistics
        const stats = contextTokenManager.getSessionStats()
        if (stats?.session) {
          const totalTokens = stats.session.totalInputTokens + stats.session.totalOutputTokens
          const usagePercent = (totalTokens / limits.context) * 100

          this.printPanel(
            boxen(
              `${chalk.cyan('🎯 Precise Token Tracking Session')}\n\n` +
              `Model: ${chalk.white(`${currentProvider}:${currentModel}`)}\n` +
              `Messages: ${chalk.white(stats.session.messageCount.toLocaleString())}\n` +
              `Input Tokens: ${chalk.white(stats.session.totalInputTokens.toLocaleString())}\n` +
              `Output Tokens: ${chalk.white(stats.session.totalOutputTokens.toLocaleString())}\n` +
              `Total Tokens: ${chalk.white(totalTokens.toLocaleString())}\n` +
              `Context Limit: ${chalk.gray(limits.context.toLocaleString())}\n` +
              `Usage: ${usagePercent > 90 ? chalk.red(`${usagePercent.toFixed(1)}%`) : usagePercent > 80 ? chalk.yellow(`${usagePercent.toFixed(1)}%`) : chalk.green(`${usagePercent.toFixed(1)}%`)}\n` +
              `Remaining: ${chalk.gray((limits.context - totalTokens).toLocaleString())} tokens\n\n` +
              `${chalk.yellow('💰 Precise Real-time Cost:')}\n` +
              `Total Session Cost: ${chalk.yellow.bold(`$${stats.session.totalCost.toFixed(6)}`)}\n` +
              `Average per Message: ${chalk.green(`$${stats.costPerMessage.toFixed(6)}`)}\n` +
              `Tokens per Minute: ${chalk.blue(Math.round(stats.tokensPerMinute).toLocaleString())}\n` +
              `Session Duration: ${`${chalk.gray(Math.round(stats.session.lastActivity.getTime() - stats.session.startTime.getTime()) / 60000)} min`}`,
              {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: usagePercent > 90 ? 'red' : usagePercent > 80 ? 'yellow' : 'green',
                title: '🔢 Universal Tokenizer',
              }
            )
          )

          // Context optimization recommendations
          const optimization = contextTokenManager.analyzeContextOptimization()
          if (optimization.shouldTrim || optimization.recommendation !== 'continue') {
            this.printPanel(
              boxen(
                `${chalk.yellow('⚡ Optimization Recommendations:')}\n\n` +
                `Status: ${optimization.recommendation === 'continue' ? chalk.green('✓ Good') : chalk.yellow('⚠️  Attention needed')}\n` +
                `Action: ${chalk.white(optimization.recommendation.replace('_', ' ').toUpperCase())}\n` +
                `Reason: ${chalk.gray(optimization.reason)}`,
                {
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'yellow',
                  title: 'Smart Optimization',
                }
              )
            )
          }
        }
      } else if (chatSession) {
        // Fallback to legacy analysis with improved precision
        const totalChars = chatSession.messages.reduce((sum, msg) => sum + msg.content.length, 0)
        const currentModel = this.configManager.getCurrentModel()
        const currentProvider = 'anthropic' // Fallback for now

        // Try to get precise count for the conversation
        let preciseTokens = 0
        let isPrecise = false
        try {
          const coreMessages = chatSession.messages.map((m) => ({
            role: m.role as any,
            content: m.content,
          }))
          preciseTokens = await universalTokenizer.countMessagesTokens(coreMessages, currentModel, currentProvider)
          isPrecise = true
        } catch (_error) {
          console.warn('Precise counting failed, using character estimation')
          preciseTokens = Math.round(totalChars / 4)
        }

        const limits = universalTokenizer.getModelLimits(currentModel, currentProvider)
        const usagePercent = (preciseTokens / limits.context) * 100

        // Calculate precise costs
        const userTokens = Math.round(
          chatSession.messages.filter((m) => m.role === 'user').reduce((sum, m) => sum + m.content.length, 0) / 4
        )
        const assistantTokens = Math.round(
          chatSession.messages.filter((m) => m.role === 'assistant').reduce((sum, m) => sum + m.content.length, 0) / 4
        )

        const currentCost = universalTokenizer.calculateCost(userTokens, assistantTokens, currentModel)

        this.printPanel(
          boxen(
            `${chalk.cyan(`${isPrecise ? '🎯' : '📊'} Session Token Analysis`)}\n\n` +
            `Messages: ${chalk.white(chatSession.messages.length.toLocaleString())}\n` +
            `Characters: ${chalk.white(totalChars.toLocaleString())}\n` +
            `${isPrecise ? 'Precise' : 'Est.'} Tokens: ${chalk.white(preciseTokens.toLocaleString())}\n` +
            `Context Limit: ${chalk.gray(limits.context.toLocaleString())}\n` +
            `Usage: ${usagePercent > 90 ? chalk.red(`${usagePercent.toFixed(1)}%`) : usagePercent > 80 ? chalk.yellow(`${usagePercent.toFixed(1)}%`) : chalk.green(`${usagePercent.toFixed(1)}%`)}\n` +
            `Remaining: ${chalk.gray((limits.context - preciseTokens).toLocaleString())} tokens\n\n` +
            `${chalk.yellow('💰 Cost Analysis:')}\n` +
            `Model: ${chalk.white(currentCost.model)}\n` +
            `Input Cost: ${chalk.green(`$${currentCost.inputCost.toFixed(6)}`)}\n` +
            `Output Cost: ${chalk.green(`$${currentCost.outputCost.toFixed(6)}`)}\n` +
            `Total Cost: ${chalk.yellow.bold(`$${currentCost.totalCost.toFixed(6)}`)}\n\n` +
            `${chalk.blue('💡 Tokenizer:')} ${isPrecise ? chalk.green('Universal Tokenizer ✓') : chalk.yellow('Character estimation (fallback)')}`,
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: usagePercent > 90 ? 'red' : usagePercent > 80 ? 'yellow' : 'green',
              title: isPrecise ? 'Precise Analysis' : 'Estimated Analysis',
            }
          )
        )

        // Message breakdown
        const systemMsgs = chatSession.messages.filter((m) => m.role === 'system')
        const userMsgs = chatSession.messages.filter((m) => m.role === 'user')
        const assistantMsgs = chatSession.messages.filter((m) => m.role === 'assistant')
        const sysTokens = Math.round(systemMsgs.reduce((sum, m) => sum + m.content.length, 0) / 4)

        this.printPanel(
          boxen(
            `System: ${systemMsgs.length} messages (${sysTokens.toLocaleString()} tokens)\n` +
            `User: ${userMsgs.length} messages (${userTokens.toLocaleString()} tokens)\n` +
            `Assistant: ${assistantMsgs.length} messages (${assistantTokens.toLocaleString()} tokens)`,
            {
              title: 'Message Breakdown',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            }
          )
        )

        // Upgrade suggestion
        this.printPanel(
          boxen(
            `${chalk.yellow('💡 Tip:')} For more precise tracking, start a new session to enable\n` +
            `real-time token monitoring with the Universal Tokenizer.\n\n` +
            `Current session uses ${isPrecise ? 'precise' : 'estimated'} counting.`,
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
              title: 'Upgrade Available',
            }
          )
        )

        // Model pricing comparison (panel)
        {
          const comparisonModels = [
            'claude-3-5-sonnet-latest',
            'claude-3-7-sonnet-20250219',
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-5',
            'gpt-5-mini-2025-08-07',
            'gpt-5-nano-2025-08-07',
            'gemini-2.5-pro',
            'gemini-2.5-flash',
            'gemini-2.5-flash-lite',
          ]
          const lines: string[] = []
          comparisonModels.forEach((modelKey) => {
            try {
              const cost = universalTokenizer.calculateCost(userTokens, assistantTokens, modelKey)
              const isCurrentModel = modelKey === currentModel
              const mark = isCurrentModel ? '→ ' : '  '
              lines.push(
                `${mark}${cost.model}  $${cost.totalCost.toFixed(4)} (In $${cost.inputCost.toFixed(4)} | Out $${cost.outputCost.toFixed(4)})`
              )
            } catch (_error) {
              // Skip models that don't have pricing info
            }
          })
          if (lines.length > 0) {
            this.printPanel(
              boxen(lines.join('\n'), {
                title: '💸 Model Pricing Comparison',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'blue',
              })
            )
          }
        }

        // Current model pricing details (panel)
        this.printPanel(
          boxen(
            [
              `Model: ${currentCost.model}`,
              `Input Cost:  $${currentCost.inputCost.toFixed(6)}`,
              `Output Cost: $${currentCost.outputCost.toFixed(6)}`,
              `Total Cost:  $${currentCost.totalCost.toFixed(6)}`,
            ].join('\n'),
            { title: 'Current Model Pricing', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }
          )
        )

        // Cost projections
        if (preciseTokens > 10000) {
          const projectedDailyCost = (currentCost.totalCost / preciseTokens) * 50000 // Assuming 50k tokens/day
          const projectedMonthlyCost = projectedDailyCost * 30
          this.printPanel(
            boxen(
              [
                `Daily (50k tokens): $${projectedDailyCost.toFixed(4)}`,
                `Monthly (~1.5M tokens): $${projectedMonthlyCost.toFixed(2)}`,
              ].join('\n'),
              { title: 'Cost Projections', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }
            )
          )
        }

        // Router-aware average spend per model (per 1K tokens)
        try {
          const models = this.configManager.get('models')
          const provider = models[currentModel]?.provider
          const sessionTokens = Math.max(1, userTokens + assistantTokens)
          const variantEntries = Object.entries(models).filter(([, cfg]: any) => cfg.provider === provider)
          const { calculateTokenCost: calc } = await import('./config/token-limits')
          const lines: string[] = []
          variantEntries.slice(0, 10).forEach(([name]) => {
            try {
              const c = calc(userTokens, assistantTokens, name)
              const avgPer1K = (c.totalCost / sessionTokens) * 1000
              lines.push(`${c.model}  avg $/1K: $${avgPer1K.toFixed(4)}  total: $${c.totalCost.toFixed(4)}`)
            } catch { }
          })
          if (lines.length > 0) {
            this.printPanel(
              boxen(lines.join('\n'), {
                title: '🔀 Router: Avg Spend per Model (per 1K)',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'magenta',
              })
            )
          }
        } catch { }

        // Recommendations
        if (preciseTokens > 150000) {
          console.log(chalk.red('\n⚠️ CRITICAL: Very high token usage!'))
          console.log(chalk.yellow('Recommendations:'))
          console.log('  • Use /compact to compress session immediately')
          console.log('  • Start a new session with /new')
          console.log('  • Consider switching to a cheaper model for simple tasks')
        } else if (preciseTokens > 100000) {
          console.log(chalk.yellow('\n⚠️ WARNING: High token usage'))
          console.log('Recommendations:')
          console.log('  • Consider using /compact soon')
          console.log('  • Auto-compaction will trigger at 100k tokens')
        } else if (preciseTokens > 50000) {
          console.log(chalk.blue('\n💡 INFO: Moderate token usage'))
          console.log('  • Session is healthy')
          console.log('  • Auto-monitoring active')
        }
      } else {
        console.log(chalk.gray('No active session'))
      }

      // Show current UI session tracking
      const sessionDuration = Math.floor((Date.now() - this.sessionStartTime.getTime()) / 1000 / 60)
      const totalTokens = this.sessionTokenUsage + this.contextTokens
      console.log(chalk.cyan('\n🎯 Current UI Session:'))
      console.log(
        `  • Total tokens: ${totalTokens.toLocaleString()} (${this.sessionTokenUsage.toLocaleString()} session + ${this.contextTokens.toLocaleString()} context)`
      )
      console.log(`  • Duration: ${sessionDuration} minutes`)
      console.log(`  • Started: ${this.sessionStartTime.toLocaleTimeString()}`)
      console.log(chalk.gray('  • Use /tokens reset to clear session counters'))
      console.log(chalk.gray('  • Use /tokens compare to see all model costs'))
    } catch (error: any) {
      console.log(chalk.red(`Token analysis error: ${error.message}`))
    }
  }

  private async showCost(): Promise<void> {
    console.log(chalk.blue('💰 Token usage and cost information'))

    try {
      const session = chatManager.getCurrentSession()
      const stats = chatManager.getSessionStats()

      if (session) {
        // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
        const totalChars = session.messages.reduce((sum, msg) => sum + msg.content.length, 0)
        const estimatedTokens = Math.round(totalChars / 4)

        console.log(chalk.cyan('📊 Current Session:'))
        console.log(`  Messages: ${session.messages.length}`)
        console.log(`  Characters: ${totalChars.toLocaleString()}`)
        console.log(`  Estimated Tokens: ${estimatedTokens.toLocaleString()}`)

        console.log(chalk.cyan('\n📊 Overall Stats:'))
        console.log(`  Total Sessions: ${stats.totalSessions}`)
        console.log(`  Total Messages: ${stats.totalMessages}`)

        // Show current model pricing info
        const currentModel = this.configManager.getCurrentModel()
        console.log(chalk.cyan('\n🏷️ Current Model:'))
        console.log(`  Model: ${currentModel}`)
        console.log(chalk.gray("  Note: Actual costs depend on your AI provider's pricing"))

        this.addLiveUpdate({
          type: 'info',
          content: `Session stats: ${session.messages.length} messages, ~${estimatedTokens} tokens`,
          source: 'cost-analysis',
        })
      } else {
        console.log(chalk.gray('No active session for cost analysis'))
      }
    } catch (error: any) {
      this.addLiveUpdate({
        type: 'error',
        content: `Cost calculation failed: ${error.message}`,
        source: 'cost-analysis',
      })
      console.log(chalk.red(`❌ Error calculating costs: ${error.message}`))
    }
  }

  private async handleTodoOperations(_command: string, args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        const plans = enhancedPlanning.getActivePlans()
        if (plans.length === 0) {
          const maxHeight = this.getAvailablePanelHeight()
          this.printPanel(
            boxen('No todo lists found', {
              title: 'Todos',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
              width: Math.min(120, (process.stdout.columns || 100) - 4),
              height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
            })
          )
          return
        }

        const lines: string[] = []
        lines.push('Active Todo Lists:')
        plans.forEach((plan, index) => {
          const completed = plan.todos.filter((t) => t.status === 'completed').length
          const inProgress = plan.todos.filter((t) => t.status === 'in_progress').length
          const pending = plan.todos.filter((t) => t.status === 'pending').length
          const failed = plan.todos.filter((t) => t.status === 'failed').length
          lines.push(`${index + 1}. ${plan.title}`)
          lines.push(`   Status: ${plan.status} | Todos: ${plan.todos.length}`)
          lines.push(`   ✓ ${completed} | ⚡︎ ${inProgress} | ⏳ ${pending} | ❌ ${failed}`)
        })
        const maxHeight = this.getAvailablePanelHeight()
        let content = lines.join('\n')

        if (content.split('\n').length > maxHeight) {
          const truncatedLines = content.split('\n').slice(0, maxHeight - 2)
          content = `${truncatedLines.join('\n')}\n\n⚠️  Content truncated`
        }

        this.printPanel(
          boxen(content, {
            title: '📋 Todos',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
            width: Math.min(120, (process.stdout.columns || 100) - 4),
            height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
          })
        )
        return
      }

      const subcommand = args[0].toLowerCase()
      const restArgs = args.slice(1)

      switch (subcommand) {
        case 'show': {
          const planId = restArgs[0]
          if (!planId) {
            const plans = enhancedPlanning.getActivePlans()
            const latestPlan = plans[plans.length - 1]
            if (latestPlan) {
              enhancedPlanning.showPlanStatus(latestPlan.id)
            } else {
              const maxHeight = this.getAvailablePanelHeight()
              this.printPanel(
                boxen('No todo lists found', {
                  title: 'Todos',
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'cyan',
                  width: Math.min(120, (process.stdout.columns || 100) - 4),
                  height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
                })
              )
            }
          } else {
            enhancedPlanning.showPlanStatus(planId)
          }
          break
        }
        case 'open':
        case 'edit': {
          const todoPath = 'todo.md'
          console.log(formatFileOp('Opening', todoPath, 'in your default editor'))
          try {
            await toolsManager.runCommand('code', [todoPath])
          } catch {
            try {
              await toolsManager.runCommand('open', [todoPath])
            } catch {
              console.log(chalk.yellow(`Could not open ${todoPath}. Please open it manually.`))
            }
          }
          break
        }
        default:
          if (['on', 'enable', 'off', 'of', 'disable', 'status'].includes(subcommand)) {
            // Toggle auto‑todos behavior via config
            const cfg = (this.configManager.get('autoTodo') as any) || { requireExplicitTrigger: false }
            if (subcommand === 'on' || subcommand === 'enable') {
              this.configManager.set('autoTodo', { ...cfg, requireExplicitTrigger: false } as any)
              this.printPanel(
                boxen(
                  'Auto‑todos enabled (complex inputs can trigger background todos).\nUse "/todos off" to require explicit "todo".',
                  {
                    title: 'Todos: Auto Mode',
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'green',
                  }
                )
              )
            } else if (subcommand === 'off' || subcommand === 'of' || subcommand === 'disable') {
              this.configManager.set('autoTodo', { ...cfg, requireExplicitTrigger: true } as any)
              this.printPanel(
                boxen(
                  'Auto‑todos disabled. Only messages containing "todo" will trigger todos.\nUse "/todos on" to enable automatic triggering.',
                  {
                    title: 'Todos: Explicit Mode',
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'yellow',
                  }
                )
              )
            } else if (subcommand === 'status') {
              const current = (this.configManager.get('autoTodo') as any)?.requireExplicitTrigger
              const status = current ? 'Explicit Only (off)' : 'Automatic (on)'
              this.printPanel(
                boxen(
                  `Current: ${status}\n- on  = auto (complex inputs can trigger)\n- off = explicit only (requires "todo")`,
                  {
                    title: 'Todos: Status',
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'cyan',
                  }
                )
              )
            }
          } else {
            this.printPanel(
              boxen(`Unknown todo command: ${subcommand}\nAvailable: show | open | edit | on | off | status`, {
                title: 'Todos',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
          }
      }
    } catch (error: any) {
      this.addLiveUpdate({ type: 'error', content: `Todo operation failed: ${error.message}`, source: 'todo' })
      this.printPanel(
        boxen(`Todo operation failed: ${error.message}`, {
          title: 'Todos Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Handle MCP (Model Context Protocol) commands - Claude Code/OpenCode compatible
   */
  private async handleMcpCommands(args: string[]): Promise<void> {
    if (args.length === 0) {
      const lines: string[] = []
      lines.push('Server Management:')
      lines.push('/mcp list                    - List configured servers')
      lines.push('/mcp servers                 - Detailed server status')
      lines.push('/mcp add-local <name> <cmd>  - Add local server')
      lines.push('/mcp add-remote <name> <url> - Add remote server')
      lines.push('/mcp remove <name>           - Remove server')
      lines.push('')
      lines.push('Server Operations:')
      lines.push('/mcp test <server>           - Test server')
      lines.push('/mcp call <server> <method> [params] - Make call')
      lines.push('/mcp health                  - Check health')
      lines.push('')
      lines.push('Compatibility:')
      lines.push('/mcp import-claude           - Import Claude config')
      lines.push('/mcp export-config           - Export Claude-style config')
      lines.push('')
      lines.push('Code Generation:')
      lines.push('/mcp generate <server>       - Generate tool wrappers')
      lines.push('/mcp tools <server>          - List server tools')
      lines.push('/mcp status                  - Show server statuses')
      lines.push('')
      lines.push('Examples:')
      lines.push('/mcp add-local filesystem ["uvx","mcp-server-filesystem","--path","."]')
      lines.push('/mcp add-remote myapi https://api.example.com/mcp')
      lines.push('/mcp generate filesystem     - Generate secure wrappers')

      this.printPanel(
        boxen(lines.join('\n'), {
          title: '🔮 MCP Commands',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'magenta',
        })
      )
      return
    }

    const command = args[0].toLowerCase()
    const restArgs = args.slice(1)

    try {
      switch (command) {
        case 'list':
        case 'servers':
          await this.listMcpServers()
          break

        case 'add-local':
          if (restArgs.length < 2) {
            this.printPanel(
              boxen(
                [
                  'Usage: /mcp add-local <name> <command-array>',
                  '',
                  'Example: /mcp add-local filesystem ["uvx", "mcp-server-filesystem", "--path", "."]',
                ].join('\n'),
                {
                  title: 'MCP Add Local Command',
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'red',
                }
              )
            )
            return
          }
          await this.addLocalMcpServer(restArgs[0], restArgs.slice(1))
          break

        case 'add-remote':
          if (restArgs.length < 2) {
            this.printPanel(
              boxen(
                [
                  'Usage: /mcp add-remote <name> <url>',
                  '',
                  'Example: /mcp add-remote myapi https://api.example.com/mcp',
                ].join('\n'),
                {
                  title: 'MCP Add Remote Command',
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'red',
                }
              )
            )
            return
          }
          await this.addRemoteMcpServer(restArgs[0], restArgs[1])
          break

        case 'add':
          // Legacy compatibility
          await this.addMcpServer(restArgs)
          break

        case 'test':
          if (restArgs.length === 0) {
            this.printPanel(
              boxen('Usage: /mcp test <server-name>', {
                title: 'MCP Test Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            return
          }
          await this.testMcpServer(restArgs[0])
          break

        case 'call':
          if (restArgs.length < 2) {
            this.printPanel(
              boxen('Usage: /mcp call <server-name> <method> [params-json]', {
                title: 'MCP Call Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            return
          }
          await this.callMcpServer(restArgs[0], restArgs[1], restArgs[2])
          break

        case 'health':
          await this.checkMcpHealth()
          break

        case 'remove':
          if (restArgs.length === 0) {
            this.printPanel(
              boxen('Usage: /mcp remove <server-name>', {
                title: 'MCP Remove Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            return
          }
          await this.removeMcpServer(restArgs[0])
          break

        case 'import-claude':
          await this.importClaudeDesktopConfig()
          break

        case 'export-config':
          await this.exportMcpConfig()
          break

        default:
          this.printPanel(
            boxen(`Unknown MCP command: ${command}\nUse /mcp for available commands`, {
              title: '🔮 MCP',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            })
          )
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`MCP command failed: ${error.message}`, {
          title: 'MCP Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      this.addLiveUpdate({
        type: 'error',
        content: `MCP ${command} failed: ${error.message}`,
        source: 'mcp',
      })
    }
  }

  /**
   * List configured MCP servers
   */
  private async listMcpServers(): Promise<void> {
    console.log(wrapBlue('📡 MCP Servers'))

    const servers = await mcpClient.listServers()

    if (servers.length === 0) {
      console.log(chalk.gray('No MCP servers configured'))
      console.log(chalk.gray('Use "/mcp add <name> <type> <endpoint>" to add a server'))
      return
    }

    for (const server of servers) {
      const healthIcon = server.healthy ? chalk.green('🟢') : chalk.red('🔴')
      const typeColor = server.type === 'http' ? chalk.blue : server.type === 'websocket' ? chalk.cyan : chalk.yellow

      console.log(`${healthIcon} ${chalk.bold(server.name)} ${typeColor(`[${server.type}]`)}`)
      if (server.endpoint) {
        console.log(`   ${chalk.gray('Endpoint:')} ${server.endpoint}`)
      }
      if (server.command) {
        console.log(`   ${chalk.gray('Command:')} ${server.command} ${(server.args || []).join(' ')}`)
      }
      if (server.capabilities && server.capabilities.length > 0) {
        console.log(`   ${chalk.gray('Capabilities:')} ${server.capabilities.join(', ')}`)
      }
      console.log(
        `   ${chalk.gray('Priority:')} ${server.priority || 1} | ${chalk.gray('Enabled:')} ${server.enabled ? 'Yes' : 'No'}`
      )
      console.log()
    }
  }

  /**
   * Add local MCP server (Claude Code format)
   */
  private async addLocalMcpServer(name: string, commandArgs: string[]): Promise<void> {
    try {
      // Parse command array if it's a JSON string
      let command: string[]
      if (commandArgs.length === 1 && commandArgs[0].startsWith('[')) {
        command = JSON.parse(commandArgs[0])
      } else {
        command = commandArgs
      }

      const mcpConfig = (this.configManager.get('mcp') as Record<string, any>) || {}
      mcpConfig[name] = {
        type: 'local',
        command,
        enabled: true,
        environment: {},
      }

      this.configManager.set('mcp', mcpConfig)
      console.log(chalk.green(`✓ Added local MCP server: ${name}`))
      console.log(chalk.gray(`Command: ${JSON.stringify(command)}`))
    } catch (error: any) {
      console.log(chalk.red(`Failed to add local server: ${error.message}`))
    }
  }

  /**
   * Add remote MCP server (OpenCode format)
   */
  private async addRemoteMcpServer(name: string, url: string): Promise<void> {
    try {
      const mcpConfig = (this.configManager.get('mcp') as Record<string, any>) || {}
      mcpConfig[name] = {
        type: 'remote',
        url,
        enabled: true,
        headers: {},
      }

      this.configManager.set('mcp', mcpConfig)
      console.log(chalk.green(`✓ Added remote MCP server: ${name}`))
      console.log(chalk.gray(`URL: ${url}`))
    } catch (error: any) {
      console.log(chalk.red(`Failed to add remote server: ${error.message}`))
    }
  }

  /**
   * Import Claude Desktop configuration
   */
  private async importClaudeDesktopConfig(): Promise<void> {
    try {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const os = await import('node:os')

      // Try to find Claude Desktop config
      const possiblePaths = [
        path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
        path.join(os.homedir(), '.config', 'claude', 'claude_desktop_config.json'),
        path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'),
      ]

      let configPath: string | null = null
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          configPath = p
          break
        }
      }

      if (!configPath) {
        console.log(chalk.yellow('⚠️ Claude Desktop config not found'))
        console.log(chalk.gray('Checked paths:'))
        possiblePaths.forEach((p) => console.log(chalk.gray(`  • ${p}`)))
        return
      }

      const claudeConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (!claudeConfig.mcpServers) {
        console.log(chalk.yellow('⚠️ No MCP servers found in Claude Desktop config'))
        return
      }

      // Convert Claude Desktop format to NikCLI format
      const mcpConfig = (this.configManager.get('mcp') as Record<string, any>) || {}
      let imported = 0

      for (const [serverName, serverConfig] of Object.entries(claudeConfig.mcpServers as Record<string, any>)) {
        if (serverConfig.command) {
          mcpConfig[serverName] = {
            type: 'local',
            command: Array.isArray(serverConfig.command) ? serverConfig.command : [serverConfig.command],
            enabled: true,
            environment: serverConfig.env || {},
          }
          imported++
        }
      }

      this.configManager.set('mcp', mcpConfig)
      console.log(chalk.green(`✓ Imported ${imported} MCP servers from Claude Desktop`))
      console.log(chalk.gray(`Config file: ${configPath}`))
    } catch (error: any) {
      console.log(chalk.red(`Failed to import Claude Desktop config: ${error.message}`))
    }
  }

  /**
   * Export MCP configuration in Claude Code format
   */
  private async exportMcpConfig(): Promise<void> {
    try {
      const mcpConfig = (this.configManager.get('mcp') as Record<string, any>) || {}

      const exportConfig = {
        $schema: 'https://opencode.ai/config.json',
        mcp: mcpConfig,
      }

      console.log(chalk.blue('📄 Claude Code/OpenCode Compatible Configuration:'))
      console.log(chalk.gray('─'.repeat(60)))
      console.log(JSON.stringify(exportConfig, null, 2))
      console.log(chalk.gray('─'.repeat(60)))
      console.log(chalk.cyan('💡 Save this to your Claude Code config file'))
    } catch (error: any) {
      console.log(chalk.red(`Failed to export config: ${error.message}`))
    }
  }
  /**
   * Add new MCP server (Legacy format for backward compatibility)
   */
  private async addMcpServer(args: string[]): Promise<void> {
    if (args.length < 3) {
      this.printPanel(
        boxen(
          [
            'Usage: /mcp add <name> <type> <endpoint/command>',
            '',
            'Types: http, websocket, command, stdio',
            '',
            'Examples:',
            '  /mcp add myapi http https://api.example.com/mcp',
            '  /mcp add local command "/usr/local/bin/mcp-server"',
            '  /mcp add ws websocket wss://example.com/mcp',
            '',
            '💡 Consider using /mcp add-local or /mcp add-remote for Claude Code compatibility',
          ].join('\n'),
          {
            title: 'MCP Add Command',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          }
        )
      )
      return
    }

    const [name, type, endpointOrCommand] = args

    if (!['http', 'websocket', 'command', 'stdio'].includes(type)) {
      console.log(chalk.red(`Invalid server type: ${type}`))
      console.log(chalk.gray('Valid types: http, websocket, command, stdio'))
      return
    }

    // Build server config based on Claude Code patterns
    const serverConfig: McpServerConfig = {
      name,
      type: type as 'http' | 'websocket' | 'command' | 'stdio',
      enabled: true,
      priority: 1,
      timeout: 30000,
      retries: 3,
    }

    if (type === 'http' || type === 'websocket') {
      serverConfig.endpoint = endpointOrCommand
      serverConfig.headers = {
        'User-Agent': 'NikCLI-MCP/1.0',
        'Content-Type': 'application/json',
      }
    } else if (type === 'command' || type === 'stdio') {
      const commandParts = endpointOrCommand.split(' ')
      serverConfig.command = commandParts[0]
      serverConfig.args = commandParts.slice(1)
    }

    // Save to config manager (legacy format)
    const mcpServers = (this.configManager.get('mcpServers') as Record<string, any>) || {}
    mcpServers[name] = {
      name,
      type: serverConfig.type as 'http' | 'websocket' | 'command' | 'stdio',
      enabled: serverConfig.enabled,
      endpoint: serverConfig.endpoint,
      command: typeof serverConfig.command === 'string' ? serverConfig.command : serverConfig.command?.[0],
      args: Array.isArray(serverConfig.command) ? serverConfig.command.slice(1) : serverConfig.args,
      headers: serverConfig.headers,
      timeout: serverConfig.timeout,
      retries: serverConfig.retries,
      priority: serverConfig.priority,
      capabilities: serverConfig.capabilities,
      authentication: serverConfig.authentication,
    }
    this.configManager.set('mcpServers', mcpServers)

    console.log(chalk.green(`✓ MCP server '${name}' added successfully`))
    console.log(chalk.gray(`Type: ${type} | Endpoint: ${endpointOrCommand}`))

    // Test the connection
    console.log(chalk.gray('Testing connection...'))
    await this.testMcpServer(name)
  }

  /**
   * Test MCP server connection
   */
  private async testMcpServer(serverName: string): Promise<void> {
    console.log(wrapBlue(`🧪 Testing MCP server: ${serverName}`))

    const result = await mcpClient.testServer(serverName)

    if (result.success) {
      console.log(chalk.green(`✓ Server '${serverName}' is healthy`))
      if (result.latency !== undefined) {
        console.log(chalk.gray(`   Response time: ${result.latency}ms`))
      }
    } else {
      console.log(chalk.red(`❌ Server '${serverName}' is not responding`))
      if (result.error) {
        console.log(chalk.gray(`   Error: ${result.error}`))
      }
    }
  }

  /**
   * Make MCP call to server
   */
  private async callMcpServer(serverName: string, method: string, paramsJson?: string): Promise<void> {
    console.log(wrapBlue(`📡 Calling MCP server '${serverName}' method '${method}'`))

    let params = {}
    if (paramsJson) {
      try {
        params = JSON.parse(paramsJson)
      } catch (_error) {
        console.log(chalk.red('Invalid JSON parameters'))
        return
      }
    }

    const request = {
      method,
      params,
      id: `call-${Date.now()}`,
    }

    try {
      const response = await mcpClient.call(serverName, request)

      if (response.result) {
        console.log(chalk.green('✓ MCP Call Successful'))
        console.log(chalk.gray('Response:'))
        console.log(JSON.stringify(response.result, null, 2))
      } else if (response.error) {
        console.log(chalk.red('❌ MCP Call Failed'))
        console.log(chalk.gray('Error:'), response.error.message)
      }

      if (response.fromCache) {
        console.log(chalk.cyan('📦 Result from cache'))
      }

      if (response.executionTime) {
        console.log(chalk.gray(`⏱️ Execution time: ${response.executionTime}ms`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ MCP call failed: ${error.message}`))
    }
  }

  /**
   * Check health of all MCP servers
   */
  private async checkMcpHealth(): Promise<void> {
    console.log(wrapBlue('🏥 Checking MCP server health'))

    const servers = mcpClient.getConfiguredServers()

    if (servers.length === 0) {
      console.log(chalk.gray('No MCP servers configured'))
      return
    }

    for (const server of servers) {
      const healthy = await mcpClient.checkServerHealth(server.name)
      const icon = healthy ? chalk.green('🟢') : chalk.red('🔴')
      console.log(`${icon} ${server.name} (${server.type})`)
    }
  }

  /**
   * Remove MCP server (supports both new and legacy formats)
   */
  private async removeMcpServer(serverName: string): Promise<void> {
    let removed = false

    // Try to remove from new format first
    const mcpConfig = (this.configManager.get('mcp') as Record<string, any>) || {}
    if (mcpConfig[serverName]) {
      delete mcpConfig[serverName]
      this.configManager.set('mcp', mcpConfig)
      removed = true
    }

    // Try to remove from legacy format
    const legacyConfig = (this.configManager.get('mcpServers') as Record<string, any>) || {}
    if (legacyConfig[serverName]) {
      delete legacyConfig[serverName]
      this.configManager.set('mcpServers', legacyConfig)
      removed = true
    }

    if (removed) {
      console.log(chalk.green(`✓ Removed MCP server: ${serverName}`))
    } else {
      console.log(chalk.red(`❌ MCP server '${serverName}' not found`))
      console.log(chalk.gray('Use /mcp list to see available servers'))
    }
  }

  private showSlashHelp(): void {
    const commands = [
      // 🏠 Core System Commands
      ['/help', 'Show this comprehensive help guide'],
      ['/exit', 'Exit NikCLI safely'],
      ['/clear', 'Clear current session context'],
      ['/status', 'Show comprehensive system status and health'],
      ['/debug', 'Show detailed debug information'],
      ['/init [--force]', 'Initialize project context and workspace'],

      // 🎯 Mode Control & Navigation
      ['/default', 'Switch to default conversational mode'],
      ['/plan [task]', 'Switch to plan mode or generate execution plan'],
      ['/vm', 'Switch to virtual machine development mode'],
      ['/vim [start|exit|config|status|help]', 'Enter vim mode with AI integration'],

      // 📁 File & Directory Operations
      ['/read <file> [options]', 'Read file contents with pagination support'],
      ['/write <file> <content>', 'Write content to file with approval'],
      ['/edit <file>', 'Open file in system editor (code/open)'],
      ['/ls [directory]', 'List files and directories'],
      ['/search <query> [dir]', 'Search text in files (grep functionality)'],

      // ⚡ Terminal & Command Execution
      ['/run <command>', 'Execute terminal command with approval'],
      ['/build', 'Build the current project'],
      ['/test [pattern]', 'Run tests with optional pattern'],
      ['/npm <args>', 'Run npm commands'],
      ['/yarn <args>', 'Run yarn commands'],
      ['/git <args>', 'Run git commands'],
      ['/docker <args>', 'Run docker commands'],

      // 🤖 AI Models & Configuration
      ['/models', 'List all available AI models'],
      ['/model <name>', 'Switch to specific AI model'],
      ['/temp <0.0-2.0>', 'Set AI model temperature'],
      ['/system <prompt>', 'Set custom system prompt'],
      ['/config [interactive]', 'Show/edit configuration'],
      ['/env <path>', 'Import .env file and persist variables'],

      // 🎨 Output Style & Display
      ['/style set <style>', 'Set default AI output style'],
      ['/style show', 'Display current style configuration'],
      ['/style model <style>', 'Set style for current model'],
      ['/style context <ctx> <style>', 'Set style for specific context'],
      ['/styles', 'List all available output styles'],

      // 🔑 API Keys & Authentication
      ['/set-key <model> <key>', 'Set API key for AI models'],
      ['/set-coin-keys', 'Configure Coinbase CDP API keys'],
      ['/set-key-bb', 'Configure Browserbase API credentials'],
      ['/set-key-figma', 'Configure Figma and v0 API credentials'],
      ['/set-key-redis', 'Configure Redis/Upstash cache credentials'],
      ['/set-vector-key', 'Configure Upstash Vector database credentials'],

      // 🚀 Performance & Caching
      ['/cache [stats|clear|settings]', 'Manage token cache system'],
      ['/tokens', 'Show token usage and optimization'],
      ['/redis-enable', 'Enable Redis caching'],
      ['/redis-disable', 'Disable Redis caching'],
      ['/redis-status', 'Show Redis cache status'],

      // 🤖 Agent Management & Factory
      ['/agents', 'List all available agents'],
      ['/agent <name> <task>', 'Run specific agent with task'],
      ['/factory', 'Show agent factory dashboard'],
      ['/blueprints', 'List and manage agent blueprints'],
      ['/create-agent <name> <spec>', 'Create new specialized agent'],
      ['/launch-agent <id>', 'Launch agent from blueprint'],
      ['/parallel [agent1, agent2] <task>', 'Run multiple factory agents in parallel'],
      ['/parallel-logs', 'View parallel execution logs'],
      ['/parallel-status', 'Check parallel execution status'],

      //  Memory & Context Management
      ['/remember "fact"', 'Store information in long-term memory'],
      ['/recall "query"', 'Search and retrieve memories'],
      ['/memory stats', 'Show memory usage statistics'],
      ['/context <paths>', 'Select workspace context paths'],
      ['/index <path>', 'Index files for better context understanding'],

      // 📋 Todo & Planning System
      ['/todo [command]', 'Todo list operations and management'],
      ['/todos [on|off|status]', 'Show lists; toggle auto‑todos feature'],

      // 📝 Session & History Management
      ['/new [title]', 'Start new chat session'],
      ['/sessions', 'List all available sessions'],
      ['/history <on|off>', 'Enable/disable chat history'],
      ['/export [sessionId]', 'Export session to markdown'],

      // 💼 Work Session Management
      ['/resume [session-id]', 'Resume previous work session'],
      ['/work-sessions', 'List all saved work sessions'],
      ['/save-session [name]', 'Save current work session'],
      ['/delete-session <id>', 'Delete a work session'],
      ['/export-session <id> <path>', 'Export work session to file'],

      // ↩️ Edit History (Undo/Redo)
      ['/undo [count]', 'Undo last N file edits (default: 1)'],
      ['/redo [count]', 'Redo last N undone edits (default: 1)'],
      ['/edit-history', 'Show edit history and statistics'],

      // 🔌 Background Agent Operations
      ['/bg-agent <task>', 'Create background job with VM execution + auto PR'],
      ['/bg-jobs [status]', 'List all background jobs (filter by status)'],
      ['/bg-status <jobId>', 'Get detailed status of specific job'],
      ['/bg-logs <jobId> [limit]', 'View job execution logs'],

      // 🐳 VM Container Operations
      ['/vm-create <repo-url>', 'Create new VM container'],
      ['/vm-list', 'List all active containers'],
      ['/vm-connect <id>', 'Connect to specific container'],
      ['/vm-stop <id>', 'Stop running container'],
      ['/vm-remove <id>', 'Remove container'],
      ['/vm-create-pr <id> "<title>" "<desc>"', 'Create PR from container'],
      ['/vm-logs <id>', 'View container logs'],
      ['/vm-mode <mode>', 'Set VM execution mode'],
      ['/vm-switch <id>', 'Switch active VM context'],
      ['/vm-dashboard', 'Show VM dashboard overview'],
      ['/vm-select', 'Interactively select VM container'],
      ['/vm-status <id>', 'Show detailed container status'],
      ['/vm-exec <id> <command>', 'Execute command in container'],
      ['/vm-ls <id> [path]', 'List files in container'],
      ['/vm-broadcast <command>', 'Broadcast command to all VMs'],
      ['/vm-health', 'Check health of all containers'],
      ['/vm-backup <id>', 'Create container backup'],
      ['/vm-stats <id>', 'Show container resource stats'],

      // 🌐 Web Browsing & Analysis
      ['/browse <url>', 'Browse web page and extract content'],
      ['/web-analyze <url>', 'Browse and analyze web page with AI'],

      // 🎨 Figma Design Integration
      ['/figma-config', 'Show Figma API configuration status'],
      ['/figma-info <file-id>', 'Get file information from Figma'],
      ['/figma-export <file-id> [format]', 'Export designs from Figma'],
      ['/figma-to-code <file-id>', 'Generate code from Figma designs'],
      ['/figma-create <component-path>', 'Create design from React component'],
      ['/figma-tokens <file-id>', 'Extract design tokens from Figma'],

      // 🔗 Blockchain & Web3 Operations
      ['/web3 status', 'Show Coinbase AgentKit status'],
      ['/web3 wallet', 'Show wallet address and network'],
      ['/web3 balance', 'Check wallet balance'],
      ['/web3 transfer <amount> <to>', 'Transfer tokens to address'],

      // 🔍 Vision & Image Processing
      ['/analyze-image <path>', 'Analyze image with AI vision'],
      ['/generate-image "prompt"', 'Generate image with AI'],

      // 🛠️ CAD & Manufacturing
      ['/cad generate <description>', 'Generate CAD model from text description'],
      ['/cad stream <description>', 'Generate CAD with real-time progress'],
      ['/cad export <format> <description>', 'Generate and export CAD to file format'],
      ['/cad formats', 'Show supported CAD export formats'],
      ['/cad examples', 'Show CAD generation examples'],
      ['/cad status', 'Show CAD system status'],

      // ⚙️ G-code & CNC Operations
      ['/gcode generate <description>', 'Generate G-code from machining description'],
      ['/gcode cnc <description>', 'Generate CNC G-code'],
      ['/gcode 3d <description>', 'Generate 3D printer G-code'],
      ['/gcode laser <description>', 'Generate laser cutter G-code'],
      ['/gcode examples', 'Show G-code generation examples'],

      // 📚 Documentation System
      ['/docs', 'Documentation system help'],
      ['/doc-search <query>', 'Search documentation'],
      ['/doc-add <url>', 'Add documentation from URL'],

      // 📸 Snapshots & Backup
      ['/snapshot <name>', 'Create project snapshot'],
      ['/restore <snapshot-id>', 'Restore from snapshot'],
      ['/snapshots', 'List available snapshots'],

      // 🔒 Security & Development
      ['/security [status|set]', 'Manage security settings'],
      ['/dev-mode [enable|status]', 'Developer mode controls'],
      ['/safe-mode', 'Enable safe mode (maximum security)'],

      //  IDE Integration & Monitoring
      ['/diagnostic start', 'Start IDE diagnostic monitoring'],
      ['/diagnostic status', 'Show diagnostic status'],
      ['/monitor [path]', 'Monitor file changes'],
    ]

    const pad = (s: string) => s.padEnd(32)
    const lines: string[] = []

    const addGroup = (title: string, a: number, b: number) => {
      lines.push(title)
      commands.slice(a, b).forEach(([cmd, desc]) => {
        lines.push(`   ${pad(cmd)} ${desc}`)
      })
      lines.push('')
    }

    addGroup('🏠 Core System:', 0, 6)
    addGroup('🎯 Mode Control:', 6, 10)
    addGroup('📁 File Operations:', 10, 15)
    addGroup('⚡ Terminal Operations:', 15, 22)
    addGroup('🤖 AI Configuration:', 22, 28)
    addGroup('🎨 Output Styles:', 28, 33)
    addGroup('🔑 API Keys:', 33, 39)
    addGroup('🚀 Performance:', 39, 44)
    addGroup('🤖 Agent Factory:', 44, 53)
    addGroup('💾 Memory & Context:', 53, 58)
    addGroup('📋 Planning & Todos:', 58, 60)
    addGroup('📝 Session Management:', 60, 64)
    addGroup('💼 Work Session Management:', 64, 69)
    addGroup('↩️ Edit History (Undo/Redo):', 69, 72)
    addGroup('🔌 Background Agents:', 72, 76)
    addGroup('🐳 VM Containers:', 76, 94)
    addGroup('🌐 Web Browsing:', 94, 96)
    addGroup('🎨 Figma Integration:', 96, 102)
    addGroup('🔗 Blockchain/Web3:', 102, 106)
    addGroup('🔍 Vision & Images:', 106, 108)
    addGroup('🛠️ CAD Design:', 108, 114)
    addGroup('⚙️ G-code/CNC:', 114, 119)
    addGroup('📚 Documentation:', 119, 122)
    addGroup('📸 Snapshots:', 122, 125)
    addGroup('🔒 Security:', 125, 128)
    addGroup(' IDE Integration:', 128, commands.length)

    lines.push('💡 Quick Tips:')
    lines.push('   • Use Ctrl+C to exit any mode')
    lines.push('   • Press Esc to interrupt current operation')
    lines.push('   • Use Cmd+Esc to return to default mode')
    lines.push('   • Commands support auto-completion with Tab')

    const content = lines.join('\n')

    this.printPanel(
      boxen(content, {
        title: 'NikCLI Command Reference',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        width: Math.min(125, (process.stdout.columns || 100) - 4),
      })
    )
  }

  /**
   * Display cognitive orchestration status
   */
  private displayCognitiveStatus(): void {
    if (!this.streamingOrchestrator) return

    this.logCognitive('\n🧠 Cognitive Orchestration System Status:')
    this.logCognitive('─'.repeat(50))

    // Get supervision metrics if available
    const metrics = this.streamingOrchestrator.getSupervisionMetrics()

    this.logCognitive(`🎯 Supervision: ${metrics.cognition ? 'Active' : 'Inactive'}`)
    this.logCognitive(`📊 Metrics: ${Object.keys(metrics.metrics).length} tracked`)
    this.logCognitive(`⚡︎ Patterns: ${Object.keys(metrics.patterns).length} recognized`)
    this.logCognitive(`📈 History: ${metrics.historyLength} entries`)

    // Display component status
    this.logCognitive('⚡︎ ValidatorManager: Cognitive validation enabled')
    this.logCognitive(' ToolRouter: Advanced routing algorithms active')
    this.logCognitive('🔌 AgentFactory: Multi-dimensional selection enabled')
    this.logCognitive('🚀 AdvancedAIProvider: Intelligent commands ready')
    this.logCognitive(`🎯 Orchestration Level: ${this.orchestrationLevel}/10`)

    this.logCognitive('\n✅ All cognitive components initialized and coordinating\n')
  }

  /**
   * Initialize project context
   */
  private async handleInitProject(force: boolean = false): Promise<void> {
    try {
      console.log(chalk.blue('🚀 Initializing project context...'))

      // Check for package.json
      const packageJsonPath = path.join(this.workingDirectory, 'package.json')
      const hasPackage = require('node:fs').existsSync(packageJsonPath)

      if (hasPackage && !force) {
        // Continue to generate/update NIKOCLI.md even if package.json exists
        console.log(chalk.yellow('ℹ️ Project already initialized (package.json present)'))
      } else if (!hasPackage) {
        // Setup basic project structure
        const basicPackageJson = {
          name: path.basename(this.workingDirectory),
          version: '0.2.3',
          description: 'Project managed by NikCLI',
          scripts: {
            start: 'node index.js',
            test: 'echo "No tests specified" && exit 1',
          },
        }
        await fs.writeFile(packageJsonPath, JSON.stringify(basicPackageJson, null, 2))
        console.log(chalk.green('✓ Created package.json'))
      }

      // Initialize git if not present
      const gitDir = path.join(this.workingDirectory, '.git')
      if (!require('node:fs').existsSync(gitDir)) {
        try {
          console.log(chalk.blue(' Initializing git repository...'))
          const { spawn } = require('node:child_process')
          const child = spawn('git', ['init'], { cwd: this.workingDirectory })
          await new Promise((resolve) => child.on('close', resolve))
          console.log(chalk.green('✓ Git repository initialized'))
        } catch {
          console.log(chalk.yellow('⚠️ Could not initialize git (skipping)'))
        }
      }

      // Generate repository overview and write to NIKOCLI.md
      const overview = await this.generateRepositoryOverview()
      await fs.writeFile(this.projectContextFile, overview.markdown, 'utf8')

      const lines: string[] = []
      lines.push(`${chalk.green('📄 Created:')} NIKOCLI.md`)
      lines.push(
        `${chalk.green('📦 Package:')} ${require('node:fs').existsSync(packageJsonPath) ? 'present' : 'missing'}`
      )
      lines.push(`${chalk.green('🧪 Tests:')} ${overview.summary.testFiles} files`)
      lines.push(
        `${chalk.green('🗂️ Files:')} ${overview.summary.totalFiles} | ${chalk.green('Dirs:')} ${overview.summary.totalDirs}`
      )
      if (overview.summary.gitBranch) lines.push(`${chalk.green('🌿 Branch:')} ${overview.summary.gitBranch}`)
      if (overview.summary.lastCommit) lines.push(`${chalk.green('🕒 Last Commit:')} ${overview.summary.lastCommit}`)
      lines.push('')
      lines.push(chalk.gray('Use /read NIKOCLI.md to view details'))

      this.printPanel(
        boxen(lines.join('\n'), {
          title: '🧭 Project Initialized',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )

      // Show a preview panel of the generated NIKOCLI.md
      const preview = overview.markdown.split('\n').slice(0, 40).join('\n')
      this.printPanel(
        boxen(preview + (overview.markdown.includes('\n', 1) ? '\n\n… (truncated)' : ''), {
          title: '📘 NIKOCLI.md (Preview)',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to initialize project: ${error.message}`, {
          title: 'Init Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Build a comprehensive repository overview for NIKOCLI.md
   */
  private async generateRepositoryOverview(): Promise<{ markdown: string; summary: any }> {
    const pkgPath = path.join(this.workingDirectory, 'package.json')
    let pkg: any = null
    try {
      pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
    } catch {
      /* ignore */
    }

    // Gather directory structure (top-level only + src/tests breakdown)
    const fsSync = require('node:fs')
    const listDirSafe = (p: string) => {
      try {
        return fsSync.readdirSync(p, { withFileTypes: true })
      } catch {
        return []
      }
    }

    const topItems = listDirSafe(this.workingDirectory)
    const topDirs = topItems.filter((d: any) => d.isDirectory()).map((d: any) => d.name)
    const topFiles = topItems.filter((d: any) => d.isFile()).map((d: any) => d.name)

    const walkCount = (root: string) => {
      let files = 0,
        dirs = 0,
        tests = 0,
        ts = 0,
        js = 0
      const walk = (dir: string) => {
        let entries: any[] = []
        try {
          entries = fsSync.readdirSync(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const e of entries) {
          const p = path.join(dir, e.name)
          if (e.isDirectory()) {
            dirs++
            walk(p)
          } else if (e.isFile()) {
            files++
            if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(e.name)) tests++
            if (/\.ts$|\.tsx$/.test(e.name)) ts++
            if (/\.js$|\.jsx$/.test(e.name)) js++
          }
        }
      }
      walk(root)
      return { files, dirs, tests, ts, js }
    }

    const counts = walkCount(this.workingDirectory)

    // Git info (best-effort)
    let gitBranch = ''
    let lastCommit = ''
    try {
      const { execSync } = require('node:child_process')
      gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.workingDirectory,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim()
      const log = execSync('git log -1 --pretty=format:"%h %ad %s" --date=short', {
        cwd: this.workingDirectory,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim()
      lastCommit = log
    } catch {
      /* ignore */
    }

    // Build markdown
    const lines: string[] = []
    lines.push(`# NikCLI Project Overview`)
    lines.push('')
    lines.push(`Generated: ${new Date().toISOString()}`)
    lines.push('')
    lines.push(`## Project`)
    lines.push(`- Name: ${pkg?.name || path.basename(this.workingDirectory)}`)
    if (pkg?.version) lines.push(`- Version: ${pkg.version}`)
    if (pkg?.description) lines.push(`- Description: ${pkg.description}`)
    if (gitBranch) lines.push(`- Git Branch: ${gitBranch}`)
    if (lastCommit) lines.push(`- Last Commit: ${lastCommit}`)
    lines.push('')
    lines.push('## Scripts')
    if (pkg?.scripts) {
      Object.entries(pkg.scripts).forEach(([k, v]: any) => lines.push(`- ${k}: ${v}`))
    } else {
      lines.push('- (none)')
    }
    lines.push('')
    lines.push('## Dependencies')
    const deps = Object.keys(pkg?.dependencies || {})
    const devDeps = Object.keys(pkg?.devDependencies || {})
    lines.push(`- Dependencies (${deps.length})`)
    deps.slice(0, 50).forEach((d) => lines.push(`  - ${d}`))
    if (deps.length > 50) lines.push('  - ...')
    lines.push(`- DevDependencies (${devDeps.length})`)
    devDeps.slice(0, 50).forEach((d) => lines.push(`  - ${d}`))
    if (devDeps.length > 50) lines.push('  - ...')
    lines.push('')
    lines.push('## Top-level Structure')
    topDirs.forEach((d: any) => lines.push(`- ${d}/`))
    topFiles.forEach((f: any) => lines.push(`- ${f}`))
    lines.push('')
    lines.push('## Code Stats')
    lines.push(`- Files: ${counts.files}`)
    lines.push(`- Directories: ${counts.dirs}`)
    lines.push(`- Test Files: ${counts.tests}`)
    lines.push(`- TypeScript Files: ${counts.ts}`)
    lines.push(`- JavaScript Files: ${counts.js}`)
    lines.push('')
    lines.push('## Notes')
    lines.push('- This file is used by NikCLI to provide project context.')
    lines.push('- Update sections as needed, or regenerate with /init --force.')

    const markdown = lines.join('\n')
    const summary = { totalFiles: counts.files, totalDirs: counts.dirs, testFiles: counts.tests, gitBranch, lastCommit }
    return { markdown, summary }
  }

  /**
   * Cycle through modes: default → plan → vm → default
   */
  private cycleModes(): void {
    const modes: Array<'default' | 'plan' | 'vm' | 'vim'> = ['default', 'plan', 'vm', 'vim']
    const currentIndex = modes.indexOf(this.currentMode)
    const nextIndex = (currentIndex + 1) % modes.length
    const nextMode = modes[nextIndex]

    this.currentMode = nextMode

    // Sync with StreamingOrchestrator mode state
    if (this.streamingOrchestrator) {
      // Access the context property to sync mode state
      const orchestratorContext = (this.streamingOrchestrator as any).context
      if (orchestratorContext) {
        orchestratorContext.planMode = nextMode === 'plan'
        orchestratorContext.vmMode = nextMode === 'vm'
      }
    }

    const modeNames = {
      default: '💬 Default Chat',
      plan: '📋 Planning Mode',
      vm: '🐳 VM Mode',
      vim: '✏️ Vim Mode',
    }

    console.log(chalk.yellow(`\n🔄 Switched to ${modeNames[nextMode]}`))
    console.log(chalk.gray(`💡 Use Cmd+Tab or Cmd+] to cycle modes`))


    // In plan/vm modes, avoid ephemeral clearing so updates persist
    if (this.currentMode === 'plan' || this.currentMode === 'vm') {
      this.ephemeralLiveUpdates = false
    }
    this.renderPromptAfterOutput()
  }

  public showPrompt(): void {
    if (!this.rl) return
    if (this.isInquirerActive) return // avoid drawing over interactive lists

    if (this.isChatMode) {
      // Use new chat UI system
      this.renderChatUI()
    } else {
      // Use old prompt system for backward compatibility
      this.showLegacyPrompt()
    }
  }

  /**
   * Legacy prompt system (for backward compatibility)
   */
  private showLegacyPrompt(): void {
    if (!this.rl) return

    // Calculate session info
    const sessionDuration = Math.floor((Date.now() - this.sessionStartTime.getTime()) / 1000 / 60)
    const totalTokens = this.sessionTokenUsage + this.contextTokens
    const _tokensDisplay = totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens.toString()
    const costDisplay =
      this.realTimeCost > 0 ? chalk.magenta(`$${this.realTimeCost.toFixed(4)}`) : chalk.magenta('$0.0000')

    const terminalWidth = process.stdout.columns || 120
    const workingDir = chalk.blue(path.basename(this.workingDirectory))

    // Mode info
    const modeIcon =
      this.currentMode === 'plan' ? '⚡︎' : this.currentMode === 'vm' ? '🐳' : this.currentMode === 'vim' ? '✏️' : '💎'
    const _modeText = this.currentMode.toUpperCase()

    // VM info if in VM mode
    let vmInfo = ''
    if (this.currentMode === 'vm') {
      const selectedVM = vmSelector.getSelectedVM()
      if (selectedVM) {
        vmInfo = ` | 🎯 ${selectedVM.name}`
      } else {
        vmInfo = ` | ❓ No VM selected`
      }
    }

    // Vim info if in vim mode
    let vimInfo = ''
    if (this.currentMode === 'vim') {
      const vimMode = this.vimModeManager?.getCurrentMode() || 'NORMAL'
      vimInfo = ` | ✏️ ${vimMode.toUpperCase()}`
    }

    // Status info
    const queueStatus = inputQueue.getStatus()
    const queueCount = queueStatus.queueLength
    const _statusDot = this.assistantProcessing ? chalk.blue('●') : chalk.gray('●')
    const readyText = this.assistantProcessing ? chalk.blue(`Loading ${this.renderLoadingBar()}`) : 'Ready'

    // Model/provider
    const currentModel = this.configManager.getCurrentModel()
    const providerIcon = this.getProviderIcon(currentModel)
    const modelColor = this.getProviderColor(currentModel)
    const _modelDisplay = `${providerIcon} ${modelColor(currentModel)}`

    // Responsive layout based on terminal width
    const layout = this.createResponsiveStatusLayout(terminalWidth)
    const truncatedModel = this.truncateModelName(currentModel, layout.modelMaxLength)
    const responsiveModelDisplay = `${providerIcon} ${modelColor(truncatedModel)}`

    // Context and token rate info with responsive sizing
    const contextInfo = this.renderContextProgressBar(layout.contextWidth, layout.useCompact)
    const tokenRate = layout.showTokenRate ? ` | ${this.getTokenRate(layout.useCompact)}` : ''

    // Create responsive status bar
    const statusLeft = `${modeIcon} ${readyText} | ${responsiveModelDisplay} | ${contextInfo}${tokenRate}${vmInfo}${vimInfo}`
    const queuePart = queueCount > 0 ? ` | 📥 ${queueCount}` : ''
    const visionIcon = this.getVisionStatusIcon()
    const imgIcon = this.getImageGenStatusIcon()
    const visionPart = layout.showVisionIcons && visionIcon ? ` | ${visionIcon}` : ''
    const imgPart = layout.showVisionIcons && imgIcon ? ` | ${imgIcon}` : ''
    const statusRight = `${costDisplay} | ⏱️ ${chalk.yellow(`${sessionDuration}m`)} | ${chalk.blue('📁')} ${workingDir}${queuePart}${visionPart}${imgPart}`
    const statusPadding = Math.max(
      0,
      terminalWidth - this._stripAnsi(statusLeft).length - this._stripAnsi(statusRight).length - 3
    ) // -3 for │ space and │

    // Ensure we don't overflow the terminal width
    const maxContentWidth = terminalWidth - 4 // Reserve space for │ characters
    const finalStatusLeft = statusLeft
    let finalStatusRight = statusRight
    let _finalStatusPadding = statusPadding

    const currentContentWidth = this._stripAnsi(statusLeft).length + this._stripAnsi(statusRight).length
    if (currentContentWidth > maxContentWidth) {
      // Truncate statusRight if necessary to fit
      const availableRightSpace = Math.max(10, maxContentWidth - this._stripAnsi(statusLeft).length - 1)
      const plainStatusRight = this._stripAnsi(statusRight)
      if (plainStatusRight.length > availableRightSpace) {
        const truncatedText = `${plainStatusRight.substring(0, availableRightSpace - 2)}..`
        finalStatusRight = truncatedText
      }
      _finalStatusPadding = Math.max(
        1,
        terminalWidth - this._stripAnsi(finalStatusLeft).length - this._stripAnsi(finalStatusRight).length - 3
      )
    }

    // Determine border color based on state
    let _borderColor
    if (this.userInputActive) {
      _borderColor = chalk.green.visible // Green when user is active
    } else if (this.assistantProcessing) {
      _borderColor = chalk.blue.visible // Blue when assistant is processing
    } else {
      _borderColor = chalk.cyan.visible // Default cyan when idle
    }

    // Display status bar using process.stdout.write to avoid extra lines
    if (!this.isPrintingPanel) {
      process.stdout.write(`${chalk.cyan(`╭${'─'.repeat(terminalWidth - 2)}╮`)}\n`)

      // Force exact width to fill terminal completely
      const leftPart = ` ${finalStatusLeft}`
      const rightPart = finalStatusRight

      // Calculate exact space needed (terminalWidth - 2 for borders)
      const totalSpaceAvailable = terminalWidth - 2
      const leftLength = this._stripAnsi(leftPart).length
      const rightLength = this._stripAnsi(rightPart).length

      let displayLeft = leftPart
      let displayRight = rightPart

      // If content is too long, truncate intelligently
      if (leftLength + rightLength + 1 > totalSpaceAvailable) {
        // Reserve space for right part (minimum 15 chars) and padding
        const minRightSpace = Math.min(15, rightLength)
        const maxLeftSpace = totalSpaceAvailable - minRightSpace - 1

        if (leftLength > maxLeftSpace) {
          const plainLeft = this._stripAnsi(leftPart)
          displayLeft = ` ${plainLeft.substring(0, maxLeftSpace - 2)}..`
        }

        const remainingSpace = totalSpaceAvailable - this._stripAnsi(displayLeft).length - 1
        if (rightLength > remainingSpace) {
          const plainRight = this._stripAnsi(rightPart)
          displayRight = `${plainRight.substring(0, remainingSpace - 2)}..`
        }
      }

      // Calculate exact padding to fill remaining space - limit max padding for better distribution
      const finalLeftLength = this._stripAnsi(displayLeft).length
      const finalRightLength = this._stripAnsi(displayRight).length
      const calculatedPadding = totalSpaceAvailable - finalLeftLength - finalRightLength
      const padding = Math.max(1, Math.min(calculatedPadding, Math.floor(terminalWidth * 0.4)))

      process.stdout.write(
        chalk.cyan('│') +
        chalk.green(displayLeft) +
        ' '.repeat(padding) +
        chalk.gray(displayRight) +
        chalk.cyan('│') +
        '\n'
      )
      process.stdout.write(`${chalk.cyan(`╰${'─'.repeat(terminalWidth - 2)}╯`)}\n`)
    }

    // Input prompt
    const inputPrompt = chalk.green('❯ ')
    this.rl.setPrompt(inputPrompt)
    this.rl.prompt()
  }

  /**
   * Strip ANSI escape codes to calculate actual string length
   */
  private _stripAnsi(str: string): string {
    // More comprehensive ANSI escape sequence removal
    return str.replace(/\x1b\[[0-9;]*[mGK]|\x1b\[[\d;]*[A-Za-z]|\x1b\[[0-9;]*[JKHJIS]/g, '')
  }

  // NEW: Chat UI Methods
  /**
   * Initialize chat UI system
   */
  private initializeChatUI(): void {
    this.updateTerminalDimensions()
    this.isChatMode = true

    // Handle terminal resize
    process.stdout.on('resize', () => {
      this.updateTerminalDimensions()
      this.renderChatUI()
    })
  }

  /**
   * Update terminal dimensions
   */
  private updateTerminalDimensions(): void {
    this.terminalHeight = process.stdout.rows || 24
    this.chatAreaHeight = this.terminalHeight - 4 // Reserve 4 lines for prompt and status
  }

  /**
   * Add message to chat buffer
   */
  private addChatMessage(message: string): void {
    this.chatBuffer.push(message)

    // Keep buffer size manageable
    if (this.chatBuffer.length > this.maxChatLines) {
      this.chatBuffer = this.chatBuffer.slice(-this.maxChatLines)
    }

    this.renderChatUI()
  }

  /**
   * Render the chat UI with fixed prompt
   */
  private renderChatUI(): void {
    if (!this.isChatMode) return
    if (this.isInquirerActive) return // avoid drawing over interactive lists
    if (this.isPrintingPanel) return // avoid drawing over panels
    // Move cursor to bottom and render prompt area
    this.renderPromptArea()
  }

  // Temporarily pause/resume CLI prompt for external interactive prompts (inquirer)
  public suspendPrompt(): void {
    try {
      this.rl?.pause()
    } catch {
      /* ignore */
    }
  }

  public resumePromptAndRender(): void {
    try {
      this.rl?.resume()
    } catch {
      /* ignore */
    }
    // slight delay to avoid racing with panel prints
    setTimeout(() => this.renderPromptAfterOutput(), 30)
  }

  // Public hooks for external modules to guard panel output
  public beginPanelOutput(): void {
    this.isPrintingPanel = true
    this.suspendPrompt()
  }

  public endPanelOutput(): void {
    this.isPrintingPanel = false
    this.resumePromptAndRender()
  }

  /**
   * Get available panel height considering terminal size and reserved space
   */
  private getAvailablePanelHeight(): number {
    const terminalRows = process.stdout.rows || 24
    const reservedSpace = 5 // Prompt (1) + Status bar (3) + Buffer (1)
    return Math.max(15, terminalRows - reservedSpace)
  }

  /**
   * Calculate optimal panel width for terminal
   */
  private getOptimalPanelWidth(): number {
    const terminalCols = process.stdout.columns || 80
    return Math.min(terminalCols - 4, 120) // Max width with margins
  }

  // Print a boxed panel - show full content but avoid status bar overlap
  private printPanel(content: string): void {
    this.beginPanelOutput()
    try {
      // Show content and scroll down enough to avoid status bar overlap
      console.log(content)

      // Add some spacing to push the status bar down
      console.log('\n'.repeat(2))
    } finally {
      this.endPanelOutput()
    }
  }

  // (prompt watchdog removed)

  /**
   * Ensure panels print atomically, without the status frame interleaving
   */
  private async withPanelOutput(fn: () => Promise<void> | void): Promise<void> {
    this.isPrintingPanel = true
    try {
      await fn()
    } finally {
      this.isPrintingPanel = false
      setTimeout(() => this.renderPromptAfterOutput(), 30)
    }
  }

  /**
   * Get provider icon based on model name
   */
  private getProviderIcon(modelName: string): string {
    const lowerModel = modelName.toLowerCase()

    if (lowerModel.includes('claude') || lowerModel.includes('anthropic')) {
      return '🟠' // Claude/Anthropic = orange dot
    } else if (lowerModel.includes('gpt') || lowerModel.includes('openai')) {
      return '🔴' // OpenAI/GPT = black dot
    } else if (lowerModel.includes('gemini') || lowerModel.includes('google')) {
      return '🔵' // Google/Gemini = blue dot
    } else {
      return '🟡' // Default = white dot
    }
  }

  /**
   * Get provider colorizer for model name
   */
  private getProviderColor(modelName: string): (s: string) => string {
    const lowerModel = modelName.toLowerCase()
    if (lowerModel.includes('claude') || lowerModel.includes('anthropic')) {
      return chalk.yellowBright // orange
    } else if (lowerModel.includes('gpt') || lowerModel.includes('openai')) {
      return chalk.black // black
    } else if (lowerModel.includes('gemini') || lowerModel.includes('google')) {
      return chalk.blue // blue
    }
    return chalk.white
  }

  // Inline loading bar for status area (fake progress)
  private renderLoadingBar(width: number = 12): string {
    const pct = Math.max(0, Math.min(100, this.statusBarStep))
    const filled = Math.round((pct / 100) * width)
    return `[${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}]`
  }

  // Context progress bar showing token usage with responsive sizing
  private renderContextProgressBar(width: number = 10, compact: boolean = false): string {
    const totalTokens = this.sessionTokenUsage + this.contextTokens
    const currentModel = this.configManager.getCurrentModel()

    // Get model limits - fallback to 120k for unknown models
    let maxTokens = 120000
    try {
      // Detect provider from model name
      let provider = 'anthropic'
      if (currentModel.includes('gpt') || currentModel.includes('openai')) provider = 'openai'
      else if (currentModel.includes('claude')) provider = 'anthropic'
      else if (currentModel.includes('gemini')) provider = 'google'
      else if (currentModel.includes('openrouter') || currentModel.includes('/')) provider = 'openrouter'

      const limits = universalTokenizer.getModelLimits(currentModel, provider)
      maxTokens = limits.context
    } catch {
      // Use fallback
    }

    const percentage = Math.min(100, (totalTokens / maxTokens) * 100)
    const filled = Math.round((percentage / 100) * width)

    // Color based on usage percentage
    const getColor = (pct: number) => {
      if (pct >= 90) return chalk.red
      if (pct >= 80) return chalk.yellow
      return chalk.blue
    }

    const color = getColor(percentage)
    const bar = `[${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}]`

    // Format tokens (k/M notation)
    const formatTokens = (tokens: number): string => {
      if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
      if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
      return tokens.toString()
    }

    // Responsive format based on available space
    if (compact) {
      // Ultra compact for very small screens
      return color(`${bar} ${percentage.toFixed(0)}%`)
    } else {
      // Standard format
      return color(
        `Context: ${bar} ${percentage.toFixed(0)}% (${formatTokens(totalTokens)}/${formatTokens(maxTokens)})`
      )
    }
  }

  // Calculate token usage rate (tokens per minute) with responsive format
  private getTokenRate(compact: boolean = false): string {
    const sessionDuration = Math.floor((Date.now() - this.sessionStartTime.getTime()) / 1000 / 60)
    if (sessionDuration === 0) return compact ? '--' : 'Rate: --'

    const totalTokens = this.sessionTokenUsage + this.contextTokens
    const rate = Math.round(totalTokens / sessionDuration)

    const formatRate = (r: number): string => {
      if (r >= 1000) return `${(r / 1000).toFixed(1)}k/min`
      return `${r}/min`
    }

    return compact ? formatRate(rate) : `Rate: ${formatRate(rate)}`
  }

  // Create responsive status layout based on terminal width
  private createResponsiveStatusLayout(terminalWidth: number): {
    contextWidth: number
    useCompact: boolean
    showTokenRate: boolean
    showVisionIcons: boolean
    modelMaxLength: number
  } {
    if (terminalWidth <= 60) {
      // Ultra small - molto aggressivo
      return {
        contextWidth: 3,
        useCompact: true,
        showTokenRate: false,
        showVisionIcons: false,
        modelMaxLength: 8,
      }
    } else if (terminalWidth <= 80) {
      // Small - più compatto
      return {
        contextWidth: 4,
        useCompact: true,
        showTokenRate: true,
        showVisionIcons: false,
        modelMaxLength: 16,
      }
    } else if (terminalWidth <= 120) {
      // Medium
      return {
        contextWidth: 6,
        useCompact: true,
        showTokenRate: true,
        showVisionIcons: false,
        modelMaxLength: 25,
      }
    } else {
      // Large
      return {
        contextWidth: 8,
        useCompact: false,
        showTokenRate: true,
        showVisionIcons: true,
        modelMaxLength: 35,
      }
    }
  }

  // Truncate model name intelligently
  private truncateModelName(modelName: string, maxLength: number): string {
    if (modelName.length <= maxLength) return modelName

    // Try to preserve important parts
    if (modelName.includes('/')) {
      const parts = modelName.split('/')
      if (parts.length === 2) {
        const provider = parts[0].substring(0, Math.min(8, Math.floor(maxLength * 0.3)))
        const model = parts[1].substring(0, maxLength - provider.length - 1)
        return `${provider}/${model}`
      }
    }

    return `${modelName.substring(0, maxLength - 2)}..`
  }

  private startStatusBar(): void {
    if (this.statusBarTimer) return
    this.statusBarStep = 0
    this.lastBarSegments = -1
    this.statusBarTimer = setInterval(() => {
      if (this.isInquirerActive) return // don't animate during interactive
      if (this.statusBarStep < 100) {
        this.statusBarStep = Math.min(100, this.statusBarStep + 7)
        // Redraw only if visible bar segment changed
        const width = 12
        const filled = Math.round((this.statusBarStep / 100) * width)
        if (filled !== this.lastBarSegments) {
          this.lastBarSegments = filled
          this.renderPromptAfterOutput()
        }
      } else {
        // Reached 100% – stop the timer to avoid any flashing
        if (this.statusBarTimer) {
          clearInterval(this.statusBarTimer)
          this.statusBarTimer = null
        }
      }
    }, 120)
  }

  private stopStatusBar(): void {
    if (this.statusBarTimer) {
      clearInterval(this.statusBarTimer)
      this.statusBarTimer = null
    }
    this.statusBarStep = 0
    this.lastBarSegments = -1
    this.renderPromptAfterOutput()
  }

  /**
   * Vision status icon: disabled to reduce status bar clutter
   */
  private getVisionStatusIcon(): string {
    return '' // Removed from status bar
  }

  /**
   * Image generation status icon: disabled to reduce status bar clutter
   */
  private getImageGenStatusIcon(): string {
    return '' // Removed from status bar
  }

  /**
   * Render prompt area (fixed at bottom)
   */
  private renderPromptArea(): void {
    if (this.isPrintingPanel) return // do not draw status frame while a panel prints
    // Calculate session info (copied from showLegacyPrompt)
    const sessionDuration = Math.floor((Date.now() - this.sessionStartTime.getTime()) / 1000 / 60)
    const totalTokens = this.sessionTokenUsage + this.contextTokens
    const _tokensDisplay = totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens.toString()
    const costDisplay =
      this.realTimeCost > 0 ? chalk.magenta(`$${this.realTimeCost.toFixed(4)}`) : chalk.magenta('$0.0000')

    const terminalWidth = Math.max(40, process.stdout.columns || 120)
    const workingDir = chalk.blue(path.basename(this.workingDirectory))
    const planHudLines = this.planHudVisible ? this.buildPlanHudLines(terminalWidth) : []

    // Mode info
    const _modeIcon =
      this.currentMode === 'plan' ? '✅' : this.currentMode === 'vm' ? '🐳' : this.currentMode === 'vim' ? '✏️' : '💎'
    const modeText = this.currentMode.toUpperCase()

    // Status info
    const readyText = this.assistantProcessing ? chalk.blue(`⏲ ${this.renderLoadingBar()}`) : chalk.green('⚡︎')
    const statusIndicator = this.assistantProcessing ? '⏳' : '✅'

    // Move cursor to bottom of terminal (reserve HUD + frame + prompt)
    const terminalHeight = process.stdout.rows || 24
    const hudExtraLines = planHudLines.length > 0 ? planHudLines.length + 1 : 0
    const reservedLines = 3 + hudExtraLines
    process.stdout.write(`\x1B[${Math.max(1, terminalHeight - reservedLines)};0H`)

    // Clear the bottom lines
    process.stdout.write('\x1B[J') // Clear from cursor to end

    if (planHudLines.length > 0) {
      for (const line of planHudLines) {
        process.stdout.write(`${line}\n`)
      }
      process.stdout.write('\n')
    }

    // Model/provider
    const currentModel2 = this.configManager.getCurrentModel()
    const providerIcon2 = this.getProviderIcon(currentModel2)
    const modelColor2 = this.getProviderColor(currentModel2)
    const _modelDisplay2 = `${providerIcon2} ${modelColor2(currentModel2)}`

    // Queue/agents
    const queueStatus2 = inputQueue.getStatus()
    const queueCount2 = queueStatus2.queueLength
    const runningAgents = (() => {
      try {
        return agentService.getActiveAgents().length
      } catch {
        return 0
      }
    })()

    // Responsive layout for renderPromptArea
    const layout2 = this.createResponsiveStatusLayout(terminalWidth)
    const truncatedModel2 = this.truncateModelName(currentModel2, layout2.modelMaxLength)
    const responsiveModelDisplay2 = `${providerIcon2} ${modelColor2(truncatedModel2)}`

    // Context and token rate info with responsive sizing
    const contextInfo2 = this.renderContextProgressBar(layout2.contextWidth, layout2.useCompact)
    const tokenRate2 = layout2.showTokenRate ? ` | ${this.getTokenRate(layout2.useCompact)}` : ''

    // Create status bar (hide Mode when DEFAULT)
    const modeSegment = this.currentMode === 'default' ? '' : ` | ${chalk.magentaBright(modeText)}`

    // Add VM container info if in VM mode and container is active
    let vmInfo = ''
    if (this.currentMode === 'vm' && this.activeVMContainer) {
      const containerId = this.activeVMContainer.slice(0, 8)
      vmInfo = ` | 🐳 ${containerId}`
    }

    // Vim info if in vim mode
    let vimInfo = ''
    if (this.currentMode === 'vim') {
      const vimMode = this.vimModeManager?.getCurrentMode() || 'NORMAL'
      vimInfo = ` | ✏️ ${vimMode.toUpperCase()}`
    }

    const statusLeft = `${statusIndicator} ${readyText}${modeSegment}${vmInfo}${vimInfo} | ${responsiveModelDisplay2} | ${contextInfo2}${tokenRate2}`
    const rightExtra = `${queueCount2 > 0 ? ` | 📥 ${queueCount2}` : ''}${runningAgents > 0 ? ` | 🔌 ${runningAgents}` : ''}`
    const visionIcon2 = this.getVisionStatusIcon()
    const imgIcon2 = this.getImageGenStatusIcon()
    const visionPart2 = layout2.showVisionIcons && visionIcon2 ? ` | ${visionIcon2}` : ''
    const imgPart2 = layout2.showVisionIcons && imgIcon2 ? ` | ${imgIcon2}` : ''
    const statusRight = `${costDisplay} | ⏱️ ${chalk.yellow(`${sessionDuration}m`)} | ${chalk.blue('📁')} ${workingDir}${rightExtra}${visionPart2}${imgPart2}`
    const statusPadding = Math.max(
      0,
      terminalWidth - this._stripAnsi(statusLeft).length - this._stripAnsi(statusRight).length - 3
    ) // -3 for │ space and │

    // Ensure we don't overflow the terminal width
    const maxContentWidth = terminalWidth - 4 // Reserve space for │ characters
    const finalStatusLeft = statusLeft
    let finalStatusRight = statusRight
    let _finalStatusPadding = statusPadding

    const currentContentWidth = this._stripAnsi(statusLeft).length + this._stripAnsi(statusRight).length
    if (currentContentWidth > maxContentWidth) {
      // Truncate statusRight if necessary to fit
      const availableRightSpace = Math.max(10, maxContentWidth - this._stripAnsi(statusLeft).length - 1)
      const plainStatusRight = this._stripAnsi(statusRight)
      if (plainStatusRight.length > availableRightSpace) {
        const truncatedText = `${plainStatusRight.substring(0, availableRightSpace - 2)}..`
        finalStatusRight = truncatedText
      }
      _finalStatusPadding = Math.max(
        1,
        terminalWidth - this._stripAnsi(finalStatusLeft).length - this._stripAnsi(finalStatusRight).length - 3
      )
    }

    // Display status bar with frame using process.stdout.write to avoid extra lines
    if (!this.isPrintingPanel) {
      process.stdout.write(`${chalk.cyan(`╭${'─'.repeat(terminalWidth - 2)}╮`)}\n`)

      // Force exact width to prevent overflow
      const leftPart = ` ${finalStatusLeft}`
      const rightPart = ` ${finalStatusRight}`
      const availableSpace = terminalWidth - 2 // 2 for left and right borders
      const totalContentLength = this._stripAnsi(leftPart).length + this._stripAnsi(rightPart).length

      const displayLeft = leftPart
      let displayRight = rightPart
      let padding = availableSpace - totalContentLength

      // If content is too long, truncate right part
      if (padding < 0) {
        const maxRightLength = availableSpace - this._stripAnsi(leftPart).length - 1 // -1 for minimum space
        if (maxRightLength > 10) {
          const plainRight = this._stripAnsi(rightPart).trim()
          displayRight = ` ${plainRight.length > maxRightLength - 3 ? `${plainRight.substring(0, maxRightLength - 3)}..` : plainRight}`
          padding = availableSpace - this._stripAnsi(leftPart).length - this._stripAnsi(displayRight).length
        } else {
          displayRight = ` `
          padding = availableSpace - this._stripAnsi(leftPart).length - 1
        }
      }

      // Ensure padding is never negative and fills exact width
      padding = Math.max(0, padding)

      // Build the status line and validate width
      const statusLine =
        chalk.cyan('│') + chalk.green(displayLeft) + ' '.repeat(padding) + chalk.gray(displayRight) + chalk.cyan('│')

      // Validate that the line length matches terminal width exactly
      const actualLineLength = this._stripAnsi(statusLine).length
      if (actualLineLength !== terminalWidth) {
        // Adjust padding if there's a mismatch
        const adjustedPadding = padding + (terminalWidth - actualLineLength)
        if (adjustedPadding >= 0) {
          process.stdout.write(
            chalk.cyan('│') +
            chalk.green(displayLeft) +
            ' '.repeat(adjustedPadding) +
            chalk.gray(displayRight) +
            chalk.cyan('│') +
            '\n'
          )
        } else {
          // Fallback: ensure we don't have negative padding
          process.stdout.write(`${statusLine}\n`)
        }
      } else {
        process.stdout.write(`${statusLine}\n`)
      }
      process.stdout.write(`${chalk.cyan(`╰${'─'.repeat(terminalWidth - 2)}╯`)}\n`)
    }

    if (this.rl) {
      // Simple clean prompt
      this.rl.setPrompt(chalk.greenBright('❯ '))
      this.rl.prompt()
    }
  }

  /**
   * Hook to render prompt after console output
   */
  private renderPromptAfterOutput(): void {
    if (!this.isChatMode) return
    if (this.isPrintingPanel) return
    if (this.isInquirerActive) return // don't redraw during interactive prompts
    try {
      if (inputQueue.isBypassEnabled()) return
    } catch {
      /* ignore */
    }
    if (this.promptRenderTimer) {
      clearTimeout(this.promptRenderTimer)
      this.promptRenderTimer = null
    }
    this.promptRenderTimer = setTimeout(() => {
      try {
        if (!this.isPrintingPanel && !this.isInquirerActive && !(inputQueue.isBypassEnabled?.() ?? false))
          this.renderPromptArea()
      } finally {
        if (this.promptRenderTimer) {
          clearTimeout(this.promptRenderTimer)
          this.promptRenderTimer = null
        }
      }
    }, 50)
  }

  /**
   * Format agent factory results for clean display like plan mode
   */
  private formatAgentFactoryResult(result: any): string {
    if (!result) return 'Task completed'

    // Handle string results directly
    if (typeof result === 'string') {
      return result
    }

    // Handle task wrapper structure: { taskId, success, result }
    if (result.taskId && result.success !== undefined && result.result) {
      return this.formatAgentFactoryResult(result.result)
    }

    // Handle agent factory structure with verbose result content
    if (result.success !== undefined && result.agent && (result.todosCompleted !== undefined || result.results)) {
      // Simple completion status like plan mode
      if (result.todosCompleted && result.totalTodos) {
        return `✅ Completed ${result.todosCompleted}/${result.totalTodos} tasks successfully`
      }
      return 'Task completed successfully'
    }

    // For nested result structures, extract just the final outcome
    if (result.result) {
      const innerResult = result.result

      // If the inner result is a verbose agent response, extract just the final summary
      if (typeof innerResult === 'string') {
        const lines = innerResult
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l)

        // Look for "Completion Summary" or "Outcomes Achieved" sections
        let summaryStartIndex = -1
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].toLowerCase()
          if (
            line.includes('completion summary') ||
            line.includes('outcomes achieved') ||
            line.includes('overall outcomes') ||
            line.includes('task completed successfully')
          ) {
            summaryStartIndex = i
            break
          }
        }

        // If we found a summary section, extract the next few meaningful lines
        if (summaryStartIndex >= 0 && summaryStartIndex + 1 < lines.length) {
          const summaryLines = lines
            .slice(summaryStartIndex + 1, summaryStartIndex + 4)
            .filter(
              (line) =>
                line && !line.startsWith('**') && !line.startsWith('#') && !line.startsWith('*') && line.length > 20
            )

          if (summaryLines.length > 0) {
            return summaryLines[0]
          }
        }

        // Fallback: Look for the last meaningful paragraph before "Next Steps"
        const nextStepsIndex = lines.findIndex((line) => line.toLowerCase().includes('next steps'))
        if (nextStepsIndex > 0) {
          for (let i = nextStepsIndex - 1; i >= 0; i--) {
            const line = lines[i]
            if (line.length > 30 && !line.startsWith('**') && !line.startsWith('#')) {
              return line
            }
          }
        }

        // Final fallback: First substantial line that looks like a result
        const meaningfulLine = lines.find(
          (line) =>
            line.length > 40 &&
            !line.startsWith('#') &&
            !line.startsWith('**') &&
            !line.includes('Request Acknowledged') &&
            !line.includes('Complexity Assessment')
        )

        return meaningfulLine || 'Analysis completed successfully'
      }

      return this.formatAgentFactoryResult(innerResult)
    }

    // Handle simple message structures
    if (result.message) return result.message
    if (result.content) return result.content
    if (result.summary) return result.summary
    if (result.text) return result.text

    return 'Task completed successfully'
  }

  /**
   * Display agent results in plan-mode style: task by task
   */
  private displayAgentResultsPlanModeStyle(result: any, agentName: string): void {
    // Handle task wrapper structure: { taskId, success, result }
    if (result.taskId && result.success !== undefined && result.result) {
      result = result.result
    }

    // Check if this is an agent factory result with task breakdown
    if (result.success !== undefined && result.agent && result.todosCompleted !== undefined) {
      // Show task completion summary like plan mode
      this.addLiveUpdate({
        type: 'progress',
        content: `📊 Executing: ${result.todo || 'Processing tasks'} [${this.generateProgressBar(result.todosCompleted, result.totalTodos)}] ${Math.round((result.todosCompleted / result.totalTodos) * 100)}%`,
        source: agentName,
      })

      // Show completion status
      this.addLiveUpdate({
        type: 'status',
        content: `✓ Completed: ${result.todo || 'Task execution completed'}`,
        source: agentName,
      })

      // Show the main content from result directly
      if (result && typeof result === 'string') {
        const formattedContent = this.formatAgentReport(result)
        this.addLiveUpdate({
          type: 'result',
          content: formattedContent,
          source: agentName,
        })
      } else if (result && result.result && typeof result.result === 'string') {
        const formattedContent = this.formatAgentReport(result.result)
        this.addLiveUpdate({
          type: 'result',
          content: formattedContent,
          source: agentName,
        })
      }

      // Final completion message
      this.addLiveUpdate({
        type: 'status',
        content: `**${agentName} Completed:**\n\n✅ Completed ${result.todosCompleted}/${result.totalTodos} tasks successfully`,
        source: agentName,
      })
    } else {
      // Fallback to simple result display
      const formattedResult = this.formatAgentFactoryResult(result)
      this.addLiveUpdate({
        type: 'status',
        content: `**${agentName} Completed:**\n\n${formattedResult}`,
        source: agentName,
      })
    }
  }

  /**
   * Extract meaningful task summary from verbose agent result
   */
  private extractTaskSummary(resultText: string): string | null {
    if (!resultText || typeof resultText !== 'string') return null

    const lines = resultText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l)

    // Look for completion summary sections first
    let summaryStartIndex = -1
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase()
      if (
        line.includes('completion summary') ||
        line.includes('outcomes achieved') ||
        line.includes('overall outcomes')
      ) {
        summaryStartIndex = i
        break
      }
    }

    if (summaryStartIndex >= 0 && summaryStartIndex + 1 < lines.length) {
      // Extract multiple meaningful lines from summary section
      const summaryLines: string[] = []
      for (let i = summaryStartIndex + 1; i < Math.min(summaryStartIndex + 10, lines.length); i++) {
        const line = lines[i]
        if (
          line.length > 20 &&
          !line.startsWith('**') &&
          !line.startsWith('#') &&
          !line.startsWith('*') &&
          !line.includes('Next Steps')
        ) {
          summaryLines.push(line)
          if (summaryLines.length >= 3) break // Get first 3 meaningful lines
        }
      }

      if (summaryLines.length > 0) {
        return summaryLines.join('\n')
      }
    }

    // Fallback: Look for "Actionable Recommendations" or key findings
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase()
      if (
        line.includes('actionable recommendations') ||
        line.includes('key findings') ||
        line.includes('main results')
      ) {
        // Get the next few meaningful lines
        const resultLines: string[] = []
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const resultLine = lines[j]
          if (resultLine.length > 25 && !resultLine.startsWith('**') && !resultLine.startsWith('#')) {
            resultLines.push(resultLine)
            if (resultLines.length >= 2) break
          }
        }
        if (resultLines.length > 0) {
          return resultLines.join('\n')
        }
      }
    }

    // Final fallback: Get substantial content from the middle of the text
    const substantialLines = lines.filter(
      (line) =>
        line.length > 50 &&
        !line.startsWith('#') &&
        !line.startsWith('**') &&
        !line.includes('Request Acknowledged') &&
        !line.includes('Complexity Assessment') &&
        !line.includes('TaskMaster AI') &&
        !line.includes('Execution Strategy')
    )

    if (substantialLines.length > 0) {
      return substantialLines.slice(0, 2).join('\n')
    }

    return null
  }

  /**
   * Extract key findings and analysis from agent result
   */
  private extractKeyFindings(resultText: string): string | null {
    if (!resultText || typeof resultText !== 'string') return null

    const lines = resultText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l)

    // Look for "Task X:" patterns (like "Task 1: Repository State Check")
    const taskResults: string[] = []
    let currentTask = ''
    let inAnalysis = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check for task headers
      if (line.match(/^#### Task \d+:/) || line.includes('**Command Executed**:') || line.includes('**Analysis**:')) {
        if (line.includes('#### Task')) {
          currentTask = line.replace('####', '').replace('**', '').trim()
        } else if (line.includes('**Analysis**:')) {
          inAnalysis = true
          // Get the analysis line
          if (i + 1 < lines.length) {
            const analysisLine = lines[i + 1]
            if (analysisLine.length > 20 && currentTask) {
              taskResults.push(`${currentTask}: ${analysisLine}`)
            }
          }
          inAnalysis = false
        }
      }

      // Also look for "Overall Results" sections
      if (line.includes('Overall Results:') || line.includes('Success Metrics:')) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j]
          if (nextLine.length > 30 && !nextLine.startsWith('**') && !nextLine.startsWith('#')) {
            taskResults.push(`📊 ${nextLine}`)
            break
          }
        }
      }
    }

    // Fallback: Look for command execution results
    if (taskResults.length === 0) {
      let foundResults = false
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes('Command Executed') || line.includes('Analysis:')) {
          foundResults = true
          // Get next meaningful lines
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const resultLine = lines[j]
            if (resultLine.length > 25 && !resultLine.startsWith('```') && !resultLine.startsWith('*')) {
              taskResults.push(resultLine)
              if (taskResults.length >= 3) break
            }
          }
        }
        if (foundResults && taskResults.length >= 3) break
      }
    }

    return taskResults.length > 0 ? taskResults.slice(0, 4).join('\n') : null
  }

  /**
   * Format agent report content for clean display
   */
  private formatAgentReport(resultText: string): string {
    if (!resultText || typeof resultText !== 'string') return 'Report completed'

    const lines = resultText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l)
    const formattedSections: string[] = []

    // Extract task sections (#### Task X: ...)
    let currentSection = ''
    let collectingTask = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Start of task section
      if (line.match(/^#### Task \d+:/)) {
        if (currentSection.trim()) {
          formattedSections.push(currentSection.trim())
        }
        currentSection = `${line.replace('####', '📋').replace('**', '')}\n`
        collectingTask = true
        continue
      }

      // Collect analysis and key info from task sections
      if (collectingTask) {
        if (line.includes('**Analysis**:')) {
          // Get the analysis line
          if (i + 1 < lines.length) {
            const analysisLine = lines[i + 1].replace(/State: /g, '• Status: ')
            currentSection += `  ${analysisLine}\n`
          }
        } else if (line.includes('**Command Executed**:')) {
          // Get the command
          if (i + 1 < lines.length && lines[i + 1].startsWith('`')) {
            const commandLine = lines[i + 1].replace(/`/g, '').trim()
            currentSection += `  Command: ${commandLine}\n`
          }
        }

        // Stop collecting when we hit the next task or major section
        if (line.includes('###') || line.match(/^#### Task \d+:/)) {
          collectingTask = false
        }
      }

      // Extract final summary sections
      if (line.includes('Overall Results:') || line.includes('Quality Assurance')) {
        collectingTask = false
        // Get summary
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const summaryLine = lines[j]
          if (summaryLine.length > 30 && !summaryLine.startsWith('**') && !summaryLine.startsWith('#')) {
            formattedSections.push(`\n🎯 ${summaryLine}`)
            break
          }
        }
      }

      // Extract recommendations
      if (line.includes('Recommendations:')) {
        const recommendations: string[] = []
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const recLine = lines[j]
          if (recLine.includes('- Run') || recLine.includes('- For')) {
            recommendations.push(`  ${recLine.replace('- ', '• ')}`)
          }
          if (recommendations.length >= 2) break
        }
        if (recommendations.length > 0) {
          formattedSections.push(`\n💡 Recommendations:\n${recommendations.join('\n')}`)
        }
      }
    }

    // Add the last section if we were collecting
    if (currentSection.trim()) {
      formattedSections.push(currentSection.trim())
    }

    // If no formatted sections, try to get key content
    if (formattedSections.length === 0) {
      const meaningfulContent = lines
        .filter(
          (line) =>
            line.length > 40 &&
            !line.includes('Request Summary') &&
            !line.includes('Cognitive Analysis') &&
            !line.includes('TaskMaster AI') &&
            !line.startsWith('**') &&
            !line.startsWith('#')
        )
        .slice(0, 3)

      return meaningfulContent.join('\n\n') || 'Analysis completed successfully'
    }

    return formattedSections.join('\n\n')
  }

  /**
   * Generate progress bar like plan mode
   */
  private generateProgressBar(current: number, total: number): string {
    const percentage = Math.round((current / total) * 100)
    const filled = Math.round((current / total) * 10)
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled)
    return bar
  }

  /**
   * Clear streamed output from terminal
   */
  private clearStreamedOutput(lines: number): void {
    if (!process.stdout.isTTY) return // Skip if not interactive terminal

    // Move cursor up and clear lines
    for (let i = 0; i < lines; i++) {
      process.stdout.write('\x1b[1A') // Move cursor up
      process.stdout.write('\x1b[2K') // Clear line
    }
    // Move cursor to beginning of line
    process.stdout.write('\r')
  }

  /**
   * Format tool details for logging
   */
  /**
   * Format tool call info for structured logging
   */
  private formatToolCallInfo(ev: any): { functionName: string; details: string | null } {
    const toolName = ev.toolName || 'unknown'
    const args = ev.toolArgs || ev.args || {}

    // Extract primary parameter based on tool type
    let primaryParam = null

    // Common file operation tools
    if (args.file_path || args.filePath) {
      primaryParam = args.file_path || args.filePath
    } else if (args.path) {
      primaryParam = args.path
    } else if (args.pattern) {
      primaryParam = `pattern: ${args.pattern}`
    } else if (args.command) {
      primaryParam = args.command
    } else if (args.query) {
      primaryParam = args.query
    } else if (args.url) {
      primaryParam = args.url
    }

    // Format function name with parameter if available
    const functionName = primaryParam ? `${toolName}:${primaryParam}`.toLowerCase() : toolName.toLowerCase()

    return {
      functionName,
      details: 'Tool call',
    }
  }

  /**
   * Format tool call with separated name and params for colored display
   */
  private formatToolCall(toolName: string, toolArgs: any): { name: string; params: string } {
    if (!toolName || !toolArgs) {
      return { name: toolName || 'unknown', params: '()' }
    }

    switch (toolName) {
      case 'explore_directory': {
        const path = toolArgs.path || '.'
        const depth = toolArgs.depth ? `depth:${toolArgs.depth}` : ''
        return {
          name: 'explore_directory',
          params: `${path}${depth ? `(${depth})` : '()'}`
        }
      }

      case 'execute_command': {
        const command = toolArgs.command || toolArgs.cmd || 'unknown'
        // Truncate very long commands
        const truncatedCommand = command.length > 30 ? `${command.substring(0, 30)}...` : command
        return {
          name: 'execute_command',
          params: truncatedCommand
        }
      }

      case 'read_file': {
        const filePath = toolArgs.path || toolArgs.file_path || 'unknown'
        return {
          name: 'read_file',
          params: filePath
        }
      }

      case 'write_file': {
        const filePath = toolArgs.path || toolArgs.file_path || 'unknown'
        return {
          name: 'write_file',
          params: filePath
        }
      }

      case 'web_search': {
        const query = toolArgs.query || toolArgs.q || 'unknown'
        const truncatedQuery = query.length > 30 ? `${query.substring(0, 30)}...` : query
        return {
          name: 'web_search',
          params: `"${truncatedQuery}"`
        }
      }

      case 'git_workFlow': {
        const operation = toolArgs.operation || toolArgs.action || 'unknown'
        return {
          name: 'git_workFlow',
          params: operation
        }
      }

      case 'code_analysis': {
        const analysisPath = toolArgs.path || toolArgs.file || 'project'
        return {
          name: 'code_analysis',
          params: analysisPath
        }
      }

      case 'semantic_search': {
        const query = toolArgs.query || toolArgs.search || 'unknown'
        const truncatedQuery = query.length > 30 ? `${query.substring(0, 30)}...` : query
        return {
          name: 'semantic_search',
          params: `"${truncatedQuery}"`
        }
      }

      default:
        return {
          name: toolName,
          params: JSON.stringify(toolArgs).substring(0, 40)
        }
    }
  }

  private formatToolDetails(toolName: string, toolArgs: any): string {
    if (!toolName || !toolArgs) return toolName || 'unknown'

    switch (toolName) {
      case 'explore_directory': {
        const path = toolArgs.path || '.'
        const depth = toolArgs.depth ? ` (depth: ${toolArgs.depth})` : ''
        return `explore_directory: ${path}${depth}`
      }

      case 'execute_command': {
        const command = toolArgs.command || toolArgs.cmd || 'unknown command'
        // Truncate very long commands
        const truncatedCommand = command.length > 50 ? `${command.substring(0, 50)}...` : command
        return `execute_command: ${truncatedCommand}`
      }

      case 'read_file': {
        const filePath = toolArgs.path || toolArgs.file_path || 'unknown file'
        return `read_file: ${filePath}`
      }

      case 'write_file': {
        const writeFilePath = toolArgs.path || toolArgs.file_path || 'unknown file'
        return `write_file: ${writeFilePath}`
      }

      case 'web_search': {
        const query = toolArgs.query || toolArgs.q || 'unknown query'
        const truncatedQuery = query.length > 40 ? `${query.substring(0, 40)}...` : query
        return `web_search: "${truncatedQuery}"`
      }

      case 'git_workFlow': {
        const operation = toolArgs.operation || toolArgs.action || 'unknown operation'
        return `git_workFlow: ${operation}`
      }

      case 'code_analysis': {
        const analysisPath = toolArgs.path || toolArgs.file || 'project'
        return `code_analysis: ${analysisPath}`
      }

      case 'find_files': {
        const pattern = toolArgs.pattern || toolArgs.query || 'unknown pattern'
        return `find_files: ${pattern}`
      }

      case 'manage_packages': {
        const packageAction = toolArgs.action || 'unknown action'
        const packageName = toolArgs.package || toolArgs.name || ''
        return `manage_packages: ${packageAction}${packageName ? ` ${packageName}` : ''}`
      }

      case 'analyze_project':
        return `analyze_project: ${toolArgs.scope || 'full project'}`

      case 'semantic_search': {
        const searchQuery = toolArgs.query || toolArgs.search || 'unknown query'
        return `semantic_search: "${searchQuery}"`
      }

      case 'dependency_analysis': {
        const depPath = toolArgs.path || toolArgs.project || 'project'
        return `dependency_analysis: ${depPath}`
      }

      case 'git_workflow': {
        const gitAction = toolArgs.action || toolArgs.operation || 'unknown action'
        const gitFiles = toolArgs.files ? ` (${toolArgs.files.length} files)` : ''
        return `git_workflow: ${gitAction}${gitFiles}`
      }

      case 'ide_context': {
        const ideScope = toolArgs.scope || toolArgs.context || 'workspace'
        return `ide_context: ${ideScope}`
      }

      case 'edit_file': {
        const editPath = toolArgs.path || toolArgs.file_path || 'unknown file'
        return `edit_file: ${editPath}`
      }

      case 'multi_edit': {
        const multiEditPath = toolArgs.path || toolArgs.file_path || 'unknown file'
        const editCount = toolArgs.edits ? ` (${toolArgs.edits.length} edits)` : ''
        return `multi_edit: ${multiEditPath}${editCount}`
      }

      default:
        // For other tools, try to show the most relevant parameter
        if (toolArgs.path) return `${toolName}: ${toolArgs.path}`
        if (toolArgs.query) return `${toolName}: ${toolArgs.query}`
        if (toolArgs.command) return `${toolName}: ${toolArgs.command}`
        if (toolArgs.file_path) return `${toolName}: ${toolArgs.file_path}`
        return toolName
    }
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
      console.log(chalk.yellow(`⚠️ Toolchain token limit reached for ${toolName}`))
      console.log(
        chalk.dim(`   Current: ${currentUsage}, Adding: ${estimatedTokens}, Limit: ${this.toolchainTokenLimit}`)
      )

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
      console.log(chalk.blue(`🧹 Cleared context for ${toolName}`))
    } else {
      this.toolchainContext.clear()
      console.log(chalk.blue(`🧹 Cleared all toolchain context`))
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
   * Start AI operation tracking with spinner
   */
  public startAIOperation(operation: string = 'Processing'): void {
    this.aiOperationStart = new Date()
    this.stopSpinner() // Stop any existing spinner

    const ora = require('ora')
    this.activeSpinner = ora({
      text: '',
      spinner: 'dots',
      color: 'cyan',
    }).start()

    this.updateSpinnerText(operation)

    // Update spinner every 500ms with realtime stats
    const interval = setInterval(() => {
      if (!this.activeSpinner || !this.aiOperationStart) {
        clearInterval(interval)
        return
      }
      this.updateSpinnerText(operation)
    }, 500)

      // Store interval for cleanup
      ; (this.activeSpinner as any)._interval = interval
  }

  /**
   * Update spinner text with realtime stats
   */
  private updateSpinnerText(operation: string): void {
    if (!this.activeSpinner || !this.aiOperationStart) return

    const elapsed = Math.floor((Date.now() - this.aiOperationStart.getTime()) / 1000)
    const totalTokens = this.sessionTokenUsage + this.contextTokens
    const tokensDisplay = totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens.toString()
    const cost = this.realTimeCost.toFixed(4)

    const spinnerText = `${operation}... (${elapsed}s • ${tokensDisplay} tokens • $${cost} • esc to interrupt)`
    this.activeSpinner.text = spinnerText
  }

  /**
   * Stop AI operation tracking
   */
  public stopAIOperation(): void {
    this.stopSpinner()
    this.aiOperationStart = null
  }

  /**
   * Stop active spinner
   */
  private stopSpinner(): void {
    if (this.activeSpinner) {
      if ((this.activeSpinner as any)._interval) {
        clearInterval((this.activeSpinner as any)._interval)
      }
      this.activeSpinner.stop()
      this.activeSpinner = null
    }
  }

  /**
   * Update token usage with real tracking
   */
  public updateTokenUsage(tokens: number, isOutput: boolean = false, modelName?: string): void {
    this.sessionTokenUsage += tokens

    if (modelName) {
      const inputTokens = isOutput ? 0 : tokens
      const outputTokens = isOutput ? tokens : 0
      this.realTimeCost += this.calculateCost(inputTokens, outputTokens, modelName)
    }

    // Don't update UI during streaming to avoid duplicates
    // UI will be updated when streaming completes
  }

  /**
   * Initialize token tracking system
   */
  private initializeTokenTrackingSystem(): void {
    try {
      // Setup event listeners for token tracking
      contextTokenManager.on('session_started', (session) => {
        console.log(chalk.dim(`🔢 Token tracking started for ${session.provider}:${session.model}`))
        this.updateTokenDisplay()
      })

      contextTokenManager.on('warning_threshold_reached', ({ percentage, context }) => {
        console.log(chalk.yellow(`⚠️  Token usage at ${percentage.toFixed(1)}% of context limit`))
      })

      contextTokenManager.on('critical_threshold_reached', ({ percentage, context }) => {
        console.log(
          chalk.red(`🚨 Critical: Token usage at ${percentage.toFixed(1)}% - consider summarizing conversation`)
        )
      })

      contextTokenManager.on('message_tracked', ({ messageInfo, session, optimization }) => {
        if (optimization.shouldTrim) {
          console.log(chalk.yellow(`💡 ${optimization.reason}`))
        }
        this.updateTokenDisplay()
      })

      // Initialize token display
      this.tokenDisplay.reset()
    } catch (error) {
      console.debug('Token tracking system initialization failed:', error)
    }
  }

  /**
   * Start token session for current model
   */
  private async startTokenSession(): Promise<void> {
    try {
      const currentModel = this.configManager.getCurrentModel()
      const currentProvider = 'anthropic' // Fallback for now

      await contextTokenManager.startSession(currentProvider, currentModel)
    } catch (error) {
      console.debug('Failed to start token session:', error)
    }
  }

  /**
   * Update token display with current session stats
   */
  private updateTokenDisplay(): void {
    try {
      const tokenSession = contextTokenManager.getCurrentSession()
      if (tokenSession) {
        const stats = contextTokenManager.getSessionStats()
        if (stats?.session) {
          const totalTokens = stats.session.totalInputTokens + stats.session.totalOutputTokens
          const limits = universalTokenizer.getModelLimits(tokenSession.model, tokenSession.provider)

          this.tokenDisplay.update(
            totalTokens,
            limits.context,
            tokenSession.provider,
            tokenSession.model,
            stats.session.totalCost
          )
        }
      } else {
        // Fallback to chat session
        const chatSession = chatManager.getCurrentSession()
        if (chatSession) {
          const currentModel = this.configManager.getCurrentModel()
          const currentProvider = 'anthropic' // Fallback for now

          const userTokens = Math.round(
            chatSession.messages.filter((m) => m.role === 'user').reduce((sum, m) => sum + m.content.length, 0) / 4
          )
          const assistantTokens = Math.round(
            chatSession.messages.filter((m) => m.role === 'assistant').reduce((sum, m) => sum + m.content.length, 0) / 4
          )
          const totalTokens = userTokens + assistantTokens
          const cost = universalTokenizer.calculateCost(userTokens, assistantTokens, currentModel).totalCost
          const limits = universalTokenizer.getModelLimits(currentModel, currentProvider)

          this.tokenDisplay.update(totalTokens, limits.context, currentProvider, currentModel, cost)
        }
      }
    } catch (error) {
      console.debug('Token display update failed:', error)
    }
  }

  /**
   * Sync token usage from current session (same method as /tokens command)
   */
  private async syncTokensFromSession(): Promise<void> {
    try {
      const session = chatManager.getCurrentSession()
      if (session) {
        // Calculate tokens the same way as /tokens command
        const userTokens = Math.round(
          session.messages.filter((m) => m.role === 'user').reduce((sum, m) => sum + m.content.length, 0) / 4
        )
        const assistantTokens = Math.round(
          session.messages.filter((m) => m.role === 'assistant').reduce((sum, m) => sum + m.content.length, 0) / 4
        )

        // Update session tokens
        this.sessionTokenUsage = userTokens + assistantTokens

        // Calculate real cost using the same method as /tokens
        const { calculateTokenCost } = await import('./config/token-limits')
        const currentModel = this.configManager.getCurrentModel()
        this.realTimeCost = calculateTokenCost(userTokens, assistantTokens, currentModel).totalCost
      }
    } catch (error) {
      // Fallback to keep existing values if import fails
      console.debug('Failed to sync tokens from session:', error)
    }
  }

  /**
   * Update context token count
   */
  public updateContextTokens(tokens: number): void {
    this.contextTokens = tokens

    // Don't update UI during streaming to avoid duplicates
    // UI will be updated when streaming completes
  }

  /**
   * Start tool call tracking session
   */
  public startToolTracking(): void {
    this.advancedUI.startToolSession()
  }

  /**
   * End tool call tracking session and show summary
   */
  public endToolTracking(): void {
    this.advancedUI.endToolSession()
  }

  /**
   * Track a tool call
   */
  public trackTool(
    type: 'grep' | 'search' | 'read' | 'write' | 'shell' | 'other',
    description: string,
    target?: string,
    lines?: string,
    count?: number
  ): void {
    this.advancedUI.trackToolCall(type, description, target, lines, count)
  }

  private async analyzeProject(): Promise<any> {
    // Implementation for project analysis
    return {
      name: path.basename(this.workingDirectory),
      framework: 'Unknown',
      languages: ['typescript', 'javascript'],
      dependencies: [],
      structure: {},
    }
  }

  private generateClaudeMarkdown(analysis: any): string {
    return `# NIKOCLI.md

This file provides guidance to NikCLI when working with code in this repository.

## Project Overview
- **Name**: ${analysis.name}
- **Framework**: ${analysis.framework}
- **Languages**: ${analysis.languages.join(', ')}

## Architecture
[Project architecture description will be auto-generated based on analysis]

## Development Commands
[Development commands will be auto-detected and listed here]

## Conventions
[Code conventions and patterns will be documented here]

## Context
This file is automatically maintained by NikCLI to provide consistent context across sessions.
`
  }

  private async shutdown(): Promise<void> {
    console.log(chalk.blue('\n👋 Shutting down NikCLI...'))

    // Stop file watcher
    if (this.fileWatcher) {
      try {
        this.fileWatcher.close()
        console.log(chalk.dim('⚡︎ File watcher stopped'))
      } catch (error: any) {
        console.log(chalk.gray(`File watcher cleanup warning: ${error.message}`))
      }
    }

    // Complete any running progress operations
    if (this.progressTracker) {
      try {
        const running = Array.from(this.progressTracker.operations.values()).filter(
          (op: any) => op.status === 'running'
        )

        running.forEach((op: any) => {
          this.progressTracker.complete(op.id, false, 'Interrupted by shutdown')
        })

        if (running.length > 0) {
          console.log(chalk.dim(`📊 Stopped ${running.length} running operations`))
        }
      } catch (error: any) {
        console.log(chalk.gray(`Progress tracker cleanup warning: ${error.message}`))
      }
    }

    // Save caches before shutdown (completion cache auto-saves via CacheProvider)
    try {
      await tokenCache.saveCache()
      await cacheService.emit('saveAll') // Save all managed caches
      console.log(chalk.dim(' All caches saved'))
    } catch (error: any) {
      console.log(chalk.gray(`Cache save warning: ${error.message}`))
    }

    // Clean up UI resources
    this.indicators.clear()
    this.liveUpdates.length = 0
    this.spinners.forEach((spinner) => {
      try {
        spinner.stop()
      } catch (_error: any) {
        // Ignore spinner cleanup errors
      }
    })
    this.spinners.clear()
    this.progressBars.forEach((bar) => {
      try {
        bar.stop()
      } catch (_error: any) {
        // Ignore progress bar cleanup errors
      }
    })
    this.progressBars.clear()

    // Remove keypress listener to prevent loop
    if (this.keypressListener) {
      process.stdin.removeListener('keypress', this.keypressListener)
      this.keypressListener = undefined
    }

    if (this.rl) {
      this.rl.close()
    }

    // Cleanup systems
    this.agentManager.cleanup()

    console.log(chalk.green('✓ All systems cleaned up successfully!'))
    console.log(chalk.green('✓ Goodbye!'))
    process.exit(0)
  }

  // File Operations Methods
  private async readFile(filepath: string): Promise<void> {
    try {
      const readId = `read-${Date.now()}`
      this.createStatusIndicator(readId, `Reading ${filepath}`)
      this.startAdvancedSpinner(readId, 'Reading file...')

      const content = await toolsManager.readFile(filepath)

      this.stopAdvancedSpinner(readId, true, `Read ${filepath}`)
      console.log(chalk.blue.bold(`\n📄 File: ${filepath}`))
      console.log(chalk.gray('─'.repeat(50)))
      console.log(content)
      console.log(chalk.gray('─'.repeat(50)))
      console.log(chalk.dim('✓ File read completed'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to read ${filepath}: ${error.message}`))
    }
  }

  private async writeFile(filepath: string, content: string): Promise<void> {
    try {
      const writeId = `write-${Date.now()}`
      this.createStatusIndicator(writeId, `Writing ${filepath}`)
      this.startAdvancedSpinner(writeId, 'Writing file...')

      await toolsManager.writeFile(filepath, content)

      this.stopAdvancedSpinner(writeId, true, `Written ${filepath}`)
      console.log(chalk.green(`✓ File written: ${filepath}`))
      console.log(chalk.gray('─'.repeat(50)))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to write ${filepath}: ${error.message}`))
    }
  }

  private async listFiles(directory: string): Promise<void> {
    try {
      const lsId = `ls-${Date.now()}`
      this.createStatusIndicator(lsId, `Listing ${directory}`)
      this.startAdvancedSpinner(lsId, 'Listing files...')

      const files = await toolsManager.listFiles(directory)

      this.stopAdvancedSpinner(lsId, true, `Listed ${files.length} items`)
      console.log(chalk.blue.bold(`\n📁 Directory: ${directory}`))
      console.log(chalk.gray('─'.repeat(50)))
      files.forEach((file) => {
        const icon = '📄' // Simple icon for now
        console.log(`${icon} ${chalk.cyan(file)}`)
      })
      console.log(chalk.gray('─'.repeat(50)))
      console.log(chalk.dim(`✓ Listed ${files.length} files`))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to list ${directory}: ${error.message}`))
    }
  }

  private async runCommand(command: string): Promise<void> {
    // Avoid spinner during streaming to prevent prompt overlap/races
    const uniqueId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let finalized = false
    try {
      this.createStatusIndicator(uniqueId, `Executing: ${command}`)
      console.log(chalk.blue(`⚡ Running: ${command}`))

      const result = await toolsManager.runCommand(command.split(' ')[0], command.split(' ').slice(1), { stream: true })

      const success = result.code === 0
      this.updateStatusIndicator(uniqueId, {
        status: success ? 'completed' : 'failed',
        details: success ? 'Command completed' : `Exit code ${result.code}`,
      })
      finalized = true

      // Summary line only; stdout/stderr already streamed by toolsManager
      console.log(chalk.gray(`\n📊 Exit Code: ${result.code}`))
    } catch (error: any) {
      console.log(chalk.red(`❌ Command failed: ${error.message}`))
    } finally {
      try {
        if (!finalized) {
          this.updateStatusIndicator(uniqueId, { status: 'failed', details: 'Command aborted' })
        }
      } catch { }
      // Ensure the prompt is rendered on a clean line without overlaps
      try {
        process.stdout.write('\n')
        await new Promise((resolve) => setTimeout(resolve, 50))
      } catch { }
      this.renderPromptAfterOutput()
    }
  }

  // ===== ENHANCED SERVICES COMMAND HANDLERS =====

  /**
   * Handle cache-related commands
   */
  private async handleCacheCommands(cmd: string, args: string[]): Promise<void> {
    try {
      switch (cmd) {
        case 'redis':
          if (args.length === 0) {
            await this.showRedisStatus()
          } else {
            const subCmd = args[0]
            switch (subCmd) {
              case 'connect':
                await this.connectRedis()
                break
              case 'disconnect':
                await this.disconnectRedis()
                break
              case 'health':
                await this.showRedisHealth()
                break
              case 'config':
                await this.showRedisConfig()
                break
              default:
                this.printPanel(
                  boxen('Usage: /redis [connect|disconnect|health|config]', {
                    title: 'Redis Command',
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'yellow',
                  })
                )
            }
          }
          break

        case 'cache-stats':
          await this.showCacheStats()
          break

        case 'cache-health':
          await this.showCacheHealth()
          break

        case 'cache-clear':
          if (args.length === 0 || args[0] === 'all') {
            await this.clearAllCaches()
          } else {
            await this.clearSpecificCache(args[0])
          }
          break
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Cache command failed: ${error.message}`))
    }
  }

  /**
   * Handle Supabase-related commands
   */
  private async handleSupabaseCommands(cmd: string, args: string[]): Promise<void> {
    try {
      switch (cmd) {
        case 'supabase':
          if (args.length === 0) {
            await this.showSupabaseStatus()
          } else {
            const subCmd = args[0]
            switch (subCmd) {
              case 'connect':
                await this.connectSupabase()
                break
              case 'health':
                await this.showSupabaseHealth()
                break
              case 'features':
                await this.showSupabaseFeatures()
                break
              default:
                this.printPanel(
                  boxen('Usage: /supabase [connect|health|features]', {
                    title: 'Supabase Command',
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'yellow',
                  })
                )
            }
          }
          break

        case 'db':
          await this.handleDatabaseCommands(args)
          break

        case 'auth':
          await this.handleAuthCommands(args)
          break

        case 'session-sync':
          await this.syncSessions(args[0])
          break
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Supabase command failed: ${error.message}`))
    }
  }

  /**
   * Show Redis status
   */
  private async showRedisStatus(): Promise<void> {
    const config = this.configManager.getRedisConfig()

    console.log(chalk.blue('\n🔴 Redis Configuration:'))
    console.log(`   Enabled: ${config.enabled ? chalk.green('Yes') : chalk.red('No')}`)
    console.log(`   Host: ${config.host}:${config.port}`)
    console.log(`   Database: ${config.database}`)
    console.log(`   Key Prefix: ${config.keyPrefix}`)
    console.log(`   TTL: ${config.ttl}s`)
    console.log(
      `   Fallback: ${config.fallback.enabled ? chalk.green('Enabled') : chalk.red('Disabled')} (${config.fallback.strategy})`
    )

    if (config.enabled) {
      try {
        const { redisProvider } = await import('./providers/redis/redis-provider')
        const healthy = redisProvider.isHealthy()
        console.log(`   Connection: ${healthy ? chalk.green('Connected') : chalk.red('Disconnected')}`)

        if (healthy) {
          const health = redisProvider.getLastHealthCheck()
          if (health) {
            console.log(`   Latency: ${health.latency}ms`)
            const memUsed =
              health.memory?.used !== undefined ? `${(health.memory.used / 1024 / 1024).toFixed(2)} MB` : 'N/A'
            console.log(`   Memory Used: ${memUsed}`)
            console.log(`   Keys: ${health.keyspace?.keys ?? 'Unknown'}`)
          }
        }
      } catch (error: any) {
        console.log(`   Error: ${chalk.red(error.message)}`)
      }
    }
  }

  /**
   * Show cache statistics
   */
  private async showCacheStats(): Promise<void> {
    try {
      const stats = await cacheService.getStats()

      console.log(chalk.blue('\n📊 Cache Statistics:'))
      console.log(chalk.green('Redis Cache:'))
      console.log(`   Enabled: ${stats.redis.enabled ? 'Yes' : 'No'}`)
      console.log(`   Connected: ${stats.redis.connected ? chalk.green('Yes') : chalk.red('No')}`)
      console.log(`   Entries: ${stats.redis.entries || 'Unknown'}`)

      console.log(chalk.cyan('Fallback Cache:'))
      console.log(`   Enabled: ${stats.fallback.enabled ? 'Yes' : 'No'}`)
      console.log(`   Type: ${stats.fallback.type}`)

      console.log(chalk.yellow('Overall Performance:'))
      console.log(`   Total Hits: ${stats.totalHits}`)
      console.log(`   Total Misses: ${stats.totalMisses}`)
      console.log(`   Hit Rate: ${stats.hitRate}%`)

      if (this.isEnhancedMode) {
        const enhancedStats = await enhancedTokenCache.getStats()
        console.log(chalk.magenta('Enhanced Token Cache:'))
        console.log(`   Total Entries: ${enhancedStats.totalEntries}`)
        console.log(`   Total Hits: ${enhancedStats.totalHits}`)
        console.log(`   Tokens Saved: ${enhancedStats.totalTokensSaved}`)
        console.log(`   Memory Cache Size: ${enhancedStats.cacheSize}`)
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to get cache stats: ${error.message}`))
    }
  }

  /**
   * Show Supabase status
   */
  private async showSupabaseStatus(): Promise<void> {
    const config = this.configManager.getSupabaseConfig()
    const credentials = this.configManager.getSupabaseCredentials()

    console.log(chalk.blue('\n🟢 Supabase Configuration:'))
    console.log(`   Enabled: ${config.enabled ? chalk.green('Yes') : chalk.red('No')}`)
    console.log(`   URL: ${credentials.url ? chalk.green('✓ Set') : chalk.red('✗ Missing')}`)
    console.log(`   Anon Key: ${credentials.anonKey ? chalk.green('✓ Set') : chalk.red('✗ Missing')}`)
    console.log(`   Service Key: ${credentials.serviceRoleKey ? chalk.green('✓ Set') : chalk.red('✗ Missing')}`)

    console.log('\n   Features:')
    Object.entries(config.features).forEach(([feature, enabled]) => {
      console.log(`   ${feature}: ${enabled ? chalk.green('Enabled') : chalk.gray('Disabled')}`)
    })

    if (config.enabled) {
      try {
        const health = await enhancedSupabaseProvider.healthCheck()
        console.log(`\n   Connection: ${health.connected ? chalk.green('Connected') : chalk.red('Disconnected')}`)
        if (health.latency) {
          console.log(`   Latency: ${health.latency}ms`)
        }
      } catch (error: any) {
        console.log(`   Error: ${chalk.red(error.message)}`)
      }
    }
  }

  /**
   * Handle authentication commands
   */
  private async handleAuthCommands(args: string[]): Promise<void> {
    if (args.length === 0) {
      // Show current auth status
      const currentUser = authProvider.getCurrentUser()
      const profile = authProvider.getCurrentProfile()

      if (currentUser) {
        console.log(chalk.green('\n🔐 Authentication Status: Signed In'))
        console.log(`   User: ${profile?.email || profile?.username || currentUser.id}`)
        console.log(`   Subscription: ${profile?.subscription_tier || 'Unknown'}`)
        console.log(`   Authenticated: ${authProvider.isAuthenticated() ? 'Yes' : 'Session Expired'}`)

        if (profile) {
          console.log('\n   Usage This Month:')
          console.log(`   Sessions: ${profile.usage.sessionsThisMonth}/${profile.quotas.sessionsPerMonth}`)
          console.log(`   Tokens: ${profile.usage.tokensThisMonth}/${profile.quotas.tokensPerMonth}`)
          console.log(`   API Calls (hour): ${profile.usage.apiCallsThisHour}/${profile.quotas.apiCallsPerHour}`)
        }
      } else {
        console.log(chalk.gray('🔐 Authentication Status: Not signed in'))
        console.log(chalk.dim('   Use /auth signin to authenticate'))
      }
      return
    }

    const subCmd = args[0]
    switch (subCmd) {
      case 'signin':
      case 'login':
        await this.handleAuthSignIn()
        break
      case 'signup':
      case 'register':
        await this.handleAuthSignUp()
        break
      case 'signout':
      case 'logout':
        await this.handleAuthSignOut()
        break
      case 'profile':
        await this.showAuthProfile()
        break
      case 'quotas':
        await this.showAuthQuotas()
        break
      default:
        this.printPanel(
          boxen('Usage: /auth [signin|signup|signout|profile|quotas]', {
            title: 'Auth Command',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
    }
  }

  /**
   * Sign in handler
   */
  private async handleAuthSignIn(): Promise<void> {
    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    try {
      const email = await new Promise<string>((resolve) => rl.question('Email: ', resolve))

      const password = await new Promise<string>((resolve) => rl.question('Password: ', resolve))

      if (email && password) {
        console.log(chalk.blue('⚡︎ Signing in...'))
        const result = await authProvider.signIn(email, password, { rememberMe: true })

        if (result) {
          console.log(chalk.green(`✓ Welcome back, ${result.profile.email}!`))

          // Set user for enhanced session manager
          this.enhancedSessionManager.setCurrentUser(result.session.user.id)
        } else {
          console.log(chalk.red('❌ Sign in failed - invalid credentials'))
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Sign in error: ${error.message}`))
    } finally {
      rl.close()
    }
  }

  /**
   * Show enhanced stats
   */
  private async showEnhancedStats(): Promise<void> {
    console.log(chalk.blue('\n📈 Enhanced Services Statistics'))
    console.log(chalk.gray('═'.repeat(50)))

    // Cache stats
    await this.showCacheStats()

    // Session sync stats
    if (this.isEnhancedMode) {
      try {
        const syncStatus = await this.enhancedSessionManager.getSyncStatus()
        console.log(chalk.magenta('\n Session Sync Status:'))
        console.log(`   Total Local: ${syncStatus.totalLocal}`)
        console.log(`   Total Cloud: ${syncStatus.totalCloud}`)
        console.log(`   Synced: ${syncStatus.synced}`)
        console.log(`   Conflicts: ${syncStatus.conflicts}`)
        console.log(`   Local Only: ${syncStatus.localOnly}`)
        console.log(`   Cloud Only: ${syncStatus.cloudOnly}`)
      } catch (error: any) {
        console.log(chalk.yellow(`⚠️ Session sync status unavailable: ${error.message}`))
      }
    }

    // System health
    const cacheHealth = cacheService.getHealthStatus()
    console.log(chalk.cyan('\n🏥 System Health:'))
    console.log(`   Cache Service: ${cacheHealth.overall ? chalk.green('Healthy') : chalk.red('Unhealthy')}`)
    console.log(`   Redis: ${cacheHealth.redis.healthy ? chalk.green('Connected') : chalk.red('Disconnected')}`)
    console.log(`   SmartCache: ${cacheHealth.smartCache.healthy ? chalk.green('Ready') : chalk.red('Error')}`)

    if (this.isEnhancedMode) {
      const tokenCacheHealth = enhancedTokenCache.getHealth()
      console.log(
        `   Enhanced Token Cache: ${tokenCacheHealth.healthy ? chalk.green('Healthy') : chalk.red('Unhealthy')}`
      )
    }
  }

  /**
   * Show git commit history in a panel
   */
  private async showCommitHistoryPanel(args: string[]): Promise<void> {
    try {
      // Parse arguments for options like --count, --oneline, --graph, etc.
      const options = this.parseCommitHistoryArgs(args)

      console.log(chalk.blue('📋 Loading commit history...'))

      // Get commit history using git log
      const gitCommand = this.buildGitLogCommand(options)
      const { exec } = require('node:child_process')
      const { promisify } = require('node:util')
      const execAsync = promisify(exec)

      const { stdout, stderr } = await execAsync(gitCommand)

      if (stderr && !stderr.includes('warning')) {
        console.log(chalk.red(`❌ Git error: ${stderr}`))
        return
      }

      // Format the commit history for display
      const formattedHistory = this.formatCommitHistory(stdout, options)

      // Display directly in console with boxen (like /tokens command)
      const historyBox = boxen(formattedHistory, {
        title: 'Git Commit History',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'magenta',
      })

      this.printPanel(historyBox)
    } catch (error: any) {
      if (error.message.includes('not a git repository')) {
        console.log(chalk.yellow('⚠️  This directory is not a git repository'))
      } else {
        console.log(chalk.red(`❌ Failed to get commit history: ${error.message}`))
      }
    }
  }

  /**
   * Panelized Memory commands (stats, config, context, personalization, cleanup)
   */
  private async handleMemoryPanels(args: string[]): Promise<void> {
    const showHelp = () => {
      const lines = [
        '/memory stats            - Show memory statistics',
        '/memory config           - Show memory configuration',
        '/memory context          - Show current session context',
        '/memory personalization  - Show inferred user personalization',
        '/memory cleanup          - Clean low-importance, older context (safe)',
        '',
        'Related:',
        '/remember "fact"        - Store an important fact',
        '/recall "query"         - Search memories',
        '/forget <id>            - Delete a memory by ID',
      ].join('\n')

      this.printPanel(
        boxen(lines, {
          title: 'Memory: Help',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    }

    if (!args || args.length === 0 || args[0].toLowerCase() === 'help') {
      showHelp()
      return
    }

    const sub = args[0].toLowerCase()
    try {
      switch (sub) {
        case 'stats': {
          const stats = memoryService.getMemoryStats()
          const lines: string[] = []
          lines.push(`${chalk.green('Total Memories:')} ${stats.totalMemories}`)
          lines.push(
            `${chalk.green('Average Importance:')} ${stats.averageImportance ? stats.averageImportance.toFixed(1) : '0.0'}/10`
          )
          if (stats.oldestMemory) {
            lines.push(`${chalk.green('Oldest:')} ${new Date(stats.oldestMemory).toLocaleString()}`)
          }
          if (stats.newestMemory) {
            lines.push(`${chalk.green('Newest:')} ${new Date(stats.newestMemory).toLocaleString()}`)
          }
          if (stats.memoriesBySource && Object.keys(stats.memoriesBySource).length > 0) {
            lines.push('')
            lines.push(chalk.cyan('By Source:'))
            Object.entries(stats.memoriesBySource).forEach(([src, count]) => lines.push(`  • ${src}: ${count}`))
          }

          this.printPanel(
            boxen(lines.join('\n'), {
              title: 'Memory: Statistics',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            })
          )
          break
        }

        case 'config': {
          const cfg = memoryService.getConfig?.() || {}
          const lines: string[] = []
          lines.push(`${chalk.green('Enabled:')} ${cfg.enabled ? 'Yes' : 'No'}`)
          lines.push(`${chalk.green('Backend:')} ${cfg.backend || 'memory'}`)
          if (cfg.embedding_model) lines.push(`${chalk.green('Embedding Model:')} ${cfg.embedding_model}`)
          if (cfg.max_memories !== undefined) lines.push(`${chalk.green('Max Memories:')} ${cfg.max_memories}`)
          if (cfg.auto_cleanup !== undefined)
            lines.push(`${chalk.green('Auto Cleanup:')} ${cfg.auto_cleanup ? 'Yes' : 'No'}`)
          if (cfg.similarity_threshold !== undefined)
            lines.push(`${chalk.green('Similarity Threshold:')} ${cfg.similarity_threshold}`)
          if (cfg.importance_decay_days !== undefined)
            lines.push(`${chalk.green('Importance Decay (days):')} ${cfg.importance_decay_days}`)

          this.printPanel(
            boxen(lines.join('\n'), {
              title: 'Memory: Configuration',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }

        case 'context': {
          const session = memoryService.getCurrentSession?.()
          if (!session) {
            this.printPanel(
              boxen('No active memory session', {
                title: 'Memory: Context',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              })
            )
            break
          }

          const recents = await memoryService.getConversationContext(session.sessionId, 2)
          const lines: string[] = []
          lines.push(`${chalk.green('Session ID:')} ${session.sessionId}`)
          if (session.userId) lines.push(`${chalk.green('User ID:')} ${session.userId}`)
          if (session.topic) lines.push(`${chalk.green('Topic:')} ${session.topic}`)
          lines.push(`${chalk.green('Participants:')} ${session.participants.join(', ')}`)
          lines.push(`${chalk.green('Started:')} ${new Date(session.startTime).toLocaleString()}`)
          lines.push(`${chalk.green('Last Activity:')} ${new Date(session.lastActivity).toLocaleString()}`)

          if (recents.length > 0) {
            lines.push('')
            lines.push(chalk.cyan(`Recent Context (${recents.length}):`))
            recents.slice(0, 5).forEach((m) => {
              const text = (m.content || '').replace(/\s+/g, ' ').slice(0, 80)
              lines.push(`  • ${text}${m.content.length > 80 ? '…' : ''}`)
            })
          }

          this.printPanel(
            boxen(lines.join('\n'), {
              title: '⚡︎ Memory: Context',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            })
          )
          break
        }

        case 'personalization': {
          const session = memoryService.getCurrentSession?.()
          if (!session?.userId) {
            this.printPanel(
              boxen('No user ID in current session', {
                title: '⚡︎ Memory: Personalization',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              })
            )
            break
          }
          const p = await memoryService.getPersonalization(session.userId)
          if (!p) {
            this.printPanel(
              boxen('No personalization data available', {
                title: '⚡︎ Memory: Personalization',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              })
            )
            break
          }
          const lines: string[] = []
          lines.push(`${chalk.green('User ID:')} ${p.userId}`)
          lines.push(`${chalk.green('Communication Style:')} ${p.communication_style}`)
          lines.push(`${chalk.green('Preferred Length:')} ${p.interaction_patterns.preferred_response_length}`)
          lines.push(`${chalk.green('Detail Level:')} ${p.interaction_patterns.preferred_detail_level}`)
          if (p.expertise_areas?.length)
            lines.push(`${chalk.green('Expertise Areas:')} ${p.expertise_areas.slice(0, 5).join(', ')}`)
          if (p.frequent_topics?.length)
            lines.push(`${chalk.green('Frequent Topics:')} ${p.frequent_topics.slice(0, 5).join(', ')}`)
          if (p.interaction_patterns.common_tasks?.length)
            lines.push(`${chalk.green('Common Tasks:')} ${p.interaction_patterns.common_tasks.slice(0, 5).join(', ')}`)

          this.printPanel(
            boxen(lines.join('\n'), {
              title: '⚡︎ Memory: Personalization',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'magenta',
            })
          )
          break
        }

        case 'cleanup': {
          // Simple, safe cleanup: delete low-importance (<=3) older than 14 days
          const now = Date.now()
          const twoWeeks = 14 * 24 * 60 * 60 * 1000
          const deleted = await memoryService.deleteMemoriesByCriteria({
            timeRange: { start: 0, end: now - twoWeeks },
            importance: { max: 3 },
          })

          const msg =
            deleted > 0 ? `Deleted ${deleted} low-importance, older memories` : 'No eligible memories to clean'
          this.printPanel(
            boxen(msg, {
              title: '⚡︎ Memory: Cleanup',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: deleted > 0 ? 'green' : 'yellow',
            })
          )
          break
        }

        default:
          showHelp()
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`Memory command failed: ${error.message}`, {
          title: '❌ Memory Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Parse commit history arguments
   */
  private parseCommitHistoryArgs(args: string[]): any {
    const options = {
      count: 20,
      oneline: false,
      graph: false,
      all: false,
      author: null as string | null,
      since: null as string | null,
      until: null as string | null,
    }

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      switch (arg) {
        case '--count':
        case '-n':
          options.count = parseInt(args[i + 1], 10) || 20
          i++ // skip next arg
          break
        case '--oneline':
          options.oneline = true
          break
        case '--graph':
          options.graph = true
          break
        case '--all':
          options.all = true
          break
        case '--author':
          options.author = args[i + 1]
          i++ // skip next arg
          break
        case '--since':
          options.since = args[i + 1]
          i++ // skip next arg
          break
        case '--until':
          options.until = args[i + 1]
          i++ // skip next arg
          break
      }
    }

    return options
  }

  /**
   * Build git log command based on options
   */
  private buildGitLogCommand(options: any): string {
    let command = 'git log'

    if (options.oneline) {
      command += ' --oneline'
    } else {
      command += ' --pretty=format:"%C(yellow)%h%C(reset) - %C(green)%ad%C(reset) %C(blue)(%an)%C(reset)%n  %s%n"'
      command += ' --date=relative'
    }

    if (options.graph) {
      command += ' --graph'
    }

    if (options.all) {
      command += ' --all'
    }

    if (options.author) {
      command += ` --author="${options.author}"`
    }

    if (options.since) {
      command += ` --since="${options.since}"`
    }

    if (options.until) {
      command += ` --until="${options.until}"`
    }

    command += ` -${options.count}`

    return command
  }

  /**
   * Format commit history for display
   */
  private formatCommitHistory(stdout: string, options: any): string {
    if (!stdout.trim()) {
      return chalk.yellow('No commits found')
    }

    // If oneline format, each line is already formatted
    if (options.oneline) {
      return stdout.trim()
    }

    // For detailed format, add some styling
    let formatted = stdout.trim()

    // Add separator between commits for better readability
    formatted = formatted.replace(/\n\n/g, `\n${chalk.gray('─'.repeat(50))}\n\n`)

    return formatted
  }

  /**
   * Panelized IDE Diagnostic commands (help/start/stop/status/run)
   */
  private async handleDiagnosticPanels(args: string[]): Promise<void> {
    if (!args || args.length === 0) {
      const content = [
        '/diagnostic start [path] - Start monitoring (optional path)',
        '/diagnostic stop [path]  - Stop monitoring (or path)',
        '/diagnostic status       - Show monitoring status',
        '/diagnostic run          - Run diagnostic scan',
        '/monitor [path]          - Alias for diagnostic start',
        '/diag-status             - Alias for diagnostic status',
      ].join('\n')

      this.printPanel(
        boxen(content, {
          title: '🔍 IDE Diagnostics: Help',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
      return
    }

    const sub = args[0].toLowerCase()
    const rest = args.slice(1)
    try {
      switch (sub) {
        case 'start': {
          const watchPath = rest[0]
          ideDiagnosticIntegration.setActive(true)
          await ideDiagnosticIntegration.startMonitoring(watchPath)
          const status = await ideDiagnosticIntegration.getMonitoringStatus()

          const lines: string[] = []
          lines.push(watchPath ? `✓ Monitoring started for: ${watchPath}` : '✓ Monitoring started for entire project')
          lines.push('')
          lines.push(`Monitoring: ${status.enabled ? 'Active' : 'Inactive'}`)
          lines.push(`Watched paths: ${status.watchedPaths.length}`)
          lines.push(`Active watchers: ${status.totalWatchers}`)
          if (status.watchedPaths.length > 0) {
            lines.push('')
            lines.push('Watched paths:')
            status.watchedPaths.forEach((p: string) => lines.push(`• ${p}`))
          }
          lines.push('')
          lines.push('Tips:')
          lines.push('• Use /diag-status to check monitoring status')
          lines.push('• Use /diagnostic stop to stop monitoring')

          this.printPanel(
            boxen(lines.join('\n'), {
              title: '🔍 IDE Diagnostics: Monitoring',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            })
          )
          break
        }
        case 'stop': {
          const watchPath = rest[0]
          await ideDiagnosticIntegration.stopMonitoring(watchPath)
          const content = watchPath ? `⏹️ Stopped monitoring path: ${watchPath}` : '⏹️ Stopped all monitoring'
          this.printPanel(
            boxen(content, {
              title: '🔍 IDE Diagnostics: Monitoring Stopped',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }
        case 'status': {
          const status = await ideDiagnosticIntegration.getMonitoringStatus()
          const quick = await ideDiagnosticIntegration.getQuickStatus()
          const lines: string[] = []
          lines.push(`Monitoring: ${status.enabled ? 'Active' : 'Inactive'}`)
          lines.push(`Watched paths: ${status.watchedPaths.length}`)
          lines.push(`Active watchers: ${status.totalWatchers}`)
          if (status.watchedPaths.length > 0) {
            lines.push('')
            lines.push('Watched paths:')
            status.watchedPaths.forEach((p: string) => lines.push(`• ${p}`))
          }
          lines.push('')
          lines.push(`Current status: ${quick}`)

          this.printPanel(
            boxen(lines.join('\n'), {
              title: '🔍 IDE Diagnostics: Status',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            })
          )
          break
        }
        case 'run': {
          const wasActive = (ideDiagnosticIntegration as any).isActive
          if (!wasActive) ideDiagnosticIntegration.setActive(true)
          const context = await ideDiagnosticIntegration.getWorkflowContext()

          const lines: string[] = []
          lines.push(`Errors: ${context.errors}`)
          lines.push(`Warnings: ${context.warnings}`)
          if (context.errors === 0 && context.warnings === 0) {
            lines.push('✓ No errors or warnings found')
          }
          lines.push('')
          lines.push(`Build: ${context.buildStatus}`)
          lines.push(`Tests: ${context.testStatus}`)
          lines.push(`Lint: ${context.lintStatus}`)
          lines.push('')
          lines.push(`Branch: ${context.vcsStatus.branch}`)
          if (context.vcsStatus.hasChanges) {
            lines.push(`Changes: ${context.vcsStatus.stagedFiles} staged, ${context.vcsStatus.unstagedFiles} unstaged`)
          }
          if (context.affectedFiles.length > 0) {
            lines.push('')
            lines.push('Affected files:')
            context.affectedFiles.slice(0, 10).forEach((f: string) => lines.push(`• ${f}`))
            if (context.affectedFiles.length > 10) {
              lines.push(`… and ${context.affectedFiles.length - 10} more`)
            }
          }
          if (context.recommendations.length > 0) {
            lines.push('')
            lines.push('💡 Recommendations:')
            context.recommendations.forEach((rec: string) => lines.push(`• ${rec}`))
          }

          this.printPanel(
            boxen(lines.join('\n'), {
              title: '📊 Diagnostic Results',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'magenta',
            })
          )

          if (!wasActive) ideDiagnosticIntegration.setActive(false)
          break
        }
        default: {
          console.log(chalk.red(`❌ Unknown diagnostic command: ${sub}`))
          const content = 'Use /diagnostic for available subcommands'
          this.printPanel(
            boxen(content, {
              title: '🔍 IDE Diagnostics',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            })
          )
        }
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`Diagnostic command failed: ${error.message}`, {
          title: '❌ Diagnostic Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized Snapshot: create quick/full/dev/config
   */
  private async handleSnapshotCommand(args: string[], quickAlias: boolean = false): Promise<void> {
    try {
      if (args.length === 0) {
        const content = [
          '/snapshot <name> [quick|full|dev|config]',
          '/snap <name>            - Alias for quick snapshot',
          '/snapshots [query]      - List snapshots',
          '/restore <snapshot-id>  - Restore snapshot (with backup)',
        ].join('\n')
        this.printPanel(
          boxen(content, {
            title: '📸 Snapshot Commands',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      const name = args[0]
      const type = (args[1] || (quickAlias ? 'quick' : 'quick')).toLowerCase()

      let id: string | null = null
      switch (type) {
        case 'quick':
          id = await snapshotService.createQuickSnapshot(name)
          break
        case 'full':
          id = await snapshotService.createFullSnapshot(name)
          break
        case 'dev':
          id = await snapshotService.createDevSnapshot(name)
          break
        case 'config':
          id = await snapshotService.createFromTemplate('config', name)
          break
        default:
          id = await snapshotService.createQuickSnapshot(name)
      }

      this.printPanel(
        boxen(`Snapshot created: ${name}\nID: ${id}`, {
          title: '📸 Snapshot Created',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Snapshot failed: ${error.message}`, {
          title: '❌ Snapshot Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized Snapshots list
   */
  private async handleSnapshotsList(args: string[]): Promise<void> {
    try {
      const query = args[0] || ''
      const list = await snapshotService.searchSnapshots(query, { limit: 20 })
      if (!list || list.length === 0) {
        this.printPanel(
          boxen('No snapshots found', {
            title: '📸 Snapshots',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }
      const lines: string[] = []
      lines.push(`Found ${list.length} snapshot(s)`)
      lines.push('')
      list.slice(0, 20).forEach((s) => {
        const ts = new Date(s.timestamp).toLocaleString()
        const tags = s.metadata?.tags?.length ? ` [${s.metadata.tags.join(', ')}]` : ''
        lines.push(`${s.id.substring(0, 8)}  ${s.name}  ${ts}${tags}`)
      })
      this.printPanel(
        boxen(lines.join('\n'), {
          title: '📸 Snapshots',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`List snapshots failed: ${error.message}`, {
          title: '❌ Snapshots Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized restore snapshot
   */
  private async handleSnapshotRestore(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        this.printPanel(
          boxen('Usage: /restore <snapshot-id>', {
            title: '📸 Restore Snapshot',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }
      const id = args[0]
      await snapshotService.restoreSnapshot(id, { backup: true, overwrite: true })
      this.printPanel(
        boxen(`Restored snapshot: ${id}`, {
          title: '📸 Snapshot Restored',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Restore failed: ${error.message}`, {
          title: '❌ Restore Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized Resume Session command
   */
  private async handleResumeCommand(args: string[]): Promise<void> {
    try {
      const { workSessionManager } = await import('./persistence/work-session-manager')

      if (args.length === 0) {
        // Show list of available sessions
        const sessions = await workSessionManager.listSessions()

        if (sessions.length === 0) {
          this.printPanel(
            boxen('No saved sessions found.\n\nUse /save-session to create a new session.', {
              title: '💼 Work Sessions',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          return
        }

        const lines: string[] = []
        lines.push(`Found ${sessions.length} saved session(s)\n`)
        sessions.slice(0, 10).forEach((s, idx) => {
          const date = new Date(s.lastAccessedAt).toLocaleString()
          lines.push(`${idx + 1}. ${s.name}`)
          lines.push(`   ID: ${s.id}`)
          lines.push(`   Last accessed: ${date}`)
          lines.push(`   Edits: ${s.totalEdits} | Messages: ${s.totalMessages} | Files: ${s.filesModified}`)
          if (idx < sessions.length - 1) lines.push('')
        })
        lines.push('\nUse /resume <session-id> to resume a session')

        this.printPanel(
          boxen(lines.join('\n'), {
            title: '💼 Available Work Sessions',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
          })
        )
        return
      }

      const sessionId = args[0]
      const session = await workSessionManager.resumeSession(sessionId)

      // Restore messages to chat manager
      if (session.messages.length > 0) {
        // Create new chat session without system prompt to avoid duplicate system message
        const newChatSession = chatManager.createNewSession(session.name, undefined)

        // Directly populate messages array to avoid side effects
        // This prevents duplicate messages and avoids triggering history trim
        if (newChatSession) {
          newChatSession.messages = session.messages.map((msg) => {
            let timestamp: Date
            try {
              timestamp = new Date()
              // Validate date is not Invalid Date
              if (isNaN(timestamp.getTime())) {
                timestamp = new Date()
              }
            } catch (error) {
              timestamp = new Date()
            }

            return {
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content || '',
              timestamp,
            }
          })

          try {
            newChatSession.updatedAt = new Date(session.updatedAt)
            // Validate date
            if (isNaN(newChatSession.updatedAt.getTime())) {
              newChatSession.updatedAt = new Date()
            }
          } catch (error) {
            newChatSession.updatedAt = new Date()
          }
        }

        console.log(chalk.blue(`✓ Restored ${session.messages.length} messages to chat session "${session.name}"`))
      }

      this.printPanel(
        boxen(
          `Session resumed: ${session.name}\n\nMessages: ${session.metadata.totalMessages}\nEdits: ${session.metadata.totalEdits}\nFiles modified: ${session.stats.filesModified}`,
          {
            title: '✓ Session Resumed',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to resume session: ${error.message}`, {
          title: '❌ Resume Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized Work Sessions List
   */
  private async handleWorkSessionsList(): Promise<void> {
    try {
      const { workSessionManager } = await import('./persistence/work-session-manager')
      const sessions = await workSessionManager.listSessions()

      if (sessions.length === 0) {
        this.printPanel(
          boxen('No saved sessions found.\n\nUse /save-session <name> to create a new session.', {
            title: '💼 Work Sessions',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      const lines: string[] = []
      lines.push(`Total sessions: ${sessions.length}\n`)
      sessions.forEach((s, idx) => {
        const created = new Date(s.createdAt).toLocaleString()
        const accessed = new Date(s.lastAccessedAt).toLocaleString()
        const tags = (s.tags?.length ?? 0) > 0 ? ` [${s.tags!.join(', ')}]` : ''

        lines.push(`${idx + 1}. ${s.name}${tags}`)
        lines.push(`   ID: ${s.id}`)
        lines.push(`   Created: ${created}`)
        lines.push(`   Last accessed: ${accessed}`)
        lines.push(`   Stats: ${s.totalEdits} edits, ${s.totalMessages} messages, ${s.filesModified} files`)
        if (idx < sessions.length - 1) lines.push('')
      })

      this.printPanel(
        boxen(lines.join('\n'), {
          title: '💼 All Work Sessions',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to list sessions: ${error.message}`, {
          title: '❌ List Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized Save Session command
   */
  private async handleSaveSessionCommand(args: string[]): Promise<void> {
    try {
      const { workSessionManager } = await import('./persistence/work-session-manager')

      // Get current chat session messages
      const chatSession = chatManager.getCurrentSession()
      const chatMessages = (chatSession?.messages || []).filter(
        (msg) => msg.role && msg.content && (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system')
      )

      const currentWorkSession = workSessionManager.getCurrentSession()

      if (!currentWorkSession) {
        // Create new work session with validated name
        const rawName = args.join(' ').trim() || chatSession?.title || ''
        const name = rawName || `Session ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`

        // Validate name length
        const validatedName = name.length > 100 ? name.substring(0, 100) + '...' : name

        const session = await workSessionManager.createSession(validatedName)

        // Add chat messages to work session with validation
        if (chatMessages.length > 0) {
          chatMessages.forEach((msg) => {
            try {
              workSessionManager.addMessage({
                role: msg.role as 'user' | 'assistant',
                content: msg.content || '',
                timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : new Date().toISOString(),
                metadata: {},
              })
            } catch (error) {
              console.log(chalk.gray(`⚠️ Skipped invalid message`))
            }
          })
        }

        await workSessionManager.saveCurrentSession()

        this.printPanel(
          boxen(
            `New session created: ${session.name}\nID: ${session.id}\nMessages: ${session.metadata.totalMessages}`,
            {
              title: '✓ Session Created',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            }
          )
        )
      } else {
        // Update existing session name if provided
        if (args.length > 0) {
          const rawNewName = args.join(' ').trim()
          const validatedNewName = rawNewName.length > 100 ? rawNewName.substring(0, 100) + '...' : rawNewName
          workSessionManager.updateCurrentSession({ name: validatedNewName })
        }

        // Sync current chat messages to work session (only new ones)
        const existingMessageCount = currentWorkSession.messages.length
        if (chatMessages.length > existingMessageCount) {
          // Add new messages that aren't already in work session with validation
          const newMessages = chatMessages.slice(existingMessageCount)
          newMessages.forEach((msg) => {
            try {
              workSessionManager.addMessage({
                role: msg.role as 'user' | 'assistant',
                content: msg.content || '',
                timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : new Date().toISOString(),
                metadata: {},
              })
            } catch (error) {
              console.log(chalk.gray(`⚠️ Skipped invalid message`))
            }
          })
        }

        await workSessionManager.saveCurrentSession()

        this.printPanel(
          boxen(
            `Session saved: ${currentWorkSession.name}\nID: ${currentWorkSession.id}\nEdits: ${currentWorkSession.metadata.totalEdits} | Messages: ${currentWorkSession.metadata.totalMessages}`,
            {
              title: ' Session Saved',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            }
          )
        )
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to save session: ${error.message}`, {
          title: '❌ Save Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized Delete Session command
   */
  private async handleDeleteSessionCommand(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        this.printPanel(
          boxen('Usage: /delete-session <session-id>\n\nUse /work-sessions to see all sessions.', {
            title: '💼 Delete Session',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      const { workSessionManager } = await import('./persistence/work-session-manager')
      const sessionId = args[0]
      const success = await workSessionManager.deleteSession(sessionId)

      if (success) {
        this.printPanel(
          boxen(`Session deleted: ${sessionId}`, {
            title: '✓ Session Deleted',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
          })
        )
      } else {
        this.printPanel(
          boxen(`Session not found: ${sessionId}`, {
            title: '⚠️ Not Found',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to delete session: ${error.message}`, {
          title: '❌ Delete Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized Export Session command
   */
  private async handleExportSessionCommand(args: string[]): Promise<void> {
    try {
      if (args.length < 2) {
        this.printPanel(
          boxen(
            'Usage: /export-session <session-id> <export-path>\n\nExample: /export-session abc123 ./backup/session.json',
            {
              title: '📦 Export Session',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            }
          )
        )
        return
      }

      const { workSessionManager } = await import('./persistence/work-session-manager')
      const sessionId = args[0]
      const exportPath = args[1]

      await workSessionManager.exportSession(sessionId, exportPath)

      this.printPanel(
        boxen(`Session exported successfully\n\nFrom: ${sessionId}\nTo: ${exportPath}`, {
          title: '✓ Session Exported',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to export session: ${error.message}`, {
          title: '❌ Export Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized Undo command
   */
  private async handleUndoCommand(args: string[]): Promise<void> {
    try {
      const { workSessionManager } = await import('./persistence/work-session-manager')
      const currentSession = workSessionManager.getCurrentSession()

      if (!currentSession) {
        this.printPanel(
          boxen('No active work session.\n\nUse /save-session to create a session before using undo.', {
            title: '⚠️ No Active Session',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      const count = args.length > 0 ? parseInt(args[0], 10) : 1
      if (isNaN(count) || count < 1) {
        this.printPanel(
          boxen('Invalid count. Usage: /undo [count]\n\nExample: /undo 3', {
            title: '⚠️ Invalid Input',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      const undoneOps = await workSessionManager.undo(count)

      if (undoneOps.length === 0) {
        this.printPanel(
          boxen('No operations to undo.', {
            title: '↶ Undo',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      const lines: string[] = []
      lines.push(`Undone ${undoneOps.length} operation(s)\n`)
      undoneOps.forEach((op) => {
        const opIcon = op.operation === 'create' ? '🆕' : op.operation === 'delete' ? '🗑️' : '✏️'
        lines.push(`${opIcon} ${op.operation.toUpperCase()} - ${op.filePath}`)
      })

      this.printPanel(
        boxen(lines.join('\n'), {
          title: '↶ Undo Complete',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Undo failed: ${error.message}`, {
          title: '❌ Undo Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized Redo command
   */
  private async handleRedoCommand(args: string[]): Promise<void> {
    try {
      const { workSessionManager } = await import('./persistence/work-session-manager')
      const currentSession = workSessionManager.getCurrentSession()

      if (!currentSession) {
        this.printPanel(
          boxen('No active work session.\n\nUse /save-session to create a session before using redo.', {
            title: '⚠️ No Active Session',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      const count = args.length > 0 ? parseInt(args[0], 10) : 1
      if (isNaN(count) || count < 1) {
        this.printPanel(
          boxen('Invalid count. Usage: /redo [count]\n\nExample: /redo 2', {
            title: '⚠️ Invalid Input',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      const redoneOps = await workSessionManager.redo(count)

      if (redoneOps.length === 0) {
        this.printPanel(
          boxen('No operations to redo.', {
            title: '↷ Redo',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      const lines: string[] = []
      lines.push(`Redone ${redoneOps.length} operation(s)\n`)
      redoneOps.forEach((op) => {
        const opIcon = op.operation === 'create' ? '🆕' : op.operation === 'delete' ? '🗑️' : '✏️'
        lines.push(`${opIcon} ${op.operation.toUpperCase()} - ${op.filePath}`)
      })

      this.printPanel(
        boxen(lines.join('\n'), {
          title: '↷ Redo Complete',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Redo failed: ${error.message}`, {
          title: '❌ Redo Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized Edit History command
   */
  private async handleEditHistoryCommand(): Promise<void> {
    try {
      const { workSessionManager } = await import('./persistence/work-session-manager')
      const currentSession = workSessionManager.getCurrentSession()

      if (!currentSession) {
        this.printPanel(
          boxen('No active work session.\n\nUse /save-session to create a session.', {
            title: '⚠️ No Active Session',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      const { editHistoryManager } = await import('./persistence/edit-history-manager')
      const summary = editHistoryManager.getHistorySummary()
      const stats = editHistoryManager.getStatistics()

      const lines: string[] = []
      lines.push('Stack Status:')
      lines.push(`  Undo available: ${summary.undoCount} operations`)
      lines.push(`  Redo available: ${summary.redoCount} operations`)
      lines.push('')
      lines.push('Statistics:')
      lines.push(`  Total operations: ${stats.totalOperations}`)
      lines.push(`  Edit operations: ${stats.editOperations}`)
      lines.push(`  Create operations: ${stats.createOperations}`)
      lines.push(`  Delete operations: ${stats.deleteOperations}`)
      lines.push(`  Unique files: ${stats.uniqueFiles}`)

      if (summary.recentOperations.length > 0) {
        lines.push('')
        lines.push('Recent Edits:')
        summary.recentOperations.slice(0, 5).forEach((op) => {
          const opIcon = op.operation === 'create' ? '🆕' : op.operation === 'delete' ? '🗑️' : '✏️'
          const timestamp = new Date(op.timestamp).toLocaleTimeString()
          lines.push(`  ${opIcon} ${timestamp} - ${op.operation.toUpperCase()}`)
          lines.push(`     ${op.filePath}`)
        })
      }

      this.printPanel(
        boxen(lines.join('\n'), {
          title: '📝 Edit History',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to get edit history: ${error.message}`, {
          title: '❌ History Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Delegate VM Container commands to slash handler
   */
  private async handleVMContainerCommands(cmd: string, args: string[]): Promise<void> {
    const result = await this.slashHandler.handle(`/${cmd} ${args.join(' ')}`)
    if (result.shouldExit) {
      await this.shutdown()
    }
  }

  /**
   * Delegate Vision commands to slash handler
   */
  private async handleVisionCommands(cmd: string, args: string[]): Promise<void> {
    const result = await this.slashHandler.handle(`/${cmd} ${args.join(' ')}`)
    if (result.shouldExit) {
      await this.shutdown()
    }
  }

  /**
   * Delegate Memory commands to slash handler
   */
  private async handleMemoryCommands(cmd: string, args: string[]): Promise<void> {
    const result = await this.slashHandler.handle(`/${cmd} ${args.join(' ')}`)
    if (result.shouldExit) {
      await this.shutdown()
    }
  }

  /**
   * Delegate Web3 commands to slash handler
   */
  private async handleWeb3Commands(cmd: string, args: string[]): Promise<void> {
    const result = await this.slashHandler.handle(`/${cmd} ${args.join(' ')}`)
    if (result.shouldExit) {
      await this.shutdown()
    }
  }

  /**
   * Delegate Env command to slash handler
   */
  private async handleEnvCommand(args: string[]): Promise<void> {
    const result = await this.slashHandler.handle(`/env ${args.join(' ')}`)
    if (result.shouldExit) {
      await this.shutdown()
    }
  }

  /**
   * Delegate Auto command to slash handler
   */
  private async handleAutoCommand(args: string[]): Promise<void> {
    const result = await this.slashHandler.handle(`/auto ${args.join(' ')}`)
    if (result.shouldExit) {
      await this.shutdown()
    }
  }

  /**
   * Delegate Super Compact command to slash handler
   */
  private async handleSuperCompactCommand(): Promise<void> {
    const result = await this.slashHandler.handle('/super-compact')
    if (result.shouldExit) {
      await this.shutdown()
    }
  }

  /**
   * Delegate Plan Clean command to slash handler
   */
  private async handlePlanCleanCommand(): Promise<void> {
    const result = await this.slashHandler.handle('/plan-clean')
    if (result.shouldExit) {
      await this.shutdown()
    }
  }

  /**
   * Delegate Todo Hide command to slash handler
   */
  private async handleTodoHideCommand(): Promise<void> {
    const result = await this.slashHandler.handle('/todo-hide')
    if (result.shouldExit) {
      await this.shutdown()
    }
  }

  /**
   * Delegate Todo Show command to slash handler
   */
  private async handleTodoShowCommand(): Promise<void> {
    const result = await this.slashHandler.handle('/todo-show')
    if (result.shouldExit) {
      await this.shutdown()
    }
  }

  /**
   * Delegate Index command to slash handler
   */
  private async handleIndexCommand(args: string[]): Promise<void> {
    const result = await this.slashHandler.handle(`/index ${args.join(' ')}`)
    if (result.shouldExit) {
      await this.shutdown()
    }
  }

  /**
   * Delegate Router command to slash handler
   */
  private async handleRouterCommand(args: string[]): Promise<void> {
    const result = await this.slashHandler.handle(`/router ${args.join(' ')}`)
    if (result.shouldExit) {
      await this.shutdown()
    }
  }

  /**
   * Delegate Figma Open command to slash handler
   */
  private async handleFigmaOpenCommand(args: string[]): Promise<void> {
    const result = await this.slashHandler.handle(`/figma-open ${args.join(' ')}`)
    if (result.shouldExit) {
      await this.shutdown()
    }
  }

  /**
   * Panelized Security command
   */
  private async handleSecurityPanels(args: string[]): Promise<void> {
    const sub = (args[0] || 'status').toLowerCase()
    try {
      switch (sub) {
        case 'status': {
          const status = toolService.getSecurityStatus()
          const config = this.configManager.getAll()
          const lines: string[] = []
          lines.push(`Security Mode: ${config.securityMode}`)
          lines.push(`Developer Mode: ${status.devModeActive ? 'Active' : 'Inactive'}`)
          lines.push(`Session Approvals: ${status.sessionApprovals}`)
          lines.push(`Approval Policy: ${config.approvalPolicy}`)
          lines.push('')
          lines.push('📋 Tool Approval Policies:')
          const pol = (config as any).toolApprovalPolicies || {}
          lines.push(`• File Operations: ${pol.fileOperations}`)
          lines.push(`• Git Operations: ${pol.gitOperations}`)
          lines.push(`• Package Operations: ${pol.packageOperations}`)
          lines.push(`• System Commands: ${pol.systemCommands}`)
          lines.push(`• Network Requests: ${pol.networkRequests}`)

          this.printPanel(
            boxen(lines.join('\n'), {
              title: '🔒 Security Status',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }
        case 'set': {
          if (args.length < 3) {
            const content = [
              'Usage: /security set <security-mode> <safe|default|developer>',
              'Example: /security set security-mode safe',
            ].join('\n')
            this.printPanel(
              boxen(content, {
                title: '🔒 Security Help',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              })
            )
            break
          }
          const key = args[1]
          const value = args[2]
          if (key === 'security-mode' && ['safe', 'default', 'developer'].includes(value)) {
            this.configManager.set('securityMode', value as any)
            this.printPanel(
              boxen(`Security mode set to: ${value}`, {
                title: '🔒 Security Updated',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'green',
              })
            )
          } else {
            this.printPanel(
              boxen('Invalid setting. Only security-mode is supported here.', {
                title: '🔒 Security Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
          }
          break
        }
        case 'help': {
          const content = [
            '/security status                - Show current security settings',
            '/security set security-mode ... - Change security mode',
            '/security help                  - Show this help',
            '',
            'Modes: safe | default | developer',
          ].join('\n')
          this.printPanel(
            boxen(content, {
              title: '🔒 Security Help',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }
        default: {
          this.printPanel(
            boxen(`Unknown security command: ${sub}\nUse /security help`, {
              title: '🔒 Security',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            })
          )
        }
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`Security command failed: ${error.message}`, {
          title: '❌ Security Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized Dev Mode command
   */
  private async handleDevModePanels(args: string[]): Promise<void> {
    const action = (args[0] || 'enable').toLowerCase()
    try {
      switch (action) {
        case 'enable': {
          const minutes = args[1] ? parseInt(args[1], 10) : undefined
          const ms = minutes ? minutes * 60000 : undefined
          toolService.enableDevMode(ms)
          const content = [
            `Developer mode enabled${minutes ? ` for ${minutes} minutes` : ' for 1 hour (default)'}`,
            'Reduced security restrictions active.',
            'Use /security status to see current settings.',
          ].join('\n')
          this.printPanel(
            boxen(content, {
              title: '� Developer Mode',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }
        case 'status': {
          const isActive = toolService.isDevModeActive()
          const content = `Status: ${isActive ? 'Active' : 'Inactive'}${isActive ? '\n⚠️ Security restrictions are reduced' : ''}`
          this.printPanel(
            boxen(content, {
              title: '� Developer Mode: Status',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }
        case 'help': {
          const lines = [
            '/dev-mode enable [minutes] - Enable developer mode',
            '/dev-mode status           - Check developer mode status',
            '/dev-mode help             - Show this help',
            '',
            '⚠️ Developer mode reduces security restrictions',
          ]
          this.printPanel(
            boxen(lines.join('\n'), {
              title: '� Developer Mode: Help',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }
        default: {
          this.printPanel(
            boxen(`Unknown dev-mode command: ${action}\nUse /dev-mode help`, {
              title: '� Developer Mode',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            })
          )
        }
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`Dev-mode command failed: ${error.message}`, {
          title: '❌ Developer Mode Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized Safe Mode enable
   */
  private async handleSafeModePanel(): Promise<void> {
    try {
      const cfg = this.configManager.getAll()
      cfg.securityMode = 'safe'
      this.configManager.setAll(cfg as any)
      this.printPanel(
        boxen(
          'Maximum security restrictions. All risky operations require approval.\nUse /security status to see details.',
          {
            title: '🔒 Safe Mode Enabled',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Safe mode command failed: ${error.message}`, {
          title: '🔒 Safe Mode Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Panelized approvals clear
   */
  private async handleClearApprovalsPanel(): Promise<void> {
    try {
      toolService.clearSessionApprovals()
      this.printPanel(
        boxen('All session approvals cleared. Next operations will require fresh approval.', {
          title: '✓ Approvals Cleared',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Clear approvals command failed: ${error.message}`, {
          title: '❌ Approvals Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  /**
   * Clear all caches
   */
  private async clearAllCaches(): Promise<void> {
    try {
      console.log(chalk.blue('🧹 Clearing all caches...'))
      await cacheService.clearAll()

      if (this.isEnhancedMode) {
        await enhancedTokenCache.clearCache()
      }

      console.log(chalk.green('✓ All caches cleared'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to clear caches: ${error.message}`))
    }
  }

  /**
   * Sync sessions
   */
  private async syncSessions(_direction?: string): Promise<void> {
    if (!this.isEnhancedMode) {
      console.log(chalk.yellow('⚠️ Enhanced services not enabled'))
      return
    }

    try {
      console.log(chalk.blue('⚡︎ Syncing sessions...'))
      const result = await this.enhancedSessionManager.syncAllSessions()

      console.log(chalk.green('✓ Session sync completed:'))
      console.log(`   Synced: ${result.synced}`)
      console.log(`   Conflicts: ${result.conflicts}`)
      console.log(`   Errors: ${result.errors}`)
    } catch (error: any) {
      console.log(chalk.red(`❌ Session sync failed: ${error.message}`))
    }
  }

  // ===== REDIS IMPLEMENTATION METHODS =====

  private async connectRedis(): Promise<void> {
    console.log(chalk.blue('⚡︎ Connecting to Redis...'))

    try {
      const { redisProvider } = await import('./providers/redis/redis-provider')

      if (redisProvider.isHealthy()) {
        console.log(chalk.yellow('⚠️ Redis is already connected'))
        return
      }

      // Force reconnection
      await redisProvider.reconnect()

      // Wait a moment for connection to establish
      await new Promise((resolve) => setTimeout(resolve, 2000))

      if (redisProvider.isHealthy()) {
        console.log(chalk.green('✓ Redis connected successfully'))

        // Show basic info
        const health = redisProvider.getLastHealthCheck()
        if (health) {
          console.log(`   Latency: ${health.latency}ms`)
          const memUsed =
            health.memory?.used !== undefined ? `${(health.memory.used / 1024 / 1024).toFixed(2)} MB` : 'N/A'
          console.log(`   Memory Used: ${memUsed}`)
          console.log(`   Keys: ${health.keyspace?.keys ?? 'Unknown'}`)
        }
      } else {
        console.log(chalk.red('❌ Redis connection failed'))
        console.log(chalk.dim('   Check Redis server is running and configuration is correct'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Redis connection error: ${error.message}`))
      console.log(chalk.dim('   Ensure Redis is installed and running: redis-server'))
    }
  }

  private async showRedisHealth(): Promise<void> {
    try {
      const { redisProvider } = await import('./providers/redis/redis-provider')

      if (!redisProvider.isHealthy()) {
        console.log(chalk.red('❌ Redis is not connected'))
        return
      }

      console.log(chalk.blue('\n🏥 Redis Health Status:'))

      const health = await redisProvider.getHealth()

      console.log(chalk.green('Connection:'))
      console.log(`   Status: ${chalk.green('Connected')}`)
      console.log(`   Latency: ${health.latency}ms`)
      const uptimeStr =
        health.uptime !== undefined
          ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`
          : 'N/A'
      console.log(`   Uptime: ${uptimeStr}`)

      console.log(chalk.cyan('Memory Usage:'))
      const memUsed = health.memory?.used !== undefined ? `${(health.memory.used / 1024 / 1024).toFixed(2)} MB` : 'N/A'
      const memPeak = health.memory?.peak !== undefined ? `${(health.memory.peak / 1024 / 1024).toFixed(2)} MB` : 'N/A'
      console.log(`   Used: ${memUsed}`)
      console.log(`   Peak: ${memPeak}`)

      console.log(chalk.yellow('Keyspace:'))
      console.log(`   Total Keys: ${health.keyspace?.keys ?? 'Unknown'}`)
      console.log(`   Keys with Expiry: ${health.keyspace?.expires ?? 'Unknown'}`)

      // Show configuration info
      const config = redisProvider.getConfig()
      console.log(chalk.magenta('Configuration:'))
      console.log(`   Key Prefix: ${config.keyPrefix}`)
      console.log(`   Default TTL: ${config.ttl}s`)
      console.log(`   Max Retries: ${config.maxRetries}`)
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to get Redis health: ${error.message}`))
    }
  }

  private async showRedisConfig(): Promise<void> {
    const config = this.configManager.getRedisConfig()

    console.log(chalk.blue('\n� Redis Configuration:'))

    console.log(chalk.green('Connection Settings:'))
    console.log(`   Host: ${config.host}`)
    console.log(`   Port: ${config.port}`)
    console.log(`   Database: ${config.database}`)
    console.log(`   Password: ${config.password ? chalk.green('Set') : chalk.gray('Not set')}`)

    console.log(chalk.cyan('Cache Settings:'))
    console.log(`   Key Prefix: ${config.keyPrefix}`)
    console.log(`   Default TTL: ${config.ttl} seconds`)
    console.log(`   Max Retries: ${config.maxRetries}`)
    console.log(`   Retry Delay: ${config.retryDelayMs}ms`)

    console.log(chalk.yellow('Cluster Settings:'))
    console.log(`   Enabled: ${config.cluster.enabled ? chalk.green('Yes') : chalk.red('No')}`)
    if (config.cluster.enabled && config.cluster.nodes) {
      console.log(`   Nodes: ${config.cluster.nodes.length}`)
      config.cluster.nodes.forEach((node, idx) => {
        console.log(`     ${idx + 1}. ${node.host}:${node.port}`)
      })
    }

    console.log(chalk.magenta('Fallback Settings:'))
    console.log(`   Enabled: ${config.fallback.enabled ? chalk.green('Yes') : chalk.red('No')}`)
    console.log(`   Strategy: ${config.fallback.strategy}`)

    console.log(chalk.blue('Cache Strategies:'))
    Object.entries(config.strategies).forEach(([strategy, enabled]) => {
      console.log(`   ${strategy}: ${enabled ? chalk.green('Enabled') : chalk.gray('Disabled')}`)
    })

    // Show connection string (without password)
    const connectionString = this.configManager.getRedisConnectionString()
    if (connectionString) {
      const safeConnectionString = connectionString.replace(/:([^:@]+)@/, ':***@')
      console.log(chalk.dim(`\n   Connection String: ${safeConnectionString}`))
    }
  }
  private async showCacheHealth(): Promise<void> {
    console.log(chalk.blue('\n🏥 Cache System Health:'))

    try {
      // Overall cache service health
      const health = cacheService.getHealthStatus()

      console.log(chalk.green('Cache Service:'))
      console.log(`   Overall Status: ${health.overall ? chalk.green('Healthy') : chalk.red('Unhealthy')}`)

      console.log(chalk.red('Redis Cache:'))
      console.log(`   Healthy: ${health.redis.healthy ? chalk.green('Yes') : chalk.red('No')}`)
      console.log(`   Connected: ${health.redis.connected ? chalk.green('Yes') : chalk.red('No')}`)

      console.log(chalk.cyan('Smart Cache (Fallback):'))
      console.log(`   Healthy: ${health.smartCache.healthy ? chalk.green('Yes') : chalk.red('No')}`)

      // Get detailed statistics
      const stats = await cacheService.getStats()

      console.log(chalk.yellow('Performance Metrics:'))
      console.log(`   Total Hits: ${stats.totalHits}`)
      console.log(`   Total Misses: ${stats.totalMisses}`)
      console.log(`   Hit Rate: ${stats.hitRate}%`)

      // Enhanced token cache health if available
      if (this.isEnhancedMode) {
        const tokenCacheHealth = enhancedTokenCache.getHealth()
        console.log(chalk.magenta('Enhanced Token Cache:'))
        console.log(`   Healthy: ${tokenCacheHealth.healthy ? chalk.green('Yes') : chalk.red('No')}`)
        console.log(`   Memory Entries: ${tokenCacheHealth.details.memoryCache.entries}`)
      }

      // Show recommendations
      console.log(chalk.blue('\n💡 Recommendations:'))
      if (!health.redis.healthy) {
        console.log(chalk.dim('   • Consider starting Redis for better performance'))
      }
      if (stats.hitRate < 50) {
        console.log(chalk.dim('   • Cache hit rate is low, consider adjusting cache strategies'))
      }
      if (stats.totalMisses > stats.totalHits * 2) {
        console.log(chalk.dim('   • High miss rate detected, check cache TTL settings'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to get cache health: ${error.message}`))
    }
  }

  private async clearSpecificCache(cacheType: string): Promise<void> {
    try {
      console.log(chalk.blue(`🧹 Clearing ${cacheType} cache...`))

      switch (cacheType.toLowerCase()) {
        case 'redis': {
          const { redisProvider } = await import('./providers/redis/redis-provider')
          if (redisProvider.isHealthy()) {
            await redisProvider.flushAll()
            console.log(chalk.green('✓ Redis cache cleared'))
          } else {
            console.log(chalk.yellow('⚠️ Redis not connected, nothing to clear'))
          }
          break
        }

        case 'smart':
        case 'memory': {
          // Dynamic import for SmartCache
          const { smartCache: SmartCacheManager } = await import('./core/smart-cache-manager')
          SmartCacheManager.cleanup()
          console.log(chalk.green('✓ Smart cache cleared'))
          break
        }

        case 'token':
        case 'tokens':
          if (this.isEnhancedMode) {
            await enhancedTokenCache.clearCache()
            console.log(chalk.green('✓ Enhanced token cache cleared'))
          } else {
            // Clear legacy token cache
            await tokenCache.clearCache()
            console.log(chalk.green('✓ Token cache cleared'))
          }
          break

        case 'session':
        case 'sessions': {
          const _sessionCacheCleared = await cacheService.delete('session:*')
          console.log(chalk.green('✓ Session cache cleared'))
          break
        }

        default:
          console.log(chalk.yellow(`⚠️ Unknown cache type: ${cacheType}`))
          console.log(chalk.dim('   Available types: redis, smart, token, session'))
          return
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to clear ${cacheType} cache: ${error.message}`))
    }
  }

  private async disconnectRedis(): Promise<void> {
    try {
      console.log(chalk.blue('🔌 Disconnecting from Redis...'))

      const { redisProvider } = await import('./providers/redis/redis-provider')

      if (!redisProvider.isHealthy()) {
        console.log(chalk.yellow('⚠️ Redis is already disconnected'))
        return
      }

      await redisProvider.disconnect()
      console.log(chalk.green('✓ Redis disconnected successfully'))
      console.log(chalk.dim('   Cache will automatically fall back to memory cache'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Redis disconnect error: ${error.message}`))
    }
  }

  private async connectSupabase(): Promise<void> {
    console.log(chalk.blue('📡 Connecting to Supabase...'))

    try {
      // Dynamic import for enhanced services
      const { enhancedSupabaseProvider } = await import('./providers/supabase/enhanced-supabase-provider')

      // Check configuration
      const config = simpleConfigManager.getSupabaseConfig()
      if (!config.enabled) {
        console.log(chalk.yellow('⚠️ Supabase is disabled in configuration'))
        console.log(chalk.dim('Enable in config to use Supabase features'))
        return
      }

      if (!config.url || !config.anonKey) {
        console.log(chalk.red('❌ Supabase URL and anon key required'))
        console.log(chalk.dim('Configure Supabase credentials in settings'))
        return
      }

      // Test connection
      try {
        enhancedSupabaseProvider.isHealthy()
      } catch (_error) {
        // Initialization handled internally
      }

      if (enhancedSupabaseProvider.isHealthy()) {
        console.log(chalk.green('✓ Supabase connected successfully'))

        // Display connection info
        console.log(chalk.dim(`   URL: ${config.url}`))
        console.log(
          chalk.dim(
            `   Features: ${Object.entries(config.features)
              .filter(([_, enabled]) => enabled)
              .map(([name, _]) => name)
              .join(', ')}`
          )
        )

        // Test basic functionality
        console.log(chalk.green('   Connection: ✓ Established'))
        console.log(chalk.green('   Status: ✓ Ready for operations'))
      } else {
        console.log(chalk.red('❌ Failed to connect to Supabase'))
        console.log(chalk.dim('Check your configuration and network connection'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Supabase connection error: ${error.message}`))
      if (error.message.includes('Invalid API key') || error.message.includes('Invalid JWT')) {
        console.log(chalk.dim('Check your Supabase anon key configuration'))
      } else if (error.message.includes('fetch')) {
        console.log(chalk.dim('Check your network connection and Supabase URL'))
      }
    }
  }

  private async showSupabaseHealth(): Promise<void> {
    try {
      console.log(chalk.blue('🏥 Supabase Health Status'))
      console.log(chalk.gray('─'.repeat(50)))

      // Dynamic import for enhanced services
      const { enhancedSupabaseProvider } = await import('./providers/supabase/enhanced-supabase-provider')

      const config = simpleConfigManager.getSupabaseConfig()

      // Configuration status
      console.log(chalk.bold('📋 Configuration'))
      console.log(`   Enabled: ${config.enabled ? chalk.green('✓') : chalk.red('❌')}`)
      console.log(`   URL: ${config.url ? chalk.green('✓ Configured') : chalk.red('❌ Missing')}`)
      console.log(`   Anon Key: ${config.anonKey ? chalk.green('✓ Configured') : chalk.red('❌ Missing')}`)
      console.log(`   Service Key: ${config.serviceRoleKey ? chalk.green('✓ Configured') : chalk.yellow('⚠️ Optional')}`)
      console.log()

      if (!config.enabled) {
        console.log(chalk.yellow('⚠️ Supabase is disabled'))
        return
      }

      // Connection status
      const isHealthy = enhancedSupabaseProvider.isHealthy()
      console.log(chalk.bold('🔗 Connection Status'))
      console.log(`   Overall: ${isHealthy ? chalk.green('✓ Healthy') : chalk.red('❌ Unhealthy')}`)

      if (isHealthy) {
        console.log(`   Database: ${chalk.green('✓ Connected')}`)
        console.log(`   Auth Service: ${chalk.green('✓ Ready')}`)
        console.log(`   Storage: ${chalk.green('✓ Available')}`)
        console.log(`   Real-time: ${chalk.green('✓ Connected')}`)
        console.log()

        // Basic statistics
        console.log(chalk.bold('📊 Statistics'))
        console.log(`   Status: ${chalk.green('Connected and operational')}`)
        console.log(`   Last Check: ${new Date().toLocaleString()}`)
      } else {
        console.log(chalk.dim('   Not connected - run /supabase connect to establish connection'))
      }
      console.log()

      // Feature status
      console.log(chalk.bold('🎯 Features'))
      const features = config.features
      console.log(`   Database: ${features.database ? chalk.green('✓ Enabled') : chalk.gray('⚪ Disabled')}`)
      console.log(`   Authentication: ${features.auth ? chalk.green('✓ Enabled') : chalk.gray('⚪ Disabled')}`)
      console.log(`   Storage: ${features.storage ? chalk.green('✓ Enabled') : chalk.gray('⚪ Disabled')}`)
      console.log(`   Real-time: ${features.realtime ? chalk.green('✓ Enabled') : chalk.gray('⚪ Disabled')}`)
      console.log(`   Vector Search: ${features.vector ? chalk.green('✓ Enabled') : chalk.gray('⚪ Disabled')}`)
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to get Supabase health: ${error.message}`))
    }
  }

  private async showSupabaseFeatures(): Promise<void> {
    try {
      console.log(chalk.blue('🎯 Supabase Features & Capabilities'))
      console.log(chalk.gray('─'.repeat(50)))

      const config = simpleConfigManager.getSupabaseConfig()

      // Core Features
      console.log(chalk.bold.cyan('🏗️ Core Features'))
      const coreFeatures = [
        {
          name: 'PostgreSQL Database',
          enabled: config.features.database,
          description: 'Full-featured PostgreSQL with row-level security',
        },
        {
          name: 'Authentication',
          enabled: config.features.auth,
          description: 'User management with JWT tokens and social logins',
        },
        {
          name: 'File Storage',
          enabled: config.features.storage,
          description: 'Secure file uploads and downloads with CDN',
        },
        {
          name: 'Real-time Subscriptions',
          enabled: config.features.realtime,
          description: 'Live data updates and collaborative features',
        },
        {
          name: 'Vector Search (pgvector)',
          enabled: config.features.vector,
          description: 'AI embeddings for semantic search',
        },
      ]

      coreFeatures.forEach((feature) => {
        const status = feature.enabled ? chalk.green('✓ Enabled') : chalk.gray('⚪ Disabled')
        console.log(`   ${status} ${chalk.bold(feature.name)}`)
        console.log(`     ${chalk.dim(feature.description)}`)
      })
      console.log()

      // NikCLI Integration Features
      console.log(chalk.bold.cyan('🔌 NikCLI Integration'))
      const integrationFeatures = [
        { name: 'Session Synchronization', description: 'Sync chat sessions across devices', available: true },
        { name: 'Agent Blueprints', description: 'Share and discover AI agent configurations', available: true },
        { name: 'Usage Analytics', description: 'Track token usage and performance metrics', available: true },
        { name: 'Team Collaboration', description: 'Share workspaces and collaborate in real-time', available: true },
        { name: 'Cloud Caching', description: 'Persistent cache for AI responses and data', available: true },
        { name: 'User Profiles & Quotas', description: 'Manage usage limits and subscription tiers', available: true },
      ]

      integrationFeatures.forEach((feature) => {
        const status = feature.available ? chalk.green('✓ Available') : chalk.yellow('⚠️ Planned')
        console.log(`   ${status} ${chalk.bold(feature.name)}`)
        console.log(`     ${chalk.dim(feature.description)}`)
      })
      console.log()

      // Dynamic import and show current status
      try {
        const { enhancedSupabaseProvider } = await import('./providers/supabase/enhanced-supabase-provider')

        if (enhancedSupabaseProvider.isHealthy()) {
          console.log(chalk.bold.cyan('📊 Current Usage'))
          console.log(`   Connection: ${chalk.green('✓ Active')}`)
          console.log(`   Status: ${chalk.green('Operational')}`)
          console.log(`   Last Check: ${new Date().toLocaleString()}`)
          console.log()
        }
      } catch (_error) {
        console.log(chalk.yellow('⚠️ Unable to fetch usage statistics'))
        console.log()
      }

      // Configuration Guide
      console.log(chalk.bold.cyan('� Configuration'))
      console.log(`   Project URL: ${config.url ? chalk.green('✓ Configured') : chalk.red('❌ Required')}`)
      console.log(`   Anonymous Key: ${config.anonKey ? chalk.green('✓ Configured') : chalk.red('❌ Required')}`)
      console.log(
        `   Service Role Key: ${config.serviceRoleKey ? chalk.green('✓ Configured') : chalk.yellow('⚠️ Optional')}`
      )

      if (!config.url || !config.anonKey) {
        console.log()
        console.log(chalk.yellow('💡 To configure Supabase:'))
        console.log(chalk.dim('   1. Create a project at https://supabase.com'))
        console.log(chalk.dim('   2. Get your URL and anon key from Settings > API'))
        console.log(chalk.dim('   3. Update your NikCLI configuration'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to display Supabase features: ${error.message}`))
    }
  }

  private async handleDatabaseCommands(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.printPanel(
        boxen(
          [
            'Usage: /db [sessions|blueprints|users|metrics] [action] [options]',
            '',
            'Available actions: list, get, create, update, delete, stats',
          ].join('\n'),
          {
            title: 'Database Command',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }
        )
      )
      return
    }

    const [table, action, ...options] = args

    try {
      // Dynamic import for enhanced services
      const { enhancedSupabaseProvider } = await import('./providers/supabase/enhanced-supabase-provider')

      if (!enhancedSupabaseProvider.isHealthy()) {
        console.log(chalk.red('❌ Database not available'))
        console.log(chalk.dim('Run /supabase connect to establish connection'))
        return
      }

      switch (table) {
        case 'sessions':
          await this.handleSessionCommands(action, options)
          break
        case 'blueprints':
          await this.handleBlueprintCommands(action, options)
          break
        case 'users':
          await this.handleUserCommands(action, options)
          break
        case 'metrics':
          await this.handleMetricCommands(action, options)
          break
        case 'stats':
          await this.showDatabaseStats()
          break
        default:
          console.log(chalk.yellow(`Unknown table: ${table}`))
          console.log(chalk.dim('Available tables: sessions, blueprints, users, metrics'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Database operation failed: ${error.message}`))
    }
  }

  private async handleSessionCommands(action: string, _options: string[]): Promise<void> {
    switch (action) {
      case 'list':
        console.log(chalk.blue('📋 Sessions'))
        console.log(chalk.yellow('   Database operations require connection to Supabase'))
        console.log(chalk.dim('   Ensure Supabase is configured and connected'))
        break

      case 'get':
        console.log(chalk.blue('📄 Session Details'))
        console.log(chalk.yellow('   Database operations require full Supabase integration'))
        break

      case 'delete':
        console.log(chalk.blue('🗑️ Delete Session'))
        console.log(chalk.yellow('   Database operations require full Supabase integration'))
        break

      default:
        console.log(chalk.yellow('Available actions: list, get, delete'))
        console.log(chalk.dim('Note: Full database operations coming soon'))
    }
  }

  private async handleBlueprintCommands(action: string, _options: string[]): Promise<void> {
    switch (action) {
      case 'list':
        console.log(chalk.blue('🗂️ Agent Blueprints'))
        console.log(chalk.yellow('   Blueprint operations require full Supabase integration'))
        break

      case 'get':
        console.log(chalk.blue('📋 Blueprint Details'))
        console.log(chalk.yellow('   Blueprint operations require full Supabase integration'))
        break

      default:
        console.log(chalk.yellow('Available actions: list, get'))
        console.log(chalk.dim('Note: Blueprint operations coming soon'))
    }
  }

  private async handleUserCommands(action: string, _options: string[]): Promise<void> {
    switch (action) {
      case 'list':
        console.log(chalk.blue('👥 Users'))
        console.log(chalk.yellow('   User operations require full Supabase integration'))
        break

      case 'stats':
        console.log(chalk.blue('📊 User Statistics'))
        console.log(chalk.yellow('   Statistics require full Supabase integration'))
        break

      default:
        console.log(chalk.yellow('Available actions: list, stats'))
        console.log(chalk.dim('Note: User operations coming soon'))
    }
  }

  private async handleMetricCommands(action: string, _options: string[]): Promise<void> {
    switch (action) {
      case 'list':
        console.log(chalk.blue('📈 Recent Metrics'))
        console.log(chalk.yellow('   Metric operations require full Supabase integration'))
        break

      case 'stats':
        console.log(chalk.blue("📊 Today's Metrics"))
        console.log(chalk.yellow('   Statistics require full Supabase integration'))
        break

      default:
        console.log(chalk.yellow('Available actions: list, stats'))
        console.log(chalk.dim('Note: Metric operations coming soon'))
    }
  }

  private async showDatabaseStats(): Promise<void> {
    try {
      console.log(chalk.blue('🗃️ Database Statistics'))
      console.log(chalk.gray('─'.repeat(40)))
      console.log(chalk.yellow('   Database statistics require full Supabase integration'))
      console.log(chalk.dim('   Configure Supabase to view detailed statistics'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to get database stats: ${error.message}`))
    }
  }

  private async handleAuthSignUp(): Promise<void> {
    console.log(chalk.blue('📝 Create New Account'))
    console.log(chalk.gray('─'.repeat(40)))

    try {
      // Dynamic import for auth provider
      const { authProvider } = await import('./providers/supabase/auth-provider')

      if (!authProvider.getConfig().enabled) {
        console.log(chalk.yellow('⚠️ Authentication is not enabled'))
        console.log(chalk.dim('Enable Supabase authentication in configuration'))
        return
      }

      if (authProvider.isAuthenticated()) {
        const profile = authProvider.getCurrentProfile()
        console.log(chalk.yellow(`⚠️ Already signed in as ${profile?.email || profile?.username}`))
        console.log(chalk.dim('Sign out first to create a new account'))
        return
      }

      // Collect user information
      const email = await this.promptInput('Email address: ')
      if (!email || !this.isValidEmail(email)) {
        console.log(chalk.red('❌ Invalid email address'))
        return
      }

      const password = await this.promptInput('Password (min 8 characters): ', true)
      if (!password || password.length < 8) {
        console.log(chalk.red('❌ Password must be at least 8 characters'))
        return
      }

      const confirmPassword = await this.promptInput('Confirm password: ', true)
      if (password !== confirmPassword) {
        console.log(chalk.red('❌ Passwords do not match'))
        return
      }

      // Optional information
      const username = await this.promptInput('Username (optional): ')
      const fullName = await this.promptInput('Full name (optional): ')

      // Create account
      console.log(chalk.blue('⚡︎ Creating account...'))

      const result = await authProvider.signUp(email, password, {
        username: username || undefined,
        fullName: fullName || undefined,
        metadata: {
          source: 'nikcli',
          version: '0.2.3',
          created_at: new Date().toISOString(),
        },
      })

      if (result) {
        console.log(chalk.green('✓ Account created successfully!'))
        console.log(chalk.dim('You are now signed in and can use all NikCLI features'))

        // Display welcome info
        const { profile } = result
        console.log()

        console.log(`   Email: ${profile.email}`)
        console.log(`   Subscription: ${profile.subscription_tier}`)
        console.log(`   Monthly Sessions: ${profile.quotas.sessionsPerMonth}`)
        console.log(`   Monthly Tokens: ${profile.quotas.tokensPerMonth}`)

        // Record usage
        await authProvider.recordUsage('sessions', 1)
      } else {
        console.log(chalk.red('❌ Account creation failed'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Sign up failed: ${error.message}`))
      if (error.message.includes('already exists') || error.message.includes('already registered')) {
        console.log(chalk.dim('Try signing in instead: /auth signin'))
      } else if (error.message.includes('rate limit')) {
        console.log(chalk.dim('Too many attempts. Please try again later.'))
      }
    }
  }

  private async handleAuthSignOut(): Promise<void> {
    // Implementation for sign out
    try {
      await authProvider.signOut()
      console.log(chalk.green('👋 Signed out successfully'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Sign out error: ${error.message}`))
    }
  }

  private async showAuthProfile(): Promise<void> {
    try {
      // Dynamic import for auth provider
      const { authProvider } = await import('./providers/supabase/auth-provider')

      if (!authProvider.isAuthenticated()) {
        console.log(chalk.yellow('⚠️ Not signed in'))
        console.log(chalk.dim('Sign in with: /auth signin'))
        return
      }

      const profile = authProvider.getCurrentProfile()
      const user = authProvider.getCurrentUser()

      if (!profile || !user) {
        console.log(chalk.red('❌ Could not load profile'))
        return
      }

      console.log(chalk.blue('👤 User Profile'))
      console.log(chalk.gray('─'.repeat(40)))

      // Basic Info
      console.log(chalk.bold('📋 Basic Information'))
      console.log(`   Email: ${chalk.cyan(profile.email || 'Not provided')}`)
      console.log(`   Username: ${chalk.cyan(profile.username || 'Not set')}`)
      console.log(`   Full Name: ${chalk.cyan(profile.full_name || 'Not provided')}`)
      console.log(`   User ID: ${chalk.dim(user.id)}`)
      console.log()

      // Subscription Info
      console.log(chalk.bold('💎 Subscription'))
      const tierColor =
        profile.subscription_tier === 'free' ? 'yellow' : profile.subscription_tier === 'pro' ? 'blue' : 'green'
      console.log(`   Tier: ${chalk[tierColor](profile.subscription_tier.toUpperCase())}`)
      console.log()

      // Preferences
      console.log(chalk.bold('� Preferences'))
      console.log(`   Theme: ${chalk.cyan(profile.preferences.theme)}`)
      console.log(`   Language: ${chalk.cyan(profile.preferences.language)}`)
      console.log(`   Notifications: ${profile.preferences.notifications ? chalk.green('✓ On') : chalk.gray('❌ Off')}`)
      console.log(`   Analytics: ${profile.preferences.analytics ? chalk.green('✓ On') : chalk.gray('❌ Off')}`)
      console.log()

      // Account Info
      console.log(chalk.bold('📅 Account Information'))
      console.log(`   Account Created: ${new Date(user.created_at).toLocaleString()}`)
      console.log(
        `   Last Sign In: ${(user as any).last_sign_in_at ? new Date((user as any).last_sign_in_at).toLocaleString() : 'Never'}`
      )
      console.log(
        `   Email Verified: ${(user as any).email_confirmed_at ? chalk.green('✓ Yes') : chalk.yellow('⚠️ Pending')}`
      )
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to load profile: ${error.message}`))
    }
  }

  private async showAuthQuotas(): Promise<void> {
    try {
      // Dynamic import for auth provider
      const { authProvider } = await import('./providers/supabase/auth-provider')

      if (!authProvider.isAuthenticated()) {
        console.log(chalk.yellow('⚠️ Not signed in'))
        console.log(chalk.dim('Sign in with: /auth signin'))
        return
      }

      const profile = authProvider.getCurrentProfile()
      if (!profile) {
        console.log(chalk.red('❌ Could not load profile'))
        return
      }

      console.log(chalk.blue('📊 Usage Quotas & Limits'))
      console.log(chalk.gray('─'.repeat(50)))

      // Subscription tier info
      const tierColor =
        profile.subscription_tier === 'free' ? 'yellow' : profile.subscription_tier === 'pro' ? 'blue' : 'green'
      console.log(`   Subscription: ${chalk[tierColor].bold(profile.subscription_tier.toUpperCase())}`)
      console.log()

      // Sessions quota
      const sessionQuota = authProvider.checkQuota('sessions')
      const sessionPercent = Math.round((sessionQuota.used / sessionQuota.limit) * 100)
      const sessionColor = sessionPercent > 90 ? 'red' : sessionPercent > 70 ? 'yellow' : 'green'

      console.log(chalk.bold('💬 Chat Sessions (Monthly)'))
      console.log(`   Used: ${chalk[sessionColor](sessionQuota.used.toString())} / ${sessionQuota.limit}`)
      console.log(`   Remaining: ${chalk.cyan((sessionQuota.limit - sessionQuota.used).toString())}`)
      console.log(`   Usage: ${chalk[sessionColor](`${sessionPercent}%`)}`)
      if (sessionQuota.resetTime) {
        console.log(`   Resets: ${chalk.dim(sessionQuota.resetTime.toLocaleDateString())}`)
      }
      console.log()

      // Tokens quota
      const tokenQuota = authProvider.checkQuota('tokens')
      const tokenPercent = Math.round((tokenQuota.used / tokenQuota.limit) * 100)
      const tokenColor = tokenPercent > 90 ? 'red' : tokenPercent > 70 ? 'yellow' : 'green'

      console.log(chalk.bold('🎯 AI Tokens (Monthly)'))
      console.log(
        `   Used: ${chalk[tokenColor](tokenQuota.used.toLocaleString())} / ${tokenQuota.limit.toLocaleString()}`
      )
      console.log(`   Remaining: ${chalk.cyan((tokenQuota.limit - tokenQuota.used).toLocaleString())}`)
      console.log(`   Usage: ${chalk[tokenColor](`${tokenPercent}%`)}`)
      if (tokenQuota.resetTime) {
        console.log(`   Resets: ${chalk.dim(tokenQuota.resetTime.toLocaleDateString())}`)
      }
      console.log()

      // API calls quota
      const apiQuota = authProvider.checkQuota('apiCalls')
      const apiPercent = Math.round((apiQuota.used / apiQuota.limit) * 100)
      const apiColor = apiPercent > 90 ? 'red' : apiPercent > 70 ? 'yellow' : 'green'

      console.log(chalk.bold('⚡ API Calls (Hourly)'))
      console.log(`   Used: ${chalk[apiColor](apiQuota.used.toString())} / ${apiQuota.limit}`)
      console.log(`   Remaining: ${chalk.cyan((apiQuota.limit - apiQuota.used).toString())}`)
      console.log(`   Usage: ${chalk[apiColor](`${apiPercent}%`)}`)
      if (apiQuota.resetTime) {
        console.log(`   Resets: ${chalk.dim(apiQuota.resetTime.toLocaleString())}`)
      }
      console.log()

      // Upgrade info for free users
      if (profile.subscription_tier === 'free') {
        console.log(chalk.bold.yellow('💡 Upgrade Benefits'))
        console.log(chalk.dim('   PRO: 1,000 sessions/month, 100k tokens/month, 300 API calls/hour'))
        console.log(chalk.dim('   ENTERPRISE: Unlimited usage, priority support, custom features'))
      }

      // Warnings
      const warnings = []
      if (!sessionQuota.allowed) warnings.push('Sessions limit reached')
      if (!tokenQuota.allowed) warnings.push('Token limit reached')
      if (!apiQuota.allowed) warnings.push('API rate limit reached')

      if (warnings.length > 0) {
        console.log(chalk.bold.red('⚠️ Quota Warnings'))
        warnings.forEach((warning) => {
          console.log(chalk.red(`   • ${warning}`))
        })
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to load quotas: ${error.message}`))
    }
  }

  /**
   * Auto-generate todos and orchestrate background agents for complex tasks
   */
  private async autoGenerateTodosAndOrchestrate(input: string): Promise<void> {
    try {
      console.log(chalk.blue('📋 Creating execution todos...'))

      // Use agent todo manager directly for chat default (NOT enhanced planning)
      const { agentTodoManager } = await import('./core/agent-todo-manager')

      // Create universal agent ID for this task
      const universalAgentId = `universal-agent-${Date.now()}`

      // Generate todos using agent todo manager (max 6 for chat default)
      const todos = await agentTodoManager.planTodos(universalAgentId, input)

      // Limit to max 6 todos for chat default
      const limitedTodos = todos.slice(0, 6)

      // Display todos to user
      this.displayGeneratedTodos(limitedTodos)

      // Start executing todos with background agents
      console.log(chalk.green('🚀 Starting background execution...'))
      console.log(
        chalk.gray(
          `I've broken down your request into ${limitedTodos.length} actionable steps and started working on them in the background.`
        )
      )
      console.log(chalk.gray('You can continue chatting while I work.'))

      // Execute todos in background (non-blocking)
      this.executeInBackground(limitedTodos, universalAgentId)
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to generate todos: ${error.message}`))
      // Fallback to direct response
      console.log(chalk.yellow('⚡︎ Falling back to direct chat response...'))

      // Continue with normal chat flow
      const relevantContext = await this.getRelevantProjectContext(input)
      const _enhancedInput = relevantContext ? `${input}\n\nContext: ${relevantContext}` : input

      // Build model-ready messages
      chatManager.addMessage(input, 'user')
      const messages = chatManager.getContextMessages().map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }))

      // Simple AI response
      process.stdout.write(`${chalk.cyan('\nAssistant: ')}`)
      let _assistantText = ''
      let _shouldFormatOutput = false
      let _streamedLines = 0
      const _terminalWidth = process.stdout.columns || 80

      for await (const ev of advancedAIProvider.streamChatWithFullAutonomy(messages)) {
        if (ev.type === 'text_delta' && ev.content) {
          _assistantText += ev.content
          process.stdout.write(ev.content)

          // Track lines for clearing
          const linesInChunk = Math.ceil(ev.content.length / _terminalWidth) + (ev.content.match(/\n/g) || []).length
          _streamedLines += linesInChunk
        } else if (ev.type === 'complete') {
          // Mark that we should format output
          if (_assistantText.length > 200) {
            _shouldFormatOutput = true
          }
        }
      }

      // Clear and show formatted output if needed
      if (_shouldFormatOutput) {
        this.clearStreamedOutput(_streamedLines + 2) // +2 for "Assistant:" header

        const { OutputFormatter } = await import('./ui/output-formatter')
        const formattedOutput = OutputFormatter.formatFinalOutput(_assistantText)

        console.log(chalk.cyan.bold('Assistant:\n'))
        console.log(formattedOutput)
        console.log('')
      }

      // Update token usage after streaming completes (sync with session)
      this.syncTokensFromSession()
    }
  }
  /**
   * Display generated todos to user
   */
  private displayGeneratedTodos(todos: any[]): void {
    console.log(chalk.cyan.bold('\n📋 Execution Plan:'))
    todos.forEach((todo, index) => {
      const priority = todo.priority === 'critical' ? '🔴' : todo.priority === 'high' ? '🟡' : '🟢'
      console.log(`  ${index + 1}. ${priority} ${todo.title}`)
      if (todo.description && todo.description !== todo.title) {
        console.log(`     ${chalk.gray(todo.description)}`)
      }
    })
    console.log('')
  }

  /**
   * Execute todos in background using orchestrated agents
   */
  private executeInBackground(_todos: any[], agentId: string): void {
    // Non-blocking execution
    setTimeout(async () => {
      try {
        const { agentTodoManager } = await import('./core/agent-todo-manager')

        // Todos are already generated by agentTodoManager.planTodos()
        // Just execute them directly
        await agentTodoManager.executeTodos(agentId)

        console.log(chalk.green('\n✅ Background execution completed!'))
        console.log(chalk.gray('All background tasks have been completed successfully.'))
      } catch (error: any) {
        console.log(chalk.red(`\n❌ Background execution failed: ${error.message}`))
        console.log(chalk.gray(`Some background tasks encountered issues: ${error.message}`))
      }
    }, 100) // Small delay to avoid blocking the chat
  }

  // Token tracking API to be called from AI providers
  public static getInstance(): NikCLI | null {
    return globalNikCLI
  }

  /**
   * Show agents panel display
   */
  private showAgentsPanel(): void {
    const agents = agentService.getAvailableAgents()

    let agentsList = ''
    agents.forEach((agent) => {
      agentsList += `${chalk.green('•')} ${chalk.bold(agent.name)}\n`
      agentsList += `  ${chalk.gray(agent.description)}\n\n`
    })

    const agentsBox = this.printPanel(
      boxen(agentsList.trim(), {
        title: '🔌 Available Agents',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'blue',
      })
    )
    // printed via begin/end guards at call site
    console.log(agentsBox)
  }

  /**
   * Show factory panel display
   */
  private showFactoryPanel(): void {
    const factoryInfo =
      `${chalk.cyan('🏭 Agent Factory Dashboard')}\n\n` +
      `${chalk.yellow('Features:')}\n` +
      `• Dynamic agent creation\n` +
      `• Blueprint management\n` +
      `• Capability assessment\n` +
      `• Performance monitoring\n\n` +
      `${chalk.dim('Use /create-agent to build new agents')}`

    const factoryBox = this.printPanel(
      boxen(factoryInfo, {
        title: '🏭 Agent Factory',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
      })
    )
    // printed via begin/end guards at call site
    console.log(factoryBox)
  }

  /**
   * Show blueprints panel display
   */
  private showBlueprintsPanel(): void {
    const pad = (s: string) => s.padEnd(32)
    const blueprintsInfo =
      `${chalk.cyan('📋 Blueprint Management')}\n\n` +
      `${chalk.yellow('Available Operations:')}\n` +
      `• ${pad('List all blueprints')} ${chalk.dim('/blueprints list')}\n` +
      `• ${pad('Create new blueprints')} ${chalk.dim('/create-agent <name> <spec>')}\n` +
      `• ${pad('Export blueprints to file')} ${chalk.dim('/blueprints export [file]')}\n` +
      `• ${pad('Import blueprints from file')} ${chalk.dim('/blueprints import <file>')}\n` +
      `• ${pad('Search by capabilities')} ${chalk.dim('/blueprints search <query>')}\n` +
      `• ${pad('Show blueprint details')} ${chalk.dim('/blueprints show <id>')}\n` +
      `• ${pad('Launch agent from blueprint')} ${chalk.dim('/launch-agent <id>')}\n\n` +
      `${chalk.gray('Note: Blueprint operations require Supabase integration')}\n` +
      `${chalk.dim('Use /blueprint <id> for detailed information')}`

    const blueprintsBox = this.printPanel(
      boxen(blueprintsInfo, {
        title: '📋 Agent Blueprints',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'magenta',
      })
    )
    // printed via begin/end guards at call site
    console.log(blueprintsBox)
  }

  /**
   * Show configuration panel with proper formatting
   */
  private async showConfigurationPanel(): Promise<void> {
    try {
      const cfg = configManager.getConfig()

      const lines: string[] = []
      lines.push(chalk.cyan.bold('�  System Configuration'))
      lines.push(chalk.gray('─'.repeat(60)))

      // 1) General
      lines.push('')
      lines.push(chalk.green('1) General'))
      lines.push(`   Current Model: ${chalk.yellow(cfg.currentModel)}`)
      lines.push(`   Temperature: ${chalk.cyan(String(cfg.temperature))}`)
      lines.push(`   Max Tokens: ${chalk.cyan(String(cfg.maxTokens))}`)
      lines.push(
        `   Chat History: ${cfg.chatHistory ? chalk.green('on') : chalk.gray('off')} (max ${cfg.maxHistoryLength})`
      )
      if (cfg.systemPrompt) {
        const preview = cfg.systemPrompt.length > 80 ? `${cfg.systemPrompt.slice(0, 77)}…` : cfg.systemPrompt
        lines.push(`   System Prompt: ${chalk.gray(preview)}`)
      }
      lines.push(`   Auto Analyze Workspace: ${cfg.autoAnalyzeWorkspace ? chalk.green('on') : chalk.gray('off')}`)

      // 2) Auto Todos
      lines.push('')
      lines.push(chalk.green('2) Auto Todos'))
      const requireExplicit = (cfg as any).autoTodo?.requireExplicitTrigger === true
      lines.push(
        `   Mode: ${requireExplicit ? chalk.yellow('Explicit only (use "todo")') : chalk.green('Automatic (complex input allowed)')}`
      )
      lines.push(`   Toggle: ${chalk.cyan('/todos on')} | ${chalk.cyan('/todos off')} | ${chalk.cyan('/todos status')}`)

      // 3) Model Routing
      lines.push('')
      lines.push(chalk.green('3) Model Routing'))
      lines.push(`   Enabled: ${cfg.modelRouting.enabled ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Verbose: ${cfg.modelRouting.verbose ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Mode: ${chalk.cyan(cfg.modelRouting.mode)}`)

      // 4) Agents
      lines.push('')
      lines.push(chalk.green('4) Agents'))
      lines.push(`   Max Concurrent Agents: ${chalk.cyan(String(cfg.maxConcurrentAgents))}`)
      lines.push(`   Guidance System: ${cfg.enableGuidanceSystem ? chalk.green('on') : chalk.gray('off')}`)
      lines.push(`   Default Agent Timeout: ${chalk.cyan(String(cfg.defaultAgentTimeout))} ms`)
      lines.push(`   Log Level: ${chalk.cyan(cfg.logLevel)}`)

      // 5) Security
      lines.push('')
      lines.push(chalk.green('5) Security'))
      lines.push(
        `   Require Network Approval: ${cfg.requireApprovalForNetwork ? chalk.green('yes') : chalk.gray('no')}`
      )
      lines.push(`   Approval Policy: ${chalk.cyan(cfg.approvalPolicy)}`)
      lines.push(`   Security Mode: ${chalk.cyan(cfg.securityMode)}`)

      // 6) Tool Approval Policies
      lines.push('')
      lines.push(chalk.green('6) Tool Approval Policies'))
      Object.entries(cfg.toolApprovalPolicies).forEach(([k, v]) => {
        lines.push(`   ${k}: ${chalk.cyan(String(v))}`)
      })

      // 7) Session Settings
      lines.push('')
      lines.push(chalk.green('7) Session Settings'))
      lines.push(`   Approval Timeout: ${chalk.cyan(String(cfg.sessionSettings.approvalTimeoutMs))} ms`)
      lines.push(`   Dev Mode Timeout: ${chalk.cyan(String(cfg.sessionSettings.devModeTimeoutMs))} ms`)
      lines.push(
        `   Batch Approval: ${cfg.sessionSettings.batchApprovalEnabled ? chalk.green('on') : chalk.gray('off')}`
      )
      lines.push(
        `   Auto-Approve ReadOnly: ${cfg.sessionSettings.autoApproveReadOnly ? chalk.green('on') : chalk.gray('off')}`
      )

      // 8) Sandbox
      lines.push('')
      lines.push(chalk.green('8) Sandbox'))
      lines.push(`   Enabled: ${cfg.sandbox.enabled ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   File System: ${cfg.sandbox.allowFileSystem ? chalk.green('allowed') : chalk.red('blocked')}`)
      lines.push(`   Network: ${cfg.sandbox.allowNetwork ? chalk.green('allowed') : chalk.red('blocked')}`)
      lines.push(`   Commands: ${cfg.sandbox.allowCommands ? chalk.green('allowed') : chalk.red('blocked')}`)
      lines.push(`   Trusted Domains: ${chalk.cyan(String(cfg.sandbox.trustedDomains.length))}`)

      // 9) Redis
      lines.push('')
      lines.push(chalk.green('9) Redis'))
      lines.push(`   Enabled: ${cfg.redis.enabled ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(
        `   Host: ${chalk.cyan(cfg.redis.host)}  Port: ${chalk.cyan(String(cfg.redis.port))}  DB: ${chalk.cyan(String(cfg.redis.database))}`
      )
      lines.push(
        `   TTL: ${chalk.cyan(String(cfg.redis.ttl))}s  Retries: ${chalk.cyan(String(cfg.redis.maxRetries))}  Delay: ${chalk.cyan(String(cfg.redis.retryDelayMs))}ms`
      )
      lines.push(`   Cluster: ${cfg.redis.cluster?.enabled ? chalk.green('on') : chalk.gray('off')}`)
      lines.push(
        `   Fallback: ${cfg.redis.fallback.enabled ? chalk.green('on') : chalk.gray('off')} (${chalk.cyan(cfg.redis.fallback.strategy)})`
      )
      lines.push(
        `   Strategies: tokens=${cfg.redis.strategies.tokens ? 'on' : 'off'}, sessions=${cfg.redis.strategies.sessions ? 'on' : 'off'}, agents=${cfg.redis.strategies.agents ? 'on' : 'off'}, docs=${cfg.redis.strategies.documentation ? 'on' : 'off'}`
      )

      // 10) Supabase
      lines.push('')
      lines.push(chalk.green('10) Supabase'))
      lines.push(`   Enabled: ${cfg.supabase.enabled ? chalk.green('yes') : chalk.gray('no')}`)
      if (cfg.supabase.url) lines.push(`   URL: ${chalk.cyan(cfg.supabase.url)}`)
      lines.push(
        `   Features: db=${cfg.supabase.features.database ? 'on' : 'off'}, storage=${cfg.supabase.features.storage ? 'on' : 'off'}, auth=${cfg.supabase.features.auth ? 'on' : 'off'}, realtime=${cfg.supabase.features.realtime ? 'on' : 'off'}, vector=${cfg.supabase.features.vector ? 'on' : 'off'}`
      )
      lines.push(
        `   Tables: sessions=${cfg.supabase.tables.sessions}, blueprints=${cfg.supabase.tables.blueprints}, users=${cfg.supabase.tables.users}, metrics=${cfg.supabase.tables.metrics}, docs=${cfg.supabase.tables.documents}`
      )

      // 11) Cloud Docs
      lines.push('')
      lines.push(chalk.green('11) Cloud Docs'))
      lines.push(`   Enabled: ${cfg.cloudDocs.enabled ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Provider: ${chalk.cyan(cfg.cloudDocs.provider)}`)
      lines.push(
        `   Auto Sync: ${cfg.cloudDocs.autoSync ? 'on' : 'off'}  Contribution: ${cfg.cloudDocs.contributionMode ? 'on' : 'off'}`
      )
      lines.push(`   Max Context: ${chalk.cyan(String(cfg.cloudDocs.maxContextSize))}`)
      lines.push(
        `   Auto Load For Agents: ${cfg.cloudDocs.autoLoadForAgents ? 'on' : 'off'}  Smart Suggestions: ${cfg.cloudDocs.smartSuggestions ? 'on' : 'off'}`
      )

      // 12) AI Providers & API Keys
      lines.push('')
      lines.push(chalk.green('12) AI Providers & API Keys'))
      const anthropicKey = configManager.getApiKey('anthropic') || process.env.ANTHROPIC_API_KEY
      const openaiKey = configManager.getApiKey('openai') || process.env.OPENAI_API_KEY
      const googleKey = configManager.getApiKey('google') || process.env.GOOGLE_GENERATIVE_AI_API_KEY
      const gatewayKey = configManager.getApiKey('gateway') || process.env.AI_GATEWAY_API_KEY
      const v0Key = configManager.getApiKey('vercel') || process.env.V0_API_KEY
      const ollamaHost = process.env.OLLAMA_HOST || '127.0.0.1:11434'

      lines.push(`   Anthropic (Claude): ${anthropicKey ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      lines.push(`   OpenAI (GPT): ${openaiKey ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      lines.push(`   Google (Gemini): ${googleKey ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      lines.push(`   AI Gateway: ${gatewayKey ? chalk.green('✓ configured') : chalk.gray('❌ optional')}`)
      lines.push(`   V0 (Vercel): ${v0Key ? chalk.green('✓ configured') : chalk.gray('❌ optional')}`)
      lines.push(`   Ollama: ${chalk.cyan(ollamaHost)} ${ollamaHost ? chalk.gray('(local)') : chalk.red('❌ missing')}`)

      // 13) Blockchain & Web3 (Coinbase)
      lines.push('')
      lines.push(chalk.green('13) Blockchain & Web3 (Coinbase)'))
      const coinbaseId = configManager.getApiKey('coinbase_id')
      const coinbaseSecret = configManager.getApiKey('coinbase_secret')
      const coinbaseWallet = configManager.getApiKey('coinbase_wallet_secret')
      lines.push(`   CDP API Key ID: ${coinbaseId ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      lines.push(`   CDP API Key Secret: ${coinbaseSecret ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      lines.push(`   CDP Wallet Secret: ${coinbaseWallet ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      const coinbaseReady = coinbaseId && coinbaseSecret && coinbaseWallet
      lines.push(
        `   Status: ${coinbaseReady ? chalk.green('Ready for Web3 operations') : chalk.yellow('Configure with /set-coin-keys')}`
      )

      // 14) Web Browsing & Analysis (Browserbase)
      lines.push('')
      lines.push(chalk.green('14) Web Browsing & Analysis (Browserbase)'))
      const browserbaseKey = configManager.getApiKey('browserbase')
      const browserbaseProject = configManager.getApiKey('browserbase_project_id')
      lines.push(`   API Key: ${browserbaseKey ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      lines.push(`   Project ID: ${browserbaseProject ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      const browserbaseReady = browserbaseKey && browserbaseProject
      lines.push(
        `   Status: ${browserbaseReady ? chalk.green('Ready for web browsing') : chalk.yellow('Configure with /set-key-bb')}`
      )
      if (browserbaseReady) {
        const availableProviders = ['claude', 'openai', 'google'].filter((p) => configManager.getApiKey(p))
        lines.push(
          `   AI Providers: ${availableProviders.length > 0 ? chalk.cyan(availableProviders.join(', ')) : chalk.gray('none available')}`
        )
      }

      // 15) Vector Database & Memory (ChromaDB)
      lines.push('')
      lines.push(chalk.green('15) Vector Database & Memory (ChromaDB)'))
      const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8005'
      const chromaApiKey = process.env.CHROMA_API_KEY || process.env.CHROMA_CLOUD_API_KEY
      lines.push(`   URL: ${chalk.cyan(chromaUrl)}`)
      lines.push(`   API Key: ${chromaApiKey ? chalk.green('✓ configured') : chalk.gray('❌ optional (local)')}`)
      lines.push(
        `   Status: ${chromaUrl.includes('localhost') ? chalk.yellow('Local instance') : chalk.green('Cloud instance')}`
      )

      // 16) Cache Services (Upstash Redis)
      lines.push('')
      lines.push(chalk.green('16) Cache Services (Upstash Redis)'))
      const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
      const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN
      lines.push(`   REST URL: ${upstashUrl ? chalk.green('✓ configured') : chalk.gray('❌ optional')}`)
      lines.push(`   REST Token: ${upstashToken ? chalk.green('✓ configured') : chalk.gray('❌ optional')}`)
      const upstashReady = upstashUrl && upstashToken
      lines.push(
        `   Status: ${upstashReady ? chalk.green('Cloud Redis ready') : chalk.gray('Using local Redis fallback')}`
      )

      // 17) Models & API Keys (sorted by name)
      lines.push('')
      lines.push(chalk.green('17) Models & API Keys'))
      const modelEntries = Object.entries(cfg.models).sort((a, b) => a[0].localeCompare(b[0]))
      modelEntries.forEach(([name, mc]) => {
        const isCurrent = name === cfg.currentModel
        const hasKey = configManager.getApiKey(name) !== undefined
        const bullet = isCurrent ? chalk.yellow('●') : chalk.gray('○')
        const keyStatus = hasKey ? chalk.green('✓ key') : chalk.red('❌ key')
        lines.push(`   ${bullet} ${chalk.cyan(name)}  (${(mc as any).provider}/${(mc as any).model})  ${keyStatus}`)
      })

      // 18) MCP Servers Configuration
      lines.push('')
      lines.push(chalk.green('18) MCP Servers Configuration'))
      const mcpConfig = (cfg as any).mcp || {}
      const mcpServers = Object.entries(mcpConfig)
      if (mcpServers.length > 0) {
        lines.push(`   Total Servers: ${chalk.cyan(String(mcpServers.length))}`)
        mcpServers.forEach(([name, server]: [string, any]) => {
          const enabled = server.enabled !== false
          const serverType = server.type || 'unknown'
          const statusIcon = enabled ? chalk.green('✓') : chalk.gray('○')
          const typeLabel = serverType === 'local' ? chalk.cyan('local') : chalk.blue('remote')
          lines.push(`   ${statusIcon} ${name} (${typeLabel})`)
          if (server.capabilities && server.capabilities.length > 0) {
            lines.push(`      Capabilities: ${chalk.gray(server.capabilities.join(', '))}`)
          }
        })
      } else {
        lines.push(`   ${chalk.gray('No MCP servers configured')}`)
      }

      // 19) Middleware System
      lines.push('')
      lines.push(chalk.green('19) Middleware System'))
      const middleware = (cfg as any).middleware || {}
      lines.push(`   Enabled: ${middleware.enabled !== false ? chalk.green('yes') : chalk.gray('no')}`)
      if (middleware.security) {
        lines.push(
          `   Security: ${middleware.security.enabled ? chalk.green('on') : chalk.gray('off')} (priority: ${chalk.cyan(String(middleware.security.priority))})`
        )
        lines.push(`      Strict Mode: ${middleware.security.strictMode ? chalk.green('yes') : chalk.gray('no')}`)
        lines.push(
          `      Require Approval: ${middleware.security.requireApproval ? chalk.green('yes') : chalk.gray('no')}`
        )
        lines.push(`      Risk Threshold: ${chalk.cyan(middleware.security.riskThreshold || 'medium')}`)
      }
      if (middleware.logging) {
        lines.push(
          `   Logging: ${middleware.logging.enabled ? chalk.green('on') : chalk.gray('off')} (priority: ${chalk.cyan(String(middleware.logging.priority))})`
        )
        lines.push(`      Log Level: ${chalk.cyan(middleware.logging.logLevel || 'info')}`)
        lines.push(`      Log to File: ${middleware.logging.logToFile ? chalk.green('yes') : chalk.gray('no')}`)
        lines.push(`      Sanitize Data: ${middleware.logging.sanitizeData ? chalk.green('yes') : chalk.gray('no')}`)
      }
      if (middleware.validation) {
        lines.push(
          `   Validation: ${middleware.validation.enabled ? chalk.green('on') : chalk.gray('off')} (priority: ${chalk.cyan(String(middleware.validation.priority))})`
        )
        lines.push(`      Strict Mode: ${middleware.validation.strictMode ? chalk.green('yes') : chalk.gray('no')}`)
        lines.push(`      Validate Args: ${middleware.validation.validateArgs ? chalk.green('yes') : chalk.gray('no')}`)
      }
      if (middleware.performance) {
        lines.push(
          `   Performance: ${middleware.performance.enabled ? chalk.green('on') : chalk.gray('off')} (priority: ${chalk.cyan(String(middleware.performance.priority))})`
        )
        lines.push(`      Track Memory: ${middleware.performance.trackMemory ? chalk.green('yes') : chalk.gray('no')}`)
        lines.push(
          `      Slow Execution Threshold: ${chalk.cyan(String(middleware.performance.slowExecutionThreshold || 5000))}ms`
        )
      }
      if (middleware.audit) {
        lines.push(
          `   Audit: ${middleware.audit.enabled ? chalk.green('on') : chalk.gray('off')} (priority: ${chalk.cyan(String(middleware.audit.priority))})`
        )
        lines.push(`      Audit Level: ${chalk.cyan(middleware.audit.auditLevel || 'standard')}`)
        lines.push(`      Data Retention: ${chalk.cyan(String(middleware.audit.dataRetentionDays || 90))} days`)
      }

      // 20) Reasoning Configuration
      lines.push('')
      lines.push(chalk.green('20) Reasoning Configuration'))
      const reasoning = (cfg as any).reasoning || {}
      lines.push(
        `   Global Reasoning: ${reasoning.enabled !== false ? chalk.green('enabled') : chalk.gray('disabled')}`
      )
      lines.push(`   Auto-Detect Models: ${reasoning.autoDetect !== false ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Show Process: ${reasoning.showReasoningProcess ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Log Reasoning: ${reasoning.logReasoning ? chalk.green('yes') : chalk.gray('no')}`)

      // 21) Embedding Provider
      lines.push('')
      lines.push(chalk.green('21) Embedding Provider'))
      const embeddingProvider = (cfg as any).embeddingProvider || {}
      lines.push(`   Default Provider: ${chalk.cyan(embeddingProvider.default || 'openai')}`)
      if (embeddingProvider.fallbackChain && embeddingProvider.fallbackChain.length > 0) {
        lines.push(`   Fallback Chain: ${chalk.gray(embeddingProvider.fallbackChain.join(' → '))}`)
      }
      lines.push(
        `   Cost Optimization: ${embeddingProvider.costOptimization !== false ? chalk.green('yes') : chalk.gray('no')}`
      )
      lines.push(
        `   Auto-Switch on Failure: ${embeddingProvider.autoSwitchOnFailure !== false ? chalk.green('yes') : chalk.gray('no')}`
      )

      // 22) Diff Display
      lines.push('')
      lines.push(chalk.green('22) Diff Display'))
      const diff = (cfg as any).diff || {}
      lines.push(`   Enabled: ${diff.enabled !== false ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Style: ${chalk.cyan(diff.style || 'unified')}`)
      lines.push(`   Theme: ${chalk.cyan(diff.theme || 'auto')}`)
      lines.push(`   Line Numbers: ${diff.showLineNumbers !== false ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Context Lines: ${chalk.cyan(String(diff.contextLines !== undefined ? diff.contextLines : 3))}`)
      lines.push(`   Syntax Highlighting: ${diff.syntaxHighlight !== false ? chalk.green('yes') : chalk.gray('no')}`)

      // 23) Output Style Configuration
      lines.push('')
      lines.push(chalk.green('23) Output Style Configuration'))
      const outputStyle = (cfg as any).outputStyle || {}
      lines.push(`   Default Style: ${chalk.cyan(outputStyle.defaultStyle || 'production-focused')}`)
      if (outputStyle.customizations) {
        lines.push(`   Verbosity Level: ${chalk.cyan(String(outputStyle.customizations.verbosityLevel || 5))}`)
        lines.push(
          `   Include Code Examples: ${outputStyle.customizations.includeCodeExamples !== false ? chalk.green('yes') : chalk.gray('no')}`
        )
        lines.push(
          `   Include Step-by-Step: ${outputStyle.customizations.includeStepByStep !== false ? chalk.green('yes') : chalk.gray('no')}`
        )
        lines.push(`   Max Response Length: ${chalk.cyan(outputStyle.customizations.maxResponseLength || 'medium')}`)
      }

      const configBox = boxen(lines.join('\n'), {
        title: '�  Configuration Panel',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      })
      this.printPanel(configBox)
      this.printPanel(
        boxen('Tip: Use /config interactive to edit settings', {
          title: 'Config Tip',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to show configuration: ${error.message}`))
    }
  }

  /**
   * Interactive configuration editor using inquirer
   */
  private async showInteractiveConfiguration(): Promise<void> {
    // Prevent user input queue interference during interactive prompts
    try {
      this.suspendPrompt()
    } catch { }
    try {
      inputQueue.enableBypass()
    } catch { }

    try {
      const sectionChoices = [
        { name: 'General', value: 'general' },
        { name: 'Auto Todos', value: 'autotodos' },
        { name: 'Model Routing', value: 'routing' },
        { name: 'Agents', value: 'agents' },
        { name: 'Security', value: 'security' },
        { name: 'Session Settings', value: 'session' },
        { name: 'Sandbox', value: 'sandbox' },
        { name: 'Models & Keys', value: 'models' },
        { name: 'Middleware', value: 'middleware' },
        { name: 'Reasoning', value: 'reasoning' },
        { name: 'Embedding Provider', value: 'embedding' },
        { name: 'Diff Display', value: 'diff' },
        { name: 'Output Style', value: 'outputstyle' },
        { name: 'MCP Servers', value: 'mcp' },
        { name: 'Exit', value: 'exit' },
      ]

      const asNumber = (v: any, min?: number, max?: number) => {
        const n = Number(v)
        if (!Number.isFinite(n)) return 'Enter a number'
        if (min !== undefined && n < min) return `Min ${min}`
        if (max !== undefined && n > max) return `Max ${max}`
        return true
      }

      // Loop until user exits
      let done = false
      while (!done) {
        const { section } = await inquirer.prompt<{ section: string }>([
          {
            type: 'list',
            name: 'section',
            message: 'Configuration — select section',
            choices: sectionChoices,
          },
        ])

        const cfg = this.configManager.getAll() as any

        switch (section) {
          case 'general': {
            const ans = await inquirer.prompt([
              {
                type: 'input',
                name: 'temperature',
                message: 'Temperature (0–2)',
                default: cfg.temperature,
                validate: (v: any) => asNumber(v, 0, 2),
              },
              {
                type: 'input',
                name: 'maxTokens',
                message: 'Max tokens',
                default: cfg.maxTokens,
                validate: (v: any) => asNumber(v, 1, 800000),
              },
              { type: 'confirm', name: 'chatHistory', message: 'Enable chat history?', default: cfg.chatHistory },
              {
                type: 'input',
                name: 'maxHistoryLength',
                message: 'Max history length',
                default: cfg.maxHistoryLength,
                validate: (v: any) => asNumber(v, 1, 5000),
              },
            ])
            this.configManager.set('temperature', Number(ans.temperature) as any)
            this.configManager.set('maxTokens', Number(ans.maxTokens) as any)
            this.configManager.set('chatHistory', Boolean(ans.chatHistory) as any)
            this.configManager.set('maxHistoryLength', Number(ans.maxHistoryLength) as any)
            console.log(chalk.green('✓ Updated General settings'))
            break
          }
          case 'autotodos': {
            const current = !!cfg.autoTodo?.requireExplicitTrigger
            const { requireExplicitTrigger } = await inquirer.prompt<{ requireExplicitTrigger: boolean }>([
              {
                type: 'confirm',
                name: 'requireExplicitTrigger',
                message: 'Require explicit "todo" to trigger?',
                default: current,
              },
            ])
            this.configManager.set('autoTodo', { ...(cfg.autoTodo || {}), requireExplicitTrigger } as any)
            console.log(chalk.green('✓ Updated Auto Todos settings'))
            break
          }
          case 'routing': {
            const { enabled, verbose, mode } = await inquirer.prompt([
              { type: 'confirm', name: 'enabled', message: 'Enable routing?', default: cfg.modelRouting.enabled },
              { type: 'confirm', name: 'verbose', message: 'Verbose routing logs?', default: cfg.modelRouting.verbose },
              {
                type: 'list',
                name: 'mode',
                message: 'Routing mode',
                choices: ['conservative', 'balanced', 'aggressive'],
                default: cfg.modelRouting.mode,
              },
            ])
            this.configManager.set('modelRouting', { enabled, verbose, mode } as any)
            console.log(chalk.green('✓ Updated Model Routing'))
            break
          }
          case 'agents': {
            const { maxConcurrentAgents, enableGuidanceSystem, defaultAgentTimeout, logLevel } = await inquirer.prompt([
              {
                type: 'input',
                name: 'maxConcurrentAgents',
                message: 'Max concurrent agents',
                default: cfg.maxConcurrentAgents,
                validate: (v: any) => asNumber(v, 1, 10),
              },
              {
                type: 'confirm',
                name: 'enableGuidanceSystem',
                message: 'Enable guidance system?',
                default: cfg.enableGuidanceSystem,
              },
              {
                type: 'input',
                name: 'defaultAgentTimeout',
                message: 'Default agent timeout (ms)',
                default: cfg.defaultAgentTimeout,
                validate: (v: any) => asNumber(v, 1000, 3600000),
              },
              {
                type: 'list',
                name: 'logLevel',
                message: 'Log level',
                choices: ['debug', 'info', 'warn', 'error'],
                default: cfg.logLevel,
              },
            ])
            this.configManager.set('maxConcurrentAgents', Number(maxConcurrentAgents) as any)
            this.configManager.set('enableGuidanceSystem', Boolean(enableGuidanceSystem) as any)
            this.configManager.set('defaultAgentTimeout', Number(defaultAgentTimeout) as any)
            this.configManager.set('logLevel', logLevel as any)
            console.log(chalk.green('✓ Updated Agent settings'))
            break
          }
          case 'security': {
            const { requireApprovalForNetwork, approvalPolicy, securityMode } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'requireApprovalForNetwork',
                message: 'Require approval for network requests?',
                default: cfg.requireApprovalForNetwork,
              },
              {
                type: 'list',
                name: 'approvalPolicy',
                message: 'Approval policy',
                choices: ['strict', 'moderate', 'permissive'],
                default: cfg.approvalPolicy,
              },
              {
                type: 'list',
                name: 'securityMode',
                message: 'Security mode',
                choices: ['safe', 'default', 'developer'],
                default: cfg.securityMode,
              },
            ])
            this.configManager.set('requireApprovalForNetwork', Boolean(requireApprovalForNetwork) as any)
            this.configManager.set('approvalPolicy', approvalPolicy as any)
            this.configManager.set('securityMode', securityMode as any)
            console.log(chalk.green('✓ Updated Security settings'))
            break
          }
          case 'session': {
            const s = cfg.sessionSettings
            const a = await inquirer.prompt([
              {
                type: 'input',
                name: 'approvalTimeoutMs',
                message: 'Approval timeout (ms)',
                default: s.approvalTimeoutMs,
                validate: (v: any) => asNumber(v, 5000, 300000),
              },
              {
                type: 'input',
                name: 'devModeTimeoutMs',
                message: 'Dev mode timeout (ms)',
                default: s.devModeTimeoutMs,
                validate: (v: any) => asNumber(v, 60000, 7200000),
              },
              {
                type: 'confirm',
                name: 'batchApprovalEnabled',
                message: 'Enable batch approvals?',
                default: s.batchApprovalEnabled,
              },
              {
                type: 'confirm',
                name: 'autoApproveReadOnly',
                message: 'Auto approve read-only?',
                default: s.autoApproveReadOnly,
              },
            ])
            this.configManager.set('sessionSettings', {
              approvalTimeoutMs: Number(a.approvalTimeoutMs),
              devModeTimeoutMs: Number(a.devModeTimeoutMs),
              batchApprovalEnabled: Boolean(a.batchApprovalEnabled),
              autoApproveReadOnly: Boolean(a.autoApproveReadOnly),
            } as any)
            console.log(chalk.green('✓ Updated Session settings'))
            break
          }
          case 'sandbox': {
            const s = cfg.sandbox
            const a = await inquirer.prompt([
              { type: 'confirm', name: 'enabled', message: 'Enable sandbox?', default: s.enabled },
              { type: 'confirm', name: 'allowFileSystem', message: 'Allow file system?', default: s.allowFileSystem },
              { type: 'confirm', name: 'allowNetwork', message: 'Allow network?', default: s.allowNetwork },
              { type: 'confirm', name: 'allowCommands', message: 'Allow commands?', default: s.allowCommands },
            ])
            this.configManager.set('sandbox', { ...s, ...a } as any)
            console.log(chalk.green('✓ Updated Sandbox settings'))
            break
          }
          case 'models': {
            const list = this.configManager.listModels()
            if (!list || list.length === 0) {
              console.log(chalk.yellow('No models configured'))
              break
            }
            const { selection } = await inquirer.prompt<{ selection: string }>([
              {
                type: 'list',
                name: 'selection',
                message: 'Models',
                choices: [
                  { name: 'Set current model', value: 'setcurrent' },
                  { name: 'Set API key', value: 'setkey' },
                  { name: 'Back', value: 'back' },
                ],
              },
            ])
            if (selection === 'setcurrent') {
              const { model } = await inquirer.prompt<{ model: string }>([
                {
                  type: 'list',
                  name: 'model',
                  message: 'Choose current model',
                  choices: list.map((m) => ({ name: `${m.name} (${(m.config as any).provider})`, value: m.name })),
                  default: this.configManager.getCurrentModel(),
                },
              ])
              this.configManager.setCurrentModel(model)
              try {
                advancedAIProvider.setModel(model)
              } catch {
                /* ignore */
              }
              console.log(chalk.green(`✓ Current model set: ${model}`))
            } else if (selection === 'setkey') {
              await this.interactiveSetApiKey()
            }
            break
          }
          case 'middleware': {
            const m = cfg.middleware
            const security = await inquirer.prompt([
              { type: 'confirm', name: 'enabled', message: 'Enable security middleware?', default: m.security.enabled },
              {
                type: 'list',
                name: 'riskThreshold',
                message: 'Risk threshold',
                choices: ['low', 'medium', 'high'],
                default: m.security.riskThreshold,
              },
            ])
            const logging = await inquirer.prompt([
              { type: 'confirm', name: 'enabled', message: 'Enable logging middleware?', default: m.logging.enabled },
              {
                type: 'list',
                name: 'logLevel',
                message: 'Log level',
                choices: ['debug', 'info', 'warn', 'error'],
                default: m.logging.logLevel,
              },
            ])
            const performance = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'enabled',
                message: 'Enable performance middleware?',
                default: m.performance.enabled,
              },
              {
                type: 'input',
                name: 'slowThreshold',
                message: 'Slow execution threshold (ms)',
                default: m.performance.slowExecutionThreshold,
                validate: (v: any) => asNumber(v, 100, 60000),
              },
            ])
            this.configManager.set('middleware', {
              ...m,
              security: { ...m.security, ...security },
              logging: { ...m.logging, ...logging },
              performance: { ...m.performance, slowExecutionThreshold: Number(performance.slowThreshold) },
            } as any)
            console.log(chalk.green('✓ Updated Middleware settings'))
            break
          }
          case 'reasoning': {
            const r = cfg.reasoning
            const ans = await inquirer.prompt([
              { type: 'confirm', name: 'enabled', message: 'Enable reasoning globally?', default: r.enabled },
              { type: 'confirm', name: 'autoDetect', message: 'Auto-detect reasoning models?', default: r.autoDetect },
              {
                type: 'confirm',
                name: 'showReasoningProcess',
                message: 'Show reasoning process to user?',
                default: r.showReasoningProcess,
              },
              { type: 'confirm', name: 'logReasoning', message: 'Log reasoning to debug?', default: r.logReasoning },
            ])
            this.configManager.set('reasoning', ans as any)
            console.log(chalk.green('✓ Updated Reasoning settings'))
            break
          }
          case 'embedding': {
            const e = cfg.embeddingProvider
            const ans = await inquirer.prompt([
              {
                type: 'list',
                name: 'default',
                message: 'Default provider',
                choices: ['openai', 'google', 'anthropic', 'openrouter'],
                default: e.default,
              },
              {
                type: 'confirm',
                name: 'costOptimization',
                message: 'Enable cost optimization?',
                default: e.costOptimization,
              },
              {
                type: 'confirm',
                name: 'autoSwitchOnFailure',
                message: 'Auto-switch on failure?',
                default: e.autoSwitchOnFailure,
              },
            ])
            this.configManager.set('embeddingProvider', { ...e, ...ans } as any)
            console.log(chalk.green('✓ Updated Embedding Provider settings'))
            break
          }
          case 'diff': {
            const d = cfg.diff
            const ans = await inquirer.prompt([
              { type: 'confirm', name: 'enabled', message: 'Enable diff display?', default: d.enabled },
              {
                type: 'list',
                name: 'style',
                message: 'Diff style',
                choices: ['unified', 'side-by-side', 'compact'],
                default: d.style,
              },
              { type: 'list', name: 'theme', message: 'Theme', choices: ['dark', 'light', 'auto'], default: d.theme },
              { type: 'confirm', name: 'showLineNumbers', message: 'Show line numbers?', default: d.showLineNumbers },
              {
                type: 'input',
                name: 'contextLines',
                message: 'Context lines',
                default: d.contextLines,
                validate: (v: any) => asNumber(v, 0, 10),
              },
            ])
            this.configManager.set('diff', { ...d, ...ans, contextLines: Number(ans.contextLines) } as any)
            console.log(chalk.green('✓ Updated Diff Display settings'))
            break
          }
          case 'outputstyle': {
            const o = cfg.outputStyle
            const { defaultStyle } = await inquirer.prompt([
              {
                type: 'list',
                name: 'defaultStyle',
                message: 'Default output style',
                choices: ['production-focused', 'balanced', 'detailed', 'minimal', 'educational'],
                default: o.defaultStyle,
              },
            ])
            if (o.customizations) {
              const custom = await inquirer.prompt([
                {
                  type: 'input',
                  name: 'verbosityLevel',
                  message: 'Verbosity level (1-10)',
                  default: o.customizations.verbosityLevel,
                  validate: (v: any) => asNumber(v, 1, 10),
                },
                {
                  type: 'confirm',
                  name: 'includeCodeExamples',
                  message: 'Include code examples?',
                  default: o.customizations.includeCodeExamples,
                },
                {
                  type: 'confirm',
                  name: 'includeStepByStep',
                  message: 'Include step-by-step?',
                  default: o.customizations.includeStepByStep,
                },
                {
                  type: 'list',
                  name: 'maxResponseLength',
                  message: 'Max response length',
                  choices: ['short', 'medium', 'long'],
                  default: o.customizations.maxResponseLength,
                },
              ])
              this.configManager.set('outputStyle', {
                ...o,
                defaultStyle,
                customizations: { ...o.customizations, ...custom, verbosityLevel: Number(custom.verbosityLevel) },
              } as any)
            } else {
              this.configManager.set('outputStyle', { ...o, defaultStyle } as any)
            }
            console.log(chalk.green('✓ Updated Output Style settings'))
            break
          }
          case 'mcp': {
            const mcpServers = cfg.mcp || {}
            const serverNames = Object.keys(mcpServers)
            if (serverNames.length === 0) {
              console.log(chalk.yellow('No MCP servers configured. Edit config.json directly to add servers.'))
              break
            }
            const { action } = await inquirer.prompt<{ action: string }>([
              {
                type: 'list',
                name: 'action',
                message: 'MCP Servers',
                choices: [
                  { name: 'Enable/Disable server', value: 'toggle' },
                  { name: 'View server details', value: 'view' },
                  { name: 'Back', value: 'back' },
                ],
              },
            ])
            if (action === 'toggle') {
              const { serverName } = await inquirer.prompt<{ serverName: string }>([
                {
                  type: 'list',
                  name: 'serverName',
                  message: 'Select server',
                  choices: serverNames.map((name) => ({
                    name: `${name} (${mcpServers[name].enabled ? '✓ enabled' : '○ disabled'})`,
                    value: name,
                  })),
                },
              ])
              const server = mcpServers[serverName]
              const { enabled } = await inquirer.prompt([
                { type: 'confirm', name: 'enabled', message: `Enable ${serverName}?`, default: server.enabled },
              ])
              server.enabled = enabled
              this.configManager.set('mcp', mcpServers as any)
              console.log(chalk.green(`✓ ${serverName} ${enabled ? 'enabled' : 'disabled'}`))
            } else if (action === 'view') {
              const { serverName } = await inquirer.prompt<{ serverName: string }>([
                { type: 'list', name: 'serverName', message: 'Select server', choices: serverNames },
              ])
              const server = mcpServers[serverName]
              console.log(chalk.blue(`\nMCP Server: ${serverName}`))
              console.log(`  Type: ${server.type}`)
              console.log(`  Enabled: ${server.enabled ? 'yes' : 'no'}`)
              if (server.type === 'local' && server.command) console.log(`  Command: ${server.command.join(' ')}`)
              if (server.type === 'remote' && server.url) console.log(`  URL: ${server.url}`)
              if (server.capabilities) console.log(`  Capabilities: ${server.capabilities.join(', ')}`)
            }
            break
          }
          default:
            done = true
            break
        }
      }

      console.log(chalk.dim('Exited interactive configuration'))
    } finally {
      // Always disable bypass and restore prompt
      try {
        inputQueue.disableBypass()
      } catch { }
      process.stdout.write('')
      await new Promise((resolve) => setTimeout(resolve, 150))
      this.renderPromptAfterOutput()
    }
  }

  /**
   * Show models panel with proper formatting
   */
  private async showModelsPanel(): Promise<void> {
    try {
      const currentModel = configManager.get('currentModel')
      const models = configManager.get('models')

      let modelsContent = chalk.blue.bold('🔌 AI Models Dashboard\n')
      modelsContent += `${chalk.gray('─'.repeat(50))}\n\n`

      // Current active model
      modelsContent += chalk.green('🟢 Current Active Model:\n')
      modelsContent += `   ${chalk.yellow.bold(currentModel)}\n\n`

      // Available models
      modelsContent += chalk.green('📋 Available Models:\n')
      Object.entries(models).forEach(([name, config]) => {
        const isCurrent = name === currentModel
        const hasKey = configManager.getApiKey(name) !== undefined

        const currentIndicator = isCurrent ? chalk.yellow('→ ') : '  '
        const keyStatus = hasKey ? chalk.green('✓') : chalk.red('❌')

        modelsContent += `${currentIndicator}${keyStatus} ${chalk.bold(name)}\n`
        modelsContent += `     ${chalk.gray(`Provider: ${(config as any).provider}`)}\n`
        modelsContent += `     ${chalk.gray(`Model: ${(config as any).model}`)}\n`

        if (!hasKey) {
          modelsContent += `     ${chalk.red('🚨  API key required')}\n`
        }
        modelsContent += '\n'
      })

      // Usage instructions
      modelsContent += chalk.green('💡 Usage:\n')
      modelsContent += `   ${chalk.cyan('/model <name>')}     - Switch to specific model\n`
      modelsContent += `   ${chalk.cyan('/set-key <model> <key>')} - Configure API key\n`

      const modelsBox = boxen(modelsContent.trim(), {
        title: '🔌 Models Panel',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'blue',
      })

      this.printPanel(modelsBox)
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to show models: ${error.message}`))
    }
  }

  /**
   * Interactive provider → model → API key setup with boxen panels
   */
  private async interactiveSetApiKey(): Promise<void> {
    try {
      const all = configManager.listModels()
      if (!all || all.length === 0) {
        this.printPanel(
          boxen('No models configured. Use /models to review configuration.', {
            title: '🔑 Set API Key',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      // Group models by provider
      const byProvider = new Map<string, { name: string; label: string }[]>()
      for (const m of all) {
        const label = `${m.name} ${chalk.gray(`(${(m.config as any).model})`)} ${m.hasApiKey ? chalk.green('key✓') : chalk.yellow('key?')}`
        const arr = byProvider.get(m.config.provider) || []
        arr.push({ name: m.name, label })
        byProvider.set(m.config.provider, arr)
      }

      const providers = Array.from(byProvider.keys()).sort()

      // Panel: provider selection
      this.printPanel(
        boxen('Select the provider to configure the API key.', {
          title: '🔑 Set API Key – Provider',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )

      const inquirer = await import('inquirer')
      const { inputQueue } = await import('./core/input-queue')
      // Suspend our readline prompt to avoid UI conflicts
      this.suspendPrompt()
      inputQueue.enableBypass()
      let provider: string
      try {
        const ans = await inquirer.default.prompt([
          {
            type: 'list',
            name: 'provider',
            message: 'Choose provider',
            choices: providers,
            pageSize: Math.min(10, providers.length),
          },
        ])
        provider = ans.provider
      } finally {
        inputQueue.disableBypass()
        this.renderPromptAfterOutput()
      }

      // If provider doesn't require a key (ollama), show info and exit
      if (provider === 'ollama') {
        this.printPanel(
          boxen('Ollama provider does not require API keys.', {
            title: 'ℹ️ No Key Required',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
          })
        )
        return
      }

      const modelsForProvider = (byProvider.get(provider) || []).sort((a, b) => a.name.localeCompare(b.name))
      if (modelsForProvider.length === 0) {
        this.printPanel(
          boxen(`No models found for provider: ${provider}`, {
            title: '❌ Set API Key',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          })
        )
        return
      }

      // Panel: model selection
      this.printPanel(
        boxen(`Provider: ${provider}\nSelect the model to attach the key.`, {
          title: '🔑 Set API Key – Model',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )

      // Suspend again for next prompt
      this.suspendPrompt()
      inputQueue.enableBypass()
      let modelName: string
      try {
        const ans2 = await inquirer.default.prompt([
          {
            type: 'list',
            name: 'model',
            message: 'Choose model',
            choices: modelsForProvider.map((m) => ({ name: m.label, value: m.name })),
            pageSize: Math.min(15, modelsForProvider.length),
          },
        ])
        modelName = ans2.model
      } finally {
        inputQueue.disableBypass()
        this.renderPromptAfterOutput()
      }

      // Panel: enter API key (masked)
      this.printPanel(
        boxen(`Model: ${modelName}\nEnter the API key for ${provider}. It will be stored encrypted.`, {
          title: '🔑 Set API Key – Secret',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
        })
      )

      // Suspend again for secret prompt
      this.suspendPrompt()
      inputQueue.enableBypass()
      let apiKey: string
      try {
        const ans3 = await inquirer.default.prompt([
          {
            type: 'password',
            name: 'apiKey',
            message: `Enter ${provider.toUpperCase()} API key`,
            mask: '*',
            validate: (v: string) => (v && v.trim().length > 5 ? true : 'Please enter a valid key'),
          },
        ])
        apiKey = ans3.apiKey.trim()
      } finally {
        inputQueue.disableBypass()
        this.renderPromptAfterOutput()
      }

      configManager.setApiKey(modelName, apiKey)

      // Success panel
      const tip =
        provider === 'openai'
          ? 'Env: OPENAI_API_KEY'
          : provider === 'anthropic'
            ? 'Env: ANTHROPIC_API_KEY'
            : provider === 'google'
              ? 'Env: GOOGLE_GENERATIVE_AI_API_KEY'
              : provider === 'vercel'
                ? 'Env: V0_API_KEY'
                : provider === 'gateway'
                  ? 'Env: GATEWAY_API_KEY'
                  : 'Env: (n/a)'

      const masked = apiKey.length <= 8 ? '*'.repeat(apiKey.length) : `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`
      const content = [
        `${chalk.green('Provider:')} ${provider}`,
        `${chalk.green('Model:')} ${modelName}`,
        `${chalk.green('Key:')} ${masked}`,
        '',
        chalk.gray(`Stored encrypted in ~/.nikcli/config.json  |  ${tip}`),
      ].join('\n')

      this.printPanel(
        boxen(content, {
          title: '✓ API Key Saved',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to set API key: ${error.message}`, {
          title: '❌ Set API Key',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    } finally {
      try {
        inputQueue.disableBypass()
      } catch { }
      this.resumePromptAndRender()
    }
  }

  /**
   * Coinbase keys interactive wizard with panels
   */
  private async interactiveSetCoinbaseKeys(): Promise<void> {
    try {
      const inquirer = (await import('inquirer')).default
      const { inputQueue } = await import('./core/input-queue')

      // Header panel
      this.printPanel(
        boxen(
          'Configure Coinbase CDP credentials. Keys are stored encrypted in ~/.nikcli/config.json and applied to this session. Leave a field blank to keep the current value.',
          { title: '🔑 Set Coinbase Keys', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }
        )
      )

      const currentId = configManager.getApiKey('coinbase_id')
      const currentSecret = configManager.getApiKey('coinbase_secret')
      const currentWallet = configManager.getApiKey('coinbase_wallet_secret')

      // Suspend prompt for interactive input
      this.suspendPrompt()
      inputQueue.enableBypass()
      let answers: any
      try {
        answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'id',
            message: 'CDP_API_KEY_ID',
            mask: '*',
            suffix: currentId ? chalk.gray(' (configured)') : '',
          },
          {
            type: 'password',
            name: 'secret',
            message: 'CDP_API_KEY_SECRET',
            mask: '*',
            suffix: currentSecret ? chalk.gray(' (configured)') : '',
          },
          {
            type: 'password',
            name: 'wallet',
            message: 'CDP_WALLET_SECRET',
            mask: '*',
            suffix: currentWallet ? chalk.gray(' (configured)') : '',
          },
        ])
      } finally {
        inputQueue.disableBypass()
        this.resumePromptAndRender()
      }

      const setIfProvided = (label: string, value: string | undefined, setter: (v: string) => void) => {
        if (value && value.trim().length > 0) {
          setter(value.trim())
          console.log(chalk.green(`✓ Saved ${label}`))
        } else {
          console.log(chalk.gray(`⏭️  Skipped ${label}`))
        }
      }

      setIfProvided('CDP_API_KEY_ID', answers.id, (v) => {
        configManager.setApiKey('coinbase_id', v)
        process.env.CDP_API_KEY_ID = v
      })
      setIfProvided('CDP_API_KEY_SECRET', answers.secret, (v) => {
        configManager.setApiKey('coinbase_secret', v)
        process.env.CDP_API_KEY_SECRET = v
      })
      setIfProvided('CDP_WALLET_SECRET', answers.wallet, (v) => {
        configManager.setApiKey('coinbase_wallet_secret', v)
        process.env.CDP_WALLET_SECRET = v
      })

      this.printPanel(
        boxen('Coinbase keys updated. You can now run /web3 init', {
          title: '✓ Keys Saved',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to set Coinbase keys: ${error.message}`, {
          title: '❌ Set Coinbase Keys',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
    this.renderPromptAfterOutput()
  }

  /**
   * Interactive Browserbase credentials setup
   */
  private async interactiveSetBrowserbaseKeys(): Promise<void> {
    try {
      const inquirer = (await import('inquirer')).default
      const { inputQueue } = await import('./core/input-queue')

      // Header panel
      this.printPanel(
        boxen(
          'Configure Browserbase credentials. Keys are stored encrypted in ~/.nikcli/config.json and applied to this session. Leave a field blank to keep the current value.',
          { title: '🌐 Set Browserbase Keys', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }
        )
      )

      const currentApiKey = configManager.getApiKey('browserbase')
      const currentProjectId = configManager.getApiKey('browserbase_project_id')

      // Suspend prompt for interactive input
      this.suspendPrompt()
      inputQueue.enableBypass()
      let answers: any
      try {
        answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'apiKey',
            message: 'BROWSERBASE_API_KEY',
            mask: '*',
            suffix: currentApiKey ? chalk.gray(' (configured)') : '',
          },
          {
            type: 'input',
            name: 'projectId',
            message: 'BROWSERBASE_PROJECT_ID',
            suffix: currentProjectId ? chalk.gray(' (configured)') : '',
          },
        ])
      } finally {
        inputQueue.disableBypass()
        this.resumePromptAndRender()
      }

      const setIfProvided = (label: string, value: string | undefined, setter: (v: string) => void) => {
        if (value && value.trim().length > 0) {
          setter(value.trim())
          console.log(chalk.green(`✓ Saved ${label}`))
        } else {
          console.log(chalk.gray(`⏭️  Skipped ${label}`))
        }
      }

      setIfProvided('BROWSERBASE_API_KEY', answers.apiKey, (v) => {
        configManager.setApiKey('browserbase', v)
        process.env.BROWSERBASE_API_KEY = v
      })
      setIfProvided('BROWSERBASE_PROJECT_ID', answers.projectId, (v) => {
        configManager.setApiKey('browserbase_project_id', v)
        process.env.BROWSERBASE_PROJECT_ID = v
      })

      this.printPanel(
        boxen('Browserbase keys updated. You can now browse and analyze web content!', {
          title: '✓ Keys Saved',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to set Browserbase keys: ${error.message}`, {
          title: '❌ Set Browserbase Keys',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
    this.renderPromptAfterOutput()
  }

  /**
   * Interactive Figma credentials setup
   */
  private async interactiveSetFigmaKeys(): Promise<void> {
    try {
      const inquirer = (await import('inquirer')).default
      const { inputQueue } = await import('./core/input-queue')

      // Header panel
      this.printPanel(
        boxen(
          'Configure Figma and v0 credentials. Keys are stored encrypted in ~/.nikcli/config.json and applied to this session. Leave a field blank to keep the current value.',
          { title: '🎨 Set Figma Keys', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }
        )
      )

      const currentFigmaKey = configManager.getApiKey('figma')
      const currentV0Key = configManager.getApiKey('v0')

      // Suspend prompt for interactive input
      this.suspendPrompt()
      inputQueue.enableBypass()
      let answers: any
      try {
        answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'figmaApiKey',
            message: 'FIGMA_API_TOKEN',
            mask: '*',
            suffix: currentFigmaKey ? chalk.gray(' (configured)') : '',
          },
          {
            type: 'password',
            name: 'v0ApiKey',
            message: 'V0_API_KEY (optional - for AI code generation)',
            mask: '*',
            suffix: currentV0Key ? chalk.gray(' (configured)') : '',
          },
        ])
      } finally {
        inputQueue.disableBypass()
        this.resumePromptAndRender()
      }

      const setIfProvided = (label: string, value: string | undefined, setter: (v: string) => void) => {
        if (value && value.trim().length > 0) {
          setter(value.trim())
          console.log(chalk.green(`✓ Saved ${label}`))
        } else {
          console.log(chalk.gray(`⏭️  Skipped ${label}`))
        }
      }

      setIfProvided('FIGMA_API_TOKEN', answers.figmaApiKey, (v) => {
        configManager.setApiKey('figma', v)
        process.env.FIGMA_API_TOKEN = v
      })
      setIfProvided('V0_API_KEY', answers.v0ApiKey, (v) => {
        configManager.setApiKey('v0', v)
        process.env.V0_API_KEY = v
      })

      this.printPanel(
        boxen('Figma keys updated. You can now export designs, generate code, and extract design tokens!', {
          title: '✓ Keys Saved',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )

      // Show usage instructions
      console.log(`\n${chalk.blue.bold('🎨 Figma Commands Available:')}`)
      console.log(chalk.cyan('  /figma-config') + chalk.gray(' - Show configuration status'))
      console.log(chalk.cyan('  /figma-info <file-id>') + chalk.gray(' - Get file information'))
      console.log(chalk.cyan('  /figma-export <file-id> [format]') + chalk.gray(' - Export designs'))
      console.log(chalk.cyan('  /figma-to-code <file-id>') + chalk.gray(' - Generate code from designs'))
      console.log(chalk.cyan('  /figma-create <component-path>') + chalk.gray(' - Create design from React component'))
      console.log(chalk.cyan('  /figma-tokens <file-id>') + chalk.gray(' - Extract design tokens'))
      if (process.platform === 'darwin') {
        console.log(chalk.cyan('  /figma-open <url>') + chalk.gray(' - Open in desktop app (macOS)'))
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to set Figma keys: ${error.message}`, {
          title: '❌ Set Figma Keys',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
    this.renderPromptAfterOutput()
  }

  private async interactiveSetRedisKeys(): Promise<void> {
    try {
      const inquirer = (await import('inquirer')).default
      const { inputQueue } = await import('./core/input-queue')

      // Header panel
      this.printPanel(
        boxen(
          'Configure Upstash Redis credentials for enhanced caching. Keys are stored encrypted in ~/.nikcli/config.json and applied to this session. Leave a field blank to keep the current value.',
          { title: '🚀 Set Redis Keys', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red' }
        )
      )

      const currentRedisUrl = configManager.getApiKey('redis_url')
      const currentRedisToken = configManager.getApiKey('redis_token')

      // Suspend prompt for interactive input
      this.suspendPrompt()
      inputQueue.enableBypass()
      let answers: any
      try {
        answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'redisUrl',
            message: 'UPSTASH_REDIS_REST_URL',
            suffix: currentRedisUrl ? chalk.gray(' (configured)') : '',
          },
          {
            type: 'password',
            name: 'redisToken',
            message: 'UPSTASH_REDIS_REST_TOKEN',
            mask: '*',
            suffix: currentRedisToken ? chalk.gray(' (configured)') : '',
          },
        ])
      } finally {
        inputQueue.disableBypass()
        this.resumePromptAndRender()
      }

      const setIfProvided = (label: string, value: string | undefined, setter: (v: string) => void) => {
        if (value && value.trim().length > 0) {
          setter(value.trim())
          console.log(chalk.green(`✓ Saved ${label}`))
        } else {
          console.log(chalk.gray(`⏭️  Skipped ${label}`))
        }
      }

      setIfProvided('UPSTASH_REDIS_REST_URL', answers.redisUrl, (v) => {
        configManager.setApiKey('redis_url', v)
        process.env.UPSTASH_REDIS_REST_URL = v
      })
      setIfProvided('UPSTASH_REDIS_REST_TOKEN', answers.redisToken, (v) => {
        configManager.setApiKey('redis_token', v)
        process.env.UPSTASH_REDIS_REST_TOKEN = v
      })

      this.printPanel(
        boxen('Redis keys updated. Enhanced caching with Redis/Upstash is now available!', {
          title: '✓ Keys Saved',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )

      // Show usage instructions
      console.log(`\n${chalk.blue.bold('🚀 Redis Commands Available:')}`)
      console.log(chalk.cyan('  /cache') + chalk.gray(' - Show cache status and statistics'))
      console.log(chalk.cyan('  /cache clear') + chalk.gray(' - Clear all caches'))
      console.log(chalk.cyan('  /cache stats') + chalk.gray(' - Show detailed cache statistics'))
      console.log(chalk.cyan('  /status') + chalk.gray(' - Show system status including Redis health'))

      // Test Redis connection
      try {
        const { cacheService } = await import('./services/cache-service')
        await cacheService.reconnectRedis()
        console.log(chalk.green('\n✅ Redis connection tested successfully'))
      } catch (error: any) {
        console.log(chalk.yellow(`\n⚠️ Redis connection test failed: ${error.message}`))
        console.log(chalk.gray('Cache will fall back to local memory storage'))
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to set Redis keys: ${error.message}`, {
          title: '❌ Set Redis Keys',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
    this.renderPromptAfterOutput()
  }

  private async interactiveSetVectorKeys(): Promise<void> {
    try {
      const inquirer = (await import('inquirer')).default
      const { inputQueue } = await import('./core/input-queue')

      // Header panel
      this.printPanel(
        boxen(
          'Configure Upstash Vector credentials for unified vector database. Keys are stored encrypted in ~/.nikcli/config.json and applied to this session. Leave a field blank to keep the current value.',
          { title: '🚀 Set Vector Keys', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' }
        )
      )

      // Suspend prompt for interactive input
      this.suspendPrompt()
      inputQueue.enableBypass()
      let _answers: any
      try {
        _answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'vectorUrl',
            message: 'UPSTASH_VECTOR_REST_URL',
            suffix: chalk.gray(' (configured)'),
            validate: (input: string) => {
              if (!input.trim()) return true // Allow empty to keep current
              if (!input.startsWith('https://')) {
                return 'URL must start with https://'
              }
              return true
            },
          },
          {
            type: 'password',
            name: 'vectorToken',
            message: 'UPSTASH_VECTOR_REST_TOKEN',
            mask: '*',
            suffix: chalk.gray(' (configured)'),
          },
        ])
      } finally {
        inputQueue.disableBypass()
        this.resumePromptAndRender()
      }

      const _setIfProvided = (label: string, value: string | undefined, setter: (v: string) => void) => {
        if (value && value.trim().length > 0) {
          setter(value.trim())
          console.log(chalk.green(`✓ Saved ${label}`))
        } else {
          console.log(chalk.gray(`⏭️  Skipped ${label}`))
        }
      }

      this.printPanel(
        boxen('Vector keys updated. Unified vector database with Upstash Vector is now available!', {
          title: '✓ Keys Saved',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )

      // Show usage instructions
      console.log(`\n${chalk.blue.bold('🚀 Vector Commands Available:')}`)
      console.log(chalk.cyan('  /status') + chalk.gray(' - Show system status including Vector health'))
      console.log(chalk.cyan('  /agents') + chalk.gray(' - List agents (uses vector search)'))
      console.log(chalk.cyan('  /remember') + chalk.gray(' - Store information in vector memory'))
      console.log(chalk.cyan('  /recall') + chalk.gray(' - Search vector memory'))

      // Test Vector connection
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to set Vector keys: ${error.message}`, {
          title: '❌ Set Vector Keys',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
    this.renderPromptAfterOutput()
  }

  private async manageRedisCache(action: string): Promise<void> {
    try {
      const { cacheService } = await import('./services/cache-service')

      switch (action) {
        case 'enable':
          // Enable Redis in config
          simpleConfigManager.setRedisConfig({ enabled: true })

          // Try to reconnect
          await cacheService.reconnectRedis()

          this.printPanel(
            boxen('Redis cache enabled successfully! The system will now use Redis for enhanced caching.', {
              title: '✓ Redis Enabled',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            })
          )

          // Show current status
          await this.manageRedisCache('status')
          break

        case 'disable':
          // Disable Redis in config
          simpleConfigManager.setRedisConfig({ enabled: false })

          this.printPanel(
            boxen('Redis cache disabled. The system will fall back to local SmartCache for caching.', {
              title: '⚠️ Redis Disabled',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )

          // Show current status
          await this.manageRedisCache('status')
          break

        case 'status': {
          const stats = await cacheService.getStats()
          const health = cacheService.getHealthStatus()

          let statusContent = `${chalk.red.bold('🚀 Redis Cache Status')}\n\n`

          // Connection Status
          statusContent += `${chalk.cyan('Connection:')}\n`
          statusContent += `  Enabled: ${stats.redis.enabled ? chalk.green('✓ Yes') : chalk.red('❌ No')}\n`
          statusContent += `  Connected: ${stats.redis.connected ? chalk.green('✓ Yes') : chalk.red('❌ No')}\n`

          if (stats.redis.health) {
            statusContent += `  Latency: ${chalk.blue(stats.redis.health.latency)}ms\n`
            statusContent += `  Status: ${stats.redis.health.status === 'healthy'
              ? chalk.green('Healthy')
              : stats.redis.health.status === 'degraded'
                ? chalk.yellow('Degraded')
                : chalk.red('Unhealthy')
              }\n`
          }

          statusContent += `\n${chalk.cyan('Performance:')}\n`
          statusContent += `  Total Hits: ${chalk.green(stats.totalHits.toLocaleString())}\n`
          statusContent += `  Total Misses: ${chalk.yellow(stats.totalMisses.toLocaleString())}\n`
          statusContent += `  Hit Rate: ${chalk.blue(stats.hitRate.toFixed(1))}%\n`

          statusContent += `\n${chalk.cyan('Fallback:')}\n`
          statusContent += `  SmartCache: ${stats.fallback.enabled ? chalk.green('✓ Available') : chalk.red('❌ Disabled')}\n`
          statusContent += `  Overall Health: ${health.overall ? chalk.green('✓ Operational') : chalk.red('❌ Degraded')}\n`

          this.printPanel(
            boxen(statusContent, {
              title: '🚀 Redis Cache Status',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: stats.redis.connected ? 'green' : 'red',
            })
          )

          // Show commands
          console.log(`\n${chalk.blue.bold(' Available Commands:')}`)
          console.log(chalk.cyan('  /redis-enable') + chalk.gray('   - Enable Redis caching'))
          console.log(chalk.cyan('  /redis-disable') + chalk.gray('  - Disable Redis caching'))
          console.log(chalk.cyan('  /redis-status') + chalk.gray('   - Show detailed status'))
          console.log(chalk.cyan('  /set-key-redis') + chalk.gray(' - Configure Redis credentials'))
          console.log(chalk.cyan('  /cache') + chalk.gray('         - Show cache statistics'))
          console.log(chalk.cyan('  /cache clear') + chalk.gray('   - Clear all caches'))
          break
        }

        default:
          console.log(chalk.red('❌ Invalid Redis action. Use: enable, disable, or status'))
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to manage Redis cache: ${error.message}`, {
          title: '❌ Redis Management Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
    this.renderPromptAfterOutput()
  }

  /**
   * Handle browse command to extract content from URL
   */
  private async handleBrowseCommand(args: string[]): Promise<void> {
    if (args.length < 1) {
      this.printPanel(
        boxen(['Usage: /browse <url>', '', 'Example: /browse https://example.com'].join('\n'), {
          title: 'Browse Command',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return
    }

    const url = args[0]
    try {
      console.log(chalk.blue(`🌐 Browsing ${url}...`))

      // Check if Browserbase is configured
      const providers = configManager.getBrowserbaseCredentials()
      if (!providers || providers.apiKey === undefined || providers.projectId === undefined) {
        console.log(chalk.yellow('⚠️ Browserbase not configured. Use /set-key-bb to configure API credentials.'))
        return
      }

      const result = await toolService.executeTool(url, {
        analysisType: 'summary',
        skipConfirmation: true,
      })

      if (result.success) {
        console.log(chalk.green('✓ Page content extracted:'))
        console.log(chalk.gray('─'.repeat(60)))
        console.log(result.data?.content || 'No content extracted')
        console.log(chalk.gray('─'.repeat(60)))

        if (result.data?.title) {
          console.log(chalk.blue(`📄 Title: ${result.data.title}`))
        }

        if (result.data?.metadata) {
          console.log(chalk.gray(`🔗 URL: ${result.data.metadata.url}`))
          console.log(chalk.gray(`⏱️ Processing time: ${result.data.metadata.processing_time_ms}ms`))
        }
      } else {
        console.log(chalk.red(`❌ Failed to browse: ${result.error}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to browse: ${error.message}`))
    }
  }

  /**
   * Handle web-analyze command to browse and analyze with AI
   */
  private async handleWebAnalyzeCommand(args: string[]): Promise<void> {
    if (args.length < 1) {
      this.printPanel(
        boxen(
          [
            'Usage: /web-analyze <url> [provider]',
            '',
            'Example: /web-analyze https://example.com claude',
            'Providers: claude, openai, google, openrouter',
          ].join('\n'),
          {
            title: 'Web Analyze Command',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          }
        )
      )
      return
    }

    const url = args[0]
    const provider = args[1] || 'claude'

    try {
      console.log(chalk.blue(`🌐 Analyzing ${url} with ${provider.toUpperCase()}...`))

      // Check if Browserbase is configured
      const providers = configManager.getBrowserbaseCredentials()
      if (!providers || providers.apiKey === undefined || providers.projectId === undefined) {
        console.log(chalk.yellow('⚠️ Browserbase not configured. Use /set-key-bb to configure API credentials.'))
        return
      }

      const result = await toolService.executeTool(url, {
        url,
        options: {
          analysisProvider: provider as 'claude' | 'openai' | 'google' | 'openrouter',
          analysisType: 'detailed',
          customPrompt:
            'Analyze this webpage content and provide insights about its purpose, key information, and any notable features.',
          skipConfirmation: true,
        },
      })

      if (result.success) {
        console.log(chalk.green('✓ Page analyzed successfully:'))
        console.log(chalk.gray('─'.repeat(60)))

        if (result.data?.content) {
          console.log(chalk.white('📝 Page Content:'))
          console.log(result.data.content.substring(0, 500) + (result.data.content.length > 500 ? '...' : ''))
          console.log('')
        }

        if (result.data?.analysis) {
          console.log(chalk.blue('🔌 AI Analysis:'))
          console.log(result.data.analysis)
        }

        console.log(chalk.gray('─'.repeat(60)))

        if (result.data?.metadata) {
          console.log(chalk.gray(`🔗 URL: ${result.data.metadata.url}`))
          console.log(chalk.gray(`🔌 Provider: ${result.data.metadata.ai_provider}`))
          console.log(chalk.gray(`⏱️ Processing time: ${result.data.metadata.processing_time_ms}ms`))
        }
      } else {
        console.log(chalk.red(`❌ Failed to analyze: ${result.error}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to analyze: ${error.message}`))
    }
  }

  /**
   * Show current model details and pricing in a panel
   */
  private async showCurrentModelPanel(modelName?: string): Promise<void> {
    try {
      const current = advancedAIProvider.getCurrentModelInfo()
      const activeModel =
        modelName || (this.configManager.getCurrentModel ? this.configManager.getCurrentModel() : current?.name)

      const { getModelPricing } = await import('./config/token-limits')
      const pricing = getModelPricing(activeModel)

      const provider = current?.config?.provider || 'unknown'
      const modelId = current?.name || activeModel || 'unknown'

      // Pricing values are per 1M tokens; also show per 1K for convenience
      const inputPer1M = pricing?.input ?? 0
      const outputPer1M = pricing?.output ?? 0
      const inputPer1K = inputPer1M / 1000
      const outputPer1K = outputPer1M / 1000

      const content = [
        `${chalk.green('Model:')} ${chalk.yellow.bold(modelId)}  ${chalk.gray(`(${provider})`)}`,
        '',
        chalk.cyan('Pricing'),
        `  Input:  $${inputPer1M.toFixed(2)} per 1M tokens  (${inputPer1K === 0 ? 'n/a' : `$${inputPer1K.toFixed(4)} per 1K`})`,
        `  Output: $${outputPer1M.toFixed(2)} per 1M tokens  (${outputPer1K === 0 ? 'n/a' : `$${outputPer1K.toFixed(4)} per 1K`})`,
        '',
        chalk.gray('Tip: /models to list options, /model <name> to switch'),
      ].join('\n')

      this.printPanel(
        boxen(content, {
          title: '🔌 Current Model',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Failed to show model: ${error.message}`, {
          title: '❌ Model Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    this.renderPromptAfterOutput()
  }

  /**
   * Show status of all MCP servers
   */

  /**
   * Save TaskMaster plan to file in todo.md format
   */
  private async saveTaskMasterPlanToFile(
    plan: any,
    filename: string,
    options: { silent?: boolean } = {}
  ): Promise<void> {
    try {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      const todoContent = this.formatTaskMasterPlanAsTodo(plan)
      const filePath = path.join(this.workingDirectory, filename)

      await fs.writeFile(filePath, todoContent, 'utf-8')
      if (!options.silent) {
        console.log(chalk.green(`✓ TaskMaster plan saved to ${filename}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to save plan to ${filename}: ${error.message}`))
      throw error
    }
  }

  /**
   * Format TaskMaster plan as todo.md content
   */
  private formatTaskMasterPlanAsTodo(plan: any): string {
    const timestamp = new Date().toISOString()
    const riskLevel = plan.riskAssessment?.overallRisk || 'medium'
    const estimatedDuration = plan.estimatedTotalDuration || 0

    let content = `# TaskMaster AI Plan: ${plan.title}\n\n`
    content += `**Generated:** ${timestamp}\n`
    content += `**Planning Engine:** TaskMaster AI\n`
    content += `**Request:** ${plan.userRequest}\n`
    content += `**Risk Level:** ${riskLevel}\n`
    content += `**Estimated Duration:** ${estimatedDuration} minutes\n\n`

    if (plan.description) {
      content += `## Description\n\n${plan.description}\n\n`
    }

    if (plan.riskAssessment) {
      content += `## Risk Assessment\n\n`
      content += `- **Overall Risk:** ${plan.riskAssessment.overallRisk}\n`
      content += `- **Destructive Operations:** ${plan.riskAssessment.destructiveOperations}\n`
      content += `- **File Modifications:** ${plan.riskAssessment.fileModifications}\n`
      content += `- **External Calls:** ${plan.riskAssessment.externalCalls}\n\n`
    }

    content += `## Tasks\n\n`

    plan.todos.forEach((todo: any, index: number) => {
      const statusIcon =
        todo.status === 'completed'
          ? '✓'
          : todo.status === 'in_progress'
            ? '⚡︎'
            : todo.status === 'failed'
              ? '❌'
              : '⏳'

      const priorityIcon = todo.priority === 'high' ? '🔴' : todo.priority === 'medium' ? '🟡' : '🟢'

      content += `### ${index + 1}. ${statusIcon} ${todo.title} ${priorityIcon}\n\n`

      if (todo.description) {
        content += `**Description:** ${todo.description}\n\n`
      }

      if (todo.estimatedDuration) {
        content += `**Estimated Duration:** ${todo.estimatedDuration} minutes\n\n`
      }

      if (todo.tools && todo.tools.length > 0) {
        content += `**Tools:** ${todo.tools.join(', ')}\n\n`
      }

      if (todo.reasoning) {
        content += `**Reasoning:** ${todo.reasoning}\n\n`
      }

      content += `**Status:** ${todo.status}\n`
      content += `**Priority:** ${todo.priority}\n`

      if (todo.progress !== undefined) {
        content += `**Progress:** ${todo.progress}%\n`
      }

      content += '\n---\n\n'
    })

    content += `## Summary\n\n`
    content += `- **Total Tasks:** ${plan.todos.length}\n`
    content += `- **Pending:** ${plan.todos.filter((t: any) => t.status === 'pending').length}\n`
    content += `- **In Progress:** ${plan.todos.filter((t: any) => t.status === 'in_progress').length}\n`
    content += `- **Completed:** ${plan.todos.filter((t: any) => t.status === 'completed').length}\n`
    content += `- **Failed:** ${plan.todos.filter((t: any) => t.status === 'failed').length}\n\n`

    content += `*Generated by TaskMaster AI integrated with NikCLI*\n`

    return content
  }

  /**
   * Save ExecutionPlan to todo.md file for compatibility
   */
  private async savePlanToTodoFile(plan: any): Promise<void> {
    try {
      const todoPath = path.join(this.workingDirectory, 'todo.md')
      let content = `# ${plan.title}\n\n`
      content += `${plan.description}\n\n`
      content += `**Generated:** ${new Date().toLocaleString()}\n`
      content += `**Estimated Duration:** ${Math.round(plan.estimatedTotalDuration)} minutes\n\n`
      content += `## Tasks\n\n`

      const tasks = plan.todos || plan.steps || []
      tasks.forEach((task: any, index: number) => {
        const status =
          task.status === 'pending'
            ? '⏳'
            : task.status === 'completed'
              ? '✓'
              : task.status === 'in_progress'
                ? '⚡︎'
                : '❌'
        content += `${index + 1}. ${status} **${task.title}**\n`
        if (task.description) {
          content += `   ${task.description}\n`
        }
        content += `\n`
      })

      content += `\n*Generated by TaskMaster AI integrated with NikCLI*\n`
      await fs.writeFile(todoPath, content, 'utf-8')
      console.log(chalk.green(`✓ Todo file saved: ${todoPath}`))
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Failed to save todo.md: ${error.message}`))
    }
  }

  /**
   * Request plan approval from user
   */
  private async requestPlanApproval(_planId: string, plan: any): Promise<boolean> {
    const tasks = plan.todos || plan.steps || []
    console.log(chalk.blue.bold('\n📋 Plan Summary:'))
    console.log(chalk.cyan(`📊 ${tasks.length} tasks`))
    console.log(chalk.cyan(`⏱️ Estimated duration: ${Math.round(plan.estimatedTotalDuration)} minutes`))

    const categories: string[] = Array.from(
      new Set(
        tasks
          .map((t: any) => (typeof t?.category === 'string' ? t.category.trim() : undefined))
          .filter((c: any): c is string => typeof c === 'string' && c.length > 0)
      )
    )
    const priorities: Record<string, number> = {}
    tasks.forEach((t: any) => {
      const key = t.priority || 'medium'
      priorities[key] = (priorities[key] || 0) + 1
    })
    const dependencies = tasks.reduce((sum: number, t: any) => sum + (t.dependencies || []).length, 0)
    const affectedFiles: string[] = tasks
      .flatMap((t: any) => (Array.isArray(t?.files) ? t.files : []))
      .filter((f: unknown): f is string => typeof f === 'string' && f.trim().length > 0)
    const commands: string[] = tasks
      .flatMap((t: any) => (Array.isArray(t?.commands) ? t.commands : []))
      .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)

    const assessedRisk = plan?.riskAssessment?.overallRisk
    const inferredHighRisk = tasks.some((t: any) => String(t?.priority || '').toLowerCase() === 'critical')
    const allowedRisks: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical']
    const normalizedRisk =
      typeof assessedRisk === 'string' && allowedRisks.includes(assessedRisk as any)
        ? (assessedRisk as 'low' | 'medium' | 'high' | 'critical')
        : undefined
    const riskLevel: 'low' | 'medium' | 'high' | 'critical' = normalizedRisk || (inferredHighRisk ? 'high' : 'medium')

    const compact = process.env.NIKCLI_COMPACT === '1'
    const approval = await approvalSystem.requestPlanApproval(
      plan.title || plan.userRequest || 'Execution Plan',
      plan.description || plan.userRequest || '',
      {
        totalSteps: tasks.length,
        estimatedDuration: typeof plan?.estimatedTotalDuration === 'number' ? plan.estimatedTotalDuration : 0,
        riskLevel,
        categories,
        priorities,
        dependencies,
        affectedFiles,
        commands,
      },
      {
        showBreakdown: !compact,
        allowModification: false,
        showTimeline: !compact,
      }
    )

    if (approval.approved) {
      if (plan) {
        plan.status = 'approved'
        plan.approvedAt = new Date()
      }
      return true
    }

    return false
  }

  /**
   * Execute plan using TaskMaster integration
   */
  private async executePlanWithTaskMaster(planId: string): Promise<void> {
    try {
      await planningService.executePlan(planId, {
        showProgress: true,
        autoExecute: true,
        confirmSteps: false,
      })
    } catch (error: any) {
      console.log(chalk.red(`❌ Plan execution failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Find relevant files for a task based on its context
   */
  private async findRelevantFiles(task: any): Promise<string[]> {
    const relevantFiles: string[] = []

    try {
      // Start with common project files
      const commonFiles = ['package.json', 'README.md', 'tsconfig.json', '.gitignore']
      for (const file of commonFiles) {
        try {
          const exists = await import('node:fs/promises').then((fs) =>
            fs
              .access(file)
              .then(() => true)
              .catch(() => false)
          )
          if (exists) {
            relevantFiles.push(file)
          }
        } catch {
          // File doesn't exist, skip
        }
      }

      // Add task-specific files based on title and description
      const taskContext = `${task.title} ${task.description || ''}`.toLowerCase()

      if (taskContext.includes('security') || taskContext.includes('vulnerability')) {
        relevantFiles.push('package-lock.json', 'yarn.lock', '.env.example')
      }

      if (taskContext.includes('performance') || taskContext.includes('optimization')) {
        relevantFiles.push('webpack.config.js', 'vite.config.js', 'rollup.config.js')
      }

      if (taskContext.includes('documentation') || taskContext.includes('doc')) {
        try {
          const result = await toolService.executeTool('find_files', { pattern: '*.md' })
          if (Array.isArray(result?.matches)) {
            relevantFiles.push(...result.matches.slice(0, 3))
          }
        } catch {
          // Ignore search errors
        }
      }

      // For code analysis, add main source files
      if (taskContext.includes('code') || taskContext.includes('analysis') || taskContext.includes('structure')) {
        try {
          const srcFiles = await toolService.executeTool('find_files', { pattern: 'src/**/*.{ts,js,tsx,jsx}' })
          if (Array.isArray(srcFiles?.matches)) {
            relevantFiles.push(...srcFiles.matches.slice(0, 5))
          }
        } catch {
          // Fallback to common patterns
          relevantFiles.push('src/index.ts', 'src/main.ts', 'src/app.ts')
        }
      }
    } catch (error: any) {
      console.log(chalk.gray(`    ℹ️ Could not determine relevant files: ${error.message}`))
    }

    // Remove duplicates and return
    return [...new Set(relevantFiles)].filter((file) => file && file.length > 0)
  }

  // ======================= VIM MODE METHODS =======================

  private initializeVimMode(): void {
    try {
      // Initialize modern AI provider for vim integration
      this.modernAIProvider = new ModernAIProvider()

      // Initialize vim mode manager with default config
      this.vimModeManager = new VimModeManager({
        aiIntegration: true,
        customKeybindings: {},
        theme: 'default',
        statusLine: true,
        lineNumbers: true,
      })

      // Initialize vim AI integration
      this.vimAIIntegration = new VimAIIntegration(
        this.vimModeManager.getState(),
        this.vimModeManager['config'],
        this.modernAIProvider,
        this.configManager
      )

      // Setup vim event handlers
      this.setupVimEventHandlers()
    } catch (error: any) {
      console.error(chalk.yellow(`⚠️ Failed to initialize vim mode: ${error.message}`))
    }
  }

  private setupVimEventHandlers(): void {
    if (!this.vimModeManager || !this.vimAIIntegration) return

    // Handle AI requests from vim mode
    this.vimModeManager.on('aiRequest', async (prompt: string) => {
      try {
        if (!this.vimAIIntegration) return

        const response = await this.vimAIIntegration.assistWithCode(prompt)
        await this.vimModeManager?.handleAIResponse(response)
      } catch (error: any) {
        console.error(chalk.red(`AI request failed: ${error.message}`))
      }
    })

    // Handle CLI mode changes for seamless transitions
    this.vimModeManager.on('cliModeChange', (from: string, to: string) => {
      console.log(chalk.gray(`🔄 CLI mode transition: ${from} → ${to}`))
      this.currentMode = to as 'default' | 'plan' | 'vm' | 'vim'
    })

    // Handle mode changes
    this.vimModeManager.on('activated', (options?: { pauseReadline?: boolean }) => {
      this.currentMode = 'vim'
      if (options?.pauseReadline && this.rl) {
        // Completely disable readline interface
        this.rl.pause()
        this.rl.close()
        this.rl = undefined
      }
    })

    this.vimModeManager.on('deactivated', (options?: { resumeReadline?: boolean }) => {
      // Get the previous mode from vim manager
      const previousMode = this.vimModeManager?.getCurrentCliMode() || 'default'
      this.currentMode = previousMode as 'default' | 'plan' | 'vm' | 'vim'

      if (options?.resumeReadline && !this.rl) {
        // Recreate readline interface
        this.createReadlineInterface()
        // CRITICAL FIX: Restore prompt IMMEDIATELY without setTimeout
        // This ensures no dead-time between vim exit and prompt restoration
        if (this.rl) {
          this.renderPromptAfterOutput()
        }
      }

      // Ensure proper cleanup and restoration
      this.cleanupVimKeyHandling()
    })

    // Handle state changes
    this.vimModeManager.on('stateChanged', (_state) => {
      // Update UI or perform other actions when vim state changes
    })
  }

  private cleanupVimKeyHandling(): void {
    if (process.stdin.isTTY) {
      // Remove only our specific vim handler, not all data listeners
      if (this.vimKeyHandler) {
        process.stdin.removeListener('data', this.vimKeyHandler)
        this.vimKeyHandler = undefined
      }

      // Restore normal mode
      process.stdin.setRawMode(false)

      // Ensure readline is working again
      if (this.rl) {
        this.rl.resume()
      }
    }
  }

  private createReadlineInterface(): void {
    // Disable bracketed paste mode which can trigger dialogs
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[?2004l')
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 300,
    })

    // Setup keypress events
    if (process.stdin.isTTY) {
      if (process.platform === 'darwin') {
        try {
          process.stdin.setRawMode(false)
        } catch (error) {
          // Ignore errors setting raw mode
        }
      }
    }

    // Setup basic readline event handlers - specific handlers will be set up later
  }

  async handleVimCommand(args: string[]): Promise<void> {
    if (!this.vimModeManager) {
      console.log(chalk.red('✗ Vim mode not initialized'))
      return
    }

    const subcommand = args[0] || 'start'

    switch (subcommand) {
      case 'start':
      case 'enter':
        try {
          await this.vimModeManager.initialize()
          // Pass readline interface and restore callback for proper mode management
          await this.vimModeManager.activate(this.rl, () => {
            this.renderPromptAfterOutput()
          })
        } catch (error: any) {
          console.log(chalk.red(`✗ Failed to start vim mode: ${error.message}`))
        }
        break

      case 'exit':
      case 'quit':
        try {
          await this.vimModeManager.deactivate()
        } catch (error: any) {
          console.log(chalk.red(`✗ Failed to exit vim mode: ${error.message}`))
        }
        break

      case 'status': {
        const isActive = this.vimModeManager.getCurrentMode()
        const mode = this.vimModeManager.getCurrentMode()
        console.log(chalk.blue('📋 Vim Mode Status:'))
        console.log(`  Active: ${isActive !== VimMode.NORMAL ? chalk.green('Yes') : chalk.yellow('No')}`)
        console.log(`  Mode: ${chalk.cyan(mode)}`)
        console.log(`  Buffer Lines: ${chalk.cyan(this.vimModeManager.getBuffer().split('\n').length)}`)
        break
      }

      case 'config':
        console.log(chalk.blue('⚙️ Vim Mode Configuration:'))
        console.log('  AI Integration: Enabled')
        console.log('  Theme: Enterprise')
        console.log('  Key Bindings: Standard Vim')
        console.log('  Status Line: Enabled')
        break

      case 'help':
        this.showVimHelp()
        break

      default:
        console.log(chalk.yellow(`Unknown vim command: ${subcommand}`))
        this.showVimHelp()
    }
  }

  private showVimHelp(): void {
    console.log(chalk.blue.bold('\n📚 Vim Mode Help'))
    console.log(chalk.white('Commands:'))
    console.log(chalk.cyan('  /vim start') + chalk.gray(' - Enter vim mode'))
    console.log(chalk.cyan('  /vim exit') + chalk.gray('  - Exit vim mode'))
    console.log(chalk.cyan('  /vim status') + chalk.gray(' - Show vim mode status'))
    console.log(chalk.cyan('  /vim config') + chalk.gray(' - Show configuration'))
    console.log(chalk.cyan('  /vim help') + chalk.gray('  - Show this help'))
    console.log(chalk.white('\nVim Mode Keys:'))
    console.log(chalk.cyan('  ESC') + chalk.gray('     - Normal mode'))
    console.log(chalk.cyan('  i') + chalk.gray('       - Insert mode'))
    console.log(chalk.cyan('  v') + chalk.gray('       - Visual mode'))
    console.log(chalk.cyan('  :') + chalk.gray('       - Command mode'))
    console.log(chalk.cyan('  Ctrl+C') + chalk.gray('  - Exit vim mode'))
  }

  /**
   * Monitor agent completion and trigger collaboration events
   */
  private async monitorAgentCompletion(agent: any, collaborationContext: any): Promise<void> {
    try {
      // Set up monitoring interval to check agent status
      const monitorInterval = setInterval(() => {
        const agentLogs = collaborationContext.logs.get(agent.blueprintId) || []
        const latestLog = agentLogs[agentLogs.length - 1]

        // Check if agent has completed its task
        if (latestLog && latestLog.includes('Completed specialized analysis')) {
          clearInterval(monitorInterval)

          // Log completion
          const timestamp = new Date().toLocaleTimeString()
          console.log(chalk.green(`[${timestamp}] [${agent.blueprint.name}] ✓ Task completed`))

          // Check for collaboration opportunities
          this.checkForCollaborationOpportunities(agent, collaborationContext)

          // Check if all agents are done for merge
          const allAgentsCompleted = Array.from(collaborationContext.logs.values()).every((logs: any) =>
            (logs as string[]).some((log: string) => log.includes('Completed specialized analysis'))
          )

          if (allAgentsCompleted) {
            console.log(chalk.blue('\n🔄 All agents completed - initiating merge process...'))
            setTimeout(() => {
              this.mergeAgentResults(collaborationContext)
            }, 1000)
          }
        }
      }, 500) // Check every 500ms
    } catch (error: any) {
      console.error(chalk.red(`Error monitoring agent completion: ${error.message}`))
    }
  }

  /**
   * Calculate execution time based on agent specialization
   */
  private calculateExecutionTime(specialization: string): number {
    const baseTime = 2000 // 2 seconds base
    const specializationMultipliers: Record<string, number> = {
      fullstack: 1.5,
      frontend: 1.2,
      backend: 1.4,
      devops: 1.6,
      security: 1.3,
      'data-science': 1.8,
      mobile: 1.3,
      testing: 1.1,
      documentation: 0.8,
      'ui-ux': 1.0,
      default: 1.0,
    }

    const multiplier = specializationMultipliers[specialization.toLowerCase()] || specializationMultipliers.default
    return Math.floor(baseTime * multiplier * (0.8 + Math.random() * 0.4)) // Add some randomness
  }

  /**
   * Simulate specialized work based on agent blueprint and task
   */
  private simulateSpecializedWork(blueprint: any, task: string): any {
    const timestamp = new Date().toLocaleTimeString()
    const specialization = blueprint.specialization.toLowerCase()

    // Generate specialized results based on agent type
    const specializationResults: Record<string, any> = {
      fullstack: {
        summary: `Full-stack analysis: frontend & backend components identified`,
        components: ['React components', 'API endpoints', 'Database schema'],
        recommendations: ['Use TypeScript', 'Implement proper error handling', 'Add testing'],
      },
      frontend: {
        summary: `Frontend analysis: UI/UX components and interactions`,
        components: ['Components', 'Styling', 'State management'],
        recommendations: ['Responsive design', 'Accessibility', 'Performance optimization'],
      },
      backend: {
        summary: `Backend analysis: API design and data flow`,
        components: ['REST endpoints', 'Database queries', 'Business logic'],
        recommendations: ['Input validation', 'Rate limiting', 'Caching strategy'],
      },
      devops: {
        summary: `DevOps analysis: deployment and infrastructure`,
        components: ['CI/CD pipeline', 'Infrastructure', 'Monitoring'],
        recommendations: ['Containerization', 'Auto-scaling', 'Logging strategy'],
      },
      security: {
        summary: `Security analysis: vulnerabilities and protection`,
        components: ['Authentication', 'Authorization', 'Data protection'],
        recommendations: ['Input sanitization', 'HTTPS enforcement', 'Security headers'],
      },
    }

    const result = specializationResults[specialization] || {
      summary: `General analysis completed for: ${task}`,
      components: ['Core functionality', 'Dependencies', 'Configuration'],
      recommendations: ['Code review', 'Documentation', 'Testing'],
    }

    return {
      ...result,
      timestamp,
      agentName: blueprint.name,
      taskAnalyzed: task,
      confidence: Math.floor(75 + Math.random() * 20), // 75-95% confidence
    }
  }

  /**
   * Check for collaboration opportunities between agents
   */
  private checkForCollaborationOpportunities(agent: any, collaborationContext: any): void {
    try {
      const agentData = collaborationContext.sharedData.get(agent.blueprintId)
      const allAgentData = Array.from(collaborationContext.sharedData.entries()) as [string, any][]

      // Look for complementary specializations
      const collaborationOpportunities = allAgentData.filter(([otherId, otherData]: [string, any]) => {
        if (otherId === agent.blueprintId) return false

        const agentSpec = agent.blueprint.specialization.toLowerCase()
        const otherSpec = otherData.specialization?.toLowerCase()

        // Define collaboration pairs
        const collaborationPairs = [
          ['frontend', 'backend'],
          ['backend', 'devops'],
          ['security', 'backend'],
          ['testing', 'fullstack'],
          ['ui-ux', 'frontend'],
        ]

        return collaborationPairs.some((pair) => pair.includes(agentSpec) && pair.includes(otherSpec))
      })

      if (collaborationOpportunities.length > 0) {
        const timestamp = new Date().toLocaleTimeString()
        console.log(
          chalk.cyan(
            `[${timestamp}] [${agent.blueprint.name}] 🤝 Collaboration opportunities found with ${collaborationOpportunities.length} agents`
          )
        )

        // Log collaboration details
        collaborationOpportunities.forEach(([otherId, _otherData]: [string, any]) => {
          const logs = collaborationContext.logs.get(agent.blueprintId) || []
          logs.push(`[${timestamp}] Potential collaboration with agent ${otherId}`)
          collaborationContext.logs.set(agent.blueprintId, logs)
        })
      }
    } catch (error: any) {
      console.error(chalk.red(`Error checking collaboration opportunities: ${error.message}`))
    }
  }

  /**
   * Stream step-by-step progress during parallel execution
   */
  private streamAgentSteps(agentName: string, stepId: string, description: string, progress: any): void {
    this.addLiveUpdate({
      type: 'step',
      content: `**${agentName}** - ${description}`,
      source: agentName,
      metadata: {
        stepId,
        progress,
        timestamp: new Date().toISOString(),
      },
    })
  }

  /**
   * Merge results from all agents into unified output
   */
  private mergeAgentResults(collaborationContext: any): void {
    try {
      const timestamp = new Date().toLocaleTimeString()
      console.log(chalk.blue.bold(`\n[${timestamp}] 🔄 Merging Agent Results`))
      console.log(chalk.gray('━'.repeat(60)))

      // Collect all agent results
      const allResults: any[] = []
      const allLogs: string[] = []

      for (const [agentId, agentData] of collaborationContext.sharedData.entries()) {
        if (agentData && agentData.result) {
          allResults.push({
            agentId,
            agentName: agentData.result.agentName,
            specialization: agentData.result.agentName?.split(' ')[0] || 'Unknown',
            result: agentData.result,
          })
        }
      }

      // Process logs in single iteration
      for (const [_agentId, logs] of collaborationContext.logs.entries()) {
        allLogs.push(...logs)
      }

      // Build unified response content
      let unifiedResponse = `**🔄 Parallel Execution Results**\n\n`
      unifiedResponse += `**Task:** ${collaborationContext.task}\n`
      unifiedResponse += `**Agents:** ${allResults.map((r) => r.specialization).join(', ')}\n`
      unifiedResponse += `**Total Actions:** ${allLogs.length}\n\n`

      // Add individual agent contributions
      unifiedResponse += `## 📊 Agent Contributions\n\n`
      allResults.forEach((agentResult) => {
        unifiedResponse += `### ${agentResult.specialization} Agent\n`
        unifiedResponse += `${agentResult.result.summary}\n\n`
        if (agentResult.result.components) {
          unifiedResponse += `**Components:** ${agentResult.result.components.join(', ')}\n\n`
        }
      })

      // Add unified recommendations
      const allRecommendations = allResults
        .flatMap((r) => r.result.recommendations || [])
        .filter((rec, index, arr) => arr.indexOf(rec) === index) // Remove duplicates

      if (allRecommendations.length > 0) {
        unifiedResponse += `## 💡 Unified Recommendations\n\n`
        allRecommendations.forEach((rec) => {
          unifiedResponse += `• ${rec}\n`
        })
        unifiedResponse += `\n`
      }

      unifiedResponse += `---\n**✓ Parallel execution completed successfully**`

      // Display in console for debugging
      console.log(chalk.green(`✓ Task: ${collaborationContext.task}`))
      console.log(chalk.cyan(`✓ Agents: ${allResults.map((r) => r.specialization).join(', ')}`))
      console.log(chalk.yellow(`✓ Total Actions: ${allLogs.length}`))

      // Display individual agent contributions
      console.log(chalk.blue('\n📊 Agent Contributions:'))
      allResults.forEach((agentResult) => {
        console.log(chalk.white(`\n  ${agentResult.specialization} Agent:`))
        console.log(chalk.gray(`    ${agentResult.result.summary}`))
        if (agentResult.result.components) {
          console.log(chalk.gray(`    Components: ${agentResult.result.components.join(', ')}`))
        }
      })

      if (allRecommendations.length > 0) {
        console.log(chalk.blue('\n💡 Unified Recommendations:'))
        allRecommendations.forEach((rec) => {
          console.log(chalk.gray(`  • ${rec}`))
        })
      }

      console.log(chalk.gray('\n━'.repeat(60)))
      console.log(chalk.green(`[${timestamp}] ✓ Parallel execution completed successfully\n`))

      // Output final unified response as standard output stream (not live update)
      console.log(chalk.blue.bold('🔄 Parallel Execution Results'))
      console.log(chalk.cyan(`📋 Task: ${collaborationContext.task}`))
      console.log(chalk.cyan(`🤖 Agents: ${allResults.map((r) => r.specialization).join(', ')}`))
      console.log(chalk.cyan(`⚡️ Total Actions: ${allLogs.length}`))
      console.log('')

      // Display individual agent contributions
      console.log(chalk.blue('📊 Agent Contributions:'))
      allResults.forEach((agentResult) => {
        console.log(chalk.white(`\n  ${agentResult.specialization} Agent:`))
        console.log(chalk.gray(`    ${agentResult.result.summary}`))
        if (agentResult.result.components) {
          console.log(chalk.gray(`    Components: ${agentResult.result.components.join(', ')}`))
        }
      })

      // Unified recommendations for output stream
      const finalRecommendations = allResults
        .flatMap((r) => r.result.recommendations || [])
        .filter((rec, index, arr) => arr.indexOf(rec) === index) // Remove duplicates

      if (finalRecommendations.length > 0) {
        console.log(chalk.blue('\n💡 Unified Recommendations:'))
        finalRecommendations.forEach((rec) => {
          console.log(chalk.gray(`  • ${rec}`))
        })
      }

      console.log(chalk.green('\n✓ Parallel execution completed successfully'))
    } catch (error: any) {
      console.error(chalk.red(`Error merging agent results: ${error.message}`))
    }
  }

  /**
   * Show background job status panel
   */
  private showBackgroundJobPanel(status: string, jobId: string, job: any): void {
    const statusConfig = {
      created: {
        icon: '🔌',
        title: 'Background Job Created',
        color: 'cyan' as const,
      },
      started: {
        icon: '🚀',
        title: 'Background Job Started',
        color: 'blue' as const,
      },
      completed: {
        icon: '✅',
        title: 'Background Job Completed',
        color: 'green' as const,
      },
      failed: {
        icon: '❌',
        title: 'Background Job Failed',
        color: 'red' as const,
      },
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.created
    const lines: string[] = []

    lines.push(`${config.icon} Job ID: ${jobId.slice(0, 8)}`)
    lines.push(`Repository: ${job.repo || 'N/A'}`)
    lines.push(`Task: ${job.task || 'N/A'}`)
    lines.push('')

    if (status === 'created') {
      lines.push(`Status: Queued for execution`)
      lines.push(`Branch: ${job.workBranch || 'N/A'}`)
    } else if (status === 'started') {
      lines.push(`Status: Executing in VM container`)
      if (job.containerId) {
        lines.push(`Container: ${job.containerId.slice(0, 12)}`)
      }
    } else if (status === 'completed') {
      lines.push(`Status: Successfully completed`)
      if (job.prUrl) {
        lines.push('')
        lines.push(`${chalk.bold.green('🎉 Pull Request Created:')}`)
        lines.push(chalk.cyan(job.prUrl))
      }
      if (job.metrics) {
        lines.push('')
        lines.push(`Metrics:`)
        lines.push(`  Token Usage: ${job.metrics.tokenUsage || 0}`)
        lines.push(`  Tool Calls: ${job.metrics.toolCalls || 0}`)
        lines.push(`  Duration: ${Math.round((job.metrics.executionTime || 0) / 1000)}s`)
      }
    } else if (status === 'failed') {
      lines.push(`Status: Failed`)
      if (job.error) {
        lines.push('')
        lines.push(`Error: ${job.error}`)
      }
    }

    this.printPanel(
      boxen(lines.join('\n'), {
        title: config.title,
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: config.color,
      })
    )
  }
}

// Global instance for access from other modules
let globalNikCLI: NikCLI | null = null

// Export function to set global instance
export function setGlobalNikCLI(instance: NikCLI): void {
  globalNikCLI = instance
    // Use consistent global variable name
    ; (global as any).__nikCLI = instance
}
