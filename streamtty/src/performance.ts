/**
 * Performance Monitoring
 * 
 * This module provides lightweight performance tracking for streamtty operations,
 * including parse/render times, memory usage, and performance warnings.
 */

import { EventEmitter } from 'events';
import { StreamttyPerformanceError } from './errors';
import { StreamttyEventEmitter } from './events';

export interface PerformanceMetrics {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryBefore?: NodeJS.MemoryUsage;
  memoryAfter?: NodeJS.MemoryUsage;
  memoryDelta?: NodeJS.MemoryUsage;
  metadata?: Record<string, any>;
}

export interface PerformanceThresholds {
  parseTime: number;        // Max parse time in ms
  renderTime: number;       // Max render time in ms
  memoryUsage: number;      // Max memory usage in MB
  chunkSize: number;        // Max chunk size in bytes
  tokenCount: number;       // Max tokens per operation
}

export interface PerformanceConfig {
  enabled: boolean;
  thresholds: PerformanceThresholds;
  sampleRate: number;       // 0-1, fraction of operations to track
  maxHistorySize: number;   // Max number of metrics to keep
  enableWarnings: boolean;  // Enable performance warnings
  enableMemoryTracking: boolean; // Track memory usage
}

export class PerformanceMonitor {
  private config: PerformanceConfig;
  private metrics: PerformanceMetrics[] = [];
  private activeOperations: Map<string, PerformanceMetrics> = new Map();
  private eventEmitter: StreamttyEventEmitter;
  private sampleCounter: number = 0;

  constructor(
    config: Partial<PerformanceConfig> = {},
    eventEmitter?: StreamttyEventEmitter
  ) {
    this.config = {
      enabled: true,
      thresholds: {
        parseTime: 100,      // 100ms
        renderTime: 50,      // 50ms
        memoryUsage: 100,    // 100MB
        chunkSize: 1024 * 1024, // 1MB
        tokenCount: 1000     // 1000 tokens
      },
      sampleRate: 1.0,      // Track all operations by default
      maxHistorySize: 1000,
      enableWarnings: true,
      enableMemoryTracking: true,
      ...config
    };

    this.eventEmitter = eventEmitter || new StreamttyEventEmitter();
  }

  /**
   * Start timing an operation
   */
  startOperation(operation: string, metadata?: Record<string, any>): string {
    if (!this.shouldSample()) {
      return '';
    }

    const operationId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const metric: PerformanceMetrics = {
      operation,
      startTime: performance.now(),
      memoryBefore: this.config.enableMemoryTracking ? process.memoryUsage() : undefined,
      metadata
    };

    this.activeOperations.set(operationId, metric);
    
    this.eventEmitter.emit('performance:operation_start', {
      operationId,
      operation,
      metadata
    });

    return operationId;
  }

  /**
   * End timing an operation
   */
  endOperation(operationId: string): PerformanceMetrics | null {
    if (!operationId || !this.activeOperations.has(operationId)) {
      return null;
    }

    const metric = this.activeOperations.get(operationId)!;
    this.activeOperations.delete(operationId);

    const endTime = performance.now();
    const duration = endTime - metric.startTime;
    
    metric.endTime = endTime;
    metric.duration = duration;

    if (this.config.enableMemoryTracking) {
      metric.memoryAfter = process.memoryUsage();
      if (metric.memoryBefore && metric.memoryAfter) {
        metric.memoryDelta = {
          rss: metric.memoryAfter.rss - metric.memoryBefore.rss,
          heapTotal: metric.memoryAfter.heapTotal - metric.memoryBefore.heapTotal,
          heapUsed: metric.memoryAfter.heapUsed - metric.memoryBefore.heapUsed,
          external: metric.memoryAfter.external - metric.memoryBefore.external,
          arrayBuffers: metric.memoryAfter.arrayBuffers - metric.memoryBefore.arrayBuffers
        };
      }
    }

    this.addMetric(metric);
    this.checkThresholds(metric);

    this.eventEmitter.emit('performance:operation_end', metric);

    return metric;
  }

  /**
   * Measure a function execution
   */
  async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const operationId = this.startOperation(operation, metadata);
    
