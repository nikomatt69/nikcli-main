/**
 * AI-Enhanced LSP Manager
 * Provides AI-powered LSP features with predictive caching and smart completion
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import chalk from 'chalk'
import { aiCompletionService } from '../services/ai-completion-service'
import { detectLanguageFromExtension } from './language-detection'
import type { LSPClient, LSPCompletionItem, LSPDiagnostic, LSPSymbol } from './lsp-client'
import { lspManager } from './lsp-manager'

export interface AICompletionContext {
  file: string
  position: { line: number; character: number }
  surroundingCode: string
  projectContext: ProjectContext
  userHistory: CompletionHistory
  aiPredictions: AIPrediction[]
  lspSuggestions: LSPCompletionItem[]
}

export interface ProjectContext {
  workspaceFiles: number
  recentCommands: number
  activeAgents: number
  lspSuggestions: number
}

export interface CompletionHistory {
  recentCompletions: CompletionEntry[]
  userPreferences: UserPreferences
  frequentlyUsedSymbols: string[]
}

export interface CompletionEntry {
  completion: string
  timestamp: Date
  confidence: number
  accepted: boolean
}

export interface UserPreferences {
  preferredLanguages: string[]
  completionStyle: 'minimal' | 'detailed' | 'ai-enhanced'
  autoAcceptThreshold: number
  frequentlyUsedSymbols: string[]
  recentCompletions: CompletionEntry[]
}

export interface AIPrediction {
  type: 'completion' | 'refactor' | 'import' | 'symbol'
  prediction: string
  confidence: number
  context: string
}

export interface PredictiveCache {
  get(key: string): any
  set(key: string, value: any, ttlMs?: number): void
  delete(key: string): void
  clear(): void
  size(): number
}

interface CacheEntry {
  value: any
  timestamp: number
  ttl: number
}

class SimplePredictiveCache implements PredictiveCache {
  private cache = new Map<string, CacheEntry>()
  private maxSize = 1000
  private defaultTTL = 300000 // 5 minutes

  get(key: string): any {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return undefined
    }

    return entry.value
  }

  set(key: string, value: any, ttlMs?: number): void {
    const entry: CacheEntry = {
      value,
      timestamp: Date.now(),
      ttl: ttlMs || this.defaultTTL,
    }

    this.cache.set(key, entry)

    // Cleanup if cache is too large
    if (this.cache.size > this.maxSize) {
      this.cleanup()
    }
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }

  private cleanup(): void {
    // Remove expired entries first
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
      }
    }

    // If still too large, remove oldest entries
    if (this.cache.size > this.maxSize) {
      const entries = Array.from(this.cache.entries())
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp)

      const toRemove = entries.slice(0, this.cache.size - this.maxSize + 100)
      toRemove.forEach(([key]) => this.cache.delete(key))
    }
  }
}

export class AIEnhancedLSPManager {
  private completionCache: PredictiveCache
  private userPreferences: UserPreferences
  private projectContext: ProjectContext
  private lspClients: Map<string, LSPClient> = new Map()

  constructor() {
    this.completionCache = new SimplePredictiveCache()
    this.userPreferences = this.loadUserPreferences()
    this.projectContext = {
      workspaceFiles: 0,
      recentCommands: 0,
      activeAgents: 0,
      lspSuggestions: 0,
    }
  }

  /**
   * Get AI-enhanced completions
   */
  async getAIEnhancedCompletions(context: AICompletionContext): Promise<LSPCompletionItem[]> {
    try {
      // Get base LSP completions
      const lspCompletions = await this.getLSPCompletions(context)

      // Get AI completions
      const aiCompletions = await this.getAICompletions(context)

      // Merge and rank
      const allCompletions = [...lspCompletions, ...aiCompletions]
      const rankedCompletions = await this.rankCompletions(allCompletions, context)

      // Cache results
      this.cacheCompletion(context, rankedCompletions)

      return rankedCompletions
    } catch (error) {
      console.warn(chalk.yellow('AI-enhanced LSP completion failed:', error))
      return []
    }
  }

  /**
   * Get LSP completions
   */
  private async getLSPCompletions(context: AICompletionContext): Promise<LSPCompletionItem[]> {
    try {
      const clients = await this.getClientsForFile(context.file)
      const allCompletions: LSPCompletionItem[] = []

      for (const client of clients) {
        try {
          if (!client.isFileOpen(context.file)) {
            await client.openFile(context.file)
          }

          const completions = await client.getCompletion(
            context.file,
            context.position.line,
            context.position.character
          )

          // Enhance with context
          const enhancedCompletions = completions.map((comp) => ({
            ...comp,
            // Add AI enhancement metadata
            data: {
              aiEnhanced: true,
              contextRelevance: this.calculateContextRelevance(comp, context),
              userPreference: this.calculateUserPreference(comp),
              predictionType: this.inferPredictionType(comp),
            },
          }))

          allCompletions.push(...enhancedCompletions)
        } catch (error) {
          console.warn(chalk.yellow(`LSP completion failed for ${context.file}:`, error))
        }
      }

      return allCompletions
    } catch (error) {
      console.warn(chalk.yellow(`Failed to get LSP clients for ${context.file}:`, error))
      return []
    }
  }

  /**
   * Get AI completions
   */
  private async getAICompletions(context: AICompletionContext): Promise<LSPCompletionItem[]> {
    try {
      const prompt = this.buildAICompletionPrompt(context)

      const response = await aiCompletionService.generateCompletions({
        partialInput: prompt,
        currentDirectory: dirname(context.file),
        projectType: detectLanguageFromExtension(context.file),
      })

      if (!response.completions || response.completions.length === 0) {
        return []
      }

      return response.completions.map((comp, index) => ({
        label: comp.completion || '',
        kind: 15, // Text
        detail: (comp as any).detail || '',
        documentation: (comp as any).documentation || '',
        insertText: (comp as any).insertText || '',
        sortText: (comp as any).sortText || '',
        filterText: (comp as any).filterText || '',
        data: {
          // AI enhancement metadata
          aiEnhanced: true,
          contextRelevance: this.calculateContextRelevance(comp as any, context),
          userPreference: this.calculateUserPreference(comp as any),
          predictionType: this.inferPredictionType(comp as any),
        },
      }))
    } catch (error) {
      console.warn(chalk.yellow('AI completion failed:', error))
      return []
    }
  }

  /**
   * Build AI completion prompt
   */
  private buildAICompletionPrompt(context: AICompletionContext): string {
    const surroundingLines = this.getSurroundingLines(context.surroundingCode, context.position.line, 5)

    return `Provide intelligent code completions for this context:

File: ${context.file}
Position: Line ${context.position.line + 1}, Column ${context.position.character + 1}

Surrounding code:
${surroundingLines.join('\n')}

Recent commands: ${context.userHistory.recentCompletions
      .slice(-5)
      .map((c) => c.completion)
      .join(', ')}
Active agents: ${context.projectContext.activeAgents}
LSP suggestions: ${context.projectContext.lspSuggestions}

User preferences:
- Preferred languages: ${this.userPreferences.preferredLanguages.join(', ')}
- Completion style: ${this.userPreferences.completionStyle}
- Frequently used symbols: ${this.userPreferences.frequentlyUsedSymbols.join(', ')}

Focus on:
1. Semantic accuracy
2. Context relevance
3. User preferences
4. Code style consistency

Return JSON format:
{
  "completions": [
    {
      "label": "completion text",
      "kind": 15,
      "detail": "detailed description",
      "documentation": "documentation text",
      "insertText": "code to insert",
      "sortText": "sort order",
      "filterText": "filter text",
      "data": {
        "aiEnhanced": true,
        "contextRelevance": 0.8,
        "userPreference": 0.7,
        "predictionType": "completion",
        "confidence": 0.9
      }
    }
  ]
}`
  }

  /**
   * Get clients for file
   */
  private async getClientsForFile(filePath: string): Promise<LSPClient[]> {
    const absolutePath = resolve(filePath)

    try {
      const clients = await lspManager.getClientsForFile(absolutePath)

      // Cache clients
      for (const client of clients) {
        this.lspClients.set(`${absolutePath}:${client.getServerInfo().name}`, client)
      }

      return clients
    } catch (error) {
      console.warn(chalk.yellow(`Failed to get LSP clients for ${filePath}:`, error))
      return []
    }
  }

  /**
   * Get surrounding lines
   */
  private getSurroundingLines(code: string, currentLine: number, count: number): string[] {
    const lines = code.split('\n')
    const startLine = Math.max(0, currentLine - count)
    const endLine = Math.min(lines.length - 1, currentLine + count)

    return lines.slice(startLine, endLine + 1)
  }

  /**
   * Calculate context relevance
   */
  private calculateContextRelevance(completion: LSPCompletionItem, context: AICompletionContext): number {
    let relevance = 0.5 // Base relevance

    // Boost for matching surrounding code
    if (completion.insertText && context.surroundingCode.includes(completion.insertText)) {
      relevance += 0.3
    }

    // Boost for user preferences
    const userPref = this.calculateUserPreference(completion)
    relevance += userPref * 0.2

    // Boost for AI-generated completions
    if ((completion as any).data?.aiEnhanced) {
      relevance += 0.2
    }

    return Math.min(1.0, relevance)
  }

  /**
   * Calculate user preference
   */
  private calculateUserPreference(completion: LSPCompletionItem): number {
    const label = completion.label || completion.insertText || ''

    // Check if completion matches frequently used symbols
    if (this.userPreferences.frequentlyUsedSymbols.some((symbol) => label.includes(symbol))) {
      return 0.8
    }

    // Check if completion matches preferred languages
    const language = detectLanguageFromExtension((completion as any).data?.file || '')
    if (this.userPreferences.preferredLanguages.includes(language)) {
      return 0.6
    }

    return 0.5
  }

  /**
   * Infer prediction type
   */
  private inferPredictionType(completion: LSPCompletionItem): AIPrediction['type'] {
    const label = completion.label || completion.insertText || ''

    if (label.includes('(') && label.includes(')')) {
      return 'refactor'
    }

    if (label.includes('import') || label.includes('from')) {
      return 'import'
    }

    if (label.includes('function') || label.includes('class')) {
      return 'symbol'
    }

    return 'completion'
  }

  /**
   * Rank completions
   */
  private async rankCompletions(
    completions: LSPCompletionItem[],
    context: AICompletionContext
  ): Promise<LSPCompletionItem[]> {
    return completions.sort((a, b) => {
      const aScore = this.calculateCompletionScore(a, context)
      const bScore = this.calculateCompletionScore(b, context)
      return bScore - aScore
    })
  }

  /**
   * Calculate completion score
   */
  private calculateCompletionScore(completion: LSPCompletionItem, context: AICompletionContext): number {
    let score = 0

    // Base score from kind
    score += this.getKindScore(completion.kind || 15)

    // Context relevance
    score += this.calculateContextRelevance(completion, context) * 0.3

    // User preference
    score += this.calculateUserPreference(completion) * 0.2

    // AI enhancement bonus
    if ((completion as any).data?.aiEnhanced) {
      score += 0.1
    }

    return score
  }

  /**
   * Get kind score
   */
  private getKindScore(kind: number): number {
    const kindScores: Record<number, number> = {
      1: 0.9, // Text
      2: 0.8, // Method
      3: 0.8, // Function
      4: 0.7, // Constructor
      5: 0.6, // Field
      6: 0.6, // Variable
      7: 0.7, // Class
      8: 0.7, // Interface
      9: 0.6, // Module
      10: 0.5, // Property
      11: 0.6, // Unit
      12: 0.5, // Value
      13: 0.4, // Enum
      14: 0.4, // Keyword
      15: 0.3, // Snippet
      16: 0.5, // Color
      17: 0.5, // File
      18: 0.4, // Reference
      19: 0.3, // Folder
      20: 0.2, // EnumMember
      21: 0.2, // Constant
      22: 0.2, // Struct
      23: 0.2, // Event
      24: 0.2, // Operator
      25: 0.1, // TypeParameter
    }

    return kindScores[kind] || 0.1
  }

  /**
   * Cache completion
   */
  private cacheCompletion(context: AICompletionContext, completions: LSPCompletionItem[]): void {
    const cacheKey = this.getCacheKey(context)
    this.completionCache.set(cacheKey, {
      completions,
      timestamp: Date.now(),
      context: {
        file: context.file,
        position: context.position,
        surroundingHash: this.hashSurroundingCode(context.surroundingCode),
      },
      ttlMs: 300000, // 5 minutes
    })
  }

  /**
   * Get cache key
   */
  private getCacheKey(context: AICompletionContext): string {
    return `${context.file}:${context.position.line}:${context.position.character}:${this.hashSurroundingCode(context.surroundingCode)}`
  }

  /**
   * Hash surrounding code
   */
  private hashSurroundingCode(code: string): string {
    // Simple hash function (can be enhanced)
    let hash = 0
    for (let i = 0; i < code.length; i++) {
      hash = (hash << 5) - hash + code.charCodeAt(i)
      hash = hash & hash
    }
    return hash.toString(36)
  }

  /**
   * Load user preferences
   */
  private loadUserPreferences(): UserPreferences {
    try {
      // In a real implementation, this would load from a config file
      return {
        preferredLanguages: ['typescript', 'javascript', 'python'],
        completionStyle: 'ai-enhanced',
        autoAcceptThreshold: 0.8,
        frequentlyUsedSymbols: [],
        recentCompletions: [],
      }
    } catch (error) {
      console.warn(chalk.yellow('Failed to load user preferences:', error))
      return {
        preferredLanguages: ['typescript', 'javascript', 'python'],
        completionStyle: 'ai-enhanced',
        autoAcceptThreshold: 0.8,
        frequentlyUsedSymbols: [],
        recentCompletions: [],
      }
    }
  }

  /**
   * Update project context
   */
  updateProjectContext(
    workspaceFiles: number,
    recentCommands: number,
    activeAgents: number,
    lspSuggestions: number
  ): void {
    this.projectContext = {
      workspaceFiles,
      recentCommands,
      activeAgents,
      lspSuggestions,
    }
  }

  /**
   * Update user preferences
   */
  updateUserPreferences(preferences: Partial<UserPreferences>): void {
    this.userPreferences = {
      preferredLanguages: [...this.userPreferences.preferredLanguages, ...(preferences.preferredLanguages || [])],
      completionStyle: preferences.completionStyle || this.userPreferences.completionStyle,
      autoAcceptThreshold: preferences.autoAcceptThreshold || this.userPreferences.autoAcceptThreshold,
      frequentlyUsedSymbols: [
        ...this.userPreferences.frequentlyUsedSymbols,
        ...(preferences.frequentlyUsedSymbols || []),
      ],
      recentCompletions: [...this.userPreferences.recentCompletions, ...(preferences.recentCompletions || [])],
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): any {
    return {
      cacheSize: this.completionCache.size(),
      activeClients: this.lspClients.size,
      cacheHitRate: this.calculateCacheHitRate(),
      averageResponseTime: this.calculateAverageResponseTime(),
    }
  }

  /**
   * Calculate cache hit rate
   */
  private calculateCacheHitRate(): number {
    // In a real implementation, this would track cache hits/misses
    return 0.85 // Placeholder
  }

  /**
   * Calculate average response time
   */
  private calculateAverageResponseTime(): number {
    // In a real implementation, this would track response times
    return 120 // Placeholder (ms)
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.completionCache.clear()
    console.log(chalk.blue('✓ AI completion cache cleared'))
  }
}

// Export singleton instance
export const aiEnhancedLSPManager = new AIEnhancedLSPManager()
