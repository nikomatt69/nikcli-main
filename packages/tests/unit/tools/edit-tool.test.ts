/**
 * Comprehensive tests for Edit Tool
 * Tests file editing, diff generation, backup creation, and edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditTool } from '../../../src/cli/tools/edit-tool'
import { mockConsole, createTempFile, cleanup } from '../../helpers/test-utils'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

vi.mock('../../../src/cli/prompts/prompt-manager', () => ({
  PromptManager: {
    getInstance: vi.fn(() => ({
      loadPromptForContext: vi.fn().mockResolvedValue('System prompt'),
    })),
  },
}))

vi.mock('../../../src/cli/ui/diff-manager', () => ({
  diffManager: {
    addDiff: vi.fn(),
  },
}))

vi.mock('../../../src/cli/ui/advanced-cli-ui', () => ({
  advancedUI: {
    logInfo: vi.fn(),
    logSuccess: vi.fn(),
    logError: vi.fn(),
  },
}))

describe('EditTool', () => {
  let editTool: EditTool
  let console: ReturnType<typeof mockConsole>
  let tempFiles: string[] = []
  const testDir = path.join(process.cwd(), 'test-edit-tool')

  beforeEach(async () => {
    console = mockConsole()
    await fs.mkdir(testDir, { recursive: true })
    editTool = new EditTool(testDir)
  })

  afterEach(async () => {
    console.restore()
    await cleanup([testDir, ...tempFiles])
    tempFiles = []
    vi.clearAllMocks()
  })

  describe('File Editing', () => {
    it('should edit file content', async () => {
      const filePath = path.join(testDir, 'test.txt')
      await fs.writeFile(filePath, 'Hello World')
      tempFiles.push(filePath)

      const result = await editTool.execute({
        filePath: 'test.txt',
        oldString: 'Hello',
        newString: 'Hi',
      })

      expect(result.success).toBe(true)
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('Hi World')
    })

    it('should replace all occurrences when replaceAll is true', async () => {
      const filePath = path.join(testDir, 'test.txt')
      await fs.writeFile(filePath, 'Hello Hello Hello')
      tempFiles.push(filePath)

      const result = await editTool.execute({
        filePath: 'test.txt',
        oldString: 'Hello',
        newString: 'Hi',
        replaceAll: true,
      })

      expect(result.success).toBe(true)
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('Hi Hi Hi')
    })

    it('should create backup when requested', async () => {
      const filePath = path.join(testDir, 'test.txt')
      await fs.writeFile(filePath, 'Original content')
      tempFiles.push(filePath)

      const result = await editTool.execute({
        filePath: 'test.txt',
        oldString: 'Original',
        newString: 'Modified',
        createBackup: true,
      })

      expect(result.success).toBe(true)
      expect(result.data.backupCreated).toBe(true)
      expect(result.data.backupPath).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle non-existent file', async () => {
      const result = await editTool.execute({
        filePath: 'non-existent.txt',
        oldString: '',
        newString: 'New content',
      })

      expect(result.success).toBe(true)
      const filePath = path.join(testDir, 'non-existent.txt')
      expect(await fs.access(filePath).then(() => true).catch(() => false)).toBe(true)
    })

    it('should reject when oldString equals newString', async () => {
      const filePath = path.join(testDir, 'test.txt')
      await fs.writeFile(filePath, 'Test')
      tempFiles.push(filePath)

      const result = await editTool.execute({
        filePath: 'test.txt',
        oldString: 'Test',
        newString: 'Test',
      })

      expect(result.success).toBe(false)
    })

    it('should handle empty file', async () => {
      const filePath = path.join(testDir, 'empty.txt')
      await fs.writeFile(filePath, '')
      tempFiles.push(filePath)

      const result = await editTool.execute({
        filePath: 'empty.txt',
        oldString: '',
        newString: 'New content',
      })

      expect(result.success).toBe(true)
    })

    it('should handle very large file', async () => {
      const filePath = path.join(testDir, 'large.txt')
      const largeContent = 'x'.repeat(1000000)
      await fs.writeFile(filePath, largeContent)
      tempFiles.push(filePath)

      const result = await editTool.execute({
        filePath: 'large.txt',
        oldString: 'x'.repeat(100),
        newString: 'y'.repeat(100),
      })

      expect(result.success).toBe(true)
    })

    it('should handle path traversal attempts', async () => {
      const result = await editTool.execute({
        filePath: '../../../etc/passwd',
        oldString: '',
        newString: 'hack',
      })

      expect(result.success).toBe(false)
    })

    it('should handle unicode characters', async () => {
      const filePath = path.join(testDir, 'unicode.txt')
      await fs.writeFile(filePath, '🚀 Test 中文 🎉')
      tempFiles.push(filePath)

      const result = await editTool.execute({
        filePath: 'unicode.txt',
        oldString: 'Test',
        newString: '测试',
      })

      expect(result.success).toBe(true)
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toContain('测试')
    })
  })

  describe('Preview Mode', () => {
    it('should preview changes without modifying file', async () => {
      const filePath = path.join(testDir, 'test.txt')
      await fs.writeFile(filePath, 'Original')
      tempFiles.push(filePath)

      const result = await editTool.execute({
        filePath: 'test.txt',
        oldString: 'Original',
        newString: 'Modified',
        previewOnly: true,
      })

      expect(result.success).toBe(true)
      expect(result.data.previewMode).toBe(true)
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('Original') // File should not be modified
    })
  })

  describe('Diff Generation', () => {
    it('should generate diff for changes', async () => {
      const filePath = path.join(testDir, 'test.txt')
      await fs.writeFile(filePath, 'Line 1\nLine 2\nLine 3')
      tempFiles.push(filePath)

      const result = await editTool.execute({
        filePath: 'test.txt',
        oldString: 'Line 2',
        newString: 'Line 2 Modified',
      })

      expect(result.success).toBe(true)
      expect(result.data.diff).toBeDefined()
    })
  })
})

describe('FindFilesTool', () => {
  let findTool: any
  let console: ReturnType<typeof mockConsole>
  const testDir = path.join(process.cwd(), 'test-find-tool')

  beforeEach(async () => {
    console = mockConsole()
    await fs.mkdir(testDir, { recursive: true })
    const { FindFilesTool } = require('../../../src/cli/tools/find-files-tool')
    findTool = new FindFilesTool(testDir)
  })

  afterEach(async () => {
    console.restore()
    await cleanup([testDir])
    vi.clearAllMocks()
  })

  describe('File Finding', () => {
    it('should find files by pattern', async () => {
      const file1 = path.join(testDir, 'test1.ts')
      const file2 = path.join(testDir, 'test2.ts')
      await fs.writeFile(file1, 'content1')
      await fs.writeFile(file2, 'content2')

      const result = await findTool.execute('*.ts')
      expect(result.success).toBe(true)
      expect(Array.isArray(result.data)).toBe(true)
      expect(result.data.length).toBeGreaterThanOrEqual(2)
    })

    it('should handle empty results', async () => {
      const result = await findTool.execute('*.nonexistent')
      expect(result.success).toBe(true)
      expect(result.data.length).toBe(0)
    })

    it('should handle complex patterns', async () => {
      const result = await findTool.execute('**/*.test.ts')
      expect(result.success).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle invalid patterns', async () => {
      const result = await findTool.execute('[')
      expect(result.success).toBe(false)
    })

    it('should handle path traversal attempts', async () => {
      const result = await findTool.execute('../../../**/*', { cwd: '..' })
      // Should sanitize path
      expect(result).toBeDefined()
    })
  })
})