    try {
      const result = await fn();
      this.endOperation(operationId);
      return result;
    } catch (error) {
      this.endOperation(operationId);
      throw error;
    }
  }

  /**
   * Measure synchronous function execution
   */
  measureSync<T>(
    operation: string,
    fn: () => T,
    metadata?: Record<string, any>
  ): T {
    const operationId = this.startOperation(operation, metadata);
    
    try {
      const result = fn();
      this.endOperation(operationId);
      return result;
    } catch (error) {
      this.endOperation(operationId);
      throw error;
    }
  }

  /**
   * Get performance statistics
   */
  getStats(operation?: string): {
    totalOperations: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    slowOperations: number;
    memoryUsage: {
      current: NodeJS.MemoryUsage;
      peak: number;
      average: number;
    };
    recentMetrics: PerformanceMetrics[];
  } {
    const relevantMetrics = operation 
      ? this.metrics.filter(m => m.operation === operation)
      : this.metrics;

    if (relevantMetrics.length === 0) {
      return {
        totalOperations: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        slowOperations: 0,
        memoryUsage: {
          current: process.memoryUsage(),
          peak: 0,
          average: 0
        },
        recentMetrics: []
      };
    }

    const durations = relevantMetrics.map(m => m.duration || 0);
    const averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    const slowOperations = relevantMetrics.filter(m => 
      this.isSlowOperation(m.operation, m.duration || 0)
    ).length;

    const memoryMetrics = relevantMetrics
      .filter(m => m.memoryAfter)
      .map(m => m.memoryAfter!.heapUsed / 1024 / 1024); // Convert to MB

    const memoryUsage = {
      current: process.memoryUsage(),
      peak: memoryMetrics.length > 0 ? Math.max(...memoryMetrics) : 0,
      average: memoryMetrics.length > 0 ? memoryMetrics.reduce((a, b) => a + b, 0) / memoryMetrics.length : 0
    };

    const recentMetrics = relevantMetrics.slice(-10); // Last 10 operations

    return {
      totalOperations: relevantMetrics.length,
      averageDuration,
      minDuration,
      maxDuration,
      slowOperations,
      memoryUsage,
      recentMetrics
    };
  }

  /**
   * Get operation breakdown
   */
  getOperationBreakdown(): Record<string, {
    count: number;
    averageDuration: number;
    totalDuration: number;
    slowCount: number;
  }> {
    const breakdown: Record<string, {
      count: number;
      totalDuration: number;
      slowCount: number;
    }> = {};

    for (const metric of this.metrics) {
      const operation = metric.operation;
      const duration = metric.duration || 0;
      
      if (!breakdown[operation]) {
        breakdown[operation] = {
          count: 0,
          totalDuration: 0,
          slowCount: 0
        };
      }
      
      breakdown[operation].count++;
      breakdown[operation].totalDuration += duration;
      
      if (this.isSlowOperation(operation, duration)) {
        breakdown[operation].slowCount++;
      }
    }

    // Calculate averages
    const result: Record<string, {
      count: number;
      averageDuration: number;
      totalDuration: number;
      slowCount: number;
    }> = {};

    for (const [operation, data] of Object.entries(breakdown)) {
      result[operation] = {
        ...data,
        averageDuration: data.totalDuration / data.count
      };
    }

    return result;
  }

  /**
   * Clear metrics history
   */
  clearMetrics(): void {
    this.metrics = [];
    this.activeOperations.clear();
    this.eventEmitter.emit('performance:metrics_cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...config };
    this.eventEmitter.emit('performance:config_updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): PerformanceConfig {
    return { ...this.config };
  }

  /**
   * Check if operation should be sampled
   */
  private shouldSample(): boolean {
    if (!this.config.enabled) {
      return false;
    }

    this.sampleCounter++;
    return (this.sampleCounter * this.config.sampleRate) % 1 < this.config.sampleRate;
  }

  /**
   * Add metric to history
   */
  private addMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);

    // Trim history if it exceeds max size
    if (this.metrics.length > this.config.maxHistorySize) {
      this.metrics = this.metrics.slice(-this.config.maxHistorySize);
    }
  }

  /**
   * Check if operation exceeds thresholds
   */
  private checkThresholds(metric: PerformanceMetrics): void {
    if (!this.config.enableWarnings) {
      return;
    }

    const operation = metric.operation;
    const duration = metric.duration || 0;

    // Check duration thresholds
    if (this.isSlowOperation(operation, duration)) {
      this.eventEmitter.emit('performance:slow_operation', {
        operation,
        duration,
        threshold: this.getThresholdForOperation(operation),
        metadata: metric.metadata
      });

      if (this.config.enableWarnings) {
        console.warn(`⚠️ Slow ${operation} operation: ${duration.toFixed(2)}ms (threshold: ${this.getThresholdForOperation(operation)}ms)`);
      }
    }

    // Check memory thresholds
    if (metric.memoryAfter) {
      const memoryMB = metric.memoryAfter.heapUsed / 1024 / 1024;
      if (memoryMB > this.config.thresholds.memoryUsage) {
        this.eventEmitter.emit('performance:high_memory', {
          operation,
          memoryMB,
          threshold: this.config.thresholds.memoryUsage,
          memoryUsage: metric.memoryAfter
        });

        if (this.config.enableWarnings) {
          console.warn(`⚠️ High memory usage: ${memoryMB.toFixed(2)}MB (threshold: ${this.config.thresholds.memoryUsage}MB)`);
        }
      }
    }

    // Check chunk size if available
    if (metric.metadata?.chunkSize) {
      const chunkSize = metric.metadata.chunkSize;
      if (chunkSize > this.config.thresholds.chunkSize) {
        this.eventEmitter.emit('performance:large_chunk', {
          operation,
          chunkSize,
          threshold: this.config.thresholds.chunkSize,
          metadata: metric.metadata
        });
      }
    }

    // Check token count if available
    if (metric.metadata?.tokenCount) {
      const tokenCount = metric.metadata.tokenCount;
      if (tokenCount > this.config.thresholds.tokenCount) {
        this.eventEmitter.emit('performance:many_tokens', {
          operation,
          tokenCount,
          threshold: this.config.thresholds.tokenCount,
          metadata: metric.metadata
        });
      }
    }
  }

  /**
   * Check if operation is slow
   */
  private isSlowOperation(operation: string, duration: number): boolean {
    const threshold = this.getThresholdForOperation(operation);
    return duration > threshold;
  }

  /**
   * Get threshold for operation type
   */
  private getThresholdForOperation(operation: string): number {
    if (operation.includes('parse')) {
      return this.config.thresholds.parseTime;
    }
    if (operation.includes('render')) {
      return this.config.thresholds.renderTime;
    }
    return Math.max(this.config.thresholds.parseTime, this.config.thresholds.renderTime);
  }
}

