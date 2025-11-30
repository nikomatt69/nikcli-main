/**
 * Safety Guard - Monitors stream health and protects against resource exhaustion
 * Implements timeout protection, circuit breaker, and overflow detection
 */

import type { CircularBuffer, StreamChunk } from './circular-buffer'
import type { StreamMetadata } from './stream-coordinator'

export interface SafetyConfig {
  chunkTimeoutMs: number
  maxBufferSize: number
  maxConcurrentStreams: number
  maxRetries: number
  circuitBreakerThreshold: number
  circuitBreakerResetMs: number
}

export interface HealthStatus {
  isHealthy: boolean
  timeoutCount: number
  overflowCount: number
  errorCount: number
  circuitBreakerOpen: boolean
  lastErrorTime?: number
  recoveryNeeded: boolean
}

const DEFAULT_CONFIG: SafetyConfig = {
  chunkTimeoutMs: 5000,
  maxBufferSize: 5242880, // 5MB
  maxConcurrentStreams: 5,
  maxRetries: 3,
  circuitBreakerThreshold: 10,
  circuitBreakerResetMs: 30000,
}

export class SafetyGuard {
  private config: SafetyConfig
  private circuitBreakerOpen: boolean = false
  private circuitBreakerOpenTime: number = 0
  private errorCount: number = 0
  private timeoutCount: number = 0
  private overflowCount: number = 0
  private streamTimeouts: Map<string, NodeJS.Timeout> = new Map()

  constructor(config: Partial<SafetyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.validateConfig()
  }

  private validateConfig(): void {
    if (this.config.chunkTimeoutMs < 100 || this.config.chunkTimeoutMs > 60000) {
      throw new Error('chunkTimeoutMs must be between 100 and 60000')
    }
    if (this.config.maxBufferSize < 1024 * 1024) {
      throw new Error('maxBufferSize must be at least 1MB')
    }
    if (this.config.maxRetries < 0 || this.config.maxRetries > 10) {
      throw new Error('maxRetries must be between 0 and 10')
    }
  }

  checkTimeout(streamId: string, lastChunkTime: number): boolean {
    const now = Date.now()
    const elapsed = now - lastChunkTime

    if (elapsed > this.config.chunkTimeoutMs) {
      this.timeoutCount++
      this.recordError()
      return true
    }

    return false
  }

  checkBufferOverflow(buffer: CircularBuffer | null, usedBytes: number): boolean {
    if (!buffer) return false

    if (usedBytes > this.config.maxBufferSize) {
      this.overflowCount++
      this.recordError()
      return true
    }

    const bufferStats = buffer.getStats()
    if (bufferStats.fillPercentage > 95) {
      return true
    }

    return false
  }

  checkCircuitBreaker(): boolean {
    if (!this.circuitBreakerOpen) {
      return false
    }

    const now = Date.now()
    const circuitBreakerAge = now - this.circuitBreakerOpenTime

    if (circuitBreakerAge > this.config.circuitBreakerResetMs) {
      this.resetCircuitBreaker()
      return false
    }

    return true
  }

  private recordError(): void {
    this.errorCount++

    if (this.errorCount >= this.config.circuitBreakerThreshold) {
      this.circuitBreakerOpen = true
      this.circuitBreakerOpenTime = Date.now()
    }
  }

  private resetCircuitBreaker(): void {
    this.circuitBreakerOpen = false
    this.errorCount = 0
  }

  setStreamTimeout(streamId: string, callback: () => void): void {
    if (this.streamTimeouts.has(streamId)) {
      clearTimeout(this.streamTimeouts.get(streamId)!)
    }

    const timeout = setTimeout(() => {
      this.timeoutCount++
      this.recordError()
      callback()
      this.streamTimeouts.delete(streamId)
    }, this.config.chunkTimeoutMs)

    this.streamTimeouts.set(streamId, timeout)
  }

  clearStreamTimeout(streamId: string): void {
    const timeout = this.streamTimeouts.get(streamId)
    if (timeout) {
      clearTimeout(timeout)
      this.streamTimeouts.delete(streamId)
    }
  }

  canProcessChunk(
    stream: StreamMetadata,
    buffer: CircularBuffer | null,
    usedBytes: number
  ): {
    allowed: boolean
    reason?: string
  } {
    if (this.checkCircuitBreaker()) {
      return {
        allowed: false,
        reason: 'Circuit breaker open - temporary protection active',
      }
    }

    if (stream.retryCount >= this.config.maxRetries) {
      return {
        allowed: false,
        reason: 'Max retries exceeded',
      }
    }

    if (this.checkBufferOverflow(buffer, usedBytes)) {
      return {
        allowed: false,
        reason: 'Buffer overflow protection triggered',
      }
    }

    return { allowed: true }
  }

  getHealthStatus(): HealthStatus {
    const hasRecentError = this.errorCount > 0
    const isHealthy = !this.circuitBreakerOpen && this.errorCount < this.config.circuitBreakerThreshold

    return {
      isHealthy,
      timeoutCount: this.timeoutCount,
      overflowCount: this.overflowCount,
      errorCount: this.errorCount,
      circuitBreakerOpen: this.circuitBreakerOpen,
      lastErrorTime: hasRecentError ? Date.now() : undefined,
      recoveryNeeded: this.circuitBreakerOpen,
    }
  }

  resetStats(): void {
    this.errorCount = 0
    this.timeoutCount = 0
    this.overflowCount = 0
    this.circuitBreakerOpen = false

    for (const timeout of this.streamTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.streamTimeouts.clear()
  }

  getStats(): {
    timeouts: number
    overflows: number
    errors: number
    circuitBreakerOpen: boolean
    activeTimeouts: number
  } {
    return {
      timeouts: this.timeoutCount,
      overflows: this.overflowCount,
      errors: this.errorCount,
      circuitBreakerOpen: this.circuitBreakerOpen,
      activeTimeouts: this.streamTimeouts.size,
    }
  }

  destroy(): void {
    for (const timeout of this.streamTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.streamTimeouts.clear()
  }
}
