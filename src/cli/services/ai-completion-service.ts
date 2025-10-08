import { createHash } from 'node:crypto'
import chalk from 'chalk'
import { z } from 'zod'
import { type ChatMessage, modelProvider } from '../ai/model-provider'
import { workspaceContext } from '../context/workspace-context'
import { completionCache } from '../core/completion-protocol-cache'
import { agentService } from './agent-service'
import { memoryService } from './memory-service'
import { toolService } from './tool-service'

// MemorySearchOptions interface for compatibility
interface MemorySearchOptions {
  limit?: number
  userId?: string
}

// ====================== SCHEMAS ======================

const CompletionContextSchema = z.object({
  partialInput: z.string(),
  currentDirectory: z.string().optional(),
  gitBranch: z.string().optional(),
  openFiles: z.array(z.string()).optional(),
  projectType: z.string().optional(),
  activeAgents: z.array(z.string()).optional(),
  recentCommands: z.array(z.string()).optional(),
  fileContent: z.string().optional(),
  cursorPosition: z.number().optional(),
})

const AICompletionSchema = z.object({
  completion: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  category: z.enum(['command', 'parameter', 'path', 'agent', 'tool', 'code', 'natural']),
  priority: z.number().min(0).max(10),
  requiresApproval: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
})

const CompletionResultSchema = z.object({
  completions: z.array(AICompletionSchema),
  cached: z.boolean().default(false),
  processingTimeMs: z.number(),
  contextUsed: z.object({
    workspaceFiles: z.number(),
    recentCommands: z.number(),
    activeAgents: z.number(),
    lspSuggestions: z.number(),
  }),
})

export type CompletionContext = z.infer<typeof CompletionContextSchema>
export type AICompletion = z.infer<typeof AICompletionSchema>
export type CompletionResult = z.infer<typeof CompletionResultSchema>

// ====================== AI COMPLETION SERVICE ======================

export class AICompletionService {
  private cache = new Map<string, { result: CompletionResult; timestamp: number }>()
  private readonly cacheExpiryMs = 5 * 60 * 1000 // 5 minutes
  private readonly maxCacheSize = 100
  private readonly completionTimeout = 3000 // 3 seconds max for AI completion

  constructor() {
    // Clear expired cache entries periodically
    setInterval(() => this.cleanCache(), 60 * 1000) // Every minute
  }

  /**
   * Generate AI-powered completions with context awareness
   */
  async generateCompletions(context: CompletionContext): Promise<CompletionResult> {
    const startTime = Date.now()
    const cacheKey = this.getCacheKey(context)

    // 1) Check in-memory cache first
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      return { ...cached, cached: true }
    }

    // 2) Check completion protocol cache
    try {
      const { config } = modelProvider.getCurrentModelInfo()
      const protocolHit = await completionCache.getCompletion({
        prefix: context.partialInput,
        context: JSON.stringify({
          dir: context.currentDirectory,
          project: context.projectType,
          files: context.openFiles,
          agents: context.activeAgents,
        }),
        maxTokens: 200,
        temperature: 0,
        model: `${config.provider}:${config.model}`,
      })

      if (protocolHit && protocolHit.completion) {
        const result: CompletionResult = {
          completions: [
            {
              completion: protocolHit.completion,
              confidence: protocolHit.confidence ?? 0.9,
              reasoning: protocolHit.exactMatch ? 'protocol exact match' : 'protocol cache match',
              category: 'natural',
              priority: 8,
              requiresApproval: false,
            },
          ],
          cached: true,
          processingTimeMs: Date.now() - startTime,
          contextUsed: {
            workspaceFiles: 0,
            recentCommands: 0,
            activeAgents: context.activeAgents?.length || 0,
            lspSuggestions: 0,
          },
        }
        // Also seed in-memory cache
        this.setCache(cacheKey, result)
        return result
      }
    } catch (_e) {
      // Silent failure for protocol cache
    }

