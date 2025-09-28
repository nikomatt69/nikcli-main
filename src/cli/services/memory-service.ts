import { EventEmitter } from 'node:events'
import chalk from 'chalk'
// Import RAG and semantic capabilities for enhanced memory
import { semanticSearchEngine } from '../context/semantic-search-engine'
import { unifiedEmbeddingInterface } from '../context/unified-embedding-interface'
import { type MemoryEntry, type MemorySearchOptions, type MemorySearchResult, mem0Provider } from '../providers/memory'
import { structuredLogger } from '../utils/structured-logger'

export interface ConversationContext {
  sessionId: string
  userId?: string
  topic?: string
  participants: string[]
  startTime: number
  lastActivity: number
}

export interface PersonalizationData {
  userId: string
  preferences: Record<string, any>
  expertise_areas: string[]
  communication_style: string
  frequent_topics: string[]
  interaction_patterns: {
    preferred_response_length: 'short' | 'medium' | 'long'
    preferred_detail_level: 'basic' | 'detailed' | 'expert'
    common_tasks: string[]
  }
}

/**
 * Memory Service - High-level interface for persistent AI memory
 * Provides context-aware memory management for agents and users
 */
export class MemoryService extends EventEmitter {
  private currentSession: ConversationContext | null = null
  private userPersonalization: Map<string, PersonalizationData> = new Map()
  private isInitialized = false

  constructor() {
    super()

    // Listen to memory provider events
    mem0Provider.on('memory_stored', (data) => {
      this.emit('memory_added', data)
    })

    mem0Provider.on('memory_updated', (data) => {
      this.emit('memory_updated', data)
    })
  }

  /**
   * Initialize memory service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      await mem0Provider.initialize()
      this.isInitialized = true

      structuredLogger.success('Memory Service', '✓ Memory Service initialized')
      this.emit('initialized')
    } catch (error: any) {
      structuredLogger.error('Memory Service', `❌ Memory Service initialization failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Start a new conversation session
   */
  async startSession(
    sessionId: string,
    options: {
      userId?: string
      topic?: string
      participants?: string[]
    } = {}
  ): Promise<void> {
    if (!this.isInitialized) await this.initialize()

    this.currentSession = {
      sessionId,
      userId: options.userId,
      topic: options.topic,
      participants: options.participants || ['user', 'assistant'],
      startTime: Date.now(),
      lastActivity: Date.now(),
    }

    // Store session start memory
    await this.addMemory(`Started conversation session${options.topic ? ` about ${options.topic}` : ''}`, {
      source: 'system',
      context: 'session_start',
      importance: 3,
      tags: ['session', 'start'],
      userId: options.userId,
      sessionId,
    })

    console.log(chalk.blue(`🗣️ Started memory session: ${sessionId}`))
    this.emit('session_started', this.currentSession)
  }

  /**
   * Add a memory entry
   */
  async addMemory(content: string, metadata: Partial<MemoryEntry['metadata']> = {}): Promise<string> {
    if (!this.isInitialized) await this.initialize()

    // Enhance metadata with current session context
    const enhancedMetadata: Partial<MemoryEntry['metadata']> = {
      ...metadata,
      sessionId: this.currentSession?.sessionId || metadata.sessionId,
      userId: this.currentSession?.userId || metadata.userId,
      timestamp: Date.now(),
    }

    // Auto-tag based on content analysis
    const autoTags = this.generateAutoTags(content)
    enhancedMetadata.tags = [...(metadata.tags || []), ...autoTags]

    // Auto-assess importance
    if (!metadata.importance) {
      enhancedMetadata.importance = this.assessImportance(content, metadata.source)
    }

    const memoryId = await mem0Provider.storeMemory(content, enhancedMetadata)

    // Update personalization data if this is user content
    if (metadata.source === 'user' && this.currentSession?.userId) {
      await this.updatePersonalization(this.currentSession.userId, content)
    }

    // Update session activity
    if (this.currentSession) {
      this.currentSession.lastActivity = Date.now()
    }

    return memoryId
  }

