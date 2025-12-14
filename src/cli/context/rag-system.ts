import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { createOpenAI } from '@ai-sdk/openai'
import { embed } from 'ai'
import chalk from 'chalk'
// Import ultra-fast RAG inference layer
import { getRAGInference, type RAGSearchResult as RAGInferenceResult } from '../ai/rag-inference-layer'
import { TOKEN_LIMITS } from '../config/token-limits'
import { type CacheProvider, globalCacheManager } from '../core/cache-provider'
import { configManager } from '../core/config-manager'
import { advancedUI } from '../ui/advanced-cli-ui'
import { createFileFilter, type FileFilterSystem } from './file-filter-system'
// Import semantic search engine and file filtering
import { type QueryAnalysis, type ScoringContext, semanticSearchEngine } from './semantic-search-engine'
// Import unified embedding and vector store infrastructure
import { unifiedEmbeddingInterface } from './unified-embedding-interface'
import { type RerankingDocument, unifiedRerankingInterface } from './unified-reranking-interface'
import {
  createVectorStoreManager,
  type VectorDocument,
  type VectorStoreManager,
  type VectorStoreStats,
} from './vector-store-abstraction'
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
  enableReranking: boolean
  rerankingModel?: string | null
  rerankingTopK?: number
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
    reranked?: boolean
    rerankingScore?: number
    originalScore?: number
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
  const costPer1K = provider === 'openai' ? 0.00002 : provider === 'google' ? 0.000025 : 0.00003
  return (estimatedTokens / 1000) * costPer1K
}

// Initialize vector store configurations based on environment
function createVectorStoreConfigs() {
  const configs = []

  // Check if local-first mode is enabled (default: true for fast startup)
  const useLocalFirst = 'false'

  if (useLocalFirst) {
    // 🚀 PRIMARY: Local filesystem (instant startup, no network latency)
    configs.push({
      provider: 'local' as const,
      connectionConfig: {
        baseDir: join(homedir(), '.nikcli', 'vector-store'),
      },
      collectionName: 'local_vectors',
      embeddingDimensions: unifiedEmbeddingInterface.getCurrentDimensions(),
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
      embeddingDimensions: unifiedEmbeddingInterface.getCurrentDimensions(),
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
      embeddingDimensions: unifiedEmbeddingInterface.getCurrentDimensions(),
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
      embeddingDimensions: unifiedEmbeddingInterface.getCurrentDimensions(),
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
      embeddingDimensions: unifiedEmbeddingInterface.getCurrentDimensions(),
      indexingBatchSize: 50,
      maxRetries: 1,
      healthCheckInterval: 600000,
      autoFallback: true,
    })
  }

  return configs
}

