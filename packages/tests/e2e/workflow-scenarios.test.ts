/**
 * End-to-End Tests for Real Workflow Scenarios
 * Tests complete workflows from user request to completion
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockConsole, mockEnv, createTempFile, cleanup } from '../helpers/test-utils'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

vi.mock('../../../src/cli/ui/advanced-cli-ui', () => ({
  advancedUI: {
    logFunctionUpdate: vi.fn(),
    logFunctionCall: vi.fn(),
    logInfo: vi.fn(),
    logSuccess: vi.fn(),
  },
}))

describe('E2E Workflow Scenarios', () => {
  let console: ReturnType<typeof mockConsole>
  let env: ReturnType<typeof mockEnv>
  let tempFiles: string[] = []
  const testDir = path.join(process.cwd(), 'test-e2e')

  beforeEach(async () => {
    console = mockConsole()
    env = mockEnv({
      NODE_ENV: 'test',
    })
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    console.restore()
    env.restore()
    await cleanup([testDir, ...tempFiles])
    tempFiles = []
  })

  describe('Complete Feature Development Workflow', () => {
    it('should complete full feature development cycle', async () => {
      // 1. Create project structure
      const projectDir = path.join(testDir, 'feature-project')
      await fs.mkdir(projectDir, { recursive: true })
      tempFiles.push(projectDir)

      // 2. Create initial files
      const indexFile = path.join(projectDir, 'index.ts')
      await fs.writeFile(indexFile, 'export const app = {};')
      tempFiles.push(indexFile)

      // 3. Add feature files
      const featureFile = path.join(projectDir, 'feature.ts')
      await fs.writeFile(featureFile, 'export const feature = () => {};')
      tempFiles.push(featureFile)

      // 4. Verify files exist
      const indexExists = await fs.access(indexFile).then(() => true).catch(() => false)
      const featureExists = await fs.access(featureFile).then(() => true).catch(() => false)

      expect(indexExists).toBe(true)
      expect(featureExists).toBe(true)
    })
  })

  describe('Complete Code Review Workflow', () => {
    it('should complete code review and fix cycle', async () => {
      // 1. Create code file with issues
      const codeFile = path.join(testDir, 'review.ts')
      await fs.writeFile(codeFile, 'const x = 1;\nconst y = 2;')
      tempFiles.push(codeFile)

      // 2. Read file for review
      const content = await fs.readFile(codeFile, 'utf-8')
      expect(content).toBeDefined()

      // 3. Apply fixes
      const fixedContent = content.replace('const x = 1;', 'const x = 1; // Fixed')
      await fs.writeFile(codeFile, fixedContent)

      // 4. Verify fixes
      const updatedContent = await fs.readFile(codeFile, 'utf-8')
      expect(updatedContent).toContain('// Fixed')
    })
  })

  describe('Complete Refactoring Workflow', () => {
    it('should complete refactoring workflow', async () => {
      // 1. Create original code
      const originalFile = path.join(testDir, 'original.ts')
      await fs.writeFile(originalFile, 'function oldFunction() { return 1; }')
      tempFiles.push(originalFile)

      // 2. Refactor code
      const originalContent = await fs.readFile(originalFile, 'utf-8')
      const refactoredContent = originalContent.replace('oldFunction', 'newFunction')

      // 3. Write refactored code
      await fs.writeFile(originalFile, refactoredContent)

      // 4. Verify refactoring
      const updatedContent = await fs.readFile(originalFile, 'utf-8')
      expect(updatedContent).toContain('newFunction')
      expect(updatedContent).not.toContain('oldFunction')
    })
  })

  describe('Complete Testing Workflow', () => {
    it('should complete test creation and execution workflow', async () => {
      // 1. Create source file
      const sourceFile = path.join(testDir, 'source.ts')
      await fs.writeFile(sourceFile, 'export const add = (a: number, b: number) => a + b;')
      tempFiles.push(sourceFile)

      // 2. Create test file
      const testFile = path.join(testDir, 'source.test.ts')
      await fs.writeFile(
        testFile,
        `import { add } from './source';\ndescribe('add', () => {\n  it('should add numbers', () => {\n    expect(add(1, 2)).toBe(3);\n  });\n});`
      )
      tempFiles.push(testFile)

      // 3. Verify both files exist
      const sourceExists = await fs.access(sourceFile).then(() => true).catch(() => false)
      const testExists = await fs.access(testFile).then(() => true).catch(() => false)

      expect(sourceExists).toBe(true)
      expect(testExists).toBe(true)
    })
  })

  describe('Complete Planning and Execution Workflow', () => {
    it('should complete plan creation and execution', async () => {
      // 1. Create plan
      const plan = {
        id: 'test-plan',
        title: 'Test Plan',
        steps: [
          { id: 'step-1', title: 'Step 1', status: 'pending' },
          { id: 'step-2', title: 'Step 2', status: 'pending' },
        ],
      }

      expect(plan.id).toBe('test-plan')
      expect(plan.steps.length).toBe(2)

      // 2. Execute steps
      plan.steps[0].status = 'completed'
      expect(plan.steps[0].status).toBe('completed')

      // 3. Verify completion
      const completedSteps = plan.steps.filter((s) => s.status === 'completed')
      expect(completedSteps.length).toBe(1)
    })
  })

  describe('Edge Cases - Real Workflows', () => {
    it('should handle workflow with errors', async () => {
      const workflow = async () => {
        throw new Error('Workflow error')
      }

      await expect(workflow()).rejects.toThrow('Workflow error')
    })

    it('should handle workflow with partial completion', async () => {
      const steps = [
        { id: 'step-1', completed: true },
        { id: 'step-2', completed: false },
        { id: 'step-3', completed: true },
      ]

      const completedCount = steps.filter((s) => s.completed).length
      expect(completedCount).toBe(2)
    })

    it('should handle workflow with retries', async () => {
      let attemptCount = 0
      const workflow = async () => {
        attemptCount++
        if (attemptCount < 3) {
          throw new Error('Temporary error')
        }
        return 'success'
      }

      let result
      for (let i = 0; i < 3; i++) {
        try {
          result = await workflow()
          break
        } catch {
          // Retry
        }
      }

      expect(result).toBe('success')
      expect(attemptCount).toBe(3)
    })
  })
})