/**
 * Performance utilities
 */
export class PerformanceUtils {
  /**
   * Format duration in human-readable format
   */
  static formatDuration(ms: number): string {
    if (ms < 1) {
      return `${(ms * 1000).toFixed(0)}μs`;
    }
    if (ms < 1000) {
      return `${ms.toFixed(2)}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  }

  /**
   * Format memory usage in human-readable format
   */
  static formatMemory(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)}${units[unitIndex]}`;
  }

  /**
   * Create a performance report
   */
  static createReport(monitor: PerformanceMonitor): string {
    const stats = monitor.getStats();
    const breakdown = monitor.getOperationBreakdown();
    
    let report = '📊 Streamtty Performance Report\n';
    report += '=' .repeat(40) + '\n\n';
    
    report += `Total Operations: ${stats.totalOperations}\n`;
    report += `Average Duration: ${this.formatDuration(stats.averageDuration)}\n`;
    report += `Min Duration: ${this.formatDuration(stats.minDuration)}\n`;
    report += `Max Duration: ${this.formatDuration(stats.maxDuration)}\n`;
    report += `Slow Operations: ${stats.slowOperations}\n\n`;
    
    report += 'Memory Usage:\n';
    report += `  Current: ${this.formatMemory(stats.memoryUsage.current.heapUsed)}\n`;
    report += `  Peak: ${this.formatMemory(stats.memoryUsage.peak * 1024 * 1024)}\n`;
    report += `  Average: ${this.formatMemory(stats.memoryUsage.average * 1024 * 1024)}\n\n`;
    
    report += 'Operation Breakdown:\n';
    for (const [operation, data] of Object.entries(breakdown)) {
      report += `  ${operation}:\n`;
      report += `    Count: ${data.count}\n`;
      report += `    Avg Duration: ${this.formatDuration(data.averageDuration)}\n`;
      report += `    Total Duration: ${this.formatDuration(data.totalDuration)}\n`;
      report += `    Slow Count: ${data.slowCount}\n\n`;
    }
    
    return report;
  }
}

/**
 * Global performance monitor instance
 */
export const globalPerformanceMonitor = new PerformanceMonitor();

/**
 * Decorator for automatic performance tracking
 */
export function trackPerformance(operation: string, metadata?: Record<string, any>) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      const operationId = globalPerformanceMonitor.startOperation(
        `${operation}_${propertyKey}`,
        metadata
      );

      try {
        const result = await originalMethod.apply(this, args);
        globalPerformanceMonitor.endOperation(operationId);
        return result;
      } catch (error) {
        globalPerformanceMonitor.endOperation(operationId);
        throw error;
      }
    };

    return descriptor;
  };
}
