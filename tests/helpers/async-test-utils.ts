/**
 * Async Test Utilities
 * Helpers for testing asynchronous operations
 */

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout?: number
    interval?: number
    message?: string
  } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50, message = 'Condition not met within timeout' } = options

  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  throw new Error(message)
}

/**
 * Wait for a specific amount of time
 */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute function with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), timeoutMs)
    ),
  ])
}

/**
 * Retry a function until it succeeds or max attempts reached
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    delayMs?: number
    onRetry?: (attempt: number, error: Error) => void
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 100, onRetry } = options

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error
      }

      if (onRetry) {
        onRetry(attempt, error as Error)
      }

      await delay(delayMs * attempt) // Exponential backoff
    }
  }

  throw new Error('Retry failed')
}

/**
 * Execute functions in parallel with concurrency limit
 */
export async function parallelLimit<T>(
  items: T[],
  fn: (item: T) => Promise<any>,
  limit: number
): Promise<any[]> {
  const results: any[] = []
  const executing: Promise<void>[] = []

  for (const item of items) {
    const promise = fn(item).then((result) => {
      results.push(result)
      executing.splice(executing.indexOf(promise), 1)
    })

    executing.push(promise)

    if (executing.length >= limit) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
  return results
}

/**
 * Measure execution time of async function
 */
export async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
  const startTime = Date.now()
  const result = await fn()
  const timeMs = Date.now() - startTime

  return { result, timeMs }
}

/**
 * Poll for a value until condition is met
 */
export async function poll<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: {
    timeout?: number
    interval?: number
  } = {}
): Promise<T> {
  const { timeout = 5000, interval = 100 } = options
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const value = await fn()
    if (predicate(value)) {
      return value
    }
    await delay(interval)
  }

  throw new Error('Poll timeout: condition not met')
}

/**
 * Defer execution
 */
export class Deferred<T> {
  promise: Promise<T>
  resolve!: (value: T) => void
  reject!: (error: Error) => void

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}

/**
 * Create a mock async function with controllable timing
 */
export function createMockAsync<T>(
  value: T,
  delayMs = 0,
  shouldFail = false
): () => Promise<T> {
  return async () => {
    await delay(delayMs)
    if (shouldFail) {
      throw new Error('Mock async function failed')
    }
    return value
  }
}

/**
 * Flush all pending promises
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}
