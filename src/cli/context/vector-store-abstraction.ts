import { unifiedEmbeddingInterface } from './unified-embedding-interface'
import { ChromaClient, CloudClient } from 'chromadb'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import chalk from 'chalk'

export interface VectorDocument {
  id: string
  content: string
  embedding?: number[]
  metadata: Record<string, any>
  timestamp: Date
}

export interface VectorSearchResult {
  id: string
  content: string
  score: number
  metadata: Record<string, any>
  embedding?: number[]
}

export interface VectorStoreConfig {
  provider: 'chromadb' | 'pinecone' | 'weaviate' | 'local'
  connectionConfig: Record<string, any>
  collectionName: string
  embeddingDimensions: number
  indexingBatchSize: number
  maxRetries: number
  healthCheckInterval: number
  autoFallback: boolean
}

export interface VectorStoreStats {
  provider: string
  documentsCount: number
  indexedDocuments: number
  searchQueries: number
  averageSearchLatency: number
  uptime: number
  lastHealthCheck: Date
  errors: number
  totalCost: number
}

/**
 * Abstract base class for vector store implementations
 */
abstract class VectorStore {
  protected config: VectorStoreConfig
  protected stats: VectorStoreStats

  constructor(config: VectorStoreConfig) {
    this.config = config
    this.stats = this.initializeStats()
  }

  abstract connect(): Promise<boolean>
  abstract disconnect(): Promise<void>
  abstract healthCheck(): Promise<boolean>
  abstract createCollection(name: string): Promise<boolean>
  abstract deleteCollection(name: string): Promise<boolean>
  abstract addDocuments(documents: VectorDocument[]): Promise<boolean>
  abstract updateDocument(document: VectorDocument): Promise<boolean>
  abstract deleteDocument(id: string): Promise<boolean>
  abstract search(query: string, limit?: number, threshold?: number): Promise<VectorSearchResult[]>
  abstract searchByVector(embedding: number[], limit?: number, threshold?: number): Promise<VectorSearchResult[]>
  abstract getDocument(id: string): Promise<VectorDocument | null>
  abstract getDocumentsCount(): Promise<number>

  getStats(): VectorStoreStats {
    return { ...this.stats }
  }

  protected initializeStats(): VectorStoreStats {
    return {
      provider: this.config.provider,
      documentsCount: 0,
      indexedDocuments: 0,
      searchQueries: 0,
      averageSearchLatency: 0,
      uptime: 0,
      lastHealthCheck: new Date(),
      errors: 0,
      totalCost: 0
    }
  }

  protected updateSearchStats(latency: number): void {
    this.stats.searchQueries++
    this.stats.averageSearchLatency =
      (this.stats.averageSearchLatency * (this.stats.searchQueries - 1) + latency) / this.stats.searchQueries
  }
}

/**
 * ChromaDB vector store implementation
 */
class ChromaDBVectorStore extends VectorStore {
  private client: ChromaClient | CloudClient | null = null
  private collection: any = null

  async connect(): Promise<boolean> {
    try {
      const config = this.config.connectionConfig

      if (config.useCloud && config.apiKey && config.tenant) {
        this.client = new CloudClient({
          apiKey: config.apiKey,
          tenant: config.tenant,
          database: config.database || 'nikcli'
        })
        console.log(chalk.gray(`🔗 Connecting to ChromaDB Cloud (${config.tenant})`))
      } else {
        this.client = new ChromaClient({
          host: config.host || 'localhost',
          port: config.port || 8005,
          ssl: config.ssl || false
        })
        console.log(chalk.gray(`🔗 Connecting to ChromaDB local (${config.host || 'localhost'}:${config.port || 8005})`))
      }

      // Test connection
      const version = await this.client.version()
      console.log(chalk.green(`✅ ChromaDB connected (version: ${version})`))

      // Get or create collection
      try {
        this.collection = await this.client.getCollection({
          name: this.config.collectionName
        })
        console.log(chalk.gray(`📂 Using existing collection: ${this.config.collectionName}`))
      } catch {
        this.collection = await this.client.createCollection({
          name: this.config.collectionName,
          embeddingFunction: {
            generate: async (texts: string[]) => {
              const results = await unifiedEmbeddingInterface.generateEmbeddings(
                texts.map(text => ({ text }))
              )
              return results.map(r => r.vector)
            }
          }
        })
        console.log(chalk.green(`✅ Created new collection: ${this.config.collectionName}`))
      }

      return true
    } catch (error) {
      console.error(chalk.red(`❌ ChromaDB connection failed: ${(error as Error).message}`))
      this.stats.errors++
      return false
    }
  }

