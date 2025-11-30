/**
 * SemanticCache - Advanced semantic caching system for NikCLI
 * 
 * Provides intelligent caching with Redis backend and ChromaDB vector storage
 * for semantic similarity matching. Integrates with NikCLI tool execution system
 * for efficient result caching and retrieval.
 * 
 * @module SemanticCache
 * @version 1.5.0
 */

import Redis from 'ioredis';
import { ChromaClient } from 'chromadb';
import { EventEmitter } from 'events';

/**
 * Cache entry metadata and statistics
 */
export interface CacheEntry<T = any> {
  id: string;
  key: string;
  value: T;
  embedding?: number[];
  metadata: CacheMetadata;
  createdAt: number;
  expiresAt?: number;
  accessCount: number;
  lastAccessedAt: number;
  size: number;
}

/**
 * Metadata for cache entries
 */
export interface CacheMetadata {
  source: string;
  toolId?: string;
  taskId?: string;
  tags: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  ttl?: number;
  semanticGroup?: string;
}

/**
 * Cache statistics and performance metrics
 */
export interface CacheStatistics {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
  averageAccessTime: number;
  memoryUsage: number;
  hitCount: number;
  missCount: number;
  lastUpdated: number;
}

/**
 * Semantic search result
 */
export interface SemanticSearchResult<T = any> {
  entry: CacheEntry<T>;
  similarity: number;
  distance: number;
}

/**
 * Cache configuration options
 */
export interface SemanticCacheConfig {
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    maxRetries?: number;
    retryStrategy?: (times: number) => number;
  };
  chromadb?: {
    host: string;
    port: number;
    apiKey?: string;
  };
  cache?: {
    maxSize: number;
    maxEntries: number;
    defaultTtl: number;
    evictionPolicy: 'lru' | 'lfu' | 'fifo' | 'ttl';
    compressionThreshold: number;
  };
  embedding?: {
    model: string;
    dimension: number;
    provider: 'openai' | 'huggingface' | 'local';
  };
}

/**
 * Tool execution cache entry
 */
export interface ToolExecutionCacheEntry extends CacheEntry {
  toolId: string;
  toolName: string;
  inputHash: string;
  executionTime: number;
  status: 'success' | 'error' | 'partial';
}

/**
 * SemanticCache - Main cache class
 * 
 * Provides semantic caching capabilities with Redis persistence and ChromaDB
 * vector similarity search. Designed for NikCLI tool execution result caching.
 */
export class SemanticCache extends EventEmitter {
  private redis: Redis;
  private chromadb: ChromaClient;
  private config: SemanticCacheConfig;
  private statistics: CacheStatistics;
  private localCache: Map<string, CacheEntry>;
  private embeddingCache: Map<string, number[]>;
  private isInitialized: boolean = false;
  private collectionName: string = 'nikcli_cache';

  /**
   * Initialize SemanticCache with configuration
   */
  constructor(config: SemanticCacheConfig) {
    super();
    this.config = this.validateConfig(config);
    this.localCache = new Map();
    this.embeddingCache = new Map();
    this.statistics = this.initializeStatistics();
    this.redis = this.initializeRedis();
    this.chromadb = this.initializeChromaDB();
  }

  /**
   * Validate and normalize configuration
   */
  private validateConfig(config: SemanticCacheConfig): SemanticCacheConfig {
    const defaults: SemanticCacheConfig = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: 0,
        maxRetries: 3,
      },
      chromadb: {
        host: process.env.CHROMADB_HOST || 'localhost',
        port: parseInt(process.env.CHROMADB_PORT || '8000'),
      },
      cache: {
        maxSize: 1024 * 1024 * 100, // 100MB
        maxEntries: 10000,
        defaultTtl: 3600 * 24, // 24 hours
        evictionPolicy: 'lru',
        compressionThreshold: 1024, // 1KB
      },
      embedding: {
        model: 'text-embedding-3-small',
        dimension: 1536, // OpenAI text-embedding-3-small dimensions
        provider: 'openai',
      },
    };

    return {
      redis: { ...defaults.redis, ...config.redis } as Required<SemanticCacheConfig['redis']>,
      chromadb: { ...defaults.chromadb, ...config.chromadb } as Required<SemanticCacheConfig['chromadb']>,
      cache: { ...defaults.cache, ...config.cache } as Required<SemanticCacheConfig['cache']>,
      embedding: { ...defaults.embedding, ...config.embedding } as Required<SemanticCacheConfig['embedding']>,
    };
  }

  /**
   * Initialize Redis connection
   */
  private initializeRedis(): Redis {
    const redisConfig = this.config.redis!;
    const redis = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      maxRetriesPerRequest: redisConfig.maxRetries,
      retryStrategy: redisConfig.retryStrategy || ((times) => Math.min(times * 50, 2000)),
    });

    redis.on('connect', () => {
      this.emit('redis:connected');
    });

    redis.on('error', (error) => {
      this.emit('redis:error', error);
    });

    return redis;
  }

  /**
   * Initialize ChromaDB connection
   */
  private initializeChromaDB(): ChromaClient {
    const chromaConfig = this.config.chromadb!;
    const chromadb = new ChromaClient({
      path: `http://${chromaConfig.host}:${chromaConfig.port}`,
    });

    return chromadb;
  }

  /**
   * Initialize cache statistics
   */
  private initializeStatistics(): CacheStatistics {
    return {
      totalEntries: 0,
      totalSize: 0,
      hitRate: 0,
      missRate: 0,
      evictionCount: 0,
      averageAccessTime: 0,
      memoryUsage: 0,
      hitCount: 0,
      missCount: 0,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Initialize the cache system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Test Redis connection
      await this.redis.ping();
      this.emit('initialized', { component: 'redis' });

      // Initialize ChromaDB collection
      try {
        await this.chromadb.getOrCreateCollection({
          name: this.collectionName,
        });
        this.emit('initialized', { component: 'chromadb' });
      } catch (error) {
        console.warn('ChromaDB initialization failed, continuing without vector search:', error);
      }

      this.isInitialized = true;
      this.emit('ready');
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to initialize SemanticCache: ${error}`);
    }
  }


  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    return { ...this.statistics };
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.localCache.clear();
    this.embeddingCache.clear();
    await this.redis.flushdb();

    try {
      await this.chromadb.deleteCollection({ name: this.collectionName });
      await this.chromadb.createCollection({ name: this.collectionName });
    } catch (error) {
      console.warn('Failed to clear ChromaDB collection:', error);
    }

    this.statistics = this.initializeStatistics();
    this.emit('cleared');
  }

  /**
   * Close connections and cleanup
   */
  async close(): Promise<void> {
    await this.redis.quit();
    this.localCache.clear();
    this.embeddingCache.clear();
    this.isInitialized = false;
    this.emit('closed');
  }
}
