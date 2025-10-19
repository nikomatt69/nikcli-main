/**
 * Stream Statistics Tracker
 * Lightweight metrics for streaming progress
 */

export interface StreamStats {
  chunksReceived: number;
  bytesReceived: number;
  tokensGenerated: number;
  elapsedMs: number;
  throughputBytesPerSec: number;
  parseErrors: number;
}

/**
 * Track streaming statistics without overhead
 */
export class StreamStatsTracker {
  private startTime: number = 0;
  private stats: StreamStats;
  private lastUpdateTime: number = 0;
  private sampleWindow: number[] = []; // Last 10 throughput samples

  constructor() {
    this.startTime = Date.now();
    this.stats = {
      chunksReceived: 0,
      bytesReceived: 0,
      tokensGenerated: 0,
      elapsedMs: 0,
      throughputBytesPerSec: 0,
      parseErrors: 0,
    };
  }

  /**
   * Record a processed chunk
   */
  recordChunk(bytes: number, tokens: number = 0): void {
    this.stats.chunksReceived++;
    this.stats.bytesReceived += bytes;
    this.stats.tokensGenerated += tokens;
    this.updateMetrics();
  }

  /**
   * Record parse error
   */
  recordError(): void {
    this.stats.parseErrors++;
  }

  /**
   * Update calculated metrics
   */
  private updateMetrics(): void {
    this.stats.elapsedMs = Date.now() - this.startTime;

    // Calculate throughput only every 100ms to avoid jitter
    if (Date.now() - this.lastUpdateTime >= 100) {
      const seconds = this.stats.elapsedMs / 1000;
      if (seconds > 0) {
        this.stats.throughputBytesPerSec = this.stats.bytesReceived / seconds;

        // Keep sample window
        this.sampleWindow.push(this.stats.throughputBytesPerSec);
        if (this.sampleWindow.length > 10) {
          this.sampleWindow.shift();
        }
      }

      this.lastUpdateTime = Date.now();
    }
  }

  /**
   * Get current stats
   */
  getStats(): StreamStats {
    this.updateMetrics();
    return { ...this.stats };
  }

  /**
   * Get formatted progress string
   */
  getProgressString(total?: number): string {
    const stats = this.getStats();
    const elapsedSec = (stats.elapsedMs / 1000).toFixed(1);

    if (total) {
      const pct = Math.round((stats.bytesReceived / total) * 100);
      const remaining = total - stats.bytesReceived;
      const eta = stats.throughputBytesPerSec > 0
        ? ((remaining / stats.throughputBytesPerSec) / 1000).toFixed(1)
        : '?';

      return `${pct}% • ${this.formatBytes(stats.bytesReceived)}/${this.formatBytes(total)} • ${elapsedSec}s • ETA ${eta}s`;
    }

    const throughput = this.formatBytes(stats.throughputBytesPerSec);
    return `${this.formatBytes(stats.bytesReceived)} • ${throughput}/s • ${elapsedSec}s`;
  }

  /**
   * Get compact progress bar
   */
  getProgressBar(width: number = 20, total?: number): string {
    if (!total) return '░'.repeat(width);

    const pct = Math.min(1, this.stats.bytesReceived / total);
    const filled = Math.round(pct * width);

    return '█'.repeat(filled) + '░'.repeat(width - filled);
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIdx = 0;

    while (size >= 1024 && unitIdx < units.length - 1) {
      size /= 1024;
      unitIdx++;
    }

    return size.toFixed(1) + ' ' + units[unitIdx];
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.startTime = Date.now();
    this.stats = {
      chunksReceived: 0,
      bytesReceived: 0,
      tokensGenerated: 0,
      elapsedMs: 0,
      throughputBytesPerSec: 0,
      parseErrors: 0,
    };
    this.lastUpdateTime = 0;
    this.sampleWindow = [];
  }

  /**
   * Get estimated time remaining
   */
  getETA(total: number): string {
    if (this.stats.throughputBytesPerSec === 0) return 'calculating...';

    const remaining = total - this.stats.bytesReceived;
    const secRemaining = remaining / this.stats.throughputBytesPerSec;

    if (secRemaining < 60) {
      return `${Math.round(secRemaining)}s`;
    } else if (secRemaining < 3600) {
      const min = Math.floor(secRemaining / 60);
      const sec = Math.round(secRemaining % 60);
      return `${min}m ${sec}s`;
    } else {
      const hours = Math.floor(secRemaining / 3600);
      const min = Math.floor((secRemaining % 3600) / 60);
      return `${hours}h ${min}m`;
    }
  }

  /**
   * Get average throughput
   */
  getAverageThroughput(): number {
    if (this.sampleWindow.length === 0) return 0;
    const sum = this.sampleWindow.reduce((a, b) => a + b, 0);
    return sum / this.sampleWindow.length;
  }
}

/**
 * Simple progress reporter
 */
export interface ProgressReporter {
  onProgress?(stats: StreamStats, message?: string): void;
  onComplete?(stats: StreamStats): void;
  onError?(error: Error): void;
}

/**
 * Stream processor with stats
 */
export class StreamProcessor {
  private tracker = new StreamStatsTracker();
  private reporter?: ProgressReporter;
  private reportInterval: NodeJS.Timeout | null = null;
  private totalBytes?: number;

  constructor(reporter?: ProgressReporter, totalBytes?: number) {
    this.reporter = reporter;
    this.totalBytes = totalBytes;
  }

  /**
   * Process chunk with tracking
   */
  async processChunk(chunk: string, processor: (c: string) => Promise<void>): Promise<void> {
    const bytes = Buffer.byteLength(chunk, 'utf-8');

    try {
      await processor(chunk);
      this.tracker.recordChunk(bytes);

      if (this.reporter?.onProgress) {
        const stats = this.tracker.getStats();
        const msg = this.tracker.getProgressString(this.totalBytes);
        this.reporter.onProgress(stats, msg);
      }
    } catch (error) {
      this.tracker.recordError();
      if (this.reporter?.onError) {
        this.reporter.onError(error as Error);
      }
    }
  }

  /**
   * Get stats
   */
  getStats(): StreamStats {
    return this.tracker.getStats();
  }

  /**
   * Complete processing
   */
  complete(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
    }

    if (this.reporter?.onComplete) {
      this.reporter.onComplete(this.tracker.getStats());
    }
  }

  /**
   * Reset
   */
  reset(): void {
    this.tracker.reset();
  }
}