  async disconnect(): Promise<void> {
    this.client = null
    this.collection = null
    console.log(chalk.gray('🔌 ChromaDB disconnected'))
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.client) return false

      await this.client.version()
      this.stats.lastHealthCheck = new Date()
      return true
    } catch {
      this.stats.errors++
      return false
    }
  }

  async createCollection(name: string): Promise<boolean> {
    try {
      if (!this.client) return false

      await this.client.createCollection({
        name,
        embeddingFunction: {
          generate: async (texts: string[]) => {
            const results = await unifiedEmbeddingInterface.generateEmbeddings(
              texts.map(text => ({ text }))
            )
            return results.map(r => r.vector)
          }
        }
      })
      return true
    } catch {
      this.stats.errors++
      return false
    }
  }

  async deleteCollection(name: string): Promise<boolean> {
    try {
      if (!this.client) return false
      await this.client.deleteCollection({ name })
      return true
    } catch {
      this.stats.errors++
      return false
    }
  }

  async addDocuments(documents: VectorDocument[]): Promise<boolean> {
    try {
      if (!this.collection) return false

      const ids = documents.map(doc => doc.id)
      const texts = documents.map(doc => doc.content)
      const metadatas = documents.map(doc => ({
        ...doc.metadata,
        timestamp: doc.timestamp.toISOString()
      }))

      await this.collection.add({
        ids,
        documents: texts,
        metadatas
      })

      this.stats.indexedDocuments += documents.length
      return true
    } catch (error) {
      console.error(chalk.red(`❌ Failed to add documents: ${error}`))
      this.stats.errors++
      return false
    }
  }

  async updateDocument(document: VectorDocument): Promise<boolean> {
    try {
      await this.deleteDocument(document.id)
      return await this.addDocuments([document])
    } catch {
      this.stats.errors++
      return false
    }
  }

  async deleteDocument(id: string): Promise<boolean> {
    try {
      if (!this.collection) return false
      await this.collection.delete({ ids: [id] })
      return true
    } catch {
      this.stats.errors++
      return false
    }
  }

  async search(query: string, limit = 10, threshold = 0.3): Promise<VectorSearchResult[]> {
    const startTime = Date.now()

    try {
      if (!this.collection) return []

      const results = await this.collection.query({
        queryTexts: [query],
        nResults: limit
      })

      const searchResults: VectorSearchResult[] = []
      const documents = results.documents?.[0] || []
      const metadatas = results.metadatas?.[0] || []
      const distances = results.distances?.[0] || []

      for (let i = 0; i < documents.length; i++) {
        const score = 1 - (distances[i] || 1) // Convert distance to similarity
        if (score >= threshold) {
          searchResults.push({
            id: results.ids?.[0]?.[i] || '',
            content: documents[i] || '',
            score,
            metadata: metadatas[i] || {}
          })
        }
      }

      this.updateSearchStats(Date.now() - startTime)
      return searchResults.sort((a, b) => b.score - a.score)
    } catch (error) {
      console.error(chalk.red(`❌ ChromaDB search failed: ${error}`))
      this.stats.errors++
      return []
    }
  }

  async searchByVector(embedding: number[], limit = 10, threshold = 0.3): Promise<VectorSearchResult[]> {
    const startTime = Date.now()

    try {
      if (!this.collection) return []

      const results = await this.collection.query({
        queryEmbeddings: [embedding],
        nResults: limit
      })

      const searchResults: VectorSearchResult[] = []
      const documents = results.documents?.[0] || []
      const metadatas = results.metadatas?.[0] || []
      const distances = results.distances?.[0] || []

      for (let i = 0; i < documents.length; i++) {
        const score = 1 - (distances[i] || 1)
        if (score >= threshold) {
          searchResults.push({
            id: results.ids?.[0]?.[i] || '',
            content: documents[i] || '',
            score,
            metadata: metadatas[i] || {}
          })
        }
      }

      this.updateSearchStats(Date.now() - startTime)
      return searchResults.sort((a, b) => b.score - a.score)
    } catch (error) {
      console.error(chalk.red(`❌ ChromaDB vector search failed: ${error}`))
      this.stats.errors++
      return []
    }
  }

  async getDocument(id: string): Promise<VectorDocument | null> {
    try {
      if (!this.collection) return null

      const results = await this.collection.get({ ids: [id] })
      if (results.documents?.length > 0) {
        return {
          id,
          content: results.documents[0],
          metadata: results.metadatas?.[0] || {},
          timestamp: new Date(results.metadatas?.[0]?.timestamp || Date.now())
        }
      }
      return null
    } catch {
      this.stats.errors++
      return null
    }
  }

  async getDocumentsCount(): Promise<number> {
    try {
      if (!this.collection) return 0
      const results = await this.collection.count()
      this.stats.documentsCount = results
      return results
    } catch {
      this.stats.errors++
      return 0
    }
  }
}

