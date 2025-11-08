import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { simpleConfigManager } from '../../core/config-manager'
import { advancedUI } from '../../ui/advanced-cli-ui'
import { structuredLogger } from '../../utils/structured-logger'
import { redisProvider } from '../redis/redis-provider'

export interface MemoryEntry {
  id: string
  content: string
  metadata: {
    timestamp: number
    source: 'user' | 'agent' | 'system'
    context?: string
    importance: number // 1-10 scale
    tags: string[]
    userId?: string
    sessionId?: string
  }
  embedding?: number[]
  relationships?: {
    related_memories: string[]
    entities: string[]
    concepts: string[]
  }
}

export interface MemorySearchOptions {
  query?: string
  limit?: number
  minSimilarity?: number
  timeRange?: {
    start: number
    end: number
  }
  source?: 'user' | 'agent' | 'system'
  tags?: string[]
  userId?: string
}

export interface MemorySearchResult {
  memory: MemoryEntry
  similarity: number
  relevance_explanation: string
}

export interface Mem0Config {
  enabled: boolean
  backend: 'qdrant' | 'chroma' | 'memory' // memory for in-memory fallback
  embedding_model: 'openai' | 'sentence-transformers'
  max_memories: number
  auto_cleanup: boolean
  similarity_threshold: number
  importance_decay_days: number
}

/**
 * Mem0 Memory Provider - Long-term contextual memory for AI agents
 * Provides persistent memory with semantic search and relationship mapping
 */
export class Mem0Provider extends EventEmitter {
  private config: Mem0Config
  private memories: Map<string, MemoryEntry> = new Map()
  private vectorStore: any = null
  private isInitialized = false

  constructor() {
    super()

    this.config = {
      enabled: true,
      backend: 'memory', // Start with in-memory, can upgrade to vector DB
      embedding_model: 'openai',
      max_memories: 10000,
      auto_cleanup: true,
      similarity_threshold: 0.7,
      importance_decay_days: 30,
    }

    advancedUI.logFunctionCall('mem0providerinit')
    advancedUI.logFunctionUpdate('success', 'Mem0 Provider initialized', '✓')
  }

  /**
   * Initialize the memory system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Initialize vector store based on backend
      await this.initializeVectorStore()

      // Load existing memories from cache
      await this.loadMemoriesFromCache()

      // Setup automatic cleanup
      if (this.config.auto_cleanup) {
        this.setupAutoCleanup()
      }

      this.isInitialized = true

    } catch (error: any) {
      structuredLogger.error('Memory', `❌ Mem0 initialization failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Store a new memory
   */
  async storeMemory(content: string, metadata: Partial<MemoryEntry['metadata']> = {}): Promise<string> {
    if (!this.isInitialized) await this.initialize()

    const memoryId = this.generateMemoryId()
    const timestamp = Date.now()

    const memory: MemoryEntry = {
      id: memoryId,
      content,
      metadata: {
        timestamp,
        source: metadata.source || 'user',
        context: metadata.context,
        importance: metadata.importance || 5,
        tags: metadata.tags || [],
        userId: metadata.userId,
        sessionId: metadata.sessionId,
      },
    }

    // Generate embedding if vector store is available
    if (this.vectorStore && this.config.embedding_model === 'openai') {
      memory.embedding = await this.generateEmbedding(content)
    }

    // Extract entities and concepts
    memory.relationships = await this.extractRelationships(content)

    // Store in memory
    this.memories.set(memoryId, memory)

    // Store in vector database if available
    if (this.vectorStore) {
      await this.storeInVectorDB(memory)
    }

    // Cache to Redis
    await this.cacheMemory(memory)

    console.log(chalk.gray(` Stored memory: ${memoryId.substring(0, 8)}... | "${content.substring(0, 50)}..."`))

    this.emit('memory_stored', { memory, id: memoryId })

    return memoryId
  }

