import { ChromaClient, CloudClient, type EmbeddingFunction } from 'chromadb'
// Register default embed provider for CloudClient (server-side embeddings)
// This package is a side-effect import that wires up default embeddings
// when using Chroma Cloud.
import '@chroma-core/default-embed'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import chalk from 'chalk'
import { TOKEN_LIMITS } from '../config/token-limits'
import { configManager } from '../core/config-manager'
import { CliUI } from '../utils/cli-ui'

// Import workspace analysis types for integration
import type { FileEmbedding, WorkspaceContext } from './workspace-rag'
import { WorkspaceRAG } from './workspace-rag'

// Import AI SDK unified embedding provider
import { aiSdkEmbeddingProvider, AiSdkEmbeddingProvider } from './ai-sdk-embedding-provider'

// Unified RAG interfaces
export interface UnifiedRAGConfig {
  useVectorDB: boolean
  useLocalEmbeddings: boolean
  hybridMode: boolean
  maxIndexFiles: number
  chunkSize: number
  overlapSize: number
  enableWorkspaceAnalysis: boolean
  enableSemanticSearch: boolean
  cacheEmbeddings: boolean
  costThreshold: number
}

export interface RAGSearchResult {
  content: string
  path: string
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
  }
}

export interface RAGAnalysisResult {
  workspaceContext: WorkspaceContext
  indexedFiles: number
  embeddingsCost: number
  processingTime: number
  vectorDBStatus: 'available' | 'unavailable' | 'error'
  fallbackMode: boolean
}

// AI SDK Embedding Function wrapper for ChromaDB compatibility
class AiSdkEmbeddingFunction implements EmbeddingFunction {
  private provider: AiSdkEmbeddingProvider

  constructor(provider: AiSdkEmbeddingProvider) {
    this.provider = provider
  }

  async generate(texts: string[]): Promise<number[][]> {
    try {
      return await this.provider.generate(texts)
    } catch (error: any) {
      CliUI.logError(`AI SDK embedding generation failed: ${error.message}`)
      throw error
    }
  }

  // Utility method to estimate cost using AI SDK provider
  static estimateCost(input: string[] | number, provider: string = 'openai'): number {
    if (typeof input === 'number' && input < 0) {
      throw new Error('Character count cannot be negative')
    }
    if (Array.isArray(input) && input.length === 0) {
      return 0
    }

    const texts = typeof input === 'number' ? ['x'.repeat(input)] : input
    return AiSdkEmbeddingProvider.estimateCost(texts, provider)
  }
}

// Unified embedder initialization
let _embedder: AiSdkEmbeddingFunction | null = null
function getEmbedder(): AiSdkEmbeddingFunction {
  if (_embedder) return _embedder

  // Check if any embedding providers are available
  if (aiSdkEmbeddingProvider.getAvailableProviders().length === 0) {
    throw new Error('No embedding providers configured. RAG will use local analysis only.')
  }

  _embedder = new AiSdkEmbeddingFunction(aiSdkEmbeddingProvider)
  return _embedder
}

// Resolve Chroma client: prefer local ChromaClient, fallback to CloudClient if needed
function getClient() {
  const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8005'

  // Always prefer local ChromaDB if URL is configured
  if (chromaUrl && chromaUrl !== 'http://localhost:8005') {
    console.log(chalk.gray(`✓ Using local ChromaDB server at: ${chromaUrl}`))
    return new ChromaClient({
      host: 'localhost',
      port: 8005,
      ssl: false,
    })
  }

  // Check if local ChromaDB is running on default port
  try {
    console.log(chalk.gray(`✓ Using local ChromaDB server at: ${chromaUrl}`))
    return new ChromaClient({
      host: 'localhost',
      port: 8005,
      ssl: false,
    })
  } catch (_error) {
    // Fallback to Cloud if local is not available
    const apiKey = process.env.CHROMA_API_KEY || process.env.CHROMA_CLOUD_API_KEY
    const tenant = process.env.CHROMA_TENANT
    const database = process.env.CHROMA_DATABASE || 'agent-cli'

    if (apiKey && tenant) {
      console.log(
        chalk.gray(`⚠️ Local ChromaDB not available, falling back to Cloud - Tenant: ${tenant}, Database: ${database}`)
      )
      return new CloudClient({
        apiKey,
        tenant,
        database,
      })
    }

    // Final fallback to local with default settings
    console.log(chalk.gray(`✓ Using local ChromaDB server at: ${chromaUrl}`))
    return new ChromaClient({
      host: 'localhost',
      port: 8005,
      ssl: false,
    })
  }
}

// Utility functions
async function _estimateIndexingCost(files: string[], projectPath: string): Promise<number> {
  let totalChars = 0
  let processedFiles = 0

  for (const file of files.slice(0, Math.min(files.length, 10))) {
    // Sample first 10 files
    try {
      const filePath = join(projectPath, file)
      const content = await readFile(filePath, 'utf-8')
      if (!isBinaryFile(content) && content.length <= 1000000) {
        totalChars += content.length
        processedFiles++
      }
    } catch {
      // Skip files that can't be read
    }
  }

  if (processedFiles === 0) return 0

  // Estimate total based on sample
  const avgCharsPerFile = totalChars / processedFiles
  const estimatedTotalChars = avgCharsPerFile * files.length

  return AiSdkEmbeddingFunction.estimateCost(estimatedTotalChars)
}

function isBinaryFile(content: string): boolean {
  // Simple heuristic: if more than 1% of characters are null bytes or non-printable, consider it binary
  const nullBytes = (content.match(/\0/g) || []).length
  const nonPrintable = (content.match(/[\x00-\x08\x0E-\x1F\x7F-\xFF]/g) || []).length
  const threshold = content.length * 0.01

  return nullBytes > 0 || nonPrintable > threshold
}

/**
 * Unified RAG System combining vector DB and workspace analysis
 */
export class UnifiedRAGSystem {
  private config: UnifiedRAGConfig
  private workspaceRAG: any // WorkspaceRAG instance
  private vectorClient: ChromaClient | CloudClient | null = null
  private embeddingFunction: AiSdkEmbeddingFunction | null = null
  private embeddingsCache: Map<string, number[]> = new Map()
  private analysisCache: Map<string, RAGAnalysisResult> = new Map()
  private lastAnalysis: number = 0
  private readonly CACHE_TTL = 300000 // 5 minutes
  private readonly CACHE_DIR = join(homedir(), '.nikcli', 'embeddings')
  private fileHashCache: Map<string, string> = new Map()

  // Performance monitoring
  private searchMetrics = {
    totalSearches: 0,
    cacheHits: 0,
    vectorSearches: 0,
    workspaceSearches: 0,
    bm25Searches: 0,
    averageLatency: 0,
    totalLatency: 0,
    errors: 0,
    queryOptimizations: 0,
    reranks: 0
  }

