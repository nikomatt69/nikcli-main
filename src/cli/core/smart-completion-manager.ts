import chalk from 'chalk'
import { z } from 'zod'
import { workspaceContext } from '../context/workspace-context'
import { agentService } from '../services/agent-service'
import { type AICompletion, aiCompletionService, type CompletionContext } from '../services/ai-completion-service'
import { toolService } from '../services/tool-service'
import { commandPredictor, type PredictionResult } from './command-predictor'

// ====================== SCHEMAS ======================

const CompletionSourceSchema = z.enum(['static', 'ml', 'ai', 'agent', 'tool', 'path'])

const UnifiedCompletionSchema = z.object({
  completion: z.string(),
  confidence: z.number().min(0).max(1),
  source: CompletionSourceSchema,
  category: z.enum(['command', 'parameter', 'path', 'agent', 'tool', 'code', 'natural']),
  priority: z.number().min(0).max(10),
  description: z.string().optional(),
  requiresApproval: z.boolean().default(false),
  icon: z.string().optional(),
  color: z.string().optional(),
})

export type CompletionSource = z.infer<typeof CompletionSourceSchema>
export type UnifiedCompletion = z.infer<typeof UnifiedCompletionSchema>

// ====================== SMART COMPLETION MANAGER ======================

export class SmartCompletionManager {
  private staticCommands: Map<string, string[]> = new Map()
  private lastCompletionTime = 0
  private readonly AI_COMPLETION_THROTTLE = 1000 // 1 second between AI calls

  constructor() {
    this.initializeStaticCommands()
  }

  /**
   * Generate unified completions from multiple sources
   */
  async getCompletions(
    partialInput: string,
    context?: {
      currentDirectory?: string
      gitBranch?: string
      openFiles?: string[]
      interface?: string // which interface is requesting completions
    }
  ): Promise<UnifiedCompletion[]> {
    const completions: UnifiedCompletion[] = []
    const startTime = Date.now()

    try {
      // 1. Static command completions (fast, always available)
      const staticCompletions = this.getStaticCompletions(partialInput, context?.interface)
      completions.push(...staticCompletions)

      // 2. ML-based predictions from CommandPredictor (fast)
      const mlCompletions = await this.getMLCompletions(partialInput, context)
      completions.push(...mlCompletions)

      // 3. Agent suggestions
      const agentCompletions = this.getAgentCompletions(partialInput)
      completions.push(...agentCompletions)

      // 4. Tool completions
      const toolCompletions = this.getToolCompletions(partialInput)
      completions.push(...toolCompletions)

      // 5. Path completions
      const pathCompletions = this.getPathCompletions(partialInput)
      completions.push(...pathCompletions)

      // 6. AI completions (async, with throttling)
      if (this.shouldRequestAICompletions(partialInput, startTime)) {
        const aiCompletions = await this.getAICompletions(partialInput, context)
        completions.push(...aiCompletions)
        this.lastCompletionTime = Date.now()
      }
    } catch (error) {
      console.warn(chalk.yellow(`[Smart Completion] Error: ${error}`))
    }

    // Deduplicate, rank, and limit results
    return this.rankAndDeduplicateCompletions(completions, partialInput)
  }

  /**
   * Get static command completions
   */
  private getStaticCompletions(partialInput: string, interfaceName?: string): UnifiedCompletion[] {
    const commands = this.staticCommands.get(interfaceName || 'default') || []

    return commands
      .filter((cmd) => cmd.toLowerCase().startsWith(partialInput.toLowerCase()))
      .map((cmd) => ({
        completion: cmd,
        confidence: 0.8,
        source: 'static' as CompletionSource,
        category: this.categorizeCompletion(cmd),
        priority: this.getStaticCommandPriority(cmd),
        description: this.getCommandDescription(cmd),
        requiresApproval: false,
        icon: this.getCommandIcon(cmd),
        color: 'cyan',
      }))
  }

  /**
   * Get ML-based completions from CommandPredictor
   */
  private async getMLCompletions(partialInput: string, context?: any): Promise<UnifiedCompletion[]> {
    try {
      const predictions = await commandPredictor.predictCommands(partialInput, {
        directory: context?.currentDirectory,
        gitBranch: context?.gitBranch,
        openFiles: context?.openFiles,
        projectType: await this.detectProjectType(),
      })

      return predictions.map((pred: PredictionResult) => ({
        completion: pred.command,
        confidence: pred.confidence,
        source: 'ml' as CompletionSource,
        category: this.mlCategoryToUnified(pred.category),
        priority: Math.round(pred.confidence * 10),
        description: pred.reason,
        requiresApproval: pred.requires_approval,
        icon: '🧠',
        color: 'green',
      }))
    } catch (_error) {
      return []
    }
  }

