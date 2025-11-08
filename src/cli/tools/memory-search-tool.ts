import { type CoreTool, tool } from 'ai'
import chalk from 'chalk'
import { z } from 'zod'
import { memoryService } from '../services/memory-service'
import { type MemorySearchResult } from '../providers/memory'

// Types to avoid never[] inference on arrays inside the result object
type MemoryResult = {
  id: string
  content: string
  similarity: number
  relevance: string
  timestamp: string
  tags: string[]
  metadata: {
    source?: string
    importance?: number
    userId?: string
    sessionId?: string
  }
}

type MemorySearchToolResult = {
  query: string
  found: boolean
  results: MemoryResult[]
  totalFound: number
  searchMode: 'semantic' | 'traditional' | 'hybrid'
  summary: string
}

/**
 * Tool per cercare nelle memorie persistenti quando gli agenti
 * hanno bisogno di recuperare informazioni da conversazioni precedenti
 * o contesto storico
 */
export const memorySearchTool: CoreTool = tool({
  description:
    'Search through persistent memories to retrieve information from previous conversations, user preferences, or historical context',
  parameters: z.object({
    query: z.string().describe('What to search for in memories (e.g., "user preferences", "previous implementation", "discussed feature")'),
    searchMode: z
      .enum(['semantic', 'traditional', 'hybrid'])
      .default('hybrid')
      .describe('Search mode: semantic (embedding-based), traditional (keyword), or hybrid (both)'),
    limit: z.number().min(1).max(50).default(10).describe('Maximum number of results to return'),
    userId: z.string().optional().describe('Filter memories by specific user ID'),
    tags: z.array(z.string()).optional().describe('Filter memories by tags'),
    timeRange: z
      .object({
        start: z.number().optional().describe('Start timestamp (Unix milliseconds)'),
        end: z.number().optional().describe('End timestamp (Unix milliseconds)'),
      })
      .optional()
      .describe('Filter memories by time range'),
    minSimilarity: z.number().min(0).max(1).default(0.3).describe('Minimum similarity score for semantic search (0-1)'),
  }),
  execute: async ({ query, searchMode, limit, userId, tags, timeRange, minSimilarity }) => {
    try {
      console.log(chalk.blue(`🧠 Agent searching memories: "${query}"`))

      const result: MemorySearchToolResult = {
        query,
        found: false,
        results: [],
        totalFound: 0,
        searchMode,
        summary: '',
      }

      // Ensure memory service is initialized
      await memoryService.initialize()

      // Prepare search options
      const searchOptions: any = {
        query,
        limit,
        userId,
        tags,
        timeRange: timeRange
          ? {
              start: timeRange.start || 0,
              end: timeRange.end || Date.now(),
            }
          : undefined,
      }

      // Perform search based on mode
      let searchResults: MemorySearchResult[] = []

      if (searchMode === 'semantic') {
        // Pure semantic search
        searchResults = await memoryService.searchSemanticMemories(query, {
          ...searchOptions,
          useSemanticOnly: true,
        })
      } else if (searchMode === 'traditional') {
        // Traditional keyword search
        searchResults = await memoryService.searchMemories(query, searchOptions)
      } else {
        // Hybrid: try semantic first, fallback to traditional
        try {
          searchResults = await memoryService.searchSemanticMemories(query, {
            ...searchOptions,
            useSemanticOnly: false,
          })
        } catch (error) {
          console.log(chalk.yellow('⚠️ Semantic search failed, using traditional search'))
          searchResults = await memoryService.searchMemories(query, searchOptions)
        }
      }

      // Filter by minimum similarity if semantic search was used
      if (searchMode === 'semantic' || searchMode === 'hybrid') {
        searchResults = searchResults.filter((r) => r.similarity >= minSimilarity)
      }

      // Transform results to tool format
      result.results = searchResults.map((memoryResult) => {
        const memory = memoryResult.memory
        return {
          id: memory.id,
          content: memory.content,
          similarity: memoryResult.similarity,
          relevance: memoryResult.relevance_explanation || 'Relevant to query',
          timestamp: new Date(memory.metadata.timestamp).toISOString(),
          tags: memory.metadata.tags || [],
          metadata: {
            source: memory.metadata.source,
            importance: memory.metadata.importance,
            userId: memory.metadata.userId,
            sessionId: memory.metadata.sessionId,
          },
        }
      })

      result.totalFound = result.results.length
      result.found = result.totalFound > 0

      // Generate summary
      if (result.found) {
        const topResult = result.results[0]
        const similarityPercent = Math.round(topResult.similarity * 100)

        result.summary = `🎯 Found ${result.totalFound} relevant memory${result.totalFound > 1 ? 'ies' : ''} for "${query}"\n\n`

        if (result.totalFound > 0) {
          result.summary += `**Top Result (${similarityPercent}% similarity):**\n`
          result.summary += `- ${topResult.content.substring(0, 200)}${topResult.content.length > 200 ? '...' : ''}\n`
          result.summary += `- Tags: ${topResult.tags.length > 0 ? topResult.tags.join(', ') : 'none'}\n`
          result.summary += `- Date: ${new Date(topResult.timestamp).toLocaleString()}\n\n`
        }

        if (result.totalFound > 1) {
          result.summary += `**Additional Results:**\n`
          result.results.slice(1, Math.min(4, result.totalFound)).forEach((mem, idx) => {
            const simPercent = Math.round(mem.similarity * 100)
            result.summary += `${idx + 2}. ${mem.content.substring(0, 150)}... (${simPercent}% similarity)\n`
          })
          if (result.totalFound > 4) {
            result.summary += `... and ${result.totalFound - 4} more\n\n`
          }
        }

        result.summary += `**Search Mode:** ${result.searchMode}\n`
        result.summary += `**Use Case:** Use this information to provide context-aware responses based on previous interactions.`
      } else {
        result.summary = `❌ No memories found for "${query}"\n\n`
        result.summary += `**Suggestions:**\n`
        result.summary += `- Try different keywords or a more general query\n`
        result.summary += `- Check if memories exist for this user/session\n`
        result.summary += `- Consider using semantic search mode for better results\n`
        result.summary += `- Lower the minimum similarity threshold if using semantic search`
      }

      return result
    } catch (error: any) {
      console.error(chalk.red(`❌ Memory search failed: ${error.message}`))
      return {
        query,
        found: false,
        results: [],
        totalFound: 0,
        searchMode,
        summary: `Failed to search memories: ${error.message}`,
        error: error.message,
      }
    }
  },
})