/**
 * Local filesystem vector store implementation (fallback)
 */
class LocalVectorStore extends VectorStore {
  private documentsPath: string
  private indexPath: string
  private documents: Map<string, VectorDocument> = new Map()
  private index: Map<string, number[]> = new Map()

  constructor(config: VectorStoreConfig) {
    super(config)
    const baseDir = config.connectionConfig.baseDir || join(homedir(), '.nikcli', 'vector-store')
    this.documentsPath = join(baseDir, 'documents.json')
    this.indexPath = join(baseDir, 'index.json')
  }

  async connect(): Promise<boolean> {
    try {
      // Ensure directory exists
      const baseDir = this.config.connectionConfig.baseDir || join(homedir(), '.nikcli', 'vector-store')
      if (!existsSync(baseDir)) {
        mkdirSync(baseDir, { recursive: true })
      }

      await this.loadDocuments()
      await this.loadIndex()

      console.log(chalk.green(`✅ Local vector store connected (${this.documents.size} documents)`))
      return true
    } catch (error) {
      console.error(chalk.red(`❌ Local vector store connection failed: ${error}`))
      this.stats.errors++
      return false
    }
  }

  async disconnect(): Promise<void> {
    await this.saveDocuments()
    await this.saveIndex()
    console.log(chalk.gray('🔌 Local vector store disconnected'))
  }

  async healthCheck(): Promise<boolean> {
    this.stats.lastHealthCheck = new Date()
    return true
  }

  async createCollection(name: string): Promise<boolean> {
    // Collections are just logical separations in local store
    return true
  }

  async deleteCollection(name: string): Promise<boolean> {
    return true
  }

  async addDocuments(documents: VectorDocument[]): Promise<boolean> {
    try {
      for (const doc of documents) {
        // Generate embedding if not provided
        if (!doc.embedding) {
          const result = await unifiedEmbeddingInterface.generateEmbedding(doc.content, doc.id)
          doc.embedding = result.vector
        }

        this.documents.set(doc.id, doc)
        this.index.set(doc.id, doc.embedding)
      }

      this.stats.indexedDocuments += documents.length
      await this.saveDocuments()
      await this.saveIndex()
      return true
    } catch (error) {
      console.error(chalk.red(`❌ Failed to add documents to local store: ${error}`))
      this.stats.errors++
      return false
    }
  }

  async updateDocument(document: VectorDocument): Promise<boolean> {
    return await this.addDocuments([document])
  }

  async deleteDocument(id: string): Promise<boolean> {
    try {
      const deleted = this.documents.delete(id) && this.index.delete(id)
      if (deleted) {
        await this.saveDocuments()
        await this.saveIndex()
      }
      return deleted
    } catch {
      this.stats.errors++
      return false
    }
  }

  async search(query: string, limit = 10, threshold = 0.3): Promise<VectorSearchResult[]> {
    const startTime = Date.now()

    try {
      // Generate query embedding
      const queryResult = await unifiedEmbeddingInterface.generateEmbedding(query)
      return await this.searchByVector(queryResult.vector, limit, threshold)
    } catch (error) {
      console.error(chalk.red(`❌ Local search failed: ${error}`))
      this.stats.errors++
      return []
    } finally {
      this.updateSearchStats(Date.now() - startTime)
    }
  }