  /**
   * Get agent-based completions
   */
  private getAgentCompletions(partialInput: string): UnifiedCompletion[] {
    const agents = agentService.getAvailableAgents()
    const agentPrefix = partialInput.startsWith('@') ? partialInput.slice(1) : partialInput

    if (!partialInput.startsWith('@') && !partialInput.includes('agent')) {
      return []
    }

    return agents
      .filter(
        (agent) =>
          agent.name.toLowerCase().includes(agentPrefix.toLowerCase()) ||
          agent.name.toLowerCase().includes(agentPrefix.toLowerCase())
      )
      .slice(0, 5)
      .map((agent) => ({
        completion: partialInput.startsWith('@') ? `@${agent.name}` : `@${agent.name}`,
        confidence: 0.9,
        source: 'agent' as CompletionSource,
        category: 'agent' as const,
        priority: 8,
        description: `${agent.name} - ${agent.name || 'AI Agent'}`,
        requiresApproval: false,
        icon: '🤖',
        color: 'blue',
      }))
  }

  /**
   * Get tool-based completions
   */
  private getToolCompletions(partialInput: string): UnifiedCompletion[] {
    if (!partialInput.startsWith('/') && !partialInput.includes('tool')) {
      return []
    }

    const tools = toolService.getAvailableTools()
    const toolPrefix = partialInput.startsWith('/') ? partialInput.slice(1) : partialInput

    return tools
      .filter((tool) => tool.name.toLowerCase().includes(toolPrefix.toLowerCase()))
      .slice(0, 8)
      .map((tool) => ({
        completion: partialInput.startsWith('/') ? `/${tool.name}` : tool.name,
        confidence: 0.85,
        source: 'tool' as CompletionSource,
        category: 'tool' as const,
        priority: 7,
        description: tool.description || `${tool.name} tool`,
        requiresApproval: false,
        icon: '🔧',
        color: 'yellow',
      }))
  }

  /**
   * Get path completions
   */
  private getPathCompletions(partialInput: string): UnifiedCompletion[] {
    // Simple path completion for relative paths
    if (!partialInput.includes('/') && !partialInput.includes('.')) {
      return []
    }

    try {
      const fs = require('node:fs')
      const path = require('node:path')

      let basePath = process.cwd()
      let searchTerm = partialInput

      if (partialInput.includes('/')) {
        const lastSlash = partialInput.lastIndexOf('/')
        basePath = path.resolve(basePath, partialInput.substring(0, lastSlash) || '.')
        searchTerm = partialInput.substring(lastSlash + 1)
      }

      if (!fs.existsSync(basePath)) {
        return []
      }

      const files = fs
        .readdirSync(basePath)
        .filter((file: string) => file.toLowerCase().startsWith(searchTerm.toLowerCase()) && !file.startsWith('.'))
        .slice(0, 10)

      return files.map((file: string) => {
        const fullPath = path.join(basePath, file)
        const isDir = fs.statSync(fullPath).isDirectory()

        return {
          completion: partialInput.includes('/')
            ? partialInput.substring(0, partialInput.lastIndexOf('/') + 1) + file + (isDir ? '/' : '')
            : file + (isDir ? '/' : ''),
          confidence: 0.7,
          source: 'path' as CompletionSource,
          category: 'path' as const,
          priority: 6,
          description: isDir ? 'Directory' : 'File',
          requiresApproval: false,
          icon: isDir ? '📁' : '📄',
          color: 'magenta',
        }
      })
    } catch (_error) {
      return []
    }
  }

