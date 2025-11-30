import { CLIError, logger } from './error-handler'

export interface TimeoutOptions {
  timeoutMs: number
  timeoutMessage?: string
  abortController?: AbortController
}

export interface RetryOptions {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  backoffFactor: number
  retryCondition?: (error: Error) => boolean
}

export interface RateLimitOptions {
  maxConcurrent: number
  queueSize: number
  timeoutMs?: number
}

export class AsyncUtils {
  /**
   * Wraps a promise with a timeout
   */
  static async withTimeout<T>(promise: Promise<T>, options: TimeoutOptions): Promise<T> {
    const { timeoutMs, timeoutMessage = 'Operation timed out', abortController } = options

    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          if (abortController) {
            abortController.abort()
          }
          reject(new CLIError(timeoutMessage, 'TIMEOUT', 'system', false, { timeoutMs }))
        }, timeoutMs)

        // Clear timeout if the main promise resolves first
        promise.finally(() => clearTimeout(timeoutId))
      }),
    ])
  }

  /**
   * Retry operation with exponential backoff
   */
  static async withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
    const { maxRetries, baseDelay, maxDelay, backoffFactor, retryCondition = () => true } = options

    let lastError: Error

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation()
        if (attempt > 0) {
          logger.info(`Operation succeeded after ${attempt} retries`, 'AsyncUtils')
        }
        return result
      } catch (error) {
        lastError = error as Error

        if (attempt === maxRetries || !retryCondition(lastError)) {
          throw lastError
        }

        const delay = Math.min(baseDelay * backoffFactor ** attempt, maxDelay)

        logger.warn(`Operation failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, 'AsyncUtils', {
          error: lastError.message,
        })

        await AsyncUtils.delay(delay)
      }
    }

    throw lastError!
  }

  /**
   * Simple delay utility
   */
  static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Execute operations in sequence with delay between each
   */
  static async sequence<T>(operations: (() => Promise<T>)[], delayMs: number = 0): Promise<T[]> {
    const results: T[] = []

    for (let i = 0; i < operations.length; i++) {
      if (i > 0 && delayMs > 0) {
        await AsyncUtils.delay(delayMs)
      }
      results.push(await operations[i]())
    }

    return results
  }

  /**
   * Execute operations in parallel with controlled concurrency
   */
  static async parallel<T>(operations: (() => Promise<T>)[], maxConcurrent: number = 5): Promise<T[]> {
    const results: T[] = new Array(operations.length)
    const executing: Promise<void>[] = []

    for (let i = 0; i < operations.length; i++) {
      const promise = operations[i]().then((result) => {
        results[i] = result
      })

      executing.push(promise)

      if (executing.length >= maxConcurrent) {
        await Promise.race(executing)
        executing.splice(
          executing.findIndex((p) => p === promise),
          1
        )
      }
    }

    await Promise.all(executing)
    return results
  }

  /**
   * Execute operation with circuit breaker pattern
   */
  static createCircuitBreaker<T extends any[], R>(
    operation: (...args: T) => Promise<R>,
    options: {
      failureThreshold: number
      resetTimeoutMs: number
      monitorWindowMs: number
    }
  ): (...args: T) => Promise<R> {
    let state: 'closed' | 'open' | 'half-open' = 'closed'
    let failures = 0
    let lastFailureTime = 0
    let nextAttemptTime = 0

    return async (...args: T): Promise<R> => {
      const now = Date.now()

      // Reset failure count if monitoring window has passed
      if (now - lastFailureTime > options.monitorWindowMs) {
        failures = 0
      }

      // Check circuit breaker state
      if (state === 'open') {
        if (now < nextAttemptTime) {
          throw new CLIError('Circuit breaker is open', 'CIRCUIT_BREAKER_OPEN', 'system', true, {
            nextAttemptTime,
            currentTime: now,
          })
        }
        state = 'half-open'
      }

      try {
        const result = await operation(...args)

        // Success - reset circuit breaker
        if (state === 'half-open') {
          state = 'closed'
          failures = 0
          logger.info('Circuit breaker reset to closed state', 'AsyncUtils')
        }

        return result
      } catch (error) {
        failures++
        lastFailureTime = now

        if (failures >= options.failureThreshold) {
          state = 'open'
          nextAttemptTime = now + options.resetTimeoutMs
          logger.warn(`Circuit breaker opened due to ${failures} failures`, 'AsyncUtils', { nextAttemptTime })
        }

        throw error
      }
    }
  }

  /**
   * Rate limiter for controlling operation frequency
   */
  static createRateLimiter(options: RateLimitOptions) {
    const { maxConcurrent, queueSize, timeoutMs = 30000 } = options

    let running = 0
    const queue: Array<{
      operation: () => Promise<any>
      resolve: (value: any) => void
      reject: (error: Error) => void
      timestamp: number
    }> = []

    const processQueue = async () => {
      while (queue.length > 0 && running < maxConcurrent) {
        const item = queue.shift()!

        // Check if operation has timed out while waiting in queue
        if (Date.now() - item.timestamp > timeoutMs) {
          item.reject(new CLIError('Operation timed out in queue', 'QUEUE_TIMEOUT', 'system'))
          continue
        }

        running++

        try {
          const result = await item.operation()
          item.resolve(result)
        } catch (error) {
          item.reject(error as Error)
        } finally {
          running--
          // Process next item
          setImmediate(processQueue)
        }
      }
    }

    return async <T>(operation: () => Promise<T>): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        if (queue.length >= queueSize) {
          reject(new CLIError('Rate limiter queue is full', 'QUEUE_FULL', 'system'))
          return
        }

        queue.push({
          operation,
          resolve,
          reject,
          timestamp: Date.now(),
        })

        processQueue()
      })
    }
  }

  /**
   * Debounce async operations
   */
  static debounce<T extends any[], R>(func: (...args: T) => Promise<R>, wait: number): (...args: T) => Promise<R> {
    let timeoutId: NodeJS.Timeout | null = null
    let resolveQueue: Array<{ resolve: (value: R) => void; reject: (error: Error) => void }> = []

    return (...args: T): Promise<R> => {
      return new Promise<R>((resolve, reject) => {
        resolveQueue.push({ resolve, reject })

        if (timeoutId) {
          clearTimeout(timeoutId)
        }

        timeoutId = setTimeout(async () => {
          const currentQueue = resolveQueue
          resolveQueue = []

          try {
            const result = await func(...args)
            currentQueue.forEach(({ resolve }) => resolve(result))
          } catch (error) {
            currentQueue.forEach(({ reject }) => reject(error as Error))
          }

          timeoutId = null
        }, wait)
      })
    }
  }

  /**
   * Throttle async operations
   */
  static throttle<T extends any[], R>(func: (...args: T) => Promise<R>, limit: number): (...args: T) => Promise<R> {
    let lastExecTime = 0
    let timeoutId: NodeJS.Timeout | null = null
    let lastPromise: Promise<R> | null = null

    return (...args: T): Promise<R> => {
      const now = Date.now()
      const timeSinceLastExec = now - lastExecTime

      if (timeSinceLastExec >= limit) {
        lastExecTime = now
        lastPromise = func(...args)
        return lastPromise
      }

      if (lastPromise) {
        return lastPromise
      }

      return new Promise<R>((resolve, reject) => {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }

        timeoutId = setTimeout(async () => {
          try {
            lastExecTime = Date.now()
            lastPromise = func(...args)
            const result = await lastPromise
            resolve(result)
          } catch (error) {
            reject(error)
          } finally {
            timeoutId = null
            lastPromise = null
          }
        }, limit - timeSinceLastExec)
      })
    }
  }

  /**
   * Batch operations for efficiency
   */
  static createBatcher<T, R>(
    batchProcessor: (items: T[]) => Promise<R[]>,
    options: {
      maxBatchSize: number
      maxWaitMs: number
      maxConcurrentBatches?: number
    }
  ): (item: T) => Promise<R> {
    const { maxBatchSize, maxWaitMs, maxConcurrentBatches = 1 } = options

    const currentBatch: Array<{
      item: T
      resolve: (value: R) => void
      reject: (error: Error) => void
    }> = []

    let batchTimeout: NodeJS.Timeout | null = null
    let activeBatches = 0

    const processBatch = async () => {
      if (currentBatch.length === 0 || activeBatches >= maxConcurrentBatches) {
        return
      }

      const batch = currentBatch.splice(0, maxBatchSize)
      activeBatches++

      if (batchTimeout) {
        clearTimeout(batchTimeout)
        batchTimeout = null
      }

      try {
        const results = await batchProcessor(batch.map((b) => b.item))
        batch.forEach((b, index) => {
          if (results[index] !== undefined) {
            b.resolve(results[index])
          } else {
            b.reject(new Error('Batch processing failed for item'))
          }
        })
      } catch (error) {
        batch.forEach((b) => b.reject(error as Error))
      } finally {
        activeBatches--

        // Process remaining items
        if (currentBatch.length > 0) {
          setImmediate(processBatch)
        }
      }
    }

    return (item: T): Promise<R> => {
      return new Promise<R>((resolve, reject) => {
        currentBatch.push({ item, resolve, reject })

        if (currentBatch.length >= maxBatchSize) {
          processBatch()
        } else if (!batchTimeout) {
          batchTimeout = setTimeout(processBatch, maxWaitMs)
        }
      })
    }
  }
}

// Commonly used configurations
export const defaultRetryOptions: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
}

export const defaultTimeoutOptions: Partial<TimeoutOptions> = {
  timeoutMs: 30000,
}

export const defaultRateLimitOptions: RateLimitOptions = {
  maxConcurrent: 5,
  queueSize: 100,
  timeoutMs: 30000,
}
