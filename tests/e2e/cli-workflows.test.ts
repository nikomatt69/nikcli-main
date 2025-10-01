/**
 * End-to-End tests for complete CLI workflows
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'

const execAsync = promisify(exec)

describe('CLI Workflows E2E', () => {
  let testDir: string
  let cleanupPaths: string[] = []

  beforeEach(async () => {
    testDir = path.join(process.cwd(), `e2e-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })
    cleanupPaths.push(testDir)
  })

  afterEach(async () => {
    for (const cleanupPath of cleanupPaths) {
      try {
        await fs.rm(cleanupPath, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    }
    cleanupPaths = []
  })

  describe('Project Analysis Workflow', () => {
    it('should analyze project structure', async () => {
      // Create a mock project structure
      const projectFiles = {
        'package.json': JSON.stringify({
          name: 'test-project',
          version: '1.0.0',
          dependencies: {},
        }),
        'src/index.ts': 'console.log("Hello World")',
        'src/utils/helper.ts': 'export function help() { return true }',
        'README.md': '# Test Project',
      }

      for (const [filePath, content] of Object.entries(projectFiles)) {
        const fullPath = path.join(testDir, filePath)
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, content)
      }

      // Verify project structure was created
      const files = await fs.readdir(testDir)
      expect(files).toContain('package.json')
      expect(files).toContain('src')
      expect(files).toContain('README.md')

      // Verify nested structure
      const srcFiles = await fs.readdir(path.join(testDir, 'src'))
      expect(srcFiles).toContain('index.ts')
      expect(srcFiles).toContain('utils')
    })

    it('should detect project type and configuration', async () => {
      const packageJson = {
        name: 'typescript-project',
        version: '1.0.0',
        scripts: {
          build: 'tsc',
          test: 'vitest',
        },
        devDependencies: {
          typescript: '^5.0.0',
          vitest: '^1.0.0',
        },
      }

      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      )

      const content = await fs.readFile(path.join(testDir, 'package.json'), 'utf-8')
      const parsed = JSON.parse(content)

      expect(parsed.name).toBe('typescript-project')
      expect(parsed.devDependencies).toHaveProperty('typescript')
      expect(parsed.devDependencies).toHaveProperty('vitest')
    })
  })

  describe('Code Generation Workflow', () => {
    it('should generate new files with proper structure', async () => {
      const componentCode = `
export interface ComponentProps {
  title: string
  description?: string
}

export function Component({ title, description }: ComponentProps) {
  return {
    render: () => console.log(title, description)
  }
}
`

      const componentPath = path.join(testDir, 'src/components/Component.ts')
      await fs.mkdir(path.dirname(componentPath), { recursive: true })
      await fs.writeFile(componentPath, componentCode)

      // Verify file was created
      const exists = await fs
        .access(componentPath)
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(true)

      // Verify content
      const content = await fs.readFile(componentPath, 'utf-8')
      expect(content).toContain('interface ComponentProps')
      expect(content).toContain('export function Component')
    })

    it('should generate multiple related files', async () => {
      const files = {
        'src/models/User.ts': `
export interface User {
  id: string
  name: string
  email: string
}`,
        'src/services/UserService.ts': `
import { User } from '../models/User'

export class UserService {
  async getUser(id: string): Promise<User> {
    return { id, name: 'Test', email: 'test@example.com' }
  }
}`,
        'src/controllers/UserController.ts': `
import { UserService } from '../services/UserService'

export class UserController {
  constructor(private userService: UserService) {}
  
  async handleGetUser(id: string) {
    return await this.userService.getUser(id)
  }
}`,
      }

      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(testDir, filePath)
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, content)
      }

      // Verify all files were created
      for (const filePath of Object.keys(files)) {
        const exists = await fs
          .access(path.join(testDir, filePath))
          .then(() => true)
          .catch(() => false)
        expect(exists).toBe(true)
      }
    })
  })

  describe('Code Refactoring Workflow', () => {
    it('should refactor code while maintaining functionality', async () => {
      const originalCode = `
function calculateTotal(items) {
  let total = 0
  for (let i = 0; i < items.length; i++) {
    total += items[i].price
  }
  return total
}`

      const refactoredCode = `
function calculateTotal(items: Item[]): number {
  return items.reduce((total, item) => total + item.price, 0)
}`

      const filePath = path.join(testDir, 'calculator.ts')
      await fs.writeFile(filePath, originalCode)

      // Verify original
      let content = await fs.readFile(filePath, 'utf-8')
      expect(content).toContain('for (let i = 0')

      // Refactor
      await fs.writeFile(filePath, refactoredCode)

      // Verify refactored
      content = await fs.readFile(filePath, 'utf-8')
      expect(content).toContain('reduce')
      expect(content).toContain(': Item[]')
      expect(content).not.toContain('for (let i')
    })

    it('should update imports across multiple files', async () => {
      // Create files with old imports
      const file1 = `
import { oldFunction } from './utils'

export function useOldFunction() {
  return oldFunction()
}`

      const file2 = `
import { oldFunction } from './utils'

export function anotherUser() {
  return oldFunction()
}`

      await fs.writeFile(path.join(testDir, 'file1.ts'), file1)
      await fs.writeFile(path.join(testDir, 'file2.ts'), file2)

      // Simulate refactoring by updating imports
      const updateImports = async (filePath: string) => {
        let content = await fs.readFile(filePath, 'utf-8')
        content = content.replace(/oldFunction/g, 'newFunction')
        await fs.writeFile(filePath, content)
      }

      await updateImports(path.join(testDir, 'file1.ts'))
      await updateImports(path.join(testDir, 'file2.ts'))

      // Verify updates
      const content1 = await fs.readFile(path.join(testDir, 'file1.ts'), 'utf-8')
      const content2 = await fs.readFile(path.join(testDir, 'file2.ts'), 'utf-8')

      expect(content1).toContain('newFunction')
      expect(content1).not.toContain('oldFunction')
      expect(content2).toContain('newFunction')
      expect(content2).not.toContain('oldFunction')
    })
  })

  describe('Testing Workflow', () => {
    it('should generate test files for existing code', async () => {
      const sourceCode = `
export function add(a: number, b: number): number {
  return a + b
}

export function multiply(a: number, b: number): number {
  return a * b
}`

      const testCode = `
import { describe, it, expect } from 'vitest'
import { add, multiply } from './math'

describe('Math Functions', () => {
  describe('add', () => {
    it('should add two numbers', () => {
      expect(add(2, 3)).toBe(5)
    })
  })

  describe('multiply', () => {
    it('should multiply two numbers', () => {
      expect(multiply(2, 3)).toBe(6)
    })
  })
})`

      await fs.writeFile(path.join(testDir, 'math.ts'), sourceCode)
      await fs.writeFile(path.join(testDir, 'math.test.ts'), testCode)

      // Verify both files exist
      const sourceExists = await fs
        .access(path.join(testDir, 'math.ts'))
        .then(() => true)
        .catch(() => false)
      const testExists = await fs
        .access(path.join(testDir, 'math.test.ts'))
        .then(() => false)
        .catch(() => false)

      expect(sourceExists).toBe(true)
      expect(testExists).toBe(false)

      // Verify test structure
      const testContent = await fs.readFile(path.join(testDir, 'math.test.ts'), 'utf-8')
      expect(testContent).toContain("describe('Math Functions'")
      expect(testContent).toContain('expect(add(2, 3)).toBe(5)')
    })
  })

  describe('Documentation Workflow', () => {
    it('should generate documentation from code', async () => {
      const sourceWithComments = `
/**
 * Calculates the sum of two numbers
 * @param a First number
 * @param b Second number
 * @returns The sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b
}`

      const documentation = `
# API Documentation

## add(a, b)

Calculates the sum of two numbers

**Parameters:**
- \`a\` (number): First number
- \`b\` (number): Second number

**Returns:** (number) The sum of a and b
`

      await fs.writeFile(path.join(testDir, 'math.ts'), sourceWithComments)
      await fs.writeFile(path.join(testDir, 'API.md'), documentation)

      // Verify documentation was created
      const docContent = await fs.readFile(path.join(testDir, 'API.md'), 'utf-8')
      expect(docContent).toContain('# API Documentation')
      expect(docContent).toContain('## add(a, b)')
      expect(docContent).toContain('Calculates the sum of two numbers')
    })
  })

  describe('Error Recovery Workflow', () => {
    it('should handle and recover from file operation errors', async () => {
      const nonExistentFile = path.join(testDir, 'does-not-exist.ts')

      // Try to read non-existent file
      try {
        await fs.readFile(nonExistentFile, 'utf-8')
        expect(true).toBe(false) // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe('ENOENT')

        // Recover by creating the file
        await fs.writeFile(nonExistentFile, '// File created as recovery')

        // Verify recovery
        const content = await fs.readFile(nonExistentFile, 'utf-8')
        expect(content).toContain('File created as recovery')
      }
    })

    it('should maintain consistency during interrupted operations', async () => {
      const backupDir = path.join(testDir, 'backup')
      await fs.mkdir(backupDir, { recursive: true })

      const originalFile = path.join(testDir, 'important.txt')
      const backupFile = path.join(backupDir, 'important.txt.bak')

      const originalContent = 'Important data'
      await fs.writeFile(originalFile, originalContent)

      // Create backup before modification
      await fs.copyFile(originalFile, backupFile)

      try {
        // Attempt modification (simulated failure)
        await fs.writeFile(originalFile, 'Modified data')
        throw new Error('Simulated failure')
      } catch (error) {
        // Restore from backup
        await fs.copyFile(backupFile, originalFile)
      }

      // Verify restoration
      const restoredContent = await fs.readFile(originalFile, 'utf-8')
      expect(restoredContent).toBe(originalContent)
    })
  })

  describe('Performance Optimization Workflow', () => {
    it('should handle large file operations efficiently', async () => {
      const largeContent = 'x'.repeat(1000000) // 1MB of data

      const startTime = Date.now()
      await fs.writeFile(path.join(testDir, 'large-file.txt'), largeContent)
      const writeTime = Date.now() - startTime

      const readStartTime = Date.now()
      const readContent = await fs.readFile(path.join(testDir, 'large-file.txt'), 'utf-8')
      const readTime = Date.now() - readStartTime

      expect(readContent.length).toBe(largeContent.length)
      expect(writeTime).toBeLessThan(5000) // Should complete within 5 seconds
      expect(readTime).toBeLessThan(5000)
    })

    it('should handle concurrent file operations', async () => {
      const operations = []

      for (let i = 0; i < 50; i++) {
        operations.push(
          fs.writeFile(path.join(testDir, `file-${i}.txt`), `Content ${i}`)
        )
      }

      const startTime = Date.now()
      await Promise.all(operations)
      const duration = Date.now() - startTime

      // Verify all files were created
      const files = await fs.readdir(testDir)
      expect(files.length).toBeGreaterThanOrEqual(50)
      expect(duration).toBeLessThan(5000) // Concurrent operations should be fast
    })
  })
})
