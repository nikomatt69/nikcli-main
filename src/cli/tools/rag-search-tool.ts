import { PromptManager } from '../prompts/prompt-manager'
import { advancedUI } from '../ui/advanced-cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { unifiedRAGSystem, type RAGSearchResult } from '../context/rag-system'

export interface RAGSearchParams {
  query: string
  limit?: number
  semanticOnly?: boolean
  threshold?: number
  includeAnalysis?: boolean
  workingDirectory?: string
}

export interface RAGSearchFileResult {
  path: string
  content: string
  score: number
  metadata: {
    chunkIndex?: number
    totalChunks?: number
    fileType: string
    importance: number
    lastModified: Date
    source: 'vector' | 'workspace' | 'hybrid'
    truncated?: boolean
    originalLength?: number
    truncatedLength?: number
    cached?: boolean
    semanticBreakdown?: {
      semanticScore: number
      keywordScore: number
      contextScore: number
      recencyScore: number
      importanceScore: number
      diversityScore: number
    }
    relevanceFactors?: string[]
    queryIntent?: string
    queryConfidence?: number
    hash?: string
    language?: string
  }
}

export interface RAGSearchToolResult {
  query: string
  totalFound: number
  results: RAGSearchFileResult[]
  searchMode: 'semantic' | 'hybrid' | 'traditional'
  searchMetrics?: {
    executionTime: number
    queryOptimized: boolean
    sourcesUsed: string[]
  }
  summary: string
}

