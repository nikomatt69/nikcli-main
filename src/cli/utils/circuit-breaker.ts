/**
 * CircuitBreaker - Prevents cascading failures by stopping calls to failing services
 * States: closed (normal), open (failing), half-open (testing recovery)
 */
import { structuredLogger } from './structured-logger'

export interface CircuitBreakerOptions {
  failureThreshold?: number // Number of failures before opening
  successThreshold?: number // Successes needed to close from half-open
  timeout?: number // Time in ms before attempting half-open
  resetTimeout?: number // Time in ms to keep half-open before closing
  componentName?: string // Component name for logging
}

export type CircuitState = 'closed' | 'open' | 'half-open'

export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failures = 0
  private successes = 0
  private lastFailureTime = 0
  private nextAttemptTime = 0

  private readonly failureThreshold: number
  private readonly successThreshold: number
  private readonly timeout: number
  private readonly resetTimeout: number
  private readonly componentName: string

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5
    this.successThreshold = options.successThreshold ?? 2
    this.timeout = options.timeout ?? 60000 // 1 minute
    this.resetTimeout = options.resetTimeout ?? 10000 // 10 seconds
    this.componentName = options.componentName || 'CircuitBreaker'
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
    if (this.state === 'open') {
      // Check if we should attempt recovery
      if (Date.now() >= this.nextAttemptTime) {
        this.state = 'half-open'
        this.successes = 0
        structuredLogger.info(
          this.componentName,
          `Circuit breaker transitioning to half-open for recovery test. Next attempt: ${new Date(this.nextAttemptTime).toISOString()}`
        )
      } else {
        if (fallback) {
          return fallback()
        }
        const error = new Error(
          `Circuit breaker is open. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`
        )
        structuredLogger.warning(
          this.componentName,
          `Circuit breaker is open, rejecting request. Next attempt: ${new Date(this.nextAttemptTime).toISOString()}`
        )
        throw error
      }
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      if (fallback) {
        return fallback()
      }
      throw error
    }
  }

  private onSuccess(): void {
    this.failures = 0

    if (this.state === 'half-open') {
      this.successes++
      if (this.successes >= this.successThreshold) {
        this.state = 'closed'
        this.successes = 0
        structuredLogger.info(
          this.componentName,
          `Circuit breaker recovered and closed after ${this.successes} successful attempts`
        )
      }
    }
  }

  private onFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()

    if (this.state === 'half-open') {
      // Immediate open on failure during half-open
      this.state = 'open'
      this.nextAttemptTime = Date.now() + this.timeout
      this.successes = 0

      structuredLogger.warning(
        this.componentName,
        `Circuit breaker opened after half-open failure. Failures: ${this.failures}/${this.failureThreshold}`
      )
    } else if (this.failures >= this.failureThreshold) {
      this.state = 'open'
      this.nextAttemptTime = Date.now() + this.timeout

      structuredLogger.warning(
        this.componentName,
        `Circuit breaker opened due to failure threshold. Failures: ${this.failures}/${this.failureThreshold}`
      )
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Get circuit statistics
   */
  getStats(): {
    state: CircuitState
    failures: number
    successes: number
    lastFailureTime: number
    nextAttemptTime: number
  } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed'
    this.failures = 0
    this.successes = 0
    this.lastFailureTime = 0
    this.nextAttemptTime = 0
  }

  /**
   * Force circuit to open state
   */
  forceOpen(): void {
    this.state = 'open'
    this.nextAttemptTime = Date.now() + this.timeout
  }
}
