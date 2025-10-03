/**
 * Core types and interfaces for the benchmark system
 */

export type BenchmarkStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped'

export type BenchmarkTemplate = 'swe-bench' | 'humaneval' | 'mbpp' | 'custom'

export interface BenchmarkTask {
    id: string
    template: BenchmarkTemplate
    description: string
    prompt: string
    expectedOutput?: string
    testCases?: TestCase[]
    metadata?: Record<string, any>
}

export interface TestCase {
    input: string | Record<string, any>
    expectedOutput: string | any
    description?: string
}

export interface TaskResult {
    taskId: string
    success: boolean
    output: string
    error?: string
    executionTime: number
    tokensUsed: {
        input: number
        output: number
        total: number
    }
    cost: number
    memoryUsed: number
    cpuUsage: number
    accuracy?: number
    timestamp: Date
}

export interface BenchmarkMetrics {
    // Latency metrics
    latency: {
        min: number
        max: number
        avg: number
        p50: number
        p95: number
        p99: number
        values: number[]
    }

    // Token usage
    tokens: {
        totalInput: number
        totalOutput: number
        total: number
        avgPerTask: number
    }

    // Cost tracking
    cost: {
        total: number
        avgPerTask: number
        byModel: Record<string, number>
    }

    // Success metrics
    success: {
        total: number
        passed: number
        failed: number
        rate: number
    }

    // Accuracy metrics
    accuracy: {
        avg: number
        min: number
        max: number
        values: number[]
    }

    // Resource usage
    resources: {
        memoryPeak: number
        memoryAvg: number
        cpuPeak: number
        cpuAvg: number
    }

    // Error tracking
    errors: {
        total: number
        byType: Record<string, number>
        rate: number
    }

    // Time tracking
    timing: {
        startTime: Date
        endTime?: Date
        duration?: number
        avgTaskTime: number
    }
}

export interface BenchmarkSession {
    id: string
    template: BenchmarkTemplate
    model: string
    status: BenchmarkStatus
    startTime: Date
    endTime?: Date
    totalTasks: number
    completedTasks: number
    failedTasks: number
    metrics: BenchmarkMetrics
    tasks: TaskResult[]
    config: BenchmarkConfig
    metadata?: Record<string, any>
}

export interface BenchmarkConfig {
    model: string
    template: BenchmarkTemplate
    iterations?: number
    maxConcurrency?: number
    timeout?: number
    customDataset?: string
    simulate?: boolean
    thinkTimeMs?: { min: number; max: number }
    filters?: {
        difficulty?: 'easy' | 'medium' | 'hard'
        tags?: string[]
        limit?: number
    }
}

export interface BenchmarkComparisonResult {
    sessions: [BenchmarkSession, BenchmarkSession]
    differences: {
        latencyDiff: number
        tokenDiff: number
        costDiff: number
        successRateDiff: number
        accuracyDiff: number
    }
    winner: {
        latency: string
        tokens: string
        cost: string
        successRate: string
        accuracy: string
        overall: string
    }
}

export interface ChartData {
    labels: string[]
    datasets: Array<{
        label: string
        data: number[]
        borderColor?: string
        backgroundColor?: string
    }>
}

export interface VisualizationOptions {
    format: 'terminal' | 'html' | 'png' | 'all'
    width?: number
    height?: number
    title?: string
    theme?: 'light' | 'dark'
}