  /**
   * Search memories with context awareness
   */
  async searchMemories(query: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    if (!this.isInitialized) await this.initialize()

    // Enhanced semantic search integration
    let enhancedQuery = query
    try {
      const queryAnalysis = await semanticSearchEngine.analyzeQuery(query)
      enhancedQuery = queryAnalysis.expandedQuery || query
      console.log(chalk.dim(`⚡︎ Enhanced memory query: "${query}" → "${enhancedQuery}"`))
    } catch {
      // Fall back to original query if semantic analysis fails
    }

    // Enhance search with current session context
    const enhancedOptions: MemorySearchOptions = {
      ...options,
      userId: this.currentSession?.userId || options.userId,
      limit: options.limit || 10,
    }

    // Add session-specific boost
    if (this.currentSession?.sessionId && !options.timeRange) {
      // Prioritize memories from current session or recent sessions
      const sessionStartTime = this.currentSession.startTime
      enhancedOptions.timeRange = {
        start: sessionStartTime - 7 * 24 * 60 * 60 * 1000, // Include last 7 days
        end: Date.now(),
      }
    }

    const results = await mem0Provider.searchMemories({ ...enhancedOptions, query: enhancedQuery })

    // Post-process results for context awareness
    const contextualResults = await this.addContextualRelevance(results, query)

    this.emit('memories_searched', {
      query,
      results: contextualResults.length,
      sessionId: this.currentSession?.sessionId,
    })

    return contextualResults
  }

  /**
   * Enhanced memory addition with semantic embedding
   */
  async addSemanticMemory(content: string, metadata: Partial<MemoryEntry['metadata']> = {}): Promise<string> {
    try {
      // Generate semantic embedding for better retrieval
      const embedding = await unifiedEmbeddingInterface.generateEmbedding(content)

      const enhancedMetadata = {
        ...metadata,
        embedding: embedding.vector,
        embeddingModel: embedding.model,
        semanticHash: embedding.hash,
      }

      return await this.addMemory(content, enhancedMetadata)
    } catch (_error) {
      // Fallback to regular memory addition
      console.log(chalk.yellow('⚠️ Semantic embedding failed, using standard memory'))
      return await this.addMemory(content, metadata)
    }
  }

  /**
   * Search memories using semantic similarity
   */
  async searchSemanticMemories(
    query: string,
    options: MemorySearchOptions & { useSemanticOnly?: boolean } = {}
  ): Promise<MemorySearchResult[]> {
    try {
      if (options.useSemanticOnly) {
        // Pure semantic search using embeddings
        const queryEmbedding = await unifiedEmbeddingInterface.generateEmbedding(query)

        // Get all memories and compute semantic similarity
        const allMemories = await mem0Provider.searchMemories({
          query: '',
          limit: 100,
          userId: options.userId,
        })

        const semanticResults = []
        for (const memoryResult of allMemories) {
          if ((memoryResult.memory.metadata as any).embedding) {
            const similarity = unifiedEmbeddingInterface.calculateSimilarity(
              queryEmbedding.vector,
              (memoryResult.memory.metadata as any).embedding
            )

            if (similarity > 0.3) {
              // Similarity threshold
              semanticResults.push({
                ...memoryResult,
                score: similarity,
              })
            }
          }
        }

        return semanticResults.sort((a, b) => b.score - a.score).slice(0, options.limit || 10)
      } else {
        // Hybrid: semantic + traditional search
        return await this.searchMemories(query, options)
      }
    } catch (_error) {
      console.log(chalk.yellow('⚠️ Semantic memory search failed, using traditional search'))
      return await this.searchMemories(query, options)
    }
  }

  /**
   * Get conversation context from memory
   */
  async getConversationContext(sessionId?: string, lookbackHours: number = 24): Promise<MemoryEntry[]> {
    const targetSessionId = sessionId || this.currentSession?.sessionId
    if (!targetSessionId) return []

    const cutoffTime = Date.now() - lookbackHours * 60 * 60 * 1000

    const _searchOptions: MemorySearchOptions = {
      query: '', // Get all memories
      timeRange: { start: cutoffTime, end: Date.now() },
      limit: 50,
    }

    // Get memories from the session
    const memories = await mem0Provider.getMemoriesByContext(targetSessionId, {
      limit: 50,
      userId: this.currentSession?.userId,
    })

    return memories.filter((memory) => memory.metadata.timestamp >= cutoffTime)
  }

