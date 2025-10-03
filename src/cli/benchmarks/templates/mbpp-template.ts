/**
 * MBPP Template
 * Mostly Basic Programming Problems - 974 Python programming challenges
 */

import type { BenchmarkTask, TaskResult } from '../types'
import { BaseBenchmarkTemplate } from './base-template'
import fs from 'node:fs/promises'
import path from 'node:path'

interface MBPPItem {
	task_id: number
	text: string
	code: string
	test_list: string[]
	test_setup_code?: string
	challenge_test_list?: string[]
}

export class MBPPTemplate extends BaseBenchmarkTemplate {
	constructor() {
		super('mbpp', 'MBPP - Mostly Basic Programming Problems (974 Python challenges)')
	}

	async loadTasks(options?: {
		limit?: number
		difficulty?: string
		tags?: string[]
	}): Promise<void> {
		const datasetPath = path.join(process.cwd(), 'benchmarks/datasets/mbpp.json')

		try {
			const data = await fs.readFile(datasetPath, 'utf-8')
			const items: MBPPItem[] = JSON.parse(data)

			let filtered = items
			if (options?.limit) {
				filtered = filtered.slice(0, options.limit)
			}

			this.tasks = filtered.map((item, index) => ({
				id: `mbpp-${index + 1}`,
				template: 'mbpp' as const,
				description: item.text,
				prompt: this.buildPrompt(item),
				expectedOutput: item.code,
				testCases: item.test_list.map(test => ({
					input: test,
					expectedOutput: 'True',
				})),
				metadata: {
					task_id: item.task_id,
					test_setup: item.test_setup_code,
				},
			}))
		} catch (error) {
			console.warn('MBPP dataset not found, creating sample tasks...')
			this.tasks = this.createSampleTasks(options?.limit || 10)
		}
	}

	private buildPrompt(item: MBPPItem): string {
		return `Write a Python function that solves the following problem:

${item.text}

The function should pass these test cases:
${item.test_list.map((test, i) => `${i + 1}. ${test}`).join('\n')}

Provide only the function implementation, no explanations.`
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
		const code = this.extractCode(output, 'python') || this.extractCode(output)

		if (!code || code.length < 5) {
			return {
				success: false,
				accuracy: 0,
				error: 'No Python code found in output',
			}
		}

		// Check for function definition
		const hasFunction = /def\s+\w+\s*\(/.test(code)
		if (!hasFunction) {
			return {
				success: false,
				accuracy: 0.2,
				error: 'No function definition found',
			}
		}

		// Compare with expected solution
		let accuracy = 0.4 // Base score for having a function

		if (task.expectedOutput) {
			const similarity = this.calculateSimilarity(
				this.normalizeWhitespace(code),
				this.normalizeWhitespace(task.expectedOutput)
			)
			accuracy = Math.max(accuracy, similarity)
		}

		// Test if it contains key algorithmic elements
		const hasLogic = /if\s+|for\s+|while\s+|return\s+/.test(code)
		if (hasLogic) {
			accuracy += 0.2
		}

		accuracy = Math.min(1, accuracy)

		return {
			success: accuracy >= 0.5,
			accuracy,
		}
	}

	private createSampleTasks(count: number): BenchmarkTask[] {
		const samples: MBPPItem[] = [
			{
				task_id: 1,
				text: 'Write a function to find the minimum cost path to reach (m, n) from (0, 0) for the given cost matrix cost[][] and a position (m, n) in cost[][].',
				code: 'def min_cost(cost, m, n): \n\tc = [[0 for x in range(n)] for x in range(m)] \n\tc[0][0] = cost[0][0] \n\tfor i in range(1, m + 1): \n\t\tc[i][0] = c[i - 1][0] + cost[i][0] \n\tfor j in range(1, n + 1): \n\t\tc[0][j] = c[0][j - 1] + cost[0][j] \n\tfor i in range(1, m + 1): \n\t\tfor j in range(1, n + 1): \n\t\t\tc[i][j] = min(c[i - 1][j - 1], c[i - 1][j], c[i][j - 1]) + cost[i][j] \n\treturn c[m][n]',
				test_list: [
					'assert min_cost([[1, 2, 3], [4, 8, 2], [1, 5, 3]], 2, 2) == 8',
					'assert min_cost([[2, 3, 4], [5, 9, 3], [2, 6, 4]], 2, 2) == 12',
				],
			},
			{
				task_id: 2,
				text: 'Write a function to find the similar elements from the given two tuple lists.',
				code: 'def similar_elements(test_tup1, test_tup2):\n  res = tuple(set(test_tup1) & set(test_tup2))\n  return (res)',
				test_list: [
					'assert similar_elements((3, 4, 5, 6),(5, 7, 4, 10)) == (4, 5)',
					'assert similar_elements((1, 2, 3, 4),(5, 4, 3, 7)) == (3, 4)',
				],
			},
		]

		return samples.slice(0, Math.min(count, samples.length)).map((item, index) => ({
			id: `mbpp-${index + 1}`,
			template: 'mbpp' as const,
			description: item.text,
			prompt: this.buildPrompt(item),
			expectedOutput: item.code,
			testCases: item.test_list.map(test => ({
				input: test,
				expectedOutput: 'True',
			})),
			metadata: {
				task_id: item.task_id,
			},
		}))
	}
}

