import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { Redis } from '@upstash/redis'
import axios from 'axios'
import chalk from 'chalk'
import { ChromaClient, CloudClient } from 'chromadb'
import { advancedUI } from '../ui/advanced-cli-ui'
import { unifiedEmbeddingInterface } from './unified-embedding-interface'

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
  provider: 'chromadb' | 'pinecone' | 'weaviate' | 'local' | 'upstash'
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
      totalCost: 0,
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
          database: config.database || 'nikcli',
        })
        advancedUI.logFunctionUpdate('info', `Connecting to ChromaDB Cloud (${config.tenant})`, 'ℹ')
      } else {
        this.client = new ChromaClient({
          host: config.host || 'localhost',
          port: config.port || 8005,
          ssl: config.ssl || false,
        })
        console.log(
          chalk.gray(`🔗 Connecting to ChromaDB local (${config.host || 'localhost'}:${config.port || 8005})`)
        )
      }

      // Test connection
      const version = await this.client.version()
      console.log(chalk.green(`✓ ChromaDB connected (version: ${version})`))

      // Get or create collection with embedding function
      try {
        this.collection = await this.client.getCollection({
          name: this.config.collectionName,
        })

        // Check if collection has embedding function configured by testing a simple operation
        try {
          // Try to add a test document to verify embedding function works
          await this.collection.add({
            ids: ['test-embedding-check'],
            documents: ['test'],
            metadatas: [{ test: true }],
          })
          // Clean up test document
          await this.collection.delete({ ids: ['test-embedding-check'] })
          console.log(chalk.gray(`⚡︎ Using existing collection: ${this.config.collectionName}`))
        } catch (_embeddingError) {
          // Collection exists but has no embedding function, recreate it
          console.log(
            chalk.yellow(`⚠︎ Collection ${this.config.collectionName} lacks embedding function, recreating...`)
          )
          try {
            await this.client.deleteCollection({ name: this.config.collectionName })
          } catch (_deleteError) {
            console.log(chalk.yellow(`⚠︎ Failed to delete collection, will attempt recreation anyway`))
          }
          throw new Error('Recreate collection')
        }
      } catch (_createError) {
        try {
          this.collection = await this.client.createCollection({
            name: this.config.collectionName,
            embeddingFunction: {
              generate: async (texts: string[]) => {
                const results = await unifiedEmbeddingInterface.generateEmbeddings(texts.map((text) => ({ text })))
                return results.map((r) => r.vector)
              },
            },
          })
          console.log(chalk.green(`✓ Created new collection: ${this.config.collectionName}`))
        } catch (finalError) {
          console.error(chalk.red(`✖ Failed to create collection: ${(finalError as Error).message}`))
          throw finalError
        }
      }

      return true
    } catch (error) {
      console.error(chalk.red(`✖ ChromaDB connection failed: ${(error as Error).message}`))
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
            const results = await unifiedEmbeddingInterface.generateEmbeddings(texts.map((text) => ({ text })))
            return results.map((r) => r.vector)
          },
        },
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

      const ids = documents.map((doc) => doc.id)
      const texts = documents.map((doc) => doc.content)
      const metadatas = documents.map((doc) => ({
        ...doc.metadata,
        timestamp: doc.timestamp.toISOString(),
      }))

      // Check if documents have pre-computed embeddings
      const hasEmbeddings = documents.some((doc) => doc.embedding && doc.embedding.length > 0)

      if (hasEmbeddings) {
        // Use pre-computed embeddings
        const embeddings = documents.map((doc) => doc.embedding || [])
        await this.collection.add({
          ids,
          documents: texts,
          metadatas,
          embeddings,
        })
      } else {
        // Let ChromaDB generate embeddings using the configured function
        await this.collection.add({
          ids,
          documents: texts,
          metadatas,
        })
      }

      this.stats.indexedDocuments += documents.length
      return true
    } catch (error) {
      console.error(chalk.red(`✖ Failed to add documents: ${error}`))
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
        nResults: limit,
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
            metadata: metadatas[i] || {},
          })
        }
      }

      this.updateSearchStats(Date.now() - startTime)
      return searchResults.sort((a, b) => b.score - a.score)
    } catch (error) {
      console.error(chalk.red(`✖ ChromaDB search failed: ${error}`))
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
        nResults: limit,
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
            metadata: metadatas[i] || {},
          })
        }
      }

      this.updateSearchStats(Date.now() - startTime)
      return searchResults.sort((a, b) => b.score - a.score)
    } catch (error) {
      console.error(chalk.red(`✖ ChromaDB vector search failed: ${error}`))
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
          timestamp: new Date(results.metadatas?.[0]?.timestamp || Date.now()),
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
 * Upstash (Redis) vector store implementation
 */
class UpstashVectorStore extends VectorStore {
  private redis: Redis | null = null
  private indexKey: string = ''
  private mode: 'redis' | 'vector' = 'redis'
  private vectorBaseUrl: string | null = null
  private vectorToken: string | null = null

  async connect(): Promise<boolean> {
    try {
      const cfg = this.config.connectionConfig || {}
      const vectorUrl: string | undefined = cfg.vectorUrl || process.env.UPSTASH_VECTOR_REST_URL
      const vectorToken: string | undefined = cfg.vectorToken || process.env.UPSTASH_VECTOR_REST_TOKEN
      const redisUrl: string | undefined = cfg.redisUrl || process.env.UPSTASH_REDIS_REST_URL
      const redisToken: string | undefined = cfg.redisToken || process.env.UPSTASH_REDIS_REST_TOKEN

      if (vectorUrl && vectorToken) {
        // Use Upstash Vector REST API
        this.mode = 'vector'
        this.vectorBaseUrl = vectorUrl
        this.vectorToken = vectorToken
        this.indexKey = `vec:index:${this.config.collectionName}`
        console.log(chalk.gray('🔗 Using Upstash Vector (REST)'))
        console.log(chalk.gray(`   URL: ${vectorUrl}`))
        console.log(chalk.gray(`   Collection: ${this.config.collectionName}`))

        // Quick health check to ensure reachable
        try {
          const response = await axios.get(`${vectorUrl}/info`, {
            headers: { Authorization: `Bearer ${vectorToken}` },
            timeout: 5000,
          })
          console.log(chalk.green(`✓ Upstash Vector connected (dimension: ${response.data?.dimension || 'unknown'})`))
        } catch (error: any) {
          // Try without /info endpoint
          console.log(chalk.yellow(`⚠︎ Vector info check failed: ${error.message}`))
          console.log(chalk.gray('   Proceeding anyway (endpoint may not support /info)'))
        }
        console.log(chalk.green('✓ Upstash Vector ready'))
        return true
      }

      if (redisUrl && redisToken) {
        // Fallback to Upstash Redis (manual vector store)
        this.mode = 'redis'
        this.redis = new Redis({ url: redisUrl, token: redisToken })
        this.indexKey = `vec:index:${this.config.collectionName}`
        console.log(chalk.gray('🔗 Connecting to Upstash Redis (vector store)'))
        try {
          await this.redis.ping()
        } catch (_e) { }
        console.log(chalk.green('✓ Upstash Redis connected'))
        return true
      }

      console.log(
        chalk.yellow('⚠︎ Upstash not configured. Set UPSTASH_VECTOR_REST_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN')
      )
      return false
    } catch (error) {
      console.error(chalk.red(`✖ Upstash connection failed: ${String(error)}`))
      this.stats.errors++
      return false
    }
  }

  async disconnect(): Promise<void> {
    // Upstash clients are stateless over REST; noop
    this.redis = null
    console.log(chalk.gray('🔌 Upstash Redis disconnected'))
  }

  async healthCheck(): Promise<boolean> {
    try {
      // If using Upstash Vector REST, probe the /info endpoint (or a lightweight request)
      if (this.mode === 'vector' && this.vectorBaseUrl && this.vectorToken) {
        try {
          await axios.get(`${this.vectorBaseUrl}/info`, {
            headers: { Authorization: `Bearer ${this.vectorToken}` },
            timeout: 3000,
          })
          this.stats.lastHealthCheck = new Date()
          return true
        } catch (_e) {
          // If /info is unsupported, try a minimal POST to /query with empty vector to validate service
          try {
            await axios.post(
              `${this.vectorBaseUrl}/query`,
              { vector: [0], top_k: 1 },
              { headers: { Authorization: `Bearer ${this.vectorToken}` }, timeout: 3000 }
            )
            this.stats.lastHealthCheck = new Date()
            return true
          } catch (__e) {
            this.stats.errors++
            return false
          }
        }
      }

      // Redis-backed (manual) mode
      if (!this.redis) return false
      // ping may not be supported everywhere; treat as healthy if client exists
      this.stats.lastHealthCheck = new Date()
      return true
    } catch {
      this.stats.errors++
      return false
    }
  }

  async createCollection(_name: string): Promise<boolean> {
    // Logical collection via key prefix; no action needed
    return true
  }

  async deleteCollection(_name: string): Promise<boolean> {
    // Not implemented to avoid accidental mass-deletes over REST
    return true
  }

  async addDocuments(documents: VectorDocument[]): Promise<boolean> {
    try {
      for (const doc of documents) {
        if (!doc.embedding || doc.embedding.length === 0) {
          try {
            const result = await unifiedEmbeddingInterface.generateEmbedding(doc.content, doc.id)
            if (result && result.vector) {
              doc.embedding = result.vector
            } else {
              console.warn(chalk.yellow(`⚠︎ No embedding generated for document ${doc.id}`))
              continue // Skip this document
            }
          } catch (error) {
            console.error(chalk.red(`✖ Failed to generate embedding for document ${doc.id}: ${(error as Error).message}`))
            continue // Skip this document
          }
        }

        if (this.mode === 'vector' && this.vectorBaseUrl && this.vectorToken) {
          // Upstash Vector upsert
          const body: any = {
            id: doc.id,
            vector: doc.embedding,
            metadata: { ...doc.metadata, content: doc.content, timestamp: doc.timestamp.toISOString() },
          }
          await axios.post(`${this.vectorBaseUrl}/upsert`, body, {
            headers: { Authorization: `Bearer ${this.vectorToken}` },
          })
        } else if (this.redis) {
          // Redis manual store
          const key = `vec:doc:${this.config.collectionName}:${doc.id}`
          const payload = {
            id: doc.id,
            content: doc.content,
            embedding: doc.embedding,
            metadata: doc.metadata,
            timestamp: doc.timestamp.toISOString(),
          }
          await this.redis.set(key, JSON.stringify(payload))
          await this.redis.sadd(this.indexKey, key)
        }
      }

      this.stats.indexedDocuments += documents.length
      return true
    } catch (error) {
      console.error(chalk.red(`✖ Failed to add documents to Upstash: ${String(error)}`))
      this.stats.errors++
      return false
    }
  }

  async updateDocument(document: VectorDocument): Promise<boolean> {
    return await this.addDocuments([document])
  }

  async deleteDocument(id: string): Promise<boolean> {
    try {
      if (this.mode === 'vector' && this.vectorBaseUrl && this.vectorToken) {
        try {
          await axios.post(
            `${this.vectorBaseUrl}/delete`,
            { id },
            { headers: { Authorization: `Bearer ${this.vectorToken}` } }
          )
        } catch (_e) { }
        return true
      }

      if (this.redis) {
        const key = `vec:doc:${this.config.collectionName}:${id}`
        await this.redis.del(key)
        await this.redis.srem(this.indexKey, key)
        return true
      }
      return false
    } catch {
      this.stats.errors++
      return false
    }
  }

  async search(query: string, limit = 10, threshold = 0.3): Promise<VectorSearchResult[]> {
    // Naive client-side KNN using stored vectors
    const start = Date.now()
    try {
      const queryEmbedding = (await unifiedEmbeddingInterface.generateEmbedding(query)).vector

      if (this.mode === 'vector' && this.vectorBaseUrl && this.vectorToken) {
        const body: any = { vector: queryEmbedding, top_k: limit, include_metadata: true }
        const res = await axios.post(`${this.vectorBaseUrl}/query`, body, {
          headers: { Authorization: `Bearer ${this.vectorToken}` },
        })
        const items: any[] =
          (res.data?.result as any[]) || (res.data?.results as any[]) || (res.data?.vectors as any[]) || []
        const results: VectorSearchResult[] = []
        for (const item of items) {
          const score = typeof item.score === 'number' ? item.score : 1 - (item.distance ?? 1)
          if (score >= threshold) {
            const md = item.metadata || {}
            results.push({
              id: item.id || '',
              content: md.content || '',
              score,
              metadata: md,
            })
          }
        }
        this.updateSearchStats(Date.now() - start)
        return results.sort((a, b) => b.score - a.score).slice(0, limit)
      }

      if (!this.redis) return []
      const rawKeys = await this.redis.smembers(this.indexKey)
      const keys = (rawKeys as unknown as string[]) || []
      const results: VectorSearchResult[] = []
      for (const key of keys) {
        const raw = await this.redis.get<string>(key)
        if (!raw) continue
        const data = JSON.parse(raw)
        const embedding: number[] = data.embedding || []
        if (embedding.length === 0) continue
        const score = unifiedEmbeddingInterface.calculateSimilarity(queryEmbedding, embedding)
        if (score >= threshold) {
          results.push({ id: data.id, content: data.content, score, metadata: data.metadata || {} })
        }
      }
      this.updateSearchStats(Date.now() - start)
      return results.sort((a, b) => b.score - a.score).slice(0, limit)
    } catch (error) {
      console.error(chalk.red(`✖ Upstash search failed: ${String(error)}`))
      this.stats.errors++
      return []
    }
  }

  async searchByVector(embedding: number[], limit = 10, threshold = 0.3): Promise<VectorSearchResult[]> {
    const start = Date.now()
    try {
      if (this.mode === 'vector' && this.vectorBaseUrl && this.vectorToken) {
        const body: any = { vector: embedding, top_k: limit, include_metadata: true }
        const res = await axios.post(`${this.vectorBaseUrl}/query`, body, {
          headers: { Authorization: `Bearer ${this.vectorToken}` },
        })
        const items: any[] =
          (res.data?.result as any[]) || (res.data?.results as any[]) || (res.data?.vectors as any[]) || []
        const results: VectorSearchResult[] = []
        for (const item of items) {
          const score = typeof item.score === 'number' ? item.score : 1 - (item.distance ?? 1)
          if (score >= threshold) {
            const md = item.metadata || {}
            results.push({
              id: item.id || '',
              content: md.content || '',
              score,
              metadata: md,
              embedding: Array.isArray(item.vector) ? (item.vector as number[]) : undefined,
            })
          }
        }
        this.updateSearchStats(Date.now() - start)
        return results.sort((a, b) => b.score - a.score).slice(0, limit)
      }

      if (!this.redis) return []
      const rawKeys = await this.redis.smembers(this.indexKey)
      const keys = (rawKeys as unknown as string[]) || []
      const results: VectorSearchResult[] = []
      for (const key of keys) {
        const raw = await this.redis.get<string>(key)
        if (!raw) continue
        const data = JSON.parse(raw)
        const docEmbedding: number[] = data.embedding || []
        if (docEmbedding.length === 0) continue
        const score = unifiedEmbeddingInterface.calculateSimilarity(embedding, docEmbedding)
        if (score >= threshold) {
          results.push({
            id: data.id,
            content: data.content,
            score,
            metadata: data.metadata || {},
            embedding: docEmbedding,
          })
        }
      }
      this.updateSearchStats(Date.now() - start)
      return results.sort((a, b) => b.score - a.score).slice(0, limit)
    } catch (error) {
      console.error(chalk.red(`✖ Upstash vector search failed: ${String(error)}`))
      this.stats.errors++
      return []
    }
  }

  async getDocument(id: string): Promise<VectorDocument | null> {
    try {
      if (this.mode === 'vector' && this.vectorBaseUrl && this.vectorToken) {
        // No direct get endpoint spec; emulate via metadata query by id if available
        // Fallback: return null
        return null
      }
      if (!this.redis) return null
      const key = `vec:doc:${this.config.collectionName}:${id}`
      const raw = await this.redis.get<string>(key)
      if (!raw) return null
      const data = JSON.parse(raw)
      return {
        id: data.id,
        content: data.content,
        metadata: data.metadata || {},
        embedding: data.embedding || [],
        timestamp: new Date(data.timestamp || Date.now()),
      }
    } catch {
      this.stats.errors++
      return null
    }
  }

  async getDocumentsCount(): Promise<number> {
    try {
      if (!this.redis) return 0
      const count = await this.redis.scard(this.indexKey)
      this.stats.documentsCount = Number(count || 0)
      return this.stats.documentsCount
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

      console.log(chalk.green(`✓ Local vector store connected (${this.documents.size} documents)`))
      return true
    } catch (error) {
      console.error(chalk.red(`✖ Local vector store connection failed: ${error}`))
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

  async createCollection(_name: string): Promise<boolean> {
    // Collections are just logical separations in local store
    return true
  }

  async deleteCollection(_name: string): Promise<boolean> {
    return true
  }

  async addDocuments(documents: VectorDocument[]): Promise<boolean> {
    try {
      for (const doc of documents) {
        // Generate embedding if not provided
        if (!doc.embedding) {
          try {
            const result = await unifiedEmbeddingInterface.generateEmbedding(doc.content, doc.id)
            if (result && result.vector) {
              doc.embedding = result.vector
            } else {
              console.warn(chalk.yellow(`⚠︎ No embedding generated for document ${doc.id}, skipping`))
              continue // Skip this document
            }
          } catch (error) {
            console.error(chalk.red(`✖ Failed to generate embedding for document ${doc.id}: ${(error as Error).message}`))
            continue // Skip this document
          }
        }

        this.documents.set(doc.id, doc)
        this.index.set(doc.id, doc.embedding)
      }

      this.stats.indexedDocuments += documents.length
      await this.saveDocuments()
      await this.saveIndex()
      return true
    } catch (error) {
      console.error(chalk.red(`✖ Failed to add documents to local store: ${error}`))
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
      console.error(chalk.red(`✖ Local search failed: ${error}`))
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
              embedding: docEmbedding,
            })
          }
        }
      }

      this.updateSearchStats(Date.now() - startTime)
      return results.sort((a, b) => b.score - a.score).slice(0, limit)
    } catch (error) {
      console.error(chalk.red(`✖ Local vector search failed: ${error}`))
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
      console.warn(chalk.yellow(`⚠︎ Failed to load documents: ${error}`))
    }
  }

  private async saveDocuments(): Promise<void> {
    try {
      // Ensure directory exists before saving
      const dir = dirname(this.documentsPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const data = Object.fromEntries(this.documents)
      await writeFile(this.documentsPath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.warn(chalk.yellow(`⚠︎ Failed to save documents: ${error}`))
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
      console.warn(chalk.yellow(`⚠︎ Failed to load index: ${error}`))
    }
  }

  private async saveIndex(): Promise<void> {
    try {
      // Ensure directory exists before saving
      const dir = dirname(this.indexPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const data = Object.fromEntries(this.index)
      await writeFile(this.indexPath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.warn(chalk.yellow(`⚠︎ Failed to save index: ${error}`))
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
      embeddingDimensions: unifiedEmbeddingInterface.getCurrentDimensions(),
      indexingBatchSize: 100,
      maxRetries: 3,
      healthCheckInterval: 300000, // 5 minutes
      autoFallback: true,
    }

    // Initialize stores based on configurations
    configs.forEach((config) => {
      switch (config.provider) {
        case 'chromadb':
          this.stores.push(new ChromaDBVectorStore(config))
          break
        case 'upstash':
          this.stores.push(new UpstashVectorStore(config))
          break
        case 'local': {
          const localStore = new LocalVectorStore(config)
          this.stores.push(localStore)
          if (!this.fallbackStore) {
            this.fallbackStore = localStore
          }
          break
        }
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
    advancedUI.logFunctionCall('vectorstoremanagerinit')
    advancedUI.logFunctionUpdate('info', 'Initializing vector store manager...', 'ℹ')

    // Try to connect to stores in order of preference
    for (const store of this.stores) {
      if (await store.connect()) {
        this.activeStore = store
        console.log(chalk.green(`✓ Connected to ${store.getStats().provider} vector store`))
        break
      }
    }

    // Fallback to local store if no other store connected
    if (!this.activeStore && this.fallbackStore) {
      console.log(chalk.yellow('⚠︎ No vector stores available, using local fallback'))
      if (await this.fallbackStore.connect()) {
        this.activeStore = this.fallbackStore
      } else {
        console.error(chalk.red('✖ Failed to initialize any vector store'))
        return false
      }
    } else if (!this.activeStore) {
      console.error(chalk.red('✖ No vector stores configured'))
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
      console.error(chalk.red('✖ No active vector store'))
      return false
    }

    const broadcastWrites = process.env.VECTOR_BROADCAST_WRITES === 'true'
    if (broadcastWrites) {
      const results = await Promise.allSettled(this.stores.map((store) => store.addDocuments(documents)))
      const success = results.some((r) => r.status === 'fulfilled' && r.value)
      if (!success) {
        console.log(chalk.yellow('⚠︎ Broadcast writes failed on all stores'))
      }
      return success
    }

    return await this.activeStore.addDocuments(documents)
  }

  /**
   * Search in the active vector store
   */
  async search(query: string, limit = 10, threshold = 0.3): Promise<VectorSearchResult[]> {
    if (!this.activeStore) {
      console.error(chalk.red('✖ No active vector store'))
      return []
    }

    return await this.activeStore.search(query, limit, threshold)
  }

  /**
   * Search by vector in the active vector store
   */
  async searchByVector(embedding: number[], limit = 10, threshold = 0.3): Promise<VectorSearchResult[]> {
    if (!this.activeStore) {
      console.error(chalk.red('✖ No active vector store'))
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
    this.stores.forEach((store) => {
      const storeStats = store.getStats()
      stats[storeStats.provider] = storeStats
    })
    return stats
  }

  /**
   * Force fallback to a specific store
   */
  async fallbackTo(provider: string): Promise<boolean> {
    const targetStore = this.stores.find((store) => store.getStats().provider === provider)

    if (targetStore && (await targetStore.healthCheck())) {
      this.activeStore = targetStore
      console.log(chalk.blue(`⚡︎ Fallback to ${provider} vector store`))
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
        console.log(
          chalk.yellow(`⚠︎ Vector store ${this.activeStore.getStats().provider} unhealthy, attempting fallback`)
        )

        // Try to find a healthy alternative
        for (const store of this.stores) {
          if (store !== this.activeStore && (await store.healthCheck())) {
            this.activeStore = store
            console.log(chalk.green(`✓ Fallback to ${store.getStats().provider} successful`))
            return
          }
        }

        // Fallback to local store if all else fails
        if (this.activeStore !== this.fallbackStore && this.fallbackStore) {
          if (await this.fallbackStore.healthCheck()) {
            this.activeStore = this.fallbackStore
            console.log(chalk.yellow('⚠︎ Using local fallback store'))
          }
        }
      }
    }, this.config.healthCheckInterval)
  }
}

// Export convenience function to create vector store manager
export function createVectorStoreManager(configs: Partial<VectorStoreConfig>[]): VectorStoreManager {
  const fullConfigs: VectorStoreConfig[] = configs.map((config) => ({
    provider: 'chromadb',
    connectionConfig: {},
    collectionName: 'nikcli_vectors',
    embeddingDimensions: 1536,
    indexingBatchSize: 100,
    maxRetries: 3,
    healthCheckInterval: 300000,
    autoFallback: true,
    ...config,
  }))

  return new VectorStoreManager(fullConfigs)
}
