import crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import chalk from 'chalk'
import { LRUCache } from 'lru-cache'
import { Mutex } from 'async-mutex'
import { QuietCacheLogger } from './performance-optimizer'
import { tokenTelemetry } from './token-telemetry'

export interface CacheEntry {
  key: string
  promptHash: string
  // Do NOT store full prompt/response content. Only identifiers and tiny previews.
  signatureWords: string[] // top significant words used for similarity
  promptPreview?: string // short preview (non-sensitive)
  responseHash?: string // sha256 of full response
  responsePreview?: string // short preview for logs only
  timestamp: Date
  tokensSaved: number
  hitCount: number
  tags: string[]
  similarity?: number
  // Back-compat (loaded from older caches)
  userInput?: string
  response?: string
}

export interface CacheStats {
  totalEntries: number
  totalHits: number
  totalTokensSaved: number
  hitRatio: number
  cacheSize: number
}

/**
 * Intelligent Token Cache System
 * Reduces AI API calls by caching similar prompts and responses
 */
export class TokenCacheManager {
  private cache: LRUCache<string, CacheEntry>
  private cacheFile: string
  private maxCacheSize: number = 1000
  private similarityThreshold: number = 0.92
  private maxCacheAge: number = 3 * 24 * 60 * 60 * 1000 // 3 days

  // Mutex per proteggere operazioni concorrenti
  private cacheMutex = new Mutex()
  private wordIndexMutex = new Mutex()

  // Semantic indexing: maps words -> list of cache entry keys that contain those words
  // Allows O(1) candidate retrieval instead of O(n) full scan
  private wordIndex: Map<string, Set<string>> = new Map()

  constructor(cacheDir: string = './.nikcli') {
    this.cacheFile = path.join(cacheDir, 'token-cache.json')
    // Initialize LRU with TTL; items auto-evict when over max
    this.cache = new LRUCache<string, CacheEntry>({
      // Limit by number of entries; simpler and compatible with v11
      max: this.maxCacheSize,
      ttl: this.maxCacheAge,
    })
    // Non-blocking load, init completata async
    this.initialize().catch(error => {
      console.error(chalk.red('Failed to initialize token cache:'), error)
    })
  }

  private async initialize(): Promise<void> {
    await this.loadCache()
  }

  /**
   * Build semantic index from signature words (called on load/add)
   * Maps words -> cache entry keys for fast candidate retrieval
   */
  private async updateWordIndex(key: string, entry: CacheEntry): Promise<void> {
    await this.wordIndexMutex.runExclusive(() => {
      for (const word of entry.signatureWords) {
        if (!this.wordIndex.has(word)) {
          this.wordIndex.set(word, new Set())
        }
        this.wordIndex.get(word)!.add(key)
      }
    })
  }

  /**
   * Remove entry from word index (called on eviction)
   */
  private async removeFromWordIndex(key: string, entry: CacheEntry): Promise<void> {
    await this.wordIndexMutex.runExclusive(() => {
      for (const word of entry.signatureWords) {
        const set = this.wordIndex.get(word)
        if (set) {
          set.delete(key)
          if (set.size === 0) {
            this.wordIndex.delete(word)
          }
        }
      }
    })
  }

  /**
   * Get candidate entries using word intersection (O(1) lookup + O(m) intersection where m << n)
   */
  private getCandidateEntries(prompt: string): CacheEntry[] {
    const words = this.extractSignatureWords(prompt)
    if (words.length === 0) {
      return []
    }

    // Find intersection of all entry keys that contain any of the words
    const candidateSets = words
      .map((word) => this.wordIndex.get(word))
      .filter((set) => set !== undefined) as Set<string>[]

    if (candidateSets.length === 0) {
      return []
    }

    // Intersection: entries that appear in at least one word set
    // For efficiency, use the smallest set and check others
    const candidates = new Set<string>()
    const smallestSet = candidateSets.reduce((a, b) => (a.size <= b.size ? a : b))

    for (const key of smallestSet) {
      const entry = this.cache.get(key)
      if (entry) {
        candidates.add(key)
      }
    }

    return Array.from(candidates)
      .map((key) => this.cache.get(key))
      .filter((entry) => entry !== undefined) as CacheEntry[]
  }

  /**
   * Generate a semantic hash for prompt similarity detection
   */
  private generateSemanticKey(prompt: string, context: string = ''): string {
    // Normalize text for better matching
    const normalized = this.normalizeText(prompt + context)

    // Create semantic fingerprint
    const words = normalized.split(/\s+/).filter((w) => w.length > 2)
    const sortedWords = words.sort().slice(0, 20) // Top 20 significant words

    return crypto.createHash('md5').update(sortedWords.join('|')).digest('hex').substring(0, 16)
  }

