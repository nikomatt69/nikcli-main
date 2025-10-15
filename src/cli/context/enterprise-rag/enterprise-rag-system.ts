import chalk from 'chalk'
import { multiLayerContextExtractor, type ExtractedContext, type ExtractionTarget } from './multi-layer-context-extractor'
import { intelligentContextCache, type CacheOptions } from './intelligent-context-cache'
import { distributedContextManager, type DistributedContext } from './distributed-context-manager'

// Enterprise RAG Architecture - Main System Integration
// Based on the comprehensive design from NikCLI_Context_Awareness_RAG.md

export interface RAGQuery {
  text: string
  context?: QueryContext
  options?: RAGOptions
}

export interface QueryContext {
  agentId: string
  sessionId: string
  workspacePath: string
  timestamp: Date
}

export interface RAGOptions {
  maxResults?: number
  threshold?: number
  includeMetadata?: boolean
  useCache?: boolean
  useDistributed?: boolean
}

export interface RAGResult {
  content: string
  metadata: ContextMetadata
  score: number
  source: string
  timestamp: Date
}

export interface ContextMetadata {
  type: string
  size: number
  importance: number
  dependencies: string[]
  tags: string[]
  accessCount: number
  lastAccessTime: Date
}

export interface RAGSystemStats {
  totalQueries: number
  cacheHitRate: number
  averageResponseTime: number
  distributedNodes: number
  contextCount: number
  lastUpdated: Date
}

export class EnterpriseRAGSystem {
  private stats: RAGSystemStats
  private queryHistory: RAGQuery[] = []
  private resultCache = new Map<string, RAGResult[]>()

  constructor() {
    this.stats = {
      totalQueries: 0,
      cacheHitRate: 0,
      averageResponseTime: 0,
      distributedNodes: 4,
      contextCount: 0,
      lastUpdated: new Date(),
    }
  }

  async processQuery(query: RAGQuery): Promise<RAGResult[]> {
    const startTime = Date.now()
    console.log(chalk.blue(`🔍 Processing RAG query: "${query.text}"`))

    try {
      // Check cache first if enabled
      if (query.options?.useCache !== false) {
        const cachedResults = await this.getCachedResults(query)
        if (cachedResults.length > 0) {
          console.log(chalk.green(`✓ Found ${cachedResults.length} cached results`))
          this.updateStats(true, Date.now() - startTime)
          return cachedResults
        }
      }

      // Extract context using multi-layer extractor
      const extractedContexts = await this.extractRelevantContext(query)

      // Process contexts through distributed system if enabled
      let processedContexts = extractedContexts
      if (query.options?.useDistributed !== false) {
        processedContexts = await this.processThroughDistributedSystem(extractedContexts)
      }

      // Generate RAG results
      const results = await this.generateRAGResults(query, processedContexts)

      // Cache results if enabled
      if (query.options?.useCache !== false) {
        await this.cacheResults(query, results)
      }

      // Update statistics
      this.updateStats(false, Date.now() - startTime)
      this.queryHistory.push(query)

      console.log(chalk.green(`✓ Generated ${results.length} RAG results`))
      return results

    } catch (error) {
      console.error(chalk.red(`❌ RAG query failed:`, error))
      throw error
    }
  }