  /**
   * Get AI-powered completions
   */
  private async getAICompletions(partialInput: string, context?: any): Promise<UnifiedCompletion[]> {
    try {
      const completionContext: CompletionContext = {
        partialInput,
        currentDirectory: context?.currentDirectory,
        gitBranch: context?.gitBranch,
        openFiles: context?.openFiles,
        projectType: await this.detectProjectType(),
      }

      const result = await aiCompletionService.generateCompletions(completionContext)

      return result.completions.map((aiComp: AICompletion) => ({
        completion: aiComp.completion,
        confidence: aiComp.confidence,
        source: 'ai' as CompletionSource,
        category: aiComp.category,
        priority: aiComp.priority,
        description: `AI: ${aiComp.reasoning}`,
        requiresApproval: aiComp.requiresApproval,
        icon: '✨',
        color: 'magenta',
      }))
    } catch (error) {
      console.warn(chalk.yellow(`[Smart Completion] AI error: ${error}`))
      return []
    }
  }

  /**
   * Check if AI completions should be requested
   */
  private shouldRequestAICompletions(partialInput: string, currentTime: number): boolean {
    // Throttle AI requests
    if (currentTime - this.lastCompletionTime < this.AI_COMPLETION_THROTTLE) {
      return false
    }

    // Only request AI for meaningful inputs
    if (partialInput.length < 2) {
      return false
    }

    // Skip AI for very common prefixes that have good static/ML coverage
    const commonPrefixes = ['/help', '/status', '/clear', '/exit']
    if (commonPrefixes.some((prefix) => prefix.startsWith(partialInput))) {
      return false
    }

    return true
  }

  /**
   * Rank and deduplicate completions
   */
  private rankAndDeduplicateCompletions(completions: UnifiedCompletion[], partialInput: string): UnifiedCompletion[] {
    // Deduplicate by completion text
    const uniqueCompletions = new Map<string, UnifiedCompletion>()

    completions.forEach((comp) => {
      const existing = uniqueCompletions.get(comp.completion)
      if (!existing || comp.confidence > existing.confidence) {
        uniqueCompletions.set(comp.completion, comp)
      }
    })

    // Convert back to array and sort
    const uniqueArray = Array.from(uniqueCompletions.values())

    // Sort by priority, confidence, and relevance to input
    return uniqueArray
      .sort((a, b) => {
        // Exact prefix matches get highest priority
        const aExactMatch = a.completion.toLowerCase().startsWith(partialInput.toLowerCase()) ? 1 : 0
        const bExactMatch = b.completion.toLowerCase().startsWith(partialInput.toLowerCase()) ? 1 : 0

        if (aExactMatch !== bExactMatch) {
          return bExactMatch - aExactMatch
        }

        // Then sort by priority and confidence
        const priorityDiff = b.priority - a.priority
        if (priorityDiff !== 0) return priorityDiff

        return b.confidence - a.confidence
      })
      .slice(0, 15) // Limit to top 15 completions
  }