    try {
      // Gather contextual information
      const enrichedContext = await this.enrichContext(context)

      // Generate completions with timeout
      const completions = await Promise.race([
        this.generateAICompletions(enrichedContext),
        this.timeoutPromise<AICompletion[]>(this.completionTimeout, []),
      ])

      const result: CompletionResult = {
        completions,
        cached: false,
        processingTimeMs: Date.now() - startTime,
        contextUsed: {
          workspaceFiles: enrichedContext.workspaceFiles?.length || 0,
          recentCommands: enrichedContext.recentCommands?.length || 0,
          activeAgents: enrichedContext.activeAgents?.length || 0,
          lspSuggestions: enrichedContext.lspSuggestions?.length || 0,
        },
      }

      // Cache the result (in-memory)
      this.setCache(cacheKey, result)

      // Store top suggestion into completion protocol cache for future reuse
      try {
        const top = result.completions[0]
        if (top) {
          const { config } = modelProvider.getCurrentModelInfo()
          await completionCache.storeCompletion(
            {
              prefix: context.partialInput,
              context: JSON.stringify({
                dir: context.currentDirectory,
                project: context.projectType,
                files: context.openFiles,
                agents: context.activeAgents,
              }),
              maxTokens: 200,
              temperature: 0,
              model: `${config.provider}:${config.model}`,
            },
            top.completion
          )
        }
      } catch (_e) {
        // Silent store failure
      }

      return result
    } catch (error) {
      console.warn(chalk.yellow(`[AI Completion] Error: ${error}`))
      return {
        completions: [],
        cached: false,
        processingTimeMs: Date.now() - startTime,
        contextUsed: {
          workspaceFiles: 0,
          recentCommands: 0,
          activeAgents: 0,
          lspSuggestions: 0,
        },
      }
    }
  }

  /**
   * Enrich context with workspace, LSP, and system information
   */
  private async enrichContext(context: CompletionContext): Promise<any> {
    const enriched: any = { ...context }

    // Add workspace context
    try {
      const contextData = workspaceContext.getContextForAgent('completion', 20)
      enriched.projectType = contextData.projectSummary.includes('React')
        ? 'web'
        : contextData.projectSummary.includes('Python')
          ? 'python'
          : contextData.projectSummary.includes('Node')
            ? 'web'
            : 'general'
      enriched.workspaceFiles = contextData.relevantFiles.map((f) => f.path).slice(0, 50)
    } catch (_error) {
      // Fallback if workspace not initialized
      enriched.projectType = 'general'
      enriched.workspaceFiles = []
    }

    // Add active agents
    enriched.activeAgents = agentService.getActiveAgents().map((a) => a.id)

    // Add available tools
    enriched.availableTools = toolService
      .getAvailableTools()
      .map((t) => t.name)
      .slice(0, 20)

    // Add recent commands from memory
    try {
      const searchOptions: MemorySearchOptions = { limit: 10 }
      const recentMemory = await memoryService.searchMemories('command', searchOptions)
      enriched.recentCommands = recentMemory.map((m) => (m as any).memory?.text || m.toString()).slice(0, 10)
    } catch (_error) {
      enriched.recentCommands = []
    }

    // Add current file context if available
    if (context.openFiles && context.openFiles.length > 0) {
      try {
        const contextData = workspaceContext.getContextForAgent('completion', 5)
        const currentFileData = contextData.relevantFiles.find((f) => context.openFiles?.includes(f.path))
        if (currentFileData) {
          enriched.currentFileContext = {
            language: currentFileData.language,
            functions: currentFileData.functions || [],
            classes: currentFileData.classes || [],
            imports: currentFileData.dependencies || [],
          }
        }
      } catch (_error) {
        // Fallback - no file context
      }
    }

    return enriched
  }

  /**
   * Generate AI completions using the model provider
   */
  private async generateAICompletions(enrichedContext: any): Promise<AICompletion[]> {
    const systemPrompt = this.buildSystemPrompt(enrichedContext)
    const userPrompt = this.buildUserPrompt(enrichedContext)

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    try {
      const response = await modelProvider.generateResponse({
        messages,
        temperature: 0.1, // Low temperature for consistent completions
        maxTokens: 4000,
        scope: 'tool_light', // Use lightweight model for completions
      })

      return this.parseAIResponse(response, enrichedContext)
    } catch (error: any) {
      let errorMsg = error.message || 'Unknown error'
      // Handle OpenRouter-specific errors
      if (errorMsg.includes('OpenRouter') || errorMsg.includes('402') || errorMsg.includes('429')) {
        if (errorMsg.includes('402')) {
          errorMsg = 'OpenRouter: Insufficient credits. Please check your account balance.'
        } else if (errorMsg.includes('429')) {
          errorMsg = 'OpenRouter: Rate limit exceeded. Retrying may help.'
        }
        console.warn(chalk.yellow(`[AI Completion] OpenRouter error: ${errorMsg}`))
      } else {
        console.warn(chalk.yellow(`[AI Completion] Model error: ${errorMsg}`))
      }
      return []
    }
  }

  /**
   * Build system prompt for AI completions
   */
  private buildSystemPrompt(context: any): string {
    return `You are an intelligent code completion assistant for NikCLI, a professional AI development tool.

CONTEXT:
- Project Type: ${context.projectType || 'Unknown'}
- Current Directory: ${context.currentDirectory || process.cwd()}
- Active Agents: ${context.activeAgents?.join(', ') || 'None'}
- Available Tools: ${context.availableTools?.slice(0, 10).join(', ') || 'Standard tools'}

COMPLETION RULES:
1. Provide intelligent, context-aware completions
2. Prioritize relevant commands, paths, and parameters
3. Consider project type and current working context
4. Suggest agent commands (@agent-name) when appropriate
5. Include tool parameters and file paths when relevant
6. Return only practical, executable suggestions

RESPONSE FORMAT (JSON):
{
  "completions": [
    {
      "completion": "suggested_completion",
      "confidence": 0.85,
      "reasoning": "why this completion is relevant",
      "category": "command|parameter|path|agent|tool|code|natural",
      "priority": 8,
      "requiresApproval": false
    }
  ]
}

Provide 3-8 most relevant completions, ranked by relevance and confidence.`
  }

  /**
   * Build user prompt with current context
   */
  private buildUserPrompt(context: any): string {
    let prompt = `Complete this input: "${context.partialInput}"`

    if (context.recentCommands?.length > 0) {
      prompt += `\n\nRecent commands: ${context.recentCommands.slice(0, 5).join(', ')}`
    }

    if (context.currentFileContext) {
      prompt += `\n\nCurrent file context:`
      prompt += `\n- Language: ${context.currentFileContext.language}`
      if (context.currentFileContext.functions?.length > 0) {
        prompt += `\n- Functions: ${context.currentFileContext.functions.slice(0, 5).join(', ')}`
      }
    }

    if (context.workspaceFiles?.length > 0) {
      prompt += `\n\nWorkspace files: ${context.workspaceFiles.slice(0, 10).join(', ')}`
    }

    return prompt
  }

  /**
   * Parse AI response into structured completions
   */
  private parseAIResponse(response: string, context: any): AICompletion[] {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }

      const parsed = JSON.parse(jsonMatch[0])
      const completions = parsed.completions || []

      return completions
        .map((comp: any) => {
          // Validate and enhance completion
          const completion: AICompletion = {
            completion: comp.completion || '',
            confidence: Math.min(Math.max(comp.confidence || 0.5, 0), 1),
            reasoning: comp.reasoning || 'AI suggestion',
            category: this.validateCategory(comp.category) || 'natural',
            priority: Math.min(Math.max(comp.priority || 5, 0), 10),
            requiresApproval: this.shouldRequireApproval(comp.completion),
            metadata: comp.metadata || {},
          }

          return completion
        })
        .filter(
          (comp: AICompletion) =>
            comp.completion && comp.completion.trim() !== context.partialInput && comp.completion.length > 0
        )
    } catch (error) {
      console.warn(chalk.yellow(`[AI Completion] Parse error: ${error}`))
      return []
    }
  }

  /**
   * Validate completion category
   */
  private validateCategory(
    category: string
  ): 'command' | 'parameter' | 'path' | 'agent' | 'tool' | 'code' | 'natural' | null {
    const validCategories: Array<'command' | 'parameter' | 'path' | 'agent' | 'tool' | 'code' | 'natural'> = [
      'command',
      'parameter',
      'path',
      'agent',
      'tool',
      'code',
      'natural',
    ]
    return validCategories.includes(category as any) ? (category as any) : null
  }

  /**
   * Check if completion requires approval
   */
  private shouldRequireApproval(completion: string): boolean {
    const dangerousPatterns = [/^rm\s/, /^delete\s/, /^drop\s/, /^truncate\s/, /^kill\s/, /^sudo\s/, /^chmod\s.*777/]
    return dangerousPatterns.some((pattern) => pattern.test(completion.toLowerCase()))
  }

  /**
   * Create timeout promise
   */
  private timeoutPromise<T>(ms: number, fallback: T): Promise<T> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(fallback), ms)
    })
  }

  // ====================== CACHE MANAGEMENT ======================

  private getCacheKey(context: CompletionContext): string {
    const keyData = {
      input: context.partialInput,
      dir: context.currentDirectory,
      project: context.projectType,
      agents: context.activeAgents?.sort().join(','),
      files: context.openFiles?.sort().join(','),
    }
    return createHash('sha256').update(JSON.stringify(keyData)).digest('hex').substring(0, 16)
  }

  private getFromCache(key: string): CompletionResult | null {
    const cached = this.cache.get(key)
    if (!cached) return null

    if (Date.now() - cached.timestamp > this.cacheExpiryMs) {
      this.cache.delete(key)
      return null
    }

    return cached.result
  }

  private setCache(key: string, result: CompletionResult): void {
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = Array.from(this.cache.keys())[0]
      this.cache.delete(oldestKey)
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    })
  }

  private cleanCache(): void {
    const now = Date.now()
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.cacheExpiryMs) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: 0, // Would track this with actual usage
      avgResponseTime: 0, // Would track this with actual usage
    }
  }

  /**
   * Clear completion cache
   */
  public clearCache(): void {
    this.cache.clear()
  }
}

export const aiCompletionService = new AICompletionService()