  async extractRelevantContext(query: RAGQuery): Promise<ExtractedContext[]> {
    console.log(chalk.blue(`🔍 Extracting relevant context for query`))

    // Create extraction targets based on query context
    const targets = await this.createExtractionTargets(query)

    const allContexts: ExtractedContext[] = []

    // Extract context for each target
    for (const target of targets) {
      try {
        const contexts = await multiLayerContextExtractor.extractContext(target)
        allContexts.push(...contexts)
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to extract context for ${target.path}:`, error))
      }
    }

    // Filter and rank contexts by relevance
    const relevantContexts = await this.rankContextsByRelevance(query.text, allContexts)

    console.log(chalk.green(`✓ Extracted ${relevantContexts.length} relevant contexts`))
    return relevantContexts
  }

  async processThroughDistributedSystem(contexts: ExtractedContext[]): Promise<ExtractedContext[]> {
    console.log(chalk.blue(`🌐 Processing through distributed system`))

    const processedContexts: ExtractedContext[] = []

    for (const context of contexts) {
      try {
        // Convert to distributed context format
        const distributedContext: DistributedContext = {
          id: context.id,
          content: context.content,
          metadata: {
            type: context.metadata.type,
            size: context.metadata.size,
            importance: context.metadata.importance,
            dependencies: context.metadata.dependencies,
            tags: [],
            accessCount: 0,
            lastAccessTime: new Date(),
          },
          shardId: '',
          version: 1,
          timestamp: context.timestamp,
          checksum: this.calculateChecksum(context.content),
        }

        // Store in distributed system
        await distributedContextManager.storeContext(distributedContext)

        // Retrieve to ensure consistency
        const retrievedContext = await distributedContextManager.retrieveContext(context.id)

        // Convert back to extracted context format
        const processedContext: ExtractedContext = {
          id: retrievedContext.id,
          layer: context.layer,
          content: retrievedContext.content,
          metadata: {
            type: retrievedContext.metadata.type,
            size: retrievedContext.metadata.size,
            complexity: context.metadata.complexity,
            dependencies: retrievedContext.metadata.dependencies,
            relevance: context.metadata.relevance,
            freshness: context.metadata.freshness,
          },
          embedding: context.embedding,
          timestamp: retrievedContext.timestamp,
          confidence: context.confidence,
        }

        processedContexts.push(processedContext)

      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to process context ${context.id} through distributed system:`, error))
        // Fallback to original context
        processedContexts.push(context)
      }
    }

    console.log(chalk.green(`✓ Processed ${processedContexts.length} contexts through distributed system`))
    return processedContexts
  }

  async generateRAGResults(query: RAGQuery, contexts: ExtractedContext[]): Promise<RAGResult[]> {
    console.log(chalk.blue(`🎯 Generating RAG results`))

    const results: RAGResult[] = []
    const maxResults = query.options?.maxResults || 10
    const threshold = query.options?.threshold || 0.3

    // Rank contexts by relevance to query
    const rankedContexts = await this.rankContextsByRelevance(query.text, contexts)

    // Generate results from top contexts
    for (let i = 0; i < Math.min(rankedContexts.length, maxResults); i++) {
      const context = rankedContexts[i]
      
      if (context.confidence >= threshold) {
        const result: RAGResult = {
          content: context.content,
          metadata: {
            type: context.metadata.type,
            size: context.metadata.size,
            importance: context.metadata.importance,
            dependencies: context.metadata.dependencies,
            tags: [],
            accessCount: 0,
            lastAccessTime: new Date(),
          },
          score: context.confidence,
          source: context.layer,
          timestamp: context.timestamp,
        }

        results.push(result)
      }
    }

    console.log(chalk.green(`✓ Generated ${results.length} RAG results`))
    return results
  }

  async optimizeSystem(): Promise<void> {
    console.log(chalk.blue(`🔧 Optimizing RAG system`))

    try {
      // Optimize context cache
      await intelligentContextCache.optimizeCache('context-cache')

      // Rebalance distributed system
      await distributedContextManager.rebalanceShards()

      // Update system statistics
      await this.updateSystemStatistics()

      console.log(chalk.green(`✓ System optimization completed`))
    } catch (error) {
      console.error(chalk.red(`❌ System optimization failed:`, error))
      throw error
    }
  }

  async getSystemHealth(): Promise<SystemHealthReport> {
    console.log(chalk.blue(`🏥 Checking system health`))

    const healthReport: SystemHealthReport = {
      overall: 'healthy',
      components: {},
      metrics: this.stats,
      lastCheck: new Date(),
    }

    try {
      // Check context extractor health
      healthReport.components.contextExtractor = {
        status: 'healthy',
        message: 'Context extractor operational',
      }

      // Check cache health
      const cacheStats = intelligentContextCache.getCacheStats('context-cache')
      healthReport.components.cache = {
        status: cacheStats.hitRate > 0.7 ? 'healthy' : 'degraded',
        message: `Cache hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`,
      }

      // Check distributed system health
      const shardHealth = await distributedContextManager.getShardHealth()
      healthReport.components.distributedSystem = {
        status: shardHealth.overallHealth === 'healthy' ? 'healthy' : 'degraded',
        message: `${shardHealth.healthyShards}/${shardHealth.totalShards} shards healthy`,
      }

      // Determine overall health
      const componentStatuses = Object.values(healthReport.components).map(c => c.status)
      if (componentStatuses.every(s => s === 'healthy')) {
        healthReport.overall = 'healthy'
      } else if (componentStatuses.some(s => s === 'unhealthy')) {
        healthReport.overall = 'unhealthy'
      } else {
        healthReport.overall = 'degraded'
      }

      console.log(chalk.green(`✓ System health check completed: ${healthReport.overall}`))
      return healthReport

    } catch (error) {
      console.error(chalk.red(`❌ Health check failed:`, error))
      healthReport.overall = 'unhealthy'
      healthReport.components.error = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
      }
      return healthReport
    }
  }

  getSystemStats(): RAGSystemStats {
    return { ...this.stats }
  }

  private async createExtractionTargets(query: RAGQuery): Promise<ExtractionTarget[]> {
    const targets: ExtractionTarget[] = []

    // Add workspace root if available
    if (query.context?.workspacePath) {
      targets.push({
        path: query.context.workspacePath,
        type: 'workspace',
      })
    }

    // Add common project files
    const commonFiles = [
      'package.json',
      'tsconfig.json',
      'README.md',
      'src',
    ]

    for (const file of commonFiles) {
      if (query.context?.workspacePath) {
        targets.push({
          path: `${query.context.workspacePath}/${file}`,
          type: 'file',
        })
      }
    }

    return targets
  }

  private async rankContextsByRelevance(queryText: string, contexts: ExtractedContext[]): Promise<ExtractedContext[]> {
    // Simple relevance ranking based on confidence and content similarity
    return contexts
      .map(context => ({
        context,
        relevance: this.calculateRelevance(queryText, context),
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .map(item => item.context)
  }

  private calculateRelevance(queryText: string, context: ExtractedContext): number {
    const queryWords = queryText.toLowerCase().split(/\s+/)
    const contentWords = context.content.toLowerCase().split(/\s+/)
    
    let relevance = context.confidence

    // Boost relevance for exact word matches
    for (const queryWord of queryWords) {
      if (contentWords.includes(queryWord)) {
        relevance += 0.1
      }
    }

    // Boost relevance for partial matches
    for (const queryWord of queryWords) {
      for (const contentWord of contentWords) {
        if (contentWord.includes(queryWord) || queryWord.includes(contentWord)) {
          relevance += 0.05
        }
      }
    }

    return Math.min(relevance, 1.0)
  }

  private async getCachedResults(query: RAGQuery): Promise<RAGResult[]> {
    const cacheKey = this.generateCacheKey(query)
    return await intelligentContextCache.get<RAGResult[]>('context-cache', cacheKey) || []
  }

  private async cacheResults(query: RAGQuery, results: RAGResult[]): Promise<void> {
    const cacheKey = this.generateCacheKey(query)
    const options: CacheOptions = {
      ttl: 300000, // 5 minutes
      importance: 0.8,
      tags: ['rag-results'],
    }

    await intelligentContextCache.set('context-cache', cacheKey, results, options)
  }

  private generateCacheKey(query: RAGQuery): string {
    const key = `${query.text}-${query.context?.agentId || 'default'}-${query.context?.sessionId || 'default'}`
    return Buffer.from(key).toString('base64').substring(0, 32)
  }

  private calculateChecksum(content: string): string {
    const crypto = require('crypto')
    return crypto.createHash('md5').update(content).digest('hex')
  }

  private updateStats(cacheHit: boolean, responseTime: number): void {
    this.stats.totalQueries++
    
    if (cacheHit) {
      this.stats.cacheHitRate = (this.stats.cacheHitRate * (this.stats.totalQueries - 1) + 1) / this.stats.totalQueries
    } else {
      this.stats.cacheHitRate = (this.stats.cacheHitRate * (this.stats.totalQueries - 1)) / this.stats.totalQueries
    }

    this.stats.averageResponseTime = (this.stats.averageResponseTime * (this.stats.totalQueries - 1) + responseTime) / this.stats.totalQueries
    this.stats.lastUpdated = new Date()
  }

  private async updateSystemStatistics(): Promise<void> {
    // Update context count
    this.stats.contextCount = this.queryHistory.length
  }
}

// Supporting Interfaces
interface SystemHealthReport {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  components: Record<string, ComponentHealth>
  metrics: RAGSystemStats
  lastCheck: Date
}

interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  message: string
}

export const enterpriseRAGSystem = new EnterpriseRAGSystem()
