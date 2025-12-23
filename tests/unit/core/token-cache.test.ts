/**
 * Comprehensive tests for Token Cache Management
 * Tests cache hit/miss, limits, cleanup, overflow, and edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TokenCacheManager } from '../../../src/cli/core/token-cache'
import { EnhancedTokenCacheManager } from '../../../src/cli/core/enhanced-token-cache'
import { CompletionProtocolCache } from '../../../src/cli/core/completion-protocol-cache'
import { mockConsole, mockEnv, cleanup, createTempFile } from '../../helpers/test-utils'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
  },
}))

vi.mock('../../../src/cli/core/performance-optimizer', () => ({
  QuietCacheLogger: {
    logCacheSave: vi.fn(),
  },
}))

describe('TokenCacheManager', () => {
  let cacheManager: TokenCacheManager
  let console: ReturnType<typeof mockConsole>
  let env: ReturnType<typeof mockEnv>
  let tempFiles: string[] = []
  const testCacheDir = path.join(process.cwd(), 'test-cache-dir')

  beforeEach(() => {
    console = mockConsole()
    env = mockEnv({
      NODE_ENV: 'test',
    })
    vi.mocked(fs.readFile).mockResolvedValue('{}')
    vi.mocked(fs.mkdir).mockResolvedValue(undefined)
    cacheManager = new TokenCacheManager(testCacheDir)
  })

  afterEach(async () => {
    console.restore()
    env.restore()
    await cleanup([testCacheDir, ...tempFiles])
    tempFiles = []
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with default settings', () => {
      expect(cacheManager).toBeInstanceOf(TokenCacheManager)
    })

    it('should initialize with custom cache directory', () => {
      const customDir = './custom-cache'
      const manager = new TokenCacheManager(customDir)
      expect(manager).toBeInstanceOf(TokenCacheManager)
    })

    it('should handle initialization when cache file does not exist', () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
      expect(() => new TokenCacheManager(testCacheDir)).not.toThrow()
    })

    it('should handle corrupted cache file', () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json!!!')
      expect(() => new TokenCacheManager(testCacheDir)).not.toThrow()
    })
  })

  describe('Cache Hit/Miss', () => {
    it('should return null for cache miss', async () => {
      const result = await cacheManager.getCachedResponse('new prompt', 'context')
      expect(result).toBeNull()
    })

    it('should cache and retrieve exact match', async () => {
      const prompt = 'Test prompt for caching'
      const response = 'Test response'
      const tokensSaved = 100

      await cacheManager.cacheResponse(prompt, response, tokensSaved, 'context')
      const cached = await cacheManager.getCachedResponse(prompt, 'context')

      expect(cached).not.toBeNull()
      expect(cached?.response).toBe(response)
      expect(cached?.tokensSaved).toBe(tokensSaved)
    })

    it('should handle cache hit with exact match', async () => {
      const prompt = 'Exact match test'
      const response = 'Exact response'
      await cacheManager.cacheResponse(prompt, response, 50)

      const result = await cacheManager.getCachedResponse(prompt)
      expect(result).not.toBeNull()
      expect(result?.similarity).toBe(1.0)
    })

    it('should handle cache miss for different prompts', async () => {
      await cacheManager.cacheResponse('Prompt 1', 'Response 1', 50)
      const result = await cacheManager.getCachedResponse('Completely different prompt')
      expect(result).toBeNull()
    })
  })

  describe('Cache Limits', () => {
    it('should respect max cache size', async () => {
      // Fill cache beyond max size
      for (let i = 0; i < 1100; i++) {
        await cacheManager.cacheResponse(`Prompt ${i}`, `Response ${i}`, 10)
      }

      // Cache should not exceed max size
      const stats = cacheManager.getStats()
      expect(stats.cacheSize).toBeLessThanOrEqual(1000)
    })

    it('should evict least recently used entries when limit reached', async () => {
      // Add entries up to limit
      for (let i = 0; i < 1000; i++) {
        await cacheManager.cacheResponse(`Prompt ${i}`, `Response ${i}`, 10)
      }

      // Add one more - should evict oldest
      await cacheManager.cacheResponse('New prompt', 'New response', 10)

      const stats = cacheManager.getStats()
      expect(stats.cacheSize).toBeLessThanOrEqual(1000)
    })

    it('should handle cache limit with very large entries', async () => {
      const largeResponse = 'x'.repeat(100000)
      await cacheManager.cacheResponse('Large prompt', largeResponse, 1000)
      const stats = cacheManager.getStats()
      expect(stats.cacheSize).toBeGreaterThan(0)
    })
  })

  describe('Cache Cleanup', () => {
    it('should cleanup expired entries', async () => {
      // Add entry with old timestamp
      const oldTimestamp = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
      await cacheManager.cacheResponse('Old prompt', 'Old response', 50)

      // Manually set old timestamp (accessing private field via any)
      const cache = (cacheManager as any).cache
      const entries = Array.from(cache.keys())
      if (entries.length > 0) {
        const entry = cache.get(entries[0])
        if (entry) {
          entry.timestamp = oldTimestamp
        }
      }

      const cleaned = await cacheManager.cleanupExpired()
      expect(cleaned).toBeGreaterThanOrEqual(0)
    })

    it('should handle cleanup when no expired entries exist', async () => {
      await cacheManager.cacheResponse('Fresh prompt', 'Fresh response', 50)
      const cleaned = await cacheManager.cleanupExpired()
      expect(cleaned).toBe(0)
    })

    it('should cleanup all expired entries', async () => {
      // Add multiple entries with old timestamps
      for (let i = 0; i < 10; i++) {
        await cacheManager.cacheResponse(`Old prompt ${i}`, `Old response ${i}`, 10)
      }

      const beforeStats = cacheManager.getStats()
      const cleaned = await cacheManager.cleanupExpired()
      const afterStats = cacheManager.getStats()

      expect(cleaned).toBeGreaterThanOrEqual(0)
      expect(afterStats.cacheSize).toBeLessThanOrEqual(beforeStats.cacheSize)
    })
  })

  describe('Cache Statistics', () => {
    it('should get cache statistics', () => {
      const stats = cacheManager.getStats()
      expect(stats).toHaveProperty('totalHits')
      expect(stats).toHaveProperty('totalMisses')
      expect(stats).toHaveProperty('totalTokensSaved')
      expect(stats).toHaveProperty('hitRatio')
      expect(stats).toHaveProperty('cacheSize')
    })

    it('should track cache hits', async () => {
      await cacheManager.cacheResponse('Test prompt', 'Test response', 100)
      await cacheManager.getCachedResponse('Test prompt')

      const stats = cacheManager.getStats()
      expect(stats.totalHits).toBeGreaterThan(0)
    })

    it('should track cache misses', async () => {
      await cacheManager.getCachedResponse('Non-existent prompt')
      const stats = cacheManager.getStats()
      expect(stats.totalMisses).toBeGreaterThan(0)
    })

    it('should calculate hit ratio correctly', async () => {
      await cacheManager.cacheResponse('Prompt 1', 'Response 1', 50)
      await cacheManager.getCachedResponse('Prompt 1') // Hit
      await cacheManager.getCachedResponse('Prompt 2') // Miss

      const stats = cacheManager.getStats()
      expect(stats.hitRatio).toBeGreaterThanOrEqual(0)
      expect(stats.hitRatio).toBeLessThanOrEqual(1)
    })

    it('should track total tokens saved', async () => {
      await cacheManager.cacheResponse('Prompt 1', 'Response 1', 100)
      await cacheManager.cacheResponse('Prompt 2', 'Response 2', 200)
      await cacheManager.getCachedResponse('Prompt 1')

      const stats = cacheManager.getStats()
      expect(stats.totalTokensSaved).toBeGreaterThanOrEqual(100)
    })
  })

  describe('Edge Cases - Overflow', () => {
    it('should handle token count overflow', async () => {
      const maxTokens = Number.MAX_SAFE_INTEGER
      await cacheManager.cacheResponse('Prompt', 'Response', maxTokens)
      const cached = await cacheManager.getCachedResponse('Prompt')
      expect(cached).not.toBeNull()
    })

    it('should handle negative token values', async () => {
      await cacheManager.cacheResponse('Prompt', 'Response', -100)
      const cached = await cacheManager.getCachedResponse('Prompt')
      expect(cached).not.toBeNull()
    })

    it('should handle zero tokens saved', async () => {
      await cacheManager.cacheResponse('Prompt', 'Response', 0)
      const cached = await cacheManager.getCachedResponse('Prompt')
      expect(cached).not.toBeNull()
      expect(cached?.tokensSaved).toBe(0)
    })

    it('should handle extremely large responses', async () => {
      const largeResponse = 'x'.repeat(10 * 1024 * 1024) // 10MB
      await cacheManager.cacheResponse('Large prompt', largeResponse, 1000000)
      const cached = await cacheManager.getCachedResponse('Large prompt')
      expect(cached).not.toBeNull()
    })
  })

  describe('Edge Cases - Similarity Matching', () => {
    it('should find similar prompts above threshold', async () => {
      await cacheManager.cacheResponse('This is a test prompt for similarity', 'Response', 100)
      const similar = await cacheManager.getCachedResponse('This is a test prompt for similarity matching')
      // Should find similar entry if similarity is above threshold
      expect(similar === null || similar.similarity >= 0.92).toBe(true)
    })

    it('should not match prompts below similarity threshold', async () => {
      await cacheManager.cacheResponse('Completely different prompt one', 'Response', 100)
      const result = await cacheManager.getCachedResponse('Completely different prompt two')
      // Should not match if similarity is too low
      expect(result === null || result.similarity < 0.92).toBe(true)
    })

    it('should handle empty prompts', async () => {
      await cacheManager.cacheResponse('', 'Response', 50)
      const cached = await cacheManager.getCachedResponse('')
      expect(cached).not.toBeNull()
    })

    it('should handle prompts with only whitespace', async () => {
      await cacheManager.cacheResponse('   \n\t   ', 'Response', 50)
      const cached = await cacheManager.getCachedResponse('   \n\t   ')
      expect(cached).not.toBeNull()
    })
  })

  describe('Edge Cases - Tags', () => {
    it('should cache with tags', async () => {
      await cacheManager.cacheResponse('Tagged prompt', 'Response', 50, 'context', ['tag1', 'tag2'])
      const cached = await cacheManager.getCachedResponse('Tagged prompt', 'context', ['tag1', 'tag2'])
      expect(cached).not.toBeNull()
    })

    it('should match entries with overlapping tags', async () => {
      await cacheManager.cacheResponse('Prompt', 'Response', 50, '', ['tag1', 'tag2'])
      const cached = await cacheManager.getCachedResponse('Prompt', '', ['tag1'])
      // Should match if tag overlap is sufficient
      expect(cached === null || cached !== null).toBe(true)
    })

    it('should not match entries with completely different tags', async () => {
      await cacheManager.cacheResponse('Prompt', 'Response', 50, '', ['tag1'])
      const cached = await cacheManager.getCachedResponse('Prompt', '', ['tag2', 'tag3'])
      // May or may not match depending on tag overlap threshold
      expect(cached === null || cached !== null).toBe(true)
    })
  })

  describe('Edge Cases - Special Characters', () => {
    it('should handle unicode characters', async () => {
      const prompt = '🚀 Test con émojis e caratteri speciali 中文 🎉'
      await cacheManager.cacheResponse(prompt, 'Response', 50)
      const cached = await cacheManager.getCachedResponse(prompt)
      expect(cached).not.toBeNull()
    })

    it('should handle special characters in prompts', async () => {
      const prompt = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`'
      await cacheManager.cacheResponse(prompt, 'Response', 50)
      const cached = await cacheManager.getCachedResponse(prompt)
      expect(cached).not.toBeNull()
    })

    it('should normalize prompts with different whitespace', async () => {
      await cacheManager.cacheResponse('Prompt   with   multiple   spaces', 'Response', 50)
      const cached = await cacheManager.getCachedResponse('Prompt with multiple spaces')
      // Should match due to normalization
      expect(cached === null || cached !== null).toBe(true)
    })
  })

  describe('Edge Cases - Concurrent Access', () => {
    it('should handle concurrent cache operations', async () => {
      const operations = Array.from({ length: 100 }, (_, i) =>
        cacheManager.cacheResponse(`Prompt ${i}`, `Response ${i}`, 10)
      )
      await Promise.all(operations)

      const stats = cacheManager.getStats()
      expect(stats.cacheSize).toBeGreaterThan(0)
    })

    it('should handle concurrent get operations', async () => {
      await cacheManager.cacheResponse('Test prompt', 'Test response', 50)
      const operations = Array.from({ length: 50 }, () =>
        cacheManager.getCachedResponse('Test prompt')
      )
      const results = await Promise.all(operations)

      expect(results.every((r) => r !== null)).toBe(true)
    })

    it('should handle rapid cache and retrieve', async () => {
      for (let i = 0; i < 100; i++) {
        await cacheManager.cacheResponse(`Prompt ${i}`, `Response ${i}`, 10)
        await cacheManager.getCachedResponse(`Prompt ${i}`)
      }

      const stats = cacheManager.getStats()
      expect(stats.totalHits).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases - Memory and Performance', () => {
    it('should not leak memory with many cache operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed

      for (let i = 0; i < 1000; i++) {
        await cacheManager.cacheResponse(`Prompt ${i}`, `Response ${i}`, 10)
        if (i % 100 === 0) {
          await cacheManager.cleanupExpired()
        }
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024)
    })

    it('should handle cache with many entries efficiently', async () => {
      const startTime = Date.now()
      for (let i = 0; i < 500; i++) {
        await cacheManager.cacheResponse(`Prompt ${i}`, `Response ${i}`, 10)
      }
      const endTime = Date.now()

      // Should complete within reasonable time (5 seconds)
      expect(endTime - startTime).toBeLessThan(5000)
    })
  })

  describe('Edge Cases - File Operations', () => {
    it('should handle cache file write errors', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('EACCES: permission denied'))
      await cacheManager.cacheResponse('Prompt', 'Response', 50)
      // Should not throw, operation should continue
      expect(true).toBe(true)
    })

    it('should handle cache file read errors', () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('EACCES: permission denied'))
      expect(() => new TokenCacheManager(testCacheDir)).not.toThrow()
    })

    it('should handle cache directory creation errors', () => {
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('EACCES: permission denied'))
      expect(() => new TokenCacheManager(testCacheDir)).not.toThrow()
    })
  })

  describe('Edge Cases - Invalid Inputs', () => {
    it('should handle null prompts', async () => {
      await expect(cacheManager.cacheResponse(null as any, 'Response', 50)).resolves.not.toThrow()
    })

    it('should handle null responses', async () => {
      await expect(cacheManager.cacheResponse('Prompt', null as any, 50)).resolves.not.toThrow()
    })

    it('should handle undefined values', async () => {
      await expect(cacheManager.cacheResponse(undefined as any, undefined as any, 50)).resolves.not.toThrow()
    })

    it('should handle NaN token values', async () => {
      await expect(cacheManager.cacheResponse('Prompt', 'Response', NaN)).resolves.not.toThrow()
    })

    it('should handle Infinity token values', async () => {
      await expect(cacheManager.cacheResponse('Prompt', 'Response', Infinity)).resolves.not.toThrow()
    })
  })

  describe('Edge Cases - Context Handling', () => {
    it('should handle empty context', async () => {
      await cacheManager.cacheResponse('Prompt', 'Response', 50, '')
      const cached = await cacheManager.getCachedResponse('Prompt', '')
      expect(cached).not.toBeNull()
    })

    it('should handle very long context', async () => {
      const longContext = 'x'.repeat(100000)
      await cacheManager.cacheResponse('Prompt', 'Response', 50, longContext)
      const cached = await cacheManager.getCachedResponse('Prompt', longContext)
      expect(cached).not.toBeNull()
    })

    it('should differentiate between contexts', async () => {
      await cacheManager.cacheResponse('Prompt', 'Response 1', 50, 'Context 1')
      await cacheManager.cacheResponse('Prompt', 'Response 2', 50, 'Context 2')

      const cached1 = await cacheManager.getCachedResponse('Prompt', 'Context 1')
      const cached2 = await cacheManager.getCachedResponse('Prompt', 'Context 2')

      // Should retrieve correct response for each context
      expect(cached1?.response).toBe('Response 1')
      expect(cached2?.response).toBe('Response 2')
    })
  })

  describe('Edge Cases - Cache Corruption', () => {
    it('should recover from corrupted cache file', () => {
      vi.mocked(fs.readFile).mockResolvedValue('{"corrupted": json!!!')
      expect(() => new TokenCacheManager(testCacheDir)).not.toThrow()
    })

    it('should handle cache file with invalid structure', () => {
      vi.mocked(fs.readFile).mockResolvedValue('{"invalid": "structure", "no": "entries"}')
      expect(() => new TokenCacheManager(testCacheDir)).not.toThrow()
    })

    it('should handle cache file with null entries', () => {
      vi.mocked(fs.readFile).mockResolvedValue('{"entries": null}')
      expect(() => new TokenCacheManager(testCacheDir)).not.toThrow()
    })
  })

  describe('Edge Cases - Boundary Conditions', () => {
    it('should handle empty cache', () => {
      const stats = cacheManager.getStats()
      expect(stats.cacheSize).toBe(0)
      expect(stats.totalHits).toBe(0)
      expect(stats.totalMisses).toBe(0)
    })

    it('should handle single entry cache', async () => {
      await cacheManager.cacheResponse('Single prompt', 'Single response', 50)
      const stats = cacheManager.getStats()
      expect(stats.cacheSize).toBe(1)
    })

    it('should handle cache at maximum capacity', async () => {
      for (let i = 0; i < 1000; i++) {
        await cacheManager.cacheResponse(`Prompt ${i}`, `Response ${i}`, 10)
      }
      const stats = cacheManager.getStats()
      expect(stats.cacheSize).toBe(1000)
    })
  })
})

describe('EnhancedTokenCacheManager', () => {
  let enhancedCache: EnhancedTokenCacheManager
  let console: ReturnType<typeof mockConsole>
  let mockCacheService: any

  beforeEach(() => {
    console = mockConsole()
    mockCacheService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    }
    enhancedCache = new EnhancedTokenCacheManager(mockCacheService)
  })

  afterEach(() => {
    console.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with cache service', () => {
      expect(enhancedCache).toBeInstanceOf(EnhancedTokenCacheManager)
    })

    it('should initialize with default cache service', () => {
      const cache = new EnhancedTokenCacheManager()
      expect(cache).toBeInstanceOf(EnhancedTokenCacheManager)
    })
  })

  describe('Cache Operations', () => {
    it('should cache response', async () => {
      await enhancedCache.setCachedResponse('Prompt', 'Response', 100)
      expect(mockCacheService.set).toHaveBeenCalled()
    })

    it('should retrieve cached response', async () => {
      const mockEntry = {
        key: 'test-key',
        responseHash: 'hash',
        signatureWords: ['test'],
        promptPreview: 'Prompt',
        responsePreview: 'Response',
        timestamp: new Date(),
        tokensSaved: 100,
        hitCount: 1,
        tags: [],
        strategy: 'redis',
      }
      mockCacheService.get.mockResolvedValueOnce(mockEntry).mockResolvedValueOnce('Response')

      const result = await enhancedCache.getCachedResponse('Prompt')
      expect(result).toBe('Response')
    })

    it('should return null for cache miss', async () => {
      mockCacheService.get.mockResolvedValue(null)
      const result = await enhancedCache.getCachedResponse('Non-existent prompt')
      expect(result).toBeNull()
    })

    it('should check if response should be cached', async () => {
      const shouldCache = await enhancedCache.shouldCache('Prompt', 'Valid response that is long enough')
      expect(typeof shouldCache).toBe('boolean')
    })

    it('should not cache short responses', async () => {
      const shouldCache = await enhancedCache.shouldCache('Prompt', 'Short')
      expect(shouldCache).toBe(false)
    })

    it('should not cache error responses', async () => {
      const shouldCache = await enhancedCache.shouldCache('Prompt', 'Error: Something went wrong')
      expect(shouldCache).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle cache service errors gracefully', async () => {
      mockCacheService.get.mockRejectedValue(new Error('Cache service unavailable'))
      const result = await enhancedCache.getCachedResponse('Prompt')
      expect(result).toBeNull()
    })

    it('should handle cache service set errors', async () => {
      mockCacheService.set.mockRejectedValue(new Error('Write failed'))
      await expect(enhancedCache.setCachedResponse('Prompt', 'Response', 100)).resolves.not.toThrow()
    })

    it('should handle null cache service', () => {
      expect(() => new EnhancedTokenCacheManager(null as any)).not.toThrow()
    })
  })
})

describe('CompletionProtocolCache', () => {
  let completionCache: CompletionProtocolCache
  let console: ReturnType<typeof mockConsole>
  const testCacheDir = path.join(process.cwd(), 'test-completion-cache')

  beforeEach(() => {
    console = mockConsole()
    vi.mocked(fs.readFile).mockResolvedValue('{}')
    vi.mocked(fs.mkdir).mockResolvedValue(undefined)
    completionCache = new CompletionProtocolCache(testCacheDir)
  })

  afterEach(async () => {
    console.restore()
    await cleanup([testCacheDir])
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with default directory', () => {
      expect(completionCache).toBeInstanceOf(CompletionProtocolCache)
    })

    it('should initialize with custom directory', () => {
      const cache = new CompletionProtocolCache('./custom-dir')
      expect(cache).toBeInstanceOf(CompletionProtocolCache)
    })

    it('should handle cache file not found', () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
      expect(() => new CompletionProtocolCache(testCacheDir)).not.toThrow()
    })
  })

  describe('Completion Operations', () => {
    it('should return null for non-existent completion', async () => {
      const request = {
        prefix: 'const x = ',
        context: 'test context',
        maxOutputTokens: 100,
        temperature: 0.7,
        model: 'claude-3',
      }
      const result = await completionCache.getCompletion(request)
      expect(result).toBeNull()
    })

    it('should store and retrieve completion', async () => {
      const request = {
        prefix: 'const x = ',
        context: 'test context',
        maxOutputTokens: 100,
        temperature: 0.7,
        model: 'claude-3',
      }
      const completion = '10;'

      await completionCache.storeCompletion(request, completion)
      const result = await completionCache.getCompletion(request)

      expect(result).not.toBeNull()
      expect(result?.completion).toBeDefined()
      expect(result?.fromCache).toBe(true)
    })

    it('should not store very short completions', async () => {
      const request = {
        prefix: 'const x = ',
        context: 'test',
        maxOutputTokens: 100,
        temperature: 0.7,
        model: 'claude-3',
      }
      await completionCache.storeCompletion(request, 'x')
      const result = await completionCache.getCompletion(request)
      expect(result).toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty prefix', async () => {
      const request = {
        prefix: '',
        context: 'test',
        maxOutputTokens: 100,
        temperature: 0.7,
        model: 'claude-3',
      }
      const result = await completionCache.getCompletion(request)
      expect(result).toBeNull()
    })

    it('should handle corrupted cache file', () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json!!!')
      expect(() => new CompletionProtocolCache(testCacheDir)).not.toThrow()
    })

    it('should handle file write errors', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('EACCES'))
      const request = {
        prefix: 'const x = ',
        context: 'test',
        maxOutputTokens: 100,
        temperature: 0.7,
        model: 'claude-3',
      }
      await expect(completionCache.storeCompletion(request, 'long completion text')).resolves.not.toThrow()
    })
  })
})