export class RAGSearchTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('rag-search-tool', workingDirectory)
  }

  getMetadata(): any {
    return {
      id: 'rag_search',
      name: 'rag_search',
      description: 'Perform semantic search in the RAG system to find relevant code and documentation',
      version: '0.1.0',
      category: 'search',
      author: 'system',
      tags: ['rag', 'semantic', 'search', 'code', 'documentation'],
      capabilities: ['semantic-search', 'code-search', 'documentation-search'],
      requiredCapabilities: [],
      dependencies: [],
      permissions: {
        canReadFiles: true,
        canWriteFiles: false,
        canDeleteFiles: false,
        canExecuteCommands: false,
        allowedPaths: [],
        forbiddenPaths: [],
        allowedCommands: [],
        forbiddenCommands: [],
        canAccessNetwork: false,
        maxExecutionTime: 30000,
        maxMemoryUsage: 256 * 1024 * 1024,
        requiresApproval: false,
      },
      inputSchema: {},
      outputSchema: {},
      examples: [],
      isBuiltIn: true,
      isEnabled: true,
      priority: 70,
      loadOrder: 0,
    }
  }

  async execute(params: RAGSearchParams): Promise<ToolExecutionResult> {
    const startTime = Date.now()
    try {
      const promptManager = PromptManager.getInstance()
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'rag-search-tool',
        parameters: params,
      })
      advancedUI.logInfo(`Using system prompt: ${systemPrompt.substring(0, 100)}...`)

      const {
        query,
        limit = 10,
        semanticOnly = false,
        threshold = 0.3,
        includeAnalysis = false,
        workingDirectory,
      } = params

      if (!query || query.trim().length === 0) {
        return {
          success: false,
          error: 'Query is required',
          data: null,
          metadata: { executionTime: Date.now() - startTime, toolName: this.getName(), parameters: params },
        }
      }

      // Ensure RAG system is initialized
      await unifiedRAGSystem.ensureInitialized()

      // Perform semantic search
      let searchResults: RAGSearchResult[] = []
      const searchMode = semanticOnly ? 'semantic' : 'hybrid'

      try {
        if (semanticOnly) {
          searchResults = await unifiedRAGSystem.searchSemantic(query, {
            limit,
            threshold,
            includeAnalysis,
          })
        } else {
          searchResults = await unifiedRAGSystem.search(query, {
            limit,
            includeContent: true,
            semanticOnly: false,
            workingDirectory: workingDirectory || this.getWorkingDirectory(),
          })
        }
      } catch (error: any) {
        advancedUI.logError(`RAG search failed: ${error.message}`)
        // Fallback to basic search
        searchResults = await unifiedRAGSystem.search(query, {
          limit,
          includeContent: true,
          semanticOnly: false,
        })
      }

      // Filter by threshold if semantic search
      if (semanticOnly || searchMode === 'semantic') {
        searchResults = searchResults.filter((r) => r.score >= threshold)
      }

      // Transform results to tool format
      const results: RAGSearchFileResult[] = searchResults.map((result) => ({
        path: result.path,
        content: result.content,
        score: result.score,
        metadata: {
          chunkIndex: result.metadata.chunkIndex,
          totalChunks: result.metadata.totalChunks,
          fileType: result.metadata.fileType,
          importance: result.metadata.importance,
          lastModified: result.metadata.lastModified,
          source: result.metadata.source,
          truncated: result.metadata.truncated,
          originalLength: result.metadata.originalLength,
          truncatedLength: result.metadata.truncatedLength,
          cached: result.metadata.cached,
          semanticBreakdown: result.metadata.semanticBreakdown,
          relevanceFactors: result.metadata.relevanceFactors,
          queryIntent: result.metadata.queryIntent,
          queryConfidence: result.metadata.queryConfidence,
          hash: result.metadata.hash,
          language: result.metadata.language,
        },
      }))

      // Generate summary
      const executionTime = Date.now() - startTime
      const sourcesUsed = Array.from(
        new Set(results.map((r) => r.metadata.source).filter((s): s is string => !!s))
      )

      const summary = this.generateSummary(query, results, searchMode, executionTime, sourcesUsed)

      const data: RAGSearchToolResult = {
        query,
        totalFound: results.length,
        results,
        searchMode,
        searchMetrics: {
          executionTime,
          queryOptimized: false, // Could be enhanced with actual optimization tracking
          sourcesUsed,
        },
        summary,
      }

      advancedUI.logSuccess(
        `🔍 RAG search found ${results.length} result${results.length !== 1 ? 's' : ''} for "${query}" (${executionTime}ms)`
      )

      return {
        success: true,
        data,
        metadata: { executionTime, toolName: this.getName(), parameters: params },
      }
    } catch (error: any) {
      advancedUI.logError(`RAG search tool failed: ${error.message}`)
      return {
        success: false,
        error: error.message,
        data: null,
        metadata: { executionTime: Date.now() - startTime, toolName: this.getName(), parameters: params },
      }
    }
  }

  private generateSummary(
    query: string,
    results: RAGSearchFileResult[],
    searchMode: string,
    executionTime: number,
    sourcesUsed: string[]
  ): string {
    let summary = `🔍 RAG Semantic Search Results\n\n`
    summary += `**Query:** "${query}"\n`
    summary += `**Mode:** ${searchMode}\n`
    summary += `**Found:** ${results.length} result${results.length !== 1 ? 's' : ''}\n`
    summary += `**Execution Time:** ${executionTime}ms\n`
    summary += `**Sources:** ${sourcesUsed.join(', ') || 'none'}\n\n`

    if (results.length === 0) {
      summary += `❌ No results found for "${query}"\n\n`
      summary += `**Suggestions:**\n`
      summary += `- Try different keywords or a more general query\n`
      summary += `- Check if the codebase has been indexed\n`
      summary += `- Use hybrid mode instead of semantic-only for broader results\n`
      summary += `- Lower the similarity threshold if using semantic search`
      return summary
    }

    // Top result details
    const topResult = results[0]
    const scorePercent = Math.round(topResult.score * 100)

    summary += `**Top Result (${scorePercent}% relevance):**\n`
    summary += `- **File:** ${topResult.path}\n`
    summary += `- **Type:** ${topResult.metadata.fileType}\n`
    summary += `- **Source:** ${topResult.metadata.source}\n`

    if (topResult.metadata.semanticBreakdown) {
      const breakdown = topResult.metadata.semanticBreakdown
      summary += `- **Semantic Score:** ${Math.round(breakdown.semanticScore * 100)}%\n`
      summary += `- **Keyword Score:** ${Math.round(breakdown.keywordScore * 100)}%\n`
      summary += `- **Context Score:** ${Math.round(breakdown.contextScore * 100)}%\n`
    }

    if (topResult.metadata.queryIntent) {
      summary += `- **Query Intent:** ${topResult.metadata.queryIntent}\n`
      if (topResult.metadata.queryConfidence) {
        summary += `- **Confidence:** ${Math.round(topResult.metadata.queryConfidence * 100)}%\n`
      }
    }

    summary += `\n**Content Preview:**\n`
    const previewLength = 300
    const contentPreview =
      topResult.content.length > previewLength
        ? `${topResult.content.substring(0, previewLength)}...`
        : topResult.content
    summary += `\`\`\`\n${contentPreview}\n\`\`\`\n\n`

    // Additional results summary
    if (results.length > 1) {
      summary += `**Additional Results:**\n`
      results.slice(1, Math.min(5, results.length)).forEach((result, idx) => {
        const scorePercent = Math.round(result.score * 100)
        summary += `${idx + 2}. ${result.path} (${scorePercent}% relevance, ${result.metadata.source})\n`
      })
      if (results.length > 5) {
        summary += `... and ${results.length - 5} more results\n\n`
      }
    }

    // Relevance factors if available
    if (topResult.metadata.relevanceFactors && topResult.metadata.relevanceFactors.length > 0) {
      summary += `**Relevance Factors:**\n`
      topResult.metadata.relevanceFactors.forEach((factor) => {
        summary += `- ${factor}\n`
      })
      summary += `\n`
    }

    summary += `**Use Case:** Use these results to understand code patterns, find implementations, or locate relevant documentation.`

    return summary
  }
}

export default RAGSearchTool

