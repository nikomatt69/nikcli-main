import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { bunExec } from '../utils/bun-compat'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createCerebras } from '@ai-sdk/cerebras'
import { createGateway } from '@ai-sdk/gateway'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createVercel } from '@ai-sdk/vercel'
import { type CoreMessage, type CoreTool, generateText, streamText, tool, experimental_wrapLanguageModel } from 'ai'
import { createOllama } from 'ollama-ai-provider'
import { z } from 'zod'

import { simpleConfigManager } from '../core/config-manager'
import { createAICacheMiddleware } from './ai-cache-middleware'
import { type PromptContext, PromptManager } from '../prompts/prompt-manager'
import { streamttyService } from '../services/streamtty-service'
import type { OutputStyle } from '../types/output-styles'
import { ReasoningDetector } from './reasoning-detector'
import { openRouterRegistry } from './openrouter-model-registry'
import {
  workflowPatterns,
  type WorkflowResult,
  type QualityEvaluation,
} from './workflow-patterns'

export interface ModelConfig {
  provider:
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'vercel'
  | 'gateway'
  | 'openrouter'
  | 'ollama'
  | 'cerebras'
  | 'groq'
  | 'llamacpp'
  | 'lmstudio'
  | 'openai-compatible'
  model: string
  temperature?: number
  maxTokens?: number
  enableReasoning?: boolean
  reasoningMode?: 'auto' | 'explicit' | 'disabled'
  outputStyle?: OutputStyle
  transforms?: string[] // OpenRouter transforms (e.g., ["middle-out"] for context compression)
  // OpenRouter Web Search - append :online to model for web search capability
  enableWebSearch?: boolean
  // Control parallel tool execution (default: true)
  parallelToolCalls?: boolean
  // AI SDK toolChoice configuration
  // 'auto' - model decides (default)
  // 'none' - disable tool usage
  // 'required' - model must use at least one tool
  // { type: 'tool', toolName: 'name' } - force specific tool
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string }
}

export interface AIProviderOptions {
  outputStyle?: OutputStyle
  context?: string
  taskType?: string
  modelOverride?: string
  // OpenRouter Web Search - enables :online suffix for real-time web data
  enableWebSearch?: boolean
  // Control parallel tool execution (default: true)
  parallelToolCalls?: boolean
  // OpenRouter transforms (e.g., ["middle-out"] for context compression)
  transforms?: string[]
}

/**
 * Retry configuration with exponential backoff
 * Reference: https://openrouter.ai/docs/guides/features/zero-completion-insurance
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
  jitterFactor: 0.1, // Add 0-10% random jitter
  enableLogging: true,
}

/**
 * Calculate exponential backoff delay with jitter
 * @param attempt Current attempt number (1-based)
 * @returns Delay in milliseconds
 */
function getExponentialBackoff(attempt: number): number {
  const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.exponentialBase, attempt - 1)
  const delay = Math.min(exponentialDelay, RETRY_CONFIG.maxDelayMs)

  // Add random jitter to prevent thundering herd
  const jitter = delay * RETRY_CONFIG.jitterFactor * Math.random()
  return Math.round(delay + jitter)
}

// Alias for backwards compatibility
const ZERO_COMPLETION_CONFIG = RETRY_CONFIG

/**
 * Context-aware transforms configuration
 * Reference: https://openrouter.ai/docs/guides/features/message-transforms
 */
const TRANSFORMS_CONFIG = {
  // Auto-enable middle-out when prompt exceeds this % of context window
  autoEnableThreshold: 0.5,
  // Default transforms when auto-enabled
  defaultTransforms: ['middle-out'],
}

/**
 * Calculate if context-aware transforms should be auto-enabled
 * @param promptTokens Estimated prompt token count
 * @param contextWindow Model's context window size
 * @param explicitTransforms User-specified transforms (overrides auto)
 */
function getContextAwareTransforms(
  promptTokens: number,
  contextWindow: number,
  explicitTransforms?: string[]
): string[] | undefined {
  // If explicit transforms provided, use them (empty array = disable)
  if (explicitTransforms !== undefined) {
    return explicitTransforms.length > 0 ? explicitTransforms : undefined
  }

  // Auto-enable middle-out if prompt exceeds threshold
  const utilizationRatio = promptTokens / contextWindow
  if (utilizationRatio > TRANSFORMS_CONFIG.autoEnableThreshold) {
    return TRANSFORMS_CONFIG.defaultTransforms
  }

  // No transforms needed for small prompts
  return undefined
}

/**
 * Check if response qualifies for Zero Completion Insurance (no charge)
 * Conditions: zero completion tokens AND (blank finish_reason OR error finish_reason)
 */
function isZeroCompletionResponse(result: any): boolean {
  const usage = result?.usage || result?.experimental_providerMetadata?.usage
  const finishReason = result?.finishReason || result?.finish_reason

  // Zero completion tokens with blank/null/error finish reason
  if (usage?.completionTokens === 0 || usage?.completion_tokens === 0) {
    if (!finishReason || finishReason === '' || finishReason === 'error') {
      return true
    }
  }

  // Empty text response with no tool calls
  if ((!result?.text || result.text.trim() === '') &&
    (!result?.toolCalls || result.toolCalls.length === 0)) {
    if (!finishReason || finishReason === 'error') {
      return true
    }
  }

  return false
}

export class ModernAIProvider {
  private currentModel: string
  private workingDirectory: string = process.cwd()
  private promptManager: PromptManager

  constructor() {
    this.currentModel = simpleConfigManager.get('currentModel')
    this.promptManager = PromptManager.getInstance(process.cwd())
  }

