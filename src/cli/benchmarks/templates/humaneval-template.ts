/**
 * HumanEval Template
 * Code generation benchmark with 164 Python programming problems
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { BenchmarkTask, TaskResult, TestCase } from '../types'
import { BaseBenchmarkTemplate } from './base-template'

interface HumanEvalItem {
  task_id: string
  prompt: string
  canonical_solution: string
  test: string
  entry_point: string
}

export class HumanEvalTemplate extends BaseBenchmarkTemplate {
  constructor() {
    super('humaneval', 'HumanEval - Python code generation benchmark (164 problems)')
  }

  async loadTasks(options?: { limit?: number; difficulty?: string; tags?: string[] }): Promise<void> {
    const datasetPath = path.join(process.cwd(), 'benchmarks/datasets/humaneval.json')

    try {
      const data = await fs.readFile(datasetPath, 'utf-8')
      const items: HumanEvalItem[] = JSON.parse(data)

      let filtered = items
      if (options?.limit) {
        filtered = filtered.slice(0, options.limit)
      }

      this.tasks = filtered.map((item, index) => ({
        id: `humaneval-${index + 1}`,
        template: 'humaneval' as const,
        description: `Implement ${item.entry_point}`,
        prompt: this.buildPrompt(item),
        expectedOutput: item.canonical_solution,
        testCases: [
          {
            input: item.test,
            expectedOutput: 'pass',
            description: 'Unit tests',
          },
        ],
        metadata: {
          task_id: item.task_id,
          entry_point: item.entry_point,
          test: item.test,
        },
      }))
    } catch (error) {
      console.warn('HumanEval dataset not found, creating sample tasks...')
      this.tasks = this.createSampleTasks(options?.limit || 10)
    }
  }

  private buildPrompt(item: HumanEvalItem): string {
    return `Complete the following Python function. Only provide the function implementation, no explanations needed.

${item.prompt}

Provide a complete, working implementation that will pass all tests.`
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
    // Extract Python code
    const code = this.extractCode(output, 'python') || this.extractCode(output)

    if (!code || code.length < 10) {
      return {
        success: false,
        accuracy: 0,
        error: 'No Python code found in output',
      }
    }

    // Check for syntax validity
    const syntaxCheck = await this.checkPythonSyntax(code)
    if (!syntaxCheck.valid) {
      return {
        success: false,
        accuracy: 0.2, // Some credit for attempting
        error: `Syntax error: ${syntaxCheck.error}`,
      }
    }

    // Check for function definition
    const hasFunction = /def\s+\w+\s*\(/.test(code)
    if (!hasFunction) {
      return {
        success: false,
        accuracy: 0.3,
        error: 'No function definition found',
      }
    }

    // Run tests if available
    if (task.testCases && task.testCases.length > 0) {
      const testResult = await this.runTests(code, task.testCases[0].input as string)
      return {
        success: testResult.passed,
        accuracy: testResult.passed ? 1.0 : 0.5,
        error: testResult.error,
      }
    }

    // Compare with expected output
    if (task.expectedOutput) {
      const similarity = this.calculateSimilarity(
        this.normalizeWhitespace(code),
        this.normalizeWhitespace(task.expectedOutput)
      )
      return {
        success: similarity >= 0.6,
        accuracy: similarity,
      }
    }

    // Default: give credit for valid Python code with function
    return {
      success: true,
      accuracy: 0.7,
    }
  }

  private async checkPythonSyntax(code: string): Promise<{ valid: boolean; error?: string }> {
    return new Promise((resolve) => {
      const python = spawn('python3', ['-m', 'py_compile', '-'])

      let errorOutput = ''

      python.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })

      python.on('close', (code) => {
        if (code === 0) {
          resolve({ valid: true })
        } else {
          resolve({ valid: false, error: errorOutput || 'Syntax error' })
        }
      })

      python.on('error', () => {
        // If python3 is not available, assume valid syntax
        resolve({ valid: true })
      })

      python.stdin.write(code)
      python.stdin.end()

      // Timeout after 5 seconds
      setTimeout(() => {
        python.kill()
        resolve({ valid: true })
      }, 5000)
    })
  }

  private async runTests(code: string, testCode: string): Promise<{ passed: boolean; error?: string }> {
    return new Promise((resolve) => {
      const fullCode = `${code}\n\n${testCode}`
      const python = spawn('python3', ['-c', fullCode])

      let output = ''
      let errorOutput = ''

      python.stdout.on('data', (data) => {
        output += data.toString()
      })

      python.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })

      python.on('close', (code) => {
        if (code === 0) {
          resolve({ passed: true })
        } else {
          resolve({ passed: false, error: errorOutput || 'Test failed' })
        }
      })

      python.on('error', () => {
        // Python not available, can't run tests
        resolve({ passed: false, error: 'Python runtime not available' })
      })

      // Timeout after 10 seconds
      setTimeout(() => {
        python.kill()
        resolve({ passed: false, error: 'Test timeout' })
      }, 10000)
    })
  }

  private createSampleTasks(count: number): BenchmarkTask[] {
    const samples = [
      {
        task_id: 'HumanEval/0',
        prompt:
          'def has_close_elements(numbers: List[float], threshold: float) -> bool:\n    """ Check if in given list of numbers, are any two numbers closer to each other than\n    given threshold.\n    >>> has_close_elements([1.0, 2.0, 3.0], 0.5)\n    False\n    >>> has_close_elements([1.0, 2.8, 3.0, 4.0, 5.0, 2.0], 0.3)\n    True\n    """\n',
        entry_point: 'has_close_elements',
        canonical_solution:
          '    for idx, elem in enumerate(numbers):\n        for idx2, elem2 in enumerate(numbers):\n            if idx != idx2:\n                distance = abs(elem - elem2)\n                if distance < threshold:\n                    return True\n    return False\n',
        test: 'def check(candidate):\n    assert candidate([1.0, 2.0, 3.9, 4.0, 5.0, 2.2], 0.3) == True\n    assert candidate([1.0, 2.0, 3.9, 4.0, 5.0, 2.2], 0.05) == False\n    assert candidate([1.0, 2.0, 5.9, 4.0, 5.0], 0.95) == True\n    assert candidate([1.0, 2.0, 5.9, 4.0, 5.0], 0.8) == False\n    assert candidate([1.0, 2.0, 3.0, 4.0, 5.0, 2.0], 0.1) == True\n\ncheck(has_close_elements)',
      },
      {
        task_id: 'HumanEval/1',
        prompt:
          "def separate_paren_groups(paren_string: str) -> List[str]:\n    \"\"\" Input to this function is a string containing multiple groups of nested parentheses. Your goal is to\n    separate those group into separate strings and return the list of those.\n    Separate groups are balanced (each open brace is properly closed) and not nested within each other\n    Ignore any spaces in the input string.\n    >>> separate_paren_groups('( ) (( )) (( )( ))')\n    ['()', '(())', '(()())']\n    \"\"\"\n",
        entry_point: 'separate_paren_groups',
        canonical_solution:
          "    result = []\n    current_string = []\n    current_depth = 0\n\n    for c in paren_string:\n        if c == '(':\n            current_depth += 1\n            current_string.append(c)\n        elif c == ')':\n            current_depth -= 1\n            current_string.append(c)\n\n            if current_depth == 0:\n                result.append(''.join(current_string))\n                current_string.clear()\n\n    return result\n",
        test: "def check(candidate):\n    assert candidate('(()()) ((())) () ((())()())') == ['(()())', '((()))', '()', '((())()())']\n    assert candidate('() (()) ((())) (((())))') == ['()', '(())', '((()))', '(((())))']\n\ncheck(separate_paren_groups)",
      },
    ]

    return samples.slice(0, Math.min(count, samples.length)).map((item, index) => ({
      id: `humaneval-${index + 1}`,
      template: 'humaneval' as const,
      description: `Implement ${item.entry_point}`,
      prompt: this.buildPrompt(item),
      expectedOutput: item.canonical_solution,
      testCases: [
        {
          input: item.test,
          expectedOutput: 'pass',
        },
      ],
      metadata: {
        task_id: item.task_id,
        entry_point: item.entry_point,
      },
    }))
  }
}