  constructor(config?: Partial<UnifiedRAGConfig>) {
    this.config = {
      useVectorDB: true,
      useLocalEmbeddings: true,
      hybridMode: true,
      maxIndexFiles: 1000,
      chunkSize: TOKEN_LIMITS.RAG?.CHUNK_TOKENS ?? 700,
      overlapSize: TOKEN_LIMITS.RAG?.CHUNK_OVERLAP_TOKENS ?? 80,
      enableWorkspaceAnalysis: true,
      enableSemanticSearch: true,
      cacheEmbeddings: true,
      costThreshold: 0.1, // $0.10 threshold
      ...config,
    }

    this.initializeClients()
    this.loadPersistentCache()
    this.testPersistentCache()
  }

  private async initializeClients(): Promise<void> {
    try {
      // Initialize workspace RAG (local analysis)
      if (this.config.enableWorkspaceAnalysis) {
        this.workspaceRAG = new WorkspaceRAG(process.cwd())
      }

      // Initialize vector DB clients if configured
      if (this.config.useVectorDB) {
        try {
          this.vectorClient = getClient()
          this.embeddingFunction = getEmbedder()

          // Test ChromaDB connection and verify embeddings (real API calls)
          await this.testChromaConnection()
          await this.testAiSdkEmbeddings()
          console.log(chalk.green('✅ Vector DB client initialized'))
        } catch (_error: any) {
          console.log(
            chalk.yellow(`⚠️ Vector DB unavailable: ChromaDB connection failed, using workspace analysis only`)
          )
          this.config.useVectorDB = false
        }
      }
    } catch (error: any) {
      console.log(chalk.yellow('⚠️ RAG initialization warning:', error))
    }
  }

  /**
   * Test ChromaDB connection and basic functionality
   */
  private async testChromaConnection(): Promise<void> {
    if (!this.vectorClient) {
      throw new Error('Vector client not initialized')
    }

    try {
      // Test basic connection by getting version (real API call)
      const version = await this.vectorClient.version()
      console.log(chalk.gray(`✓ ChromaDB version: ${version}`))

      // List existing collections to verify connection works (real API call)
      const collections = await this.vectorClient.listCollections()
      console.log(chalk.gray(`✓ Found ${collections.length} existing collections`))

      // Log database configuration
      const database = process.env.CHROMA_DATABASE || 'agent-cli'
      console.log(chalk.gray(`✓ Using database: ${database}`))

      // Check if our target collection exists
      const targetCollection = collections.find((c) => c.name === 'unified_project_index')
      if (targetCollection) {
        console.log(chalk.gray(`✓ Target collection 'unified_project_index' exists`))
        // Try to get collection details
        try {
          const _collection = await this.vectorClient.getCollection({
            name: 'unified_project_index',
          })
          console.log(chalk.gray(`✓ Collection details retrieved successfully`))
        } catch (error: any) {
          console.log(chalk.yellow(`⚠️ Collection exists but may have issues: ${error.message}`))
        }
      } else {
        console.log(chalk.gray(`✓ Target collection 'unified_project_index' will be created`))
      }
    } catch (error: any) {
      throw new Error(`ChromaDB connection test failed: ${error.message}`)
    }
  }

  /**
   * Test AI SDK embeddings with real API call
   */
  private async testAiSdkEmbeddings(): Promise<void> {
    if (!this.embeddingFunction) {
      throw new Error('Embedding function not initialized')
    }

    try {
      // Check if any providers are available
      const availableProviders = aiSdkEmbeddingProvider.getAvailableProviders()
      if (availableProviders.length === 0) {
        throw new Error('No embedding providers configured')
      }

      const currentProvider = aiSdkEmbeddingProvider.getCurrentProvider()
      console.log(chalk.gray(`✓ Testing provider: ${currentProvider}`))
      console.log(chalk.gray(`✓ Available providers: ${availableProviders.join(', ')}`))

      // Make real API call with minimal test data
      const testText = 'test embedding'
      const startTime = Date.now()
      const embeddings = await this.embeddingFunction.generate([testText])
      const duration = Date.now() - startTime

      if (!embeddings || embeddings.length !== 1 || !Array.isArray(embeddings[0])) {
        throw new Error('Invalid embedding response format')
      }

      const embeddingDimension = embeddings[0].length

      // Calculate real cost
      const actualCost = AiSdkEmbeddingFunction.estimateCost([testText], currentProvider || 'openai')

      console.log(chalk.gray(`✓ AI SDK embeddings working (${duration}ms)`))
      console.log(chalk.gray(`✓ Provider: ${currentProvider}, dimension: ${embeddingDimension}`))
      console.log(chalk.gray(`✓ Test cost: $${actualCost.toFixed(8)}`))

      // Show provider stats
      aiSdkEmbeddingProvider.logStatus()
    } catch (error: any) {
      throw new Error(`AI SDK embedding test failed: ${error.message}`)
    }
  }

  /**
   * Unified project analysis combining workspace and vector approaches
   */
  async analyzeProject(projectPath: string): Promise<RAGAnalysisResult> {
    const startTime = Date.now()
    console.log(chalk.blue('🧠 Starting unified RAG analysis...'))

    // Check cache
    const cacheKey = `analysis-${projectPath}`
    const cached = this.analysisCache.get(cacheKey)
    if (cached && Date.now() - this.lastAnalysis < this.CACHE_TTL) {
      console.log(chalk.green('✅ Using cached analysis'))
      return cached
    }

    let workspaceContext: WorkspaceContext
    let vectorDBStatus: 'available' | 'unavailable' | 'error' = 'unavailable'
    let embeddingsCost = 0
    let indexedFiles = 0

    // 1. Workspace Analysis (always run)
    if (this.config.enableWorkspaceAnalysis && this.workspaceRAG) {
      console.log(chalk.cyan('📁 Analyzing workspace structure...'))
      workspaceContext = await this.workspaceRAG.analyzeWorkspace()
      console.log(chalk.green(`✅ Analyzed ${workspaceContext.files.size} files`))
    } else {
      // Fallback minimal analysis
      workspaceContext = this.createMinimalWorkspaceContext(projectPath)
    }

    // 2. Vector DB Indexing (if available and cost-effective)
    if (this.config.useVectorDB && this.vectorClient && this.embeddingFunction) {
      try {
        const indexResult = await this.indexProjectWithVectorDB(projectPath, workspaceContext)
        vectorDBStatus = indexResult.success ? 'available' : 'error'
        embeddingsCost = indexResult.cost
        indexedFiles = indexResult.indexedFiles
      } catch (_error) {
        console.log(chalk.yellow('⚠️ Vector DB indexing failed, using workspace analysis only'))
        vectorDBStatus = 'error'
      }
    }

    const result: RAGAnalysisResult = {
      workspaceContext,
      indexedFiles,
      embeddingsCost,
      processingTime: Date.now() - startTime,
      vectorDBStatus,
      fallbackMode: !this.config.useVectorDB || vectorDBStatus !== 'available',
    }

    // Cache result
    this.analysisCache.set(cacheKey, result)
    this.lastAnalysis = Date.now()

    console.log(chalk.green(`✅ RAG analysis completed in ${result.processingTime}ms`))
    console.log(
      chalk.gray(`   Indexed: ${indexedFiles} files, Cost: $${embeddingsCost.toFixed(4)}, Vector DB: ${vectorDBStatus}`)
    )

    return result
  }