  /**
   * Get personalization data for a user
   */
  async getPersonalization(userId: string): Promise<PersonalizationData | null> {
    if (!this.isInitialized) await this.initialize()

    // Check cache first
    if (this.userPersonalization.has(userId)) {
      return this.userPersonalization.get(userId)!
    }

    // Analyze user's memory patterns to build personalization
    const userMemories = await mem0Provider.searchMemories({
      query: '',
      limit: 100,
      userId,
    })

    if (userMemories.length === 0) return null

    const personalization = await this.analyzeUserPersonalization(userId, userMemories)
    this.userPersonalization.set(userId, personalization)

    return personalization
  }

  /**
   * Update user personalization based on new interaction
   */
  async updatePersonalization(userId: string, content: string): Promise<void> {
    const currentPersonalization = await this.getPersonalization(userId)

    if (!currentPersonalization) {
      // Create new personalization profile
      const newPersonalization: PersonalizationData = {
        userId,
        preferences: {},
        expertise_areas: [],
        communication_style: 'balanced',
        frequent_topics: [],
        interaction_patterns: {
          preferred_response_length: 'medium',
          preferred_detail_level: 'detailed',
          common_tasks: [],
        },
      }

      this.userPersonalization.set(userId, newPersonalization)
    } else {
      // Update existing personalization based on content
      await this.incrementalPersonalizationUpdate(currentPersonalization, content)
    }
  }

  /**
   * Enhanced user fact storage with semantic capabilities
   */
  async rememberUserFactSemantic(
    userId: string,
    fact: string,
    category: 'preference' | 'personal' | 'professional' | 'context' = 'personal'
  ): Promise<string> {
    return await this.addSemanticMemory(fact, {
      source: 'user',
      importance: 8,
      tags: ['user_fact', category, userId],
      userId,
      context: 'user_profile',
    })
  }

  /**
   * Remember key facts about the user
   */
  async rememberUserFact(
    userId: string,
    fact: string,
    category: 'preference' | 'personal' | 'professional' | 'context' = 'personal'
  ): Promise<string> {
    return await this.addMemory(fact, {
      source: 'user',
      importance: 8, // High importance for explicit user facts
      tags: ['user_fact', category, userId],
      userId,
      context: 'user_profile',
    })
  }

  /**
   * Recall relevant memories for decision making
   */
  async getRelevantContext(
    query: string,
    userId?: string,
    maxMemories: number = 5
  ): Promise<{
    relevant_memories: MemorySearchResult[]
    personalization: PersonalizationData | null
    session_context: MemoryEntry[]
    context_summary: string
  }> {
    if (!this.isInitialized) await this.initialize()

    const targetUserId = userId || this.currentSession?.userId

    // Get relevant memories
    const relevantMemories = await this.searchMemories(query, {
      limit: maxMemories,
      userId: targetUserId,
    })

    // Get personalization data
    const personalization = targetUserId ? await this.getPersonalization(targetUserId) : null

    // Get recent session context
    const sessionContext = await this.getConversationContext(
      this.currentSession?.sessionId,
      2 // Last 2 hours
    )

    // Generate context summary
    const contextSummary = this.generateContextSummary(relevantMemories, personalization, sessionContext)

    return {
      relevant_memories: relevantMemories,
      personalization,
      session_context: sessionContext,
      context_summary: contextSummary,
    }
  }

  /**
   * End current session
   */
  async endSession(): Promise<void> {
    if (!this.currentSession) return

    const duration = Date.now() - this.currentSession.startTime

    // Store session end memory
    await this.addMemory(`Ended conversation session (duration: ${Math.round(duration / 60000)} minutes)`, {
      source: 'system',
      context: 'session_end',
      importance: 3,
      tags: ['session', 'end'],
      userId: this.currentSession.userId,
      sessionId: this.currentSession.sessionId,
    })

    console.log(chalk.blue(`👋 Ended memory session: ${this.currentSession.sessionId}`))
    this.emit('session_ended', this.currentSession)

    this.currentSession = null
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): any {
    return mem0Provider.getMemoryStats()
  }

  // ===== PRIVATE METHODS =====