/**
 * Tool per ottenere il contesto della conversazione corrente
 * dalle memorie della sessione
 */
export const getConversationContextTool: CoreTool = tool({
  description: 'Get conversation context from current or specified session memories',
  parameters: z.object({
    sessionId: z.string().optional().describe('Specific session ID (defaults to current session)'),
    lookbackHours: z.number().min(1).max(168).default(24).describe('How many hours back to look for context'),
    limit: z.number().min(1).max(100).default(20).describe('Maximum number of memories to retrieve'),
  }),
  execute: async ({ sessionId, lookbackHours, limit }) => {
    try {
      console.log(chalk.blue(`🧠 Agent retrieving conversation context`))

      await memoryService.initialize()

      const memories = await memoryService.getConversationContext(sessionId, lookbackHours)

      const limitedMemories = memories.slice(0, limit)

      const contextSummary = {
        sessionId: sessionId || 'current',
        lookbackHours,
        memoriesFound: limitedMemories.length,
        totalMemories: memories.length,
        memories: limitedMemories.map((memory) => ({
          id: memory.id,
          content: memory.content,
          timestamp: new Date(memory.metadata.timestamp).toISOString(),
          tags: memory.metadata.tags || [],
          source: memory.metadata.source,
        })),
        summary: `📚 Retrieved ${limitedMemories.length} memory${limitedMemories.length > 1 ? 'ies' : ''} from the last ${lookbackHours} hour${lookbackHours > 1 ? 's' : ''}\n\n`,
      }

      if (limitedMemories.length > 0) {
        contextSummary.summary += `**Recent Context:**\n`
        limitedMemories.slice(0, 5).forEach((mem, idx) => {
          contextSummary.summary += `${idx + 1}. ${mem.content.substring(0, 150)}${mem.content.length > 150 ? '...' : ''}\n`
        })
        if (limitedMemories.length > 5) {
          contextSummary.summary += `... and ${limitedMemories.length - 5} more memories\n\n`
        }
        contextSummary.summary += `**Use this context to maintain conversation continuity and provide relevant responses.**`
      } else {
        contextSummary.summary += `No memories found in the specified time range.`
      }

      return contextSummary
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to get conversation context: ${error.message}`))
      return {
        sessionId: sessionId || 'current',
        memoriesFound: 0,
        totalMemories: 0,
        memories: [],
        summary: `Failed to retrieve conversation context: ${error.message}`,
        error: error.message,
      }
    }
  },
})

// Export combined memory tools for AI agents
export const aiMemoryTools = {
  search: memorySearchTool,
  getContext: getConversationContextTool,
}

