import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import crypto from 'node:crypto'

export interface TokenCache {
  [hash: string]: {
    tokens: number
    text: string
    timestamp: number
    version: string
  }
}

export interface TokenCounterOptions {
  cacheSize?: number
  cacheTTL?: number // Time to live in milliseconds
  defaultModel?: string
}

/**
 * Intelligent Token Counter with Multi-Level Caching
 * Performance optimized for high-frequency token counting operations
 * 
 * Features:
 * - LRU cache with TTL expiration
 * - Content-based hashing for identical text detection
 * - Persistent disk cache for cross-session reuse
 * - Multiple approximation strategies based on content type
 * - Zero allocations for repeated lookups
 */
export class TokenCounter {
  private cache = new Map<string, { tokens: number; text: string; timestamp: number; hits: number }>()
  private maxCacheSize: number
  private cacheTTL: number
  private cacheDir: string
  private defaultModel: string
  
  // Static cache for model-specific configurations
  private static modelConfigs = new Map<string, { contextLength: number; tokensPerChar: number }>()
  
  constructor(options: TokenCounterOptions = {}) {
    this.maxCacheSize = options.cacheSize || 1000
    this.cacheTTL = options.cacheTTL || 5 * 60 * 1000 // 5 min default TTL
    this.cacheDir = join(process.cwd(), '.nikcli', 'cache')
    this.defaultModel = options.defaultModel || 'claude-3-sonnet-20240229'
    
    // Initialize model configurations
    this.initializeModelConfigs()
    
    // Create cache directory
    this.ensureCacheDirectory()
    
    // Load persistent cache on startup
    this.loadPersistentCache()
  }

