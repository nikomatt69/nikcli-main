/**
 * Base Template for all benchmark templates
 * Provides common functionality and interface for benchmark execution
 */

import type { BenchmarkTask, TaskResult, BenchmarkTemplate } from '../types'

export abstract class BaseBenchmarkTemplate {
    protected tasks: BenchmarkTask[] = []
    protected name: BenchmarkTemplate
    protected description: string

    constructor(name: BenchmarkTemplate, description: string) {
        this.name = name
        this.description = description
    }

    /**
     * Load and prepare benchmark tasks
     */
    abstract loadTasks(options?: {
        limit?: number
        difficulty?: string
        tags?: string[]
    }): Promise<void>

    /**
     * Execute a single task
     */
    abstract executeTask(
        task: BenchmarkTask,
        modelExecutor: (prompt: string) => Promise<{
            output: string
            tokensUsed: { input: number; output: number; total: number }
            cost: number
        }>
    ): Promise<TaskResult>

    /**
     * Evaluate task output against expected result
     */
    abstract evaluateOutput(
        task: BenchmarkTask,
        output: string
    ): Promise<{
        success: boolean
        accuracy: number
        error?: string
    }>

    /**
     * Get all loaded tasks
     */
    getTasks(): BenchmarkTask[] {
        return this.tasks
    }

    /**
     * Get template name
     */
    getName(): BenchmarkTemplate {
        return this.name
    }

    /**
     * Get template description
     */
    getDescription(): string {
        return this.description
    }

    /**
     * Get task count
     */
    getTaskCount(): number {
        return this.tasks.length
    }

    /**
     * Helper: Measure memory usage
     */
    protected getMemoryUsage(): number {
        const usage = process.memoryUsage()
        return usage.heapUsed
    }

    /**
     * Helper: Measure CPU usage
     */
    protected getCPUUsage(): number {
        const usage = process.cpuUsage()
        return (usage.user + usage.system) / 1000000 // Convert to percentage
    }

    /**
     * Helper: Calculate string similarity (Levenshtein distance)
     */
    protected calculateSimilarity(str1: string, str2: string): number {
        const matrix: number[][] = []

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i]
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1]
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    )
                }
            }
        }

        const maxLen = Math.max(str1.length, str2.length)
        if (maxLen === 0) return 1.0

        return 1 - matrix[str2.length][str1.length] / maxLen
    }

    /**
     * Helper: Extract code from markdown code blocks
     */
    protected extractCode(text: string, language?: string): string {
        const pattern = language
            ? new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\`\`\``, 'g')
            : /```[\w]*\n([\s\S]*?)```/g

        const matches = [...text.matchAll(pattern)]
        if (matches.length > 0) {
            return matches.map(m => m[1]).join('\n')
        }

        // Fallback: try inline code
        const inlinePattern = /`([^`]+)`/g
        const inlineMatches = [...text.matchAll(inlinePattern)]
        if (inlineMatches.length > 0) {
            return inlineMatches.map(m => m[1]).join('\n')
        }

        return text.trim()
    }

    /**
     * Helper: Normalize whitespace for comparison
     */
    protected normalizeWhitespace(text: string): string {
        return text.trim().replace(/\s+/g, ' ')
    }

    /**
     * Helper: Check if output contains expected keywords
     */
    protected containsKeywords(output: string, keywords: string[]): boolean {
        const lowerOutput = output.toLowerCase()
        return keywords.every(keyword => lowerOutput.includes(keyword.toLowerCase()))
    }
}

