/**
 * Stream Coordinator - Manages multiple concurrent streams safely
 * Prevents resource exhaustion and ensures fair scheduling
 * Tracks stream lifecycle and priorities
 */

export type StreamState = 'idle' | 'buffering' | 'processing' | 'rendering' | 'complete' | 'error' | 'paused'

export interface StreamMetadata {
  id: string
  type: 'ai' | 'tool' | 'thinking' | 'system' | 'error' | 'user' | 'vm' | 'agent'
  state: StreamState
  priority: number
  createdAt: number
  startedAt?: number
  completedAt?: number
  totalChunks: number
  processedChunks: number
  bytesReceived: number
  error?: string
  isPaused: boolean
  retryCount: number
}

export class StreamCoordinator {
  private activeStreams: Map<string, StreamMetadata> = new Map()
  private readonly maxConcurrent: number
  private readonly maxTotalBytes: number
  private totalBytesReceived: number = 0

  constructor(maxConcurrent: number = 5, maxTotalBytes: number = 50 * 1024 * 1024) {
    if (maxConcurrent < 1 || maxConcurrent > 20) {
      throw new Error('maxConcurrent must be between 1 and 20')
    }
    if (maxTotalBytes < 1024 * 1024) {
      throw new Error('maxTotalBytes must be at least 1MB')
    }
    this.maxConcurrent = maxConcurrent
    this.maxTotalBytes = maxTotalBytes
  }

  registerStream(streamId: string, type: StreamMetadata['type'], priority: number = 5): boolean {
    if (this.activeStreams.has(streamId)) {
      console.warn(`Stream ${streamId} already registered`)
      return false
    }

    const activeCount = Array.from(this.activeStreams.values()).filter(s => s.state !== 'complete' && s.state !== 'error').length

    if (activeCount >= this.maxConcurrent) {
      return false
    }

    const metadata: StreamMetadata = {
      id: streamId,
      type,
      state: 'idle',
      priority: Math.max(0, Math.min(10, priority)),
      createdAt: Date.now(),
      totalChunks: 0,
      processedChunks: 0,
      bytesReceived: 0,
      isPaused: false,
      retryCount: 0,
    }

    this.activeStreams.set(streamId, metadata)
    return true
  }

  unregisterStream(streamId: string): boolean {
    const stream = this.activeStreams.get(streamId)
    if (!stream) return false

    this.activeStreams.delete(streamId)
    return true
  }

  updateStreamState(streamId: string, state: StreamState): boolean {
    const stream = this.activeStreams.get(streamId)
    if (!stream) return false

    const previousState = stream.state

    if (state === 'processing' && !stream.startedAt) {
      stream.startedAt = Date.now()
    }

    if ((state === 'complete' || state === 'error') && !stream.completedAt) {
      stream.completedAt = Date.now()
    }

    stream.state = state

    if (state === 'error' && stream.retryCount < 3) {
      stream.retryCount++
    }

    return true
  }

  recordChunk(streamId: string, chunkSize: number, chunks: number = 1): boolean {
    const stream = this.activeStreams.get(streamId)
    if (!stream) return false

    if (this.totalBytesReceived + chunkSize > this.maxTotalBytes) {
      return false
    }

    stream.bytesReceived += chunkSize
    stream.totalChunks += chunks
    this.totalBytesReceived += chunkSize

    return true
  }

  recordProcessedChunk(streamId: string, chunks: number = 1): boolean {
    const stream = this.activeStreams.get(streamId)
    if (!stream) return false

    stream.processedChunks += chunks
    return true
  }

  pauseStream(streamId: string): boolean {
    const stream = this.activeStreams.get(streamId)
    if (!stream) return false

    stream.isPaused = true
    stream.state = 'paused'
    return true
  }

  resumeStream(streamId: string): boolean {
    const stream = this.activeStreams.get(streamId)
    if (!stream) return false

    stream.isPaused = false
    if (stream.state === 'paused') {
      stream.state = 'processing'
    }
    return true
  }

  setStreamError(streamId: string, error: string): boolean {
    const stream = this.activeStreams.get(streamId)
    if (!stream) return false

    stream.error = error
    stream.state = 'error'
    return true
  }

  canAcceptNewStream(): boolean {
    const activeCount = Array.from(this.activeStreams.values()).filter(s => s.state !== 'complete' && s.state !== 'error').length
    return activeCount < this.maxConcurrent
  }

  getStreamMetadata(streamId: string): StreamMetadata | null {
    return this.activeStreams.get(streamId) || null
  }

  getAllStreams(): StreamMetadata[] {
    return Array.from(this.activeStreams.values())
  }

  getActiveStreams(): StreamMetadata[] {
    return Array.from(this.activeStreams.values()).filter(s => s.state !== 'complete' && s.state !== 'error')
  }

  getStreamsByPriority(): StreamMetadata[] {
    return this.getActiveStreams().sort((a, b) => b.priority - a.priority)
  }

  getStats(): {
    activeStreams: number
    totalStreams: number
    maxConcurrent: number
    totalBytesReceived: number
    maxTotalBytes: number
    bytePercentage: number
  } {
    return {
      activeStreams: this.getActiveStreams().length,
      totalStreams: this.activeStreams.size,
      maxConcurrent: this.maxConcurrent,
      totalBytesReceived: this.totalBytesReceived,
      maxTotalBytes: this.maxTotalBytes,
      bytePercentage: (this.totalBytesReceived / this.maxTotalBytes) * 100,
    }
  }

  clear(): void {
    this.activeStreams.clear()
    this.totalBytesReceived = 0
  }
}
