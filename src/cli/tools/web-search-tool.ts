import chalk from 'chalk'
import { z } from 'zod'
import { WebSearchProvider } from '../core/web-search-provider'
import { BaseTool, type ToolExecutionResult } from './base-tool'

const WebSearchOptionsSchema = z.object({
  query: z.string().min(1).describe('Search query to execute'),
  maxResults: z.number().int().min(1).max(10).default(5).describe('Maximum number of results to return'),
  searchType: z
    .enum(['general', 'technical', 'documentation', 'stackoverflow'])
    .default('general')
    .describe('Specialized search flavor'),
  mode: z.enum(['results', 'answer']).default('results').describe('Return raw results or a synthesized answer'),
  includeContent: z.boolean().default(false).describe('Fetch page content to improve synthesis quality'),
  maxContentBytes: z
    .number()
    .int()
    .min(50_000)
    .max(5_000_000)
    .default(200_000)
    .describe('Max bytes to fetch from each page when includeContent is enabled'),
})

export type WebSearchOptions = z.infer<typeof WebSearchOptionsSchema>

/**
 * Tool wrapper around WebSearchProvider so planners and registries can call web search directly.
 */
export class WebSearchTool extends BaseTool {
  private provider: WebSearchProvider

  constructor(workingDirectory: string) {
    super('web-search-tool', workingDirectory)
    this.provider = new WebSearchProvider()
  }

  async execute(options: WebSearchOptions | string): Promise<ToolExecutionResult> {
    const startedAt = Date.now()
    const rawParams = typeof options === 'string' ? { query: options } : options

    try {
      const params = WebSearchOptionsSchema.parse(rawParams)
      // Note: Native web_search_preview tool is only for use in generateText calls (handled in advanced-ai-provider.ts)
      // For direct execution via ToolRegistry, we always use the standard web search tool with execute method
      const webSearchTool = this.provider.getWebSearchTool()
      const result = await (webSearchTool as any).execute(params)

      return {
        success: true,
        data: result,
        metadata: {
          executionTime: Date.now() - startedAt,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      console.log(chalk.red(`Web search failed: ${error.message}`))
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startedAt,
          toolName: this.name,
          parameters: rawParams,
        },
      }
    }
  }

  getMetadata() {
    return {
      id: 'web-search-tool',
      name: 'web-search-tool',
      description: 'Search the web for up-to-date information with optional AI synthesis and citations.',
      version: '1.0.0',
      category: 'web-browsing' as const,
      tags: ['web', 'search', 'online', 'documentation', 'stack overflow'],
      capabilities: ['web-access', 'information-retrieval'],
      requiredCapabilities: [],
      dependencies: [],
      permissions: {
        canReadFiles: false,
        canWriteFiles: false,
        canDeleteFiles: false,
        canExecuteCommands: false,
        allowedPaths: [],
        forbiddenPaths: [],
        allowedCommands: [],
        forbiddenCommands: [],
        canAccessNetwork: true,
        maxExecutionTime: 300000,
        maxMemoryUsage: 512 * 1024 * 1024,
        requiresApproval: true,
      },
      inputSchema: WebSearchOptionsSchema,
      outputSchema: z.any(),
      examples: [
        {
          title: 'Framework updates',
          description: 'Search for the latest Next.js 15 changes',
          input: { query: 'Next.js 15 new features', searchType: 'documentation', mode: 'results' },
          expectedOutput: { results: 'Array of web results or synthesized answer' },
        },
      ],
      documentation: 'Executes a privacy-friendly DuckDuckGo search and can synthesize answers with citations.',
      isBuiltIn: true,
      isEnabled: true,
      priority: 50,
      loadOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
}
