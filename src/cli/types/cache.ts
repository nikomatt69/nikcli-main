import { z } from 'zod/v3';

/**
 * Type definitions for Semantic Caching System
 * Provides caching for semantically similar queries to reduce redundant API calls
 */

/**
 * Cache entry with semantic similarity metadata
 */
export interface CacheEntry {
  id: string
  query: string
  result: string
  queryEmbedding: number[]
  resultEmbedding: number[]
  similarity: number
  timestamp: Date
  ttl: number
  metadata: CacheMetadata
  accessCount: number
  lastAccessed: Date
  agentId?: string
  model?: string
  cacheHit?: boolean
}

/**
 * Cache metadata for additional context
 */
export interface CacheMetadata {
  queryLength: number
  resultLength: number
  modelProvider?: string
  tokensUsed?: number
  cost?: number
  successRate?: number
  tags?: string[]
  category?: string
  priority?: number
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  enabled: boolean
  minSimilarity: number
  ttl: number
  maxCacheSize?: number
  useVectorDB: boolean
  embeddingProvider?: 'openai' | 'anthropic' | 'google'
  cacheBackend: 'redis' | 'memory' | 'chromadb'
  redisKeyPrefix?: string
  vectorCollection?: string
  autoCleanupInterval?: number
  metricsEnabled?: boolean
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  totalEntries: number
  cacheHits: number
  cacheMisses: number
  totalQueries: number
  hitRate: number
  saveRate: number
  totalTokensSaved: number
  estimatedCostSaved: number
  averageSimilarity: number
  averageQueryTime: number
  memoryUsage: number
  oldestEntry?: Date
  newestEntry?: Date
  frequentQueries: Array<{ query: string; count: number; similarity: number }>
  byCategory: Record<string, { entries: number; hits: number }>
}

/**
 * Query result from cache
 */
export interface CacheResult {
  success: boolean
  entry?: CacheEntry
  similarity?: number
  reason?: 'hit' | 'miss' | 'expired' | 'error'
  queryId: string
  processingTime: number
  metadata?: CacheMetadata
}

/**
 * Cache query options
 */
export interface CacheQueryOptions {
  minSimilarity?: number
  maxResults?: number
  includeExpired?: boolean
  filterByAgent?: string
  filterByModel?: string
  category?: string
  tags?: string[]
}

/**
 * Cache store options
 */
export interface CacheStoreOptions {
  ttl?: number
  metadata?: CacheMetadata
  agentId?: string
  model?: string
  tags?: string[]
  category?: string
}

/**
 * Cache performance metrics
 */
export interface CacheMetrics {
  queriesPerSecond: number
  averageResponseTime: number
  cacheHitRatio: number
  memoryEfficiency: number
  embeddingSimilarity: number
  timeToLiveDistribution: Record<number, number>
  evictionReasons: Record<string, number>
}

/**
 * Vector similarity search result
 */
export interface VectorSearchResult {
  id: string
  similarity: number
  entry: CacheEntry
  metadata?: Record<string, any>
}

/**
 * Cache eviction policy
 */
export interface EvictionPolicy {
  type: 'lru' | 'lfu' | 'ttl' | 'size' | 'random'
  maxSize?: number
  ttlThreshold?: number
  lruInterval?: number
}

/**
 * Validation schemas using Zod
 */
export const CacheEntrySchema = z
  .object({
    id: z.string().uuid(),
    query: z.string().min(1).max(10000),
    result: z.string().min(1).max(50000),
    queryEmbedding: z.array(z.number()).max(1536), // Max for OpenAI, Google uses 768
    resultEmbedding: z.array(z.number()).max(1536), // Max for OpenAI, Google uses 768
    similarity: z.number().min(0).max(1),
    timestamp: z.date(),
    ttl: z.number().min(60),
    metadata: z.object({
      queryLength: z.number().int().min(1),
      resultLength: z.number().int().min(1),
      modelProvider: z.string().optional(),
      tokensUsed: z.number().int().min(1).optional(),
      cost: z.number().min(0).optional(),
      successRate: z.number().min(0).max(1).optional(),
      tags: z.array(z.string()).optional(),
      category: z.string().optional(),
      priority: z.number().int().optional(),
    }),
    accessCount: z.number().int().min(1),
    lastAccessed: z.date(),
    agentId: z.string().optional(),
    model: z.string().optional(),
    cacheHit: z.boolean().optional(),
  })
  .transform((data) => ({
    ...data,
    similarity: Math.min(Math.max(data.similarity, 0), 1),
    ttl: Math.max(data.ttl, 60),
  })) as z.ZodType<CacheEntry>