  async searchByVector(embedding: number[], limit = 10, threshold = 0.3): Promise<VectorSearchResult[]> {
    const startTime = Date.now()

    try {
      const results: VectorSearchResult[] = []

      for (const [id, docEmbedding] of this.index) {
        const similarity = unifiedEmbeddingInterface.calculateSimilarity(embedding, docEmbedding)

        if (similarity >= threshold) {
          const doc = this.documents.get(id)
          if (doc) {
            results.push({
              id,
              content: doc.content,
              score: similarity,
              metadata: doc.metadata,
              embedding: docEmbedding
            })
          }
        }
      }

      this.updateSearchStats(Date.now() - startTime)
      return results.sort((a, b) => b.score - a.score).slice(0, limit)
    } catch (error) {
      console.error(chalk.red(`❌ Local vector search failed: ${error}`))
      this.stats.errors++
      return []
    }
  }

  async getDocument(id: string): Promise<VectorDocument | null> {
    return this.documents.get(id) || null
  }

  async getDocumentsCount(): Promise<number> {
    this.stats.documentsCount = this.documents.size
    return this.documents.size
  }

  private async loadDocuments(): Promise<void> {
    try {
      if (existsSync(this.documentsPath)) {
        const data = await readFile(this.documentsPath, 'utf-8')
        const docs = JSON.parse(data)

        for (const [id, doc] of Object.entries(docs)) {
          const document = doc as any
          document.timestamp = new Date(document.timestamp)
          this.documents.set(id, document as VectorDocument)
        }
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Failed to load documents: ${error}`))
    }
  }

  private async saveDocuments(): Promise<void> {
    try {
      const data = Object.fromEntries(this.documents)
      await writeFile(this.documentsPath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Failed to save documents: ${error}`))
    }
  }

  private async loadIndex(): Promise<void> {
    try {
      if (existsSync(this.indexPath)) {
        const data = await readFile(this.indexPath, 'utf-8')
        const index = JSON.parse(data)
        this.index = new Map(Object.entries(index))
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Failed to load index: ${error}`))
    }
  }

  private async saveIndex(): Promise<void> {
    try {
      const data = Object.fromEntries(this.index)
      await writeFile(this.indexPath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Failed to save index: ${error}`))
    }
  }
}

/**
 * Vector Store Manager with automatic fallback and health monitoring
 */
export class VectorStoreManager {
  private stores: VectorStore[] = []
  private activeStore: VectorStore | null = null
  private fallbackStore: LocalVectorStore | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null
  private config: VectorStoreConfig

  constructor(configs: VectorStoreConfig[]) {
    // Initialize fallback config first
    const fallbackConfig: VectorStoreConfig = {
      provider: 'local',
      connectionConfig: {},
      collectionName: 'fallback',
      embeddingDimensions: 1536,
      indexingBatchSize: 100,
      maxRetries: 3,
      healthCheckInterval: 300000, // 5 minutes
      autoFallback: true
    }

    // Initialize stores based on configurations
    configs.forEach(config => {
      switch (config.provider) {
        case 'chromadb':
          this.stores.push(new ChromaDBVectorStore(config))
          break
        case 'local':
          const localStore = new LocalVectorStore(config)
          this.stores.push(localStore)
          if (!this.fallbackStore) {
            this.fallbackStore = localStore
          }
          break
        // Add other providers (Pinecone, Weaviate) here
      }
    })

    // Ensure we have a fallback store
    if (!this.fallbackStore) {
      this.fallbackStore = new LocalVectorStore(fallbackConfig)
      this.stores.push(this.fallbackStore)
    }

    this.config = configs[0] || fallbackConfig
  }

