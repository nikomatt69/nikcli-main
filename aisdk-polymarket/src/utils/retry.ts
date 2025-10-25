/**
 * Retry utilities with exponential backoff
 */

export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts?: number;

  /**
   * Initial delay in milliseconds
   */
  initialDelay?: number;

  /**
   * Maximum delay in milliseconds
   */
  maxDelay?: number;

  /**
   * Backoff multiplier
   */
  backoffMultiplier?: number;

  /**
   * Jitter factor (0-1)
   */
  jitter?: number;

  /**
   * Function to determine if error is retryable
   */
  isRetryable?: (error: any) => boolean;

  /**
   * Callback on retry
   */
  onRetry?: (attempt: number, error: any, delay: number) => void;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: 0.1,
  isRetryable: (error: any) => {
    // Retry on network errors and 5xx status codes
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;
    if (error.status >= 500 && error.status < 600) return true;
    if (error.message?.includes('rate limit')) return true;
    return false;
  },
  onRetry: () => {},
};

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateDelay(
  attempt: number,
  config: Required<RetryConfig>
): number {
  const exponentialDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);

  // Add jitter to prevent thundering herd
  const jitter = cappedDelay * config.jitter * (Math.random() * 2 - 1);
  return Math.max(0, cappedDelay + jitter);
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: any;

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if error is not retryable
      if (!fullConfig.isRetryable(error)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === fullConfig.maxAttempts) {
        break;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, fullConfig);
      fullConfig.onRetry(attempt, error, delay);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Retry with specific error handling for Polymarket CLOB
 */
export async function retryPolymarketRequest<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  return retry(fn, {
    maxAttempts: 4,
    initialDelay: 2000,
    isRetryable: (error: any) => {
      // Network errors
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;

      // Server errors
      if (error.status >= 500) return true;

      // Rate limiting
      if (error.status === 429) return true;

      // Specific CLOB errors that are retryable
      if (error.message?.includes('rate limit')) return true;
      if (error.message?.includes('timeout')) return true;

      // Don't retry validation errors
      if (error.message?.includes('INVALID_ORDER')) return false;
      if (error.message?.includes('NOT_ENOUGH_BALANCE')) return false;

      return false;
    },
    onRetry: (attempt, error, delay) => {
      console.warn(
        `[Retry] Attempt ${attempt} failed, retrying in ${delay}ms:`,
        error.message || error
      );
    },
    ...config,
  });
}

/**
 * Create a retryable version of a function
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: RetryConfig = {}
): T {
  return (async (...args: any[]) => {
    return retry(() => fn(...args), config);
  }) as T;
}