export const CacheConfigSchema = z.object({
  enabled: z.boolean(),
  minSimilarity: z.number().min(0).max(1),
  ttl: z.number().min(60),
  maxCacheSize: z.number().int().min(100).optional(),
  useVectorDB: z.boolean().default(true),
  embeddingProvider: z.enum(['openai', 'anthropic', 'google']).optional(),
  cacheBackend: z.enum(['redis', 'memory', 'chromadb']),
  redisKeyPrefix: z.string().optional(),
  vectorCollection: z.string().optional(),
  autoCleanupInterval: z.number().int().min(60).optional(),
  metricsEnabled: z.boolean().optional(),
})

export const CacheStatsSchema = z.object({
  totalEntries: z.number().int().min(0),
  cacheHits: z.number().int().min(0),
  cacheMisses: z.number().int().min(0),
  totalQueries: z.number().int().min(0),
  hitRate: z.number().min(0).max(1),
  saveRate: z.number().min(0).max(1),
  totalTokensSaved: z.number().int().min(0),
  estimatedCostSaved: z.number().min(0),
  averageSimilarity: z.number().min(0).max(1),
  averageQueryTime: z.number().min(0),
  memoryUsage: z.number().int().min(0),
  oldestEntry: z.date().optional(),
  newestEntry: z.date().optional(),
  frequentQueries: z.array(
    z.object({
      query: z.string(),
      count: z.number().int().min(1),
      similarity: z.number().min(0).max(1),
    })
  ),
  byCategory: z.record(
    z.string(),
    z.object({
      entries: z.number().int().min(0),
      hits: z.number().int().min(0),
    })
  ),
})

/**
 * Cache result validation schema
 */
export const CacheResultSchema = z.object({
  success: z.boolean(),
  entry: CacheEntrySchema.optional(),
  similarity: z.number().min(0).max(1).optional(),
  reason: z.enum(['hit', 'miss', 'expired', 'error']).optional(),
  queryId: z.string().uuid(),
  processingTime: z.number().min(0),
  metadata: z
    .object({
      queryLength: z.number().int().min(1),
      resultLength: z.number().int().min(1),
      modelProvider: z.string().optional(),
      tokensUsed: z.number().int().min(1).optional(),
      cost: z.number().min(0).optional(),
      successRate: z.number().min(0).max(1).optional(),
      tags: z.array(z.string()).optional(),
      category: z.string().optional(),
      priority: z.number().int().optional(),
    })
    .optional() as z.ZodType<CacheMetadata>,
}) as z.ZodType<CacheResult & { metadata?: CacheMetadata | undefined }>

/**
 * Cache event types for system integration
 */
export enum CacheEventType {
  CACHE_HIT = 'cache_hit',
  CACHE_MISS = 'cache_miss',
  CACHE_UPDATE = 'cache_update',
  CACHE_EXPIRED = 'cache_expired',
  CACHE_EVICTED = 'cache_evicted',
  CACHE_ERROR = 'cache_error',
  CACHE_CLEARED = 'cache_cleared',
}

/**
 * Cache event for system integration
 */
export interface CacheEvent {
  type: CacheEventType
  queryId: string
  similarity: number
  cachedResultId?: string
  metadata: CacheMetadata
  timestamp: Date
  agentId?: string
  model?: string
}

/**
 * Cache event validation schema
 */
export const CacheEventSchema = z.object({
  type: z.nativeEnum(CacheEventType),
  queryId: z.string().uuid(),
  similarity: z.number().min(0).max(1),
  cachedResultId: z.string().uuid().optional(),
  metadata: z
    .object({
      queryLength: z.number().int().min(1),
      resultLength: z.number().int().min(1),
      modelProvider: z.string().optional(),
      tokensUsed: z.number().int().min(1).optional(),
      cost: z.number().min(0).optional(),
      successRate: z.number().min(0).max(1).optional(),
      tags: z.array(z.string()).optional(),
      category: z.string().optional(),
      priority: z.number().int().optional(),
    })
    .optional() as z.ZodType<CacheMetadata>,
  timestamp: z.date(),
  agentId: z.string().optional(),
  model: z.string().optional(),
})

/**
 * Cache validation utilities
 */
export class CacheValidator {
  static validateEntry(entry: unknown): CacheEntry {
    return CacheEntrySchema.parse(entry)
  }

  static validateConfig(config: unknown): CacheConfig {
    return CacheConfigSchema.parse(config)
  }

  static validateStats(stats: unknown): CacheStats {
    return CacheStatsSchema.parse(stats)
  }

  static validateResult(result: unknown): CacheResult {
    return CacheResultSchema.parse(result)
  }

  static validateEvent(event: unknown): CacheEvent {
    return CacheEventSchema.parse(event)
  }

  static isValidSimilarity(similarity: number): boolean {
    return similarity >= 0 && similarity <= 1
  }

  static isValidTTL(ttl: number): boolean {
    return ttl >= 60 // Minimum 1 minute
  }

  static isValidQueryLength(length: number): boolean {
    return length > 0 && length <= 10000
  }

  static isValidResultLength(length: number): boolean {
    return length > 0 && length <= 50000
  }
}
