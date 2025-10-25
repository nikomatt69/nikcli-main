/**
 * Simple in-memory cache with TTL
 */

export interface CacheOptions {
  /**
   * Time to live in milliseconds
   */
  ttl?: number;

  /**
   * Maximum cache size
   */
  maxSize?: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class Cache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly ttl: number;
  private readonly maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.ttl = options.ttl ?? 60000; // 1 minute default
    this.maxSize = options.maxSize ?? 1000;
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const expiresAt = Date.now() + (ttl ?? this.ttl);
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Get or compute value
   */
  async getOrCompute(
    key: string,
    compute: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await compute();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

/**
 * Create a cached version of an async function
 */
export function withCache<Args extends any[], Result>(
  fn: (...args: Args) => Promise<Result>,
  cache: Cache<Result>,
  keyFn: (...args: Args) => string
): (...args: Args) => Promise<Result> {
  return async (...args: Args): Promise<Result> => {
    const key = keyFn(...args);
    return cache.getOrCompute(key, () => fn(...args));
  };
}

/**
 * Pre-configured caches for different data types
 */
export const Caches = {
  /**
   * Market data cache (5 minutes)
   */
  markets: new Cache({
    ttl: 5 * 60 * 1000,
    maxSize: 500,
  }),

  /**
   * Orderbook cache (10 seconds)
   */
  orderbooks: new Cache({
    ttl: 10 * 1000,
    maxSize: 100,
  }),

  /**
   * Market config cache (1 hour)
   */
  configs: new Cache({
    ttl: 60 * 60 * 1000,
    maxSize: 1000,
  }),
};