  /**
   * Initialize and connect to the best available vector store
   */
  async initialize(): Promise<boolean> {
    console.log(chalk.blue('🔌 Initializing vector store manager...'))

    // Try to connect to stores in order of preference
    for (const store of this.stores) {
      if (await store.connect()) {
        this.activeStore = store
        console.log(chalk.green(`✅ Connected to ${store.getStats().provider} vector store`))
        break
      }
    }

    // Fallback to local store if no other store connected
    if (!this.activeStore && this.fallbackStore) {
      console.log(chalk.yellow('⚠️ No vector stores available, using local fallback'))
      if (await this.fallbackStore.connect()) {
        this.activeStore = this.fallbackStore
      } else {
        console.error(chalk.red('❌ Failed to initialize any vector store'))
        return false
      }
    } else if (!this.activeStore) {
      console.error(chalk.red('❌ No vector stores configured'))
      return false
    }

    // Start health monitoring
    if (this.config.autoFallback) {
      this.startHealthMonitoring()
    }

    return true
  }

  /**
   * Shutdown vector store manager
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    for (const store of this.stores) {
      await store.disconnect()
    }

    console.log(chalk.gray('🔌 Vector store manager shut down'))
  }

  /**
   * Add documents to the active vector store
   */
  async addDocuments(documents: VectorDocument[]): Promise<boolean> {
    if (!this.activeStore) {
      console.error(chalk.red('❌ No active vector store'))
      return false
    }

    return await this.activeStore.addDocuments(documents)
  }

  /**
   * Search in the active vector store
   */
  async search(query: string, limit = 10, threshold = 0.3): Promise<VectorSearchResult[]> {
    if (!this.activeStore) {
      console.error(chalk.red('❌ No active vector store'))
      return []
    }

    return await this.activeStore.search(query, limit, threshold)
  }

  /**
   * Search by vector in the active vector store
   */
  async searchByVector(embedding: number[], limit = 10, threshold = 0.3): Promise<VectorSearchResult[]> {
    if (!this.activeStore) {
      console.error(chalk.red('❌ No active vector store'))
      return []
    }

    return await this.activeStore.searchByVector(embedding, limit, threshold)
  }

  /**
   * Get stats from active store
   */
  getStats(): VectorStoreStats | null {
    return this.activeStore?.getStats() || null
  }

  /**
   * Get stats from all stores
   */
  getAllStats(): Record<string, VectorStoreStats> {
    const stats: Record<string, VectorStoreStats> = {}
    this.stores.forEach(store => {
      const storeStats = store.getStats()
      stats[storeStats.provider] = storeStats
    })
    return stats
  }

  /**
   * Force fallback to a specific store
   */
  async fallbackTo(provider: string): Promise<boolean> {
    const targetStore = this.stores.find(store => store.getStats().provider === provider)

    if (targetStore && await targetStore.healthCheck()) {
      this.activeStore = targetStore
      console.log(chalk.blue(`🔄 Fallback to ${provider} vector store`))
      return true
    }

    return false
  }

  /**
   * Monitor health and handle automatic fallback
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (!this.activeStore) return

      const isHealthy = await this.activeStore.healthCheck()

      if (!isHealthy) {
        console.log(chalk.yellow(`⚠️ Vector store ${this.activeStore.getStats().provider} unhealthy, attempting fallback`))

        // Try to find a healthy alternative
        for (const store of this.stores) {
          if (store !== this.activeStore && await store.healthCheck()) {
            this.activeStore = store
            console.log(chalk.green(`✅ Fallback to ${store.getStats().provider} successful`))
            return
          }
        }

        // Fallback to local store if all else fails
        if (this.activeStore !== this.fallbackStore && this.fallbackStore) {
          if (await this.fallbackStore.healthCheck()) {
            this.activeStore = this.fallbackStore
            console.log(chalk.yellow('⚠️ Using local fallback store'))
          }
        }
      }
    }, this.config.healthCheckInterval)
  }
}

// Export convenience function to create vector store manager
export function createVectorStoreManager(configs: Partial<VectorStoreConfig>[]): VectorStoreManager {
  const fullConfigs: VectorStoreConfig[] = configs.map(config => ({
    provider: 'chromadb',
    connectionConfig: {},
    collectionName: 'nikcli_vectors',
    embeddingDimensions: 1536,
    indexingBatchSize: 100,
    maxRetries: 3,
    healthCheckInterval: 300000,
    autoFallback: true,
    ...config
  }))

  return new VectorStoreManager(fullConfigs)
}