  /**
   * Search memories by content similarity
   */
  async searchMemories(options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    if (!this.isInitialized) await this.initialize()

    const startTime = Date.now()

    try {
      let results: MemorySearchResult[] = []

      // If vector store is available, use semantic search
      if (this.vectorStore && this.config.backend !== 'memory') {
        results = await this.vectorSearch(options)
      } else {
        // Fallback to keyword search
        results = await this.keywordSearch(options)
      }

      // Apply filters
      results = this.applyFilters(results, options)

      // Sort by relevance and similarity
      results = results.sort((a, b) => {
        // Primary sort: similarity
        if (Math.abs(a.similarity - b.similarity) > 0.1) {
          return b.similarity - a.similarity
        }
        // Secondary sort: importance
        return b.memory.metadata.importance - a.memory.metadata.importance
      })

      // Limit results
      results = results.slice(0, options.limit || 10)

      const processingTime = Date.now() - startTime
      console.log(chalk.gray(`🔍 Memory search: ${results.length} results in ${processingTime}ms`))

      this.emit('memories_searched', {
        query: options.query,
        results: results.length,
        processingTime,
      })

      return results
    } catch (error: any) {
      console.log(chalk.red(`❌ Memory search failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Get memory by ID
   */
  async getMemory(memoryId: string): Promise<MemoryEntry | null> {
    const memory = this.memories.get(memoryId)

    if (!memory) {
      // Try to load from cache
      const cached = await this.loadMemoryFromCache(memoryId)
      if (cached) {
        this.memories.set(memoryId, cached)
        return cached
      }
    }

    return memory || null
  }

  /**
   * Update memory content or metadata
   */
  async updateMemory(memoryId: string, updates: Partial<Pick<MemoryEntry, 'content' | 'metadata'>>): Promise<boolean> {
    const memory = await this.getMemory(memoryId)
    if (!memory) return false

    // Update fields
    if (updates.content) {
      memory.content = updates.content
      // Regenerate embedding if content changed
      if (this.vectorStore) {
        memory.embedding = await this.generateEmbedding(updates.content)
        memory.relationships = await this.extractRelationships(updates.content)
      }
    }

    if (updates.metadata) {
      memory.metadata = { ...memory.metadata, ...updates.metadata }
    }

    // Update timestamp
    memory.metadata.timestamp = Date.now()

    // Store updates
    this.memories.set(memoryId, memory)
    if (this.vectorStore) {
      await this.updateInVectorDB(memory)
    }
    await this.cacheMemory(memory)

    console.log(chalk.gray(`📝 Updated memory: ${memoryId.substring(0, 8)}...`))

    this.emit('memory_updated', { memory, id: memoryId })

    return true
  }

  /**
   * Delete memory
   */
  async deleteMemory(memoryId: string): Promise<boolean> {
    const memory = this.memories.get(memoryId)
    if (!memory) return false

    // Remove from memory
    this.memories.delete(memoryId)

    // Remove from vector DB
    if (this.vectorStore) {
      await this.deleteFromVectorDB(memoryId)
    }

    // Remove from cache
    await this.removeCachedMemory(memoryId)

    console.log(chalk.gray(`🗑️ Deleted memory: ${memoryId.substring(0, 8)}...`))

    this.emit('memory_deleted', { id: memoryId })

    return true
  }

  /**
   * Get memories by context or session
   */
  async getMemoriesByContext(
    context: string,
    options: { limit?: number; userId?: string } = {}
  ): Promise<MemoryEntry[]> {
    const memories = Array.from(this.memories.values())
      .filter((memory) => {
        const matchesContext = memory.metadata.context === context
        const matchesUser = !options.userId || memory.metadata.userId === options.userId
        return matchesContext && matchesUser
      })
      .sort((a, b) => b.metadata.timestamp - a.metadata.timestamp)
      .slice(0, options.limit || 50)

    return memories
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): {
    totalMemories: number
    memoriesBySource: Record<string, number>
    averageImportance: number
    oldestMemory?: number
    newestMemory?: number
  } {
    const memories = Array.from(this.memories.values())

    if (memories.length === 0) {
      return {
        totalMemories: 0,
        memoriesBySource: {},
        averageImportance: 0,
      }
    }

    const sourceCount: Record<string, number> = {}
    let totalImportance = 0
    let oldestTimestamp = Infinity
    let newestTimestamp = 0

    for (const memory of memories) {
      const source = memory.metadata.source
      sourceCount[source] = (sourceCount[source] || 0) + 1
      totalImportance += memory.metadata.importance

      if (memory.metadata.timestamp < oldestTimestamp) {
        oldestTimestamp = memory.metadata.timestamp
      }
      if (memory.metadata.timestamp > newestTimestamp) {
        newestTimestamp = memory.metadata.timestamp
      }
    }

    return {
      totalMemories: memories.length,
      memoriesBySource: sourceCount,
      averageImportance: totalImportance / memories.length,
      oldestMemory: oldestTimestamp === Infinity ? undefined : oldestTimestamp,
      newestMemory: newestTimestamp,
    }
  }

  // ===== PRIVATE METHODS =====

  /**
   * Initialize vector store based on backend configuration
   */
  private async initializeVectorStore(): Promise<void> {
    switch (this.config.backend) {
      case 'qdrant':
        await this.initializeQdrant()
        break
      case 'chroma':
        await this.initializeChroma()
        break
      case 'memory':
        // In-memory storage, no vector DB

        break
    }
  }

  private async initializeQdrant(): Promise<void> {
    try {
      // Qdrant client not installed - would require @qdrant/js-client-rest
      structuredLogger.warning('Memory', '⚠️ Qdrant client not installed')
      structuredLogger.info('Memory', '📝 Install @qdrant/js-client-rest for Qdrant support')
      structuredLogger.info('Memory', '📝 Falling back to in-memory storage')
      this.config.backend = 'memory'
    } catch (error: any) {
      structuredLogger.warning('Memory', `⚠️ Qdrant not available: ${error.message}`)
      structuredLogger.info('Memory', '📝 Falling back to in-memory storage')
      this.config.backend = 'memory'
    }
  }

  private async initializeChroma(): Promise<void> {
    try {
      // Dynamic import for ChromaDB client
      const chromadb: any = await import('chromadb')

      // Try different possible API structures
      let ChromaClient: any
      if (chromadb.ChromaApi) {
        ChromaClient = chromadb.ChromaApi
      } else if (chromadb.default) {
        ChromaClient = chromadb.default
      } else if (chromadb.ChromaClient) {
        ChromaClient = chromadb.ChromaClient
      } else {
        throw new Error('ChromaDB client not found in imports')
      }

      const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000'
      this.vectorStore = new ChromaClient({
        path: chromaUrl,
      })

      structuredLogger.success('Memory', '✓ ChromaDB vector store connected')
    } catch (error: any) {
      structuredLogger.warning('Memory', `⚠️ ChromaDB not available: ${error.message}`)
      structuredLogger.info('Memory', '📝 Falling back to in-memory storage')
      this.config.backend = 'memory'
    }
  }

  private generateMemoryId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    if (this.config.embedding_model === 'openai') {
      try {
        const openaiKey = simpleConfigManager.getApiKey('openai')
        if (!openaiKey) throw new Error('OpenAI API key required for embeddings')

        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: text,
          }),
        })

        const data: any = await response.json()
        return data.data[0].embedding
      } catch (_error) {
        console.log(chalk.yellow('⚠️ Failed to generate embedding, using keyword search'))
        return []
      }
    }

    return []
  }

  private async extractRelationships(content: string): Promise<MemoryEntry['relationships']> {
    // Basic entity extraction (could be enhanced with NLP)
    const entities = this.extractEntities(content)
    const concepts = this.extractConcepts(content)

    return {
      related_memories: [], // Will be populated during similarity search
      entities,
      concepts,
    }
  }

  private extractEntities(content: string): string[] {
    // Simple regex-based entity extraction
    const patterns = [
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, // Names like "John Smith"
      /\b\w+@\w+\.\w+\b/g, // Emails
      /\bhttps?:\/\/[^\s]+\b/g, // URLs
      /\b\d{4}-\d{2}-\d{2}\b/g, // Dates
    ]

    const entities: string[] = []
    for (const pattern of patterns) {
      const matches = content.match(pattern)
      if (matches) entities.push(...matches)
    }

    return [...new Set(entities)] // Remove duplicates
  }

  private extractConcepts(content: string): string[] {
    // Extract important technical concepts
    const techKeywords = [
      'ai',
      'machine learning',
      'neural network',
      'api',
      'database',
      'server',
      'algorithm',
      'data',
      'model',
      'training',
      'inference',
      'embedding',
      'vector',
      'similarity',
      'classification',
      'prediction',
      'optimization',
    ]

    const concepts: string[] = []
    const lowerContent = content.toLowerCase()

    for (const keyword of techKeywords) {
      if (lowerContent.includes(keyword)) {
        concepts.push(keyword)
      }
    }

    return concepts
  }

  private async vectorSearch(options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    // Vector similarity search implementation
    // This is a placeholder - in production would use actual vector DB
    return await this.keywordSearch(options)
  }

  private async keywordSearch(options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = []

    for (const memory of this.memories.values()) {
      let similarity = 1.0 // Default similarity when no query provided

      if (options.query) {
        const query = options.query.toLowerCase()
        const content = memory.content.toLowerCase()

        // Simple relevance scoring
        similarity = 0
        const queryWords = query.split(/\s+/)
        const contentWords = content.split(/\s+/)

        // Calculate word overlap
        const matches = queryWords.filter((word) => contentWords.includes(word))
        similarity = matches.length / queryWords.length

        // Boost score for exact phrase matches
        if (content.includes(query)) {
          similarity += 0.3
        }

        // Boost score for tag matches
        for (const tag of memory.metadata.tags) {
          if (query.includes(tag.toLowerCase())) {
            similarity += 0.2
          }
        }
      }

      if (similarity > (options.minSimilarity || this.config.similarity_threshold)) {
        const explanation = options.query
          ? `Query-based similarity: ${similarity.toFixed(2)}`
          : 'All memories (no query filter)'

        results.push({
          memory,
          similarity,
          relevance_explanation: explanation,
        })
      }
    }

    return results
  }

  private applyFilters(results: MemorySearchResult[], options: MemorySearchOptions): MemorySearchResult[] {
    return results.filter((result) => {
      const memory = result.memory

      // Time range filter
      if (options.timeRange) {
        const timestamp = memory.metadata.timestamp
        if (timestamp < options.timeRange.start || timestamp > options.timeRange.end) {
          return false
        }
      }

      // Source filter
      if (options.source && memory.metadata.source !== options.source) {
        return false
      }

      // Tags filter
      if (options.tags && options.tags.length > 0) {
        const hasTag = options.tags.some((tag) => memory.metadata.tags.includes(tag))
        if (!hasTag) return false
      }

      // User filter
      if (options.userId && memory.metadata.userId !== options.userId) {
        return false
      }

      return true
    })
  }

  private async storeInVectorDB(_memory: MemoryEntry): Promise<void> {
    // Vector DB storage implementation
    // Placeholder for actual implementation
  }

  private async updateInVectorDB(_memory: MemoryEntry): Promise<void> {
    // Vector DB update implementation
    // Placeholder for actual implementation
  }

  private async deleteFromVectorDB(_memoryId: string): Promise<void> {
    // Vector DB deletion implementation
    // Placeholder for actual implementation
  }

  private async cacheMemory(memory: MemoryEntry): Promise<void> {
    try {
      if (redisProvider.isHealthy()) {
        await redisProvider.set(
          `memory:${memory.id}`,
          memory,
          86400, // 24 hours
          { type: 'memory_entry' }
        )
      }
    } catch (_error) {
      // Silent failure for caching
    }
  }

  private async loadMemoryFromCache(memoryId: string): Promise<MemoryEntry | null> {
    try {
      if (redisProvider.isHealthy()) {
        const cached = await redisProvider.get<MemoryEntry>(`memory:${memoryId}`)
        return cached ? cached.value : null
      }
    } catch (_error) {
      // Silent failure for cache reads
    }
    return null
  }

  private async removeCachedMemory(memoryId: string): Promise<void> {
    try {
      if (redisProvider.isHealthy()) {
        await redisProvider.del(`memory:${memoryId}`)
      }
    } catch (_error) {
      // Silent failure for cache deletion
    }
  }

  private async loadMemoriesFromCache(): Promise<void> {
    try {
      if (redisProvider.isHealthy()) {
        const keys = await redisProvider.keys('memory:*')
        for (const key of keys) {
          const memoryId = key.replace('memory:', '')
          const memory = await this.loadMemoryFromCache(memoryId)
          if (memory) {
            this.memories.set(memory.id, memory)
          }
        }

      }
    } catch (_error) {
      structuredLogger.warning('Memory', '⚠️ Failed to load memories from cache')
    }
  }

  private setupAutoCleanup(): void {
    // Run cleanup every hour
    setInterval(
      async () => {
        await this.cleanupOldMemories()
      },
      60 * 60 * 1000
    )
  }

  private async cleanupOldMemories(): Promise<void> {
    const cutoffTime = Date.now() - this.config.importance_decay_days * 24 * 60 * 60 * 1000
    let cleanedCount = 0

    for (const [id, memory] of this.memories.entries()) {
      // Keep important memories longer
      const importanceMultiplier = memory.metadata.importance / 10
      const adjustedCutoff = cutoffTime * importanceMultiplier

      if (memory.metadata.timestamp < adjustedCutoff && memory.metadata.importance < 3) {
        await this.deleteMemory(id)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      structuredLogger.info('Memory', `🧹 Cleaned up ${cleanedCount} old memories`)
    }
  }

  /**
   * Get configuration
   */
  getConfig(): Mem0Config {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<Mem0Config>): void {
    this.config = { ...this.config, ...newConfig }
    structuredLogger.info('Memory', '⚡︎ Mem0 configuration updated')
    this.emit('config_updated', this.config)
  }
}

// Singleton instance
export const mem0Provider = new Mem0Provider()