  private generateAutoTags(content: string): string[] {
    const tags: string[] = []
    const lowerContent = content.toLowerCase()

    // Technical concepts
    const techKeywords = [
      { keyword: 'code', tag: 'programming' },
      { keyword: 'bug', tag: 'debugging' },
      { keyword: 'error', tag: 'troubleshooting' },
      { keyword: 'api', tag: 'api' },
      { keyword: 'database', tag: 'database' },
      { keyword: 'deploy', tag: 'deployment' },
      { keyword: 'test', tag: 'testing' },
      { keyword: 'design', tag: 'design' },
      { keyword: 'performance', tag: 'optimization' },
    ]

    for (const { keyword, tag } of techKeywords) {
      if (lowerContent.includes(keyword)) {
        tags.push(tag)
      }
    }

    // Emotional context
    if (lowerContent.includes('problem') || lowerContent.includes('issue')) {
      tags.push('problem_solving')
    }
    if (lowerContent.includes('thank') || lowerContent.includes('great')) {
      tags.push('positive_feedback')
    }
    if (lowerContent.includes('help') || lowerContent.includes('assistance')) {
      tags.push('help_request')
    }

    return [...new Set(tags)]
  }

  private assessImportance(content: string, source?: string): number {
    let importance = 5 // Base importance

    // Source-based adjustment
    if (source === 'user') importance += 1
    if (source === 'system') importance -= 1

    // Content-based assessment
    const lowerContent = content.toLowerCase()

    // High importance indicators
    if (lowerContent.includes('important') || lowerContent.includes('critical')) {
      importance += 2
    }
    if (lowerContent.includes('remember') || lowerContent.includes('note')) {
      importance += 1
    }
    if (lowerContent.includes('preference') || lowerContent.includes('like')) {
      importance += 1
    }

    // Low importance indicators
    if (lowerContent.includes('hello') || lowerContent.includes('thanks')) {
      importance -= 1
    }

    return Math.max(1, Math.min(10, importance))
  }

  private async addContextualRelevance(results: MemorySearchResult[], _query: string): Promise<MemorySearchResult[]> {
    // Add contextual boosting based on current session
    if (!this.currentSession) return results

    return results.map((result) => {
      let boost = 0

      // Boost memories from current session
      if (result.memory.metadata.sessionId === this.currentSession?.sessionId) {
        boost += 0.2
      }

      // Boost recent memories
      const age = Date.now() - result.memory.metadata.timestamp
      const hours = age / (1000 * 60 * 60)
      if (hours < 1) boost += 0.3
      else if (hours < 24) boost += 0.1

      // Boost high importance memories
      if (result.memory.metadata.importance >= 7) {
        boost += 0.1
      }

      return {
        ...result,
        similarity: Math.min(1, result.similarity + boost),
      }
    })
  }

  private async analyzeUserPersonalization(
    userId: string,
    memories: MemorySearchResult[]
  ): Promise<PersonalizationData> {
    // Analyze user patterns from memories
    const topicCounts: Record<string, number> = {}
    const taskCounts: Record<string, number> = {}
    let totalWords = 0
    let totalMemories = 0

    for (const { memory } of memories) {
      if (memory.metadata.source === 'user') {
        totalMemories++
        totalWords += memory.content.split(' ').length

        // Count topics from tags
        for (const tag of memory.metadata.tags) {
          topicCounts[tag] = (topicCounts[tag] || 0) + 1
        }
      }
    }

    // Determine preferences
    const avgWordsPerMessage = totalMemories > 0 ? totalWords / totalMemories : 0
    const preferredLength = avgWordsPerMessage < 10 ? 'short' : avgWordsPerMessage < 30 ? 'medium' : 'long'

    const frequentTopics = Object.entries(topicCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([topic]) => topic)

    return {
      userId,
      preferences: {},
      expertise_areas: frequentTopics.filter((topic) => ['programming', 'database', 'api', 'design'].includes(topic)),
      communication_style: 'balanced',
      frequent_topics: frequentTopics,
      interaction_patterns: {
        preferred_response_length: preferredLength,
        preferred_detail_level: 'detailed',
        common_tasks: Object.keys(taskCounts),
      },
    }
  }

  private async incrementalPersonalizationUpdate(personalization: PersonalizationData, content: string): Promise<void> {
    // Update frequent topics based on new content
    const contentTags = this.generateAutoTags(content)

    for (const tag of contentTags) {
      if (!personalization.frequent_topics.includes(tag)) {
        personalization.frequent_topics.push(tag)
        // Keep only top 10 topics
        if (personalization.frequent_topics.length > 10) {
          personalization.frequent_topics.pop()
        }
      }
    }

    // Update communication style analysis
    const wordCount = content.split(' ').length
    const currentPreference = personalization.interaction_patterns.preferred_response_length

    if (wordCount < 10 && currentPreference !== 'short') {
      // User tends to write short messages
      personalization.interaction_patterns.preferred_response_length = 'short'
    } else if (wordCount > 50 && currentPreference !== 'long') {
      // User writes detailed messages
      personalization.interaction_patterns.preferred_response_length = 'long'
    }
  }