describe('GrepTool', () => {
  let grepTool: any
  let console: ReturnType<typeof mockConsole>
  const testDir = path.join(process.cwd(), 'test-grep-tool')

  beforeEach(async () => {
    console = mockConsole()
    await fs.mkdir(testDir, { recursive: true })
    const { GrepTool } = require('../../../src/cli/tools/grep-tool')
    grepTool = new GrepTool(testDir)
  })

  afterEach(async () => {
    console.restore()
    await cleanup([testDir])
    vi.clearAllMocks()
  })

  describe('Pattern Matching', () => {
    it('should find pattern in files', async () => {
      const filePath = path.join(testDir, 'test.txt')
      await fs.writeFile(filePath, 'Hello World\nTest Pattern\nEnd')

      const result = await grepTool.execute({
        pattern: 'Pattern',
      })

      expect(result.success).toBe(true)
      expect(result.data.matches.length).toBeGreaterThan(0)
    })

    it('should handle case sensitive search', async () => {
      const filePath = path.join(testDir, 'test.txt')
      await fs.writeFile(filePath, 'Hello World\nhello world')

      const result = await grepTool.execute({
        pattern: 'Hello',
        caseSensitive: true,
      })

      expect(result.success).toBe(true)
      expect(result.data.matches.length).toBe(1)
    })

    it('should handle whole word matching', async () => {
      const filePath = path.join(testDir, 'test.txt')
      await fs.writeFile(filePath, 'test testing tested')

      const result = await grepTool.execute({
        pattern: 'test',
        wholeWord: true,
      })

      expect(result.success).toBe(true)
    })

    it('should limit results', async () => {
      const filePath = path.join(testDir, 'test.txt')
      await fs.writeFile(filePath, Array(200).fill('test').join('\n'))

      const result = await grepTool.execute({
        pattern: 'test',
        maxResults: 10,
      })

      expect(result.success).toBe(true)
      expect(result.data.matches.length).toBeLessThanOrEqual(10)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty pattern', async () => {
      const result = await grepTool.execute({
        pattern: '',
      })

      expect(result.success).toBe(false)
    })

    it('should handle regex patterns', async () => {
      const filePath = path.join(testDir, 'test.txt')
      await fs.writeFile(filePath, 'test123\nabc456')

      const result = await grepTool.execute({
        pattern: '\\d+',
        useRegex: true,
      })

      expect(result.success).toBe(true)
    })

    it('should handle context lines', async () => {
      const filePath = path.join(testDir, 'test.txt')
      await fs.writeFile(filePath, 'Line 1\nLine 2\nLine 3\nLine 4')

      const result = await grepTool.execute({
        pattern: 'Line 3',
        contextLines: 1,
      })

      expect(result.success).toBe(true)
      if (result.data.matches.length > 0) {
        expect(result.data.matches[0].beforeContext).toBeDefined()
      }
    })
  })
})


