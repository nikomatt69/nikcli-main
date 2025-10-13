import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import chalk from 'chalk'
import { TOKEN_LIMITS } from '../config/token-limits'
import { type CacheProvider, globalCacheManager } from '../core/cache-provider'
import { advancedUI } from '../ui/advanced-cli-ui'
import { createFileFilter, type FileFilterSystem } from './file-filter-system'
// Import semantic search engine and file filtering
import { type QueryAnalysis, type ScoringContext, semanticSearchEngine } from './semantic-search-engine'

// Import unified embedding and vector store infrastructure
import { unifiedEmbeddingInterface } from './unified-embedding-interface'
import { createVectorStoreManager, type VectorDocument, type VectorStoreManager } from './vector-store-abstraction'
// Import workspace analysis types for integration
import type { FileEmbedding, WorkspaceContext } from './workspace-rag'
import { WorkspaceRAG } from './workspace-rag'

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
    // Semantic search enhancement fields
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

export interface RAGAnalysisResult {
  workspaceContext: WorkspaceContext
  indexedFiles: number
  embeddingsCost: number
  processingTime: number
  vectorDBStatus: 'available' | 'unavailable' | 'error'
  fallbackMode: boolean
}

// Enhanced cost estimation using unified embedding interface
function estimateCost(input: string[] | number, provider: string = 'openai'): number {
  if (typeof input === 'number' && input < 0) {
    throw new Error('Character count cannot be negative')
  }
  if (Array.isArray(input) && input.length === 0) {
    return 0
  }

  const texts = typeof input === 'number' ? ['x'.repeat(input)] : input
  const totalChars = Array.isArray(texts) ? texts.reduce((sum, text) => sum + text.length, 0) : (texts as string).length
  const estimatedTokens = Math.ceil(totalChars / 4)

  // Use provider-specific pricing from unified embedding interface
  const _config = unifiedEmbeddingInterface.getConfig()
  const costPer1K = provider === 'openai' ? 0.00002 : provider === 'google' ? 0.000025 : 0.00003
  return (estimatedTokens / 1000) * costPer1K
}