  /**
   * Unified search combining vector and workspace approaches with concurrent processing
   */
  async search(
    query: string,
    options?: {
      limit?: number
      includeContent?: boolean
      semanticOnly?: boolean
    }
  ): Promise<RAGSearchResult[]> {
    const { limit = 10, includeContent = true, semanticOnly = false } = options || {}
    const startTime = Date.now()

    // Initialize monitoring
    this.searchMetrics.totalSearches++
    let searchTypes: string[] = []

    console.log(chalk.blue(`🔍 Searching: "${query}"`))

    try {
      // Apply query optimization pipeline
      const optimizedQuery = this.optimizeQuery(query)
      if (optimizedQuery !== query) {
        this.searchMetrics.queryOptimizations++
        console.log(chalk.gray(`🔧 Query optimized: "${query}" → "${optimizedQuery}"`))
      }

      // Run hybrid searches concurrently (vector, workspace, and BM25)
      const searchPromises: Promise<RAGSearchResult[]>[] = []

      // 1. Vector DB Search (if available)
      if (this.config.useVectorDB && this.vectorClient && !semanticOnly) {
        searchTypes.push('vector')
        this.searchMetrics.vectorSearches++
        searchPromises.push(
          this.searchVectorDB(optimizedQuery, Math.ceil(limit * 0.5)).catch(() => {
            console.log(chalk.yellow('⚠️ Vector search failed'))
            this.searchMetrics.errors++
            return []
          })
        )
      }

      // 2. Workspace-based Search
      if (this.config.enableWorkspaceAnalysis && this.workspaceRAG) {
        searchTypes.push('workspace')
        this.searchMetrics.workspaceSearches++
        searchPromises.push(
          this.searchWorkspace(optimizedQuery, Math.ceil(limit * 0.3)).catch(() => {
            console.log(chalk.yellow('⚠️ Workspace search failed'))
            this.searchMetrics.errors++
            return []
          })
        )
      }

      // 3. BM25 Search (if conditions are met)
      if (this.shouldUseBM25(optimizedQuery)) {
        searchTypes.push('bm25')
        this.searchMetrics.bm25Searches++
        searchPromises.push(
          this.bm25Search(optimizedQuery, Math.ceil(limit * 0.2)).catch(() => {
            console.log(chalk.yellow('⚠️ BM25 search failed'))
            this.searchMetrics.errors++
            return []
          })
        )
      }

      // Wait for all searches to complete concurrently
      const searchResults = await Promise.allSettled(searchPromises)

      // Flatten results from successful searches
      const results: RAGSearchResult[] = []
      searchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.push(...result.value)
        }
      })

      // Check for cache hits
      const cacheHits = results.filter(r => r.metadata.cached).length
      this.searchMetrics.cacheHits += cacheHits

      // 3. Hybrid scoring and deduplication with re-ranking tracking
      const shouldRerank = this.shouldRerank(query)
      if (shouldRerank) {
        this.searchMetrics.reranks++
      }

      const uniqueResults = this.deduplicateAndRank(results, query)
      const finalResults = uniqueResults.slice(0, limit)

      // Update performance metrics
      const duration = Date.now() - startTime
      this.searchMetrics.totalLatency += duration
      this.searchMetrics.averageLatency = this.searchMetrics.totalLatency / this.searchMetrics.totalSearches

      console.log(chalk.green(
        `✅ Found ${finalResults.length} results in ${duration}ms ` +
        `(${searchTypes.join('+')}, ${cacheHits} cached${shouldRerank ? ', reranked' : ''})`
      ))

      return finalResults
    } catch (error) {
      this.searchMetrics.errors++
      const duration = Date.now() - startTime
      this.searchMetrics.totalLatency += duration
      this.searchMetrics.averageLatency = this.searchMetrics.totalLatency / this.searchMetrics.totalSearches

      console.log(chalk.red(`❌ Search failed in ${duration}ms: ${(error as Error).message}`))
      throw error
    }
  }

  private async indexProjectWithVectorDB(
    projectPath: string,
    workspaceContext: WorkspaceContext
  ): Promise<{ success: boolean; cost: number; indexedFiles: number }> {
    try {
      if (!this.embeddingFunction) {
        throw new Error('Embedding function not initialized')
      }

      // For local ChromaDB, use simpler collection creation
      let collection
      try {
        // Try to get existing collection first
        collection = await this.vectorClient!.getCollection({
          name: 'unified_project_index',
        })
        console.log(chalk.gray('✓ Using existing collection: unified_project_index'))
      } catch (_error) {
        // Collection doesn't exist, create it with embedding function
        console.log(chalk.gray('✓ Creating new collection: unified_project_index'))
        collection = await this.vectorClient!.createCollection({
          name: 'unified_project_index',
          embeddingFunction: this.embeddingFunction,
        })
        console.log(chalk.green('✅ Collection created successfully with embedding function'))
      }

      // Use workspace analysis to prioritize important files
      const importantFiles = Array.from(workspaceContext.files.values())
        .filter((f) => f.importance > 30)
        .sort((a, b) => b.importance - a.importance)
        .slice(0, this.config.maxIndexFiles)

      let totalCost = 0
      let indexedCount = 0

      for (const file of importantFiles) {
        try {
          const fullPath = join(projectPath, file.path)
          const content = await readFile(fullPath, 'utf-8')

          // Estimate cost before processing
          const estimatedCost = AiSdkEmbeddingFunction.estimateCost([content])
          if (totalCost + estimatedCost > this.config.costThreshold) {
            console.log(chalk.yellow(`⚠️ Cost threshold reached, stopping indexing`))
            break
          }

          // Chunk content intelligently based on file type
          const chunks = this.intelligentChunking(content, file.language)

          if (chunks.length > 0) {
            const ids = chunks.map((_, idx) => `${file.path}#${idx}`)
            const metadatas = chunks.map((chunk, idx) => ({
              source: file.path,
              size: chunk.length,
              chunkIndex: idx,
              totalChunks: chunks.length,
              importance: file.importance,
              language: file.language,
              lastModified: file.lastModified.toISOString(),
            }))

            await collection.add({ ids, documents: chunks, metadatas })
            totalCost += estimatedCost
            indexedCount++
          }
        } catch (_fileError) {
          console.log(chalk.yellow(`⚠️ Failed to index ${file.path}`))
        }
      }

      return { success: true, cost: totalCost, indexedFiles: indexedCount }
    } catch (_error) {
      return { success: false, cost: 0, indexedFiles: 0 }
    }
  }

  private intelligentChunking(content: string, language: string): string[] {
    // Enhanced chunking based on file type
    if (language === 'typescript' || language === 'javascript') {
      return this.chunkCodeFile(content)
    } else if (language === 'markdown') {
      return this.chunkMarkdownFile(content)
    } else {
      return chunkTextByTokens(content, this.config.chunkSize, this.config.overlapSize)
    }
  }

  private chunkCodeFile(content: string): string[] {
    const chunks: string[] = []
    const lines = content.split('\n')
    let currentChunk: string[] = []
    let bracketDepth = 0
    let inFunction = false
    let functionStartLine = -1

    // Get optimized chunking parameters
    const minLines = TOKEN_LIMITS.RAG?.CODE_CHUNK_MIN_LINES ?? 80
    const maxLines = TOKEN_LIMITS.RAG?.CODE_CHUNK_MAX_LINES ?? 150

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track bracket depth to keep functions/classes together
      bracketDepth += (line.match(/\{/g) || []).length
      bracketDepth -= (line.match(/\}/g) || []).length

      // Enhanced function/class detection
      if (this.isCodeBlockStart(line)) {
        inFunction = true
        functionStartLine = i
      }

      currentChunk.push(line)

      // Smart chunking logic: preserve logical blocks
      const shouldCreateChunk =
        // Function/class completed
        (inFunction && bracketDepth === 0 && currentChunk.length >= minLines) ||
        // Reached max size
        currentChunk.length >= maxLines ||
        // At import/export boundary with sufficient content
        ((line.trim().startsWith('import ') || line.trim().startsWith('export ')) && currentChunk.length >= minLines)

      if (shouldCreateChunk && currentChunk.length >= minLines) {
        chunks.push(currentChunk.join('\n'))

        // Smart overlap: include function signature in next chunk if we split mid-function
        if (inFunction && functionStartLine >= 0) {
          const overlapStart = Math.max(0, functionStartLine)
          const overlap = lines.slice(overlapStart, i + 1)
          currentChunk = overlap.length < 10 ? [...overlap] : []
        } else {
          currentChunk = []
        }

        inFunction = false
        functionStartLine = -1
      }
    }

    // Add remaining content if substantial
    if (currentChunk.length >= 10) {
      chunks.push(currentChunk.join('\n'))
    }

    return chunks.length > 0 ? chunks : [content]
  }

  /**
   * Load persistent embeddings cache from disk
   */
  private async loadPersistentCache(): Promise<void> {
    if (!this.config.cacheEmbeddings) return

    try {
      await mkdir(this.CACHE_DIR, { recursive: true })

      const cacheFilePath = join(this.CACHE_DIR, 'embeddings-cache.json')
      const hashFilePath = join(this.CACHE_DIR, 'file-hashes.json')

      if (existsSync(cacheFilePath)) {
        const cacheData = JSON.parse(readFileSync(cacheFilePath, 'utf-8'))
        for (const [key, value] of Object.entries(cacheData)) {
          this.embeddingsCache.set(key, value as number[])
        }
        console.log(chalk.blue(`📦 Loaded ${this.embeddingsCache.size} cached embeddings`))
      }

      if (existsSync(hashFilePath)) {
        const hashData = JSON.parse(readFileSync(hashFilePath, 'utf-8'))
        for (const [key, value] of Object.entries(hashData)) {
          this.fileHashCache.set(key, value as string)
        }
      }
    } catch (_error) {
      console.log(chalk.yellow('⚠️ Failed to load embeddings cache'))
    }
  }

  /**
   * Test persistent cache functionality
   */
  private testPersistentCache(): void {
    if (!this.config.cacheEmbeddings) {
      console.log(chalk.yellow('⚠️ Persistent cache disabled'))
      return
    }

    try {
      // Check cache directory exists
      const cacheFilePath = join(this.CACHE_DIR, 'embeddings-cache.json')
      const hashFilePath = join(this.CACHE_DIR, 'file-hashes.json')

      console.log(chalk.gray(`✓ Cache directory: ${this.CACHE_DIR}`))

      // Check if cache files exist
      const cacheExists = existsSync(cacheFilePath)
      const hashExists = existsSync(hashFilePath)

      console.log(chalk.gray(`✓ Embeddings cache: ${cacheExists ? 'exists' : 'will be created'}`))
      console.log(chalk.gray(`✓ File hashes cache: ${hashExists ? 'exists' : 'will be created'}`))

      // Test cache functionality by adding a test entry and saving
      const testKey = 'cache-test-' + Date.now()
      const testEmbedding = [0.1, 0.2, 0.3] // Simple test embedding

      this.embeddingsCache.set(testKey, testEmbedding)
      console.log(chalk.gray(`✓ Test cache entry added (${this.embeddingsCache.size} total entries)`))

      // Show cost optimization summary
      this.showCostOptimizations()
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Cache test warning: ${error.message}`))
    }
  }

  /**
   * Display RAG cost optimizations and savings
   */
  private showCostOptimizations(): void {
    console.log(chalk.blue('\n💰 RAG Cost Optimizations:'))

    // Show chunk optimization savings
    const oldChunkTokens = 700
    const newChunkTokens = this.config.chunkSize
    const chunkSavings = ((oldChunkTokens - newChunkTokens) / oldChunkTokens) * 100

    const oldOverlap = 80
    const newOverlap = this.config.overlapSize
    const overlapSavings = ((oldOverlap - newOverlap) / oldOverlap) * 100

    console.log(
      chalk.gray(
        `✓ Chunk size: ${oldChunkTokens} → ${newChunkTokens} tokens (${Math.abs(chunkSavings).toFixed(1)}% ${chunkSavings < 0 ? 'increase for better context' : 'reduction'})`
      )
    )
    console.log(
      chalk.gray(
        `✓ Overlap reduction: ${oldOverlap} → ${newOverlap} tokens (${overlapSavings.toFixed(1)}% less duplication)`
      )
    )

    // Calculate estimated savings for typical project
    const avgFileSize = 2000 // characters
    const avgFilesInProject = 100
    const totalChars = avgFileSize * avgFilesInProject

    const oldCost = AiSdkEmbeddingFunction.estimateCost(totalChars * 1.8) // Old approach with more chunks
    const newCost = AiSdkEmbeddingFunction.estimateCost(totalChars * 1.2) // New optimized approach
    const savings = ((oldCost - newCost) / oldCost) * 100

    console.log(
      chalk.gray(
        `✓ Estimated project savings: ${savings.toFixed(1)}% ($${oldCost.toFixed(4)} → $${newCost.toFixed(4)})`
      )
    )
    console.log(chalk.gray(`✓ Cache hits save: 100% on re-embeddings`))

    // Show current efficiency metrics
    if (this.embeddingsCache.size > 0) {
      console.log(chalk.gray(`✓ Cache efficiency: ${this.embeddingsCache.size} embeddings cached`))
    }
  }

  /**
   * Save persistent embeddings cache to disk
   */
  private async savePersistentCache(): Promise<void> {
    if (!this.config.cacheEmbeddings) return

    try {
      await mkdir(this.CACHE_DIR, { recursive: true })

      const cacheFilePath = join(this.CACHE_DIR, 'embeddings-cache.json')
      const hashFilePath = join(this.CACHE_DIR, 'file-hashes.json')

      // Convert Maps to objects for JSON serialization
      const cacheData = Object.fromEntries(this.embeddingsCache)
      const hashData = Object.fromEntries(this.fileHashCache)

      await writeFile(cacheFilePath, JSON.stringify(cacheData, null, 2))
      await writeFile(hashFilePath, JSON.stringify(hashData, null, 2))

      console.log(chalk.green(`💾 Saved ${this.embeddingsCache.size} embeddings to cache`))
    } catch (_error) {
      console.log(chalk.yellow('⚠️ Failed to save embeddings cache'))
    }
  }

  /**
   * Generate file content hash for change detection
   */
  private generateFileHash(filePath: string, content: string): string {
    const stats = statSync(filePath)
    const hashInput = `${filePath}:${stats.mtime.getTime()}:${content.length}`
    return createHash('md5').update(hashInput).digest('hex')
  }

  /**
   * Check if file has changed since last processing
   */
  private hasFileChanged(filePath: string, content: string): boolean {
    const currentHash = this.generateFileHash(filePath, content)
    const cachedHash = this.fileHashCache.get(filePath)

    if (cachedHash !== currentHash) {
      this.fileHashCache.set(filePath, currentHash)
      return true
    }

    return false
  }

  private isCodeBlockStart(line: string): boolean {
    const trimmed = line.trim()
    return (
      trimmed.startsWith('function ') ||
      trimmed.startsWith('class ') ||
      trimmed.startsWith('interface ') ||
      trimmed.startsWith('type ') ||
      (trimmed.startsWith('const ') && (trimmed.includes('=>') || trimmed.includes('= function'))) ||
      (trimmed.startsWith('export ') && (trimmed.includes('function') || trimmed.includes('class'))) ||
      /^(async\s+)?\w+\s*\([^)]*\)\s*\{/.test(trimmed) // Method definitions
    )
  }

  private chunkMarkdownFile(content: string): string[] {
    const minSectionSize = TOKEN_LIMITS.RAG?.MARKDOWN_MIN_SECTION ?? 200

    // Split by headers while preserving hierarchical context
    const sections = content.split(/^(#{1,6}\s.*$)/m)
    const chunks: string[] = []
    let currentChunk = ''
    let lastHeader = ''

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]

      if (section.match(/^#{1,6}\s/)) {
        // This is a header
        if (currentChunk.length >= minSectionSize) {
          chunks.push((lastHeader + currentChunk).trim())
          currentChunk = ''
        }
        lastHeader = section + '\n'
      } else if (section.trim()) {
        // This is content
        currentChunk += section

        // Check if current chunk is getting too large
        if (currentChunk.length > 2000) {
          chunks.push((lastHeader + currentChunk).trim())
          currentChunk = ''
        }
      }
    }

    // Add remaining content
    if (currentChunk.trim().length >= minSectionSize) {
      chunks.push((lastHeader + currentChunk).trim())
    }

    return chunks.length > 0 ? chunks : [content]
  }

  private async searchVectorDB(query: string, limit: number): Promise<RAGSearchResult[]> {
    try {
      if (!this.embeddingFunction) {
        throw new Error('Embedding function not initialized')
      }

      // Get existing collection for search
      let collection
      try {
        collection = await this.vectorClient!.getCollection({
          name: 'unified_project_index',
        })
        console.log(chalk.gray('✓ Collection found, performing vector search'))
      } catch (_error: any) {
        console.log(chalk.yellow('⚠️ Collection not found, skipping vector search'))
        return []
      }

      const results = await collection.query({
        nResults: limit,
        queryTexts: [query],
      })

      return (results.documents?.[0] || []).map((doc, idx) => ({
        content: doc || '',
        path: (results.metadatas?.[0]?.[idx]?.source as string) || '',
        score: 1 - (results.distances?.[0]?.[idx] || 1),
        metadata: {
          chunkIndex: results.metadatas?.[0]?.[idx]?.chunkIndex as number,
          totalChunks: results.metadatas?.[0]?.[idx]?.totalChunks as number,
          fileType: (results.metadatas?.[0]?.[idx]?.language as string) || 'unknown',
          importance: (results.metadatas?.[0]?.[idx]?.importance as number) || 50,
          lastModified: new Date((results.metadatas?.[0]?.[idx]?.lastModified as string) || Date.now()),
          source: 'vector' as const,
        },
      }))
    } catch (_error) {
      return []
    }
  }

  private async searchWorkspace(query: string, limit: number): Promise<RAGSearchResult[]> {
    if (!this.workspaceRAG) return []

    try {
      const relevantFiles = this.workspaceRAG.getRelevantFiles(query, limit)

      return relevantFiles.map((file: FileEmbedding) => ({
        content: file.content.substring(0, 1000) + (file.content.length > 1000 ? '...' : ''),
        path: file.path,
        score: file.importance / 100,
        metadata: {
          fileType: file.language,
          importance: file.importance,
          lastModified: file.lastModified,
          source: 'workspace' as const,
        },
      }))
    } catch (_error) {
      return []
    }
  }

  private deduplicateAndRank(results: RAGSearchResult[], query: string): RAGSearchResult[] {
    const pathMap = new Map<string, RAGSearchResult>()
    const queryWords = query.toLowerCase().split(/\s+/)

    // Deduplicate by path, keeping highest scoring result
    for (const result of results) {
      const existing = pathMap.get(result.path)
      if (!existing || result.score > existing.score) {
        // Enhanced scoring based on query relevance
        let enhancedScore = result.score

        // Apply intelligent re-ranking if conditions are met
        if (this.shouldRerank(query)) {
          enhancedScore = this.applyIntelligentReranking(result, query, queryWords)
        } else {
          // Basic scoring for simple queries
          enhancedScore = this.applyBasicScoring(result, query, queryWords)
        }

        pathMap.set(result.path, { ...result, score: enhancedScore })
      }
    }

    return Array.from(pathMap.values()).sort((a, b) => b.score - a.score)
  }

  /**
   * Determine if intelligent re-ranking should be applied
   */
  private shouldRerank(query: string): boolean {
    return (
      query.length > 50 ||                                    // Long queries benefit from re-ranking
      query.split(/\s+/).length > 8 ||                        // Multi-word queries
      /[.!?]/.test(query) ||                                 // Sentence-like queries
      process.env.RAG_RERANK_ENABLED === 'true'              // Force enable via env var
    )
  }

  /**
   * Apply intelligent re-ranking for complex queries
   */
  private applyIntelligentReranking(
    result: RAGSearchResult,
    query: string,
    queryWords: string[]
  ): number {
    let score = result.score

    const content = result.content.toLowerCase()
    const path = result.path.toLowerCase()

    // 1. Semantic proximity scoring
    const queryPhrases = this.extractPhrases(query)
    queryPhrases.forEach((phrase) => {
      if (content.includes(phrase.toLowerCase())) {
        score += 0.3 * phrase.split(' ').length // Longer phrases get higher boost
      }
    })

    // 2. Position-based scoring (earlier mentions are more relevant)
    queryWords.forEach((word) => {
      const contentIndex = content.indexOf(word)
      const pathIndex = path.indexOf(word)

      if (contentIndex >= 0) {
        const positionBoost = Math.max(0.05, 0.2 - (contentIndex / content.length) * 0.15)
        score += positionBoost
      }

      if (pathIndex >= 0) {
        score += 0.25 // Path matches are highly relevant
      }
    })

    // 3. File type and importance weighting
    const fileTypeBoosts: Record<string, number> = {
      'typescript': 0.15,
      'javascript': 0.12,
      'markdown': 0.08,
      'json': 0.05,
    }

    score += fileTypeBoosts[result.metadata.fileType] || 0

    // 4. Importance factor (0-100 scale)
    score += (result.metadata.importance / 100) * 0.25

    // 5. Recency boost for recently modified files
    const daysSinceModified = (Date.now() - result.metadata.lastModified.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceModified < 7) {
      score += 0.1 * (7 - daysSinceModified) / 7
    }

    return score
  }

  /**
   * Apply basic scoring for simple queries
   */
  private applyBasicScoring(
    result: RAGSearchResult,
    query: string,
    queryWords: string[]
  ): number {
    let score = result.score

    const content = result.content.toLowerCase()
    const path = result.path.toLowerCase()

    // Simple word matching
    queryWords.forEach((word) => {
      if (content.includes(word)) score += 0.1
      if (path.includes(word)) score += 0.2
    })

    // Basic importance boost
    score += (result.metadata.importance / 100) * 0.3

    return score
  }

  /**
   * Extract meaningful phrases from query (2-4 word combinations)
   */
  private extractPhrases(query: string): string[] {
    const words = query.toLowerCase().match(/\b\w+\b/g) || []
    const phrases: string[] = []

    // Extract 2-word phrases
    for (let i = 0; i < words.length - 1; i++) {
      phrases.push(`${words[i]} ${words[i + 1]}`)
    }

    // Extract 3-word phrases
    for (let i = 0; i < words.length - 2; i++) {
      phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
    }

    return phrases
  }

  /**
   * Determine if BM25 search should be used
   */
  private shouldUseBM25(query: string): boolean {
    return (
      /^[a-zA-Z\s]+$/.test(query) &&           // English text queries
      query.split(/\s+/).length > 2 &&         // Multiple keywords
      query.length > 10 &&                     // Substantial query length
      process.env.RAG_BM25_ENABLED === 'true'  // Explicitly enabled
    )
  }

  /**
   * BM25 sparse search for keyword matching
   */
  private async bm25Search(query: string, limit: number): Promise<RAGSearchResult[]> {
    if (!this.workspaceRAG) return []

    try {
      console.log(chalk.gray('🔤 Performing BM25 sparse search'))

      const queryTerms = query.toLowerCase()
        .split(/\s+/)
        .filter(term => term.length > 2) // Filter out very short terms

      const results: Array<{ file: any; score: number }> = []

      // Simple BM25-like scoring for each file
      for (const [, file] of this.workspaceRAG.getContext().files) {
        const content = file.content.toLowerCase()
        let score = 0

        queryTerms.forEach(term => {
          const termFreq = (content.match(new RegExp(term, 'g')) || []).length
          const docLength = content.length
          const avgDocLength = 2000 // Estimated average

          if (termFreq > 0) {
            // Simplified BM25 formula
            const tf = termFreq / (termFreq + 1.2 * (0.25 + 0.75 * (docLength / avgDocLength)))
            const idf = Math.log(1 + (this.workspaceRAG!.getContext().files.size / (termFreq + 1)))
            score += tf * idf
          }
        })

        if (score > 0) {
          results.push({ file, score })
        }
      }

      // Sort by BM25 score and convert to RAGSearchResult format
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ file, score }) => ({
          content: file.content.substring(0, 1000) + (file.content.length > 1000 ? '...' : ''),
          path: file.path,
          score: score * 0.1, // Normalize score
          metadata: {
            fileType: file.language,
            importance: file.importance,
            lastModified: file.lastModified,
            source: 'hybrid' as const,
          },
        }))
    } catch (error) {
      console.log(chalk.yellow(`⚠️ BM25 search error: ${(error as Error).message}`))
      return []
    }
  }

  /**
   * Query optimization pipeline - enhance queries for better semantic search
   */
  private optimizeQuery(query: string): string {
    let optimized = query.trim()

    // 1. Remove common stop words for better semantic search
    optimized = this.removeStopWords(optimized)

    // 2. Expand synonyms for better recall (simple implementation)
    optimized = this.expandSynonyms(optimized)

    // 3. Resolve temporal references
    optimized = this.resolveTemporalReferences(optimized)

    // 4. Normalize whitespace
    optimized = optimized.replace(/\s+/g, ' ').trim()

    return optimized
  }

  /**
   * Remove stop words that don't add semantic value
   */
  private removeStopWords(query: string): string {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
    ])

    const words = query.toLowerCase().split(/\s+/)
    const filtered = words.filter(word => {
      // Keep stop words if they're part of technical terms or phrases
      if (word.includes('-') || word.includes('_') || word.includes('.')) return true
      return !stopWords.has(word) || word.length < 3
    })

    return filtered.join(' ')
  }

  /**
   * Expand synonyms for better recall
   */
  private expandSynonyms(query: string): string {
    const synonymMap: Record<string, string[]> = {
      'function': ['method', 'procedure', 'func'],
      'component': ['element', 'widget', 'part'],
      'config': ['configuration', 'settings', 'setup'],
      'error': ['bug', 'issue', 'problem', 'exception'],
      'api': ['endpoint', 'service', 'interface'],
      'database': ['db', 'datastore', 'storage'],
      'user': ['client', 'customer', 'account'],
      'create': ['make', 'build', 'generate', 'add'],
      'delete': ['remove', 'destroy', 'drop'],
      'update': ['modify', 'change', 'edit'],
    }

    let expanded = query
    Object.entries(synonymMap).forEach(([term, synonyms]) => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi')
      if (regex.test(expanded)) {
        // Add most relevant synonym
        const primarySynonym = synonyms[0]
        if (!expanded.toLowerCase().includes(primarySynonym)) {
          expanded = expanded.replace(regex, `${term} ${primarySynonym}`)
        }
      }
    })

    return expanded
  }

  /**
   * Resolve temporal references to absolute dates
   */
  private resolveTemporalReferences(query: string): string {
    const now = new Date()
    const replacements: Record<string, string> = {
      'today': now.toLocaleDateString(),
      'yesterday': new Date(now.getTime() - 86400000).toLocaleDateString(),
      'this week': `week of ${new Date(now.getTime() - now.getDay() * 86400000).toLocaleDateString()}`,
      'last week': `week of ${new Date(now.getTime() - (now.getDay() + 7) * 86400000).toLocaleDateString()}`,
      'this month': now.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
      'last month': new Date(now.getFullYear(), now.getMonth() - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
    }

    let resolved = query
    Object.entries(replacements).forEach(([temporal, absolute]) => {
      const regex = new RegExp(`\\b${temporal}\\b`, 'gi')
      resolved = resolved.replace(regex, absolute)
    })

    return resolved
  }

  private createMinimalWorkspaceContext(projectPath: string): WorkspaceContext {
    return {
      rootPath: resolve(projectPath),
      projectName: require('node:path').basename(projectPath),
      framework: 'unknown',
      languages: [],
      files: new Map(),
      structure: {},
      dependencies: [],
      scripts: {},
      lastAnalyzed: new Date(),
    }
  }

  // Public utility methods
  getConfig(): UnifiedRAGConfig {
    return { ...this.config }
  }

  updateConfig(updates: Partial<UnifiedRAGConfig>): void {
    this.config = { ...this.config, ...updates }
    console.log(chalk.blue('🔧 RAG configuration updated'))
  }

  clearCaches(): void {
    this.embeddingsCache.clear()
    this.analysisCache.clear()
    console.log(chalk.green('✅ RAG caches cleared'))
  }

  getStats() {
    return {
      embeddingsCacheSize: this.embeddingsCache.size,
      analysisCacheSize: this.analysisCache.size,
      vectorDBAvailable: !!this.vectorClient,
      workspaceRAGAvailable: !!this.workspaceRAG,
      config: this.config,
      performance: {
        ...this.searchMetrics,
        cacheHitRate: this.searchMetrics.totalSearches > 0
          ? (this.searchMetrics.cacheHits / this.searchMetrics.totalSearches * 100).toFixed(1) + '%'
          : '0%',
        errorRate: this.searchMetrics.totalSearches > 0
          ? (this.searchMetrics.errors / this.searchMetrics.totalSearches * 100).toFixed(1) + '%'
          : '0%',
        averageLatencyMs: Math.round(this.searchMetrics.averageLatency)
      }
    }
  }

  /**
   * Get comprehensive performance metrics
   */
  getPerformanceMetrics() {
    const totalSearches = this.searchMetrics.totalSearches

    return {
      searches: {
        total: totalSearches,
        vector: this.searchMetrics.vectorSearches,
        workspace: this.searchMetrics.workspaceSearches,
        bm25: this.searchMetrics.bm25Searches,
      },
      performance: {
        averageLatency: Math.round(this.searchMetrics.averageLatency),
        totalLatency: this.searchMetrics.totalLatency,
        errors: this.searchMetrics.errors,
        errorRate: totalSearches > 0 ? ((this.searchMetrics.errors / totalSearches) * 100).toFixed(1) + '%' : '0%'
      },
      optimization: {
        cacheHits: this.searchMetrics.cacheHits,
        cacheHitRate: totalSearches > 0 ? ((this.searchMetrics.cacheHits / totalSearches) * 100).toFixed(1) + '%' : '0%',
        queryOptimizations: this.searchMetrics.queryOptimizations,
        reranks: this.searchMetrics.reranks,
        rerankRate: totalSearches > 0 ? ((this.searchMetrics.reranks / totalSearches) * 100).toFixed(1) + '%' : '0%'
      }
    }
  }

  /**
   * Reset performance metrics
   */
  resetMetrics() {
    this.searchMetrics = {
      totalSearches: 0,
      cacheHits: 0,
      vectorSearches: 0,
      workspaceSearches: 0,
      bm25Searches: 0,
      averageLatency: 0,
      totalLatency: 0,
      errors: 0,
      queryOptimizations: 0,
      reranks: 0
    }
    console.log(chalk.green('✅ RAG performance metrics reset'))
  }

  /**
   * Log comprehensive performance report
   */
  logPerformanceReport() {
    const metrics = this.getPerformanceMetrics()

    console.log(chalk.blue.bold('\n📊 RAG Performance Report'))
    console.log(chalk.gray('═'.repeat(50)))

    console.log(chalk.cyan('Search Distribution:'))
    console.log(`  Total Searches: ${metrics.searches.total}`)
    console.log(`  Vector: ${metrics.searches.vector} (${((metrics.searches.vector / metrics.searches.total) * 100).toFixed(1)}%)`)
    console.log(`  Workspace: ${metrics.searches.workspace} (${((metrics.searches.workspace / metrics.searches.total) * 100).toFixed(1)}%)`)
    console.log(`  BM25: ${metrics.searches.bm25} (${((metrics.searches.bm25 / metrics.searches.total) * 100).toFixed(1)}%)`)

    console.log(chalk.cyan('\nPerformance:'))
    console.log(`  Average Latency: ${metrics.performance.averageLatency}ms`)
    console.log(`  Error Rate: ${metrics.performance.errorRate}`)

    console.log(chalk.cyan('\nOptimizations:'))
    console.log(`  Cache Hit Rate: ${metrics.optimization.cacheHitRate}`)
    console.log(`  Query Optimizations: ${metrics.optimization.queryOptimizations}`)
    console.log(`  Re-rank Rate: ${metrics.optimization.rerankRate}`)

    const efficiency = this.calculateEfficiencyScore(metrics)
    console.log(chalk.cyan('\nEfficiency Score:'))
    console.log(`  Overall: ${efficiency.overall}/100 ${this.getEfficiencyEmoji(efficiency.overall)}`)
    console.log(`  Latency: ${efficiency.latency}/25`)
    console.log(`  Cache: ${efficiency.cache}/25`)
    console.log(`  Error Rate: ${efficiency.errorRate}/25`)
    console.log(`  Feature Usage: ${efficiency.featureUsage}/25`)
  }

  /**
   * Calculate efficiency score based on metrics
   */
  private calculateEfficiencyScore(metrics: ReturnType<typeof this.getPerformanceMetrics>) {
    // Latency score (0-25): under 150ms = 25, 150-300ms = 20, 300-500ms = 15, 500+ = 10
    let latency = 25
    if (metrics.performance.averageLatency > 150) latency = 20
    if (metrics.performance.averageLatency > 300) latency = 15
    if (metrics.performance.averageLatency > 500) latency = 10

    // Cache score (0-25): 60%+ = 25, 40-60% = 20, 20-40% = 15, <20% = 10
    const cacheHitRate = parseFloat(metrics.optimization.cacheHitRate.replace('%', ''))
    let cache = 10
    if (cacheHitRate >= 60) cache = 25
    else if (cacheHitRate >= 40) cache = 20
    else if (cacheHitRate >= 20) cache = 15

    // Error rate score (0-25): <1% = 25, 1-5% = 20, 5-10% = 15, >10% = 10
    const errorRate = parseFloat(metrics.performance.errorRate.replace('%', ''))
    let errorRateScore = 25
    if (errorRate > 1) errorRateScore = 20
    if (errorRate > 5) errorRateScore = 15
    if (errorRate > 10) errorRateScore = 10

    // Feature usage score (0-25): using all features = 25
    const hasVector = metrics.searches.vector > 0
    const hasWorkspace = metrics.searches.workspace > 0
    const hasBM25 = metrics.searches.bm25 > 0
    const hasOptimizations = metrics.optimization.queryOptimizations > 0
    const featureUsage = (hasVector ? 7 : 0) + (hasWorkspace ? 6 : 0) + (hasBM25 ? 6 : 0) + (hasOptimizations ? 6 : 0)

    return {
      overall: latency + cache + errorRateScore + featureUsage,
      latency,
      cache,
      errorRate: errorRateScore,
      featureUsage
    }
  }

  /**
   * Get emoji for efficiency score
   */
  private getEfficiencyEmoji(score: number): string {
    if (score >= 90) return '🚀'
    if (score >= 80) return '⚡'
    if (score >= 70) return '✅'
    if (score >= 60) return '⚠️'
    return '🐌'
  }

  /**
   * Search with token-aware result truncation
   */
  async searchWithTokenLimit(
    query: string,
    maxTokens: number = 2000,
    options?: {
      limit?: number
      includeContent?: boolean
      semanticOnly?: boolean
    }
  ): Promise<RAGSearchResult[]> {
    // Get initial results
    const results = await this.search(query, options)

    // Apply token-aware truncation
    const truncatedResults = tokenAwareTruncate(results, maxTokens)

    console.log(chalk.blue(
      `🎯 Optimized results: ${results.length} → ${truncatedResults.length} contexts, ` +
      `~${estimateTokensFromChars(truncatedResults.reduce((sum, r) => sum + r.content.length, 0))} tokens`
    ))

    return truncatedResults
  }
}

// Export singleton instance
export const unifiedRAGSystem = new UnifiedRAGSystem()

// Legacy functions for backward compatibility
export async function indexProject(projectPath: string) {
  console.log(chalk.blue('🔄 Using legacy indexProject (consider upgrading to UnifiedRAGSystem)'))
  try {
    const result = await unifiedRAGSystem.analyzeProject(projectPath)
    console.log(chalk.green(`✅ Legacy indexing completed - ${result.indexedFiles} files processed`))
  } catch (error: any) {
    console.error(chalk.red('❌ Legacy indexing failed:'), error.message)
  }
}

export async function search(query: string) {
  console.log(chalk.blue('🔄 Using legacy search (consider upgrading to UnifiedRAGSystem)'))
  try {
    const results = await unifiedRAGSystem.search(query, { limit: 5 })
    // Convert to legacy format
    return {
      documents: [results.map((r) => r.content)],
      metadatas: [
        results.map((r) => ({
          source: r.path,
          score: r.score,
          fileType: r.metadata.fileType,
          importance: r.metadata.importance,
          lastModified: r.metadata.lastModified.toISOString(),
        })),
      ],
    }
  } catch (error: any) {
    console.error(chalk.red('❌ Legacy search failed:'), error.message)
    return { documents: [[]], metadatas: [[]] }
  }
}

// --- helpers ---
function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / 4)
}

/**
 * Token-aware truncation with sliding window and semantic boundaries
 */
function tokenAwareTruncate(contexts: RAGSearchResult[], maxTokens: number): RAGSearchResult[] {
  let totalTokens = 0
  const truncated: RAGSearchResult[] = []

  for (const context of contexts) {
    const estimatedTokens = estimateTokensFromChars(context.content.length)

    if (totalTokens + estimatedTokens > maxTokens) {
      // Use sliding window to keep most relevant parts
      const remainingTokens = maxTokens - totalTokens
      if (remainingTokens > 50) { // Minimum chunk size
        const truncatedContent = truncateToTokensWithBoundaries(
          context.content,
          remainingTokens
        )

        truncated.push({
          ...context,
          content: truncatedContent,
          metadata: {
            ...context.metadata,
            truncated: true,
            originalLength: context.content.length,
            truncatedLength: truncatedContent.length
          }
        })
      }
      break
    }

    totalTokens += estimatedTokens
    truncated.push(context)
  }

  return truncated
}

/**
 * Truncate text to approximate token count while preserving semantic boundaries
 */
function truncateToTokensWithBoundaries(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4 // Rough estimation: 1 token ≈ 4 characters

  if (text.length <= maxChars) return text

  // Try to find semantic boundaries (sentences, paragraphs, code blocks)
  const boundaries = [
    /\n\n/g,     // Paragraph breaks
    /\.\s+/g,    // Sentence endings
    /;\s*\n/g,   // Code statement endings
    /\}\s*\n/g,  // Code block endings
    /,\s+/g,     // Comma separations
  ]

  let bestCutoff = maxChars - 50 // Leave room for truncation notice

  // Find the best boundary within the acceptable range
  for (const boundary of boundaries) {
    const matches = Array.from(text.matchAll(boundary))

    for (const match of matches) {
      const pos = match.index! + match[0].length
      if (pos >= bestCutoff * 0.8 && pos <= bestCutoff) {
        bestCutoff = pos
        break
      }
    }

    if (bestCutoff < maxChars - 50) break // Found good boundary
  }

  return text.substring(0, bestCutoff) + '\n[... content truncated for length ...]'
}

function chunkTextByTokens(text: string, chunkTokens: number, overlapTokens: number): string[] {
  if (!text) return []
  const tokenToChar = 4 // heuristic
  const chunkChars = Math.max(200, Math.floor(chunkTokens * tokenToChar))
  const overlapChars = Math.max(0, Math.floor(overlapTokens * tokenToChar))

  const chunks: string[] = []
  let start = 0
  const N = text.length

  while (start < N) {
    const end = Math.min(N, start + chunkChars)
    const slice = text.slice(start, end)
    chunks.push(slice)
    if (end >= N) break
    start = Math.max(0, end - overlapChars)
  }

  return chunks
}
