/**
 * Custom Template
 * User-defined benchmark tasks from JSON/YAML files
 */

import fs from 'node:fs/promises'
import yaml from 'yaml'
import type { BenchmarkTask, TaskResult } from '../types'
import { BaseBenchmarkTemplate } from './base-template'

interface CustomTaskDefinition {
  id?: string
  description: string
  prompt: string
  expectedOutput?: string
  expectedKeywords?: string[]
  testCases?: Array<{
    input: string | Record<string, any>
    expectedOutput: string | any
  }>
  evaluationCriteria?: {
    minLength?: number
    maxLength?: number
    requiredPatterns?: string[]
    forbiddenPatterns?: string[]
  }
}

export class CustomTemplate extends BaseBenchmarkTemplate {
  constructor() {
    super('custom', 'Custom benchmark tasks defined by user')
  }

  async loadTasks(options?: {
    limit?: number
    difficulty?: string
    tags?: string[]
    customDataset?: string
  }): Promise<void> {
    if (!options?.customDataset) {
      throw new Error('Custom template requires customDataset path')
    }

    const ext = options.customDataset.split('.').pop()?.toLowerCase()
    let data: string

    try {
      data = await fs.readFile(options.customDataset, 'utf-8')
    } catch (error) {
      throw new Error(`Failed to read custom dataset: ${error}`)
    }

    let tasks: CustomTaskDefinition[]

    if (ext === 'json') {
      tasks = JSON.parse(data)
    } else if (ext === 'yaml' || ext === 'yml') {
      tasks = yaml.parse(data)
    } else {
      throw new Error('Custom dataset must be JSON or YAML format')
    }

    // Apply limit if specified
    if (options.limit) {
      tasks = tasks.slice(0, options.limit)
    }

    this.tasks = tasks.map((task, index) => ({
      id: task.id || `custom-${index + 1}`,
      template: 'custom' as const,
      description: task.description,
      prompt: task.prompt,
      expectedOutput: task.expectedOutput,
      testCases: task.testCases,
      metadata: {
        evaluationCriteria: task.evaluationCriteria,
        expectedKeywords: task.expectedKeywords,
      },
    }))
  }

  async executeTask(
    task: BenchmarkTask,
    modelExecutor: (prompt: string) => Promise<{
      output: string
      tokensUsed: { input: number; output: number; total: number }
      cost: number
    }>
  ): Promise<TaskResult> {
    const startTime = Date.now()
    const startMemory = this.getMemoryUsage()

    try {
      const result = await modelExecutor(task.prompt)
      const executionTime = Date.now() - startTime
      const memoryUsed = this.getMemoryUsage() - startMemory
      const cpuUsage = this.getCPUUsage()

      const evaluation = await this.evaluateOutput(task, result.output)

      return {
        taskId: task.id,
        success: evaluation.success,
        output: result.output,
        error: evaluation.error,
        executionTime,
        tokensUsed: result.tokensUsed,
        cost: result.cost,
        memoryUsed,
        cpuUsage,
        accuracy: evaluation.accuracy,
        timestamp: new Date(),
      }
    } catch (error) {
      const executionTime = Date.now() - startTime
      return {
        taskId: task.id,
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        tokensUsed: { input: 0, output: 0, total: 0 },
        cost: 0,
        memoryUsed: 0,
        cpuUsage: 0,
        timestamp: new Date(),
      }
    }
  }

  async evaluateOutput(
    task: BenchmarkTask,
    output: string
  ): Promise<{
    success: boolean
    accuracy: number
    error?: string
  }> {
    let accuracy = 0
    const errors: string[] = []

    // Check evaluation criteria
    const criteria = task.metadata?.evaluationCriteria

    if (criteria) {
      // Check length requirements
      if (criteria.minLength && output.length < criteria.minLength) {
        errors.push(`Output too short (${output.length} < ${criteria.minLength})`)
      } else if (criteria.minLength) {
        accuracy += 0.2
      }

      if (criteria.maxLength && output.length > criteria.maxLength) {
        errors.push(`Output too long (${output.length} > ${criteria.maxLength})`)
      } else if (criteria.maxLength) {
        accuracy += 0.2
      }

      // Check required patterns
      if (criteria.requiredPatterns) {
        const matched = criteria.requiredPatterns.filter((pattern: string) => new RegExp(pattern, 'i').test(output))
        const patternScore = matched.length / criteria.requiredPatterns.length
        accuracy += patternScore * 0.3

        if (patternScore < 1) {
          const missing = criteria.requiredPatterns.filter((pattern: string) => !new RegExp(pattern, 'i').test(output))
          errors.push(`Missing required patterns: ${missing.join(', ')}`)
        }
      }

      // Check forbidden patterns
      if (criteria.forbiddenPatterns) {
        const found = criteria.forbiddenPatterns.filter((pattern: string) => new RegExp(pattern, 'i').test(output))
        if (found.length > 0) {
          errors.push(`Contains forbidden patterns: ${found.join(', ')}`)
          accuracy -= 0.2
        } else {
          accuracy += 0.1
        }
      }
    }

    // Check expected keywords
    if (task.metadata?.expectedKeywords) {
      const keywords = task.metadata.expectedKeywords as string[]
      if (this.containsKeywords(output, keywords)) {
        accuracy += 0.2
      } else {
        errors.push('Missing expected keywords')
      }
    }

    // Compare with expected output if available
    if (task.expectedOutput) {
      const similarity = this.calculateSimilarity(
        this.normalizeWhitespace(output),
        this.normalizeWhitespace(task.expectedOutput)
      )
      accuracy = Math.max(accuracy, similarity)
    }

    // Ensure accuracy is between 0 and 1
    accuracy = Math.max(0, Math.min(1, accuracy))

    return {
      success: accuracy >= 0.6 && errors.length === 0,
      accuracy,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    }
  }
}