// Initialize vector store configurations based on environment
function createVectorStoreConfigs() {
  const configs = []

  // Check if local-first mode is enabled (default: true for fast startup)
  const useLocalFirst = process.env.RAG_LOCAL_FIRST !== 'false'

  if (useLocalFirst) {
    // 🚀 PRIMARY: Local filesystem (instant startup, no network latency)
    configs.push({
      provider: 'local' as const,
      connectionConfig: {
        baseDir: join(homedir(), '.nikcli', 'vector-store'),
      },
      collectionName: 'local_vectors',
      embeddingDimensions: 1536,
      indexingBatchSize: 100,
      maxRetries: 1,
      healthCheckInterval: 600000,
      autoFallback: true,
    })
  }

  // 🔄 SECONDARY: Upstash Vector/Redis (optional, only if explicitly configured)
  const upstashVectorUrl = process.env.UPSTASH_VECTOR_REST_URL
  const upstashVectorToken = process.env.UPSTASH_VECTOR_REST_TOKEN
  const upstashRedisUrl = process.env.UPSTASH_REDIS_REST_URL
  const upstashRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const upstashCollection = process.env.UPSTASH_VECTOR_COLLECTION || 'nikcli-vectors'

  if ((upstashVectorUrl && upstashVectorToken) || (upstashRedisUrl && upstashRedisToken)) {
    configs.push({
      provider: 'upstash' as const,
      connectionConfig: {
        vectorUrl: upstashVectorUrl,
        vectorToken: upstashVectorToken,
        redisUrl: upstashRedisUrl,
        redisToken: upstashRedisToken,
      },
      collectionName: upstashCollection,
      embeddingDimensions: 1536,
      indexingBatchSize: 100,
      maxRetries: 3,
      healthCheckInterval: 300000,
      autoFallback: true,
    })
  }

  // 🔄 TERTIARY: ChromaDB (fallback if Upstash unavailable)
  const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8005'
  const chromaApiKey = process.env.CHROMA_API_KEY || process.env.CHROMA_CLOUD_API_KEY
  const chromaTenant = process.env.CHROMA_TENANT
  const chromaDatabase = process.env.CHROMA_DATABASE || 'nikcli'

  if (chromaApiKey && chromaTenant) {
    // ChromaDB Cloud configuration
    configs.push({
      provider: 'chromadb' as const,
      connectionConfig: {
        useCloud: true,
        apiKey: chromaApiKey,
        tenant: chromaTenant,
        database: chromaDatabase,
      },
      collectionName: 'nikcli-vectors',
      embeddingDimensions: 1536,
      indexingBatchSize: 100,
      maxRetries: 3,
      healthCheckInterval: 300000,
      autoFallback: true,
    })
  } else if (process.env.CHROMA_URL || process.env.ENABLE_CHROMADB === 'true') {
    // Local ChromaDB configuration (only if explicitly enabled)
    const [host, port] = chromaUrl.replace('http://', '').replace('https://', '').split(':')
    configs.push({
      provider: 'chromadb' as const,
      connectionConfig: {
        useCloud: false,
        host: host || 'localhost',
        port: parseInt(port, 10) || 8005,
        ssl: chromaUrl.startsWith('https'),
      },
      collectionName: 'nikcli-vectors',
      embeddingDimensions: 1536,
      indexingBatchSize: 100,
      maxRetries: 3,
      healthCheckInterval: 300000,
      autoFallback: true,
    })
  }

  // 💾 FALLBACK: Local filesystem (if not already primary)
  if (!useLocalFirst) {
    configs.push({
      provider: 'local' as const,
      connectionConfig: {
        baseDir: join(homedir(), '.nikcli', 'vector-store'),
      },
      collectionName: 'local_fallback',
      embeddingDimensions: 1536,
      indexingBatchSize: 50,
      maxRetries: 1,
      healthCheckInterval: 600000,
      autoFallback: true,
    })
  }

  return configs
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

  return estimateCost(estimatedTotalChars)
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
  private vectorStoreManager: VectorStoreManager | null = null
  private fileFilter: FileFilterSystem | null = null
  private embeddingsCache: CacheProvider
  private analysisCache: CacheProvider
  private fileHashCache: CacheProvider
  private readonly CACHE_TTL = 300000 // 5 minutes

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
    reranks: 0,
  }

  private initialized = false
  private initializationStarted = false

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

    // Initialize cache providers
    this.embeddingsCache = globalCacheManager.getCache('rag-embeddings', {
      defaultTTL: 24 * 60 * 60 * 1000, // 24 hours for embeddings
      maxMemorySize: 200 * 1024 * 1024, // 200MB for embeddings
    })

    this.analysisCache = globalCacheManager.getCache('rag-analysis', {
      defaultTTL: this.CACHE_TTL,
      maxMemorySize: 50 * 1024 * 1024, // 50MB for analysis results
    })

    this.fileHashCache = globalCacheManager.getCache('rag-file-hashes', {
      defaultTTL: 7 * 24 * 60 * 60 * 1000, // 7 days for file hashes
      maxMemorySize: 10 * 1024 * 1024, // 10MB for hashes
    })

    // DON'T initialize automatically - wait for explicit call after onboarding
    // this.initializeClientsBackground()
  }

  /**
   * Start background initialization (chiamato SOLO dopo onboarding)
   * Public method to explicitly start RAG initialization after onboarding completes
   */
  public startBackgroundInitialization(): void {
    if (this.initializationStarted) return
    this.initializationStarted = true

    // Run in next tick to avoid blocking
    setImmediate(() => {
      this.initializeClients()
        .then(() => {
          // Show completion log ONLY if chat is already open (NIKCLI_QUIET_STARTUP cleared)
          if (!process.env.NIKCLI_QUIET_STARTUP) {
            advancedUI.logFunctionCall('unifiedraganalysis')
            advancedUI.logFunctionUpdate('success', '✓ RAG system initialized in background')
          }
        })
        .catch((err) => {
          // Silent failure - RAG will work in fallback mode
          if (!process.env.NIKCLI_QUIET_STARTUP) {
            advancedUI.logFunctionCall('unifiedraganalysis')
            advancedUI.logFunctionUpdate('warning', `RAG initialization warning: ${err.message}`)
          }
        })
    })
  }

  /**
   * Background initialization - runs silently without blocking CLI startup
   * @deprecated Use startBackgroundInitialization() instead
   */
  private initializeClientsBackground(): void {
    this.startBackgroundInitialization()
  }

  private async initializeClients(): Promise<void> {
    try {
      const projectRoot = require('../utils/working-dir').getWorkingDirectory()

      // Initialize intelligent file filter system
      this.fileFilter = createFileFilter(projectRoot, {
        respectGitignore: true,
        maxFileSize: 1024 * 1024, // 1MB per file
        maxTotalFiles: this.config.maxIndexFiles || 5000,
        customRules: [
          {
            name: 'priority_configs',
            pattern: /\.(json|yaml|yml|toml|env)$/,
            type: 'include',
            priority: 10,
            reason: 'Important configuration files',
          },
          {
            name: 'large_datasets',
            pattern: /\.(csv|json)$/,
            type: 'exclude',
            priority: 8,
            reason: 'Large data files excluded by size',
          },
        ],
      })

      // Silent background initialization - no UI updates during startup
      if (!process.env.NIKCLI_QUIET_STARTUP) {
        advancedUI.logFunctionCall('unifiedraganalysis')
        advancedUI.logFunctionUpdate('info', 'File filter system initialized')
      }

      // Initialize workspace RAG (local analysis)
      if (this.config.enableWorkspaceAnalysis) {
        this.workspaceRAG = new WorkspaceRAG(projectRoot)
      }

      // Initialize unified vector store manager if configured
      if (this.config.useVectorDB) {
        try {
          const vectorConfigs = createVectorStoreConfigs()
          this.vectorStoreManager = createVectorStoreManager(vectorConfigs)

          const initialized = await this.vectorStoreManager.initialize()
          if (initialized) {
            if (!process.env.NIKCLI_QUIET_STARTUP) {
              advancedUI.logFunctionCall('unifiedraganalysis')
              advancedUI.logFunctionUpdate('success', 'Vector Store Manager initialized with fallback support')
            }
          } else {
            if (!process.env.NIKCLI_QUIET_STARTUP) {
              advancedUI.logFunctionCall('unifiedraganalysis')
              advancedUI.logFunctionUpdate(
                'warning',
                'Vector Store Manager failed to initialize, using workspace analysis only'
              )
            }
            this.config.useVectorDB = false
          }
        } catch (error: any) {
          if (!process.env.NIKCLI_QUIET_STARTUP) {
            advancedUI.logFunctionCall('unifiedraganalysis')
            advancedUI.logFunctionUpdate(
              'warning',
              `Vector DB unavailable: ${error.message}, using workspace analysis only`
            )
          }
          this.config.useVectorDB = false
        }
      }

      this.initialized = true
    } catch (error: any) {
      if (!process.env.NIKCLI_QUIET_STARTUP) {
        advancedUI.logFunctionCall('unifiedraganalysis')
        advancedUI.logFunctionUpdate('warning', 'RAG initialization warning:', `${error}`)
      }
      this.initialized = true // Set true even on error to prevent blocking
    }
  }

  /**
   * Wait for initialization to complete
   * If init hasn't started yet, start it now as fallback (for backward compatibility)
   */
  private async ensureInitialized(): Promise<void> {
    // If initialization hasn't started, start it now (fallback for safety)
    if (!this.initializationStarted) {
      this.startBackgroundInitialization()
    }

    const maxWait = 10000 // 10 secondi max
    const startTime = Date.now()

    while (!this.initialized && Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    if (!this.initialized) {
      console.warn('RAG system initialization timeout - continuing with fallback mode')
      this.initialized = true // Set true to avoid infinite wait, RAG will work in fallback mode
    }
  }

  /**
   * Unified project analysis combining workspace and vector approaches
   */
  async analyzeProject(projectPath: string): Promise<RAGAnalysisResult> {
    await this.ensureInitialized()

    const startTime = Date.now()
    advancedUI.logFunctionCall('unifiedraganalysis')
    advancedUI.logFunctionUpdate('info', 'Starting unified RAG analysis...', 'ℹ')

    // Check cache
    const cacheKey = `analysis-${projectPath}`
    const cached = await this.analysisCache.get<RAGAnalysisResult>(cacheKey)
    if (cached) {
      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate('success', 'Using cached analysis')
      return cached
    }

    let workspaceContext: WorkspaceContext
    let vectorDBStatus: 'available' | 'unavailable' | 'error' = 'unavailable'
    let embeddingsCost = 0
    let indexedFiles = 0

    // 1. Workspace Analysis (always run)
    if (this.config.enableWorkspaceAnalysis && this.workspaceRAG) {
      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate('info', 'Analyzing workspace structure...')
      workspaceContext = await this.workspaceRAG.analyzeWorkspace()
      console.log(chalk.green(`✓ Analyzed ${workspaceContext.files.size} files`))
    } else {
      // Fallback minimal analysis
      workspaceContext = this.createMinimalWorkspaceContext(projectPath)
    }

    // 2. Vector DB Indexing (if available and cost-effective)
    if (this.config.useVectorDB && this.vectorStoreManager) {
      try {
        const indexResult = await this.indexProjectWithVectorStore(projectPath, workspaceContext)
        vectorDBStatus = indexResult.success ? 'available' : 'error'
        embeddingsCost = indexResult.cost
        indexedFiles = indexResult.indexedFiles
      } catch (_error) {
        advancedUI.logFunctionCall('unifiedraganalysis')
        advancedUI.logFunctionUpdate('warning', 'Vector DB indexing failed, using workspace analysis only')
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

    // Cache result with tags for easy management
    await this.analysisCache.set(cacheKey, result, {
      tags: ['analysis', 'project'],
    })

    advancedUI.logFunctionCall('unifiedraganalysis')
    advancedUI.logFunctionUpdate('success', `RAG analysis completed in ${result.processingTime}ms`)
    console.log(
      chalk.gray(`   Indexed: ${indexedFiles} files, Cost: $${embeddingsCost.toFixed(4)}, Vector DB: ${vectorDBStatus}`)
    )

    return result
  }

  /**
   * Enhanced semantic search using the semantic search engine
   */
  async searchSemantic(
    query: string,
    options?: {
      limit?: number
      threshold?: number
      includeAnalysis?: boolean
    }
  ): Promise<RAGSearchResult[]> {
    await this.ensureInitialized()

    const { limit = 10, threshold = 0.3, includeAnalysis = true } = options || {}

    try {
      // Use semantic search engine for query analysis
      const queryAnalysis = await semanticSearchEngine.analyzeQuery(query)
      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate(
        'info',
        `Query intent: ${queryAnalysis.intent.type} (${Math.round(queryAnalysis.confidence * 100)}% confidence)`
      )

      // Use the enhanced search with semantic analysis
      return await this.searchEnhanced(query, {
        limit,
        includeContent: true,
        semanticOnly: true,
        queryAnalysis,
      })
    } catch (_error) {
      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate('warning', 'Semantic search failed, falling back to regular search')
      return await this.search(query, { limit })
    }
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
      workingDirectory?: string
    }
  ): Promise<RAGSearchResult[]> {
    await this.ensureInitialized()

    const { limit = 10, includeContent = true, semanticOnly = false } = options || {}
    const startTime = Date.now()

    // Initialize monitoring
    this.searchMetrics.totalSearches++
    const searchTypes: string[] = []

    try {
      // Apply query optimization pipeline
      const optimizedQuery = this.optimizeQuery(query)
      if (optimizedQuery !== query) {
        this.searchMetrics.queryOptimizations++
        advancedUI.logFunctionCall('unifiedraganalysis')
      }

      // Run hybrid searches concurrently (vector, workspace, and BM25)
      const searchPromises: Promise<RAGSearchResult[]>[] = []

      // 1. Vector Store Search (if available)
      if (this.config.useVectorDB && this.vectorStoreManager && !semanticOnly) {
        searchTypes.push('vector')
        this.searchMetrics.vectorSearches++
        searchPromises.push(
          this.searchVectorStore(optimizedQuery, Math.ceil(limit * 0.5)).catch(() => {
            advancedUI.logFunctionCall('unifiedraganalysis')
            advancedUI.logFunctionUpdate('warning', 'Vector search failed')
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
            advancedUI.logFunctionCall('unifiedraganalysis')
            advancedUI.logFunctionUpdate('warning', 'Workspace search failed')
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
            advancedUI.logFunctionCall('unifiedraganalysis')
            advancedUI.logFunctionUpdate('warning', 'BM25 search failed')
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
      const cacheHits = results.filter((r) => r.metadata.cached).length
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

      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate('error', `Search failed`)

      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate(
        'success',
        `Found ${finalResults.length} results in ${duration}ms (${searchTypes.join('+')}, ${cacheHits} cached${shouldRerank ? ', reranked' : ''})`
      )

      return finalResults
    } catch (error) {
      this.searchMetrics.errors++
      const duration = Date.now() - startTime
      this.searchMetrics.totalLatency += duration
      this.searchMetrics.averageLatency = this.searchMetrics.totalLatency / this.searchMetrics.totalSearches

      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate('error', `Search failed in ${duration}ms: ${(error as Error).message}`)
      throw error
    }
  }

  private async indexProjectWithVectorStore(
    projectPath: string,
    workspaceContext: WorkspaceContext
  ): Promise<{ success: boolean; cost: number; indexedFiles: number }> {
    try {
      if (!this.vectorStoreManager || !this.fileFilter) {
        throw new Error('Vector store manager or file filter not initialized')
      }

      console.log(chalk.cyan('📊 Starting intelligent vector store indexing...'))

      // Use intelligent file filtering to get indexable files
      const filesToIndex = this.fileFilter.getFilesToIndex(projectPath)
      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate('info', `Found ${filesToIndex.length} files to index after filtering`)

      // Show filtering statistics
      this.fileFilter.logStats()

      let totalCost = 0
      let indexedCount = 0
      let documentsToIndex: VectorDocument[] = []

      for (const filePath of filesToIndex) {
        try {
          const relativePath = relative(projectPath, filePath)
          const content = await readFile(filePath, 'utf-8')

          // Skip empty files
          if (content.trim().length === 0) continue

          // Estimate cost before processing
          const estimatedCost = estimateCost([content])
          if (totalCost + estimatedCost > this.config.costThreshold) {
            advancedUI.logFunctionCall('unifiedraganalysis')
            advancedUI.logFunctionUpdate(
              'warning',
              `Cost threshold reached at $${this.config.costThreshold}, stopping indexing`
            )
            break
          }

          // Get file metadata from workspace context or create default
          const fileStats = statSync(filePath)
          const fileInfo = workspaceContext.files.get(relativePath) || {
            path: relativePath,
            language: this.detectLanguageFromPath(filePath),
            importance: this.calculateFileImportance(relativePath, content),
            lastModified: fileStats.mtime,
            summary: `${this.detectLanguageFromPath(filePath)} file with ${content.split('\n').length} lines`,
          }

          // Chunk content intelligently based on file type
          const chunks = this.intelligentChunking(content, fileInfo.language)

          if (chunks.length > 0) {
            for (let idx = 0; idx < chunks.length; idx++) {
              const chunk = chunks[idx]
              const documentId = `${relativePath}#${idx}`

              const vectorDoc: VectorDocument = {
                id: documentId,
                content: chunk,
                metadata: {
                  source: relativePath,
                  absolutePath: filePath,
                  size: chunk.length,
                  chunkIndex: idx,
                  totalChunks: chunks.length,
                  importance: fileInfo.importance,
                  language: fileInfo.language,
                  lastModified: fileInfo.lastModified.toISOString(),
                  hash: this.generateFileHash(relativePath, chunk),
                  fileSize: fileStats.size,
                  lines: chunk.split('\n').length,
                },
                timestamp: new Date(),
              }

              documentsToIndex.push(vectorDoc)
            }

            totalCost += estimatedCost
            indexedCount++

            // Progress feedback for large indexing operations
            if (indexedCount % 100 === 0) {
              advancedUI.logFunctionCall('unifiedraganalysis')
              advancedUI.logFunctionUpdate('info', `Processed ${indexedCount} files, cost: $${totalCost.toFixed(6)}`)
            }
          }
        } catch (fileError) {
          advancedUI.logFunctionCall('unifiedraganalysis')
          advancedUI.logFunctionUpdate('warning', `Failed to index ${relative(projectPath, filePath)}: ${fileError}`)
        }
      }

      // Batch index documents with progress tracking
      if (documentsToIndex.length > 0) {
        advancedUI.logFunctionCall('unifiedraganalysis')
        advancedUI.logFunctionUpdate('info', `Uploading ${documentsToIndex.length} document chunks to vector store...`)

        // ChromaDB free tier has quota limits (typically 300-1000 records)
        // Upstash free tier: 10,000 vectors
        const MAX_CHROMADB_BATCH_SIZE = 100
        const MAX_UPSTASH_BATCH_SIZE = 1000
        const batchSize = Math.min(MAX_UPSTASH_BATCH_SIZE, Number(process.env.INDEXING_BATCH_SIZE || 300)) // Configurable indexing batch size

        // Limit total documents for ChromaDB free tier only
        const activeProvider = this.vectorStoreManager?.getStats()?.provider
        const isChromaDB = activeProvider === 'chromadb'
        const MAX_TOTAL_DOCUMENTS = isChromaDB ? 300 : 10000 // ChromaDB vs Upstash limits

        if (documentsToIndex.length > MAX_TOTAL_DOCUMENTS) {
          advancedUI.logFunctionCall('unifiedraganalysis')
          advancedUI.logFunctionUpdate(
            'warning',
            `Document count (${documentsToIndex.length}) exceeds ${activeProvider} quota limit (${MAX_TOTAL_DOCUMENTS})`
          )
          advancedUI.logFunctionUpdate(
            'warning',
            chalk.yellow(
              `⚠️ Document count (${documentsToIndex.length}) exceeds ${activeProvider} quota limit (${MAX_TOTAL_DOCUMENTS})`
            )
          )

          advancedUI.logFunctionCall('unifiedraganalysis')
          advancedUI.logFunctionUpdate('warning', `Limiting to ${MAX_TOTAL_DOCUMENTS} most important documents`)
          advancedUI.logFunctionUpdate(
            'warning',
            chalk.yellow(`   Limiting to ${MAX_TOTAL_DOCUMENTS} most important documents`)
          )
          // Sort by priority (files with more code content first)
          documentsToIndex = documentsToIndex
            .sort((a, b) => b.content.length - a.content.length)
            .slice(0, MAX_TOTAL_DOCUMENTS)
        }

        // 🚀 OPTIMIZATION: Pre-generate embeddings in large batches (much faster!)
        advancedUI.logFunctionCall('unifiedraganalysis')
        advancedUI.logFunctionUpdate('info', `Generating embeddings in batch...`)
        const embeddingBatchSize = 100 // OpenAI can handle 100+ at once

        for (let i = 0; i < documentsToIndex.length; i += embeddingBatchSize) {
          const embeddingBatch = documentsToIndex.slice(i, i + embeddingBatchSize)
          const embeddingQueries = embeddingBatch.map((doc) => ({ text: doc.content, id: doc.id }))

          try {
            const embeddings = await unifiedEmbeddingInterface.generateEmbeddings(embeddingQueries)

            // Attach embeddings to documents
            for (let j = 0; j < embeddingBatch.length; j++) {
              embeddingBatch[j].embedding = embeddings[j].vector
            }
          } catch (error) {
            advancedUI.logFunctionUpdate(
              'warning',
              chalk.yellow(
                `⚠️ Failed to generate embeddings for batch ${Math.floor(i / embeddingBatchSize) + 1}: ${error}`
              )
            )
          }
        }

        let successfulBatches = 0

        for (let i = 0; i < documentsToIndex.length; i += batchSize) {
          const batch = documentsToIndex.slice(i, i + batchSize)
          const batchNumber = Math.floor(i / batchSize) + 1
          const totalBatches = Math.ceil(documentsToIndex.length / batchSize)

          advancedUI.logFunctionCall('unifiedraganalysis')
          advancedUI.logFunctionUpdate(
            'info',
            `Uploading batch ${batchNumber}/${totalBatches} (${batch.length} chunks)`
          )

          const success = await this.vectorStoreManager.addDocuments(batch)

          if (success) {
            successfulBatches++
          } else {
            advancedUI.logFunctionCall('unifiedraganalysis')
            advancedUI.logFunctionUpdate('warning', chalk.yellow(`⚠️ Failed to upload batch ${batchNumber}`))
          }
        }

        const successRate = (successfulBatches / Math.ceil(documentsToIndex.length / batchSize)) * 100

        advancedUI.logFunctionCall('unifiedraganalysis')
        advancedUI.logFunctionUpdate('success', `Indexing complete!`)
        advancedUI.logFunctionUpdate('info', `Files processed: ${indexedCount}`)
        advancedUI.logFunctionUpdate('info', `Document chunks: ${documentsToIndex.length}`)
        advancedUI.logFunctionUpdate('info', `Upload success rate: ${successRate.toFixed(1)}%`)
        advancedUI.logFunctionUpdate('info', `Total cost: $${totalCost.toFixed(6)}`)
      }

      return { success: true, cost: totalCost, indexedFiles: indexedCount }
    } catch (error) {
      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate('error', `Vector store indexing failed: ${error}`)
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

  // Cache methods removed - now handled by CacheProvider

  /**
   * Generate file content hash for change detection
   */
  private generateFileHash(filePath: string, content: string): string {
    const stats = statSync(filePath)
    const hashInput = `${filePath}:${stats.mtime.getTime()}:${content.length}`
    return createHash('md5').update(hashInput).digest('hex')
  }

  /**
   * Detect programming language from file path
   */
  private detectLanguageFromPath(filePath: string): string {
    const ext = extname(filePath).toLowerCase()
    const fileName = basename(filePath).toLowerCase()

    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.pyw': 'python',
      '.py3': 'python',
      '.java': 'java',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.cpp': 'cpp',
      '.cxx': 'cpp',
      '.cc': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.hpp': 'cpp',
      '.hxx': 'cpp',
      '.rs': 'rust',
      '.go': 'go',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.m': 'objective-c',
      '.mm': 'objective-c',
      '.cs': 'csharp',
      '.fs': 'fsharp',
      '.vb': 'vbnet',
      '.dart': 'dart',
      '.elm': 'elm',
      '.ex': 'elixir',
      '.exs': 'elixir',
      '.clj': 'clojure',
      '.cljs': 'clojure',
      '.hs': 'haskell',
      '.ml': 'ocaml',
      '.mli': 'ocaml',
      '.f90': 'fortran',
      '.f95': 'fortran',
      '.html': 'html',
      '.htm': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.vue': 'vue',
      '.svelte': 'svelte',
      '.astro': 'astro',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.ini': 'ini',
      '.conf': 'config',
      '.config': 'config',
      '.md': 'markdown',
      '.mdx': 'markdown',
      '.rst': 'restructuredtext',
      '.txt': 'text',
      '.adoc': 'asciidoc',
      '.sh': 'shell',
      '.bash': 'shell',
      '.zsh': 'shell',
      '.fish': 'shell',
      '.ps1': 'powershell',
      '.bat': 'batch',
      '.cmd': 'batch',
      '.dockerfile': 'docker',
      '.graphql': 'graphql',
      '.gql': 'graphql',
      '.proto': 'protobuf',
      '.sql': 'sql',
    }

    // Special file name mappings
    const specialFiles: Record<string, string> = {
      dockerfile: 'docker',
      makefile: 'makefile',
      'cmakelists.txt': 'cmake',
      rakefile: 'ruby',
      gemfile: 'ruby',
      procfile: 'config',
      vagrantfile: 'ruby',
      'gruntfile.js': 'javascript',
      'gulpfile.js': 'javascript',
      'webpack.config.js': 'javascript',
      'rollup.config.js': 'javascript',
      'vite.config.js': 'javascript',
      'vite.config.ts': 'typescript',
      'jest.config.js': 'javascript',
      'babel.config.js': 'javascript',
      'package.json': 'json',
      'tsconfig.json': 'json',
      'composer.json': 'json',
      'cargo.toml': 'toml',
      'pyproject.toml': 'toml',
      'build.gradle': 'gradle',
      'pom.xml': 'xml',
    }

    return specialFiles[fileName] || languageMap[ext] || 'text'
  }

  /**
   * Calculate file importance based on path and content
   */
  private calculateFileImportance(filePath: string, content: string): number {
    let importance = 50 // Base importance

    const fileName = basename(filePath).toLowerCase()
    const dirName = dirname(filePath).toLowerCase()
    const lines = content.split('\n').length

    // Path-based importance
    if (fileName.includes('index.') || fileName.includes('main.') || fileName.includes('app.')) {
      importance += 25
    }

    if (fileName === 'package.json' || fileName === 'tsconfig.json' || fileName === 'cargo.toml') {
      importance += 30
    }

    if (fileName.includes('config') || fileName.includes('settings')) {
      importance += 15
    }

    if (fileName.includes('readme') || fileName.includes('license')) {
      importance += 20
    }

    if (dirName.includes('src') || dirName.includes('lib')) {
      importance += 15
    }

    if (dirName.includes('components') || dirName.includes('pages') || dirName.includes('api')) {
      importance += 10
    }

    if (fileName.includes('test') || fileName.includes('spec') || dirName.includes('test')) {
      importance -= 10
    }

    if (dirName.includes('dist') || dirName.includes('build') || dirName.includes('node_modules')) {
      importance -= 30
    }

    // Content-based importance
    if (lines > 100) importance += 5
    if (lines > 500) importance += 10
    if (lines > 1000) importance += 15

    // Language-specific bonuses
    const language = this.detectLanguageFromPath(filePath)
    if (['typescript', 'javascript', 'python', 'java', 'rust', 'go'].includes(language)) {
      importance += 10
    }

    // Check for exports/imports (indicates important module)
    if (content.includes('export') || content.includes('import')) {
      importance += 10
    }

    // Check for class/function definitions
    const functionCount = (content.match(/function |def |class |interface |type /g) || []).length
    importance += Math.min(functionCount * 2, 20)

    return Math.min(100, Math.max(0, importance))
  }

  /**
   * Extract primary languages from workspace
   */
  private extractWorkspaceLanguages(): string[] {
    if (!this.workspaceRAG) return []

    try {
      const context = this.workspaceRAG.getContext()
      return context.languages || []
    } catch {
      return []
    }
  }

  /**
   * Extract frameworks from workspace
   */
  private extractWorkspaceFrameworks(): string[] {
    if (!this.workspaceRAG) return []

    try {
      const context = this.workspaceRAG.getContext()
      return [context.framework].filter(Boolean)
    } catch {
      return []
    }
  }

  /**
   * Get recently modified files
   */
  private getRecentlyModifiedFiles(): string[] {
    if (!this.workspaceRAG) return []

    try {
      const context = this.workspaceRAG.getContext()
      const files = Array.from(context.files.values())
        .sort((a: any, b: any) => b.lastModified.getTime() - a.lastModified.getTime())
        .slice(0, 10)
        .map((f: any) => f.path)
      return files
    } catch {
      return []
    }
  }

  /**
   * Detect project type from workspace
   */
  private detectProjectType(): string {
    if (!this.workspaceRAG) return 'unknown'

    try {
      const context = this.workspaceRAG.getContext()
      return context.framework || 'unknown'
    } catch {
      return 'unknown'
    }
  }

  /**
   * Enhanced vector search with semantic scoring
   */
  private async searchVectorStoreWithSemantics(
    queryAnalysis: QueryAnalysis,
    limit: number
  ): Promise<RAGSearchResult[]> {
    if (!this.vectorStoreManager) {
      throw new Error('Vector store manager not available')
    }

    try {
      // Use expanded query for vector search
      const results = await this.vectorStoreManager.search(queryAnalysis.expandedQuery, Math.min(limit, 20), 0.3)

      const scoringContext: ScoringContext = {
        queryAnalysis,
        workspaceContext: {
          primaryLanguages: this.extractWorkspaceLanguages(),
          frameworks: this.extractWorkspaceFrameworks(),
          recentFiles: this.getRecentlyModifiedFiles(),
          projectType: this.detectProjectType(),
        },
        userContext: {
          recentQueries: [],
          preferences: [],
          expertise: [],
        },
      }

      // Apply semantic scoring to results
      const enhancedResults: RAGSearchResult[] = []

      for (const result of results) {
        const enhancedResult = await semanticSearchEngine.calculateEnhancedScore(
          result.content,
          result.metadata || {},
          queryAnalysis,
          scoringContext
        )

        enhancedResults.push({
          path: result.metadata?.path || result.metadata?.source || 'unknown',
          content: result.content,
          score: enhancedResult.score * 100, // Convert to percentage
          metadata: {
            ...result.metadata,
            fileType: result.metadata?.fileType || 'unknown',
            importance: result.metadata?.importance || 50,
            lastModified: result.metadata?.lastModified || new Date(),
            source: result.metadata?.source || 'vector',
            semanticBreakdown: enhancedResult.breakdown,
            relevanceFactors: enhancedResult.relevanceFactors,
            queryIntent: queryAnalysis.intent.type,
            queryConfidence: queryAnalysis.confidence,
          },
        })
      }

      return enhancedResults
        .filter((r) => r.score > 40) // Higher threshold for semantic results
        .sort((a, b) => b.score - a.score)
    } catch (error: any) {
      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate('error', `Enhanced vector search error: ${error.message}`)
      throw error
    }
  }

  /**
   * Enhanced search method that integrates semantic analysis
   */
  private async searchEnhanced(
    query: string,
    options: {
      limit: number
      includeContent: boolean
      semanticOnly: boolean
      queryAnalysis?: any
    }
  ): Promise<RAGSearchResult[]> {
    const { limit, queryAnalysis } = options

    if (queryAnalysis) {
      // Use the expanded query for better results
      const _expandedQuery = queryAnalysis.expandedQuery || query
      return await this.searchVectorStoreWithSemantics(queryAnalysis, limit)
    } else {
      // Fall back to regular search
      return await this.search(query, { limit, includeContent: options.includeContent })
    }
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
        lastHeader = `${section}\n`
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

  private async searchVectorStore(query: string, limit: number): Promise<RAGSearchResult[]> {
    if (!this.vectorStoreManager) {
      throw new Error('Vector store manager not available')
    }

    try {
      const results = await this.vectorStoreManager.search(query, Math.min(limit, 20), 0.3)

      const searchResults: RAGSearchResult[] = results.map((result) => ({
        source: result.metadata?.source || 'unknown',
        path: result.metadata?.source || 'unknown', // Add required path field
        content: result.content,
        score: result.score * 100, // Convert to percentage
        type: 'vector',
        metadata: {
          importance: result.metadata?.importance || 0,
          language: result.metadata?.language || 'unknown',
          chunkIndex: result.metadata?.chunkIndex || 0,
          totalChunks: result.metadata?.totalChunks || 1,
          hash: result.metadata?.hash || '',
          lastModified: result.metadata?.lastModified ? new Date(result.metadata.lastModified) : new Date(),
          source: 'vector' as const,
          fileType: result.metadata?.language || 'unknown',
        },
      }))

      return searchResults.filter((r) => r.score > 30) // Filter low confidence results
    } catch (error: any) {
      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate('error', `Vector store search error: ${error.message}`)
      throw error
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
      query.length > 50 || // Long queries benefit from re-ranking
      query.split(/\s+/).length > 8 || // Multi-word queries
      /[.!?]/.test(query) || // Sentence-like queries
      process.env.RAG_RERANK_ENABLED === 'true' // Force enable via env var
    )
  }

  /**
   * Apply intelligent re-ranking for complex queries
   */
  private applyIntelligentReranking(result: RAGSearchResult, query: string, queryWords: string[]): number {
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
      typescript: 0.15,
      javascript: 0.12,
      markdown: 0.08,
      json: 0.05,
    }

    score += fileTypeBoosts[result.metadata.fileType] || 0

    // 4. Importance factor (0-100 scale)
    score += (result.metadata.importance / 100) * 0.25

    // 5. Recency boost for recently modified files
    const daysSinceModified = (Date.now() - result.metadata.lastModified.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceModified < 7) {
      score += (0.1 * (7 - daysSinceModified)) / 7
    }

    return score
  }

  /**
   * Apply basic scoring for simple queries
   */
  private applyBasicScoring(result: RAGSearchResult, _query: string, queryWords: string[]): number {
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
      /^[a-zA-Z\s]+$/.test(query) && // English text queries
      query.split(/\s+/).length > 2 && // Multiple keywords
      query.length > 10 && // Substantial query length
      process.env.RAG_BM25_ENABLED === 'true' // Explicitly enabled
    )
  }

  /**
   * BM25 sparse search for keyword matching
   */
  private async bm25Search(query: string, limit: number): Promise<RAGSearchResult[]> {
    if (!this.workspaceRAG) return []

    try {
      console.log(chalk.gray('🔤 Performing BM25 sparse search'))

      const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 2) // Filter out very short terms

      const results: Array<{ file: any; score: number }> = []

      // Simple BM25-like scoring for each file
      for (const [, file] of this.workspaceRAG.getContext().files) {
        const content = file.content.toLowerCase()
        let score = 0

        queryTerms.forEach((term) => {
          const termFreq = (content.match(new RegExp(term, 'g')) || []).length
          const docLength = content.length
          const avgDocLength = 2000 // Estimated average

          if (termFreq > 0) {
            // Simplified BM25 formula
            const tf = termFreq / (termFreq + 1.2 * (0.25 + 0.75 * (docLength / avgDocLength)))
            const idf = Math.log(1 + this.workspaceRAG?.getContext().files.size / (termFreq + 1))
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
      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate('warning', `BM25 search error: ${(error as Error).message}`)
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
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'can',
      'must',
      'this',
      'that',
      'these',
      'those',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
    ])

    const words = query.toLowerCase().split(/\s+/)
    const filtered = words.filter((word) => {
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
      function: ['method', 'procedure', 'func'],
      component: ['element', 'widget', 'part'],
      config: ['configuration', 'settings', 'setup'],
      error: ['bug', 'issue', 'problem', 'exception'],
      api: ['endpoint', 'service', 'interface'],
      database: ['db', 'datastore', 'storage'],
      user: ['client', 'customer', 'account'],
      create: ['make', 'build', 'generate', 'add'],
      delete: ['remove', 'destroy', 'drop'],
      update: ['modify', 'change', 'edit'],
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
      today: now.toLocaleDateString(),
      yesterday: new Date(now.getTime() - 86400000).toLocaleDateString(),
      'this week': `week of ${new Date(now.getTime() - now.getDay() * 86400000).toLocaleDateString()}`,
      'last week': `week of ${new Date(now.getTime() - (now.getDay() + 7) * 86400000).toLocaleDateString()}`,
      'this month': now.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
      'last month': new Date(now.getFullYear(), now.getMonth() - 1).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
      }),
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
    advancedUI.logFunctionCall('unifiedraganalysis')
    advancedUI.logFunctionUpdate('info', 'RAG configuration updated')
  }

  async clearCaches(): Promise<void> {
    await this.embeddingsCache.clear()
    await this.analysisCache.clear()
    await this.fileHashCache.clear()
    advancedUI.logFunctionCall('unifiedraganalysis')
    advancedUI.logFunctionUpdate('success', 'RAG caches cleared')
  }

  getStats() {
    const embeddingsCacheStats = this.embeddingsCache.getStats()
    const analysisCacheStats = this.analysisCache.getStats()
    const fileHashCacheStats = this.fileHashCache.getStats()

    return {
      caches: {
        embeddings: {
          entries: embeddingsCacheStats.totalEntries,
          size: `${(embeddingsCacheStats.totalSize / 1024 / 1024).toFixed(2)} MB`,
          hitRate: `${embeddingsCacheStats.hitRate.toFixed(1)}%`,
          hits: embeddingsCacheStats.totalHits,
          misses: embeddingsCacheStats.totalMisses,
        },
        analysis: {
          entries: analysisCacheStats.totalEntries,
          size: `${(analysisCacheStats.totalSize / 1024 / 1024).toFixed(2)} MB`,
          hitRate: `${analysisCacheStats.hitRate.toFixed(1)}%`,
        },
        fileHashes: {
          entries: fileHashCacheStats.totalEntries,
          size: `${(fileHashCacheStats.totalSize / 1024).toFixed(2)} KB`,
        },
      },
      vectorDBAvailable: !!this.vectorStoreManager,
      workspaceRAGAvailable: !!this.workspaceRAG,
      config: this.config,
      performance: {
        ...this.searchMetrics,
        cacheHitRate:
          this.searchMetrics.totalSearches > 0
            ? `${((this.searchMetrics.cacheHits / this.searchMetrics.totalSearches) * 100).toFixed(1)}%`
            : '0%',
        errorRate:
          this.searchMetrics.totalSearches > 0
            ? `${((this.searchMetrics.errors / this.searchMetrics.totalSearches) * 100).toFixed(1)}%`
            : '0%',
        averageLatencyMs: Math.round(this.searchMetrics.averageLatency),
      },
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
        errorRate: totalSearches > 0 ? `${((this.searchMetrics.errors / totalSearches) * 100).toFixed(1)}%` : '0%',
      },
      optimization: {
        cacheHits: this.searchMetrics.cacheHits,
        cacheHitRate:
          totalSearches > 0 ? `${((this.searchMetrics.cacheHits / totalSearches) * 100).toFixed(1)}%` : '0%',
        queryOptimizations: this.searchMetrics.queryOptimizations,
        reranks: this.searchMetrics.reranks,
        rerankRate: totalSearches > 0 ? `${((this.searchMetrics.reranks / totalSearches) * 100).toFixed(1)}%` : '0%',
      },
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
      reranks: 0,
    }
    advancedUI.logFunctionCall('unifiedraganalysis')
    advancedUI.logFunctionUpdate('success', 'RAG performance metrics reset')
  }

  /**
   * Log comprehensive performance report
   */
  logPerformanceReport() {
    const metrics = this.getPerformanceMetrics()

    advancedUI.logFunctionCall('unifiedraganalysis')
    advancedUI.logFunctionUpdate('info', 'RAG Performance Report')
    advancedUI.logFunctionUpdate('info', chalk.gray('═'.repeat(50)))

    advancedUI.logFunctionUpdate('info', 'Search Distribution:')
    advancedUI.logFunctionUpdate('info', `  Total Searches: ${metrics.searches.total}`)
    advancedUI.logFunctionUpdate(
      'info',
      `  Vector: ${metrics.searches.vector} (${((metrics.searches.vector / metrics.searches.total) * 100).toFixed(1)}%)`
    )
    advancedUI.logFunctionUpdate(
      'info',
      `  Workspace: ${metrics.searches.workspace} (${((metrics.searches.workspace / metrics.searches.total) * 100).toFixed(1)}%)`
    )
    advancedUI.logFunctionUpdate(
      'info',
      `  BM25: ${metrics.searches.bm25} (${((metrics.searches.bm25 / metrics.searches.total) * 100).toFixed(1)}%)`
    )
    advancedUI.logFunctionUpdate('info', `  Average Latency: ${metrics.performance.averageLatency}ms`)
    advancedUI.logFunctionUpdate('info', `  Error Rate: ${metrics.performance.errorRate}`)
    advancedUI.logFunctionUpdate('info', `  Cache Hit Rate: ${metrics.optimization.cacheHitRate}`)
    advancedUI.logFunctionUpdate('info', `  Query Optimizations: ${metrics.optimization.queryOptimizations}`)
    advancedUI.logFunctionUpdate('info', `  Re-rank Rate: ${metrics.optimization.rerankRate}`)

    advancedUI.logFunctionUpdate('info', 'Performance:')
    advancedUI.logFunctionUpdate('info', `  Average Latency: ${metrics.performance.averageLatency}ms`)
    advancedUI.logFunctionUpdate('info', `  Error Rate: ${metrics.performance.errorRate}`)

    advancedUI.logFunctionUpdate('info', 'Optimizations:')
    advancedUI.logFunctionUpdate('info', `  Cache Hit Rate: ${metrics.optimization.cacheHitRate}`)
    advancedUI.logFunctionUpdate('info', `  Query Optimizations: ${metrics.optimization.queryOptimizations}`)
    advancedUI.logFunctionUpdate('info', `  Re-rank Rate: ${metrics.optimization.rerankRate}`)

    const efficiency = this.calculateEfficiencyScore(metrics)
    advancedUI.logFunctionUpdate('info', 'Efficiency Score:')
    advancedUI.logFunctionUpdate(
      'info',
      `  Overall: ${efficiency.overall}/100 ${this.getEfficiencyEmoji(efficiency.overall)}`
    )
    advancedUI.logFunctionUpdate('info', `  Latency: ${efficiency.latency}/25`)
    advancedUI.logFunctionUpdate('info', `  Cache: ${efficiency.cache}/25`)
    advancedUI.logFunctionUpdate('info', `  Error Rate: ${efficiency.errorRate}/25`)
    advancedUI.logFunctionUpdate('info', `  Feature Usage: ${efficiency.featureUsage}/25`)
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
      featureUsage,
    }
  }

  /**
   * Get emoji for efficiency score
   */
  private getEfficiencyEmoji(score: number): string {
    if (score >= 90) return '🚀'
    if (score >= 80) return '⚡'
    if (score >= 70) return '✓'
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
    await this.ensureInitialized()

    // Get initial results
    const results = await this.search(query, options)

    // Apply token-aware truncation
    const truncatedResults = tokenAwareTruncate(results, maxTokens)

    advancedUI.logFunctionCall('unifiedraganalysis')
    advancedUI.logFunctionUpdate(
      'info',
      `🎯 Optimized results: ${results.length} → ${truncatedResults.length} contexts, ` +
      `~${estimateTokensFromChars(truncatedResults.reduce((sum, r) => sum + r.content.length, 0))} tokens`
    )
    advancedUI.logFunctionUpdate(
      'info',
      `🎯 Optimized results: ${results.length} → ${truncatedResults.length} contexts, ` +
      `~${estimateTokensFromChars(truncatedResults.reduce((sum, r) => sum + r.content.length, 0))} tokens`
    )
    chalk.blue(
      `🎯 Optimized results: ${results.length} → ${truncatedResults.length} contexts, ` +
      `~${estimateTokensFromChars(truncatedResults.reduce((sum, r) => sum + r.content.length, 0))} tokens`
    )

    return truncatedResults
  }
}

// Export singleton instance
export const unifiedRAGSystem = new UnifiedRAGSystem()

// Legacy functions for backward compatibility
export async function indexProject(projectPath: string) {
  advancedUI.logFunctionCall('unifiedraganalysis')
  advancedUI.logFunctionUpdate('info', '⚡︎ Using legacy indexProject (consider upgrading to UnifiedRAGSystem)')
  try {
    const result = await unifiedRAGSystem.analyzeProject(projectPath)
    advancedUI.logFunctionUpdate('success', `✓ Legacy indexing completed - ${result.indexedFiles} files processed`)
  } catch (error: any) {
    advancedUI.logFunctionCall('unifiedraganalysis')
    advancedUI.logFunctionUpdate('error', `❌ Legacy indexing failed: ${error.message}`)
  }
}

export async function search(query: string) {
  advancedUI.logFunctionCall('unifiedraganalysis')
  advancedUI.logFunctionUpdate('info', '⚡︎ Using legacy search (consider upgrading to UnifiedRAGSystem)')
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
    advancedUI.logFunctionCall('unifiedraganalysis')
    advancedUI.logFunctionUpdate('error', `❌ Legacy search failed: ${error.message}`)
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
      if (remainingTokens > 50) {
        // Minimum chunk size
        const truncatedContent = truncateToTokensWithBoundaries(context.content, remainingTokens)

        truncated.push({
          ...context,
          content: truncatedContent,
          metadata: {
            ...context.metadata,
            truncated: true,
            originalLength: context.content.length,
            truncatedLength: truncatedContent.length,
          },
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
    /\n\n/g, // Paragraph breaks
    /\.\s+/g, // Sentence endings
    /;\s*\n/g, // Code statement endings
    /\}\s*\n/g, // Code block endings
    /,\s+/g, // Comma separations
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

  return `${text.substring(0, bestCutoff)}\n[... content truncated for length ...]`
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
