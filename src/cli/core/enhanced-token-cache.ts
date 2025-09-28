import crypto from 'node:crypto'
import chalk from 'chalk'
import { type CacheService, cacheService } from '../services/cache-service'
import { QuietCacheLogger } from './performance-optimizer'
import { tokenTelemetry } from './token-telemetry'

export interface EnhancedCacheEntry {
  key: string
  promptHash: string
  signatureWords: string[] // top significant words for similarity
  promptPreview?: string
  responseHash?: string
  responsePreview?: string
  timestamp: Date
  tokensSaved: number
  hitCount: number
  tags: string[]
  similarity?: number
  strategy: 'redis' | 'smart' | 'memory'
  // Enhanced metadata
  model?: string
  temperature?: number
  contextLength?: number
  responseTime?: number
}

export interface EnhancedCacheStats {
  totalEntries: number
  totalHits: number
  totalTokensSaved: number
  hitRatio: number
  cacheSize: number
  redisStats: {
    enabled: boolean
    connected: boolean
    hits: number
    entries?: number
  }
  smartCacheStats: {
    enabled: boolean
    hits: number
    strategies: Record<string, any>
  }
}

/**
 * Enhanced Token Cache Manager with Redis integration
 */
export class EnhancedTokenCacheManager {
  private memoryCache: Map<string, EnhancedCacheEntry> = new Map()
  private cacheService: CacheService
  private maxMemoryCacheSize: number = 500
  private similarityThreshold: number = 0.92
  private maxCacheAge: number = 3 * 24 * 60 * 60 * 1000 // 3 days

  constructor(service: CacheService = cacheService) {
    this.cacheService = service
  }

  /**
   * Generate cache key from prompt content
   */
  private generateCacheKey(prompt: string, model?: string, temperature?: number): string {
    const normalizedPrompt = this.normalizePrompt(prompt)
    const context = `${model || 'default'}_${temperature || 0.7}`
    return crypto.createHash('sha256').update(`${context}:${normalizedPrompt}`).digest('hex').substring(0, 16)
  }

  /**
   * Normalize prompt for consistent caching
   */
  private normalizePrompt(prompt: string): string {
    return prompt
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim()
  }

  /**
   * Extract signature words from prompt
   */
  private extractSignatureWords(prompt: string): string[] {
    const words = prompt.toLowerCase().split(/\s+/)
    const commonWords = new Set([
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
    ])

    return words.filter((word) => word.length > 3 && !commonWords.has(word)).slice(0, 10) // Keep top 10 significant words
  }

  /**
   * Calculate similarity between two prompts
   */
  private calculateSimilarity(words1: string[], words2: string[]): number {
    const set1 = new Set(words1)
    const set2 = new Set(words2)
    const intersection = new Set([...set1].filter((x) => set2.has(x)))
    const union = new Set([...set1, ...set2])

    return intersection.size / union.size
  }

  /**
   * Check if response should be cached
   */
  async shouldCache(_prompt: string, response: string): Promise<boolean> {
    // Don't cache very short responses
    if (response.length < 50) return false

    // Don't cache error responses
    if (response.includes('Error:') || response.includes('error')) return false

    // Don't cache very generic responses
    const genericPhrases = ['I cannot', 'I am unable', 'Sorry, I cannot']
    if (genericPhrases.some((phrase) => response.includes(phrase))) return false

    return true
  }

