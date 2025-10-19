/**
 * Circular Buffer for efficient stream chunk management
 * Prevents memory bloat and enables O(1) operations
 * Type-safe and thread-safe for concurrent chunk handling
 */

export interface StreamChunk {
  id: string
  type: 'ai' | 'tool' | 'thinking' | 'system' | 'error' | 'user' | 'vm' | 'agent'
  content: string
  timestamp: number
  priority: number
  isComplete: boolean
  retryCount: number
  size: number
}

export class CircularBuffer {
  private buffer: (StreamChunk | null)[]
  private head: number = 0
  private tail: number = 0
  private count: number = 0
  private readonly maxSize: number
  private totalEvicted: number = 0

  constructor(maxSize: number = 1000) {
    if (maxSize < 10 || maxSize > 10000) {
      throw new Error('CircularBuffer size must be between 10 and 10000')
    }
    this.maxSize = maxSize
    this.buffer = new Array(maxSize).fill(null)
  }

  push(chunk: StreamChunk): void {
    if (!chunk || !chunk.id || !chunk.content) {
      throw new Error('Invalid chunk: missing required fields')
    }

    if (this.count === this.maxSize) {
      this.evictOldest()
    }

    this.buffer[this.tail] = chunk
    this.tail = (this.tail + 1) % this.maxSize
    this.count++
  }

  pop(): StreamChunk | null {
    if (this.count === 0) {
      return null
    }

    const chunk = this.buffer[this.head]
    this.buffer[this.head] = null
    this.head = (this.head + 1) % this.maxSize
    this.count--

    return chunk
  }

  peek(): StreamChunk | null {
    if (this.count === 0) {
      return null
    }
    return this.buffer[this.head]
  }

  private evictOldest(): void {
    if (this.count > 0) {
      const oldChunk = this.buffer[this.head]
      if (oldChunk) {
        this.totalEvicted++
      }
      this.buffer[this.head] = null
      this.head = (this.head + 1) % this.maxSize
      this.count--
    }
  }

  isFull(): boolean {
    return this.count === this.maxSize
  }

  isEmpty(): boolean {
    return this.count === 0
  }

  getSize(): number {
    return this.count
  }

  getCapacity(): number {
    return this.maxSize
  }

  clear(): void {
    this.buffer.fill(null)
    this.head = 0
    this.tail = 0
    this.count = 0
  }

  getTotalEvicted(): number {
    return this.totalEvicted
  }

  toArray(): StreamChunk[] {
    const result: StreamChunk[] = []
    for (let i = 0; i < this.count; i++) {
      const index = (this.head + i) % this.maxSize
      const chunk = this.buffer[index]
      if (chunk) {
        result.push(chunk)
      }
    }
    return result
  }

  getStats(): {
    size: number
    capacity: number
    fillPercentage: number
    totalEvicted: number
  } {
    return {
      size: this.count,
      capacity: this.maxSize,
      fillPercentage: (this.count / this.maxSize) * 100,
      totalEvicted: this.totalEvicted,
    }
  }
}