  /**
   * Initialize static commands for different interfaces
   */
  private initializeStaticCommands(): void {
    // Default commands
    const defaultCommands = ['/help', '/status', '/agents', '/clear', '/exit', '/models', '/config', '/env']

    // Orchestrator service commands
    const orchestratorCommands = [...defaultCommands, '/diff', '/accept', '/middleware']

    // Autonomous interface commands
    const autonomousCommands = [
      ...defaultCommands,
      '/add-dir',
      '/analyze',
      '/auto',
      '/bug',
      '/cd',
      '/compact',
      '/cost',
      '/doctor',
      '/export',
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

    // Unified chat commands
    const unifiedChatCommands = ['/help', '/plan', '/status', '/queue', '/stop', '/clear', '/exit']

    // Streaming orchestrator commands
    const streamingCommands = ['/status', '/agents', '/diff', '/accept', '/clear', '/help']

    this.staticCommands.set('default', defaultCommands)
    this.staticCommands.set('orchestrator', orchestratorCommands)
    this.staticCommands.set('autonomous', autonomousCommands)
    this.staticCommands.set('unified', unifiedChatCommands)
    this.staticCommands.set('streaming', streamingCommands)
  }

  /**
   * Helper methods
   */
  private categorizeCompletion(cmd: string): 'command' | 'parameter' | 'path' | 'agent' | 'tool' | 'code' | 'natural' {
    if (cmd.startsWith('/')) return 'command'
    if (cmd.startsWith('@')) return 'agent'
    if (cmd.includes('/')) return 'path'
    return 'command'
  }

  private getStaticCommandPriority(cmd: string): number {
    const highPriority = ['/help', '/status', '/agents', '/clear']
    const mediumPriority = ['/diff', '/accept', '/plan', '/auto']

    if (highPriority.includes(cmd)) return 9
    if (mediumPriority.includes(cmd)) return 7
    return 5
  }

  private getCommandDescription(cmd: string): string {
    const descriptions: Record<string, string> = {
      '/help': 'Show help information',
      '/status': 'Display system status',
      '/agents': 'List available agents',
      '/clear': 'Clear current session',
      '/exit': 'Exit application',
      '/diff': 'Show changes diff',
      '/accept': 'Accept proposed changes',
      '/plan': 'Switch to planning mode',
      '/models': 'List available AI models',
      '/config': 'Show configuration',
    }
    return descriptions[cmd] || 'Command'
  }

  private getCommandIcon(cmd: string): string {
    const icons: Record<string, string> = {
      '/help': '❓',
      '/status': '📊',
      '/agents': '🤖',
      '/clear': '🧹',
      '/exit': '👋',
      '/diff': '📋',
      '/accept': '✅',
      '/plan': '📝',
      '/auto': '⚡',
      '/models': '🧠',
      '/config': '🔨',
    }
    return icons[cmd] || '▶️'
  }

  private mlCategoryToUnified(
    mlCategory: string
  ): 'command' | 'parameter' | 'path' | 'agent' | 'tool' | 'code' | 'natural' {
    const mapping: Record<string, 'command' | 'parameter' | 'path' | 'agent' | 'tool' | 'code' | 'natural'> = {
      recent: 'command',
      frequent: 'command',
      contextual: 'command',
      pattern: 'command',
      similar: 'natural',
    }
    return mapping[mlCategory] || 'command'
  }

  private async detectProjectType(): Promise<string> {
    try {
      const contextData = workspaceContext.getContextForAgent('completion', 5)
      if (contextData.projectSummary.includes('React')) return 'web'
      if (contextData.projectSummary.includes('Python')) return 'python'
      if (contextData.projectSummary.includes('Node')) return 'web'
      return 'general'
    } catch {
      return 'general'
    }
  }

  /**
   * Format completions for display
   */
  public formatCompletionsForDisplay(completions: UnifiedCompletion[]): string[] {
    return completions.map((comp) => {
      const icon = comp.icon || ''
      const color = comp.color || 'white'
      const confidence = Math.round(comp.confidence * 100)

      if (color === 'cyan')
        return chalk.cyan(
          `${icon} ${comp.completion}` +
            (comp.description ? chalk.gray(` - ${comp.description}`) : '') +
            (comp.source === 'ai' ? chalk.dim(` (${confidence}%)`) : '')
        )
      if (color === 'green')
        return chalk.green(
          `${icon} ${comp.completion}` +
            (comp.description ? chalk.gray(` - ${comp.description}`) : '') +
            (comp.source === 'ai' ? chalk.dim(` (${confidence}%)`) : '')
        )
      if (color === 'blue')
        return chalk.blue(
          `${icon} ${comp.completion}` +
            (comp.description ? chalk.gray(` - ${comp.description}`) : '') +
            (comp.source === 'ai' ? chalk.dim(` (${confidence}%)`) : '')
        )
      if (color === 'yellow')
        return chalk.yellow(
          `${icon} ${comp.completion}` +
            (comp.description ? chalk.gray(` - ${comp.description}`) : '') +
            (comp.source === 'ai' ? chalk.dim(` (${confidence}%)`) : '')
        )
      if (color === 'magenta')
        return chalk.magenta(
          `${icon} ${comp.completion}` +
            (comp.description ? chalk.gray(` - ${comp.description}`) : '') +
            (comp.source === 'ai' ? chalk.dim(` (${confidence}%)`) : '')
        )

      return chalk.white(
        `${icon} ${comp.completion}` +
          (comp.description ? chalk.gray(` - ${comp.description}`) : '') +
          (comp.source === 'ai' ? chalk.dim(` (${confidence}%)`) : '')
      )
    })
  }

  /**
   * Get completion statistics
   */
  public getCompletionStats() {
    return {
      staticCommandsLoaded: Array.from(this.staticCommands.values()).reduce((sum, arr) => sum + arr.length, 0),
      aiCompletionThrottle: this.AI_COMPLETION_THROTTLE,
      lastAIRequestTime: this.lastCompletionTime,
    }
  }
}

export const smartCompletionManager = new SmartCompletionManager()
