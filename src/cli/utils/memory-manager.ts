/**
 * MemoryManager - Manages memory-stored objects with automatic cleanup
 * Prevents memory leaks through time-based and size-based cleanup
 */
export interface MemoryManagerOptions {
  maxAge?: number // Maximum age in milliseconds
  maxSize?: number // Maximum number of items
  cleanupInterval?: number // Cleanup interval in milliseconds
}

export interface ManagedObject<T = any> {
  object: T
  timestamp: number
  key: string
}

export class MemoryManager<T = any> {
  private objects = new Map<string, ManagedObject<T>>()
  private readonly maxAge: number
  private readonly maxSize: number
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor(options: MemoryManagerOptions = {}) {
    this.maxAge = options.maxAge ?? 24 * 60 * 60 * 1000 // 24 hours
    this.maxSize = options.maxSize ?? 10000

    // Start automatic cleanup
    const cleanupInterval = options.cleanupInterval ?? 60000 // 1 minute
    this.startAutoCleanup(cleanupInterval)
  }

  /**
   * Add or update an object
   */
  add(key: string, object: T): void {
    this.objects.set(key, {
      object,
      timestamp: Date.now(),
      key,
    })

    // Trigger cleanup if size exceeded
    if (this.objects.size > this.maxSize) {
      this.cleanup()
    }
  }

  /**
   * Get an object by key
   */
  get(key: string): T | undefined {
    const entry = this.objects.get(key)
    if (!entry) return undefined

    // Check if expired
    const now = Date.now()
    if (now - entry.timestamp > this.maxAge) {
      this.objects.delete(key)
      return undefined
    }

    return entry.object
  }

  /**
   * Remove an object
   */
  remove(key: string): boolean {
    return this.objects.delete(key)
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  /**
   * Perform cleanup based on age and size
   */
  cleanup(): void {
    const now = Date.now()
    const toDelete: string[] = []

    // Time-based cleanup
    for (const [key, entry] of this.objects.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        toDelete.push(key)
      }
    }

    toDelete.forEach((key) => this.objects.delete(key))

    // Size-based cleanup - remove oldest entries
    if (this.objects.size > this.maxSize) {
      const entries = Array.from(this.objects.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)

      const excessCount = this.objects.size - this.maxSize
      entries.slice(0, excessCount).forEach(([key]) => this.objects.delete(key))
    }
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    count: number
    maxSize: number
    maxAge: number
    oldestTimestamp: number
    newestTimestamp: number
    utilizationPercent: number
  } {
    const timestamps = Array.from(this.objects.values()).map((e) => e.timestamp)

    return {
      count: this.objects.size,
      maxSize: this.maxSize,
      maxAge: this.maxAge,
      oldestTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestTimestamp: timestamps.length > 0 ? Math.max(...timestamps) : 0,
      utilizationPercent: (this.objects.size / this.maxSize) * 100,
    }
  }

  /**
   * Get all objects (for iteration)
   */
  getAll(): ManagedObject<T>[] {
    return Array.from(this.objects.values())
  }

  /**
   * Clear all objects
   */
  clear(): void {
    this.objects.clear()
  }

  /**
   * Start automatic cleanup timer
   */
  private startAutoCleanup(interval: number): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, interval)
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  /**
   * Destroy the memory manager
   */
  destroy(): void {
    this.stopAutoCleanup()
    this.clear()
  }
}