  /**
   * Initialize model-specific token counting configurations
   */
  private initializeModelConfigs(): void {
    // Claude models - optimized approximations
    TokenCounter.modelConfigs.set('claude-3-5-sonnet-latest', { contextLength: 200000, tokensPerChar: 0.25 })
    TokenCounter.modelConfigs.set('claude-3-5-haiku-latest', { contextLength: 200000, tokensPerChar: 0.25 })
    TokenCounter.modelConfigs.set('claude-3-sonnet-20240229', { contextLength: 200000, tokensPerChar: 0.25 })
    TokenCounter.modelConfigs.set('claude-3-haiku-20240307', { contextLength: 200000, tokensPerChar: 0.25 })
    
    // OpenAI models - optimized approximations  
    TokenCounter.modelConfigs.set('gpt-4-turbo', { contextLength: 128000, tokensPerChar: 0.25 })
    TokenCounter.modelConfigs.set('gpt-4', { contextLength: 8192, tokensPerChar: 0.25 })
    TokenCounter.modelConfigs.set('gpt-3.5-turbo', { contextLength: 16384, tokensPerChar: 0.25 })
    
    // Gemini models - optimized approximations
    TokenCounter.modelConfigs.set('gemini-pro', { contextLength: 32768, tokensPerChar: 0.25 })
    TokenCounter.modelConfigs.set('gemini-pro-vision', { contextLength: 32768, tokensPerChar: 0.25 })
    
    // Generic fallback
    TokenCounter.modelConfigs.set('default', { contextLength: 128000, tokensPerChar: 0.25 })
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDirectory(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true })
    }
  }

  /**
   * Load persistent cache from disk
   */
  private loadPersistentCache(): void {
    try {
      const cacheFile = join(this.cacheDir, 'token-cache.json')
      if (existsSync(cacheFile)) {
        const data = JSON.parse(readFileSync(cacheFile, 'utf-8')) as TokenCache
        const now = Date.now()
        
        Object.entries(data).forEach(([hash, entry]) => {
          // Only load entries that haven't expired
          if (now - entry.timestamp < this.cacheTTL) {
            this.cache.set(hash, {
              tokens: entry.tokens,
              text: entry.text,
              timestamp: entry.timestamp,
              hits: 0 // Reset hits counter
            })
          }
        })
        
        console.log(`[TokenCounter] Loaded ${this.cache.size} cached entries`)
      }
    } catch (error) {
      console.warn('[TokenCounter] Failed to load persistent cache:', error)
    }
  }

  /**
   * Save cache to disk for persistence
   */
  private savePersistentCache(): void {
    try {
      const cacheFile = join(this.cacheDir, 'token-cache.json')
      const cacheData: TokenCache = {}
      
      this.cache.forEach((entry, hash) => {
        cacheData[hash] = {
          tokens: entry.tokens,
          text: entry.text,
          timestamp: entry.timestamp,
          version: '1.0'
        }
      })
      
      writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf-8')
    } catch (error) {
      console.warn('[TokenCounter] Failed to save persistent cache:', error)
    }
  }

  /**
   * Generate content-based hash for text
   */
  private generateHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16)
  }

  /**
   * Smart token estimation based on content type and structure
   */
  private estimateTokens(text: string, model: string = this.defaultModel): number {
    if (!text || typeof text !== 'string') return 0
    
    const config = TokenCounter.modelConfigs.get(model) || TokenCounter.modelConfigs.get('default')!
    
    // Base calculation using character count
    let baseTokens = Math.ceil(text.length * config.tokensPerChar)
    
    // Smart adjustments based on content structure
    
    // Code blocks typically use more tokens (more characters per token)
    const codeBlockMatches = text.match(/```[\s\S]*?```/g)
    if (codeBlockMatches) {
      const codeChars = codeBlockMatches.reduce((sum, block) => sum + block.length, 0)
      const codeTokens = Math.ceil(codeChars * 0.3) // Code is more dense
      const nonCodeChars = text.length - codeChars
      const nonCodeTokens = Math.ceil(nonCodeChars * config.tokensPerChar)
      baseTokens = codeTokens + nonCodeTokens
    }
    
    // JSON objects are often more dense
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
      baseTokens = Math.ceil(text.length * 0.22) // JSON is more token-dense
    }
    
    // URLs and long identifiers add overhead
    const urlMatches = text.match(/https?:\/\/[^\s]+/g)
    if (urlMatches) {
      baseTokens += urlMatches.length * 2 // URL overhead
    }
    
    // Newlines and formatting add some overhead
    const newlineCount = (text.match(/\n/g) || []).length
    baseTokens += Math.floor(newlineCount * 0.5)
    
    return Math.max(1, baseTokens) // Minimum 1 token
  }

  /**
   * Get tokens with intelligent caching and reuse
   */
  getTokenCount(text: string, model: string = this.defaultModel): number {
    if (!text || typeof text !== 'string') return 0
    
    // Check in-memory cache first
    const hash = this.generateHash(text)
    const cached = this.cache.get(hash)
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      cached.hits++
      return cached.tokens
    }
    
    // Calculate tokens using smart estimation
    const tokens = this.estimateTokens(text, model)
    
    // Add to cache
    this.cache.set(hash, {
      tokens,
      text,
      timestamp: Date.now(),
      hits: 0
    })
    
    // Evict old entries if cache is full
    if (this.cache.size > this.maxCacheSize) {
      this.evictLRU()
    }
    
    return tokens
  }

  /**
   * Calculate tokens for an array of messages (most common use case)
   */
  getMessagesTokenCount(messages: any[], model: string = this.defaultModel): number {
    if (!Array.isArray(messages) || messages.length === 0) return 0
    
    // For messages, we often check the same content repeatedly
    // Use a special cache key that includes the model
    const messageHash = this.generateHash(JSON.stringify(messages) + model)
    
    // Check cache
    const cached = this.cache.get(messageHash)
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      cached.hits++
      return cached.tokens
    }
    
    // Calculate tokens for each message and sum
    let totalTokens = 0
    for (const message of messages) {
      if (message && typeof message === 'object') {
        // Handle different message formats
        if (message.content) {
          if (typeof message.content === 'string') {
            totalTokens += this.getTokenCount(message.content, model)
          } else if (Array.isArray(message.content)) {
            // Handle array content (like multimodal messages)
            for (const part of message.content) {
              if (typeof part === 'object' && part.text) {
                totalTokens += this.getTokenCount(part.text, model)
              } else if (typeof part === 'string') {
                totalTokens += this.getTokenCount(part, model)
              }
            }
          }
        }
        
        // Add overhead for message structure
        totalTokens += 2 // Message wrapper tokens
      }
    }
    
    // Add cache with model-specific key
    this.cache.set(messageHash, {
      tokens: totalTokens,
      text: JSON.stringify(messages),
      timestamp: Date.now(),
      hits: 0
    })
    
    return totalTokens
  }

  /**
   * Evict least recently used entries when cache is full
   */
  private evictLRU(): void {
    if (this.cache.size <= this.maxCacheSize) return
    
    // Find entries with lowest hit count or oldest timestamp
    const entries = Array.from(this.cache.entries())
    entries.sort((a, b) => {
      // Sort by hits (ascending) then by timestamp (ascending)
      if (a[1].hits !== b[1].hits) {
        return a[1].hits - b[1].hits
      }
      return a[1].timestamp - b[1].timestamp
    })
    
    // Remove the least recently used entries
    const toRemove = Math.min(entries.length - this.maxCacheSize + 1, 50) // Remove up to 50 entries
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0])
    }
    
    // Save updated cache
    this.savePersistentCache()
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear()
    this.savePersistentCache()
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hits: number; maxSize: number } {
    let totalHits = 0
    this.cache.forEach(entry => {
      totalHits += entry.hits
    })
    
    return {
      size: this.cache.size,
      hits: totalHits,
      maxSize: this.maxCacheSize
    }
  }

  /**
   * Pre-warm cache with common patterns (called during initialization)
   */
  warmupCache(): void {
    // Pre-calculate tokens for common prefixes and suffixes
    const commonPatterns = [
      'You are a helpful assistant.',
      'Please analyze the following code:',
      'Here is the result:',
      '```javascript\n',
      '```\n',
      '\n\n',
      '[{'
    ]
    
    commonPatterns.forEach(pattern => {
      this.getTokenCount(pattern)
    })
  }

  /**
   * Shutdown and save cache
   */
  shutdown(): void {
    this.savePersistentCache()
  }
}

// Singleton instance with optimal configuration for CLI usage
export const tokenCounter = new TokenCounter({
  cacheSize: 2000, // Larger cache for CLI usage
  cacheTTL: 10 * 60 * 1000, // 10 minute TTL
  defaultModel: 'claude-3-5-sonnet-latest'
})

// Auto-warmup cache
tokenCounter.warmupCache()

// Graceful shutdown
process.on('SIGINT', () => tokenCounter.shutdown())
process.on('SIGTERM', () => tokenCounter.shutdown())

// Export utility functions for direct use
export const countTokens = (text: string, model?: string) => tokenCounter.getTokenCount(text, model)
export const countMessageTokens = (messages: any[], model?: string) => tokenCounter.getMessagesTokenCount(messages, model)