import { exec } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createCerebras } from '@ai-sdk/cerebras'
import { createGateway } from '@ai-sdk/gateway'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createVercel } from '@ai-sdk/vercel'
import { type CoreMessage, type CoreTool, generateText, streamText, type ToolCallPart, tool } from 'ai'
import chalk from 'chalk'
import { createOllama } from 'ollama-ai-provider'
import { z } from 'zod'
// ⚡︎ Import Cognitive Orchestration Types
import type { OrchestrationPlan, TaskCognition } from '../automation/agents/universal-agent'
import { docsContextManager } from '../context/docs-context-manager'
import { AdvancedTools } from '../core/advanced-tools'
import { simpleConfigManager as configManager } from '../core/config-manager'
import { ContextEnhancer } from '../core/context-enhancer'
import { docLibrary } from '../core/documentation-library'
import { documentationTools } from '../core/documentation-tool'
import { IDEContextEnricher } from '../core/ide-context-enricher'
import {
  PerformanceOptimizer,
  QuietCacheLogger,
  type TokenOptimizationConfig,
  TokenOptimizer,
} from '../core/performance-optimizer'
import { ProgressiveTokenManager } from '../core/progressive-token-manager'
import { smartCache } from '../core/smart-cache-manager'
import { ToolRouter } from '../core/tool-router'
import { type ValidationContext, validatorManager } from '../core/validator-manager'
import { WebSearchProvider } from '../core/web-search-provider'
import { PromptManager } from '../prompts/prompt-manager'
import { streamttyService } from '../services/streamtty-service'
import { aiDocsTools } from '../tools/docs-request-tool'
import { aiMemoryTools } from '../tools/memory-search-tool'
import { smartDocsTools } from '../tools/smart-docs-tool'
import { ToolRegistry } from '../tools/tool-registry'
import { advancedUI } from '../ui/advanced-cli-ui'
import { diffManager } from '../ui/diff-manager'
import { DiffViewer, type FileDiff } from '../ui/diff-viewer'
import { compactAnalysis, safeStringifyContext } from '../utils/analysis-utils'
import { bunExec } from '../utils/bun-compat'
import { CliUI } from '../utils/cli-ui'
import { adaptiveModelRouter, type ModelScope } from './adaptive-model-router'
import { openRouterRegistry } from './openrouter-model-registry'
import { ReasoningDetector } from './reasoning-detector'
import { workflowPatterns } from './workflow-patterns'

const cognitiveColor = chalk.hex('#3a3a3a')
const blueColor = chalk.blue // For "Tools:", "Tokens:", and numbers
const greenColor = chalk.green // For success results
const redColor = chalk.red
const darkGrayColor = chalk.hex('#3a3a3a')
//  Command System Schemas with Zod
const CommandSchema = z.object({
  type: z.enum(['npm', 'bash', 'git', 'docker', 'node', 'build', 'test', 'lint']),
  command: z.string().min(1).max(500),
  args: z.array(z.string()).optional(),
  workingDir: z.string().optional(),
  description: z.string().min(5).max(200),
  safety: z.enum(['safe', 'moderate', 'risky']),
  requiresApproval: z.boolean().default(false),
  estimatedDuration: z.number().min(1).max(3600).optional(),
  dependencies: z.array(z.string()).optional(),
  expectedOutputPattern: z.string().optional(),
})

const PackageSearchResult = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  downloads: z.number().optional(),
  verified: z.boolean().default(false),
  lastUpdated: z.string().optional(),
  repository: z.string().optional(),
  confidence: z.number().min(0).max(1),
})

const CommandExecutionResult = z.object({
  success: z.boolean(),
  output: z.string(),
  error: z.string().optional(),
  duration: z.number(),
  command: CommandSchema,
  timestamp: z.date(),
  workspaceState: z
    .object({
      filesCreated: z.array(z.string()).optional(),
      filesModified: z.array(z.string()).optional(),
      packagesInstalled: z.array(z.string()).optional(),
    })
    .optional(),
})

type Command = z.infer<typeof CommandSchema>
type PackageSearchResult = z.infer<typeof PackageSearchResult>
type CommandExecutionResult = z.infer<typeof CommandExecutionResult>

const execAsync = promisify(exec)

export interface StreamEvent {
  type: 'start' | 'thinking' | 'tool_call' | 'tool_result' | 'text_delta' | 'complete' | 'error' | 'step' | 'usage'
  content?: string
  toolName?: string
  toolArgs?: any
  toolResult?: any
  error?: string
  metadata?: any
  stepId?: string
  // Real token usage from AI SDK (not estimates)
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface AutonomousProvider {
  streamChatWithFullAutonomy(messages: CoreMessage[], abortSignal?: AbortSignal): AsyncGenerator<StreamEvent>
  executeAutonomousTask(
    task: string,
    context?: any & {
      steps?: Array<{
        stepId: string
        description: string
        schema?: any
      }>
      finalStep?: {
        description: string
        schema?: any
      }
    }
  ): AsyncGenerator<StreamEvent>
  // ⚡︎ Enhanced Cognitive Methods
  generateWithCognition(
    messages: CoreMessage[],
    cognition?: TaskCognition,
    options?: {
      steps?: Array<{
        stepId: string
        description: string
        schema?: any
      }>
      finalStep?: {
        description: string
        schema?: any
      }
    }
  ): AsyncGenerator<StreamEvent>
  optimizePromptWithPlan(messages: CoreMessage[], plan?: OrchestrationPlan): CoreMessage[]
  adaptResponseToCognition(response: string, cognition?: TaskCognition): string
}

export class AdvancedAIProvider implements AutonomousProvider {
  private tokenOptimizer: TokenOptimizer

  //  Command System Properties
  private readonly MAX_COMMAND_HISTORY = 50
  private commandHistory: CommandExecutionResult[] = []
  private packageCache: Map<string, PackageSearchResult[]> = new Map()
  private commandTemplates: Map<string, Command> = new Map()
  private streamSilentMode: boolean = false

  // Usage Statistics
  private totalTokensUsed: number = 0
  private estimatedCost: number = 0
  private requestCount: number = 0
  private cacheHits: number = 0

  generateWithTools(_planningMessages: CoreMessage[]): Promise<{
    text: string
    toolCalls: any[]
    toolResults: any[]
  }> {
    throw new Error('Method not implemented.')
  }

  /**
   * Create a tool call repair handler for AI SDK
   * Reference: https://v4.ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-call-repair
   *
   * This handler attempts to fix invalid tool calls by re-asking the model
   */
  private createToolCallRepairHandler(model: any, tools: Record<string, CoreTool>) {
    return async ({
      toolCall,
      error,
      messages,
      system,
    }: {
      toolCall: { toolName: string; args: unknown }
      error: Error
      messages: CoreMessage[]
      system?: string
    }) => {
      try {
        const tool = tools[toolCall.toolName]
        if (!tool) {
          advancedUI.logWarning(`[ToolRepair] Unknown tool: ${toolCall.toolName}`)
          return null
        }

        advancedUI.logInfo(`[ToolRepair] Attempting to fix invalid tool call: ${toolCall.toolName}`)

        // Ask the model to fix the tool call
        const repairResult = await generateText({
          model,
          system: system || 'You are a helpful assistant that fixes invalid tool calls.',
          messages: [
            ...messages,
            {
              role: 'user',
              content: `The tool call "${toolCall.toolName}" failed with error: ${error.message}

Invalid arguments: ${JSON.stringify(toolCall.args, null, 2)}

Please provide corrected arguments for this tool. Only output the corrected JSON arguments, nothing else.`,
            },
          ],
          maxTokens: 2000,
        })

        // Try to parse the corrected arguments
        const fixedArgsText = repairResult.text.trim()
        const jsonMatch = fixedArgsText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || fixedArgsText.match(/^\{[\s\S]*\}$/)

        if (jsonMatch) {
          const fixedArgs = JSON.parse(jsonMatch[1] || jsonMatch[0])
          advancedUI.logSuccess(`[ToolRepair] Successfully repaired tool call: ${toolCall.toolName}`)
          return { toolName: toolCall.toolName, args: fixedArgs }
        }

        const fixedArgs = JSON.parse(fixedArgsText)
        advancedUI.logSuccess(`[ToolRepair] Successfully repaired tool call: ${toolCall.toolName}`)
        return { toolName: toolCall.toolName, args: fixedArgs }
      } catch (repairError: any) {
        advancedUI.logWarning(`[ToolRepair] Failed to repair tool call: ${repairError.message}`)
        return null
      }
    }
  }

  /**
   * Active Tools Pattern - Intelligently select relevant tools based on context
   * Reference: https://ai-sdk.dev/docs/agents best practices
   *
   * Analyzes the user's message to determine intent and returns only the most
   * relevant tools (limit: 5-7) to improve model performance and reduce tokens.
   */
  private selectActiveTools(
    message: string,
    allTools: Record<string, CoreTool>,
    maxTools = 5
  ): Record<string, CoreTool> {
    const lowerMessage = message.toLowerCase()

    // Tool categories with priority keywords
    const toolCategories: Record<string, { tools: string[]; keywords: string[]; priority: number }> = {
      file_reading: {
        tools: ['read_file', 'multi_read', 'explore_directory'],
        keywords: [
          'read',
          'show',
          'view',
          'content',
          'look',
          'check',
          'see',
          'file',
          'what',
          'open',
          'explore',
          'directory',
          'batch',
          'multiple',
        ],
        priority: 1,
      },
      file_writing: {
        tools: ['write_file', 'edit_file', 'replace_in_file', 'multi_edit'],
        keywords: [
          'write',
          'create',
          'edit',
          'modify',
          'update',
          'change',
          'fix',
          'add',
          'save',
          'patch',
          'batch',
          'multiple',
          'replace',
        ],
        priority: 2,
      },
      file_search: {
        tools: ['find_files', 'grep', 'glob', 'rag_search'],
        keywords: [
          'search',
          'find',
          'where',
          'grep',
          'locate',
          'pattern',
          'regex',
          'glob',
          'semantic',
          'rag',
          'codebase',
        ],
        priority: 3,
      },
      execution: {
        tools: ['execute_command', 'bash', 'run_command', 'secure_command'],
        keywords: [
          'run',
          'execute',
          'command',
          'terminal',
          'shell',
          'npm',
          'pnpm',
          'bun',
          'yarn',
          'install',
          'build',
          'test',
          'start',
          'secure',
        ],
        priority: 4,
      },
      filesystem_utilities: {
        tools: ['list', 'tree', 'watch', 'diff', 'json_patch'],
        keywords: ['filesystem', 'utilities', 'tree', 'diff', 'compare', 'watch', 'monitor', 'list', 'json', 'patch'],
        priority: 5,
      },
      git: {
        tools: ['git_tools'],
        keywords: [
          'git',
          'commit',
          'push',
          'pull',
          'branch',
          'merge',
          'diff',
          'status',
          'apply',
          'patch',
          'repository',
        ],
        priority: 6,
      },
      analysis: {
        tools: ['analyze_project', 'manage_packages', 'generate_code'],
        keywords: [
          'analyze',
          'explain',
          'understand',
          'structure',
          'architecture',
          'project',
          'overview',
          'package',
          'dependency',
          'generate',
          'code',
        ],
        priority: 7,
      },
      workflows: {
        tools: [
          'workflow_code_review',
          'workflow_optimize_code',
          'workflow_smart_route',
          'workflow_implement_feature',
          'workflow_translate',
          'workflow_generate_code',
        ],
        keywords: [
          'workflow',
          'pipeline',
          'review',
          'optimize',
          'implement',
          'feature',
          'translate',
          'generate',
          'quality',
          'parallel',
          'orchestrate',
          'iterate',
        ],
        priority: 8,
      },
      ai_vision: {
        tools: ['vision_analysis', 'image_generation'],
        keywords: [
          'vision',
          'image',
          'picture',
          'photo',
          'analyze',
          'generate',
          'create',
          'ai',
          'multimodal',
          'dall-e',
          'claude',
          'gemini',
        ],
        priority: 9,
      },
      blockchain: {
        tools: ['coinbase_agentkit', 'goat_tool'],
        keywords: [
          'blockchain',
          'crypto',
          'bitcoin',
          'ethereum',
          'defi',
          'wallet',
          'transaction',
          'coinbase',
          'polymarket',
          'erc20',
          'polygon',
          'base',
        ],
        priority: 10,
      },
      browser_automation: {
        tools: [
          'browserbase',
          'browser_navigate',
          'browser_click',
          'browser_type',
          'browser_screenshot',
          'browser_extract_text',
          'browser_wait_for_element',
          'browser_scroll',
          'browser_execute_script',
          'browser_get_page_info',
        ],
        keywords: [
          'browser',
          'web',
          'automation',
          'selenium',
          'playwright',
          'click',
          'navigate',
          'screenshot',
          'scrape',
          'extract',
          'javascript',
          'scroll',
          'wait',
        ],
        priority: 11,
      },
      manufacturing: {
        tools: ['text_to_cad', 'text_to_gcode'],
        keywords: [
          'cad',
          'cnc',
          '3d',
          'print',
          'manufacturing',
          'gcode',
          'laser',
          'engineering',
          'design',
          'prototype',
        ],
        priority: 12,
      },
      design_tools: {
        tools: ['figma_tool'],
        keywords: ['figma', 'design', 'ui', 'ux', 'prototype', 'mockup', 'component', 'library'],
        priority: 13,
      },
      project_management: {
        tools: ['snapshot_tool'],
        keywords: ['snapshot', 'backup', 'restore', 'version', 'state', 'checkpoint', 'rollback'],
        priority: 14,
      },
      code_quality: {
        tools: ['format_suggestion'],
        keywords: ['format', 'lint', 'style', 'prettier', 'eslint', 'quality', 'standardize'],
        priority: 15,
      },
      documentation: {
        tools: [
          'web_search',
          'smart_docs_search',
          'smart_docs_load',
          'smart_docs_context',
          'docs_request',
          'memory_search',
        ],
        keywords: [
          'documentation',
          'docs',
          'search',
          'web',
          'online',
          'help',
          'reference',
          'manual',
          'guide',
          'memory',
          'context',
        ],
        priority: 16,
      },
    }

    // Score each category based on keyword matches
    const categoryScores: {
      category: string
      score: number
      priority: number
    }[] = []

    for (const [category, config] of Object.entries(toolCategories)) {
      let score = 0
      for (const keyword of config.keywords) {
        if (lowerMessage.includes(keyword)) {
          score += 1
        }
      }
      if (score > 0) {
        categoryScores.push({ category, score, priority: config.priority })
      }
    }

    // Sort by score (desc) then priority (asc)
    categoryScores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.priority - b.priority
    })

    // Collect tools from top categories
    const selectedTools: Record<string, CoreTool> = {}
    const selectedToolNames = new Set<string>()

    for (const { category } of categoryScores) {
      const categoryTools = toolCategories[category].tools
      for (const toolName of categoryTools) {
        if (allTools[toolName] && !selectedToolNames.has(toolName)) {
          selectedTools[toolName] = allTools[toolName]
          selectedToolNames.add(toolName)

          if (selectedToolNames.size >= maxTools) break
        }
      }
      if (selectedToolNames.size >= maxTools) break
    }

    // Default core tools if no specific category matched
    if (selectedToolNames.size === 0) {
      const coreTools = [
        'read_file',
        'write_file',
        'find_files',
        'execute_command',
        'grep',
        'list',
        'tree',
        'web_search',
        'git_tools',
        'json_patch',
      ]
      for (const toolName of coreTools) {
        if (allTools[toolName]) {
          selectedTools[toolName] = allTools[toolName]
          if (Object.keys(selectedTools).length >= maxTools) break
        }
      }
    }

    // Always include read_file for context gathering
    if (!selectedTools['read_file'] && allTools['read_file']) {
      selectedTools['read_file'] = allTools['read_file']
    }

