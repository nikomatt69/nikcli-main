/**
 * Stream Batcher - Intelligent batching and debouncing for chunks
 * Combines rapid chunks into larger batches for optimal rendering performance
 * Maintains type grouping and priority ordering
 */

import type { StreamChunk } from './circular-buffer'

export interface BufferConfig {
  maxBatchSize: number
  flushIntervalMs: number
  debounceDelayMs: number
  priorityThreshold: number
  maxBatchDurationMs: number
}

export interface StreamBatch {
  id: string
  chunks: StreamChunk[]
  totalSize: number
  duration: number
  createdAt: number
  flushedAt?: number
}

const DEFAULT_CONFIG: BufferConfig = {
  maxBatchSize: 50,
  flushIntervalMs: 50,
  debounceDelayMs: 16,
  priorityThreshold: 8,
  maxBatchDurationMs: 500,
}

export class StreamBatcher {
  private currentBatch: StreamChunk[] = []
  private batchStartTime: number = Date.now()
  private flushTimer: NodeJS.Timeout | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private config: BufferConfig
  private batchId: number = 0
  private callbacks: Array<(batch: StreamBatch) => Promise<void>> = []

  constructor(config: Partial<BufferConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.validateConfig()
  }

  private validateConfig(): void {
    if (this.config.maxBatchSize < 1 || this.config.maxBatchSize > 1000) {
      throw new Error('maxBatchSize must be between 1 and 1000')
    }
    if (this.config.flushIntervalMs < 10 || this.config.flushIntervalMs > 1000) {
      throw new Error('flushIntervalMs must be between 10 and 1000')
    }
    if (this.config.debounceDelayMs < 0 || this.config.debounceDelayMs > 100) {
      throw new Error('debounceDelayMs must be between 0 and 100')
    }
  }

  addChunk(chunk: StreamChunk): void {
    if (!chunk) return

    this.currentBatch.push(chunk)

    const shouldFlush =
      this.currentBatch.length >= this.config.maxBatchSize ||
      this.shouldFlushByPriority() ||
      this.shouldFlushByTime()

    if (shouldFlush) {
      this.flush()
    } else {
      this.scheduleFlush()
    }
  }

  private shouldFlushByPriority(): boolean {
    const highPriorityChunks = this.currentBatch.filter(c => c.priority >= this.config.priorityThreshold)
    return highPriorityChunks.length > 0 && this.currentBatch.length > 1
  }

  private shouldFlushByTime(): boolean {
    const age = Date.now() - this.batchStartTime
    return age > this.config.maxBatchDurationMs && this.currentBatch.length > 0
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      if (this.currentBatch.length > 0) {
        this.flush()
      }
    }, this.config.debounceDelayMs)
  }

  async flush(): Promise<void> {
    if (this.currentBatch.length === 0) {
      return
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    const batch = this.createBatch()
    this.currentBatch = []
    this.batchStartTime = Date.now()

    try {
      for (const callback of this.callbacks) {
        await callback(batch)
      }

      batch.flushedAt = Date.now()
    } catch (error) {
      console.warn('Batch flush callback error:', error)
    }
  }

  private createBatch(): StreamBatch {
    const totalSize = this.currentBatch.reduce((sum, c) => sum + c.size, 0)

    return {
      id: `batch-${this.batchId++}-${Date.now()}`,
      chunks: [...this.currentBatch],
      totalSize,
      duration: Date.now() - this.batchStartTime,
      createdAt: Date.now(),
    }
  }

  getBatchCount(): number {
    return this.batchId
  }

  getCurrentBatchSize(): number {
    return this.currentBatch.length
  }

  getCurrentBatchTotalSize(): number {
    return this.currentBatch.reduce((sum, c) => sum + c.size, 0)
  }

  onBatch(callback: (batch: StreamBatch) => Promise<void>): void {
    this.callbacks.push(callback)
  }

  async forceFlush(): Promise<void> {
    await this.flush()
  }

  clear(): void {
    this.currentBatch = []
    this.batchStartTime = Date.now()

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    this.callbacks = []
  }

  getStats(): {
    batchesCreated: number
    currentBatchSize: number
    currentBatchTotalSize: number
  } {
    return {
      batchesCreated: this.batchId,
      currentBatchSize: this.currentBatch.length,
      currentBatchTotalSize: this.getCurrentBatchTotalSize(),
    }
  }
}