  private generateContextSummary(
    relevantMemories: MemorySearchResult[],
    personalization: PersonalizationData | null,
    sessionContext: MemoryEntry[]
  ): string {
    const parts: string[] = []

    if (relevantMemories.length > 0) {
      parts.push(`Found ${relevantMemories.length} relevant memories`)
    }

    if (personalization) {
      parts.push(`User prefers ${personalization.interaction_patterns.preferred_response_length} responses`)
      if (personalization.frequent_topics.length > 0) {
        parts.push(`Frequent topics: ${personalization.frequent_topics.slice(0, 3).join(', ')}`)
      }
    }

    if (sessionContext.length > 0) {
      parts.push(`${sessionContext.length} recent context items`)
    }

    return parts.length > 0 ? parts.join('; ') : 'No significant context available'
  }

  /**
   * Get current session info
   */
  getCurrentSession(): ConversationContext | null {
    return this.currentSession
  }

  /**
   * Get a specific memory by ID
   */
  async getMemory(memoryId: string): Promise<MemoryEntry | null> {
    if (!this.isInitialized) await this.initialize()

    try {
      const memory = await mem0Provider.getMemory(memoryId)
      return memory
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to get memory: ${error.message}`))
      return null
    }
  }

  /**
   * Delete a specific memory by ID
   */
  async deleteMemory(memoryId: string): Promise<boolean> {
    if (!this.isInitialized) await this.initialize()

    try {
      const deleted = await mem0Provider.deleteMemory(memoryId)

      if (deleted) {
        console.log(chalk.green(`✓ Memory ${memoryId.slice(0, 8)}... deleted successfully`))
        this.emit('memory_deleted', { memoryId })

        // Add deletion event to memory
        await this.addMemory(`Deleted memory: ${memoryId}`, {
          source: 'system',
          context: 'memory_management',
          importance: 3,
          tags: ['system', 'deletion'],
          userId: this.currentSession?.userId,
          sessionId: this.currentSession?.sessionId,
        })
      }

      return deleted
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to delete memory: ${error.message}`))
      return false
    }
  }

  /**
   * Delete multiple memories by criteria
   */
  async deleteMemoriesByCriteria(criteria: {
    userId?: string
    tags?: string[]
    timeRange?: { start: number; end: number }
    importance?: { min?: number; max?: number }
    context?: string
  }): Promise<number> {
    if (!this.isInitialized) await this.initialize()

    try {
      // First find memories matching criteria
      const searchOptions: MemorySearchOptions = {
        query: '',
        userId: criteria.userId || this.currentSession?.userId,
        limit: 1000, // Get a large batch
      }

      if (criteria.timeRange) {
        searchOptions.timeRange = criteria.timeRange
      }

      const memories = await mem0Provider.searchMemories(searchOptions)

      // Filter by additional criteria
      const toDelete = memories.filter((result) => {
        const memory = result.memory

        // Check tags
        if (criteria.tags && criteria.tags.length > 0) {
          const hasMatchingTag = criteria.tags.some((tag) => memory.metadata.tags.includes(tag))
          if (!hasMatchingTag) return false
        }

        // Check importance range
        if (criteria.importance) {
          const importance = memory.metadata.importance
          if (criteria.importance.min !== undefined && importance < criteria.importance.min) return false
          if (criteria.importance.max !== undefined && importance > criteria.importance.max) return false
        }

        // Check context
        if (criteria.context && memory.metadata.context !== criteria.context) return false

        return true
      })

      // Delete each memory
      let deletedCount = 0
      for (const result of toDelete) {
        const success = await this.deleteMemory(result.memory.id)
        if (success) deletedCount++
      }

      console.log(chalk.green(`✓ Deleted ${deletedCount} memories matching criteria`))
      return deletedCount
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to delete memories by criteria: ${error.message}`))
      return 0
    }
  }

  /**
   * Get provider configuration
   */
  getConfig(): any {
    return mem0Provider.getConfig()
  }
}

// Singleton instance
export const memoryService = new MemoryService()