// Utility functions
async function estimateIndexingCost(files: string[], projectPath: string): Promise<number> {
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
  private readonly CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days for project analysis persistence

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
    rerankingLatency: 0,
    rerankingCost: 0,
    rerankingModel: null as string | null,
    rerankingFallbacks: 0,
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
      enableReranking: process.env.RERANKING_ENABLED !== 'false',
      rerankingModel: process.env.RERANKING_MODEL || 'sentence-transformers/paraphrase-minilm-l6-v2',
      rerankingTopK: Number(process.env.RERANKING_TOP_K || 10),
      ...config,
    }

    // Initialize reranking interface if enabled
    if (this.config.enableReranking && this.config.rerankingModel) {
      unifiedRerankingInterface.updateConfig({
        model: this.config.rerankingModel,
        topK: this.config.rerankingTopK,
      })
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
          }
        })
        .catch((err) => {
          // Silent failure - RAG will work in fallback mode
          if (!process.env.NIKCLI_QUIET_STARTUP) {
            advancedUI.logFunctionCall('unifiedraganalysis')
            advancedUI.logFunctionUpdate('warning', `RAG initialization Warning`)
          }
        })
    })
  }

  /**
   * Background initialization - runs silently without blocking CLI startup
   * @deprecated Use startBackgroundInitialization() instead
   */
  private _initializeClientsBackground(): void {
    this.startBackgroundInitialization()
  }

  private async initializeClients(): Promise<void> {
    try {
      const projectRoot = process.cwd()

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
          this.config.useVectorDB = initialized
        } catch (error: any) {
          this.config.useVectorDB = false
        }
      }

      this.initialized = true
    } catch (error: any) {
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
      this.initialized = true // Set true to avoid infinite wait, RAG will work in fallback mode
    }
  }

  /**
   * Generate hash for project files to detect changes
   */
  private async getProjectFilesHash(projectPath: string): Promise<string> {
    const crypto = await import('node:crypto')
    
    try {
      // Get all relevant files in the project
      const files = await this.getAllProjectFiles(projectPath)
      const fileHashes: string[] = []
      
      for (const filePath of files) {
        try {
          const stat = statSync(filePath)
          const cacheKey = `file-hash-${filePath}`
          
          // Check cache first
          const cachedHash = await this.fileHashCache.get<string>(cacheKey)
          let fileHash: string
          
          if (cachedHash) {
            // Verify file hasn't changed by checking modification time
            const cachedData = await this.fileHashCache.get<{ hash: string; mtime: number }>(`${cacheKey}-data`)
            if (cachedData && cachedData.mtime === stat.mtime.getTime()) {
              fileHash = cachedData.hash
            } else {
              // File changed, recalculate hash
              const content = await readFile(filePath, 'utf-8')
              fileHash = crypto.createHash('md5').update(content).digest('hex')
              await this.fileHashCache.set(cacheKey, fileHash)
              await this.fileHashCache.set(`${cacheKey}-data`, { 
                hash: fileHash, 
                mtime: stat.mtime.getTime() 
              })
            }
          } else {
            // No cache entry, calculate hash
            const content = await readFile(filePath, 'utf-8')
            fileHash = crypto.createHash('md5').update(content).digest('hex')
            await this.fileHashCache.set(cacheKey, fileHash)
            await this.fileHashCache.set(`${cacheKey}-data`, { 
              hash: fileHash, 
              mtime: stat.mtime.getTime() 
            })
          }
          
          fileHashes.push(`${filePath}:${fileHash}`)
        } catch (error) {
          // Skip files that can't be read (binary, permissions, etc.)
          continue
        }
      }
      
      // Create final project hash from all file hashes
      const projectHash = crypto.createHash('md5').update(fileHashes.join('|')).digest('hex')
      return projectHash
      
    } catch (error) {
      // Fallback to simple path+time hash
      return crypto.createHash('md5').update(`${projectPath}:${Date.now()}`).digest('hex')
    }
  }

  /**
   * Check if project needs re-indexing based on file changes
   */
  private async checkIfProjectNeedsReindexing(projectPath: string): Promise<boolean> {
    try {
      const currentHash = await this.getProjectFilesHash(projectPath)
      const cacheKey = `project-hash-${projectPath}`
      const cachedHash = await this.fileHashCache.get<string>(cacheKey)
      
      if (cachedHash && cachedHash === currentHash) {
        return false // No changes detected
      }
      
      // Hash changed or no cache entry, update cache and return true
      await this.fileHashCache.set(cacheKey, currentHash)
      return true
      
    } catch (error) {
      // On error, assume re-indexing is needed
      return true
    }
  }

  /**
   * Get all relevant project files for hashing
   */
  private async getAllProjectFiles(projectPath: string): Promise<string[]> {
    const { glob } = await import('glob')
    
    const patterns = [
      `${projectPath}/**/*.{ts,tsx,js,jsx,py,java,cpp,c,h,hpp,go,rs,php,rb,swift,kt,scala,cs}`,
      `${projectPath}/**/*.{md,txt,json,yaml,yml,toml,ini,cfg}`,
      `${projectPath}/**/package.json`,
      `${projectPath}/**/tsconfig.json`,
      `${projectPath}/**/*.config.{js,ts,json}`
    ]
    
    try {
      const allFiles: string[] = []
      for (const pattern of patterns) {
        const files = await glob(pattern, { 
          ignore: [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/.git/**',
            '**/coverage/**',
            '**/target/**',
            '**/__pycache__/**',
            '**/*.min.js',
            '**/*.bundle.js'
          ]
        })
        allFiles.push(...files)
      }
      
      // Remove duplicates and filter out non-files
      const uniqueFiles = [...new Set(allFiles)]
      return uniqueFiles.filter(file => {
        try {
          return statSync(file).isFile()
        } catch {
          return false
        }
      })
      
    } catch (error) {
      return []
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

    // Check if re-indexing is needed
    const needsReindexing = await this.checkIfProjectNeedsReindexing(projectPath)
    
    // Check cache with project hash for better invalidation
    const projectHash = await this.getProjectFilesHash(projectPath)
    const cacheKey = `analysis - ${projectPath} - ${projectHash}`
    const cached = await this.analysisCache.get<RAGAnalysisResult>(cacheKey)
    if (cached && !needsReindexing) {
      advancedUI.logFunctionUpdate('info', `Using cached RAG analysis for project (hash: ${projectHash.substring(0, 8)}...)`, '💾')
      return cached
    }

    let workspaceContext: WorkspaceContext
    let vectorDBStatus: 'available' | 'unavailable' | 'error' = 'unavailable'
    let embeddingsCost = 0
    let indexedFiles = 0

    // 1. Workspace Analysis (always run)
    if (this.config.enableWorkspaceAnalysis && this.workspaceRAG) {
      workspaceContext = await this.workspaceRAG.analyzeWorkspace()
      indexedFiles = workspaceContext?.files?.size || indexedFiles
    } else {
      // Fallback minimal analysis
      workspaceContext = this.createMinimalWorkspaceContext(projectPath)
      indexedFiles = workspaceContext?.files?.size || indexedFiles
    }

    // 2. Vector DB Indexing (if available and cost-effective)
    if (this.config.useVectorDB && this.vectorStoreManager) {
      try {
        const indexResult = await this.indexProjectWithVectorStore(projectPath, workspaceContext)
        vectorDBStatus = indexResult.success ? 'available' : 'error'
        embeddingsCost = indexResult.cost
        indexedFiles = indexResult.indexedFiles
      } catch (_error) {
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

    const { limit = 10 } = options || {}

    try {
      // Use semantic search engine for query analysis
      const queryAnalysis = await semanticSearchEngine.analyzeQuery(query)

      // Use the enhanced search with semantic analysis
      return await this.searchEnhanced(query, {
        limit,
        includeContent: true,
        semanticOnly: true,
        queryAnalysis,
      })
    } catch (_error) {
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

    const { limit = 10, semanticOnly = false } = options || {}
    const startTime = Date.now()

    // Initialize monitoring
    this.searchMetrics.totalSearches++
    const searchTypes: string[] = []

    try {
      // Apply query optimization pipeline
      const optimizedQuery = this.optimizeQuery(query)
      if (optimizedQuery !== query) {
        this.searchMetrics.queryOptimizations++
      }

      // Run hybrid searches concurrently (vector, workspace, and BM25)
      const searchPromises: Promise<RAGSearchResult[]>[] = []

      // 1. Vector Store Search (if available)
      if (this.config.useVectorDB && this.vectorStoreManager && !semanticOnly) {
        searchTypes.push('vector')
        this.searchMetrics.vectorSearches++
        searchPromises.push(
          this.searchVectorStore(optimizedQuery, Math.ceil(limit * 0.5)).catch(() => {
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

      // 3. Hybrid scoring and deduplication with re-ranking
      const uniqueResults = await this.deduplicateAndRank(results, query, limit)
      const finalResults = uniqueResults.slice(0, limit)

      // Update performance metrics
      const duration = Date.now() - startTime
      this.searchMetrics.totalLatency += duration
      this.searchMetrics.averageLatency = this.searchMetrics.totalLatency / this.searchMetrics.totalSearches

      const rerankingInfo =
        this.searchMetrics.reranks > 0
          ? `, reranked (${this.searchMetrics.rerankingModel || 'model'})`
          : this.searchMetrics.rerankingFallbacks > 0
            ? ', rerank-fallback'
            : ''

      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate(
        'success',
        `Found ${finalResults.length} results in ${duration}ms(${searchTypes.join('+')}, ${cacheHits} cached${rerankingInfo})`
      )

      return finalResults
    } catch (error) {
      this.searchMetrics.errors++
      const duration = Date.now() - startTime
      this.searchMetrics.totalLatency += duration
      this.searchMetrics.averageLatency = this.searchMetrics.totalLatency / this.searchMetrics.totalSearches

      throw error
    }
  }

  /**
   * Ultra-fast RAG inference search (~30-80ms for 100+ documents)
   * Uses pre-computed embeddings and optimized indexing
   * Same precision as full semantic search with 3-5x faster performance
   */
  async searchFast(
    query: string,
    options?: {
      limit?: number
    }
  ): Promise<RAGSearchResult[]> {
    const { limit = 10 } = options || {}
    const startTime = Date.now()

    try {
      const ragInference = getRAGInference()

      // Check if index is ready
      const stats = ragInference.getCacheStats()
      if (stats.indexedDocuments === 0) {
        // Fall back to regular search if index not ready
        return await this.search(query, { limit })
      }

      // Ultra-fast semantic search
      const inferenceResults = await ragInference.search(query, limit)

      // Convert RAG inference results to unified RAG results
      const results: RAGSearchResult[] = inferenceResults.map((result) => ({
        content: result.content,
        path: result.path,
        score: result.score,
        metadata: {
          fileType: 'inferred',
          importance: 50,
          lastModified: new Date(),
          source: 'hybrid',
          semanticBreakdown: {
            semanticScore: result.scoreBreakdown.semantic,
            keywordScore: result.scoreBreakdown.keyword,
            contextScore: result.scoreBreakdown.context,
            recencyScore: result.scoreBreakdown.recency,
            importanceScore: result.scoreBreakdown.importance,
            diversityScore: result.scoreBreakdown.diversity,
          },
          relevanceFactors: [result.relevanceReason],
        },
      }))

      return results
    } catch (error) {
      const duration = Date.now() - startTime
      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate(
        'warning',
        `Fast search failed in ${duration} ms: ${(error as Error).message}, falling back to regular search`
      )

      // Graceful fallback
      return await this.search(query, { limit })
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

      // Use intelligent file filtering to get indexable files
      const filesToIndex = this.fileFilter.getFilesToIndex(projectPath)

      // Show filtering statistics
      this.fileFilter.logStats()

      let totalCost = 0
      let indexedCount = 0
      let documentsToIndex: VectorDocument[] = []

      let skippedFiles = 0
      let processedFiles = 0

      for (const filePath of filesToIndex) {
        try {
          const relativePath = relative(projectPath, filePath)
          const fileStats = statSync(filePath)
          const fileHash = `${filePath}:${fileStats.mtime.getTime()}`
          
          // Check if file is already indexed and hasn't changed
          const cacheKey = `indexed-file-${fileHash}`
          const isAlreadyIndexed = await this.fileHashCache.get<boolean>(cacheKey)
          
          if (isAlreadyIndexed) {
            skippedFiles++
            continue
          }

          const content = await readFile(filePath, 'utf-8')

          // Skip empty files
          if (content.trim().length === 0) continue

          processedFiles++

          // Estimate cost before processing
          const estimatedCost = estimateCost([content])
          if (totalCost + estimatedCost > this.config.costThreshold) {
            break
          }

          // Get file metadata from workspace context or create default
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
              const documentId = `${relativePath} #${idx} `

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
            }
          }
        } catch (fileError) { }
      }

      // Batch index documents with progress tracking
      if (documentsToIndex.length > 0) {
        // ChromaDB free tier has quota limits (typically 300-1000 records)
        // Upstash free tier: 10,000 vectors
        const MAX_UPSTASH_BATCH_SIZE = 1000
        const batchSize = Math.min(MAX_UPSTASH_BATCH_SIZE, Number(process.env.INDEXING_BATCH_SIZE || 300)) // Configurable indexing batch size

        // Limit total documents for ChromaDB free tier only
        const activeProvider = this.vectorStoreManager?.getStats()?.provider
        const isChromaDB = activeProvider === 'chromadb'
        const MAX_TOTAL_DOCUMENTS = isChromaDB ? 300 : 10000 // ChromaDB vs Upstash limits

        if (documentsToIndex.length > MAX_TOTAL_DOCUMENTS) {
          // Sort by priority (files with more code content first)
          documentsToIndex = documentsToIndex
            .sort((a, b) => b.content.length - a.content.length)
            .slice(0, MAX_TOTAL_DOCUMENTS)
        }

        // 🚀 OPTIMIZATION: Pre-generate embeddings in large batches (much faster!)

        const embeddingBatchSize = 100 // OpenAI can handle 100+ at once

        for (let i = 0; i < documentsToIndex.length; i += embeddingBatchSize) {
          const embeddingBatch = documentsToIndex.slice(i, i + embeddingBatchSize)
          const embeddingQueries = embeddingBatch.map((doc) => ({ text: doc.content, id: doc.id }))

          try {
            const embeddings = await unifiedEmbeddingInterface.generateEmbeddings(embeddingQueries)

            // Attach embeddings to documents
            for (let j = 0; j < embeddingBatch.length; j++) {
              if (embeddings[j] && embeddings[j].vector) {
                embeddingBatch[j].embedding = embeddings[j].vector
              } else {
                advancedUI.logFunctionUpdate(
                  'warning',
                  chalk.yellow(`⚠︎ No valid embedding for document ${embeddingBatch[j].id}`)
                )
              }
            }
          } catch (error) { }
        }

        let successfulBatches = 0

        for (let i = 0; i < documentsToIndex.length; i += batchSize) {
          const batch = documentsToIndex.slice(i, i + batchSize)
          const batchNumber = Math.floor(i / batchSize) + 1
          const totalBatches = Math.ceil(documentsToIndex.length / batchSize)

          const success = await this.vectorStoreManager.addDocuments(batch)

          if (success) {
            successfulBatches++
          } else {
          }
        }

        const successRate = (successfulBatches / Math.ceil(documentsToIndex.length / batchSize)) * 100

        // Mark processed files as indexed
        for (const filePath of filesToIndex) {
          try {
            const fileStats = statSync(filePath)
            const fileHash = `${filePath}:${fileStats.mtime.getTime()}`
            const cacheKey = `indexed-file-${fileHash}`
            await this.fileHashCache.set(cacheKey, true)
          } catch (error) {
            // Ignore errors in marking files as indexed
          }
        }

        // Show improved statistics
        const totalFiles = filesToIndex.length
        const cacheHitRate = totalFiles > 0 ? ((skippedFiles / totalFiles) * 100).toFixed(1) : '0'
        
        advancedUI.logFunctionCall('unifiedraganalysis')
        advancedUI.logFunctionUpdate('success', 
          `Indexing complete! Processed ${processedFiles} new/changed files, skipped ${skippedFiles} cached files (${cacheHitRate}% cache hit rate)`
        )
      } else {
        advancedUI.logFunctionUpdate('info', 
          `All ${skippedFiles} files already indexed and up-to-date (100% cache hit rate)`
        )
      }

      return { success: true, cost: totalCost, indexedFiles: processedFiles }
    } catch (error) {
      advancedUI.logFunctionCall('unifiedraganalysis')
      advancedUI.logFunctionUpdate('error', `Vector store indexing failed: ${error} `)
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
    const hashInput = `${filePath}:${stats.mtime.getTime()}:${content.length} `
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
        lastHeader = `${section} \n`
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

  private async deduplicateAndRank(
    results: RAGSearchResult[],
    query: string,
    limit: number
  ): Promise<RAGSearchResult[]> {
    const pathMap = new Map<string, RAGSearchResult>()
    const queryWords = query.toLowerCase().split(/\s+/)

    // Deduplicate by path, keeping highest scoring result
    for (const result of results) {
      const existing = pathMap.get(result.path)
      if (!existing || result.score > existing.score) {
        pathMap.set(result.path, result)
      }
    }

    const uniqueResults = Array.from(pathMap.values())

    // Apply reranking if enabled and conditions are met
    if (this.config.enableReranking && this.shouldUseReranking(query, uniqueResults.length)) {
      try {
        const rerankingStartTime = Date.now()
        const rerankedResults = await this.applyReranking(query, uniqueResults, limit)
        const rerankingLatency = Date.now() - rerankingStartTime

        this.searchMetrics.reranks++
        this.searchMetrics.rerankingLatency =
          (this.searchMetrics.rerankingLatency * (this.searchMetrics.reranks - 1) + rerankingLatency) /
          this.searchMetrics.reranks
        this.searchMetrics.rerankingModel = this.config.rerankingModel || null

        // Update reranking cost from stats
        const rerankingStats = unifiedRerankingInterface.getStats()
        this.searchMetrics.rerankingCost = rerankingStats.totalCost

        return rerankedResults
      } catch (error) {
        // Fallback to heuristic reranking
        this.searchMetrics.rerankingFallbacks++
        advancedUI.logWarning(`⚠︎ Reranking failed, using heuristic fallback: ${(error as Error).message}`)
        return this.applyHeuristicReranking(uniqueResults, query, queryWords)
      }
    } else {
      // Use heuristic reranking
      return this.applyHeuristicReranking(uniqueResults, query, queryWords)
    }
  }

  /**
   * Apply ML-based reranking using OpenRouter
   */
  private async applyReranking(query: string, results: RAGSearchResult[], limit: number): Promise<RAGSearchResult[]> {
    if (!this.config.enableReranking || !this.config.rerankingModel) {
      return results
    }

    // Special-case: use embedding similarity reranker for sentence-transformers/paraphrase-minilm-l6-v2 via OpenRouter
    if (this.config.rerankingModel === 'sentence-transformers/paraphrase-minilm-l6-v2') {
      return await this.rerankWithEmbeddingSimilarity(query, results, limit)
    }

    // Prepare documents for reranking
    const documents: RerankingDocument[] = results.map((result, index) => ({
      id: result.path || `doc-${index}`,
      content: result.content,
      metadata: {
        ...result.metadata,
        originalScore: result.score,
        path: result.path,
      },
    }))

    // Get top K candidates for reranking (usually 2-3x the final limit)
    const rerankingTopK = Math.min(this.config.rerankingTopK || limit * 2, documents.length)
    const candidates = documents.slice(0, rerankingTopK)

    // Call reranking interface
    const rerankingResult = await unifiedRerankingInterface.rerank({
      query,
      documents: candidates,
      topK: limit,
      useCache: true,
    })

    // Map reranked results back to original results
    const rerankedResults: RAGSearchResult[] = []
    const resultMap = new Map(results.map((r, idx) => [r.path || `doc-${idx}`, r]))

    for (const reranked of rerankingResult.results) {
      const originalIndex = reranked.index
      if (originalIndex < candidates.length) {
        const candidate = candidates[originalIndex]
        const originalResult = resultMap.get(candidate.id)
        if (originalResult) {
          // Update score with reranking score (normalize to 0-100 range)
          rerankedResults.push({
            ...originalResult,
            score: reranked.relevanceScore * 100,
            metadata: {
              ...originalResult.metadata,
              reranked: true,
              rerankingScore: reranked.relevanceScore,
              originalScore: originalResult.score,
            },
          })
        }
      }
    }

    // Add any remaining results that weren't reranked (shouldn't happen, but safety)
    const rerankedIds = new Set(rerankedResults.map((r) => r.path))
    for (const result of results) {
      if (!rerankedIds.has(result.path) && rerankedResults.length < limit) {
        rerankedResults.push(result)
      }
    }

    return rerankedResults.sort((a, b) => b.score - a.score)
  }

  /**
   * Lightweight embedding-similarity reranker using OpenRouter embedding endpoint
   */
  private async rerankWithEmbeddingSimilarity(
    query: string,
    results: RAGSearchResult[],
    limit: number
  ): Promise<RAGSearchResult[]> {
    const apiKey = configManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY
    if (!apiKey) return results

    const model = 'sentence-transformers/paraphrase-minilm-l6-v2'
    const openrouter = createOpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        'HTTP-Referer': 'https://nikcli.mintlify.app',
        'X-Title': 'NikCLI',
      },
    })

    const embedModel = openrouter.embedding(model)

    const embedText = async (text: string) => {
      const truncated = text.length > 2000 ? text.substring(0, 2000) : text
      const res = await embed({
        model: embedModel,
        value: truncated,
      })
      return res.embedding as number[]
    }

    try {
      const rerankingStart = Date.now()
      const queryEmbedding = await embedText(query)

      // Take topK candidates for rerank
      const topK = Math.min(this.config.rerankingTopK || limit * 2, results.length)
      const candidates = results.slice(0, topK)

      // Embed candidates with limited concurrency
      const embeddings: number[][] = []
      const batchSize = 8
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize)
        const batchEmbeds = await Promise.all(batch.map((doc) => embedText(doc.content)))
        for (let j = 0; j < batchEmbeds.length; j++) {
          embeddings[i + j] = batchEmbeds[j]
        }
      }

      const reranked = candidates.map((doc, idx) => {
        const docEmbedding = embeddings[idx]
        const score = docEmbedding ? this.cosineSimilarity(queryEmbedding, docEmbedding) : 0
        return {
          ...doc,
          score: score * 100,
          metadata: {
            ...doc.metadata,
            reranked: true,
            rerankingScore: score,
          },
        }
      })

      // Append remaining (unreranked) if needed
      const rerankedPaths = new Set(reranked.map((r) => r.path))
      for (const doc of results) {
        if (reranked.length >= limit) break
        if (!rerankedPaths.has(doc.path)) {
          reranked.push({
            ...doc,
            score: doc.score,
            metadata: {
              ...doc.metadata,
              reranked: true,
              rerankingScore: doc.score,
            },
          })
        }
      }

      const rerankingLatency = Date.now() - rerankingStart
      this.searchMetrics.reranks++
      this.searchMetrics.rerankingModel = model
      this.searchMetrics.rerankingLatency =
        (this.searchMetrics.rerankingLatency * (this.searchMetrics.reranks - 1) + rerankingLatency) /
        this.searchMetrics.reranks

      return reranked.sort((a, b) => b.score - a.score).slice(0, limit)
    } catch (_err) {
      return results
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const minLen = Math.min(a.length, b.length)
    let dot = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < minLen; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    if (normA === 0 || normB === 0) return 0
    return dot / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  /**
   * Apply heuristic reranking (fallback)
   */
  private applyHeuristicReranking(results: RAGSearchResult[], query: string, queryWords: string[]): RAGSearchResult[] {
    return results.map((result) => {
      let enhancedScore = result.score

      // Apply intelligent re-ranking if conditions are met
      if (this.shouldRerank(query)) {
        enhancedScore = this.applyIntelligentReranking(result, query, queryWords)
      } else {
        // Basic scoring for simple queries
        enhancedScore = this.applyBasicScoring(result, query, queryWords)
      }

      return { ...result, score: enhancedScore }
    })
  }

  /**
   * Determine if ML reranking should be used
   */
  private shouldUseReranking(query: string, resultCount: number): boolean {
    if (!this.config.enableReranking || !this.config.rerankingModel) {
      return false
    }

    // Check if we have enough results to rerank
    if (resultCount < 2) {
      return false
    }

    // Check if query is complex enough to benefit from reranking
    return (
      query.length > 20 || // Longer queries benefit more
      query.split(/\s+/).length > 3 || // Multi-word queries
      process.env.RERANKING_ENABLED === 'true' // Force enable
    )
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
      phrases.push(`${words[i]} ${words[i + 1]} `)
    }

    // Extract 3-word phrases
    for (let i = 0; i < words.length - 2; i++) {
      phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]} `)
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
      advancedUI.logFunctionUpdate('warning', `BM25 search error: ${(error as Error).message} `)
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
      const regex = new RegExp(`\\b${term} \\b`, 'gi')
      if (regex.test(expanded)) {
        // Add most relevant synonym
        const primarySynonym = synonyms[0]
        if (!expanded.toLowerCase().includes(primarySynonym)) {
          expanded = expanded.replace(regex, `${term} ${primarySynonym} `)
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
      'this week': `week of ${new Date(now.getTime() - now.getDay() * 86400000).toLocaleDateString()} `,
      'last week': `week of ${new Date(now.getTime() - (now.getDay() + 7) * 86400000).toLocaleDateString()} `,
      'this month': now.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
      'last month': new Date(now.getFullYear(), now.getMonth() - 1).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
      }),
    }

    let resolved = query
    Object.entries(replacements).forEach(([temporal, absolute]) => {
      const regex = new RegExp(`\\b${temporal} \\b`, 'gi')
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
          hitRate: `${embeddingsCacheStats.hitRate.toFixed(1)}% `,
          hits: embeddingsCacheStats.totalHits,
          misses: embeddingsCacheStats.totalMisses,
        },
        analysis: {
          entries: analysisCacheStats.totalEntries,
          size: `${(analysisCacheStats.totalSize / 1024 / 1024).toFixed(2)} MB`,
          hitRate: `${analysisCacheStats.hitRate.toFixed(1)}% `,
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
            ? `${((this.searchMetrics.cacheHits / this.searchMetrics.totalSearches) * 100).toFixed(1)}% `
            : '0%',
        errorRate:
          this.searchMetrics.totalSearches > 0
            ? `${((this.searchMetrics.errors / this.searchMetrics.totalSearches) * 100).toFixed(1)}% `
            : '0%',
        averageLatencyMs: Math.round(this.searchMetrics.averageLatency),
      },
    }
  }

  getVectorStoreStats(): VectorStoreStats | null {
    return this.vectorStoreManager?.getStats() || null
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
        errorRate: totalSearches > 0 ? `${((this.searchMetrics.errors / totalSearches) * 100).toFixed(1)}% ` : '0%',
      },
      optimization: {
        cacheHits: this.searchMetrics.cacheHits,
        cacheHitRate:
          totalSearches > 0 ? `${((this.searchMetrics.cacheHits / totalSearches) * 100).toFixed(1)}% ` : '0%',
        queryOptimizations: this.searchMetrics.queryOptimizations,
        reranks: this.searchMetrics.reranks,
        rerankRate: totalSearches > 0 ? `${((this.searchMetrics.reranks / totalSearches) * 100).toFixed(1)}% ` : '0%',
        rerankingLatency: Math.round(this.searchMetrics.rerankingLatency),
        rerankingCost: this.searchMetrics.rerankingCost,
        rerankingModel: this.searchMetrics.rerankingModel,
        rerankingFallbacks: this.searchMetrics.rerankingFallbacks,
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
      rerankingLatency: 0,
      rerankingCost: 0,
      rerankingModel: null,
      rerankingFallbacks: 0,
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
    advancedUI.logFunctionUpdate('info', `  Total Searches: ${metrics.searches.total} `)
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
    advancedUI.logFunctionUpdate('info', `  Average Latency: ${metrics.performance.averageLatency} ms`)
    advancedUI.logFunctionUpdate('info', `  Error Rate: ${metrics.performance.errorRate} `)
    advancedUI.logFunctionUpdate('info', `  Cache Hit Rate: ${metrics.optimization.cacheHitRate} `)
    advancedUI.logFunctionUpdate('info', `  Query Optimizations: ${metrics.optimization.queryOptimizations} `)
    advancedUI.logFunctionUpdate('info', `  Re - rank Rate: ${metrics.optimization.rerankRate} `)

    advancedUI.logFunctionUpdate('info', 'Performance:')
    advancedUI.logFunctionUpdate('info', `  Average Latency: ${metrics.performance.averageLatency} ms`)
    advancedUI.logFunctionUpdate('info', `  Error Rate: ${metrics.performance.errorRate} `)

    advancedUI.logFunctionUpdate('info', 'Optimizations:')
    advancedUI.logFunctionUpdate('info', `  Cache Hit Rate: ${metrics.optimization.cacheHitRate} `)
    advancedUI.logFunctionUpdate('info', `  Query Optimizations: ${metrics.optimization.queryOptimizations} `)
    advancedUI.logFunctionUpdate('info', `  Re - rank Rate: ${metrics.optimization.rerankRate} `)

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
    if (score >= 60) return '⚠︎'
    return '🐌'
  }

  /**
   * Search with token-aware result truncation
   */
  async searchWithTokenLimit(
    query: string,
    maxTokens: number = 3000,
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
    advancedUI.logFunctionUpdate('error', `✖ Legacy indexing failed: ${error.message}`)
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
    advancedUI.logFunctionUpdate('error', `✖ Legacy search failed: ${error.message}`)
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