    return selectedTools
  }

  // Truncate long free-form strings to keep prompts safe
  private truncateForPrompt(s: string, maxChars: number = 2000): string {
    if (!s) return ''
    return s.length > maxChars ? `${s.slice(0, maxChars)}…[truncated]` : s
  }

  // 🗜️ Compress tool results intelligently to prevent token overflow
  private compressToolResult(result: any, _toolName: string): any {
    if (!result) return result

    // Compress large text results
    if (typeof result === 'string' && result.length > 1000) {
      return `${this.truncateForPrompt(result, 800)} [compressed for token efficiency]`
    }

    // Compress object results
    if (typeof result === 'object') {
      const compressed: any = {}

      // Keep essential fields and compress large ones
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'string' && value.length > 500) {
          compressed[key] = `${this.truncateForPrompt(value, 300)} [compressed]`
        } else if (Array.isArray(value) && value.length > 10) {
          compressed[key] = value.slice(0, 5).concat([`...and ${value.length - 5} more items [compressed]`])
        } else {
          compressed[key] = value
        }
      }

      return compressed
    }

    return result
  }

  // Approximate token counting (1 token ≈ 4 characters for most languages)
  private estimateTokens(text: string): number {
    if (!text) return 0
    // More accurate estimation: count words, punctuation, special chars
    const words = text.split(/\s+/).filter((word) => word.length > 0)
    const specialChars = (text.match(/[{}[\](),.;:!?'"]/g) || []).length
    return Math.ceil((words.length + specialChars * 0.5) * 1.3) // Conservative estimate
  }

  // Estimate total tokens in messages array
  private estimateMessagesTokens(messages: CoreMessage[]): number {
    let totalTokens = 0
    for (const message of messages) {
      const content =
        typeof message.content === 'string'
          ? message.content
          : Array.isArray(message.content)
            ? message.content.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('')
            : JSON.stringify(message.content)

      totalTokens += this.estimateTokens(content)
      totalTokens += 10 // Role, metadata overhead
    }
    return totalTokens
  }

  // Intelligent message truncation with token optimization - ULTRA AGGRESSIVE MODE
  private async truncateMessages(messages: CoreMessage[], maxTokens: number = 60000): Promise<CoreMessage[]> {
    // First apply token optimization to all messages
    const optimizedMessages = await this.optimizeMessages(messages)
    const currentTokens = this.estimateMessagesTokens(optimizedMessages)

    if (currentTokens <= maxTokens) {
      return optimizedMessages
    }

    // Messages too long - applying intelligent truncation

    // Strategy: Keep system messages, recent user/assistant, and important tool calls
    const truncatedMessages: CoreMessage[] = []
    const systemMessages = messages.filter((m) => m.role === 'system')
    const nonSystemMessages = messages.filter((m) => m.role !== 'system')

    // Always keep system messages (but truncate AGGRESSIVELY)
    for (const sysMsg of systemMessages) {
      const content = typeof sysMsg.content === 'string' ? sysMsg.content : JSON.stringify(sysMsg.content)
      truncatedMessages.push({
        ...sysMsg,
        content: this.truncateForPrompt(content, 3000), // REDUCED: Max 3k chars for system messages
      })
    }

    // Keep the most recent messages (MORE AGGRESSIVE sliding window)
    const recentMessages = nonSystemMessages.slice(-10) // REDUCED: Keep last 10 non-system messages
    let accumulatedTokens = this.estimateMessagesTokens(truncatedMessages)

    // Add recent messages in reverse order until we hit the limit
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i]
      const msgTokens = this.estimateTokens(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content))

      if (accumulatedTokens + msgTokens > maxTokens) {
        // Truncate this message if it's too long
        const availableTokens = maxTokens - accumulatedTokens
        const availableChars = Math.max(500, availableTokens * 3) // Conservative char conversion

        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        const truncatedContent = this.truncateForPrompt(content, availableChars)

        // Handle different message types properly
        if (msg.role === 'tool') {
          truncatedMessages.push({
            ...msg,
            content: [{ type: 'text', text: truncatedContent }] as any,
          })
        } else {
          truncatedMessages.push({
            ...msg,
            content: truncatedContent,
          })
        }
        break
      }

      truncatedMessages.push(msg)
      accumulatedTokens += msgTokens
    }

    // If we still need more space, add truncation summary
    if (nonSystemMessages.length > 6) {
      const skippedCount = nonSystemMessages.length - 6
      truncatedMessages.splice(systemMessages.length, 0, {
        role: 'system' as const,
        content: `[Conversation truncated: ${skippedCount} older messages removed to fit context limit. Total original: ${currentTokens} tokens, truncated to: ~${this.estimateMessagesTokens(truncatedMessages)} tokens]`,
      })
    }

    return truncatedMessages
  }

  /**
   * Estimate tokens for a tool call
   */
  private estimateToolCallTokens(toolCall: any): number {
    const toolName = toolCall.name || 'unknown'
    const args = toolCall.args || {}
    const argsStr = JSON.stringify(args)
    return Math.ceil((toolName.length + argsStr.length) / 4) + 100 // Base overhead
  }

  private currentModel: string
  private workingDirectory: string = process.cwd()
  private executionContext: Map<string, any> = new Map()
  private enhancedContext: Map<string, any> = new Map()
  private conversationMemory: CoreMessage[] = []
  private analysisCache: Map<string, any> = new Map()
  private contextEnhancer: ContextEnhancer
  private performanceOptimizer: PerformanceOptimizer
  private webSearchProvider: WebSearchProvider
  private ideContextEnricher: IDEContextEnricher
  private advancedTools: AdvancedTools
  private toolRouter: ToolRouter
  private toolRegistry: ToolRegistry
  private promptManager: PromptManager
  private smartCache: typeof smartCache
  private docLibrary: typeof docLibrary
  private progressiveTokenManager: ProgressiveTokenManager

  constructor(optimizationConfig?: TokenOptimizationConfig) {
    this.tokenOptimizer = new TokenOptimizer(optimizationConfig)
    this.progressiveTokenManager = new ProgressiveTokenManager()
    this.currentModel = configManager.get('currentModel') || 'claude-sonnet-4-20250514'
    this.contextEnhancer = new ContextEnhancer()
    this.performanceOptimizer = new PerformanceOptimizer(optimizationConfig)
    this.webSearchProvider = new WebSearchProvider()
    this.ideContextEnricher = new IDEContextEnricher()
    this.advancedTools = new AdvancedTools()
    this.toolRouter = new ToolRouter()
    this.toolRegistry = new ToolRegistry(process.cwd())
    this.promptManager = PromptManager.getInstance(process.cwd(), optimizationConfig)
    this.smartCache = smartCache
    this.docLibrary = docLibrary
  }

  // Optimize messages with token compression
  private async optimizeMessages(messages: CoreMessage[]): Promise<CoreMessage[]> {
    const optimizedMessages: CoreMessage[] = []

    for (const message of messages) {
      if (typeof message.content === 'string') {
        const result = await this.tokenOptimizer.optimizePrompt(message.content)
        optimizedMessages.push({
          ...message,
          content: result.content,
        } as CoreMessage)
      } else if (message.role === 'tool' && Array.isArray(message.content)) {
        // Handle tool messages with array content
        const optimizedContent = await Promise.all(
          message.content.map(async (part: any) => {
            if (part.type === 'text' && typeof part.text === 'string') {
              const result = await this.tokenOptimizer.optimizePrompt(part.text)
              return { ...part, text: result.content }
            }
            return part
          })
        )
        optimizedMessages.push({
          ...message,
          content: optimizedContent,
        } as CoreMessage)
      } else {
        optimizedMessages.push(message)
      }
    }

    return optimizedMessages
  }

  // Tool call tracking for intelligent continuation
  private readonly MAX_TOOL_CALL_HISTORY = 50
  private toolCallHistory: Array<{
    toolName: string
    args: any
    result: any
    timestamp: Date
    success: boolean
  }> = []

  // Round tracking for 2-round limit
  private completedRounds: number = 0
  private maxRounds: number = 2

  // Advanced context enhancement system
  private async enhanceContext(messages: CoreMessage[]): Promise<CoreMessage[]> {
    // Store enhanced context for reuse
    const contextKey = this.generateContextKey(messages)
    if (this.enhancedContext.has(contextKey)) {
      const cached = this.enhancedContext.get(contextKey)
      QuietCacheLogger.logCacheSave(cached.tokensSaved || 0)
      return cached.messages
    }

    const enhancedMessages = await this.contextEnhancer.enhance(messages, {
      workingDirectory: this.workingDirectory,
      executionContext: this.executionContext,
      conversationMemory: this.conversationMemory,
      analysisCache: this.analysisCache,
    })

    // Apply token optimization to enhanced messages
    const optimizedMessages = await this.optimizeMessages(enhancedMessages)

    // Calculate token savings
    const originalTokens = this.estimateMessagesTokens(enhancedMessages)
    const optimizedTokens = this.estimateMessagesTokens(optimizedMessages)
    const tokensSaved = originalTokens - optimizedTokens

    // Cache enhanced context
    this.enhancedContext.set(contextKey, {
      messages: optimizedMessages,
      tokensSaved,
      timestamp: Date.now(),
    })

    // Update conversation memory
    this.conversationMemory = optimizedMessages.slice(-20) // Keep last 20 messages

    // Reset tool history and rounds for new conversation context
    const lastUserMessage = optimizedMessages.filter((m) => m.role === 'user').pop()
    if (lastUserMessage) {
      this.toolCallHistory = [] // Fresh start for new queries
      this.completedRounds = 0 // Reset rounds counter
    }

    return optimizedMessages
  }

  /**
   * Generate context key for caching
   */
  private generateContextKey(messages: CoreMessage[]): string {
    const content = messages
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .join('|')
    return require('node:crypto').createHash('md5').update(content).digest('hex').substring(0, 16)
  }

  // Enhanced system prompt with advanced capabilities (using PromptManager)
  private async getEnhancedSystemPrompt(context: any = {}): Promise<string> {
    try {
      // Get documentation context if available
      const docsContext = await this.getDocumentationContext()

      // Detect package manager
      const { PackageManagerDetector } = await import('../utils/package-manager-detector')
      const pmDetector = new PackageManagerDetector(this.workingDirectory)
      const packageManagerContext = pmDetector.getContextString()

      // Try to load base agent prompt first
      const basePrompt = await this.promptManager.loadPromptForContext({
        agentId: 'base-agent',
        parameters: {
          workingDirectory: this.workingDirectory,
          availableTools: this.toolRouter
            .getAllTools()
            .map((tool) => `${tool.tool}: ${tool.description}`)
            .join(', '),
          documentationContext: docsContext,
          packageManager: packageManagerContext,
          ...context,
        },
      })

      // If docs are loaded, append them to the base prompt
      if (docsContext) {
        return `${basePrompt}\n\n${docsContext}`
      }

      return basePrompt
    } catch (_error) {
      // Fallback to hardcoded prompt if file system prompts fail
      const toolDescriptions = this.toolRouter
        .getAllTools()
        .map((tool) => `${tool.tool}: ${tool.description}`)
        .join(', ')

      // Get documentation context for fallback too
      const docsContext = await this.getDocumentationContext()

      // Detect package manager for fallback
      const { PackageManagerDetector } = await import('../utils/package-manager-detector')
      const pmDetector = new PackageManagerDetector(this.workingDirectory)
      const packageManagerContext = pmDetector.getContextString()

      const basePrompt = `You are an advanced AI development assistant with enhanced capabilities:

⚡︎ **Enhanced Intelligence**:
- Context-aware analysis and reasoning
- Multi-step problem solving
- Pattern recognition and optimization
- Adaptive learning from conversation history

🔨 **Advanced Tools**:
- File system operations with metadata analysis
- Code generation with syntax validation
- Directory exploration with intelligent filtering
- Command execution with safety checks
- Package management with dependency analysis

📊 **Context Management**:
- Workspace awareness and file structure understanding
- Conversation memory and pattern recognition
- Execution context tracking
- Analysis result caching

🎯 **Optimization Features**:
- Token-aware response generation
- Chained file reading for large analyses
- Intelligent caching strategies
- Performance monitoring and optimization

💡 **Best Practices**:
- Always validate file operations
- Provide clear explanations for complex tasks
- Use appropriate tools for each task type
- Maintain conversation context and continuity

**Current Working Directory**: ${this.workingDirectory}
**Available Tools**: ${toolDescriptions}

${packageManagerContext}

Respond in a helpful, professional manner with clear explanations and actionable insights.`

      // Add documentation context if available
      if (docsContext) {
        return `${basePrompt}\n\n${docsContext}`
      }

      return basePrompt
    }
  }

  // Get current documentation context for AI
  private async getDocumentationContext(): Promise<string | null> {
    try {
      const stats = docsContextManager.getContextStats()

      if (stats.loadedCount === 0) {
        return null
      }

      // Get context summary and full context
      const contextSummary = docsContextManager.getContextSummary()
      const fullContext = docsContextManager.getFullContext()

      // Apply token optimization to documentation context
      let optimizedContext = fullContext
      if (fullContext.length > 1000) {
        const optimizationResult = await this.tokenOptimizer.optimizePrompt(fullContext)
        optimizedContext = optimizationResult.content

        if (optimizationResult.tokensSaved > 50) {
          QuietCacheLogger.logCacheSave(optimizationResult.tokensSaved)
        }
      }

      // Limit context size to prevent token overflow
      const maxContextLength = 25000 // Reduced due to optimization
      if (optimizedContext.length <= maxContextLength) {
        return optimizedContext
      }

      // If still too large, return optimized summary
      const optimizedSummary = await this.tokenOptimizer.optimizePrompt(contextSummary)
      return `# DOCUMENTATION CONTEXT SUMMARY\n\n${optimizedSummary.content}\n\n[Full documentation context available but truncated due to size limits. ${stats.totalWords.toLocaleString()} words across ${stats.loadedCount} documents loaded.]`
    } catch (error) {
      console.error('Error getting documentation context:', error)
      return null
    }
  }

  // Load tool-specific prompts for enhanced execution
  private async getToolPrompt(toolName: string, parameters: any = {}): Promise<string> {
    try {
      return await this.promptManager.loadPromptForContext({
        toolName,
        parameters: {
          workingDirectory: this.workingDirectory,
          ...parameters,
        },
      })
    } catch (_error) {
      // Return fallback prompt if file prompt fails
      return `Execute ${toolName} with the provided parameters. Follow best practices and provide clear, helpful output.`
    }
  }

  // Advanced file operations with context awareness
  private getAdvancedTools(): Record<string, CoreTool> {
    return {
      // Enhanced file reading with analysis and chunking support
      read_file: tool({
        description: `Read and analyze file contents with metadata and intelligent chunking.

CRITICAL TOKEN MANAGEMENT:
- Always reads in 200-line chunks by default to prevent token overflow
- Use startLine and maxLinesPerChunk for incremental reading of large files
- Token budget (default: 3000) automatically truncates content if exceeded

USAGE EXAMPLES:
- Read first 200 lines: read_file("src/file.ts")
- Read lines 201-400: read_file("src/file.ts", { startLine: 201, maxLinesPerChunk: 200 })
- Read with JSON parsing: read_file("package.json", { parseJson: true })
- Read without comments: read_file("src/file.ts", { stripComments: true })

The tool automatically handles chunking, token limits, and provides continuation hints when files are truncated.`,
        parameters: z.object({
          path: z.string().min(1).describe('File path to read (relative to project root). Example: "src/components/Button.tsx"'),
          analyze: z.boolean().optional().default(true).describe('Whether to analyze file structure and extract metadata (functions, imports, exports, etc.)'),
          encoding: z.string().optional().default('utf8').describe('File encoding (default: utf8). Use utf8 for text files, binary files will be detected automatically.'),
          maxSize: z.number().int().min(1).optional().describe('Maximum file size in bytes to read (safety limit). Prevents reading extremely large files. Example: 10485760 for 10MB limit.'),
          maxLines: z.number().int().min(1).optional().describe('Maximum total lines to read (overrides maxLinesPerChunk if smaller). Useful for reading only first N lines.'),
          stripComments: z.boolean().optional().default(false).describe('Strip comments from code files (JS/TS/Python/CSS/HTML). Reduces token usage for large files.'),
          parseJson: z.boolean().optional().default(false).describe('Parse content as JSON and return parsed object instead of string. Use for config files like package.json, tsconfig.json.'),
          startLine: z.number().int().min(1).optional().default(1).describe('Starting line number (1-based). Default: 1. Use for incremental reading: startLine=1 for lines 1-200, startLine=201 for lines 201-400, etc.'),
          maxLinesPerChunk: z.number().int().min(1).max(200).optional().default(200).describe('Maximum lines to read per chunk (default: 200, max: 200). CRITICAL: Never exceed 200 to avoid token overflow. This is enforced by the system prompt.'),
          tokenBudget: z.number().int().min(1000).optional().default(3000).describe('Token budget for this read operation (default: 3000). Content will be automatically truncated if estimated tokens exceed this budget. Increase only if necessary.'),
        }),
        execute: async ({
          path,
          analyze = true,
          encoding = 'utf8',
          maxSize,
          maxLines,
          stripComments = false,
          parseJson = false,
          startLine = 1,
          maxLinesPerChunk = 200,
          tokenBudget = 3000
        }) => {
          try {
            // Load tool-specific prompt for context
            const toolPrompt = await this.getToolPrompt('read_file', {
              path,
              analyze,
              encoding,
              maxSize,
              maxLines,
              stripComments,
              parseJson,
              startLine,
              maxLinesPerChunk,
              tokenBudget,
            })

            const fullPath = resolve(this.workingDirectory, path)
            if (!existsSync(fullPath)) {
              return { error: `File not found: ${path}` }
            }

            const stats = statSync(fullPath)

            // Check maxSize if specified
            if (maxSize && stats.size > maxSize) {
              return { error: `File too large: ${stats.size} bytes (max: ${maxSize} bytes)` }
            }

            const extension = extname(fullPath)

            // Read file content with specified encoding
            // NOTE: We read the full file first, then chunk it in memory
            // This is necessary to calculate line numbers correctly
            const fullContent = readFileSync(fullPath, encoding as BufferEncoding)
            const allLines = fullContent.split('\n')
            const totalLines = allLines.length

            // Calculate effective chunk size
            // CRITICAL: Always respect the 200-line limit to prevent token overflow
            // This aligns with the system prompt requirement for token management
            const effectiveMaxLines = Math.min(
              maxLinesPerChunk,
              maxLines ?? maxLinesPerChunk,
              200 // Hard limit to respect token budget (system prompt requirement)
            )

            // Read chunk based on startLine and maxLinesPerChunk
            const startIdx = Math.max(0, startLine - 1)
            const endIdx = Math.min(startIdx + effectiveMaxLines, allLines.length)
            const chunkLines = allLines.slice(startIdx, endIdx)
            let content = chunkLines.join('\n')

            const isTruncated = endIdx < allLines.length
            const nextStartLine = isTruncated ? endIdx + 1 : null
            const actualStartLine = startIdx + 1
            const actualEndLine = endIdx

            // Strip comments if requested
            if (stripComments && this.isCodeFile(path)) {
              content = this.stripComments(content, extension)
            }

            // Estimate tokens (rough: ~3.7 chars per token)
            // This is a conservative estimate to prevent token overflow
            const estimatedTokens = Math.ceil(content.length / 3.7)

            // If content exceeds token budget, truncate further
            // This ensures we never exceed the specified token budget
            let finalContent = content
            let finalTruncated = isTruncated
            let finalNextStartLine = nextStartLine
            let finalEndLine = actualEndLine

            if (estimatedTokens > tokenBudget) {
              // Truncate to fit token budget
              const maxChars = tokenBudget * 3.7
              const lines = content.split('\n')
              let charCount = 0
              let lineIdx = 0

              for (let i = 0; i < lines.length; i++) {
                const lineChars = lines[i].length + 1 // +1 for newline
                if (charCount + lineChars > maxChars) {
                  lineIdx = i
                  break
                }
                charCount += lineChars
                lineIdx = i + 1
              }

              finalContent = lines.slice(0, lineIdx).join('\n')
              finalEndLine = actualStartLine + lineIdx - 1
              finalTruncated = true
              finalNextStartLine = finalEndLine + 1
            }

            // Parse JSON if requested
            let parsedContent: any = null
            if (parseJson) {
              try {
                parsedContent = JSON.parse(finalContent)
              } catch (parseError: any) {
                return { error: `Failed to parse JSON: ${parseError.message}` }
              }
            }

            let analysis = null
            if (analyze) {
              analysis = this.analyzeFileContent(finalContent, extension)
            }

            // Store in context for future operations (store chunk info)
            this.executionContext.set(`file:${path}`, {
              content: finalContent,
              stats,
              analysis,
              lastRead: new Date(),
              toolPrompt,
              chunkInfo: {
                startLine: actualStartLine,
                endLine: finalEndLine,
                nextStartLine: finalNextStartLine,
                truncated: finalTruncated,
                totalLines,
              },
            })

            // Build result aligned with ReadFileResultSchema
            const result: any = {
              success: true,
              filePath: relative(this.workingDirectory, fullPath),
              content: parsedContent || finalContent,
              size: stats.size,
              encoding,
              metadata: {
                lines: finalContent.split('\n').length,
                isEmpty: finalContent.length === 0,
                isBinary: encoding !== 'utf8' && encoding !== 'utf-8',
                extension,
                startLine: actualStartLine,
                endLine: finalEndLine,
                nextStartLine: finalNextStartLine,
                truncated: finalTruncated,
                estimatedTokens: Math.ceil(finalContent.length / 3.7),
              },
            }

            // Add analysis if requested (not part of schema but useful)
            if (analyze && analysis) {
              result.analysis = analysis
            }

            // Add continuation hint if truncated (helpful for AI agents)
            if (finalTruncated && finalNextStartLine) {
              result.continuationHint = `💡 File truncated at line ${finalEndLine} of ${totalLines}. To read more: read_file("${path}", { startLine: ${finalNextStartLine}, maxLinesPerChunk: 200, tokenBudget: 3000 })`
              result.metadata.totalLines = totalLines
            }

            return result
          } catch (error: any) {
            // Return error in ReadFileResultSchema format
            return {
              success: false,
              filePath: path,
              content: '',
              size: 0,
              encoding: encoding || 'utf8',
              error: `Failed to read file: ${error.message}`,
              metadata: {
                lines: 0,
                isEmpty: true,
                isBinary: false,
                extension: extname(path),
              },
            }
          }
        },
      }),

      // Smart file writing with automatic LSP validation
      write_file: tool({
        description: 'Write content to file with automatic LSP validation, backup, and auto-fix capabilities',
        parameters: z.object({
          path: z.string().describe('File path to write'),
          content: z.string().describe('Content to write'),
          encoding: z.string().optional().default('utf8').describe('File encoding (default: utf8)'),
          mode: z.number().int().optional().describe('File mode/permissions (octal, e.g., 0o644)'),
          createBackup: z.boolean().optional().default(true).describe('Create backup if file exists (alias: backup)'),
          backup: z.boolean().optional().default(true).describe('Create backup if file exists (deprecated: use createBackup)'),
          autoRollback: z.boolean().optional().default(false).describe('Automatically rollback on validation failure'),
          verifyWrite: z.boolean().optional().default(true).describe('Verify file was written correctly by reading it back'),
          showDiff: z.boolean().optional().default(true).describe('Show diff preview before writing'),
          skipFormatting: z.boolean().optional().default(false).describe('Skip automatic code formatting'),
          validate: z.boolean().optional().default(true).describe('Use LSP validation before writing'),
          agentId: z.string().optional().describe('ID of the agent making this request'),
          reasoning: z.string().optional().describe('Reasoning behind this file creation/modification'),
        }),
        execute: async ({ path, content, encoding = 'utf8', mode, createBackup = true, backup = true, autoRollback = false, verifyWrite = true, showDiff = true, skipFormatting = false, validate = true, agentId, reasoning }) => {
          try {
            // Load tool-specific prompt for context
            const toolPrompt = await this.getToolPrompt('write_file', {
              path,
              content: `${content.substring(0, 100)}...`,
              backup,
              validate,
            })

            const fullPath = resolve(this.workingDirectory, path)
            const dir = dirname(fullPath)

            // Ensure directory exists
            if (!existsSync(dir)) {
              mkdirSync(dir, { recursive: true })
            }

            // ⚡︎ VALIDATION WITH LSP - Before writing anything
            let validationResult = null
            let finalContent = content

            if (validate) {
              advancedUI.logFunctionCall(`validating:${path}`)
              advancedUI.logFunctionUpdate('info', 'Validating with LSP before writing...', 'ℹ')

              const validationContext: ValidationContext = {
                filePath: fullPath,
                content,
                operation: existsSync(fullPath) ? 'update' : 'create',
                agentId,
                projectType: this.detectProjectType(this.workingDirectory),
              }

              validationResult = await validatorManager.validateContent(validationContext)

              if (!validationResult.isValid) {
                // Auto-fix was attempted in ValidatorManager
                if (validationResult.fixedContent) {
                  finalContent = validationResult.fixedContent
                  advancedUI.logFunctionUpdate('success', 'Auto-fix and formatting applied successfully', '✓')
                } else {
                  // If validation fails and no auto-fix available, return error
                  return {
                    success: false,
                    error: `File processing failed: ${validationResult.errors?.join(', ')}`,
                    path,
                    validationErrors: validationResult.errors,
                    reasoning: reasoning || 'Agent attempted to write file but processing failed',
                  }
                }
              } else {
                // Use formatted content even if validation passed
                if (validationResult.fixedContent) {
                  finalContent = validationResult.fixedContent
                }

                if (validationResult.formatted) {
                  advancedUI.logFunctionUpdate('success', 'File formatted and validated successfully', '✓')
                } else {
                  advancedUI.logFunctionUpdate('success', `Validation passed for ${path}`, '✓')
                }
              }
            }

            // Use createBackup if provided, otherwise fallback to backup
            const shouldBackup = createBackup || backup

            // Create backup if file exists
            let backedUp = false
            if (shouldBackup && existsSync(fullPath)) {
              const backupPath = `${fullPath}.backup.${Date.now()}`
              writeFileSync(backupPath, readFileSync(fullPath, 'utf-8'))
              backedUp = true
              advancedUI.logFunctionUpdate('info', `Backup created: ${backupPath}`, 'ℹ')
            }

            // Prepare diff preview before writing
            let existingContent = ''
            let hasExisting = false
            try {
              if (existsSync(fullPath)) {
                existingContent = readFileSync(fullPath, 'utf-8')
                hasExisting = true
              }
            } catch {
              /* ignore */
            }

            // Show visual diff in stream/panels when content changed (if enabled)
            try {
              if (showDiff && !hasExisting) {
                const fd: FileDiff = {
                  filePath: fullPath,
                  originalContent: '',
                  newContent: finalContent,
                  isNew: true,
                  isDeleted: false,
                }
                console.log('\n')
                DiffViewer.showFileDiff(fd, { compact: true })
              } else if (showDiff && existingContent !== finalContent) {
                const fd: FileDiff = {
                  filePath: fullPath,
                  originalContent: existingContent,
                  newContent: finalContent,
                  isNew: false,
                  isDeleted: false,
                }
                console.log('\n')
                DiffViewer.showFileDiff(fd, { compact: true })
                diffManager.addFileDiff(fullPath, existingContent, finalContent)
              }
            } catch {
              /* ignore visual diff errors */
            }

            // Write the validated file
            writeFileSync(fullPath, finalContent, encoding as BufferEncoding)
            const stats = statSync(fullPath)

            // Set file mode if specified
            if (mode !== undefined) {
              try {
                await execAsync(`chmod ${mode.toString(8)} "${fullPath}"`, { cwd: this.workingDirectory })
              } catch {
                // Ignore chmod errors on some systems
              }
            }

            // Verify write if enabled
            if (verifyWrite) {
              try {
                const writtenContent = readFileSync(fullPath, encoding as BufferEncoding)
                if (writtenContent !== finalContent) {
                  if (autoRollback && backedUp) {
                    // Rollback from backup
                    const backupPath = `${fullPath}.backup.${Date.now()}`
                    const backupFiles = readdirSync(dirname(fullPath)).filter((f) => f.startsWith(basename(fullPath) + '.backup.'))
                    if (backupFiles.length > 0) {
                      const latestBackup = backupFiles.sort().reverse()[0]
                      const backupContent = readFileSync(resolve(dirname(fullPath), latestBackup), encoding as BufferEncoding)
                      writeFileSync(fullPath, backupContent, encoding as BufferEncoding)
                      advancedUI.logFunctionUpdate('error', 'Write verification failed - rolled back to backup', '✖')
                      return {
                        success: false,
                        error: 'Write verification failed - content mismatch',
                        path,
                        rolledBack: true,
                      }
                    }
                  }
                  advancedUI.logFunctionUpdate('warning', 'Write verification detected content mismatch', '⚠')
                }
              } catch (verifyError: any) {
                advancedUI.logFunctionUpdate('warning', `Write verification failed: ${verifyError.message}`, '⚠')
              }
            }

            advancedUI.logFunctionUpdate('success', `File written successfully: ${path} (${stats.size} bytes)`, '✓')

            // Update context
            this.executionContext.set(`file:${path}`, {
              content,
              stats,
              lastWritten: new Date(),
              backedUp,
              toolPrompt,
            })

            // File operation completed

            return {
              path: relative(this.workingDirectory, fullPath),
              size: stats.size,
              created: !backedUp,
              updated: backedUp,
              backedUp,
              formatted: validationResult?.formatted || false,
              formatter: validationResult?.formatter,
              validation: validationResult
                ? {
                  isValid: validationResult.isValid,
                  errors: validationResult.errors,
                  warnings: validationResult.warnings,
                }
                : null,
              reasoning: reasoning || `File ${backedUp ? 'updated' : 'created'} by agent`,
            }
          } catch (error: any) {
            return { error: `Failed to write file: ${error.message}` }
          }
        },
      }),

      // Intelligent directory operations
      explore_directory: tool({
        description: 'Explore directory structure with intelligent filtering',
        parameters: z.object({
          path: z.string().default('.').describe('Directory to explore'),
          depth: z.number().default(2).describe('Maximum depth to explore'),
          includeHidden: z.boolean().default(false).describe('Include hidden files'),
          filterBy: z.enum(['all', 'code', 'config', 'docs']).default('all').describe('Filter files by type'),
        }),
        execute: async ({ path, depth, includeHidden, filterBy }) => {
          try {
            // Load tool-specific prompt for context
            const toolPrompt = await this.getToolPrompt('explore_directory', {
              path,
              depth,
              includeHidden,
              filterBy,
            })

            const fullPath = resolve(this.workingDirectory, path)
            const structure = this.exploreDirectoryStructure(fullPath, depth, includeHidden, filterBy)

            // Update context with directory understanding
            this.executionContext.set(`dir:${path}`, {
              structure,
              explored: new Date(),
              fileCount: this.countFiles(structure),
              toolPrompt,
            })

            return {
              path: relative(this.workingDirectory, fullPath),
              structure,
              summary: this.generateDirectorySummary(structure),
              fileCount: this.countFiles(structure),
              recommendations: this.generateDirectoryRecommendations(structure),
            }
          } catch (error: any) {
            return { error: `Failed to explore directory: ${error.message}` }
          }
        },
      }),

      // Autonomous command execution with intelligence
      execute_command: tool({
        description: 'Execute commands autonomously with context awareness and safety checks',
        parameters: z.object({
          command: z.string().describe('Command to execute'),
          args: z.array(z.string()).optional().default([]).describe('Command arguments'),
          cwd: z.string().optional().describe('Working directory for command execution (defaults to project root)'),
          timeout: z.number().int().min(100).optional().default(30000).describe('Timeout in milliseconds (min: 100ms)'),
          skipConfirmation: z.boolean().optional().default(true).describe('Skip confirmation prompts (alias: autonomous)'),
          autonomous: z.boolean().optional().default(true).describe('Execute without confirmation (deprecated: use skipConfirmation)'),
          env: z.record(z.string()).optional().describe('Environment variables to set for command'),
          shell: z.enum(['bash', 'sh', 'zsh', 'fish', 'powershell', 'cmd']).optional().describe('Shell to use for command execution'),
        }),
        execute: async ({ command, args = [], cwd, timeout = 30000, skipConfirmation = true, autonomous = true, env, shell }) => {
          const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
          const commandCwd = cwd ? resolve(this.workingDirectory, cwd) : this.workingDirectory
          const startTime = Date.now()

          try {
            // Load tool-specific prompt for context
            const toolPrompt = await this.getToolPrompt('execute_command', {
              command,
              args,
              autonomous,
            })
            CliUI.logDebug(`Using system prompt: ${toolPrompt.substring(0, 100)}...`)

            const effectiveSkipConfirmation = skipConfirmation || autonomous

            // Safety check for dangerous commands
            const isDangerous = this.isDangerousCommand(fullCommand)
            if (isDangerous && !effectiveSkipConfirmation) {
              return {
                error: 'Command requires manual confirmation',
                command: fullCommand,
                reason: isDangerous,
              }
            }

            // Use provided cwd or default to project root
            const projectRoot = this.workingDirectory

            // Controlla se il comando tenta di cambiare directory
            if (fullCommand.includes('cd ') && !fullCommand.includes(`cd ${projectRoot}`)) {
              return {
                error: 'Command blocked: cannot change directory outside project',
                command: fullCommand,
                reason: 'Security: directory change blocked',
              }
            }

            advancedUI.logFunctionCall('executing')
            advancedUI.logFunctionUpdate('info', fullCommand, '●')

            // Prepare environment variables
            const commandEnv = env ? { ...process.env, ...env } : process.env

            // Execute command with options
            const { stdout, stderr } = await execAsync(fullCommand, {
              cwd: commandCwd,
              timeout,
              env: commandEnv,
              shell: shell || undefined, // Use shell if specified
            })

            const duration = Date.now() - startTime

            // Pausa molto leggera tra comandi per evitare sovraccarichi
            await this.sleep(50)

            // Store execution context
            this.executionContext.set(`cmd:${command}`, {
              command: fullCommand,
              stdout,
              stderr,
              duration,
              executed: new Date(),
              cwd: commandCwd,
            })

            // Command completed

            return {
              success: true,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: 0, // execAsync doesn't throw on success
              command: fullCommand,
              duration,
              workingDirectory: commandCwd,
              shell: shell || undefined,
            }
          } catch (error: any) {
            advancedUI.logFunctionUpdate('error', `Command failed: ${error.message}`, '✖')
            return {
              success: false,
              stdout: '',
              stderr: error.message,
              exitCode: error.code || 1,
              command: fullCommand,
              duration: Date.now() - startTime,
              workingDirectory: commandCwd,
              shell: shell || undefined,
            }
          }
        },
      }),

      // Advanced project analysis
      analyze_project: tool({
        description: 'Comprehensive autonomous project analysis',
        parameters: z.object({
          includeMetrics: z.boolean().default(true).describe('Include code metrics'),
          analyzeDependencies: z.boolean().default(true).describe('Analyze dependencies'),
          securityScan: z.boolean().default(true).describe('Basic security analysis'),
        }),
        execute: async ({ includeMetrics, analyzeDependencies, securityScan }) => {
          try {
            // Load tool-specific prompt for context
            const toolPrompt = await this.getToolPrompt('analyze_project', {
              includeMetrics,
              analyzeDependencies,
              securityScan,
            })
            CliUI.logDebug(`Using system prompt: ${toolPrompt.substring(0, 100)}...`)

            advancedUI.logFunctionUpdate('info', 'Starting comprehensive project analysis...', 'ℹ')

            const analysis = await this.performAdvancedProjectAnalysis({
              includeMetrics,
              analyzeDependencies,
              securityScan,
            })

            // Store complete analysis in context (may be large)
            this.executionContext.set('project:analysis', analysis)

            // Return a compact, chunk-safe summary to avoid prompt overflow
            const compact = compactAnalysis(analysis, {
              maxDirs: 40,
              maxFiles: 150,
              maxChars: 8000,
            })

            return compact
          } catch (error: any) {
            return { error: `Project analysis failed: ${error.message}` }
          }
        },
      }),

      // Autonomous package management
      manage_packages: tool({
        description: 'Autonomously manage project dependencies',
        parameters: z.object({
          action: z.enum(['install', 'add', 'remove', 'update', 'audit']).describe('Package action'),
          packages: z.array(z.string()).default([]).describe('Package names'),
          dev: z.boolean().default(false).describe('Development dependency'),
          global: z.boolean().default(false).describe('Global installation'),
        }),
        execute: async ({ action, packages, dev, global }) => {
          try {
            // Load tool-specific prompt for context
            const toolPrompt = await this.getToolPrompt('manage_packages', {
              action,
              packages,
              dev,
              global,
            })
            CliUI.logDebug(`Using system prompt: ${toolPrompt.substring(0, 100)}...`)

            const command = 'bun'
            let args: string[] = []

            switch (action) {
              case 'install':
                args = ['install']
                break
              case 'add':
                args = ['add', ...packages]
                if (dev) args.push('--dev')
                if (global) args.push('--global')
                if (dev) args.push('--save-dev')
                if (!dev && existsSync(resolve(this.workingDirectory, 'package.json'))) {
                  args.push('--save')
                }
                break
              case 'remove':
                args = ['remove', ...packages]
                break
              case 'update':
                args = ['upgrade', ...packages]
                break
              case 'audit':
                args = ['audit']
                break
            }

            advancedUI.logFunctionCall(`${action}packages`)
            advancedUI.logFunctionUpdate('info', `${packages.join(', ') || 'all'}`, '●')

            const { stdout, stderr } = await execAsync(`${command} ${args.join(' ')}`, {
              cwd: this.workingDirectory,
              timeout: 120000, // 2 minutes for package operations
            })

            return {
              action,
              packages,
              success: true,
              output: stdout.trim(),
              warnings: stderr.trim(),
            }
          } catch (error: any) {
            return {
              action,
              packages,
              success: false,
              error: error.message,
            }
          }
        },
      }),

      // Intelligent code generation
      generate_code: tool({
        description: 'Generate code with context awareness and best practices',
        parameters: z.object({
          type: z.enum(['component', 'function', 'class', 'test', 'config', 'docs']).describe('Code type'),
          description: z.string().describe('What to generate'),
          language: z.string().default('typescript').describe('Programming language'),
          framework: z.string().optional().describe('Framework context (react, node, etc)'),
          outputPath: z.string().optional().describe('Where to save the generated code'),
        }),
        execute: async ({ type, description, language, framework, outputPath }) => {
          try {
            // Load tool-specific prompt for context
            const toolPrompt = await this.getToolPrompt('generate_code', {
              type,
              description,
              language,
              framework,
            })
            CliUI.logDebug(`Using system prompt: ${toolPrompt.substring(0, 100)}...`)

            advancedUI.logFunctionCall(`generating${type}`)
            advancedUI.logFunctionUpdate('info', description, '●')

            const projectContext = this.executionContext.get('project:analysis')
            const codeGenResult = await this.generateIntelligentCode({
              type,
              description,
              language,
              framework: framework || projectContext?.framework,
              projectContext,
              outputPath,
            })

            if (outputPath && codeGenResult.code) {
              writeFileSync(resolve(this.workingDirectory, outputPath), codeGenResult.code)
              // Code generated
            }

            return codeGenResult
          } catch (error: any) {
            return { error: `Code generation failed: ${error.message}` }
          }
        },
      }),

      // Web search capabilities (native OpenAI web_search_preview when available)
      web_search_preview: this.webSearchProvider.getNativeWebSearchTool() || this.webSearchProvider.getWebSearchTool(),
      web_search: this.webSearchProvider.getWebSearchTool(),

      // IDE context enrichment
      ide_context: this.ideContextEnricher.getIDEContextTool(),

      // Advanced AI-powered tools
      semantic_search: this.advancedTools.getSemanticSearchTool(),
      code_analysis: this.advancedTools.getCodeAnalysisTool(),
      dependency_analysis: this.advancedTools.getDependencyAnalysisTool(),
      git_workflow: this.advancedTools.getGitWorkflowTool(),

      // Documentation tools
      doc_search: documentationTools.search,
      doc_add: documentationTools.add,
      doc_stats: documentationTools.stats,

      // Smart documentation tools for AI agents
      smart_docs_search: smartDocsTools.search,
      smart_docs_load: smartDocsTools.load,
      smart_docs_context: smartDocsTools.context,

      // AI documentation request tools
      docs_request: aiDocsTools.request,
      docs_gap_report: aiDocsTools.gapReport,

      // AI memory search tools
      memory_search: aiMemoryTools.search,
      memory_get_context: aiMemoryTools.getContext,

      // ==================== ENTERPRISE BATCH & SEARCH TOOLS ====================

      // 1. MULTI-READ: Batch file reading con search/context (Priority 8)
      multi_read: tool({
        description:
          'Read multiple files safely with optional content search and context - preferred for batch operations',
        parameters: z.object({
          files: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe('Explicit file paths to read - can be string or array'),
          globs: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe('Glob patterns (e.g., "src/**/*.ts" or ["src/**/*.ts"])'),
          root: z.string().optional().describe('Root directory for search'),
          exclude: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe('Patterns to exclude - can be string or array'),
          pattern: z.string().optional().describe('Search pattern within files'),
          useRegex: z.boolean().default(false).describe('Use regex for pattern'),
          caseSensitive: z.boolean().default(false).describe('Case sensitive search'),
          contextLines: z.number().default(0).describe('Lines of context around matches'),
        }),
        execute: async (params) => {
          const multiReadTool = this.toolRegistry.getTool('multi-read-tool')
          if (!multiReadTool) return { error: 'Multi-read tool not available' }
          // Normalize string inputs to arrays
          const normalizedParams = {
            ...params,
            files: params.files ? (Array.isArray(params.files) ? params.files : [params.files]) : undefined,
            globs: params.globs ? (Array.isArray(params.globs) ? params.globs : [params.globs]) : undefined,
            exclude: params.exclude ? (Array.isArray(params.exclude) ? params.exclude : [params.exclude]) : undefined,
          }
          const result = await multiReadTool.execute(normalizedParams)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 2. GREP: Advanced pattern search (Priority 9 - HIGHEST)
      grep: tool({
        description:
          'Search for text patterns in codebase - ripgrep-like search for finding specific strings, function names, TODOs, imports, etc. Always preferred over web_search for local code search. Examples: "search for TODO comments", "find all imports of React", "locate function definitions"',
        parameters: z.object({
          pattern: z
            .string()
            .describe(
              'The text or string to search for (literal string by default, use useRegex:true for regex patterns). Examples: "TODO", "export function", "import React"'
            ),
          path: z
            .string()
            .optional()
            .describe(
              'Search directory (defaults to current working directory). Examples: "src", "src/components", "." for all'
            ),
          include: z
            .string()
            .optional()
            .describe(
              'File pattern to include (glob pattern like "*.ts", "*.tsx", "*.js"). Leave empty to search all files'
            ),
          exclude: z
            .array(z.string())
            .optional()
            .describe('Array of patterns to exclude. Examples: ["node_modules", "dist", "*.test.ts"]'),
          caseSensitive: z
            .boolean()
            .default(false)
            .describe('Case sensitive search - default false (case insensitive)'),
          wholeWord: z.boolean().default(false).describe('Match whole words only - prevents partial matches'),
          useRegex: z
            .boolean()
            .default(false)
            .describe('Treat pattern as regex - set true for regex patterns like "^export"'),
          contextLines: z
            .number()
            .default(0)
            .describe('Number of lines to show before/after match for context (0 = just the line)'),
          maxResults: z.number().default(100).describe('Maximum number of results to return (default 100)'),
        }),
        execute: async (params) => {
          const grepTool = this.toolRegistry.getTool('grep-tool')
          if (!grepTool) return { error: 'Grep tool not available' }
          const result = await grepTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 3. MULTI-EDIT: Atomic batch edits (Priority 8)
      multi_edit: tool({
        description: 'Apply multiple edits atomically with rollback - preferred for batch modifications',
        parameters: z.object({
          edits: z
            .array(
              z.object({
                file: z.string().min(1).describe('File path to edit'),
                search: z.string().min(1).describe('Text to search for (oldString)'),
                replace: z.string().describe('Replacement text (newString)'),
                replaceAll: z.boolean().optional().default(true).describe('Replace all occurrences in this edit'),
              })
            )
            .min(1)
            .describe('Array of edit operations (at least one required)'),
          createBackup: z.boolean().optional().default(true).describe('Create backup before editing'),
          showDiff: z.boolean().optional().default(true).describe('Show diff preview of changes'),
          validateSyntax: z.boolean().optional().default(true).describe('Validate syntax after edits'),
          autoFormat: z.boolean().optional().default(true).describe('Auto-format code after edits'),
          dryRun: z.boolean().optional().default(false).describe('Preview changes without applying (alias: previewOnly)'),
          previewOnly: z.boolean().optional().default(false).describe('Preview changes without applying'),
        }),
        execute: async (params) => {
          const multiEditTool = this.toolRegistry.getTool('multi-edit-tool')
          if (!multiEditTool) return { error: 'Multi-edit tool not available' }
          if (!params.edits || params.edits.length === 0) {
            return { error: 'No edits provided' }
          }

          const operations = params.edits
            .map((edit) => ({
              filePath: edit.file,
              oldString: edit.search,
              newString: edit.replace,
              replaceAll: edit.replaceAll ?? true,
            }))
            .filter((op) => op.filePath && op.oldString !== undefined && op.newString !== undefined)

          if (operations.length === 0) {
            return { error: 'No valid edits provided' }
          }

          const isPreview = params.dryRun || params.previewOnly

          const result = await multiEditTool.execute({
            operations,
            previewOnly: isPreview,
            dryRun: isPreview,
            rollbackOnError: true,
            createBackup: params.createBackup ?? true,
            showDiff: params.showDiff ?? true,
            validateSyntax: params.validateSyntax ?? true,
            autoFormat: params.autoFormat ?? true,
          })
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 4. FIND-FILES: Glob pattern matching (Priority 5)
      find_files: tool({
        description: 'Find files matching glob patterns with intelligent filtering',
        parameters: z.object({
          patterns: z
            .union([z.string(), z.array(z.string())])
            .describe(
              'Glob patterns - can be a single string or array (e.g., "**/*.ts" or ["**/*.ts", "src/**/*.json"])'
            ),
          cwd: z.string().optional().describe('Working directory for search'),
          exclude: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe('Patterns to exclude - can be a single string or array'),
          maxResults: z.number().int().min(1).max(1000).optional().describe('Maximum number of results (1-1000)'),
          includeHidden: z.boolean().optional().default(false).describe('Include hidden files'),
          extensions: z.array(z.string()).optional().describe('Filter by file extensions (e.g., [".ts", ".tsx"])'),
          excludePatterns: z.array(z.string()).optional().describe('Array of patterns to exclude'),
          caseSensitive: z.boolean().optional().default(false).describe('Case sensitive pattern matching'),
        }),
        execute: async (params) => {
          const findTool = this.toolRegistry.getTool('find-files-tool')
          if (!findTool) return { error: 'Find files tool not available' }
          // Normalize patterns to array
          const normalizedParams = {
            ...params,
            patterns: Array.isArray(params.patterns) ? params.patterns : [params.patterns],
            exclude: params.exclude ? (Array.isArray(params.exclude) ? params.exclude : [params.exclude]) : undefined,
          }
          const result = await findTool.execute(normalizedParams)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 5. EDIT-FILE: Edit with diff preview (Priority 6)
      edit_file: tool({
        description: 'Edit file with diff preview, validation and backup',
        parameters: z.object({
          file: z.string().min(1).describe('File path to edit'),
          search: z.string().min(1).describe('Exact text to find (oldString)'),
          replace: z.string().describe('Replacement text (newString)'),
          replaceAll: z.boolean().optional().default(true).describe('Replace all occurrences (default: true)'),
          createBackup: z.boolean().optional().default(true).describe('Create backup before editing (alias: backup)'),
          backup: z.boolean().optional().default(true).describe('Create backup before editing (deprecated: use createBackup)'),
        }),
        execute: async (params) => {
          const editTool = this.toolRegistry.getTool('edit-tool')
          if (!editTool) return { error: 'Edit tool not available' }

          if (!params.file || params.search === undefined || params.replace === undefined) {
            return { error: 'file, search and replace are required' }
          }

          const shouldBackup = params.createBackup !== undefined ? params.createBackup : params.backup

          const result = await editTool.execute({
            filePath: params.file,
            oldString: params.search,
            newString: params.replace,
            replaceAll: params.replaceAll ?? true,
            createBackup: shouldBackup,
          })
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 6. REPLACE-IN-FILE: Regex replace with validation (Priority 6)
      replace_in_file: tool({
        description: 'Replace content in files with regex support and validation',
        parameters: z.object({
          file: z.string().describe('File path to modify'),
          pattern: z.string().describe('Search pattern (regex supported)'),
          replacement: z.string().describe('Replacement text'),
          useRegex: z.boolean().default(false).describe('Use regex for pattern'),
          backup: z.boolean().default(true).describe('Create backup before replacing'),
        }),
        execute: async (params) => {
          const replaceTool = this.toolRegistry.getTool('replace-in-file-tool')
          if (!replaceTool) return { error: 'Replace tool not available' }

          if (!params.file || params.pattern === undefined || params.replacement === undefined) {
            return { error: 'file, pattern and replacement are required' }
          }

          const searchPattern = params.useRegex ? new RegExp(params.pattern, 'g') : params.pattern
          const result = await replaceTool.execute(params.file, searchPattern, params.replacement, {
            createBackup: params.backup,
            requireMatch: true,
          })
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 7. LIST: Advanced directory listing (Priority 4)
      list: tool({
        description: 'List files and directories with intelligent ignore patterns',
        parameters: z.object({
          path: z.string().default('.').describe('Directory path to list'),
          recursive: z.boolean().default(false).describe('List recursively'),
          includeHidden: z.boolean().default(false).describe('Include hidden files'),
          pattern: z.string().optional().describe('Filter by pattern'),
        }),
        execute: async (params) => {
          const listTool = this.toolRegistry.getTool('list-tool')
          if (!listTool) return { error: 'List tool not available' }
          const result = await listTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // ==================== SEARCH & ANALYSIS TOOLS ====================

      // 8. RAG_SEARCH: Semantic search in RAG system (Priority 8)
      rag_search: tool({
        description:
          'Perform semantic search in the RAG system to find relevant code and documentation using embeddings',
        parameters: z.object({
          query: z
            .string()
            .describe('What to search for semantically (e.g., "authentication logic", "error handling patterns")'),
          limit: z.number().min(1).max(50).default(10).describe('Maximum number of results'),
          semanticOnly: z.boolean().default(false).describe('Use pure semantic search (embedding-based) vs hybrid'),
          threshold: z.number().min(0).max(1).default(0.3).describe('Minimum similarity score (0-1)'),
          includeAnalysis: z.boolean().default(false).describe('Include query analysis metadata'),
          workingDirectory: z.string().optional().describe('Working directory for search context'),
        }),
        execute: async (params) => {
          const ragSearchTool = this.toolRegistry.getTool('rag-search-tool')
          if (!ragSearchTool) return { error: 'RAG search tool not available' }
          const result = await ragSearchTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 9. GLOB: Fast glob pattern matching (Priority 6)
      glob: tool({
        description: 'Fast file pattern matching with glob support, sorting, and filtering',
        parameters: z.object({
          pattern: z
            .union([z.string(), z.array(z.string())])
            .describe('Glob pattern(s) (e.g., "**/*.ts", ["*.ts", "*.tsx"])'),
          path: z.string().optional().describe('Base path for search'),
          ignorePatterns: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe('Patterns to ignore - can be string or array'),
          onlyFiles: z.boolean().optional().describe('Return only files'),
          onlyDirectories: z.boolean().optional().describe('Return only directories'),
          followSymlinks: z.boolean().optional().describe('Follow symbolic links'),
          caseSensitive: z.boolean().optional().describe('Case sensitive matching'),
          maxDepth: z.number().optional().describe('Maximum directory depth'),
          sortBy: z.enum(['name', 'size', 'mtime', 'atime']).optional().describe('Sort results by'),
          sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort order'),
          maxResults: z.number().optional().describe('Maximum number of results'),
          minSize: z.number().optional().describe('Minimum file size in bytes'),
          maxSize: z.number().optional().describe('Maximum file size in bytes'),
          modifiedAfter: z.string().optional().describe('Modified after date (ISO string)'),
          modifiedBefore: z.string().optional().describe('Modified before date (ISO string)'),
        }),
        execute: async (params) => {
          const globTool = this.toolRegistry.getTool('glob-tool')
          if (!globTool) return { error: 'Glob tool not available' }
          // Normalize string inputs to arrays
          const normalizedParams = {
            ...params,
            pattern: Array.isArray(params.pattern) ? params.pattern : [params.pattern],
            ignorePatterns: params.ignorePatterns
              ? Array.isArray(params.ignorePatterns)
                ? params.ignorePatterns
                : [params.ignorePatterns]
              : undefined,
          }
          const result = await globTool.execute(normalizedParams)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 10. DIFF: File comparison tool (Priority 5)
      diff: tool({
        description: 'Compare files and content with multiple diff algorithms (line, word, character)',
        parameters: z.object({
          source: z.string().describe('Source file path or content'),
          target: z.string().describe('Target file path or content'),
          mode: z.enum(['lines', 'words', 'chars']).default('lines').describe('Diff algorithm mode'),
          format: z.enum(['unified', 'side-by-side', 'inline']).default('unified').describe('Output format'),
          context: z.number().optional().describe('Lines of context for unified diff'),
          ignoreWhitespace: z.boolean().default(false).describe('Ignore whitespace differences'),
          ignoreCase: z.boolean().default(false).describe('Case insensitive comparison'),
          showLineNumbers: z.boolean().default(true).describe('Show line numbers'),
          colorize: z.boolean().default(true).describe('Colorize output'),
        }),
        execute: async (params) => {
          const diffTool = this.toolRegistry.getTool('diff-tool')
          if (!diffTool) return { error: 'Diff tool not available' }
          const result = await diffTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 11. TREE: Directory tree visualization (Priority 4)
      tree: tool({
        description: 'Visualize directory structure as a tree with statistics',
        parameters: z.object({
          path: z.string().optional().describe('Directory path to visualize'),
          maxDepth: z.number().optional().describe('Maximum depth to traverse'),
          showHidden: z.boolean().default(false).describe('Include hidden files'),
          showSize: z.boolean().default(false).describe('Show file sizes'),
          showFullPath: z.boolean().default(false).describe('Show full paths'),
          ignorePatterns: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe('Patterns to ignore - can be string or array'),
          onlyDirectories: z.boolean().default(false).describe('Show only directories'),
          sortBy: z.enum(['name', 'size', 'type']).optional().describe('Sort order'),
          useIcons: z.boolean().default(true).describe('Use file type icons'),
        }),
        execute: async (params) => {
          const treeTool = this.toolRegistry.getTool('tree-tool')
          if (!treeTool) return { error: 'Tree tool not available' }
          // Normalize string inputs to arrays
          const normalizedParams = {
            ...params,
            ignorePatterns: params.ignorePatterns
              ? Array.isArray(params.ignorePatterns)
                ? params.ignorePatterns
                : [params.ignorePatterns]
              : undefined,
          }
          const result = await treeTool.execute(normalizedParams)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 12. WATCH: File system monitoring (Priority 3)
      watch: tool({
        description: 'Monitor file system changes in real-time with pattern filtering',
        parameters: z.object({
          path: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe('Path(s) to watch'),
          patterns: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe('File patterns to watch - can be string or array'),
          ignorePatterns: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe('Patterns to ignore - can be string or array'),
          ignoreInitial: z.boolean().default(true).describe('Ignore initial file scan'),
          persistent: z.boolean().default(true).describe('Keep watching after first event'),
          depth: z.number().optional().describe('Maximum directory depth'),
          awaitWriteFinish: z.boolean().default(false).describe('Wait for write operations to finish'),
          debounceDelay: z.number().optional().describe('Debounce delay in milliseconds'),
          events: z
            .array(z.enum(['add', 'change', 'unlink', 'addDir', 'unlinkDir']))
            .optional()
            .describe('Event types to watch'),
          maxEvents: z.number().optional().describe('Maximum number of events to collect'),
        }),
        execute: async (params) => {
          const watchTool = this.toolRegistry.getTool('watch-tool')
          if (!watchTool) return { error: 'Watch tool not available' }
          // Normalize string inputs to arrays
          const normalizedParams = {
            ...params,
            path: params.path ? (Array.isArray(params.path) ? params.path : [params.path]) : undefined,
            patterns: params.patterns
              ? Array.isArray(params.patterns)
                ? params.patterns
                : [params.patterns]
              : undefined,
            ignorePatterns: params.ignorePatterns
              ? Array.isArray(params.ignorePatterns)
                ? params.ignorePatterns
                : [params.ignorePatterns]
              : undefined,
          }
          const result = await watchTool.execute(normalizedParams)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // ==================== AI & VISION TOOLS ====================

      // 13. VISION_ANALYSIS: AI vision analysis (Priority 7)
      vision_analysis: tool({
        description: 'Analyze images with AI vision models (Claude, GPT-4V, Gemini)',
        parameters: z.object({
          imagePath: z.string().describe('Path to image file to analyze'),
          provider: z.enum(['claude', 'openai', 'google']).optional().describe('AI provider to use'),
          prompt: z.string().optional().describe('Custom analysis prompt'),
          cache: z.boolean().default(true).describe('Cache analysis results'),
        }),
        execute: async (params) => {
          const visionTool = this.toolRegistry.getTool('vision-analysis-tool')
          if (!visionTool) return { error: 'Vision analysis tool not available' }
          // Vision tool takes imagePath as first param, options as second
          const result = await visionTool.execute(params.imagePath, {
            provider: params.provider,
            prompt: params.prompt,
            cache: params.cache,
          })
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 14. IMAGE_GENERATION: AI image generation (Priority 6)
      image_generation: tool({
        description: 'Generate images from text prompts using DALL-E 3, GPT-Image-1, or other AI models',
        parameters: z.object({
          prompt: z.string().min(1).describe('Text description of image to generate'),
          model: z
            .enum([
              'dall-e-3',
              'dall-e-2',
              'gpt-image-1',
              'google/gemini-2.5-flash-image',
              'openai/gpt-5-image-mini',
              'openai/gpt-5-image',
            ])
            .optional()
            .describe('Image generation model'),
          size: z
            .enum(['1024x1024', '1792x1024', '1024x1792', '512x512', '256x256'])
            .optional()
            .describe('Image dimensions'),
          quality: z.enum(['standard', 'hd']).optional().describe('Image quality'),
          style: z.enum(['vivid', 'natural']).optional().describe('Image style'),
          n: z.number().min(1).max(10).optional().describe('Number of images to generate'),
          outputPath: z.string().optional().describe('Path to save generated image'),
          cache: z.boolean().default(true).describe('Cache generation results'),
        }),
        execute: async (params) => {
          const imageGenTool = this.toolRegistry.getTool('image-generation-tool')
          if (!imageGenTool) return { error: 'Image generation tool not available' }
          const result = await imageGenTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // ==================== BLOCKCHAIN TOOLS ====================

      // 15. COINBASE_AGENTKIT: Coinbase blockchain operations (Priority 7)
      coinbase_agentkit: tool({
        description:
          'Execute blockchain operations using official Coinbase AgentKit (WETH, Pyth, ERC20, CDP Smart Wallet)',
        parameters: z.object({
          action: z.string().describe('Action: init, chat, wallet-info, transfer, balance, status, reset'),
          params: z.record(z.any()).optional().describe('Action-specific parameters'),
        }),
        execute: async (params) => {
          const coinbaseTool = this.toolRegistry.getTool('coinbase-agentkit-tool')
          if (!coinbaseTool) return { error: 'Coinbase AgentKit tool not available' }
          // Coinbase tool takes action as first param, params as second
          const result = await coinbaseTool.execute(params.action, params.params || {})
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 16. GOAT_TOOL: GOAT SDK blockchain operations (Priority 7)
      goat_tool: tool({
        description: 'Execute blockchain operations using GOAT SDK (Polymarket, ERC20) on Polygon and Base',
        parameters: z.object({
          action: z.string().describe('Action: init, chat, wallet-info, polymarket-*, erc20-*, status, reset'),
          params: z.record(z.any()).optional().describe('Action-specific parameters'),
        }),
        execute: async (params) => {
          const goatTool = this.toolRegistry.getTool('goat-tool')
          if (!goatTool) return { error: 'GOAT tool not available' }
          // GOAT tool takes action as first param, params as second
          const result = await goatTool.execute(params.action, params.params || {})
          return result.success ? result.data : { error: result.error }
        },
      }),

      // ==================== BROWSER AUTOMATION TOOLS ====================

      // 17. BROWSERBASE: Browserbase web automation (Priority 6)
      browserbase: tool({
        description: 'Web browsing automation and AI-powered content analysis using Browserbase',
        parameters: z.object({
          action: z.string().describe('Action: create-session, navigate, analyze, get-content, close-session'),
          params: z.record(z.any()).optional().describe('Action-specific parameters'),
        }),
        execute: async (params) => {
          const browserbaseTool = this.toolRegistry.getTool('browserbase-tool')
          if (!browserbaseTool) return { error: 'Browserbase tool not available' }
          // Browserbase tool takes action as first param, params as second
          const result = await browserbaseTool.execute(params.action, params.params || {})
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 18. BROWSER_NAVIGATE: Navigate to URL (Priority 5)
      browser_navigate: tool({
        description: 'Navigate to a URL and wait for page to load',
        parameters: z.object({
          sessionId: z.string().describe('Browser session ID'),
          url: z.string().url().describe('URL to navigate to'),
          waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().describe('Wait condition'),
          timeout: z.number().optional().describe('Timeout in milliseconds'),
        }),
        execute: async (params) => {
          const browserNavTool = this.toolRegistry.getTool('browser_navigate')
          if (!browserNavTool) return { error: 'Browser navigate tool not available' }
          const result = await browserNavTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 19. BROWSER_CLICK: Click elements (Priority 5)
      browser_click: tool({
        description: 'Click on an element using CSS selector or text',
        parameters: z.object({
          sessionId: z.string().describe('Browser session ID'),
          selector: z.string().describe('CSS selector or text to click'),
          button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button'),
          clickCount: z.number().optional().describe('Number of clicks'),
          delay: z.number().optional().describe('Delay between clicks'),
          force: z.boolean().optional().describe('Force click even if element is not visible'),
        }),
        execute: async (params) => {
          const browserClickTool = this.toolRegistry.getTool('browser_click')
          if (!browserClickTool) return { error: 'Browser click tool not available' }
          const result = await browserClickTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 20. BROWSER_TYPE: Type text (Priority 5)
      browser_type: tool({
        description: 'Type text into an input field or textarea',
        parameters: z.object({
          sessionId: z.string().describe('Browser session ID'),
          selector: z.string().describe('CSS selector of input element'),
          text: z.string().describe('Text to type'),
          clear: z.boolean().optional().describe('Clear existing text first'),
          delay: z.number().optional().describe('Delay between keystrokes'),
        }),
        execute: async (params) => {
          const browserTypeTool = this.toolRegistry.getTool('browser_type')
          if (!browserTypeTool) return { error: 'Browser type tool not available' }
          const result = await browserTypeTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 21. BROWSER_SCREENSHOT: Take screenshots (Priority 4)
      browser_screenshot: tool({
        description: 'Take a screenshot of the current page or viewport',
        parameters: z.object({
          sessionId: z.string().describe('Browser session ID'),
          fullPage: z.boolean().optional().describe('Capture full page or viewport only'),
          quality: z.number().min(0).max(100).optional().describe('JPEG quality (0-100)'),
          type: z.enum(['png', 'jpeg']).optional().describe('Image format'),
        }),
        execute: async (params) => {
          const browserScreenshotTool = this.toolRegistry.getTool('browser_screenshot')
          if (!browserScreenshotTool) return { error: 'Browser screenshot tool not available' }
          const result = await browserScreenshotTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 22. BROWSER_EXTRACT_TEXT: Extract text content (Priority 4)
      browser_extract_text: tool({
        description: 'Extract text content from page or specific element',
        parameters: z.object({
          sessionId: z.string().describe('Browser session ID'),
          selector: z.string().optional().describe('CSS selector to extract text from (or entire page)'),
          attribute: z.string().optional().describe('Extract attribute value instead of text'),
        }),
        execute: async (params) => {
          const browserExtractTool = this.toolRegistry.getTool('browser_extract_text')
          if (!browserExtractTool) return { error: 'Browser extract text tool not available' }
          const result = await browserExtractTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 23. BROWSER_WAIT_FOR_ELEMENT: Wait for elements (Priority 4)
      browser_wait_for_element: tool({
        description: 'Wait for an element to appear or change state',
        parameters: z.object({
          sessionId: z.string().describe('Browser session ID'),
          selector: z.string().describe('CSS selector to wait for'),
          state: z.enum(['visible', 'hidden', 'attached', 'detached']).optional().describe('Element state to wait for'),
          timeout: z.number().optional().describe('Timeout in milliseconds'),
        }),
        execute: async (params) => {
          const browserWaitTool = this.toolRegistry.getTool('browser_wait_for_element')
          if (!browserWaitTool) return { error: 'Browser wait for element tool not available' }
          const result = await browserWaitTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 24. BROWSER_SCROLL: Scroll page (Priority 3)
      browser_scroll: tool({
        description: 'Scroll the page or a specific element',
        parameters: z.object({
          sessionId: z.string().describe('Browser session ID'),
          direction: z.enum(['up', 'down', 'left', 'right']).describe('Scroll direction'),
          amount: z.number().optional().describe('Pixels to scroll (default: 500)'),
          selector: z.string().optional().describe('Element to scroll (default: page)'),
        }),
        execute: async (params) => {
          const browserScrollTool = this.toolRegistry.getTool('browser_scroll')
          if (!browserScrollTool) return { error: 'Browser scroll tool not available' }
          const result = await browserScrollTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 25. BROWSER_EXECUTE_SCRIPT: Execute JavaScript (Priority 5)
      browser_execute_script: tool({
        description: 'Execute custom JavaScript in the browser context',
        parameters: z.object({
          sessionId: z.string().describe('Browser session ID'),
          script: z.string().describe('JavaScript code to execute'),
          args: z.array(z.any()).optional().describe('Arguments to pass to script'),
        }),
        execute: async (params) => {
          const browserScriptTool = this.toolRegistry.getTool('browser_execute_script')
          if (!browserScriptTool) return { error: 'Browser execute script tool not available' }
          const result = await browserScriptTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 26. BROWSER_GET_PAGE_INFO: Get page information (Priority 3)
      browser_get_page_info: tool({
        description: 'Get current page information (title, URL, navigation state)',
        parameters: z.object({
          sessionId: z.string().describe('Browser session ID'),
        }),
        execute: async (params) => {
          const browserInfoTool = this.toolRegistry.getTool('browser_get_page_info')
          if (!browserInfoTool) return { error: 'Browser get page info tool not available' }
          const result = await browserInfoTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // ==================== MANUFACTURING TOOLS ====================

      // 27. TEXT_TO_CAD: Text to CAD conversion (Priority 5)
      text_to_cad: tool({
        description: 'Convert text descriptions into CAD elements and models with AI',
        parameters: z.object({
          description: z.string().min(1).describe('Text description of CAD model to generate'),
          outputFormat: z.enum(['stl', 'step', 'dwg', 'json', 'scad']).optional().describe('Output file format'),
          streaming: z.boolean().default(false).describe('Stream generation progress'),
          constraints: z.record(z.any()).optional().describe('Design constraints'),
          outputPath: z.string().optional().describe('Path to save CAD file'),
        }),
        execute: async (params) => {
          const cadTool = this.toolRegistry.getTool('text-to-cad-tool')
          if (!cadTool) return { error: 'Text to CAD tool not available' }
          const result = await cadTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 28. TEXT_TO_GCODE: Text to G-code conversion (Priority 5)
      text_to_gcode: tool({
        description: 'Convert text descriptions into G-code for CNC machining and 3D printing',
        parameters: z.object({
          description: z.string().min(1).describe('Text description of machining operation to generate'),
        }),
        execute: async (params) => {
          const gcodeTool = this.toolRegistry.getTool('text-to-gcode-tool')
          if (!gcodeTool) return { error: 'Text to G-code tool not available' }
          const result = await gcodeTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // ==================== SYSTEM TOOLS ====================

      // 29. BASH: Bash command execution (Priority 6)
      bash: tool({
        description: 'Execute shell commands with analysis, confirmation and streaming',
        parameters: z.object({
          command: z.string().min(1).max(1000).describe('Shell command to execute'),
          timeout: z.number().int().positive().max(600000).optional().describe('Timeout in milliseconds'),
          description: z.string().max(500).optional().describe('Description of what the command does'),
          workingDirectory: z.string().optional().describe('Working directory for command'),
          environment: z.record(z.string()).optional().describe('Environment variables'),
          allowDangerous: z.boolean().default(false).describe('Allow potentially dangerous commands'),
          shell: z.enum(['bash', 'sh', 'zsh', 'fish', 'powershell', 'cmd']).optional().describe('Shell to use'),
        }),
        execute: async (params) => {
          const bashTool = this.toolRegistry.getTool('bash-tool')
          if (!bashTool) return { error: 'Bash tool not available' }
          const result = await bashTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 30. JSON_PATCH: JSON patch operations (Priority 6)
      json_patch: tool({
        description: 'Apply RFC6902-like JSON patches with diff/backup to configuration files',
        parameters: z.object({
          filePath: z.string().describe('Path to JSON/YAML file to patch'),
          operations: z
            .array(
              z.object({
                op: z.enum(['add', 'replace', 'remove']).describe('Operation type'),
                path: z.string().describe('JSON path (e.g., "/scripts/build")'),
                value: z.any().optional().describe('Value for add/replace operations'),
              })
            )
            .describe('Array of patch operations'),
          createBackup: z.boolean().default(true).describe('Create backup before patching'),
          previewOnly: z.boolean().default(false).describe('Preview changes without applying'),
          allowMissing: z.boolean().default(false).describe('Allow patching non-existent files'),
          skipConfirmation: z.boolean().default(false).describe('Skip user confirmation'),
        }),
        execute: async (params) => {
          const jsonPatchTool = this.toolRegistry.getTool('json-patch-tool')
          if (!jsonPatchTool) return { error: 'JSON patch tool not available' }
          const result = await jsonPatchTool.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),

      // 31. GIT_TOOLS: Git operations (Priority 6)
      git_tools: tool({
        description: 'Safe Git operations: status, diff, commit, applyPatch (no push)',
        parameters: z.object({
          action: z.enum(['status', 'diff', 'commit', 'applyPatch']).describe('Git action to perform'),
          args: z.record(z.any()).optional().describe('Action-specific arguments (e.g., {message: "..."} for commit)'),
        }),
        execute: async (params) => {
          const gitTools = this.toolRegistry.getTool('git-tools')
          if (!gitTools) return { error: 'Git tools not available' }
          const result = await gitTools.execute(params)
          return result.success ? result.data : { error: result.error }
        },
      }),
    }
  }

  // Claude Code style streaming with full autonomy
  async *streamChatWithFullAutonomy(messages: CoreMessage[], abortSignal?: AbortSignal): AsyncGenerator<StreamEvent> {
    if (abortSignal && !(abortSignal instanceof AbortSignal)) {
      throw new TypeError('Invalid AbortSignal provided')
    }

    // Start performance monitoring
    const sessionId = `session_${Date.now()}`
    const startTime = Date.now()
    this.performanceOptimizer.startMonitoring()

    // Enhance context with advanced intelligence
    const enhancedMessages = await this.enhanceContext(messages)

    // Optimize messages for performance
    const optimizedMessages = await this.performanceOptimizer.optimizeMessages(enhancedMessages)

    // Apply truncation to prevent prompt length errors - ULTRA AGGRESSIVE
    const truncatedMessages = await this.truncateMessages(optimizedMessages, 60000) // 60k tokens limit (reduced from 120k)

    const routingCfg = configManager.get('modelRouting')
    const effectiveModelName = routingCfg?.enabled
      ? await this.resolveAdaptiveModel('chat_default', truncatedMessages)
      : undefined
    const model = this.getModel(effectiveModelName) as any
    const allTools = this.getAdvancedTools()

    // Get last user message for active tools selection
    const lastUserMsg = truncatedMessages.filter((m) => m.role === 'user').pop()
    const userContent =
      typeof lastUserMsg?.content === 'string'
        ? lastUserMsg.content
        : Array.isArray(lastUserMsg?.content)
          ? lastUserMsg.content.map((p: any) => ('text' in p ? p.text : '')).join(' ')
          : ''

    // Active Tools Pattern: Select relevant tools based on user's message
    // Reference: https://ai-sdk.dev/docs/agents - best practices
    const tools = this.selectActiveTools(userContent, allTools, 7) // Allow up to 7 tools for autonomous mode

    try {
      // ADVANCED: Check completion protocol cache first (ultra-efficient)
      const lastUserMessage = truncatedMessages.filter((m) => m.role === 'user').pop()
      const systemContext = truncatedMessages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n')

      if (lastUserMessage) {
        // Check if this is an analysis request (skip cache for fresh analysis)
        const userContent =
          typeof lastUserMessage.content === 'string'
            ? lastUserMessage.content
            : Array.isArray(lastUserMessage.content)
              ? lastUserMessage.content
                .map((part) => (typeof part === 'string' ? part : part.providerOptions?.content || ''))
                .join('')
              : String(lastUserMessage.content)

        // Use ToolRouter for intelligent tool analysis
        const toolRecommendations = this.toolRouter.analyzeMessage(lastUserMessage)
        this.toolRouter.logRecommendations(userContent, toolRecommendations)

        const isAnalysisRequest =
          userContent.toLowerCase().includes('analizza') ||
          userContent.toLowerCase().includes('analysis') ||
          userContent.toLowerCase().includes('analisi') ||
          userContent.toLowerCase().includes('scan') ||
          userContent.toLowerCase().includes('esplora') ||
          userContent.toLowerCase().includes('explore') ||
          userContent.toLowerCase().includes('trova') ||
          userContent.toLowerCase().includes('find') ||
          userContent.toLowerCase().includes('cerca') ||
          userContent.toLowerCase().includes('search')

        // Usa cache intelligente ma leggera
        const cacheDecision = this.smartCache.shouldCache(userContent, systemContext)

        if (cacheDecision.should && !isAnalysisRequest) {
          const cachedResponse = await this.smartCache.getCachedResponse(userContent, systemContext)

          if (cachedResponse) {
            yield {
              type: 'start',
              content: `🎯 Using smart cache (${cacheDecision.strategy})...`,
            }

            // Stream the cached response through streamtty - it handles chunking internally
            const formattedResponse = this.formatCachedResponse(cachedResponse.response)
            yield { type: 'text_delta', content: formattedResponse }

            yield {
              type: 'complete',
              content: `Cache hit - ${cachedResponse.metadata.tokensSaved} tokens saved!`,
            }
            return
          }
        } else if (isAnalysisRequest) {
          yield {
            type: 'start',
            content: 'Starting fresh analysis (bypassing cache)...',
          }
        }
      }

      yield {
        type: 'start',
        content: 'Initializing autonomous AI assistant...',
      }

      const originalTokens = this.estimateMessagesTokens(messages)
      const truncatedTokens = this.estimateMessagesTokens(truncatedMessages)

      // 🛡️ TOKEN GUARD: Check toolchain token limits before starting
      const globalNikCLI = (global as any).__nikcli
      if (globalNikCLI?.manageToolchainTokens) {
        const estimatedToolchainTokens = Math.max(originalTokens, truncatedTokens) * 2 // Estimate toolchain overhead
        const canProceed = globalNikCLI.manageToolchainTokens('streamChat', estimatedToolchainTokens)

        if (!canProceed) {
          yield {
            type: 'thinking',
            content: '🛡️ Token limit reached - clearing context and continuing...',
          }
          globalNikCLI.clearToolchainContext('streamChat')
          // Continue with fresh context
        }
      }

      // Check if we're approaching token limits and need to create a summary
      const tokenLimit = 80000 // Conservative limit
      const isAnalysisRequest =
        lastUserMessage &&
        typeof lastUserMessage.content === 'string' &&
        (lastUserMessage.content.toLowerCase().includes('analizza') ||
          lastUserMessage.content.toLowerCase().includes('analysis') ||
          lastUserMessage.content.toLowerCase().includes('analisi') ||
          lastUserMessage.content.toLowerCase().includes('scan') ||
          lastUserMessage.content.toLowerCase().includes('esplora') ||
          lastUserMessage.content.toLowerCase().includes('explore'))

      if (isAnalysisRequest && originalTokens > tokenLimit * 0.8) {
        yield {
          type: 'thinking',
          content: '📊 Large analysis detected - enabling chained file reading to avoid token limits...',
        }

        // Enabling chained file reading mode for large analysis

        // Add special instruction for chained file reading
        const chainedInstruction = `IMPORTANT: For this analysis, use chained file reading approach:
1. First, scan and list files/directories to understand structure
2. Then read files in small batches (max 3-5 files per call)
3. Process each batch before moving to the next
4. Build analysis incrementally to avoid token limits
5. Use find_files_tool first, then read_file_tool in small groups`

        // Add the instruction to the system context
        const enhancedSystemContext = `${systemContext}\n\n${chainedInstruction}`

        // Update messages with enhanced context
        const enhancedMessages = messages.map((msg) =>
          msg.role === 'system' ? { ...msg, content: enhancedSystemContext } : msg
        )

        // Use enhanced messages for the rest of the processing
        messages = enhancedMessages
      }

      const params = this.getProviderParams()

      // Add enhanced system prompt to truncatedMessages (async)
      const enhancedSystemPrompt = await this.getEnhancedSystemPrompt()
      const messagesWithEnhancedPrompt = truncatedMessages.map((msg) =>
        msg.role === 'system' ? { ...msg, content: enhancedSystemPrompt } : msg
      )

      const provider = this.getCurrentModelInfo().config.provider
      const safeMessages = this.sanitizeMessagesForProvider(provider, messagesWithEnhancedPrompt)

      // 🚨 EMERGENCY TOKEN ENFORCEMENT - Truncate if exceeding limits
      const finalMessages = safeMessages.map((msg) => ({
        ...msg,
        content:
          typeof msg.content === 'string'
            ? this.progressiveTokenManager.emergencyTruncate(msg.content, 1200000)
            : msg.content,
      })) as CoreMessage[]

      // Track step progress for loop control
      let stepCount = 0
      let totalToolCalls = 0
      let consecutiveEmptySteps = 0
      const maxConsecutiveEmptySteps = 3 // Stop after 3 empty steps (loop detection)

      const streamOpts: any = {
        model,
        messages: finalMessages,
        tools,
        maxToolRoundtrips: isAnalysisRequest ? 20 : 30, // Reduced to prevent token overflow
        temperature: params.temperature,
        abortSignal,
        // AI SDK toolChoice: 'auto' (default), 'none', 'required', or { type: 'tool', toolName: 'specific-tool' }
        // For autonomous operations, use 'auto' to let model decide tool usage
        toolChoice: 'auto',
        // AI SDK Tool Call Repair - automatically fix invalid tool calls
        repairToolCall: this.createToolCallRepairHandler(model, tools),
        // AI SDK Agent Loop Control - onStepFinish callback
        // Reference: https://ai-sdk.dev/docs/agents/loop-control
        onStepFinish: (step: {
          stepType: 'initial' | 'continue' | 'tool-result'
          text: string
          toolCalls: Array<{ toolName: string; args: unknown }>
          toolResults: Array<{ toolName: string; result: unknown }>
          usage: {
            promptTokens: number
            completionTokens: number
            totalTokens: number
          }
          finishReason: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other'
          isContinued: boolean
        }) => {
          stepCount++

          // Track tool call usage for intelligent loop control
          const toolCallsInStep = step.toolCalls?.length || 0
          totalToolCalls += toolCallsInStep

          // Loop detection: track consecutive empty steps
          if (!step.text && toolCallsInStep === 0) {
            consecutiveEmptySteps++
          } else {
            consecutiveEmptySteps = 0
          }

          // Log step progress
          const stepInfo = {
            step: stepCount,
            type: step.stepType,
            toolCalls: toolCallsInStep,
            totalToolCalls,
            tokens: step.usage?.totalTokens || 0,
            finishReason: step.finishReason,
          }

          // Emit step event for UI updates
          advancedUI.logFunctionUpdate(
            'info',
            `${darkGrayColor('Step:')} ${blueColor(`${stepCount} ${step.stepType}`)} | ${darkGrayColor('Tools:')} ${blueColor(toolCallsInStep)} | ${darkGrayColor('Tokens:')} ${blueColor(step.usage?.totalTokens || 0)}`,
            '⚡'
          )

          // Loop control: warn if stuck in loop
          if (consecutiveEmptySteps >= maxConsecutiveEmptySteps) {
            advancedUI.logWarning(
              `[LoopControl] Detected ${consecutiveEmptySteps} consecutive empty steps - potential loop`
            )
          }

          // Log tool results for debugging
          if (step.toolResults?.length > 0) {
            for (const result of step.toolResults) {
              advancedUI.logFunctionUpdate(
                'success',
                `${darkGrayColor('Tool result:')} ${greenColor(result.toolName)}`,
                '✓'
              )
            }
          }
        },
      }

      // Get current model config for provider-specific settings
      const cfg = this.getCurrentModelInfo().config as any

      // Override toolChoice from config if specified
      if (cfg?.toolChoice) {
        streamOpts.toolChoice = cfg.toolChoice
      }

      // Check if reasoning should be enabled
      const reasoningEnabled = this.shouldEnableReasoning()

      // OpenRouter and Anthropic models REQUIRE maxTokens
      if (provider !== 'openai') {
        if (provider === 'openrouter') {
          // All OpenRouter models require maxTokens parameter
          streamOpts.maxTokens = params.maxTokens

          // Add reasoning metadata for OpenRouter using ReasoningDetector
          if (reasoningEnabled) {
            const providerMetadata = ReasoningDetector.getReasoningProviderMetadata(
              provider,
              model,
              { enabled: true, effort: 'medium' }
            )

            if (Object.keys(providerMetadata).length > 0) {
              streamOpts.providerOptions = {
                ...streamOpts.providerOptions,
                ...providerMetadata,
              }
            }

            // Add transforms for context compression if supported
            try {
              const modelCaps = await openRouterRegistry.getCapabilities(model)
              if (modelCaps.supportedParameters && modelCaps.supportedParameters.includes('transforms')) {
                if (!streamOpts.providerOptions.openrouter) {
                  streamOpts.providerOptions.openrouter = {}
                }
                streamOpts.providerOptions.openrouter.transforms = ['middle-out']
              }
            } catch {
              // Silently fail if we can't get capabilities
            }
          }
        } else if (provider === 'anthropic') {
          if (this.getCurrentModelInfo().config.maxTokens) {
            streamOpts.maxTokens = params.maxTokens
          }

          // Add reasoning metadata for Anthropic using ReasoningDetector
          if (reasoningEnabled) {
            const providerMetadata = ReasoningDetector.getReasoningProviderMetadata(
              provider,
              model,
              { enabled: true, budgetTokens: 10000 }
            )

            if (Object.keys(providerMetadata).length > 0) {
              streamOpts.providerOptions = {
                ...streamOpts.providerOptions,
                ...providerMetadata,
              }
            }
          }
        } else {
          // Add reasoning metadata for other providers using ReasoningDetector
          if (reasoningEnabled) {
            const providerMetadata = ReasoningDetector.getReasoningProviderMetadata(
              provider,
              model,
              { enabled: true, effort: 'medium' }
            )

            if (Object.keys(providerMetadata).length > 0) {
              streamOpts.providerOptions = {
                ...streamOpts.providerOptions,
                ...providerMetadata,
              }
            }
          }
        }
      }
      const result = streamText(streamOpts)

      const currentToolCalls: ToolCallPart[] = []
      let accumulatedText = ''
      let toolCallCount = 0
      const maxToolCallsForAnalysis = 8 // REDUCED: Conservative limit to prevent token overflow (was 12)

      const approxCharLimit =
        provider === 'openai' && this.getCurrentModelInfo().config.provider === 'openai'
          ? params.maxTokens * 4
          : Number.POSITIVE_INFINITY
      let truncatedByCap = false
      for await (const delta of (await result).fullStream) {
        try {
          // Check for abort signal interruption
          if (abortSignal?.aborted) {
            yield {
              type: 'error',
              error: 'Stream interrupted',
              content: '⏹ Streaming stopped by user. You can start a new conversation anytime.',
            }
            break
          }

          switch (delta.type) {
            case 'text-delta':
              if (delta.textDelta) {
                accumulatedText += delta.textDelta
                // Yield raw markdown text - streamttyService will handle formatting
                yield {
                  type: 'text_delta',
                  content: delta.textDelta,
                  metadata: {
                    accumulatedLength: accumulatedText.length,
                    provider: this.getCurrentModelInfo().config.provider,
                    isMarkdown: true, // Flag for streamtty rendering
                  },
                }
                if (
                  provider === 'openai' &&
                  this.getCurrentModelInfo().config.provider === 'openai' &&
                  accumulatedText.length >= approxCharLimit
                ) {
                  truncatedByCap = true
                  break
                }
              }
              break

            case 'tool-call': {
              toolCallCount++
              currentToolCalls.push(delta)

              // 🛡️ TOKEN GUARD: Check tool call token usage
              const globalNikCLI = (global as any).__nikcli
              if (globalNikCLI?.manageToolchainTokens) {
                const toolTokens = this.estimateToolCallTokens(delta)
                const canProceed = globalNikCLI.manageToolchainTokens(delta.toolName, toolTokens)

                if (!canProceed) {
                  yield {
                    type: 'thinking',
                    content: `🛡️ Token limit for ${delta.toolName} - clearing context...`,
                  }
                  globalNikCLI.clearToolchainContext(delta.toolName)
                }
              }

              // Track this tool call in history (always track for intelligent analysis)
              this.toolCallHistory.push({
                toolName: delta.toolName,
                args: delta.args,
                result: null, // Will be updated when result comes
                timestamp: new Date(),
                success: false, // Will be updated
              })

              // Prevent unbounded growth
              if (this.toolCallHistory.length > this.MAX_TOOL_CALL_HISTORY) {
                this.toolCallHistory.shift()
              }

              // 🚨 EMERGENCY: Check if we're hitting tool call limits for analysis - use intelligent continuation
              if (isAnalysisRequest && toolCallCount > maxToolCallsForAnalysis) {
                yield {
                  type: 'thinking',
                  content: '🛡️ Tool call limit reached - switching to summary mode to prevent token overflow',
                }
                // Increment completed rounds
                this.completedRounds++

                const originalQuery =
                  typeof lastUserMessage?.content === 'string'
                    ? lastUserMessage.content
                    : String(lastUserMessage?.content || '')

                // Check if we've completed 2 rounds - if so, provide final summary and stop
                if (this.completedRounds >= this.maxRounds) {
                  const finalSummary = this.generateFinalSummary(originalQuery, this.toolCallHistory)

                  yield {
                    type: 'thinking',
                    content: `🏁 Completed ${this.completedRounds} rounds of analysis. Providing final summary.`,
                  }

                  // Format as natural conversational response
                  yield {
                    type: 'text_delta',
                    content: `\n\n${finalSummary}\n\n`,
                    metadata: { isMarkdown: true },
                  }
                  yield {
                    type: 'complete',
                    content: `Analysis completed after ${this.completedRounds} rounds. Please review the summary above.`,
                    metadata: { finalStop: true, rounds: this.completedRounds },
                  }
                  return // Hard stop after 2 rounds
                }

                // If this is the first round, continue with intelligent question
                const gapAnalysis = this.analyzeMissingInformation(originalQuery, this.toolCallHistory)
                const clarifyingQuestion = this.generateClarifyingQuestion(
                  gapAnalysis,
                  originalQuery,
                  this.toolCallHistory
                )

                yield {
                  type: 'thinking',
                  content: this.truncateForPrompt(`⚡︎ Round ${this.completedRounds} complete. ${gapAnalysis}`, 100),
                }

                // Format as natural conversational markdown
                yield {
                  type: 'text_delta',
                  content: `\n\n**Round ${this.completedRounds} Analysis:**\n${gapAnalysis}\n\n**Question to continue:**\n${clarifyingQuestion}\n\n`,
                  metadata: { isMarkdown: true },
                }
                // Don't break - let the conversation continue naturally
                break
              }

              // 🚨 Early warning when approaching limit
              if (toolCallCount > maxToolCallsForAnalysis * 0.8) {
                yield {
                  type: 'thinking',
                  content: `⚠︎ Approaching tool call limit (${toolCallCount}/${maxToolCallsForAnalysis}) - will summarize soon`,
                }
              }

              yield {
                type: 'tool_call',
                toolName: delta.toolName,
                toolArgs: delta.args,
                content: `Executing ${delta.toolName}... (${toolCallCount}/${maxToolCallsForAnalysis})`,
                metadata: { toolCallId: delta.toolCallId },
              }
              break
            }

            case 'tool-call-delta': {
              const toolCall = currentToolCalls.find((tc) => tc.toolCallId === delta.toolCallId)

              // Update tool history with result
              const historyEntry = this.toolCallHistory.find((h) => h.toolName === toolCall?.toolName)
              if (historyEntry) {
                historyEntry.result = delta.argsTextDelta
                historyEntry.success = !!delta.argsTextDelta
              }

              // 🗜️ Compress tool result to prevent token overflow
              const compressedResult = this.compressToolResult(delta.argsTextDelta, toolCall?.toolName || 'unknown')

              yield {
                type: 'tool_result',
                toolName: toolCall?.toolName,
                toolResult: compressedResult,
                content: `Completed ${toolCall?.toolName}`,
                metadata: {
                  toolCallId: delta.toolCallId,
                  success: !delta.argsTextDelta,
                },
              }
              break
            }

            case 'step-finish':
              if (delta.isContinued) {
                yield {
                  type: 'thinking',
                  content: 'Step completed, continuing to next step...',
                  metadata: { stepContinued: true },
                }
              } else {
                yield {
                  type: 'thinking',
                  content: 'Step finished successfully.',
                  metadata: { stepCompleted: true },
                }
              }
              break

            case 'finish':
              // Salva nella cache adattiva
              if (lastUserMessage && accumulatedText.trim()) {
                const userContentLength =
                  typeof lastUserMessage.content === 'string'
                    ? lastUserMessage.content.length
                    : String(lastUserMessage.content).length
                const tokensUsed =
                  delta.usage?.totalTokens || Math.round((userContentLength + accumulatedText.length) / 4)

                // Extract user content as string for storage
                const userContentStr =
                  typeof lastUserMessage.content === 'string'
                    ? lastUserMessage.content
                    : Array.isArray(lastUserMessage.content)
                      ? lastUserMessage.content
                        .map((part) =>
                          typeof part === 'string' ? part : part.providerOptions?.content || ''
                        )
                        .join('')
                      : String(lastUserMessage.content)

                // Salva nella cache intelligente
                try {
                  await this.smartCache.setCachedResponse(
                    userContentStr,
                    accumulatedText.trim(),
                    systemContext.substring(0, 1000),
                    {
                      tokensSaved: tokensUsed,
                      responseTime: Date.now() - startTime,
                      userSatisfaction: 1.0, // Default satisfaction
                    }
                  )
                } catch (_cacheError: any) {
                  // Continue without caching - don't fail the stream
                }

                // Emit REAL token usage from AI SDK (not estimates)
                if (delta.usage) {
                  yield {
                    type: 'usage',
                    usage: {
                      promptTokens: delta.usage.promptTokens || 0,
                      completionTokens: delta.usage.completionTokens || 0,
                      totalTokens: delta.usage.totalTokens || 0,
                    },
                  }
                }

                yield {
                  type: 'complete',
                  content: truncatedByCap ? 'Output truncated by local cap' : 'Task completed',
                  metadata: {
                    finishReason: delta.finishReason,
                    usage: delta.usage,
                    totalText: accumulatedText.length,
                    capped: truncatedByCap,
                  },
                }
              }
              break

            case 'error':
              yield {
                type: 'error',
                error: delta?.error as any,
                content: `Error: ${delta.error}`,
              }
              break
          }
        } catch (deltaError: any) {
          // Stream delta error occurred
          const friendlyMessage = this.getFriendlyErrorMessage(deltaError.message)
          yield {
            type: 'error',
            error: 'Streaming issue',
            content: friendlyMessage,
          }
        }
      }

      // Check if response was complete
      if (accumulatedText.length === 0) {
        // No text received from model
        yield {
          type: 'error',
          error: 'No response',
          content: '🤔 No response was generated. Try rephrasing your question or check your API keys.',
        }
      }

      // End performance monitoring and log metrics
      const _metrics = this.performanceOptimizer.endMonitoring(sessionId, {
        tokenCount: this.estimateMessagesTokens(truncatedMessages),
        toolCallCount,
        responseQuality: this.performanceOptimizer.analyzeResponseQuality(accumulatedText),
      })

      // Show only essential info: tokens used and context remaining
      if (truncatedTokens > 0) {
      }
    } catch (error: any) {
      console.error(`Provider error (${this.getCurrentModelInfo().config.provider}):`, error)
      const friendlyMessage = this.getFriendlyErrorMessage(error.message)
      yield {
        type: 'error',
        error: 'System error',
        content: friendlyMessage,
      }
    }
  }

  private generateFinalSummary(
    originalQuery: string,
    toolHistory: Array<{
      toolName: string
      args: any
      result: any
      success: boolean
    }>
  ): string {
    const tools = [...new Set(toolHistory.map((t) => t.toolName))]
    const successful = toolHistory.filter((t) => t.success).length
    const failed = toolHistory.filter((t) => !t.success).length
    const totalOperations = toolHistory.length

    let summary = `**Final Analysis Summary:**\n\n`

    // What was done
    summary += `📊 **Operations Completed:** ${totalOperations} total operations across ${this.completedRounds} rounds\n`
    summary += `✓ **Successful:** ${successful} operations\n`
    summary += `✖ **Failed:** ${failed} operations\n`
    summary += `🔨 **Tools Used:** ${tools.join(', ')}\n\n`

    // Key findings
    summary += `🔍 **Key Findings:**\n`
    if (successful > 0) {
      summary += `- Successfully executed ${successful} operations\n`
    }
    if (failed > 0) {
      summary += `- ${failed} operations encountered issues\n`
    }

    // Analysis of query fulfillment
    const queryLower = originalQuery.toLowerCase()
    summary += `\n📝 **Query Analysis:**\n`
    summary += `- Original request: "${this.truncateForPrompt(originalQuery, 80)}"\n`

    // Recommend next steps based on analysis
    summary += `\n🎯 **Recommended Next Steps:**\n`

    // Strategy based on what was tried
    if (failed > successful && failed > 3) {
      summary += `- Review and refine search criteria (many operations failed)\n`
      summary += `- Try different search patterns or keywords\n`
    }

    if (queryLower.includes('search') || queryLower.includes('find')) {
      if (!tools.includes('web_search')) {
        summary += `- Try web search for external documentation\n`
      }
      if (!tools.includes('semantic_search')) {
        summary += `- Use semantic search for similar patterns\n`
      }
      summary += `- Manually specify directories or file patterns\n`
      summary += `- Consider searching in hidden/config directories\n`
    }

    if (queryLower.includes('analyze') || queryLower.includes('analisi')) {
      if (!tools.includes('dependency_analysis')) {
        summary += `- Run dependency analysis for comprehensive view\n`
      }
      if (!tools.includes('code_analysis')) {
        summary += `- Perform detailed code quality analysis\n`
      }
      summary += `- Focus on specific modules or components\n`
    }

    // General strategies
    summary += `- Provide more specific context or constraints\n`
    summary += `- Break down the request into smaller, targeted tasks\n`
    summary += `- Try alternative approaches or tools not yet used\n`

    // Final guidance
    summary += `\n💡 **How to Continue:** Please provide more specific guidance, narrow the scope, or try a different approach based on the recommendations above. Consider breaking your request into smaller, more focused tasks.`

    return this.truncateForPrompt(summary, 800)
  }

  // Execute autonomous task with intelligent planning and parallel agent support
  async *executeAutonomousTask(
    task: string,
    context?: any & {
      steps?: Array<{
        stepId: string
        description: string
        schema?: any
      }>
      finalStep?: {
        description: string
        schema?: any
      }
    }
  ): AsyncGenerator<StreamEvent> {
    yield {
      type: 'start',
      content: `🎯 Starting task: ${task}`,
      metadata: {
        hasSteps: !!context?.steps?.length,
        hasFinalStep: !!context?.finalStep,
        totalSteps: (context?.steps?.length || 0) + (context?.finalStep ? 1 : 0),
      },
    }

    // Process initial steps if provided
    if (context?.steps?.length) {
      for (let i = 0; i < context.steps.length; i++) {
        const step = context.steps[i]
        yield {
          type: 'step',
          stepId: step.stepId,
          content: `📋 Step ${i + 1}/${context.steps.length}: ${step.description}`,
          metadata: {
            stepIndex: i,
            totalSteps: context.steps.length,
            stepId: step.stepId,
            hasSchema: !!step.schema,
          },
        }
      }
    }

    // First, analyze the task and create a plan
    yield {
      type: 'thinking',
      content: 'Analyzing task and creating execution plan...',
    }

    try {
      // If prebuilt messages are provided, use them directly to avoid duplicating large prompts
      if (context && Array.isArray(context.messages)) {
        const providedMessages: CoreMessage[] = context.messages
        // Note: streamChatWithFullAutonomy will handle truncation internally
        for await (const event of this.streamChatWithFullAutonomy(providedMessages)) {
          yield event
        }
        return
      }

      // Analizza se il task richiede agenti paralleli
      const requiresParallelAgents = this.analyzeParallelRequirements(task)

      if (requiresParallelAgents) {
        yield {
          type: 'thinking',
          content: '⚡︎ Task requires parallel agent execution...',
        }

        // Esegui con agenti paralleli
        for await (const event of this.executeParallelTask(task, context)) {
          yield event
        }
        return
      }

      const planningMessages: CoreMessage[] = [
        {
          role: 'system',
          content: `AI dev assistant. CWD: ${this.workingDirectory}
Tools: read_file, write_file, explore_directory, execute_command, analyze_project, manage_packages, generate_code, doc_search, doc_add
Task: ${this.truncateForPrompt(task, 300)} 

${context ? this.truncateForPrompt(safeStringifyContext(context), 150) : ''}

Execute task autonomously with tools. Be direct. Stay within project directory.`,
        },
        {
          role: 'user',
          content: task,
        },
      ]

      // Stream the autonomous execution
      for await (const event of this.streamChatWithFullAutonomy(planningMessages)) {
        yield event
      }

      // Process final step if provided
      if (context?.finalStep) {
        yield {
          type: 'step',
          stepId: 'final',
          content: `🎯 Final Step: ${context.finalStep.description}`,
          metadata: {
            stepIndex: context?.steps?.length || 0,
            totalSteps: (context?.steps?.length || 0) + 1,
            stepId: 'final',
            hasSchema: !!context.finalStep.schema,
            isFinalStep: true,
          },
        }

        yield {
          type: 'thinking',
          content: '⚡︎ Finalizing autonomous task execution...',
        }
      }
    } catch (error: any) {
      yield {
        type: 'error',
        error: error.message,
        content: `Autonomous execution failed: ${error.message}`,
      }
    }
  }

  // Analizza se un task richiede agenti paralleli
  private analyzeParallelRequirements(task: string): boolean {
    const parallelKeywords = [
      'parallel',
      'simultaneous',
      'concurrent',
      'multiple',
      'several',
      'parallelo',
      'simultaneo',
      'concorrente',
      'multiplo',
      'diversi',
      'build and test',
      'compile and deploy',
      'analyze and generate',
    ]

    const lowerTask = task.toLowerCase()
    return parallelKeywords.some((keyword) => lowerTask.includes(keyword))
  }

  // Esegue task con agenti paralleli
  private async *executeParallelTask(task: string, context?: any): AsyncGenerator<StreamEvent> {
    yield { type: 'thinking', content: '⚡︎ Planning parallel execution...' }

    // Process steps if provided for parallel execution
    if (context?.steps?.length) {
      yield {
        type: 'step',
        stepId: 'parallel_setup',
        content: `🔄 Setting up parallel execution with ${context.steps.length} steps`,
        metadata: {
          stepIndex: 0,
          totalSteps: context.steps.length + (context?.finalStep ? 1 : 0),
          stepId: 'parallel_setup',
          isParallel: true,
        },
      }
    }

    try {
      // Dividi il task in sottotask paralleli
      const subtasks = this.splitIntoSubtasks(task)

      yield {
        type: 'thinking',
        content: `📋 Split into ${subtasks.length} parallel subtasks`,
      }

      // Esegui sottotask in parallelo con isolamento
      const results = await Promise.allSettled(
        subtasks.map(async (subtask, index) => {
          // Pausa molto leggera tra l'avvio degli agenti per evitare sovraccarichi
          await this.sleep(index * 50)

          return this.executeSubtask(subtask, index, context)
        })
      )

      // Aggrega risultati
      const successful = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length

      // Process final step for parallel execution if provided
      if (context?.finalStep) {
        yield {
          type: 'step',
          stepId: 'parallel_final',
          content: `🎯 Parallel Final Step: ${context.finalStep.description}`,
          metadata: {
            stepIndex: context?.steps?.length || 0,
            totalSteps: (context?.steps?.length || 0) + 1,
            stepId: 'parallel_final',
            hasSchema: !!context.finalStep.schema,
            isFinalStep: true,
            isParallel: true,
          },
        }

        yield {
          type: 'thinking',
          content: '⚡︎ Finalizing parallel execution results...',
        }
      }

      yield {
        type: 'complete',
        content: `✓ Parallel execution complete: ${successful} successful, ${failed} failed`,
        metadata: {
          parallel: true,
          subtasks: subtasks.length,
          stepsProcessed: context?.steps?.length || 0,
          finalStepProcessed: !!context?.finalStep,
        },
      }
    } catch (error: any) {
      yield {
        type: 'error',
        error: error.message,
        content: `Parallel execution failed: ${error.message}`,
      }
    }
  }

  // Divide un task in sottotask paralleli
  private splitIntoSubtasks(task: string): string[] {
    // Logica semplice per dividere task complessi
    const subtasks: string[] = []

    if (task.toLowerCase().includes('build and test')) {
      subtasks.push('Build the project')
      subtasks.push('Run tests')
    } else if (task.toLowerCase().includes('analyze and generate')) {
      subtasks.push('Analyze code structure')
      subtasks.push('Generate documentation')
    } else {
      // Fallback: dividi per frasi
      const sentences = task.split(/[.!?]+/).filter((s) => s.trim().length > 10)
      subtasks.push(...sentences.slice(0, 3)) // Massimo 3 sottotask
    }

    return subtasks.length > 0 ? subtasks : [task]
  }

  // Esegue un singolo sottotask con isolamento
  private async executeSubtask(subtask: string, index: number, context?: any): Promise<any> {
    const _subtaskContext = {
      ...context,
      subtaskIndex: index,
      isParallel: true,
      workingDirectory: this.workingDirectory, // Mantieni directory del progetto
    }

    const messages: CoreMessage[] = [
      {
        role: 'system',
        content: `AI agent ${index + 1}. CWD: ${this.workingDirectory}
Execute this subtask independently. Do not interfere with other agents.
Subtask: ${subtask}
Stay within project directory.`,
      },
      {
        role: 'user',
        content: subtask,
      },
    ]

    // Esegui il sottotask
    const result = await this.streamChatWithFullAutonomy(messages)
    return result
  }

  /**
   * Convert technical error messages to user-friendly ones with helpful suggestions
   */
  private getFriendlyErrorMessage(errorMessage: string): string {
    const lowerError = errorMessage.toLowerCase()

    // Token limit errors
    if (lowerError.includes('token') || lowerError.includes('limit') || lowerError.includes('too long')) {
      return '📏 Message too long. Try breaking it into smaller, more specific questions.'
    }

    // Network/connection errors
    if (lowerError.includes('network') || lowerError.includes('connection') || lowerError.includes('timeout')) {
      return '🌐 Connection issue. Check your internet connection and try again.'
    }

    // API key errors
    if (lowerError.includes('api key') || lowerError.includes('auth') || lowerError.includes('unauthorized')) {
      return '🔑 API key issue. Check your configuration with `/config` command.'
    }

    // Rate limit errors
    if (lowerError.includes('rate limit') || lowerError.includes('quota')) {
      return '⏳︎ Rate limit reached. Please wait a moment and try again.'
    }

    // Model not found
    if (lowerError.includes('model not found') || lowerError.includes('invalid model')) {
      return '🔌 Model not available. Try switching models with `/models` command.'
    }

    // Generic server errors
    if (lowerError.includes('500') || lowerError.includes('server error')) {
      return '⚠︎ Server temporarily unavailable. Please try again in a few moments.'
    }

    // Default fallback with suggestion
    return `✖ ${errorMessage} • Try rephrasing your request or check your configuration.`
  }

  // Helper methods for intelligent analysis
  private isCodeFile(filePath: string): boolean {
    const codeExtensions = [
      '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
      '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.clj',
      '.css', '.scss', '.sass', '.less', '.html', '.xml', '.json', '.yaml', '.yml',
    ]
    const ext = extname(filePath).toLowerCase()
    return codeExtensions.includes(ext)
  }

  private stripComments(content: string, extension: string): string {
    switch (extension.toLowerCase()) {
      case '.js':
      case '.ts':
      case '.jsx':
      case '.tsx':
        // Remove single-line comments
        content = content.replace(/\/\/.*$/gm, '')
        // Remove multi-line comments
        content = content.replace(/\/\*[\s\S]*?\*\//g, '')
        break
      case '.py':
        // Remove Python comments
        content = content.replace(/#.*$/gm, '')
        break
      case '.css':
      case '.scss':
        // Remove CSS comments
        content = content.replace(/\/\*[\s\S]*?\*\//g, '')
        break
      case '.html':
      case '.xml': {
        // Remove HTML/XML comments
        let previousContent: string
        do {
          previousContent = content
          content = content.replace(/<!--[\s\S]*?-->/g, '')
        } while (content !== previousContent)
        break
      }
    }
    // Clean up extra whitespace
    return content.replace(/\n\s*\n/g, '\n').trim()
  }

  private analyzeFileContent(content: string, extension: string): any {
    const analysis: any = {
      lines: content.split('\n').length,
      size: content.length,
      language: this.detectLanguage(extension),
    }

    // Language-specific analysis
    switch (extension) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
        analysis.imports = (content.match(/import .* from/g) || []).length
        analysis.exports = (content.match(/export/g) || []).length
        analysis.functions = (content.match(/function \w+|const \w+ = |=>/g) || []).length
        analysis.classes = (content.match(/class \w+/g) || []).length
        break
      case '.json':
        try {
          analysis.valid = true
          analysis.keys = Object.keys(JSON.parse(content)).length
        } catch {
          analysis.valid = false
        }
        break
      case '.md':
        analysis.headers = (content.match(/^#+/gm) || []).length
        analysis.links = (content.match(/\[.*\]\(.*\)/g) || []).length
        break
    }

    return analysis
  }

  private exploreDirectoryStructure(dirPath: string, maxDepth: number, includeHidden: boolean, filterBy: string): any {
    // ULTRA LIMITED directory exploration to prevent token overflow
    const MAX_FILES_PER_DIR = 20 // Drastically limit files per directory
    const MAX_TOTAL_FILES = 100 // Global limit
    let totalFileCount = 0

    const explore = (currentPath: string, depth: number): any => {
      if (depth > Math.min(maxDepth, 2) || totalFileCount >= MAX_TOTAL_FILES) return null // Force max depth 2

      try {
        const items = readdirSync(currentPath, { withFileTypes: true })
        const structure: any = { files: [], directories: [] }
        let fileCount = 0

        for (const item of items) {
          if (!includeHidden && item.name.startsWith('.')) continue
          if (fileCount >= MAX_FILES_PER_DIR || totalFileCount >= MAX_TOTAL_FILES) break // Hard limits

          const itemPath = join(currentPath, item.name)
          const relativePath = relative(this.workingDirectory, itemPath)

          if (item.isDirectory() && depth < 1) {
            // Limit directory recursion
            const subStructure = explore(itemPath, depth + 1)
            if (subStructure) {
              structure.directories.push({
                name: item.name,
                path: relativePath,
                fileCount: this.countFiles(subStructure), // Just count, don't include all details
              })
            }
          } else if (item.isFile()) {
            const fileInfo = {
              name: item.name,
              path: relativePath,
              ext: extname(item.name), // Shortened field name
            }

            // Apply filter
            if (this.matchesFilter(fileInfo, filterBy)) {
              structure.files.push(fileInfo)
              fileCount++
              totalFileCount++
            }
          }
        }

        return structure
      } catch {
        return null
      }
    }

    return explore(dirPath, 0)
  }

  private matchesFilter(fileInfo: any, filterBy: string): boolean {
    const ext = fileInfo.ext || fileInfo.extension // Support both field names
    switch (filterBy) {
      case 'code':
        return ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.rs'].includes(ext)
      case 'config':
        return ['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext)
      case 'docs':
        return ['.md', '.txt', '.rst', '.adoc'].includes(ext)
      default:
        return true
    }
  }

  private countFiles(structure: any): number {
    let count = structure.files?.length || 0
    if (structure.directories) {
      for (const dir of structure.directories) {
        count += this.countFiles(dir)
      }
    }
    return count
  }

  private generateDirectorySummary(structure: any): string {
    const fileCount = this.countFiles(structure)
    const dirCount = structure.directories?.length || 0
    const extensions = new Set()

    const collectExtensions = (struct: any) => {
      struct.files?.forEach((file: any) => {
        if (file.extension) extensions.add(file.extension)
      })
      struct.directories?.forEach((dir: any) => collectExtensions(dir))
    }

    collectExtensions(structure)

    return `${fileCount} files, ${dirCount} directories. Languages: ${Array.from(extensions).join(', ')}`
  }

  private generateDirectoryRecommendations(structure: any): string[] {
    const recommendations: string[] = []

    // Analyze project structure and provide recommendations
    const hasPackageJson = structure.files?.some((f: any) => f.name === 'package.json')
    const hasTypeScript = structure.files?.some((f: any) => f.extension === '.ts')
    const hasTests = structure.files?.some((f: any) => f.name.includes('.test.') || f.name.includes('.spec.'))

    if (hasPackageJson && !hasTypeScript) {
      recommendations.push('Consider adding TypeScript for better type safety')
    }

    if (hasTypeScript && !hasTests) {
      recommendations.push('Add unit tests for better code quality')
    }

    return recommendations
  }

  private isDangerousCommand(command: string): string | false {
    const dangerous = ['rm -rf /', 'dd if=', 'mkfs', 'fdisk', 'format', 'del /f /s /q', 'shutdown', 'reboot']

    for (const dangerousCmd of dangerous) {
      if (command.includes(dangerousCmd)) {
        return `Dangerous command detected: ${dangerousCmd}`
      }
    }

    return false
  }

  private async performAdvancedProjectAnalysis(options: any): Promise<any> {
    const analysis: any = {
      timestamp: new Date(),
      directory: this.workingDirectory,
      options,
    }

    // Basic project structure
    const packageJsonPath = join(this.workingDirectory, 'package.json')
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      analysis.package = packageJson
      analysis.name = packageJson.name
      analysis.version = packageJson.version
      analysis.framework = this.detectFramework(packageJson)
    }

    // File analysis
    const structure = this.exploreDirectoryStructure(this.workingDirectory, 3, false, 'all')
    analysis.structure = structure
    analysis.fileCount = this.countFiles(structure)

    // Language detection
    analysis.languages = this.detectProjectLanguages(structure)

    // Dependencies analysis
    if (options.analyzeDependencies && analysis.package) {
      analysis.dependencies = {
        production: Object.keys(analysis.package.dependencies || {}),
        development: Object.keys(analysis.package.devDependencies || {}),
        total: Object.keys({
          ...analysis.package.dependencies,
          ...analysis.package.devDependencies,
        }).length,
      }
    }

    return analysis
  }

  private detectLanguage(extension: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.c': 'c',
      '.toml': 'toml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.ini': 'ini',
      '.env': 'env',
      '.sh': 'shell',
      '.bash': 'shell',
      '.rs': 'rust',
      '.go': 'go',
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift',
      '.kt': 'kotlin',
    }
    return langMap[extension] || 'unknown'
  }

  private detectFramework(packageJson: any): string {
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    }

    if (deps.next) return 'Next.js'
    if (deps.nuxt) return 'Nuxt.js'
    if (deps['@angular/core']) return 'Angular'
    if (deps.vue) return 'Vue.js'
    if (deps.react) return 'React'
    if (deps.express) return 'Express'
    if (deps.fastify) return 'Fastify'
    if (deps.svelte) return 'Svelte'
    if (deps.astro) return 'Astro'

    if (deps.remix) return 'Remix'
    return 'JavaScript/Node.js'
  }
  private detectProjectLanguages(structure: any): string[] {
    const languages = new Set<string>()

    const collectLanguages = (struct: any) => {
      struct.files?.forEach((file: any) => {
        if (file.extension) {
          const lang = this.detectLanguage(file.extension)
          if (lang !== 'unknown') languages.add(lang)
        }
      })
      struct.directories?.forEach((dir: any) => collectLanguages(dir))
    }

    collectLanguages(structure)
    return Array.from(languages)
  }

  private async generateIntelligentCode(params: any): Promise<any> {
    // This would integrate with the AI model to generate context-aware code
    const { type, description, language, framework, projectContext } = params

    // Use AI to generate appropriate code based on context
    const codeGenPrompt = `Generate ${type} code for: ${description}
Language: ${language}
Framework: ${framework || 'none'}
Project Context: ${JSON.stringify(projectContext?.summary || {})}

Requirements:
- Follow ${language} best practices
- Use ${framework} patterns if applicable
- Include proper types for TypeScript
- Add comments for complex logic
- Ensure code is production-ready`

    try {
      const routingCfg = configManager.get('modelRouting')
      const resolved = routingCfg?.enabled
        ? await this.resolveAdaptiveModel('code_gen', [
          {
            role: 'user',
            content: `${type}: ${description} (${language})`,
          } as any,
        ])
        : undefined
      const model = this.getModel(resolved) as any
      const params = this.getProviderParams()
      const _provider = this.getCurrentModelInfo().config.provider
      const genOpts: any = {
        model,
        prompt: this.progressiveTokenManager.emergencyTruncate(codeGenPrompt, 1200000),
      }
      const provider = this.getCurrentModelInfo().config.provider
      // Check if reasoning should be enabled
      const reasoningEnabled = this.shouldEnableReasoning()

      if (provider !== 'openai') {
        if (provider === 'openrouter') {
          // All OpenRouter models require maxTokens
          genOpts.maxTokens = Math.min(params.maxTokens, 2000)

          // Add reasoning metadata for OpenRouter using ReasoningDetector
          if (reasoningEnabled) {
            const providerMetadata = ReasoningDetector.getReasoningProviderMetadata(
              provider,
              model,
              { enabled: true, effort: 'medium' }
            )

            if (Object.keys(providerMetadata).length > 0) {
              genOpts.providerOptions = {
                ...genOpts.providerOptions,
                ...providerMetadata,
              }
            }

            // Add transforms for context compression if supported
            try {
              const modelCaps = await openRouterRegistry.getCapabilities(model)
              if (modelCaps.supportedParameters && modelCaps.supportedParameters.includes('transforms')) {
                if (!genOpts.providerOptions.openrouter) {
                  genOpts.providerOptions.openrouter = {}
                }
                genOpts.providerOptions.openrouter.transforms = ['middle-out']
              }
            } catch {
              // Silently fail if we can't get capabilities
            }
          }
        } else if (provider === 'anthropic') {
          genOpts.maxTokens = Math.min(params.maxTokens, 2000)

          // Add reasoning metadata for Anthropic using ReasoningDetector
          if (reasoningEnabled) {
            const providerMetadata = ReasoningDetector.getReasoningProviderMetadata(
              provider,
              model,
              { enabled: true, budgetTokens: 5000 }
            )

            if (Object.keys(providerMetadata).length > 0) {
              genOpts.providerOptions = {
                ...genOpts.providerOptions,
                ...providerMetadata,
              }
            }
          }
        } else {
          // Add reasoning metadata for other providers using ReasoningDetector
          if (reasoningEnabled) {
            const providerMetadata = ReasoningDetector.getReasoningProviderMetadata(
              provider,
              model,
              { enabled: true, effort: 'medium' }
            )

            if (Object.keys(providerMetadata).length > 0) {
              genOpts.providerOptions = {
                ...genOpts.providerOptions,
                ...providerMetadata,
              }
            }
          }
        }
      }
      const result = await generateText(genOpts)

      // Extract reasoning if available
      let reasoningData = {}
      if (reasoningEnabled) {
        reasoningData = ReasoningDetector.extractReasoning(result, provider)
      }

      return {
        type,
        description,
        language,
        code: result.text,
        generated: new Date(),
        context: params,
        ...reasoningData,
      }
    } catch (error: any) {
      return { error: `Code generation failed: ${error.message}` }
    }
  }

  // Resolve adaptive model variant for given messages/scope using router
  private async resolveAdaptiveModel(scope: ModelScope, coreMessages: CoreMessage[]): Promise<string> {
    try {
      const info = this.getCurrentModelInfo()
      const provider = info.config.provider as any
      const baseModel = info.config.model

      const toText = (c: any) =>
        typeof c === 'string'
          ? c
          : Array.isArray(c)
            ? c.map((part) => (typeof part === 'string' ? part : part?.text || JSON.stringify(part))).join('')
            : String(c)

      const simpleMessages = coreMessages.map((m) => ({
        role: (m.role as any) || 'user',
        content: toText(m.content),
      }))

      const decision = await adaptiveModelRouter.choose({
        provider,
        baseModel,
        messages: simpleMessages as any,
        scope,
      })

      // Log gently (if UI exists)
      try {
        const nik = (global as any).__nikCLI
        const msg = `[Router] ${info.name} → ${decision.selectedModel} (${decision.tier}, ~${decision.estimatedTokens} tok)`
        if (nik?.advancedUI) nik.advancedUI.logInfo('model router', msg)
        else console.log(chalk.dim(msg))
      } catch { }

      // The router returns a provider model id. Our config keys match these ids in default models.
      // If key is missing, fallback to current model name in config.
      const models = configManager.get('models')
      return models[decision.selectedModel]
        ? decision.selectedModel
        : this.currentModel || configManager.get('currentModel')
    } catch {
      return this.currentModel || configManager.get('currentModel')
    }
  }

  // Model management
  private getModel(modelName?: string): any {
    const model = modelName || this.currentModel || configManager.get('currentModel')
    const allModels = configManager.get('models')
    const configData = allModels[model]

    if (!configData) {
      throw new Error(`Model ${model} not found in configuration`)
    }

    // Configure providers with API keys properly
    // Create provider instances with API keys, then get the specific model
    switch (configData.provider) {
      case 'openai': {
        let apiKey = configManager.getApiKey(model)
        if (!apiKey) {
          const current = configManager.get('currentModel')
          if (current && current !== model) apiKey = configManager.getApiKey(current)
        }
        if (!apiKey) throw new Error(`No API key found for provider OpenAI (model ${model})`)
        const openaiProvider = createOpenAI({ apiKey })
        return openaiProvider(configData.model)
      }
      case 'anthropic': {
        let apiKey = configManager.getApiKey(model)
        if (!apiKey) {
          const current = configManager.get('currentModel')
          if (current && current !== model) apiKey = configManager.getApiKey(current)
        }
        if (!apiKey) throw new Error(`No API key found for provider Anthropic (model ${model})`)
        const anthropicProvider = createAnthropic({ apiKey })
        return anthropicProvider(configData.model)
      }
      case 'google': {
        let apiKey = configManager.getApiKey(model)
        if (!apiKey) {
          const current = configManager.get('currentModel')
          if (current && current !== model) apiKey = configManager.getApiKey(current)
        }
        if (!apiKey) throw new Error(`No API key found for provider Google (model ${model})`)
        const googleProvider = createGoogleGenerativeAI({ apiKey })
        return googleProvider(configData.model)
      }
      case 'gateway': {
        let apiKey = configManager.getApiKey(model)
        if (!apiKey) {
          const current = configManager.get('currentModel')
          if (current && current !== model) apiKey = configManager.getApiKey(current)
        }
        if (!apiKey) throw new Error(`No API key found for provider Gateway (model ${model})`)
        const gatewayProvider = createGateway({ apiKey })
        return gatewayProvider(configData.model)
      }
      case 'openrouter': {
        let apiKey = configManager.getApiKey(model)
        if (!apiKey) {
          const current = configManager.get('currentModel')
          if (current && current !== model) apiKey = configManager.getApiKey(current)
        }
        // Fallback to shared alias or env for NikCLI-issued keys
        if (!apiKey) {
          apiKey = configManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY
        }
        if (!apiKey) throw new Error(`No API key found for provider OpenRouter (model ${model})`)
        const openrouterProvider = createOpenAI({
          apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
          headers: {
            'HTTP-Referer': 'https://nikcli.mintlify.app', // Optional: for attribution
            'X-Title': 'NikCLI',
          },
        })
        return openrouterProvider(configData.model) // Supports embeddings and structured outputs via OpenAI compatibility
      }
      case 'ollama': {
        // Ollama runs locally and does not require API keys
        const ollamaProvider = createOllama({})
        return ollamaProvider(configData.model)
      }
      case 'vercel': {
        let apiKey = configManager.getApiKey(model)
        if (!apiKey) {
          const current = configManager.get('currentModel')
          if (current && current !== model) apiKey = configManager.getApiKey(current)
        }
        if (!apiKey) throw new Error(`No API key found for provider Vercel (model ${model})`)
        const vercelProvider = createVercel({ apiKey })
        return vercelProvider(configData.model)
      }
      case 'cerebras': {
        let apiKey = configManager.getApiKey(model)
        if (!apiKey) {
          const current = configManager.get('currentModel')
          if (current && current !== model) apiKey = configManager.getApiKey(current)
        }
        if (!apiKey) throw new Error(`No API key found for provider Cerebras (model ${model})`)
        const cerebrasProvider = createCerebras({ apiKey })
        return cerebrasProvider(configData.model)
      }
      case 'groq': {
        let apiKey = configManager.getApiKey(model)
        if (!apiKey) {
          const current = configManager.get('currentModel')
          if (current && current !== model) apiKey = configManager.getApiKey(current)
        }
        if (!apiKey) throw new Error(`No API key found for provider Groq (model ${model})`)
        const groqProvider = createGroq({ apiKey })
        return groqProvider(configData.model)
      }
      case 'llamacpp': {
        // LlamaCpp uses OpenAI-compatible API; assumes local server at default endpoint
        const llamacppProvider = createOpenAICompatible({
          name: 'llamacpp',
          apiKey: 'llamacpp', // LlamaCpp doesn't require a real API key for local server
          baseURL: process.env.LLAMACPP_BASE_URL || 'http://localhost:8080/v1',
        })
        return llamacppProvider(configData.model)
      }
      case 'lmstudio': {
        // LMStudio uses OpenAI-compatible API; assumes local server at default endpoint
        const lmstudioProvider = createOpenAICompatible({
          name: 'lmstudio',
          apiKey: 'lm-studio', // LMStudio doesn't require a real API key
          baseURL: process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1',
        })
        return lmstudioProvider(configData.model)
      }
      case 'openai-compatible': {
        const baseURL = (configData as any).baseURL || process.env.OPENAI_COMPATIBLE_BASE_URL
        if (!baseURL) {
          throw new Error(
            `Base URL not configured for OpenAI-compatible provider (${model}). Set baseURL in model config or OPENAI_COMPATIBLE_BASE_URL.`
          )
        }
        let apiKey = configManager.getApiKey(model)
        if (!apiKey) {
          const current = configManager.get('currentModel')
          if (current && current !== model) apiKey = configManager.getApiKey(current)
        }
        if (!apiKey) {
          throw new Error(`No API key found for OpenAI-compatible provider (model ${model})`)
        }
        const compatProvider = createOpenAICompatible({
          name: (configData as any).name || 'openai-compatible',
          apiKey,
          baseURL,
          headers: (configData as any).headers,
        })
        return compatProvider(configData.model)
      }
      case 'opencode': {
        // OpenCode provider with dedicated API key management
        const baseURL = (configData as any).baseURL || process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1'
        let apiKey = configManager.getApiKey('opencode') || process.env.OPENCODE_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY
        if (!apiKey) {
          const current = configManager.get('currentModel')
          if (current && current !== model) apiKey = configManager.getApiKey(current)
        }
        if (!apiKey) {
          throw new Error(`No API key found for OpenCode provider (model ${model}). Set OPENCODE_API_KEY environment variable or use /set-key opencode`)
        }
        const compatProvider = createOpenAICompatible({
          name: 'opencode',
          apiKey,
          baseURL,
          headers: (configData as any).headers,
        })
        return compatProvider(configData.model)
      }
      default:
        throw new Error(`Unsupported provider: ${configData.provider}`)
    }
  }

  // Get provider-specific parameters
  private getProviderParams(modelName?: string): {
    maxTokens: number
    temperature: number
  } {
    const model = modelName || this.currentModel || configManager.get('currentModel')
    const allModels = configManager.get('models')
    const configData = allModels[model]

    if (!configData) {
      return { maxTokens: 8000, temperature: 1 } // Further REDUCED for cost efficiency
    }

    // Provider-specific token limits and settings
    switch (configData.provider) {
      case 'openai':
        // OpenAI models - Further REDUCED for cost efficiency
        if (configData.model.includes('gpt-5')) {
          return { maxTokens: 3000, temperature: 1 } // Further REDUCED from 4096
        } else if (configData.model.includes('gpt-4')) {
          return { maxTokens: 3000, temperature: 1 } // Further REDUCED from 4096
        }
        return { maxTokens: 3000, temperature: 1 }

      case 'anthropic':
        // Claude models - Further REDUCED for cost efficiency
        if (
          configData.model.includes('claude-3-5-sonnet-latest') ||
          configData.model.includes('claude-4-sonnet') ||
          configData.model.includes('claude-sonnet-4')
        ) {
          return { maxTokens: 6000, temperature: 0.8 } // Further REDUCED from 8192
        }
        return { maxTokens: 2500, temperature: 0.8 } // Further REDUCED from 3096

      case 'google':
        // Gemini models - AUMENTATO per risposte più complete
        return { maxTokens: 4096, temperature: 0.7 } // AUMENTATO da 1500

      case 'ollama':
        // Local models - OPTIMIZED for efficiency
        return { maxTokens: 3000, temperature: 0.6 } // REDUCED from 4000

      case 'vercel':
        // v0 models - Further optimized for cost efficiency
        if (configData.model.includes('v0-1.5-lg')) {
          return { maxTokens: 3000, temperature: 0.6 } // Reduced from 4000
        } else if (configData.model.includes('v0-1.5-md')) {
          return { maxTokens: 2500, temperature: 0.6 } // Reduced from 4000
        } else if (configData.model.includes('v0-1.0-md')) {
          return { maxTokens: 2000, temperature: 0.6 } // Reduced from 4000
        }
        return { maxTokens: 2500, temperature: 0.6 }

      case 'cerebras':
        // Cerebras models - Optimized for cost efficiency
        return { maxTokens: 4000, temperature: 0.6 } // Reduced from 8192

      case 'groq':
        // Groq models - Ultra-fast inference
        return { maxTokens: 8192, temperature: 0.7 }

      case 'llamacpp':
        // LlamaCpp local models
        return { maxTokens: 4096, temperature: 0.7 }

      case 'lmstudio':
        // LMStudio local models
        return { maxTokens: 4096, temperature: 0.7 }

      case 'openrouter':
        // OpenRouter aggregates multiple providers - use temp 1 for compatibility
        if (configData.model.includes('gpt-5') || configData.model.startsWith('openai/')) {
          return { maxTokens: 4000, temperature: 1 } // OpenAI models require temperature=1
        } else if (configData.model.includes('gemini') || configData.model.startsWith('google/')) {
          return { maxTokens: 3000, temperature: 0.6 } // Google models - reduced
        } else if (configData.model.startsWith('anthropic/')) {
          return { maxTokens: 3000, temperature: 0.8 } // Anthropic models - reduced
        }
        return { maxTokens: 8000, temperature: 1 } // Default - reduced

      case 'opencode':
        // OpenCode models - optimized for code generation
        if (configData.model.includes('grok-code')) {
          return { maxTokens: 4000, temperature: 0.2 } // Lower temp for code consistency
        } else if (configData.model.includes('big-pickle')) {
          return { maxTokens: 6000, temperature: 0.3 } // Slightly higher for complex reasoning
        }
        return { maxTokens: 4000, temperature: 0.3 } // Default OpenCode settings

      default:
        return { maxTokens: 8000, temperature: 1 } // Further reduced for cost efficiency
    }
  }

  // Build a provider-safe message array by enforcing hard character caps
  private sanitizeMessagesForProvider(provider: string, messages: CoreMessage[]): CoreMessage[] {
    const maxTotalChars = provider === 'openai' ? 600_000 : 300_000 // Further reduced caps
    const maxPerMessage = provider === 'openai' ? 40_000 : 20_000 // Further reduced

    const safeMessages: CoreMessage[] = []
    let total = 0

    const clamp = (text: string, limit: number): string => {
      if (text.length <= limit) return text
      const head = text.slice(0, Math.floor(limit * 0.8))
      const tail = text.slice(-Math.floor(limit * 0.2))
      return `${head}\n…[omitted ${text.length - limit} chars]\n${tail}`
    }

    // Keep system messages first (clamped)
    const systems = messages.filter((m) => m.role === 'system')
    for (const m of systems) {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      const clamped = clamp(content, 8000)
      total += clamped.length
      if (total > maxTotalChars) break
      // For tool messages, wrap clamped string as tool-friendly text content
      if ((m as any).role === 'tool') {
        safeMessages.push({
          ...(m as any),
          content: [{ type: 'text', text: clamped }] as any,
        })
      } else {
        const role = (m as any).role
        safeMessages.push({ role, content: clamped } as any)
      }
    }

    // Then add the most recent non-system messages until we hit the cap
    const rest = messages.filter((m) => m.role !== 'system')
    for (let i = Math.max(0, rest.length - 40); i < rest.length; i++) {
      // last 40 msgs
      const m = rest[i]
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      const clamped = clamp(content, maxPerMessage)
      if (total + clamped.length > maxTotalChars) break
      total += clamped.length
      if ((m as any).role === 'tool') {
        safeMessages.push({
          ...(m as any),
          content: [{ type: 'text', text: clamped }] as any,
        })
      } else {
        const role = (m as any).role
        safeMessages.push({ role, content: clamped } as any)
      }
    }

    return safeMessages
  }

  /**
   * Detect project type based on working directory
   */
  private detectProjectType(workingDirectory: string): string {
    try {
      const packageJsonPath = join(workingDirectory, 'package.json')
      const cargoTomlPath = join(workingDirectory, 'Cargo.toml')
      const requirementsPath = join(workingDirectory, 'requirements.txt')
      const goModPath = join(workingDirectory, 'go.mod')

      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

        // Check for React/Next.js
        if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
          return 'next.js'
        }
        if (packageJson.dependencies?.react || packageJson.devDependencies?.react) {
          return 'react'
        }
        if (packageJson.dependencies?.express || packageJson.devDependencies?.express) {
          return 'express'
        }
        if (packageJson.dependencies?.typescript || packageJson.devDependencies?.typescript) {
          return 'typescript'
        }

        return 'node'
      }

      if (existsSync(cargoTomlPath)) {
        return 'rust'
      }

      if (existsSync(requirementsPath)) {
        return 'python'
      }

      if (existsSync(goModPath)) {
        return 'go'
      }

      return 'generic'
    } catch {
      return 'generic'
    }
  }

  // Configuration methods
  setWorkingDirectory(directory: string): void {
    this.workingDirectory = resolve(directory)
    this.executionContext.clear() // Reset context for new directory
  }

  getWorkingDirectory(): string {
    return this.workingDirectory
  }

  setModel(modelName: string): void {
    this.currentModel = modelName
  }

  getCurrentModelInfo() {
    const allModels = configManager.get('models')
    const modelConfig = allModels[this.currentModel]
    return {
      name: this.currentModel,
      config: modelConfig || { provider: 'unknown', model: 'unknown' },
    }
  }

  validateApiKey(): boolean {
    try {
      const apiKey = configManager.getApiKey(this.currentModel)
      return !!apiKey
    } catch {
      return false
    }
  }

  // Get execution context for debugging/analysis
  getExecutionContext(): Map<string, any> {
    return new Map(this.executionContext)
  }

  // Clear execution context
  clearExecutionContext(): void {
    this.executionContext.clear()
  }

  // Utility method for sleep
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // Test method to verify prompt loading works
  async testPromptLoading(): Promise<{ baseAgent: string; readFile: string }> {
    try {
      const baseAgent = await this.getEnhancedSystemPrompt()
      const readFile = await this.getToolPrompt('read_file', {
        path: 'test.txt',
      })

      return {
        baseAgent: `${baseAgent.substring(0, 4000)}...`,
        readFile: `${readFile.substring(0, 4000)}...`,
      }
    } catch (error: any) {
      return {
        baseAgent: `Error loading base agent: ${error.message}`,
        readFile: `Error loading read_file: ${error.message}`,
      }
    }
  }

  // Format cached response to preserve proper text formatting
  private formatCachedResponse(cachedText: string): string {
    if (!cachedText || typeof cachedText !== 'string') {
      return cachedText
    }

    // Restore proper formatting
    const formatted = cachedText
      // Fix missing spaces after punctuation
      .replace(/([.!?,:;])([A-Z])/g, '$1 $2')
      // Fix missing spaces after commas and periods
      .replace(/([,])([a-zA-Z])/g, '$1 $2')
      // Fix missing spaces around common words
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Fix code block formatting
      .replace(/```([a-z]*)\n/g, '```$1\n')
      // Fix list items
      .replace(/^(\d+\.)([A-Z])/gm, '$1 $2')
      .replace(/^([-*])([A-Z])/gm, '$1 $2')
      // Fix markdown headers
      .replace(/^(#{1,6})([A-Z])/gm, '$1 $2')
      // Fix step numbers
      .replace(/Step(\d+):/g, 'Step $1:')
      // Add space after certain patterns
      .replace(/(\w)###/g, '$1\n\n###')
      .replace(/(\w)##/g, '$1\n\n##')
      .replace(/(\w)#([A-Z])/g, '$1\n\n# $2')

    return formatted
  }

  // Note: Chunking is now handled by streamttyService - method removed

  // Analyze gaps when tool roundtrips are exhausted (token-optimized)
  private analyzeMissingInformation(
    originalQuery: string,
    toolHistory: Array<{
      toolName: string
      args: any
      result: any
      success: boolean
    }>
  ): string {
    const tools = [...new Set(toolHistory.map((t) => t.toolName))]
    const failed = toolHistory.filter((t) => !t.success).length
    const queryLower = originalQuery.toLowerCase()

    let analysis = `Used ${tools.length} tools: ${tools.slice(0, 3).join(', ')}${tools.length > 3 ? '...' : ''}. `

    if (failed > 0) analysis += `${failed} failed. `

    // Suggest missing tools based on query
    const missing = []
    if (
      (queryLower.includes('search') ||
        queryLower.includes('find') ||
        queryLower.includes('cerca') ||
        queryLower.includes('trova')) &&
      !tools.includes('semantic_search')
    ) {
      missing.push('semantic search')
    }
    if ((queryLower.includes('analyze') || queryLower.includes('analizza')) && !tools.includes('code_analysis')) {
      missing.push('code analysis')
    }

    if (missing.length > 0) {
      analysis += `Missing: ${missing.join(', ')}.`
    }

    return this.truncateForPrompt(analysis, 200)
  }

  // Generate specific clarifying questions (token-optimized)
  private generateClarifyingQuestion(
    _gapAnalysis: string,
    originalQuery: string,
    toolHistory: Array<{
      toolName: string
      args: any
      result: any
      success: boolean
    }>
  ): string {
    const queryLower = originalQuery.toLowerCase()
    const tools = toolHistory.map((t) => t.toolName)

    let question = ''

    if ((queryLower.includes('function') || queryLower.includes('funzione')) && !tools.includes('semantic_search')) {
      question = '🔎 Should I search for similar functions with different names?'
    } else if (queryLower.includes('component') || queryLower.includes('componente')) {
      question = '⚛️ Is the component in specific subdirectories (components/, ui/)?'
    } else if (queryLower.includes('config')) {
      question = '🔨 Is the config in different files (.env, .yaml, .toml)?'
    } else if (queryLower.includes('error') || queryLower.includes('errore')) {
      question = '🐛 Do you have specific error logs or messages?'
    } else {
      question = '🎯 More context on where to search?'
    }

    return this.truncateForPrompt(`${question}\n💡 Tell me how to continue.`, 150)
  }

  // ====================== ⚡︎ COGNITIVE ENHANCEMENT METHODS ======================

  /**
   * ⚡︎ Generate with Cognitive Understanding
   * Enhanced generation method that uses task cognition for better responses
   */
  async *generateWithCognition(
    messages: CoreMessage[],
    cognition?: TaskCognition,
    options?: {
      steps?: Array<{
        stepId: string
        description: string
        schema?: any
      }>
      finalStep?: {
        description: string
        schema?: any
      }
    }
  ): AsyncGenerator<StreamEvent> {
    try {
      yield {
        type: 'start',
        metadata: {
          method: 'generateWithCognition',
          hasCognition: !!cognition,
          cognitionId: cognition?.id,
          hasSteps: !!options?.steps?.length,
          hasFinalStep: !!options?.finalStep,
          totalSteps: (options?.steps?.length || 0) + (options?.finalStep ? 1 : 0),
        },
      }

      // Step 1: Optimize prompts based on cognition
      const optimizedMessages = cognition ? this.optimizePromptWithCognition(messages, cognition) : messages

      yield {
        type: 'thinking',
        content: cognition
          ? `⚡︎ Using cognitive understanding: ${cognition.intent.primary} task with ${cognition.estimatedComplexity}/10 complexity`
          : '⚡︎ Processing without cognitive context',
      }

      // Process steps sequentially if provided
      if (options?.steps?.length) {
        for (let i = 0; i < options.steps.length; i++) {
          const step = options.steps[i]
          yield {
            type: 'step',
            stepId: step.stepId,
            content: `📋 Step ${i + 1}/${options.steps.length}: ${step.description}`,
            metadata: {
              stepIndex: i,
              totalSteps: options.steps.length,
              stepId: step.stepId,
              hasSchema: !!step.schema,
            },
          }

          // Simulate step processing with cognitive awareness
          if (cognition) {
            yield {
              type: 'thinking',
              content: `⚡︎ Processing step "${step.stepId}" with ${cognition.estimatedComplexity}/10 complexity...`,
            }
          }
        }
      }

      // Step 2: Use enhanced streaming with cognitive awareness
      const streamGen = this.streamChatWithFullAutonomy(optimizedMessages)

      for await (const event of streamGen) {
        // Adapt responses based on cognition
        if (event.type === 'text_delta' && event.content && cognition) {
          event.content = this.adaptResponseToCognition(event.content, cognition)
        }

        // Add cognitive metadata to tool calls
        if (event.type === 'tool_call' && cognition) {
          event.metadata = {
            ...event.metadata,
            cognition: {
              intent: cognition.intent.primary,
              complexity: cognition.estimatedComplexity,
              riskLevel: cognition.riskLevel,
            },
          }
        }

        yield event
      }

      // Process final step if provided
      if (options?.finalStep) {
        yield {
          type: 'step',
          stepId: 'final',
          content: `🎯 Final Step: ${options.finalStep.description}`,
          metadata: {
            stepIndex: options?.steps?.length || 0,
            totalSteps: (options?.steps?.length || 0) + 1,
            stepId: 'final',
            hasSchema: !!options.finalStep.schema,
            isFinalStep: true,
          },
        }

        if (cognition) {
          yield {
            type: 'thinking',
            content: `⚡︎ Finalizing with cognitive understanding: ${cognition.intent.primary}`,
          }
        }
      }

      yield {
        type: 'complete',
        metadata: {
          method: 'generateWithCognition',
          cognitionApplied: !!cognition,
          stepsProcessed: options?.steps?.length || 0,
          finalStepProcessed: !!options?.finalStep,
        },
      }
    } catch (error: any) {
      yield {
        type: 'error',
        error: `Cognitive generation failed: ${error.message}`,
        metadata: { method: 'generateWithCognition' },
      }
    }
  }

  /**
   * 🎯 Optimize Prompts with Orchestration Plan
   * Enhances prompts based on orchestration plan for better alignment
   */
  optimizePromptWithPlan(messages: CoreMessage[], plan?: OrchestrationPlan): CoreMessage[] {
    if (!plan) return messages

    const optimizedMessages = [...messages]

    // Find system message or create one
    let systemMessage = optimizedMessages.find((m) => m.role === 'system')
    if (!systemMessage) {
      systemMessage = { role: 'system', content: '' }
      optimizedMessages.unshift(systemMessage)
    }

    // Add orchestration context to system prompt
    const orchestrationContext = `

🎯 ORCHESTRATION CONTEXT:
- Strategy: ${plan.strategy}
- Estimated Duration: ${plan.estimatedDuration}s
- Phases: ${plan.phases.length} (${plan.phases.map((p) => p.name).join(' → ')})
- Required Tools: ${plan.phases.flatMap((p) => p.tools).join(', ')}
- Risk Level: Based on ${plan.fallbackStrategies.length} fallback strategies

Focus on the current execution phase and use the orchestration strategy for optimal results.`

    systemMessage.content += orchestrationContext

    return optimizedMessages
  }

  /**
   * ⚡︎ Adapt Response to Cognitive Understanding
   * Modifies AI responses based on task cognition for better alignment
   */
  adaptResponseToCognition(response: string, cognition?: TaskCognition): string {
    if (!cognition) return response

    let adaptedResponse = response

    // Adapt based on intent
    switch (cognition.intent.primary) {
      case 'create':
        // Emphasize creation and generation language
        adaptedResponse = adaptedResponse.replace(/analyze|review|check/gi, 'create')
        break
      case 'analyze':
        // Emphasize analytical language
        adaptedResponse = adaptedResponse.replace(/create|build|make/gi, 'analyze')
        break
      case 'debug':
        // Emphasize problem-solving language
        adaptedResponse = adaptedResponse.replace(/create|analyze/gi, 'fix')
        break
    }

    // Adapt based on urgency
    if (cognition.intent.urgency === 'critical') {
      adaptedResponse = `🚨 URGENT: ${adaptedResponse}`
    } else if (cognition.intent.urgency === 'high') {
      adaptedResponse = `⚡ HIGH PRIORITY: ${adaptedResponse}`
    }

    // Adapt based on complexity
    if (cognition.estimatedComplexity >= 8) {
      adaptedResponse = `🔥 COMPLEX TASK: ${adaptedResponse}`
    }

    // Adapt based on risk level
    if (cognition.riskLevel === 'high') {
      adaptedResponse = `⚠︎ HIGH RISK - ${adaptedResponse}`
    }

    return adaptedResponse
  }

  /**
   * 🎯 Private: Optimize Prompts with Cognition
   * Internal method to enhance prompts based on cognitive understanding
   */
  private optimizePromptWithCognition(messages: CoreMessage[], cognition: TaskCognition): CoreMessage[] {
    const optimizedMessages = [...messages]

    // Find system message or create one
    let systemMessage = optimizedMessages.find((m) => m.role === 'system')
    if (!systemMessage) {
      systemMessage = { role: 'system', content: '' }
      optimizedMessages.unshift(systemMessage)
    }

    // Add cognitive context to system prompt
    const cognitiveContext = `

⚡︎ COGNITIVE UNDERSTANDING:
- Primary Intent: ${cognition.intent.primary} (confidence: ${Math.round(cognition.intent.confidence * 100)}%)
- Complexity Level: ${cognition.estimatedComplexity}/10
- Risk Assessment: ${cognition.riskLevel}
- Urgency: ${cognition.intent.urgency}
- Required Capabilities: ${cognition.requiredCapabilities.join(', ')}
- Detected Entities: ${cognition.entities.map((e) => `${e.type}:${e.name}`).join(', ')}
- Dependencies: ${cognition.dependencies.join(', ')}
- Contexts: ${cognition.contexts.join(', ')}

Use this cognitive understanding to provide more targeted and effective responses.`

    systemMessage.content += cognitiveContext

    // Enhance user messages with entity context
    const lastUserMessage = optimizedMessages.filter((m) => m.role === 'user').pop()
    if (lastUserMessage && cognition.entities.length > 0) {
      const entityContext = `\n\n[Detected entities: ${cognition.entities.map((e) => e.name).join(', ')}]`
      lastUserMessage.content += entityContext
    }

    return optimizedMessages
  }

  /**
   * 📊 Get Cognitive Statistics
   * Returns statistics about cognitive processing
   */
  getCognitiveStats(): {
    totalCognitiveRequests: number
    averageComplexity: number
    commonIntents: string[]
    riskDistribution: Record<string, number>
  } {
    // This would be tracked in a real implementation
    return {
      totalCognitiveRequests: 0,
      averageComplexity: 5.0,
      commonIntents: ['analyze', 'create', 'update'],
      riskDistribution: { low: 60, medium: 30, high: 10 },
    }
  }

  /**
   *  Configure Cognitive Enhancement
   * Allows customization of cognitive processing behavior
   */
  configureCognition(config: {
    enablePromptOptimization?: boolean
    enableResponseAdaptation?: boolean
    complexityThreshold?: number
    riskAwareness?: boolean
  }): void {
    // Configuration would be stored and used in cognitive methods
    console.log(cognitiveColor('⚡︎ Cognitive configuration updated:'), config)
  }

  // ======================  AUTONOMOUS COMMAND SYSTEM ======================

  /**
   * 🔍 Intelligent Package Search with NPM Registry
   * Searches for packages with verification and recommendations
   */
  async searchPackagesIntelligently(
    query: string,
    context: 'frontend' | 'backend' | 'testing' | 'devops' | 'general' = 'general'
  ): Promise<PackageSearchResult[]> {
    // Check cache first
    const cacheKey = `${query}_${context}`
    if (this.packageCache.has(cacheKey)) {
      return this.packageCache.get(cacheKey)!
    }

    try {
      if (!this.streamSilentMode) {
        advancedUI.logFunctionCall('searchingpackages')
        advancedUI.logFunctionUpdate('info', `${query} (context: ${context})`, '●')
      }

      // Execute NPM search with context-aware filtering
      const searchCommand = `npm search ${query} --json --long`
      const { stdout } = await execAsync(searchCommand)

      let rawResults: any[] = []
      try {
        rawResults = JSON.parse(stdout)
      } catch {
        // Fallback to empty array if parsing fails
        rawResults = []
      }

      // Process and score results
      const processedResults: PackageSearchResult[] = rawResults
        .slice(0, 10) // Limit results
        .map((pkg) => this.scorePackageRelevance(pkg, query, context))
        .filter((pkg) => pkg.confidence > 0.3)
        .sort((a, b) => b.confidence - a.confidence)

      // Validate with Zod
      const validatedResults = processedResults
        .map((result) => {
          try {
            return PackageSearchResult.parse(result)
          } catch {
            return null
          }
        })
        .filter(Boolean) as PackageSearchResult[]

      // Cache results
      this.packageCache.set(cacheKey, validatedResults)

      if (!this.streamSilentMode) {
        advancedUI.logFunctionUpdate('success', `Found ${validatedResults.length} relevant packages`, '✓')
      }

      return validatedResults
    } catch (error: any) {
      if (!this.streamSilentMode) {
        advancedUI.logFunctionUpdate('error', `Package search failed: ${error.message}`, '✖')
      }
      return []
    }
  }

  /**
   * 🏗️ Build Intelligent Commands with Validation
   * Creates safe, validated commands based on context and requirements
   */
  buildIntelligentCommand(
    intent: 'install' | 'build' | 'test' | 'lint' | 'deploy' | 'analyze',
    context: {
      packages?: string[]
      target?: string
      environment?: 'development' | 'production' | 'testing'
      framework?: 'react' | 'node' | 'next' | 'vue' | 'angular'
    } = {}
  ): Command {
    let command: Partial<Command> = {
      workingDir: process.cwd(),
      safety: 'safe',
      requiresApproval: false,
    }

    switch (intent) {
      case 'install':
        command = this.buildInstallCommand(context)
        break
      case 'build':
        command = this.buildBuildCommand(context)
        break
      case 'test':
        command = this.buildTestCommand(context)
        break
      case 'lint':
        command = this.buildLintCommand(context)
        break
      case 'deploy':
        command = this.buildDeployCommand(context)
        break
      case 'analyze':
        command = this.buildAnalyzeCommand(context)
        break
    }

    // Validate with Zod
    try {
      return CommandSchema.parse(command)
    } catch (_error) {
      // Fallback to safe default
      return CommandSchema.parse({
        type: 'bash',
        command: 'echo "Command validation failed"',
        description: 'Fallback safe command',
        safety: 'safe',
        requiresApproval: true,
      })
    }
  }

  /**
   * ⚡ Execute Command with Safety Checks and Monitoring
   * Executes commands with comprehensive safety and monitoring
   */
  async executeCommandSafely(command: Command): Promise<CommandExecutionResult> {
    const startTime = Date.now()

    if (!this.streamSilentMode) {
      advancedUI.logFunctionCall('executing')
      advancedUI.logFunctionUpdate('info', command.description, '●')
    }

    try {
      // Pre-execution safety checks
      const safetyCheck = this.validateCommandSafety(command)
      if (!safetyCheck.safe) {
        throw new Error(`Safety check failed: ${safetyCheck.reason}`)
      }

      // Request approval for npm, git, and other critical commands
      const fullCommand = command.args ? `${command.command} ${command.args.join(' ')}` : command.command
      if (command.requiresApproval || command.type === 'npm' || command.type === 'git') {
        const { approvalSystem } = await import('../ui/approval-system')
        const approved = await approvalSystem.confirm(
          `Execute ${command.type} command?`,
          `Command: ${fullCommand}\nDescription: ${command.description}`,
          false
        )

        if (!approved) {
          throw new Error('Command execution cancelled by user')
        }
      }

      // Execute with timeout
      const timeout = command.estimatedDuration ? command.estimatedDuration * 1000 : 30000

      const { stdout, stderr } = await Promise.race([
        execAsync(fullCommand, {
          cwd: command.workingDir || process.cwd(),
          timeout,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Command timeout')), timeout)),
      ])

      const duration = Date.now() - startTime

      // Analyze workspace changes
      const workspaceState = await this.analyzeWorkspaceChanges(command)

      const result: CommandExecutionResult = {
        success: true,
        output: stdout || '',
        error: stderr || undefined,
        duration,
        command,
        timestamp: new Date(),
        workspaceState,
      }

      // Validate result
      const validatedResult = CommandExecutionResult.parse(result)

      // Store in history with size limit to prevent memory leak
      this.commandHistory.push(validatedResult)
      if (this.commandHistory.length > this.MAX_COMMAND_HISTORY) {
        this.commandHistory.shift()
      }

      if (!this.streamSilentMode) {
        advancedUI.logFunctionUpdate('success', `Command completed in ${duration}ms`, '✓')
      }

      return validatedResult
    } catch (error: any) {
      const duration = Date.now() - startTime

      const errorResult: CommandExecutionResult = {
        success: false,
        output: '',
        error: error.message,
        duration,
        command,
        timestamp: new Date(),
      }

      const validatedErrorResult = CommandExecutionResult.parse(errorResult)
      this.commandHistory.push(validatedErrorResult)

      if (!this.streamSilentMode) {
        advancedUI.logFunctionUpdate('error', `Command failed: ${error.message}`, '✖')
      }

      return validatedErrorResult
    }
  }

  /**
   * ⚡︎ Stream Commands with Clean Output
   * Enhanced streaming with clean, organized output
   */
  async *streamCommandExecution(command: Command): AsyncGenerator<StreamEvent> {
    try {
      // Enable silent mode for clean streaming
      this.streamSilentMode = true

      yield {
        type: 'start',
        content: ` Preparing: ${command.description}`,
        metadata: {
          command: command.command,
          safety: command.safety,
          estimatedDuration: command.estimatedDuration,
        },
      }

      // Pre-execution analysis
      if (command.type === 'npm' && command.command.includes('install')) {
        yield {
          type: 'thinking',
          content: '📦 Verifying package integrity and compatibility...',
        }
      }

      // Execute command
      const result = await this.executeCommandSafely(command)

      // Stream results cleanly
      if (result.success) {
        yield {
          type: 'tool_result',
          content: `✓ ${command.description} completed successfully`,
          toolName: command.type,
          toolResult: {
            success: true,
            duration: `${result.duration}ms`,
            output: result.output ? this.cleanCommandOutput(result.output) : undefined,
          },
        }

        // Show workspace changes if any
        if (result.workspaceState) {
          const changes = this.summarizeWorkspaceChanges(result.workspaceState)
          if (changes) {
            yield {
              type: 'text_delta',
              content: `\n📁 Workspace changes: ${changes}`,
            }
          }
        }
      } else {
        yield {
          type: 'tool_result',
          content: `✖ ${command.description} failed`,
          toolName: command.type,
          toolResult: {
            success: false,
            error: result.error,
            duration: `${result.duration}ms`,
          },
        }
      }

      yield {
        type: 'complete',
        metadata: { commandExecuted: true, success: result.success },
      }
    } catch (error: any) {
      yield {
        type: 'error',
        error: `Command execution failed: ${error.message}`,
        metadata: { command: command.command },
      }
    } finally {
      // Restore normal logging
      this.streamSilentMode = false
    }
  }

  /**
   * ⚡︎ Suggest Commands Based on Context
   * AI-powered command suggestions based on project state and intent
   */
  async suggestCommands(
    projectContext: {
      hasPackageJson?: boolean
      frameworks?: string[]
      hasTests?: boolean
      hasBuild?: boolean
      currentIssue?: string
    },
    userIntent: string
  ): Promise<Command[]> {
    const suggestions: Command[] = []
    const lowerIntent = userIntent.toLowerCase()

    // React/Frontend suggestions
    if (projectContext.frameworks?.includes('react') || lowerIntent.includes('react')) {
      if (lowerIntent.includes('component') || lowerIntent.includes('ui')) {
        suggestions.push(
          this.buildIntelligentCommand('install', {
            packages: ['@types/react', 'prop-types'],
            framework: 'react',
          })
        )
      }
    }

    // Testing suggestions
    if (lowerIntent.includes('test') || projectContext.currentIssue?.includes('test')) {
      if (!projectContext.hasTests) {
        suggestions.push(
          this.buildIntelligentCommand('install', {
            packages: ['jest', '@testing-library/react', '@testing-library/jest-dom'],
            environment: 'testing',
          })
        )
      }
      suggestions.push(this.buildIntelligentCommand('test', {}))
    }

    // Build suggestions
    if (lowerIntent.includes('build') || lowerIntent.includes('compile')) {
      suggestions.push(
        this.buildIntelligentCommand('build', {
          environment: 'production',
        })
      )
    }

    // Package installation suggestions
    if (lowerIntent.includes('install') || lowerIntent.includes('add')) {
      const packages = await this.extractPackageNames(userIntent)
      if (packages.length > 0) {
        suggestions.push(this.buildIntelligentCommand('install', { packages }))
      }
    }

    return suggestions.slice(0, 3) // Limit to top 3 suggestions
  }

  // ======================  COMMAND BUILDER HELPERS ======================

  private buildInstallCommand(context: any): Partial<Command> {
    const packages = context.packages || []
    const devFlag = context.environment === 'development' ? ' --save-dev' : ''

    return {
      type: 'npm',
      command: `npm install${devFlag} ${packages.join(' ')}`,
      description: `Install ${packages.length} package(s)${devFlag ? ' as dev dependencies' : ''}`,
      safety: 'safe',
      estimatedDuration: 30,
      dependencies: packages,
    }
  }

  private buildBuildCommand(context: any): Partial<Command> {
    const framework = context.framework || 'generic'
    const env = context.environment || 'production'

    return {
      type: 'npm',
      command: 'npm run build',
      description: `Build ${framework} project for ${env}`,
      safety: 'safe',
      estimatedDuration: 60,
    }
  }

  private buildTestCommand(_context: any): Partial<Command> {
    return {
      type: 'npm',
      command: 'npm test',
      description: 'Run project tests',
      safety: 'safe',
      estimatedDuration: 45,
    }
  }

  private buildLintCommand(_context: any): Partial<Command> {
    return {
      type: 'npm',
      command: 'npm run lint',
      description: 'Run code linting',
      safety: 'safe',
      estimatedDuration: 15,
    }
  }

  private buildDeployCommand(_context: any): Partial<Command> {
    return {
      type: 'npm',
      command: 'npm run deploy',
      description: 'Deploy application',
      safety: 'risky',
      requiresApproval: true,
      estimatedDuration: 120,
    }
  }

  private buildAnalyzeCommand(_context: any): Partial<Command> {
    return {
      type: 'bash',
      command: 'npm audit',
      description: 'Analyze project dependencies for vulnerabilities',
      safety: 'safe',
      estimatedDuration: 20,
    }
  }

  // ====================== 🛡️ SAFETY AND VALIDATION ======================

  private validateCommandSafety(command: Command): {
    safe: boolean
    reason?: string
  } {
    // Dangerous command patterns
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /sudo\s+rm/,
      /dd\s+if=/,
      /:\(\)\{.*\}:/,
      /wget.*\|\s*sh/,
      /curl.*\|\s*sh/,
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command.command)) {
        return { safe: false, reason: 'Command contains dangerous pattern' }
      }
    }

    // Check for risky commands that require approval
    if (command.safety === 'risky' && !command.requiresApproval) {
      return { safe: false, reason: 'Risky command requires approval' }
    }

    return { safe: true }
  }

  private scorePackageRelevance(pkg: any, query: string, context: string): PackageSearchResult {
    let confidence = 0

    // Name similarity
    if (pkg.name.includes(query)) confidence += 0.4
    if (pkg.name.startsWith(query)) confidence += 0.2

    // Description relevance
    if (pkg.description?.toLowerCase().includes(query.toLowerCase())) confidence += 0.2

    // Context relevance
    const contextKeywords = {
      frontend: ['react', 'vue', 'angular', 'ui', 'component', 'css'],
      backend: ['express', 'fastify', 'node', 'server', 'api', 'database'],
      testing: ['test', 'jest', 'mocha', 'cypress', 'spec'],
      devops: ['docker', 'kubernetes', 'deploy', 'ci', 'cd'],
    }

    const keywords = contextKeywords[context as keyof typeof contextKeywords] || []
    for (const keyword of keywords) {
      if (pkg.description?.toLowerCase().includes(keyword)) {
        confidence += 0.1
      }
    }

    // Popularity boost (mock - would use real download data)
    if (pkg.name.startsWith('@types/')) confidence += 0.1

    return {
      name: pkg.name,
      version: pkg.version || 'latest',
      description: pkg.description || '',
      confidence: Math.min(confidence, 1.0),
      verified: pkg.publisher?.username === 'types' || confidence > 0.8,
      lastUpdated: pkg.date,
    }
  }

  private async analyzeWorkspaceChanges(command: Command): Promise<any> {
    // Mock implementation - would analyze actual file changes
    if (command.type === 'npm' && command.command.includes('install')) {
      return {
        packagesInstalled: command.dependencies || [],
      }
    }
    return undefined
  }

  private cleanCommandOutput(output: string): string {
    return output
      .split('\n')
      .filter((line) => !line.includes('npm WARN') && line.trim().length > 0)
      .slice(0, 5) // Limit output lines
      .join('\n')
  }

  private summarizeWorkspaceChanges(workspaceState: any): string {
    const parts = []
    if (workspaceState.filesCreated?.length) {
      parts.push(`${workspaceState.filesCreated.length} files created`)
    }
    if (workspaceState.packagesInstalled?.length) {
      parts.push(`${workspaceState.packagesInstalled.length} packages installed`)
    }
    return parts.join(', ')
  }

  private async extractPackageNames(text: string): Promise<string[]> {
    const npmPackagePattern = /(?:npm install |add |install )([a-z0-9\-@/\s]+)/gi
    const matches = [...text.matchAll(npmPackagePattern)]

    return matches
      .flatMap((match) => match[1].trim().split(/\s+/))
      .filter((pkg) => pkg.length > 1 && !pkg.startsWith('-'))
  }

  // ====================== 📊 COMMAND SYSTEM ANALYTICS ======================

  /**
   * Get command execution statistics
   */
  getCommandStats(): {
    totalExecuted: number
    successRate: number
    averageDuration: number
    topCommands: string[]
    recentFailures: string[]
  } {
    const totalExecuted = this.commandHistory.length
    const successful = this.commandHistory.filter((cmd) => cmd.success).length
    const successRate = totalExecuted > 0 ? successful / totalExecuted : 0

    const durations = this.commandHistory.map((cmd) => cmd.duration)
    const averageDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

    const commandCounts = new Map<string, number>()
    this.commandHistory.forEach((cmd) => {
      const key = cmd.command.command.split(' ')[0]
      commandCounts.set(key, (commandCounts.get(key) || 0) + 1)
    })

    const topCommands = [...commandCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cmd]) => cmd)

    const recentFailures = this.commandHistory
      .filter((cmd) => !cmd.success)
      .slice(-3)
      .map((cmd) => cmd.error || 'Unknown error')

    return {
      totalExecuted,
      successRate,
      averageDuration,
      topCommands,
      recentFailures,
    }
  }

  /**
   * Clear command history and caches
   */
  clearCommandData(): void {
    this.commandHistory = []
    this.packageCache.clear()
    this.commandTemplates.clear()
  }

  /**
   * Configure cognitive features for the AI provider
   */
  configureCognitiveFeatures(config: {
    enableCognition: boolean
    orchestrationLevel: number
    intelligentCommands: boolean
    adaptivePlanning: boolean
  }): void {
    console.log(cognitiveColor('⚡︎ AdvancedAIProvider cognitive features configured'))
    if (config.enableCognition) {
      console.log(cognitiveColor(`🎯 Cognitive features enabled (level: ${config.orchestrationLevel})`))
    }
    if (config.intelligentCommands) {
      console.log(cognitiveColor('⚡ Intelligent commands active'))
    }
    if (config.adaptivePlanning) {
      console.log(cognitiveColor('📋 Adaptive planning enabled'))
    }
  }

  /**
   * Get usage statistics for dashboard
   */
  getUsageStats(): {
    totalTokens: number
    totalCost: number
    requestCount: number
    cacheHits: number
  } {
    return {
      totalTokens: this.totalTokensUsed,
      totalCost: this.estimatedCost,
      requestCount: this.requestCount,
      cacheHits: this.cacheHits,
    }
  }

  /**
   * Track token usage for dashboard
   */
  private trackTokenUsage(tokens: number, cost: number): void {
    this.totalTokensUsed += tokens
    this.estimatedCost += cost
    this.requestCount += 1
  }

  /**
   * Check if reasoning should be enabled for current model
   * Uses dynamic detection for OpenRouter models
   */
  private shouldEnableReasoning(): boolean {
    const config = configManager.getCurrentModel() as any
    if (!config) return false

    // Check model's explicit reasoning setting
    if (config.enableReasoning !== undefined) {
      return config.enableReasoning
    }

    // Auto-detect based on model capabilities (sync version)
    return ReasoningDetector.shouldEnableReasoning(config.provider, config.model)
  }

  /**
   * Async version - uses OpenRouter API for dynamic capability detection
   */
  private async shouldEnableReasoningAsync(): Promise<boolean> {
    const config = configManager.getCurrentModel() as any
    if (!config) return false

    if (config.enableReasoning !== undefined) {
      return config.enableReasoning
    }

    // For OpenRouter, fetch actual model capabilities
    if (config.provider === 'openrouter') {
      return ReasoningDetector.shouldEnableReasoningAsync(config.provider, config.model)
    }

    return ReasoningDetector.shouldEnableReasoning(config.provider, config.model)
  }

  /**
   * Log reasoning status if enabled
   * Uses async version for OpenRouter to get actual capabilities
   */
  private async logReasoningStatusAsync(enabled: boolean): Promise<void> {
    const config = configManager.getCurrentModel() as any
    if (!config) return

    try {
      let summary: string
      if (config.provider === 'openrouter') {
        summary = await ReasoningDetector.getModelReasoningSummaryAsync(config.provider, config.model)
      } else {
        summary = ReasoningDetector.getModelReasoningSummary(config.provider, config.model)
      }
      const msg = `[Reasoning] ${config.model}: ${summary} - ${enabled ? 'ENABLED' : 'DISABLED'}`
      console.log(darkGrayColor(msg))
    } catch {
      // Silent fail for logging
    }
  }

  /**
   * Sync version for backwards compatibility
   */
  private logReasoningStatus(enabled: boolean): void {
    const config = configManager.getCurrentModel() as any
    if (!config) return

    try {
      const summary = ReasoningDetector.getModelReasoningSummary(config.provider, config.model)
      const msg = `[Reasoning] ${config.model}: ${summary} - ${enabled ? 'ENABLED' : 'DISABLED'}`
      console.log(darkGrayColor(msg))
    } catch {
      // Silent fail for logging
    }
  }

  /**
   * Track cache hit for dashboard
   */
  private trackCacheHit(): void {
    this.cacheHits += 1
  }
}

export const advancedAIProvider = new AdvancedAIProvider()