  /**
   * Create a tool call repair handler for AI SDK
   * Reference: https://v4.ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-call-repair
   * 
   * This handler attempts to fix invalid tool calls by:
   * 1. Re-asking the model to correct the invalid parameters
   * 2. Using structured output to ensure valid tool call format
   */
  private createToolCallRepairHandler(model: any, tools: Record<string, CoreTool>) {
    return async ({ toolCall, error, messages, system }: {
      toolCall: { toolName: string; args: unknown };
      error: Error;
      messages: CoreMessage[];
      system?: string;
    }) => {
      try {
        const tool = tools[toolCall.toolName]
        if (!tool) {
          // Tool not found, cannot repair
          console.log(require('chalk').dim(`[ToolRepair] Unknown tool: ${toolCall.toolName}`))
          return null
        }

        console.log(require('chalk').dim(
          `[ToolRepair] Attempting to fix invalid tool call: ${toolCall.toolName}`
        ))

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
          maxTokens: 1000,
        })

        // Try to parse the corrected arguments
        const fixedArgsText = repairResult.text.trim()
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = fixedArgsText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
          fixedArgsText.match(/^\{[\s\S]*\}$/)

        if (jsonMatch) {
          const fixedArgs = JSON.parse(jsonMatch[1] || jsonMatch[0])
          console.log(require('chalk').green(`[ToolRepair] Successfully repaired tool call: ${toolCall.toolName}`))
          return { toolName: toolCall.toolName, args: fixedArgs }
        }

        // Try parsing the entire response as JSON
        const fixedArgs = JSON.parse(fixedArgsText)
        console.log(require('chalk').green(`[ToolRepair] Successfully repaired tool call: ${toolCall.toolName}`))
        return { toolName: toolCall.toolName, args: fixedArgs }
      } catch (repairError: any) {
        console.log(require('chalk').yellow(
          `[ToolRepair] Failed to repair tool call: ${repairError.message}`
        ))
        return null // Return null to indicate repair failed
      }
    }
  }

  /**
   * Active Tools Pattern - Intelligently select relevant tools based on context
   * Reference: https://ai-sdk.dev/docs/agents best practices
   * 
   * Instead of providing all tools to every request, this method analyzes the
   * user's message and selects only the most relevant tools (limit: 5-7 tools)
   * to improve model performance and reduce token usage.
   * 
   * @param message - The user's message to analyze
   * @param allTools - All available tools
   * @param maxTools - Maximum number of tools to return (default: 5)
   * @returns Filtered set of relevant tools
   */
  private selectActiveTools(
    message: string,
    allTools: Record<string, CoreTool>,
    maxTools = 5
  ): Record<string, CoreTool> {
    const lowerMessage = message.toLowerCase()

    // Define tool categories with priority keywords
    const toolCategories: Record<string, { tools: string[]; keywords: string[]; priority: number }> = {
      file_reading: {
        tools: ['read_file', 'list_directory'],
        keywords: ['read', 'show', 'view', 'content', 'look', 'check', 'see', 'file', 'what'],
        priority: 1,
      },
      file_writing: {
        tools: ['write_file', 'edit_file', 'create_file'],
        keywords: ['write', 'create', 'edit', 'modify', 'update', 'change', 'fix', 'add', 'save'],
        priority: 2,
      },
      file_search: {
        tools: ['search_files', 'find_files', 'grep'],
        keywords: ['search', 'find', 'where', 'grep', 'locate', 'pattern'],
        priority: 3,
      },
      execution: {
        tools: ['execute_command', 'run_command', 'bash'],
        keywords: ['run', 'execute', 'command', 'terminal', 'shell', 'npm', 'pnpm', 'bun', 'yarn', 'install', 'build', 'test'],
        priority: 4,
      },
      analysis: {
        tools: ['analyze_workspace', 'analyze_code'],
        keywords: ['analyze', 'explain', 'understand', 'structure', 'architecture', 'project'],
        priority: 5,
      },
      blockchain: {
        tools: ['coinbase_blockchain'],
        keywords: ['blockchain', 'crypto', 'wallet', 'transfer', 'ethereum', 'bitcoin', 'coinbase', 'web3', 'defi'],
        priority: 6,
      },
      workflows: {
        tools: ['workflow_code_review', 'workflow_optimize_code', 'workflow_smart_route', 'workflow_implement_feature', 'workflow_translate', 'workflow_generate_code'],
        keywords: ['workflow', 'pipeline', 'review', 'optimize', 'implement', 'feature', 'translate', 'generate', 'quality', 'parallel', 'orchestrate'],
        priority: 7,
      },
    }

    // Score each category based on keyword matches
    const categoryScores: { category: string; score: number; priority: number }[] = []

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

    // If no specific category matched, provide default core tools
    if (selectedToolNames.size === 0) {
      const coreTools = ['read_file', 'write_file', 'list_directory', 'execute_command', 'analyze_workspace']
      for (const toolName of coreTools) {
        if (allTools[toolName]) {
          selectedTools[toolName] = allTools[toolName]
          if (Object.keys(selectedTools).length >= maxTools) break
        }
      }
    }

    // Always include at least read_file for context
    if (!selectedTools['read_file'] && allTools['read_file']) {
      selectedTools['read_file'] = allTools['read_file']
    }

    // Log active tools for debugging
    if (process.env.DEBUG) {
      console.log(require('chalk').dim(
        `[ActiveTools] Selected ${Object.keys(selectedTools).length} tools: ${Object.keys(selectedTools).join(', ')}`
      ))
    }

    return selectedTools
  }

  /**
   * Execute with Zero Completion Insurance retry logic
   * Auto-retries on zero completion responses (OpenRouter doesn't charge for these)
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries = ZERO_COMPLETION_CONFIG.maxRetries
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation()

        // Check for zero completion (protected by insurance, can retry for free)
        if (isZeroCompletionResponse(result) && attempt < maxRetries) {
          if (ZERO_COMPLETION_CONFIG.enableLogging) {
            console.log(require('chalk').dim(
              `[ZeroCompletion] ${context}: Empty response (attempt ${attempt}/${maxRetries}), retrying...`
            ))
          }
          await new Promise(r => setTimeout(r, getExponentialBackoff(attempt)))
          continue
        }

        return result
      } catch (error: any) {
        lastError = error

        // Retry on transient errors
        if (attempt < maxRetries && this.isRetryableError(error)) {
          if (ZERO_COMPLETION_CONFIG.enableLogging) {
            console.log(require('chalk').dim(
              `[Retry] ${context}: ${error.message} (attempt ${attempt}/${maxRetries})`
            ))
          }
          await new Promise(r => setTimeout(r, getExponentialBackoff(attempt)))
          continue
        }

        throw error
      }
    }

    throw lastError || new Error(`${context}: Max retries exceeded`)
  }

  /**
   * Check if error is retryable (rate limits, transient failures)
   */
  private isRetryableError(error: any): boolean {
    const message = error?.message?.toLowerCase() || ''
    const status = error?.status || error?.statusCode

    // Rate limit errors
    if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
      return true
    }

    // Transient server errors
    if (status >= 500 && status < 600) {
      return true
    }

    // Connection errors
    if (message.includes('network') || message.includes('timeout') || message.includes('econnreset')) {
      return true
    }

    return false
  }

  /**
   * Check if reasoning should be enabled for current model
   * Uses dynamic detection for OpenRouter models
   */
  private shouldEnableReasoning(): boolean {
    const config = simpleConfigManager?.getCurrentModel() as any
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
    const config = simpleConfigManager?.getCurrentModel() as any
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
    const config = simpleConfigManager?.getCurrentModel() as any
    if (!config) return

    try {
      let summary: string
      if (config.provider === 'openrouter') {
        summary = await ReasoningDetector.getModelReasoningSummaryAsync(config.provider, config.model)
      } else {
        summary = ReasoningDetector.getModelReasoningSummary(config.provider, config.model)
      }
      const msg = `[Reasoning] ${config.model}: ${summary} - ${enabled ? 'ENABLED' : 'DISABLED'}`
      console.log(require('chalk').dim(msg))
    } catch {
      // Silent fail for logging
    }
  }

  /**
   * Sync version for backwards compatibility
   */
  private logReasoningStatus(enabled: boolean): void {
    const config = simpleConfigManager?.getCurrentModel() as any
    if (!config) return

    try {
      const summary = ReasoningDetector.getModelReasoningSummary(config.provider, config.model)
      const msg = `[Reasoning] ${config.model}: ${summary} - ${enabled ? 'ENABLED' : 'DISABLED'}`
      console.log(require('chalk').dim(msg))
    } catch {
      // Silent fail for logging
    }
  }

  // Core file operations tools - Claude Code style
  private getFileOperationsTools(): Record<string, CoreTool> {
    const tools: Record<string, CoreTool> = {
      read_file: tool({
        description: 'Read the contents of a file',
        parameters: z.object({
          path: z.string().describe('The file path to read'),
        }),
        execute: async ({ path }) => {
          try {
            // Load tool-specific prompt for context

            const fullPath = resolve(this.workingDirectory, path)
            if (!existsSync(fullPath)) {
              return { error: `File not found: ${path}` }
            }
            const content = readFileSync(fullPath, 'utf-8')
            const stats = statSync(fullPath)
            return {
              content,
              size: stats.size,
              modified: stats.mtime,
              path: relative(this.workingDirectory, fullPath),
            }
          } catch (error: any) {
            return { error: `Failed to read file: ${error.message}` }
          }
        },
      }),

      write_file: tool({
        description: 'Write content to a file',
        parameters: z.object({
          path: z.string().describe('The file path to write to'),
          content: z.string().describe('The content to write'),
        }),
        execute: async ({ path, content }) => {
          try {
            // Load tool-specific prompt for context

            const fullPath = resolve(this.workingDirectory, path)
            const dir = dirname(fullPath)

            // Create directory if it doesn't exist
            const { mkdirSync } = await import('node:fs')
            mkdirSync(dir, { recursive: true })

            writeFileSync(fullPath, content, 'utf-8')
            const stats = statSync(fullPath)

            // File operation completed

            return {
              path: relative(this.workingDirectory, fullPath),
              size: stats.size,
              created: true,
            }
          } catch (error: any) {
            return { error: `Failed to write file: ${error.message}` }
          }
        },
      }),

      list_directory: tool({
        description: 'List files and directories in a path',
        parameters: z.object({
          path: z.string().describe('The directory path to list').optional(),
          pattern: z.string().describe('Optional glob pattern to filter files').optional(),
        }),
        execute: async ({ path = '.', pattern }) => {
          try {
            const fullPath = resolve(this.workingDirectory, path)
            if (!existsSync(fullPath)) {
              return { error: `Directory not found: ${path}` }
            }

            const items = readdirSync(fullPath, { withFileTypes: true })
            const files: Array<{ name: string; path: string; size: number; modified: Date }> = []
            const directories: Array<{ name: string; path: string; size: number; modified: Date }> = []

            for (const item of items) {
              if (pattern && !item.name.includes(pattern)) continue

              const itemPath = join(fullPath, item.name)
              const stats = statSync(itemPath)
              const itemInfo = {
                name: item.name,
                path: relative(this.workingDirectory, itemPath),
                size: stats.size,
                modified: stats.mtime,
              }

              if (item.isDirectory()) {
                directories.push(itemInfo)
              } else {
                files.push(itemInfo)
              }
            }

            return {
              path: relative(this.workingDirectory, fullPath),
              files,
              directories,
              total: files.length + directories.length,
            }
          } catch (error: any) {
            return { error: `Failed to list directory: ${error.message}` }
          }
        },
      }),

      execute_command: tool({
        description: 'Execute a shell command',
        parameters: z.object({
          command: z.string().describe('The command to execute'),
          args: z.array(z.string()).describe('Command arguments').optional(),
        }),
        execute: async ({ command, args = [] }) => {
          try {
            const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command

            // Executing command using Bun native
            const { stdout, stderr, exitCode } = await bunExec(fullCommand, {
              cwd: this.workingDirectory,
              timeout: 60000,
            })

            if (exitCode === 0) {
              return {
                command: fullCommand,
                output: stdout.trim(),
                success: true,
              }
            } else {
              return {
                command: fullCommand,
                error: stderr || `Command exited with code ${exitCode}`,
                success: false,
              }
            }
          } catch (error: any) {
            // Command failed
            return {
              command: `${command} ${args.join(' ')}`,
              error: error.message,
              success: false,
            }
          }
        },
      }),

      analyze_workspace: tool({
        description: 'Analyze the current workspace/project structure',
        parameters: z.object({
          depth: z.number().describe('Directory depth to analyze').optional(),
        }),
        execute: async ({ depth = 2 }) => {
          try {
            const analysis = await this.analyzeWorkspaceStructure(this.workingDirectory, depth)
            return analysis
          } catch (error: any) {
            return { error: `Failed to analyze workspace: ${error.message}` }
          }
        },
      }),

      coinbase_blockchain: tool({
        description:
          'Execute blockchain operations using Coinbase AgentKit - supports wallet info, transfers, balances, and DeFi operations',
        parameters: z.object({
          action: z
            .string()
            .describe('The blockchain action to perform: init, chat, wallet-info, transfer, balance, status, reset'),
          params: z
            .any()
            .optional()
            .describe('Parameters for the blockchain action (e.g., {to: "0x...", amount: "0.1"} for transfers)'),
        }),
        execute: async ({ action, params = {} }) => {
          try {
            const { secureTools } = await import('../tools/secure-tools-registry')
            const result = await secureTools.executeCoinbaseAgentKit(action, params)

            if (result.success) {
              return {
                success: true,
                action,
                data: result.data,
                message: `Blockchain operation '${action}' completed successfully`,
              }
            } else {
              return {
                success: false,
                action,
                error: result.error,
                message: `Blockchain operation '${action}' failed`,
              }
            }
          } catch (error: any) {
            return {
              success: false,
              action,
              error: error.message,
              message: `Failed to execute blockchain operation: ${error.message}`,
            }
          }
        },
      }),

      goat_finance: tool({
        description:
          'Execute DeFi operations using GOAT SDK - supports Polymarket prediction markets and ERC20 tokens on Polygon and Base networks',
        parameters: z.object({
          plugin: z
            .enum(['polymarket', 'erc20'])
            .describe('The GOAT plugin to use: polymarket for prediction markets, erc20 for token operations'),
          action: z
            .string()
            .describe(
              'The action to perform: init, chat, wallet-info, markets, bet, transfer, balance, approve, status, tools, reset'
            ),
          chain: z.enum(['polygon', 'base']).optional().describe('The blockchain network to use (defaults to base)'),
          params: z
            .any()
            .optional()
            .describe('Parameters for the action (e.g., {amount: "100", token: "USDC", to: "0x..."} for transfers)'),
        }),
        execute: async ({ plugin, action, chain, params = {} }) => {
          try {
            const { secureTools } = await import('../tools/secure-tools-registry')

            // Construct action with plugin prefix if needed
            const fullAction = action.startsWith(`${plugin}-`) ? action : `${plugin}-${action}`

            // Add chain and plugin info to params
            const enhancedParams = {
              ...params,
              plugin,
              chain: chain || 'base',
            }

            const result = await secureTools.executeGoat(fullAction, enhancedParams)

            if (result.success) {
              return {
                success: true,
                plugin,
                action,
                chain: chain || 'base',
                data: result.data,
                message: `GOAT ${plugin} operation '${action}' completed successfully on ${chain || 'base'}`,
              }
            } else {
              return {
                success: false,
                plugin,
                action,
                chain: chain || 'base',
                error: result.error,
                message: `GOAT ${plugin} operation '${action}' failed on ${chain || 'base'}`,
              }
            }
          } catch (error: any) {
            return {
              success: false,
              plugin,
              action,
              chain: chain || 'base',
              error: error.message,
              message: `Failed to execute GOAT operation: ${error.message}`,
            }
          }
        },
      }),

      // ========================================================================
      // AI SDK Workflow Pattern Tools
      // Reference: https://ai-sdk.dev/docs/agents/workflows
      // ========================================================================

      workflow_code_review: tool({
        description: 'Run a parallel code review analyzing security, performance, and quality simultaneously. Uses multiple specialized AI reviewers.',
        parameters: z.object({
          code: z.string().describe('The code to review'),
        }),
        execute: async ({ code }) => {
          try {
            const result = await workflowPatterns.codeReview(code)
            return {
              success: true,
              reviews: result.reviews,
              summary: result.summary,
            }
          } catch (error: any) {
            return { success: false, error: error.message }
          }
        },
      }),

      workflow_optimize_code: tool({
        description: 'Iteratively optimize code using an evaluator-optimizer pattern. Automatically improves code based on quality feedback.',
        parameters: z.object({
          code: z.string().describe('The code to optimize'),
        }),
        execute: async ({ code }) => {
          try {
            const result = await workflowPatterns.codeOptimization(code)
            return {
              success: true,
              optimizedCode: result.optimizedCode,
              iterations: result.iterations,
              finalScore: result.finalScore,
            }
          } catch (error: any) {
            return { success: false, error: error.message }
          }
        },
      }),

      workflow_smart_route: tool({
        description: 'Intelligently route a query to the appropriate handler based on query type and complexity. Uses smaller models for simple tasks, larger models for complex ones.',
        parameters: z.object({
          query: z.string().describe('The query to route and process'),
        }),
        execute: async ({ query }) => {
          try {
            const result = await workflowPatterns.queryRouter(query)
            return {
              success: true,
              classification: result.classification,
              response: result.response,
              modelUsed: result.modelUsed,
            }
          } catch (error: any) {
            return { success: false, error: error.message }
          }
        },
      }),

      workflow_implement_feature: tool({
        description: 'Use orchestrator-worker pattern to plan and implement a feature. Creates implementation plan and generates code for each file.',
        parameters: z.object({
          featureRequest: z.string().describe('Description of the feature to implement'),
        }),
        execute: async ({ featureRequest }) => {
          try {
            const result = await workflowPatterns.featureImplementation(featureRequest)
            return {
              success: true,
              plan: result.plan,
              implementations: result.implementations,
            }
          } catch (error: any) {
            return { success: false, error: error.message }
          }
        },
      }),

      workflow_translate: tool({
        description: 'Translate text with quality feedback loop. Iteratively improves translation based on tone, nuance, and cultural accuracy evaluation.',
        parameters: z.object({
          text: z.string().describe('The text to translate'),
          targetLanguage: z.string().describe('The target language (e.g., "Italian", "Spanish", "Japanese")'),
        }),
        execute: async ({ text, targetLanguage }) => {
          try {
            const result = await workflowPatterns.translation(text, targetLanguage)
            return {
              success: true,
              translation: result.translation,
              iterations: result.iterations,
              quality: result.finalQuality,
            }
          } catch (error: any) {
            return { success: false, error: error.message }
          }
        },
      }),

      workflow_generate_code: tool({
        description: 'Generate code using a sequential pipeline: analyze requirements, design architecture, create file structure.',
        parameters: z.object({
          requirements: z.string().describe('The requirements or description of what to build'),
        }),
        execute: async ({ requirements }) => {
          try {
            const result = await workflowPatterns.codeGeneration(requirements)
            return {
              success: result.success,
              result: result.result,
              steps: result.steps.map(s => ({ name: s.name, duration: `${s.duration}ms` })),
              totalDuration: `${result.totalDuration}ms`,
            }
          } catch (error: any) {
            return { success: false, error: error.message }
          }
        },
      }),
    }

    // Note: Tool-level caching via @ai-sdk-tools/cache is incompatible with AI SDK v3's CoreTool type
    // The existing workspace context, embeddings, and RAG systems already have sophisticated
    // multi-layer caching (in-memory Maps, persistent disk cache, TTL-based invalidation)
    // which provides better performance for this CLI's use case

    return tools
  }

  private async analyzeWorkspaceStructure(rootPath: string, maxDepth: number): Promise<any> {
    const packageJsonPath = join(rootPath, 'package.json')
    let packageInfo: {
      name?: string
      version?: string
      description?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    } | null = {
      name: '',
      version: '',
      description: '',
      dependencies: {},
      devDependencies: {},
    }

    if (existsSync(packageJsonPath)) {
      try {
        packageInfo = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      } catch (_e) {
        // Invalid package.json
      }
    }

    const structure = this.buildDirectoryTree(rootPath, maxDepth)
    const framework = this.detectFramework(packageInfo)
    const technologies = this.detectTechnologies(packageInfo, structure)

    return {
      rootPath: relative(process.cwd(), rootPath),
      packageInfo: packageInfo
        ? {
          name: packageInfo.name as string,
          version: packageInfo.version,
          description: packageInfo.description,
        }
        : null,
      framework,
      technologies,
      structure,
      files: this.countFiles(structure),
    }
  }

  private buildDirectoryTree(dirPath: string, maxDepth: number, currentDepth = 0): any {
    if (currentDepth >= maxDepth || !existsSync(dirPath)) {
      return null
    }

    const items = readdirSync(dirPath, { withFileTypes: true })
    const result: { files: Array<{ name: string; path: string; size: number; modified: Date }>; directories: Array<{ name: string; path: string; size: number; modified: Date }> } = {
      files: [] as Array<{ name: string; path: string; size: number; modified: Date }>,
      directories: [] as Array<{ name: string; path: string; size: number; modified: Date }>,
    }

    const skipDirs = ['node_modules', '.git', '.next', 'dist', 'build', 'target', 'bin', 'obj', '.cache', '.temp', '.tmp', 'coverage', '.nyc_output', '__pycache__', '.pytest_cache', 'venv', 'env', '.env', '.venv', 'vendor', 'Pods', 'DerivedData', '.gradle', '.idea', '.vscode', '.vs', 'logs', '*.log', '.DS_Store', 'Thumbs.db']

    for (const item of items) {
      if (skipDirs.includes(item.name)) continue

      const itemPath = join(dirPath, item.name)

      if (item.isDirectory()) {
        const subTree = this.buildDirectoryTree(itemPath, maxDepth, currentDepth + 1)
        if (subTree) {
          result.directories.push({
            name: item.name,
            path: relative(this.workingDirectory, itemPath),
            ...subTree,
          })
        }
      } else {
        result.files.push({
          name: item.name,
          path: relative(this.workingDirectory, itemPath),
          size: statSync(itemPath).size,
          modified: statSync(itemPath).mtime,
        })
      }
    }

    return result
  }

  private detectFramework(packageInfo: any): string {
    if (!packageInfo?.dependencies) return 'Unknown'

    const deps = { ...packageInfo.dependencies, ...packageInfo.devDependencies }

    if (deps.next) return 'Next.js'
    if (deps.nuxt) return 'Nuxt.js'
    if (deps['@angular/core']) return 'Angular'
    if (deps.vue) return 'Vue.js'
    if (deps.react) return 'React'
    if (deps.express) return 'Express'
    if (deps.fastify) return 'Fastify'

    return 'JavaScript/Node.js'
  }

  private detectTechnologies(packageInfo: any, structure: any): string[] {
    const technologies: Set<string> = new Set()

    if (packageInfo?.dependencies) {
      const allDeps = { ...packageInfo.dependencies, ...packageInfo.devDependencies }

      Object.keys(allDeps).forEach((dep) => {
        if (dep.includes('typescript') || dep.includes('@types/')) technologies.add('TypeScript')
        if (dep.includes('tailwind')) technologies.add('Tailwind CSS')
        if (dep.includes('prisma')) technologies.add('Prisma')
        if (dep.includes('next')) technologies.add('Next.js')
        if (dep.includes('react')) technologies.add('React')
        if (dep.includes('vue')) technologies.add('Vue.js')
        if (dep.includes('express')) technologies.add('Express')
        if (dep.includes('jest')) technologies.add('Jest')
        if (dep.includes('vitest')) technologies.add('Vitest')
      })
    }

    // Detect from file extensions
    this.extractFileExtensions(structure).forEach((ext) => {
      switch (ext) {
        case 'ts':
        case 'tsx':
          technologies.add('TypeScript')
          break
        case 'py':
          technologies.add('Python')
          break
        case 'go':
          technologies.add('Go')
          break
        case 'rs':
          technologies.add('Rust')
          break
        case 'java':
          technologies.add('Java')
          break
      }
    })

    return Array.from(technologies)
  }

  private extractFileExtensions(structure: any): string[] {
    const extensions: Set<string> = new Set()

    if (structure?.files) {
      structure.files.forEach((file: any) => {
        if (file.extension) extensions.add(file.extension)
      })
    }

    if (structure?.directories) {
      structure.directories.forEach((dir: any) => {
        this.extractFileExtensions(dir).forEach((ext) => extensions.add(ext))
      })
    }

    return Array.from(extensions)
  }

  private countFiles(structure: any): number {
    let count = 0

    if (structure?.files) count += structure.files.length
    if (structure?.directories) {
      structure.directories.forEach((dir: any) => {
        count += this.countFiles(dir)
      })
    }

    return count
  }

  private getModel(modelName?: string) {
    const model = modelName || this.currentModel
    const config = simpleConfigManager?.getCurrentModel() as any

    if (!config) {
      throw new Error(`Model ${model} not found in configuration`)
    }

    let apiKey = simpleConfigManager.getApiKey(model)
    if (!apiKey) {
      // Fallback to shared alias/env for NikCLI-issued keys
      apiKey = simpleConfigManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY || apiKey
    }
    if (!apiKey) {
      throw new Error(`No API key found for model ${model}`)
    }

    let baseModel: any

    switch (config.provider) {
      case 'openai': {
        // OpenAI provider is already response-API compatible via model options; no chainable helper here.
        const openaiProvider = createOpenAI({ apiKey, compatibility: 'strict' })
        baseModel = openaiProvider(config.model)
        break
      }
      case 'anthropic': {
        const anthropicProvider = createAnthropic({ apiKey })
        baseModel = anthropicProvider(config.model)
        break
      }
      case 'google': {
        const googleProvider = createGoogleGenerativeAI({ apiKey })
        baseModel = googleProvider(config.model)
        break
      }
      case 'vercel': {
        const vercelProvider = createVercel({ apiKey })
        baseModel = vercelProvider(config.model)
        break
      }
      case 'gateway': {
        const gatewayProvider = createGateway({ apiKey })
        baseModel = gatewayProvider(config.model)
        break
      }
      case 'openrouter': {
        const openrouterProvider = createOpenAI({
          apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
          headers: {
            'HTTP-Referer': 'https://nikcli.mintlify.app',
            'X-Title': 'NikCLI',
          },
        })
        // OpenRouter Web Search: append :online suffix for real-time web data
        // Reference: https://openrouter.ai/docs/guides/features/web-search
        let modelId = config.model
        if ((config as any).enableWebSearch && !modelId.endsWith(':online')) {
          modelId = `${modelId}:online`
        }
        baseModel = openrouterProvider(modelId)
        break
      }
      case 'ollama': {
        // Ollama does not require API keys; assumes local daemon at default endpoint
        const ollamaProvider = createOllama({})
        baseModel = ollamaProvider(config.model)
        break
      }
      case 'cerebras': {
        const cerebrasProvider = createCerebras({ apiKey })
        baseModel = cerebrasProvider(config.model)
        break
      }
      case 'groq': {
        const groqProvider = createGroq({ apiKey })
        baseModel = groqProvider(config.model)
        break
      }
      case 'llamacpp': {
        // LlamaCpp uses OpenAI-compatible API; assumes local server at default endpoint
        const llamacppProvider = createOpenAICompatible({
          name: 'llamacpp',
          apiKey: 'llamacpp', // LlamaCpp doesn't require a real API key for local server
          baseURL: process.env.LLAMACPP_BASE_URL || 'http://localhost:8080/v1',
        })
        baseModel = llamacppProvider(config.model)
        break
      }
      case 'lmstudio': {
        // LMStudio uses OpenAI-compatible API; assumes local server at default endpoint
        const lmstudioProvider = createOpenAICompatible({
          name: 'lmstudio',
          apiKey: 'lm-studio', // LMStudio doesn't require a real API key
          baseURL: process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1',
        })
        baseModel = lmstudioProvider(config.model)
        break
      }
      case 'openai-compatible': {
        const baseURL = (config as any).baseURL || process.env.OPENAI_COMPATIBLE_BASE_URL
        if (!baseURL) {
          throw new Error(
            `Base URL not configured for OpenAI-compatible provider (${model}). Set baseURL in model config or OPENAI_COMPATIBLE_BASE_URL.`
          )
        }
        const compatProvider = createOpenAICompatible({
          name: (config as any).name || 'openai-compatible',
          apiKey,
          baseURL,
          headers: (config as any).headers,
        })
        baseModel = compatProvider(config.model)
        break
      }
      default:
        throw new Error(`Unsupported provider: ${config.provider}`)
    }

    // Apply AI caching middleware if enabled
    const cacheConfig = simpleConfigManager.get('aiCache') as any
    if (cacheConfig?.enabled !== false) {
      const cacheMiddleware = createAICacheMiddleware(cacheConfig)
      return experimental_wrapLanguageModel({
        model: baseModel,
        middleware: cacheMiddleware,
      })
    }

    return baseModel
  }

  // Claude Code style streaming with tool support
  async *streamChatWithTools(messages: CoreMessage[]): AsyncGenerator<
    {
      type: 'text' | 'tool_call' | 'tool_call_complete' | 'tool_result' | 'finish' | 'reasoning' | 'error' | 'usage'
      content?: string
      toolCall?: any
      toolCallId?: string
      toolResult?: any
      result?: any
      finishReason?: string
      reasoningSummary?: string
      error?: any
      usage?: any
    },
    void,
    unknown
  > {
    const model = this.getModel() as any
    const allTools = this.getFileOperationsTools()
    const reasoningEnabled = this.shouldEnableReasoning()

    // Active Tools Pattern: Select relevant tools based on user's last message
    // Reference: https://ai-sdk.dev/docs/agents - best practices
    const lastUserMessage = messages.slice().reverse().find(m => m.role === 'user')
    const userContent = typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : Array.isArray(lastUserMessage?.content)
        ? lastUserMessage.content.map(p => 'text' in p ? p.text : '').join(' ')
        : ''

    // Select 5 most relevant tools based on message context
    const tools = this.selectActiveTools(userContent, allTools, 5)

    // Yield reasoning summary before streaming if enabled - format as markdown
    if (reasoningEnabled) {
      const config = simpleConfigManager?.getCurrentModel() as any
      if (config) {
        const summary = ReasoningDetector.getModelReasoningSummary(config.provider, config.model)

        // Stream reasoning as markdown blockquote
        const reasoningMarkdown = `> ⚡︎ *${summary}*\n\n`
        await streamttyService.streamChunk(reasoningMarkdown, 'thinking')

        yield {
          type: 'reasoning',
          reasoningSummary: summary,
        }
      }
    }

    try {
      // Quota check for OpenRouter before starting stream
      try {
        const cfg = simpleConfigManager?.getCurrentModel() as any
        if (cfg?.provider === 'openrouter') {
          const { authProvider } = await import('../providers/supabase/auth-provider')
          if (authProvider.isAuthenticated()) {
            const apiQuota = authProvider.checkQuota('apiCalls')
            if (!apiQuota.allowed) {
              throw new Error(`API quota exceeded (${apiQuota.used}/${apiQuota.limit}). Try again later.`)
            }
          }
        }
      } catch (_) { }

      // Track step progress for loop control (AI SDK best practice)
      // Reference: https://ai-sdk.dev/docs/agents/loop-control
      let stepCount = 0
      let totalToolCalls = 0

      // Prepare base options
      const streamOptions: any = {
        model,
        messages,
        tools,
        temperature: 1,
        maxTokens: 4000,
        maxSteps: 10,
        // AI SDK toolChoice: 'auto' (default), 'none', 'required', or { type: 'tool', toolName: 'specific-tool' }
        // 'auto' - model decides whether to use tools
        // 'required' - model must use at least one tool
        // 'none' - model cannot use tools (text only response)
        toolChoice: 'auto',
        // AI SDK Tool Call Repair - automatically fix invalid tool calls
        // Reference: https://v4.ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-call-repair
        experimental_repairToolCall: this.createToolCallRepairHandler(model, tools),
        // AI SDK Agent Loop Control - onStepFinish callback
        // Reference: https://ai-sdk.dev/docs/agents/loop-control
        onStepFinish: (step: {
          stepType: 'initial' | 'continue' | 'tool-result';
          text: string;
          toolCalls: Array<{ toolName: string; args: unknown }>;
          toolResults: Array<{ toolName: string; result: unknown }>;
          usage: { promptTokens: number; completionTokens: number; totalTokens: number };
          finishReason: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other';
          isContinued: boolean;
        }) => {
          stepCount++
          const toolCallsInStep = step.toolCalls?.length || 0
          totalToolCalls += toolCallsInStep

          // Log step progress (dimmed for non-verbose output)
          console.log(require('chalk').dim(
            `[Step ${stepCount}] ${step.stepType} | Tools: ${toolCallsInStep} | Tokens: ${step.usage?.totalTokens || 0} | Reason: ${step.finishReason}`
          ))

          // Log tool results for debugging
          if (step.toolResults?.length > 0 && process.env.DEBUG) {
            for (const result of step.toolResults) {
              console.log(require('chalk').dim(`  ✓ ${result.toolName} completed`))
            }
          }
        },
      }

      // OpenRouter-specific parameters support - dynamic based on model capabilities
      const cfg = simpleConfigManager?.getCurrentModel() as any

      // Override toolChoice from config if specified
      if (cfg?.toolChoice) {
        streamOptions.toolChoice = cfg.toolChoice
      }

      // Parallel tool calls control (default: true)
      // Reference: https://openrouter.ai/docs/guides/features/tool-calling
      const parallelToolCalls = cfg?.parallelToolCalls ?? true
      if (!parallelToolCalls) {
        streamOptions.experimental_toolCallStreaming = false
      }

      if (cfg?.provider === 'openrouter') {
        if (!streamOptions.experimental_providerMetadata) {
          streamOptions.experimental_providerMetadata = {}
        }
        if (!streamOptions.experimental_providerMetadata.openrouter) {
          streamOptions.experimental_providerMetadata.openrouter = {}
        }

        // Parallel tool calls control
        streamOptions.experimental_providerMetadata.openrouter.parallel_tool_calls = parallelToolCalls

        // Fetch model capabilities and build parameters dynamically
        try {
          const modelCaps = await openRouterRegistry.getCapabilities(cfg.model)

          // Only add reasoning if model supports it
          if (reasoningEnabled && (modelCaps.supportsReasoning || modelCaps.supportsIncludeReasoning)) {
            if (modelCaps.supportsIncludeReasoning) {
              streamOptions.experimental_providerMetadata.openrouter.include_reasoning = true
            }
            if (modelCaps.supportsReasoningEffort) {
              streamOptions.experimental_providerMetadata.openrouter.reasoning = {
                effort: 'medium',
                enabled: true,
              }
            }
          }

          // Context-aware transforms (e.g., middle-out for context compression)
          // Auto-enable when prompt exceeds 50% of context window
          const explicitTransforms = cfg.transforms || simpleConfigManager.get('openrouterTransforms')
          const estimatedTokens = JSON.stringify(messages).length / 4 // rough estimate
          const contextWindow = modelCaps.contextLength || 128000
          const contextAwareTransforms = getContextAwareTransforms(estimatedTokens, contextWindow, explicitTransforms)
          if (contextAwareTransforms && contextAwareTransforms.length > 0) {
            streamOptions.experimental_providerMetadata.openrouter.transforms = contextAwareTransforms
          }
        } catch {
          // Fallback: use explicit transforms or auto-enable for large prompts
          const explicitTransforms = cfg.transforms || simpleConfigManager.get('openrouterTransforms')
          const estimatedTokens = JSON.stringify(messages).length / 4
          const contextAwareTransforms = getContextAwareTransforms(estimatedTokens, 128000, explicitTransforms)
          if (contextAwareTransforms && contextAwareTransforms.length > 0) {
            streamOptions.experimental_providerMetadata.openrouter.transforms = contextAwareTransforms
          }
        }
      }

      const result = await streamText(streamOptions)

      // Use fullStream to support all chunk types including reasoning
      try {
        for await (const event of result.fullStream) {
          const eventType = (event as any).type

          switch (eventType) {
            case 'text-delta':
              yield {
                type: 'text',
                content: (event as any).textDelta,
              }
              break
            case 'thinking':
              // Google Gemini thinking (reasoning) chunks
              yield {
                type: 'reasoning',
                content: (event as any).thinking,
              }
              break
            case 'tool-call-delta':
            case 'tool-call-streaming-start':
              yield {
                type: 'tool_call',
                toolCall: (event as any).toolCallId,
                content: (event as any).argsTextDelta,
              }
              break
            case 'tool-call':
              // Complete tool call event
              yield {
                type: 'tool_call_complete',
                toolCall: (event as any).toolCall,
              }
              break
            case 'tool-result':
              // Tool execution result
              yield {
                type: 'tool_result',
                toolCallId: (event as any).toolCallId,
                result: (event as any).result,
              }
              break
            case 'reasoning':
            case 'reasoning-delta':
              // AI SDK reasoning events
              yield {
                type: 'reasoning',
                content: (event as any).textDelta || (event as any).text || (event as any).reasoning,
              }
              break
            case 'error':
              // Stream error event
              yield {
                type: 'error',
                error: (event as any).error,
              }
              break
            case 'finish':
            case 'step-finish':
              // Step completion - can include usage info
              if ((event as any).usage) {
                yield {
                  type: 'usage',
                  usage: (event as any).usage
                  ,
                }
              }
              break
            default:
              // Handle any unknown event types gracefully
              if ((event as any).thinking) {
                yield {
                  type: 'reasoning',
                  content: (event as any).thinking,
                }
              }
              // Log unknown event types for debugging
              if (RETRY_CONFIG.enableLogging && process.env.DEBUG_STREAM) {
                console.log(require('chalk').dim(`[Stream] Unknown event type: ${eventType}`))
              }
              break
          }
        }
      } catch (streamError: any) {
        // Stream recovery: attempt to reconnect or fallback
        const errorMessage = streamError.message?.toLowerCase() || ''

        // Connection errors - could potentially retry
        if (errorMessage.includes('network') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('econnreset') ||
          errorMessage.includes('socket')) {
          yield {
            type: 'error',
            error: {
              code: 'STREAM_CONNECTION_ERROR',
              message: 'Stream connection interrupted',
              recoverable: true,
            },
          }
        }

        // Fallback to textStream if fullStream fails
        if (streamError.message?.includes('fullStream') ||
          streamError.message?.includes('not iterable')) {
          if (RETRY_CONFIG.enableLogging) {
            console.log(require('chalk').dim('[Stream] Falling back to textStream'))
          }
          for await (const delta of result.textStream) {
            yield {
              type: 'text',
              content: delta,
            }
          }
        } else {
          throw streamError
        }
      }

      const finishResult = await result.finishReason
      // Record usage after successful stream
      try {
        const cfg = simpleConfigManager?.getCurrentModel() as any
        if (cfg?.provider === 'openrouter') {
          const { authProvider } = await import('../providers/supabase/auth-provider')
          if (authProvider.isAuthenticated()) {
            await authProvider.recordUsage('apiCalls', 1)
          }
        }
      } catch (_) { }
      yield {
        type: 'finish',
        finishReason: finishResult,
      }
    } catch (error: any) {
      throw new Error(`Stream generation failed: ${error.message}`)
    }
  }

  // Generate complete response with tools
  async generateWithTools(messages: CoreMessage[]): Promise<{
    text: string
    toolCalls: any[]
    toolResults: any[]
    reasoning?: any
    reasoningText?: string
  }> {
    const model = this.getModel() as any
    const allTools = this.getFileOperationsTools()
    const reasoningEnabled = this.shouldEnableReasoning()

    // Active Tools Pattern: Select relevant tools based on user's last message
    const lastUserMessage = messages.slice().reverse().find(m => m.role === 'user')
    const userContent = typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : Array.isArray(lastUserMessage?.content)
        ? lastUserMessage.content.map(p => 'text' in p ? p.text : '').join(' ')
        : ''

    const tools = this.selectActiveTools(userContent, allTools, 5)

    this.logReasoningStatus(reasoningEnabled)

    try {
      // Track step progress for loop control
      let stepCount = 0

      // Prepare base options
      const generateOptions: any = {
        model,
        messages,
        tools,
        maxSteps: 10,
        temperature: 1,
        maxTokens: 4000,
        // AI SDK toolChoice: 'auto' (default), 'none', 'required', or { type: 'tool', toolName: 'specific-tool' }
        toolChoice: 'auto',
        // AI SDK Tool Call Repair - automatically fix invalid tool calls
        experimental_repairToolCall: this.createToolCallRepairHandler(model, tools),
        // AI SDK Agent Loop Control - onStepFinish callback
        onStepFinish: (step: {
          stepType: 'initial' | 'continue' | 'tool-result';
          text: string;
          toolCalls: Array<{ toolName: string; args: unknown }>;
          toolResults: Array<{ toolName: string; result: unknown }>;
          usage: { promptTokens: number; completionTokens: number; totalTokens: number };
          finishReason: string;
        }) => {
          stepCount++
          console.log(require('chalk').dim(
            `[Step ${stepCount}] ${step.stepType} | Tools: ${step.toolCalls?.length || 0} | Tokens: ${step.usage?.totalTokens || 0}`
          ))
        },
      }

      // OpenRouter-specific parameters support - dynamic based on model capabilities
      const cfg = simpleConfigManager?.getCurrentModel() as any

      // Override toolChoice from config if specified
      if (cfg?.toolChoice) {
        generateOptions.toolChoice = cfg.toolChoice
      }

      // Parallel tool calls control (default: true)
      // Reference: https://openrouter.ai/docs/guides/features/tool-calling
      const parallelToolCalls = cfg?.parallelToolCalls ?? true
      if (!parallelToolCalls) {
        // When disabled, tools are called sequentially (useful for dependent operations)
        generateOptions.experimental_toolCallStreaming = false
      }

      if (cfg?.provider === 'openrouter') {
        if (!generateOptions.experimental_providerMetadata) {
          generateOptions.experimental_providerMetadata = {}
        }
        if (!generateOptions.experimental_providerMetadata.openrouter) {
          generateOptions.experimental_providerMetadata.openrouter = {}
        }

        // Parallel tool calls control
        // Reference: https://openrouter.ai/docs/guides/features/tool-calling
        generateOptions.experimental_providerMetadata.openrouter.parallel_tool_calls = parallelToolCalls

        // Fetch model capabilities and build parameters dynamically
        try {
          const modelCaps = await openRouterRegistry.getCapabilities(cfg.model)

          // Only add reasoning parameters if model supports them
          if (reasoningEnabled && (modelCaps.supportsReasoning || modelCaps.supportsIncludeReasoning)) {
            if (modelCaps.supportsIncludeReasoning) {
              generateOptions.experimental_providerMetadata.openrouter.include_reasoning = true
            }
            if (modelCaps.supportsReasoningEffort) {
              generateOptions.experimental_providerMetadata.openrouter.reasoning = {
                effort: 'medium',
                exclude: false,
                enabled: true,
              }
            }
          }

          // Context-aware transforms (auto-enable when prompt exceeds 50% of context window)
          const explicitTransforms = cfg.transforms || simpleConfigManager.get('openrouterTransforms')
          const estimatedTokens = JSON.stringify(messages).length / 4
          const contextWindow = modelCaps.contextLength || 128000
          const contextAwareTransforms = getContextAwareTransforms(estimatedTokens, contextWindow, explicitTransforms)
          if (contextAwareTransforms && contextAwareTransforms.length > 0) {
            generateOptions.experimental_providerMetadata.openrouter.transforms = contextAwareTransforms
          }
        } catch {
          // Fallback to default if registry fails
          if (reasoningEnabled) {
            generateOptions.experimental_providerMetadata.openrouter.reasoning = {
              effort: 'medium',
              exclude: false,
              enabled: true,
            }
          }
          // Fallback: use explicit transforms or auto-enable for large prompts
          const explicitTransforms = cfg.transforms || simpleConfigManager.get('openrouterTransforms')
          const estimatedTokens = JSON.stringify(messages).length / 4
          const contextAwareTransforms = getContextAwareTransforms(estimatedTokens, 128000, explicitTransforms)
          if (contextAwareTransforms && contextAwareTransforms.length > 0) {
            generateOptions.experimental_providerMetadata.openrouter.transforms = contextAwareTransforms
          }
        }
      }

      // Execute with Zero Completion Insurance retry logic
      const result = await this.executeWithRetry(
        () => generateText(generateOptions),
        'generateWithTools'
      )

      // Check for zero completion response after all retries
      if (isZeroCompletionResponse(result)) {
        console.log(require('chalk').yellow(
          '[ZeroCompletion] Protected response - no charges applied'
        ))
      }

      // Extract reasoning if available
      let reasoningData = {}
      if (reasoningEnabled) {
        const config = simpleConfigManager?.getCurrentModel() as any
        if (config) {
          reasoningData = ReasoningDetector.extractReasoning(result, config.provider)
        }
      }

      return {
        text: result.text,
        toolCalls: result.toolCalls || [],
        toolResults: result.toolResults || [],
        ...reasoningData,
      }
    } catch (error: any) {
      throw new Error(`Generation failed: ${error.message}`)
    }
  }

  // Set working directory for file operations
  setWorkingDirectory(directory: string): void {
    this.workingDirectory = resolve(directory)
  }

  // Get current working directory
  getWorkingDirectory(): string {
    return this.workingDirectory
  }

  // Set current model
  setModel(modelName: string): void {
    this.currentModel = modelName
  }

  // Get current model info
  getCurrentModelInfo() {
    const config = simpleConfigManager.get('models')
    return {
      name: this.currentModel,
      config: config || { provider: 'unknown', model: 'unknown' },
    }
  }

  // Get current model name (helper for other modules)
  getCurrentModel(): string {
    return this.currentModel
  }

  // Validate API key for current model
  validateApiKey(): boolean {
    try {
      const apiKey = simpleConfigManager.getApiKey(this.currentModel)
      return !!apiKey
    } catch {
      return false
    }
  }

  // Get reasoning capabilities for current model
  getReasoningCapabilities() {
    const config = simpleConfigManager?.getCurrentModel() as any
    if (!config) {
      return {
        supportsReasoning: false,
        reasoningType: 'none',
        summary: 'No model configuration found',
        enabled: false,
      }
    }

    const capabilities = ReasoningDetector.detectReasoningSupport(config.provider, config.model)
    const summary = ReasoningDetector.getModelReasoningSummary(config.provider, config.model)
    const enabled = this.shouldEnableReasoning()

    return {
      supportsReasoning: capabilities.supportsReasoning,
      reasoningType: capabilities.reasoningType,
      summary,
      enabled,
    }
  }

  // Get list of all reasoning-enabled models
  getReasoningEnabledModels(): string[] {
    return ReasoningDetector.getReasoningEnabledModels()
  }

  /**
   * Enhanced streaming with output style support
   */
  async *streamChatWithStyle(
    messages: CoreMessage[],
    options: AIProviderOptions = {}
  ): AsyncGenerator<{
    type: 'text' | 'tool_call' | 'tool_call_complete' | 'tool_result' | 'finish' | 'reasoning' | 'style_applied' | 'error' | 'usage'
    content?: string
    toolCall?: any
    toolCallId?: string
    toolResult?: any
    result?: any
    finishReason?: string
    reasoningSummary?: string
    outputStyle?: OutputStyle
    error?: any
    usage?: any
  }> {
    // Resolve output style
    const outputStyle = this.resolveOutputStyle(options)

    // Create enhanced messages with output style
    const enhancedMessages = await this.enhanceMessagesWithStyle(messages, outputStyle, options)

    yield {
      type: 'style_applied',
      outputStyle: outputStyle,
    }

    // Continue with normal streaming using enhanced messages
    yield* this.streamChatWithTools(enhancedMessages)
  }

  /**
   * Enhanced generation with output style support
   */
  async generateWithStyle(
    messages: CoreMessage[],
    options: AIProviderOptions = {}
  ): Promise<{
    text: string
    toolCalls: any[]
    toolResults: any[]
    reasoning?: any
    reasoningText?: string
    outputStyle: OutputStyle
    enhancedPrompt?: string
  }> {
    // Resolve output style
    const outputStyle = this.resolveOutputStyle(options)

    // Create enhanced messages with output style
    const enhancedMessages = await this.enhanceMessagesWithStyle(messages, outputStyle, options)

    // Generate response with enhanced messages
    const result = await this.generateWithTools(enhancedMessages)

    return {
      ...result,
      outputStyle,
      enhancedPrompt: typeof enhancedMessages[0]?.content === 'string' ? enhancedMessages[0].content : '',
    }
  }

  /**
   * Resolve output style from options, model config, and defaults
   */
  private resolveOutputStyle(options: AIProviderOptions): OutputStyle {
    // 1. Explicit options override
    if (options.outputStyle) {
      return options.outputStyle
    }

    // 2. Model-specific configuration
    const modelName = options.modelOverride || this.currentModel
    const modelStyle = simpleConfigManager.getModelOutputStyle(modelName)
    if (modelStyle) {
      return modelStyle
    }

    // 3. Context-specific configuration
    if (options.context) {
      const contextStyle = simpleConfigManager.getContextOutputStyle(options.context)
      if (contextStyle) {
        return contextStyle
      }
    }

    // 4. Global configuration
    return simpleConfigManager.getDefaultOutputStyle()
  }

  /**
   * Enhance messages with output style prompts
   */
  private async enhanceMessagesWithStyle(
    messages: CoreMessage[],
    outputStyle: OutputStyle,
    options: AIProviderOptions
  ): Promise<CoreMessage[]> {
    if (messages.length === 0) {
      return messages
    }

    try {
      // Create prompt context
      const promptContext: PromptContext = {
        outputStyle,
        taskType: options.taskType,
        parameters: {
          modelName: options.modelOverride || this.currentModel,
          context: options.context,
        },
      }

      // Load enhanced prompt with output style
      const enhancedContext = await this.promptManager.createEnhancedContext(promptContext, simpleConfigManager)

      // Clone messages and enhance the first system message or create one
      const enhancedMessages = [...messages]
      const firstMessage = enhancedMessages[0]

      if (firstMessage?.role === 'system') {
        // Enhance existing system message
        enhancedMessages[0] = {
          ...firstMessage,
          content: enhancedContext.combinedPrompt || firstMessage.content,
        }
      } else {
        // Add new system message with output style
        enhancedMessages.unshift({
          role: 'system',
          content: enhancedContext.combinedPrompt || enhancedContext.outputStylePrompt || '',
        })
      }

      return enhancedMessages
    } catch (error: any) {
      console.warn(`Failed to enhance messages with output style '${outputStyle}': ${error.message}`)
      return messages
    }
  }

  /**
   * Quick style-aware text generation for simple use cases
   */
  async generateSimpleWithStyle(
    prompt: string,
    outputStyle?: OutputStyle,
    options: Omit<AIProviderOptions, 'outputStyle'> = {}
  ): Promise<string> {
    const messages: CoreMessage[] = [{ role: 'user', content: prompt }]

    const result = await this.generateWithStyle(messages, {
      ...options,
      outputStyle,
    })

    return result.text
  }

  /**
   * Get available output styles
   */
  getAvailableOutputStyles(): OutputStyle[] {
    return this.promptManager.listAvailableOutputStyles()
  }

  /**
   * Get current output style configuration
   */
  getCurrentOutputStyleConfig() {
    return {
      defaultStyle: simpleConfigManager.getDefaultOutputStyle(),
      modelStyle: simpleConfigManager.getModelOutputStyle(this.currentModel),
      availableStyles: this.getAvailableOutputStyles(),
      globalConfig: simpleConfigManager.getOutputStyleConfig(),
    }
  }

  /**
   * Set output style for current model
   */
  setModelOutputStyle(style: OutputStyle): void {
    simpleConfigManager.setModelOutputStyle(this.currentModel, style)
  }

  /**
   * Set default output style
   */
  setDefaultOutputStyle(style: OutputStyle): void {
    simpleConfigManager.setDefaultOutputStyle(style)
  }
}

export const modernAIProvider = new ModernAIProvider()