  /**
   * Extract signature words used for similarity without storing full text
   */
  private extractSignatureWords(text: string): string[] {
    const normalized = this.normalizeText(text)
    const all = normalized.split(/\s+/).filter((w) => w.length > 2)
    // Frequency map
    const freq = new Map<string, number>()
    for (const w of all) freq.set(w, (freq.get(w) || 0) + 1)
    // Sort by frequency then alphabetically
    const sorted = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 20)
      .map(([w]) => w)
    return sorted
  }

  /**
   * Generate exact hash for precise matching
   */
  private generateExactKey(prompt: string, context: string = ''): string {
    // Normalize to reduce spurious misses from whitespace/case/punctuation
    const normalized = this.normalizeText(prompt + context)
    return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 32)
  }

  /**
   * Normalize text for consistent comparison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Calculate text similarity using Jaccard similarity
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(this.normalizeText(text1).split(/\s+/))
    const words2 = new Set(this.normalizeText(text2).split(/\s+/))

    const intersection = new Set([...words1].filter((w) => words2.has(w)))
    const union = new Set([...words1, ...words2])

    return intersection.size / union.size
  }

  /**
   * Similarity using current prompt vs stored signature word set
   */
  private calculateSignatureSimilarity(text: string, signatureWords: string[]): number {
    const set1 = new Set(
      this.normalizeText(text)
        .split(/\s+/)
        .filter((w) => w.length > 2)
    )
    const set2 = new Set(signatureWords)
    const intersection = new Set([...set1].filter((w) => set2.has(w)))
    const union = new Set([...set1, ...set2])
    return union.size === 0 ? 0 : intersection.size / union.size
  }

  /**
   * Find cached response for similar prompts
   * Uses semantic indexing for O(1) candidate retrieval instead of O(n) full scan
   */
  async getCachedResponse(prompt: string, context: string = '', tags: string[] = []): Promise<CacheEntry | null> {
    // First try exact match (fastest path)
    const exactKey = this.generateExactKey(prompt, context)
    if (this.cache.has(exactKey)) {
      const entry = this.cache.get(exactKey)!
      entry.hitCount++
      entry.similarity = 1.0
      QuietCacheLogger.logCacheSave(entry.tokensSaved)
      // Telemetry: exact hit
      tokenTelemetry.recordCache({ action: 'hit', similarity: 1.0, tokensSaved: entry.tokensSaved })
      return entry
    }

    // Then try semantic similarity using indexed candidates (O(1) retrieval + O(m) comparison where m << n)
    const candidates = this.getCandidateEntries(prompt + context)

    // Filter and score candidates
    const similarEntries = candidates
      .filter((entry) => {
        // Check if entry is not expired
        const age = Date.now() - new Date(entry.timestamp).getTime()
        if (age > this.maxCacheAge) return false

        // Check tag overlap if tags provided
        if (tags.length > 0 && entry.tags.length > 0) {
          const tagOverlap =
            tags.filter((t) => entry.tags.includes(t)).length / Math.max(tags.length, entry.tags.length)
          if (tagOverlap < 0.3) return false
        }

        return true
      })
      .map((entry) => ({
        ...entry,
        similarity:
          entry.signatureWords && entry.signatureWords.length > 0
            ? this.calculateSignatureSimilarity(prompt, entry.signatureWords)
            : entry.userInput
              ? this.calculateSimilarity(prompt, entry.userInput)
              : 0,
      }))
      .filter((entry) => entry.similarity >= this.similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity)

    if (similarEntries.length > 0) {
      const bestMatch = similarEntries[0]
      bestMatch.hitCount++
      QuietCacheLogger.logCacheSave(bestMatch.tokensSaved)
      // Telemetry: semantic hit
      tokenTelemetry.recordCache({
        action: 'hit',
        similarity: bestMatch.similarity,
        tokensSaved: bestMatch.tokensSaved,
      })
      return bestMatch
    }

    // Telemetry: miss
    tokenTelemetry.recordCache({ action: 'miss' })
    return null
  }

  /**
   * Store response in cache
   */
  async setCachedResponse(
    prompt: string,
    response: string,
    context: string = '',
    tokensSaved: number = 0,
    tags: string[] = []
  ): Promise<void> {
    const exactKey = this.generateExactKey(prompt, context)

    const entry: CacheEntry = {
      key: exactKey,
      promptHash: this.generateSemanticKey(prompt, context),
      signatureWords: this.extractSignatureWords(`${prompt} ${context}`),
      promptPreview: prompt.substring(0, 120),
      responseHash: crypto.createHash('sha256').update(response).digest('hex').substring(0, 32),
      responsePreview: response.substring(0, 120),
      timestamp: new Date(),
      tokensSaved: Math.max(tokensSaved, this.estimateTokens(prompt + response)),
      hitCount: 0,
      tags,
      similarity: 1.0,
    }

    this.cache.set(exactKey, entry, { ttl: this.maxCacheAge })

    // Update semantic word index for fast lookup
    await this.updateWordIndex(exactKey, entry)

    // Cleanup old entries if cache is too large
    await this.cleanupExpired()
    await this.cleanupCache()

    // Save to disk periodically
    if (this.cache.size % 10 === 0) {
      await this.saveCache()
    }

    QuietCacheLogger.logCacheSave(entry.tokensSaved)
    // Telemetry: store
    tokenTelemetry.recordCache({ action: 'store', tokensSaved: entry.tokensSaved })
  }

  /**
   * Estimate token count from text
   */
  private estimateTokens(text: string): number {
    return Math.round(text.length / 4)
  }

  /**
   * Clean up old and least used cache entries
   */
  private async cleanupCache(): Promise<void> {
    // No-op: LRU max handles eviction automatically
  }

  /**
   * Load cache from disk and rebuild semantic index
   */
  private async loadCache(): Promise<void> {
    await this.cacheMutex.runExclusive(async () => {
      try {
        // Ensure cache directory exists
        await fs.mkdir(path.dirname(this.cacheFile), { recursive: true })

        const data = await fs.readFile(this.cacheFile, 'utf8')
        const parsed = JSON.parse(data)

        // Reinsert into LRU with adjusted TTL based on age
        for (const entry of parsed) {
          entry.timestamp = new Date(entry.timestamp)
          const age = Date.now() - new Date(entry.timestamp).getTime()
          const remainingTtl = Math.max(0, this.maxCacheAge - age)
          this.cache.set(entry.key, entry, { ttl: remainingTtl || 1 })
          // Rebuild semantic index (await per il mutex)
          await this.updateWordIndex(entry.key, entry)
        }

        // Silent load
      } catch (_error) {
        // Cache file doesn't exist or is corrupted, start fresh
        // Silent start with empty cache
      }
    })
  }

  /**
   * Save cache to disk
   */
  async saveCache(): Promise<void> {
    await this.cacheMutex.runExclusive(async () => {
      try {
        const data = Array.from(this.cache.values())
        await fs.writeFile(this.cacheFile, JSON.stringify(data, null, 2))
        // Silent save
      } catch (error: any) {
        console.log(chalk.red(`✖ Failed to save cache: ${error.message}`))
      }
    })
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values())
    const totalHits = entries.reduce((sum, entry) => sum + entry.hitCount, 0)
    const totalTokensSaved = entries.reduce((sum, entry) => sum + entry.tokensSaved * entry.hitCount, 0)

    return {
      totalEntries: entries.length,
      totalHits,
      totalTokensSaved,
      hitRatio: entries.length > 0 ? totalHits / (totalHits + entries.length) : 0,
      cacheSize: JSON.stringify(entries).length,
    }
  }

  /**
   * Clear all cache entries and rebuild index
   */
  async clearCache(): Promise<void> {
    const oldSize = this.cache.size
    this.cache.clear()
    this.wordIndex.clear()

    try {
      await fs.unlink(this.cacheFile)
    } catch (_error) {
      // File might not exist
    }

    console.log(chalk.yellow(`🧹 Cleared ${oldSize} cache entries`))
  }

  /**
   * Remove expired entries and update semantic index
   */
  async cleanupExpired(): Promise<number> {
    const beforeSize = this.cache.size
    const now = Date.now()

    for (const [key, entry] of this.cache.entries()) {
      const age = now - new Date(entry.timestamp).getTime()
      if (age > this.maxCacheAge) {
        await this.removeFromWordIndex(key, entry)
        this.cache.delete(key)
      }
    }

    const removed = beforeSize - this.cache.size
    if (removed > 0) {
      await this.saveCache()
    }

    return removed
  }

  /**
   * Find similar cached entries for analysis
   */
  findSimilarEntries(prompt: string, limit: number = 5): CacheEntry[] {
    return Array.from(this.cache.values())
      .map((entry) => ({
        ...entry,
        similarity: entry.userInput ? this.calculateSimilarity(prompt, entry.userInput) : 0,
      }))
      .filter((entry) => entry.similarity > 0.5)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
  }

  /**
   * Update cache settings
   */
  updateSettings(maxSize?: number, similarityThreshold?: number, maxAge?: number): void {
    if (maxSize !== undefined) this.maxCacheSize = maxSize
    if (similarityThreshold !== undefined) this.similarityThreshold = similarityThreshold
    if (maxAge !== undefined) this.maxCacheAge = maxAge

    // Align LRU config to new limits (best-effort)
    try {
      ;(this.cache as any).max = this.maxCacheSize
    } catch {}

    console.log(chalk.blue('🔨 Cache settings updated'))
  }

  /**
   * Export cache for analysis
   */
  async exportCache(filePath: string): Promise<void> {
    const data = {
      metadata: {
        exportDate: new Date(),
        totalEntries: this.cache.size,
        settings: {
          maxCacheSize: this.maxCacheSize,
          similarityThreshold: this.similarityThreshold,
          maxCacheAge: this.maxCacheAge,
        },
      },
      entries: Array.from(this.cache.values()),
    }

    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    console.log(chalk.green(`📤 Cache exported to ${filePath}`))
  }
}

// Export singleton instance
export const tokenCache = new TokenCacheManager()
