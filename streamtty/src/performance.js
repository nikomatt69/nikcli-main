"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalPerformanceMonitor = exports.PerformanceUtils = exports.PerformanceMonitor = void 0;
exports.trackPerformance = trackPerformance;
const events_1 = require("./events");
class PerformanceMonitor {
    constructor(config = {}, eventEmitter) {
        this.metrics = [];
        this.activeOperations = new Map();
        this.sampleCounter = 0;
        this.config = {
            enabled: true,
            thresholds: {
                parseTime: 100,
                renderTime: 50,
                memoryUsage: 100,
                chunkSize: 1024 * 1024,
                tokenCount: 1000
            },
            sampleRate: 1.0,
            maxHistorySize: 1000,
            enableWarnings: true,
            enableMemoryTracking: true,
            ...config
        };
        this.eventEmitter = eventEmitter || new events_1.StreamttyEventEmitter();
    }
    startOperation(operation, metadata) {
        if (!this.shouldSample()) {
            return '';
        }
        const operationId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const metric = {
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
    endOperation(operationId) {
        if (!operationId || !this.activeOperations.has(operationId)) {
            return null;
        }
        const metric = this.activeOperations.get(operationId);
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
    async measure(operation, fn, metadata) {
        const operationId = this.startOperation(operation, metadata);
        try {
            const result = await fn();
            this.endOperation(operationId);
            return result;
        }
        catch (error) {
            this.endOperation(operationId);
            throw error;
        }
    }
    measureSync(operation, fn, metadata) {
        const operationId = this.startOperation(operation, metadata);
        try {
            const result = fn();
            this.endOperation(operationId);
            return result;
        }
        catch (error) {
            this.endOperation(operationId);
            throw error;
        }
    }
    getStats(operation) {
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
        const slowOperations = relevantMetrics.filter(m => this.isSlowOperation(m.operation, m.duration || 0)).length;
        const memoryMetrics = relevantMetrics
            .filter(m => m.memoryAfter)
            .map(m => m.memoryAfter.heapUsed / 1024 / 1024);
        const memoryUsage = {
            current: process.memoryUsage(),
            peak: memoryMetrics.length > 0 ? Math.max(...memoryMetrics) : 0,
            average: memoryMetrics.length > 0 ? memoryMetrics.reduce((a, b) => a + b, 0) / memoryMetrics.length : 0
        };
        const recentMetrics = relevantMetrics.slice(-10);
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
    getOperationBreakdown() {
        const breakdown = {};
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
        const result = {};
        for (const [operation, data] of Object.entries(breakdown)) {
            result[operation] = {
                ...data,
                averageDuration: data.totalDuration / data.count
            };
        }
        return result;
    }
    clearMetrics() {
        this.metrics = [];
        this.activeOperations.clear();
        this.eventEmitter.emit('performance:metrics_cleared');
    }
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        this.eventEmitter.emit('performance:config_updated', this.config);
    }
    getConfig() {
        return { ...this.config };
    }
    shouldSample() {
        if (!this.config.enabled) {
            return false;
        }
        this.sampleCounter++;
        return (this.sampleCounter * this.config.sampleRate) % 1 < this.config.sampleRate;
    }
    addMetric(metric) {
        this.metrics.push(metric);
        if (this.metrics.length > this.config.maxHistorySize) {
            this.metrics = this.metrics.slice(-this.config.maxHistorySize);
        }
    }
    checkThresholds(metric) {
        if (!this.config.enableWarnings) {
            return;
        }
        const operation = metric.operation;
        const duration = metric.duration || 0;
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
    isSlowOperation(operation, duration) {
        const threshold = this.getThresholdForOperation(operation);
        return duration > threshold;
    }
    getThresholdForOperation(operation) {
        if (operation.includes('parse')) {
            return this.config.thresholds.parseTime;
        }
        if (operation.includes('render')) {
            return this.config.thresholds.renderTime;
        }
        return Math.max(this.config.thresholds.parseTime, this.config.thresholds.renderTime);
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
class PerformanceUtils {
    static formatDuration(ms) {
        if (ms < 1) {
            return `${(ms * 1000).toFixed(0)}μs`;
        }
        if (ms < 1000) {
            return `${ms.toFixed(2)}ms`;
        }
        return `${(ms / 1000).toFixed(2)}s`;
    }
    static formatMemory(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(2)}${units[unitIndex]}`;
    }
    static createReport(monitor) {
        const stats = monitor.getStats();
        const breakdown = monitor.getOperationBreakdown();
        let report = '📊 Streamtty Performance Report\n';
        report += '='.repeat(40) + '\n\n';
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
exports.PerformanceUtils = PerformanceUtils;
exports.globalPerformanceMonitor = new PerformanceMonitor();
function trackPerformance(operation, metadata) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const operationId = exports.globalPerformanceMonitor.startOperation(`${operation}_${propertyKey}`, metadata);
            try {
                const result = await originalMethod.apply(this, args);
                exports.globalPerformanceMonitor.endOperation(operationId);
                return result;
            }
            catch (error) {
                exports.globalPerformanceMonitor.endOperation(operationId);
                throw error;
            }
        };
        return descriptor;
    };
}
