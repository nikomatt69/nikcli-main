/**
 * Progress Tracker - Monitors streaming progress with ETA and throughput
 * Provides real-time metrics for visual feedback
 */

export interface ProgressMetrics {
  currentChunk: number
  totalChunks: number
  bytesProcessed: number
  totalBytes: number
  bufferedChunks: number
  completedChunks: number
  throughput: number // chunks/sec
  byteThroughput: number // bytes/sec
  eta: number // milliseconds
  elapsedTime: number
  percentComplete: number
  isPaused: boolean
}

export class ProgressTracker {
  private startTime: number = Date.now()
  private lastUpdateTime: number = Date.now()
  private currentChunk: number = 0
  private totalChunks: number = 0
  private bytesProcessed: number = 0
  private totalBytes: number = 0
  private bufferedChunks: number = 0
  private completedChunks: number = 0
  private windowSize: number = 10
  private chunkTimestamps: number[] = []
  private isPaused: boolean = false
  private pausedTime: number = 0
  private totalPausedDuration: number = 0

  constructor(initialTotalChunks: number = 0, initialTotalBytes: number = 0) {
    this.totalChunks = Math.max(0, initialTotalChunks)
    this.totalBytes = Math.max(0, initialTotalBytes)
  }

  track(chunkSize: number, chunks: number = 1): void {
    const now = Date.now()
    this.lastUpdateTime = now

    this.currentChunk += chunks
    this.bytesProcessed += chunkSize
    this.completedChunks += chunks

    this.chunkTimestamps.push(now)
    if (this.chunkTimestamps.length > this.windowSize) {
      this.chunkTimestamps.shift()
    }
  }

  recordBuffered(chunks: number): void {
    this.bufferedChunks += chunks
  }

  recordConsumed(chunks: number): void {
    this.bufferedChunks = Math.max(0, this.bufferedChunks - chunks)
  }

  updateTotals(totalChunks: number, totalBytes: number): void {
    this.totalChunks = Math.max(this.currentChunk, totalChunks)
    this.totalBytes = Math.max(this.bytesProcessed, totalBytes)
  }

  pause(): void {
    if (!this.isPaused) {
      this.isPaused = true
      this.pausedTime = Date.now()
    }
  }

  resume(): void {
    if (this.isPaused && this.pausedTime > 0) {
      this.totalPausedDuration += Date.now() - this.pausedTime
      this.isPaused = false
      this.pausedTime = 0
    }
  }

  getMetrics(): ProgressMetrics {
    const now = Date.now()
    const elapsedTime = now - this.startTime - this.totalPausedDuration
    const workingElapsedSeconds = Math.max(0.1, elapsedTime / 1000)

    const throughput = this.completedChunks / workingElapsedSeconds
    const byteThroughput = this.bytesProcessed / workingElapsedSeconds

    let eta = 0
    if (this.totalChunks > this.currentChunk && throughput > 0) {
      const remainingChunks = this.totalChunks - this.currentChunk
      eta = (remainingChunks / throughput) * 1000
    }

    const percentComplete = this.totalChunks > 0 ? (this.currentChunk / this.totalChunks) * 100 : 0

    return {
      currentChunk: this.currentChunk,
      totalChunks: this.totalChunks,
      bytesProcessed: this.bytesProcessed,
      totalBytes: this.totalBytes,
      bufferedChunks: this.bufferedChunks,
      completedChunks: this.completedChunks,
      throughput: Math.max(0, Math.round(throughput * 100) / 100),
      byteThroughput: Math.max(0, Math.round(byteThroughput)),
      eta: Math.max(0, Math.round(eta)),
      elapsedTime,
      percentComplete: Math.min(100, Math.max(0, Math.round(percentComplete * 100) / 100)),
      isPaused: this.isPaused,
    }
  }

  getRenderString(): string {
    const metrics = this.getMetrics()

    const progressBar = this.createProgressBar(metrics.percentComplete, 30)
    const chunkStatus = `Chunk ${metrics.currentChunk}/${metrics.totalChunks}`
    const throughputStatus = `${metrics.throughput} chunks/s | ${this.formatBytes(metrics.byteThroughput)}/s`
    const etaStatus = metrics.eta > 0 ? `ETA: ${this.formatTime(metrics.eta)}` : 'ETA: --'

    const lines = [
      progressBar,
      `${chunkStatus} (${metrics.percentComplete.toFixed(1)}%)`,
      `Throughput: ${throughputStatus} | ${etaStatus}`,
      `Buffered: ${metrics.bufferedChunks} chunks | Elapsed: ${this.formatTime(metrics.elapsedTime)}`,
    ]

    if (metrics.isPaused) {
      lines.push('[PAUSED]')
    }

    return lines.join('\n')
  }

  private createProgressBar(percentage: number, width: number = 30): string {
    const filled = Math.round((percentage / 100) * width)
    const empty = width - filled
    const bar = '[' + '='.repeat(filled) + ' '.repeat(empty) + ']'
    return bar
  }

  private formatTime(ms: number): string {
    if (ms < 0) return '--'

    const seconds = Math.floor((ms / 1000) % 60)
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
    const hours = Math.floor(ms / (1000 * 60 * 60))

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }
    return `${seconds}s`
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let value = bytes
    let unitIndex = 0

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex++
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`
  }

  reset(): void {
    this.startTime = Date.now()
    this.lastUpdateTime = Date.now()
    this.currentChunk = 0
    this.bytesProcessed = 0
    this.bufferedChunks = 0
    this.completedChunks = 0
    this.chunkTimestamps = []
    this.isPaused = false
    this.pausedTime = 0
    this.totalPausedDuration = 0
  }

  getStats(): {
    currentChunk: number
    completedChunks: number
    bufferedChunks: number
    bytesProcessed: number
    elapsedMs: number
    isPaused: boolean
  } {
    const elapsedTime = Date.now() - this.startTime - this.totalPausedDuration

    return {
      currentChunk: this.currentChunk,
      completedChunks: this.completedChunks,
      bufferedChunks: this.bufferedChunks,
      bytesProcessed: this.bytesProcessed,
      elapsedMs: elapsedTime,
      isPaused: this.isPaused,
    }
  }
}
