/**
 * Rate limiter with token bucket algorithm
 */

export interface RateLimiterConfig {
  /**
   * Maximum requests per interval
   */
  maxRequests: number;

  /**
   * Time interval in milliseconds
   */
  interval: number;

  /**
   * Whether to throw error when rate limit exceeded
   */
  throwOnLimit?: boolean;
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly throwOnLimit: boolean;

  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.maxRequests;
    this.tokens = config.maxRequests;
    this.refillRate = config.maxRequests / config.interval;
    this.lastRefill = Date.now();
    this.throwOnLimit = config.throwOnLimit ?? true;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Try to consume a token
   */
  async acquire(tokens = 1): Promise<boolean> {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    if (this.throwOnLimit) {
      const waitTime = Math.ceil((tokens - this.tokens) / this.refillRate);
      throw new Error(`Rate limit exceeded. Retry after ${waitTime}ms`);
    }

    // Wait for tokens to be available
    const waitTime = Math.ceil((tokens - this.tokens) / this.refillRate);
    await new Promise((resolve) => setTimeout(resolve, waitTime));

    this.refill();
    this.tokens -= tokens;
    return true;
  }

  /**
   * Check if tokens are available without consuming
   */
  hasTokens(tokens = 1): boolean {
    this.refill();
    return this.tokens >= tokens;
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

/**
 * Create a rate-limited version of a function
 */
export function withRateLimit<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  limiter: RateLimiter
): T {
  return (async (...args: any[]) => {
    await limiter.acquire();
    return fn(...args);
  }) as T;
}

/**
 * Pre-configured rate limiters for different APIs
 */
export const RateLimiters = {
  /**
   * Polymarket CLOB API (conservative: 10 req/s)
   */
  polymarketCLOB: new RateLimiter({
    maxRequests: 10,
    interval: 1000,
    throwOnLimit: false,
  }),

  /**
   * Gamma API (20 req/s)
   */
  polymarketGamma: new RateLimiter({
    maxRequests: 20,
    interval: 1000,
    throwOnLimit: false,
  }),

  /**
   * CDP API (50 req/s)
   */
  coinbaseCDP: new RateLimiter({
    maxRequests: 50,
    interval: 1000,
    throwOnLimit: false,
  }),
};