  /**
   * Find similar cached entry
   */
  async findSimilarEntry(prompt: string, model?: string, temperature?: number): Promise<EnhancedCacheEntry | null> {
    const signatureWords = this.extractSignatureWords(prompt)
    const cacheKey = this.generateCacheKey(prompt, model, temperature)

    // First check direct key match in distributed cache
    try {
      const cachedEntry = await this.cacheService.get<EnhancedCacheEntry>(
        cacheKey,
        `token_cache:${model || 'default'}`,
        { strategy: 'both' }
      )

      if (cachedEntry) {
        cachedEntry.hitCount++
        cachedEntry.similarity = 1.0 // Exact match

        // Update hit count in cache
        await this.cacheService.set(cacheKey, cachedEntry, `token_cache:${model || 'default'}`, {
          ttl: this.maxCacheAge / 1000,
          metadata: { hitCount: cachedEntry.hitCount, lastAccessed: Date.now() },
        })

        return cachedEntry
      }
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Cache lookup failed: ${error.message}`))
    }

    // Check memory cache for similar entries
    for (const [key, entry] of this.memoryCache.entries()) {
      const similarity = this.calculateSimilarity(signatureWords, entry.signatureWords)

      if (similarity >= this.similarityThreshold) {
        entry.hitCount++
        entry.similarity = similarity

        // Promote to distributed cache
        try {
          await this.cacheService.set(key, entry, `token_cache:${model || 'default'}`, {
            ttl: this.maxCacheAge / 1000,
            metadata: { similarity, promoted: true },
          })
        } catch (_error) {
          // Silent failure for promotion
        }

        return entry
      }
    }

    return null
  }

  /**
   * Cache a prompt-response pair
   */
  async setCachedResponse(
    prompt: string,
    response: string,
    tokensSaved: number,
    options?: {
      model?: string
      temperature?: number
      contextLength?: number
      responseTime?: number
      tags?: string[]
    }
  ): Promise<void> {
    const { model, temperature, contextLength, responseTime, tags = [] } = options || {}

    if (!(await this.shouldCache(prompt, response))) {
      return
    }

    const cacheKey = this.generateCacheKey(prompt, model, temperature)
    const promptHash = crypto.createHash('sha256').update(prompt).digest('hex')
    const responseHash = crypto.createHash('sha256').update(response).digest('hex')
    const signatureWords = this.extractSignatureWords(prompt)

    const entry: EnhancedCacheEntry = {
      key: cacheKey,
      promptHash,
      signatureWords,
      promptPreview: prompt.substring(0, 100),
      responseHash,
      responsePreview: response.substring(0, 100),
      timestamp: new Date(),
      tokensSaved,
      hitCount: 1,
      tags: [...tags, model || 'default'],
      strategy: 'redis',
      model,
      temperature,
      contextLength,
      responseTime,
    }

    try {
      // Store in distributed cache (Redis + fallback)
      await this.cacheService.set(cacheKey, entry, `token_cache:${model || 'default'}`, {
        ttl: this.maxCacheAge / 1000,
        metadata: {
          tokensSaved,
          responseTime: responseTime || 0,
          model,
          contextLength,
        },
      })

      // Store full response separately with longer key for retrieval
      const responseKey = `response:${cacheKey}`
      await this.cacheService.set(responseKey, response, `token_cache:${model || 'default'}`, {
        ttl: this.maxCacheAge / 1000,
        metadata: { type: 'response', associatedEntry: cacheKey },
      })

      // Keep in memory cache for fast access
      entry.strategy = 'memory'
      this.memoryCache.set(cacheKey, entry)

      // Cleanup memory cache if too large
      if (this.memoryCache.size > this.maxMemoryCacheSize) {
        this.cleanupMemoryCache()
      }

      // Log success
      QuietCacheLogger.logCacheSave(tokensSaved)
      tokenTelemetry.recordCache({ action: 'store', tokensSaved })
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to cache response: ${error.message}`))
    }
  }

  /**
   * Get cached response for a prompt
   */
  async getCachedResponse(prompt: string, model?: string, temperature?: number): Promise<string | null> {
    try {
      const entry = await this.findSimilarEntry(prompt, model, temperature)

      if (!entry) {
        return null
      }

      // Get the full response
      const responseKey = `response:${entry.key}`
      const fullResponse = await this.cacheService.get<string>(responseKey, `token_cache:${model || 'default'}`)

      if (fullResponse) {
        // Log cache hit
        QuietCacheLogger.logCacheSave(entry.tokensSaved)
        tokenTelemetry.recordCache({ action: 'hit', tokensSaved: entry.tokensSaved })

        return fullResponse
      }

      // Fallback to preview if full response not available
      return entry.responsePreview || null
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Cache retrieval failed: ${error.message}`))
      return null
    }
  }

  /**
   * Cleanup old entries from memory cache
   */
  private cleanupMemoryCache(): void {
    const entries = Array.from(this.memoryCache.entries())

    // Sort by hit count and timestamp (least used first)
    entries.sort((a, b) => {
      if (a[1].hitCount !== b[1].hitCount) {
        return a[1].hitCount - b[1].hitCount
      }
      return a[1].timestamp.getTime() - b[1].timestamp.getTime()
    })

    // Remove 20% of least used entries
    const toRemove = Math.ceil(entries.length * 0.2)
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i][0])
    }
  }

  /**
   * Get comprehensive cache statistics
   */
  async getStats(): Promise<EnhancedCacheStats> {
    const cacheServiceStats = await this.cacheService.getStats()

    let totalTokensSaved = 0
    let totalHits = 0

    // Calculate memory cache stats
    for (const entry of this.memoryCache.values()) {
      totalTokensSaved += entry.tokensSaved * entry.hitCount
      totalHits += entry.hitCount
    }

    return {
      totalEntries: this.memoryCache.size + (cacheServiceStats.redis.entries || 0),
      totalHits,
      totalTokensSaved,
      hitRatio: cacheServiceStats.hitRate,
      cacheSize: this.memoryCache.size,
      redisStats: {
        enabled: cacheServiceStats.redis.enabled,
        connected: cacheServiceStats.redis.connected,
        hits: cacheServiceStats.totalHits,
        entries: cacheServiceStats.redis.entries,
      },
      smartCacheStats: {
        enabled: cacheServiceStats.fallback.enabled,
        hits: cacheServiceStats.totalHits - totalHits,
        strategies: cacheServiceStats.fallback.stats || {},
      },
    }
  }

  /**
   * Clear all caches
   */
  async clearCache(): Promise<void> {
    this.memoryCache.clear()
    await this.cacheService.clearAll()

    console.log(chalk.green('✓ Enhanced token cache cleared'))
  }

  /**
   * Force cache sync to ensure consistency
   */
  async syncCache(): Promise<void> {
    // Promote frequently used memory cache entries to distributed cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.hitCount > 2) {
        // Promote entries with multiple hits
        try {
          await this.cacheService.set(key, entry, `token_cache:${entry.model || 'default'}`, {
            ttl: this.maxCacheAge / 1000,
            metadata: { synced: true, hitCount: entry.hitCount },
          })
        } catch (_error) {
          // Silent failure for sync
        }
      }
    }

    console.log(chalk.blue('⚡︎ Token cache synchronized'))
  }

  /**
   * Get health status
   */
  getHealth(): { healthy: boolean; details: any } {
    const health = this.cacheService.getHealthStatus()

    return {
      healthy: health.overall,
      details: {
        memoryCache: { entries: this.memoryCache.size, healthy: true },
        distributedCache: health,
        lastSync: Date.now(),
      },
    }
  }
}

// Singleton instance
export const enhancedTokenCache = new EnhancedTokenCacheManager()
