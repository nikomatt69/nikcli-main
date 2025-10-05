/**
 * SWE-bench Template
 * Software engineering benchmark for real-world GitHub issues
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { BenchmarkTask, TaskResult } from '../types'
import { BaseBenchmarkTemplate } from './base-template'

interface SWEBenchItem {
  instance_id: string
  repo: string
  problem_statement: string
  hints_text?: string
  patch?: string
  test_patch?: string
  FAIL_TO_PASS?: string[]
  PASS_TO_PASS?: string[]
}

export class SWEBenchTemplate extends BaseBenchmarkTemplate {
  constructor() {
    super('swe-bench', 'Software Engineering Benchmark - Real-world GitHub issues')
  }

  async loadTasks(options?: { limit?: number; difficulty?: string; tags?: string[] }): Promise<void> {
    const datasetPath = path.join(process.cwd(), 'benchmarks/datasets/swe-bench-lite.json')

    try {
      // Try to load existing dataset
      const data = await fs.readFile(datasetPath, 'utf-8')
      const items: SWEBenchItem[] = JSON.parse(data)

      // Apply filters
      let filtered = items
      if (options?.limit) {
        filtered = filtered.slice(0, options.limit)
      }

      // Convert to BenchmarkTask format
      this.tasks = filtered.map((item, index) => ({
        id: `swe-bench-${index + 1}`,
        template: 'swe-bench' as const,
        description: `Fix issue in ${item.repo}`,
        prompt: this.buildPrompt(item),
        expectedOutput: item.patch,
        metadata: {
          repo: item.repo,
          instance_id: item.instance_id,
          hints: item.hints_text,
          failToPass: item.FAIL_TO_PASS,
          passToPass: item.PASS_TO_PASS,
        },
      }))
    } catch (error) {
      // If dataset doesn't exist, create sample tasks
      console.warn('SWE-bench dataset not found, creating sample tasks...')
      this.tasks = this.createSampleTasks(options?.limit || 20)
    }
  }

  private buildPrompt(item: SWEBenchItem): string {
    return `You are a software engineer tasked with fixing a GitHub issue.

Repository: ${item.repo}
Issue ID: ${item.instance_id}

Problem Statement:
${item.problem_statement}

${item.hints_text ? `Hints:\n${item.hints_text}\n` : ''}

Please provide a code fix for this issue. Include:
1. The file(s) that need to be modified
2. The specific changes needed
3. Brief explanation of the fix

Format your response as a code patch or clear instructions.`
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
    // Extract code from output
    const extractedCode = this.extractCode(output)

    // Check if output contains code
    if (!extractedCode || extractedCode.length < 10) {
      return {
        success: false,
        accuracy: 0,
        error: 'No code found in output',
      }
    }

    // Check for required elements
    const hasFileModification = /(?:file|path|modify|change|update)/i.test(output)
    const hasCodeChanges = extractedCode.length > 20
    const hasExplanation = output.length > extractedCode.length + 50

    let accuracy = 0
    if (hasFileModification) accuracy += 0.3
    if (hasCodeChanges) accuracy += 0.4
    if (hasExplanation) accuracy += 0.3

    // If expected output exists, compare similarity
    if (task.expectedOutput) {
      const similarity = this.calculateSimilarity(
        this.normalizeWhitespace(extractedCode),
        this.normalizeWhitespace(task.expectedOutput)
      )
      accuracy = Math.max(accuracy, similarity)
    }

    // Check for common issue patterns
    const hasValidStructure = this.hasValidPatchStructure(output)
    if (hasValidStructure) {
      accuracy += 0.1
    }

    accuracy = Math.min(1, accuracy)

    return {
      success: accuracy >= 0.5,
      accuracy,
    }
  }

  private hasValidPatchStructure(output: string): boolean {
    // Check for common patch indicators
    const indicators = [
      /def\s+\w+/, // Python function
      /class\s+\w+/, // Class definition
      /function\s+\w+/, // JavaScript function
      /import\s+/, // Import statement
      /from\s+\w+\s+import/, // Python import
    ]

    return indicators.some((pattern) => pattern.test(output))
  }

  private createSampleTasks(count: number): BenchmarkTask[] {
    const samples: SWEBenchItem[] = [
      {
        instance_id: 'sample-1',
        repo: 'python/cpython',
        problem_statement: 'Fix memory leak in list comprehension when exception is raised',
        hints_text: 'Check the reference counting in listcomp.c',
      },
      {
        instance_id: 'sample-2',
        repo: 'django/django',
        problem_statement: 'QuerySet.filter() with Q objects produces incorrect SQL when combined with exclude()',
        hints_text: 'Look at the query compilation logic in django.db.models.sql',
      },
      {
        instance_id: 'sample-3',
        repo: 'psf/requests',
        problem_statement: 'Session.request() does not respect verify=False when redirecting to HTTPS',
        hints_text: 'Check how redirect handling preserves SSL verification settings',
      },
      {
        instance_id: 'sample-4',
        repo: 'numpy/numpy',
        problem_statement: 'np.einsum() produces wrong results with optimize=True for certain subscripts',
        hints_text: 'Review the optimization path selection in einsum_path.py',
      },
      {
        instance_id: 'sample-5',
        repo: 'pytest-dev/pytest',
        problem_statement: 'Fixture teardown not called when test is skipped dynamically',
        hints_text: 'Check the fixture lifecycle management in fixtures.py',
      },
    ]

    return samples.slice(0, Math.min(count, samples.length)).map((item, index) => ({
      id: `swe-bench-${index + 1}`,
      template: 'swe-bench' as const,
      description: `Fix issue in ${item.repo}`,
      prompt: this.buildPrompt(item),
      metadata: {
        repo: item.repo,
        instance_id: item.instance_id,
        hints: item.hints_text,
      },
    }))
  }
}
