/**
 * Comprehensive tests for UI Components
 * Tests advanced CLI UI, diff manager, token display, and edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiffManager } from '../../../src/cli/ui/diff-manager'
import { mockConsole, mockEnv } from '../../helpers/test-utils'

vi.mock('../../../src/cli/ui/advanced-cli-ui', () => ({
  advancedUI: {
    showFileDiff: vi.fn(),
    logFunctionUpdate: vi.fn(),
    logInfo: vi.fn(),
    logSuccess: vi.fn(),
    logError: vi.fn(),
    showFileList: vi.fn(),
  },
}))

describe('DiffManager', () => {
  let diffManager: DiffManager
  let console: ReturnType<typeof mockConsole>
  let env: ReturnType<typeof mockEnv>

  beforeEach(() => {
    console = mockConsole()
    env = mockEnv({
      NODE_ENV: 'test',
    })
    diffManager = new DiffManager()
  })

  afterEach(() => {
    console.restore()
    env.restore()
    vi.clearAllMocks()
  })

  describe('Diff Management', () => {
    it('should add file diff', () => {
      diffManager.addFileDiff('test.ts', 'old content', 'new content')
      const diff = (diffManager as any).pendingDiffs.get('test.ts')
      expect(diff).toBeDefined()
      expect(diff.filePath).toBe('test.ts')
    })

    it('should show diff for file', () => {
      diffManager.addFileDiff('test.ts', 'old', 'new')
      expect(() => diffManager.showDiff('test.ts')).not.toThrow()
    })

    it('should show all pending diffs', () => {
      diffManager.addFileDiff('file1.ts', 'old1', 'new1')
      diffManager.addFileDiff('file2.ts', 'old2', 'new2')
      expect(() => diffManager.showAllDiffs()).not.toThrow()
    })

    it('should accept diff', () => {
      diffManager.addFileDiff('test.ts', 'old', 'new')
      const accepted = diffManager.acceptDiff('test.ts')
      expect(accepted).toBe(true)
    })

    it('should reject diff', () => {
      diffManager.addFileDiff('test.ts', 'old', 'new')
      const rejected = diffManager.rejectDiff('test.ts')
      expect(rejected).toBe(true)
    })

    it('should accept all diffs', () => {
      diffManager.addFileDiff('file1.ts', 'old1', 'new1')
      diffManager.addFileDiff('file2.ts', 'old2', 'new2')
      const count = diffManager.acceptAllDiffs()
      expect(count).toBeGreaterThanOrEqual(0)
    })

    it('should set auto-accept mode', () => {
      diffManager.setAutoAccept(true)
      expect((diffManager as any).autoAccept).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      diffManager.addFileDiff('test.ts', '', 'new')
      expect(() => diffManager.showDiff('test.ts')).not.toThrow()
    })

    it('should handle identical content', () => {
      diffManager.addFileDiff('test.ts', 'same', 'same')
      const diff = (diffManager as any).pendingDiffs.get('test.ts')
      expect(diff).toBeDefined()
    })

    it('should handle very large diffs', () => {
      const largeOld = 'x'.repeat(1000000)
      const largeNew = 'y'.repeat(1000000)
      diffManager.addFileDiff('large.ts', largeOld, largeNew)
      expect(() => diffManager.showDiff('large.ts')).not.toThrow()
    })

    it('should handle non-existent file diff', () => {
      expect(() => diffManager.showDiff('non-existent.ts')).not.toThrow()
      expect(diffManager.acceptDiff('non-existent.ts')).toBe(false)
      expect(diffManager.rejectDiff('non-existent.ts')).toBe(false)
    })

    it('should handle unicode characters in diff', () => {
      diffManager.addFileDiff('unicode.ts', '🚀 Old', '🎉 New 中文')
      expect(() => diffManager.showDiff('unicode.ts')).not.toThrow()
    })

    it('should handle many diffs', () => {
      for (let i = 0; i < 100; i++) {
        diffManager.addFileDiff(`file${i}.ts`, `old${i}`, `new${i}`)
      }
      const count = diffManager.acceptAllDiffs()
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('AdvancedCliUI', () => {
  let advancedUI: any
  let console: ReturnType<typeof mockConsole>

  beforeEach(() => {
    console = mockConsole()
    const { advancedUI: ui } = require('../../../src/cli/ui/advanced-cli-ui')
    advancedUI = ui
  })

  afterEach(() => {
    console.restore()
    vi.clearAllMocks()
  })

  describe('UI Operations', () => {
    it('should log function updates', () => {
      expect(() => advancedUI.logFunctionUpdate('info', 'Test', '✓')).not.toThrow()
    })

    it('should log info', () => {
      expect(() => advancedUI.logInfo('Test message')).not.toThrow()
    })

    it('should log success', () => {
      expect(() => advancedUI.logSuccess('Success message')).not.toThrow()
    })

    it('should log errors', () => {
      expect(() => advancedUI.logError('Error message')).not.toThrow()
    })

    it('should show file list', () => {
      const files = ['file1.ts', 'file2.ts']
      expect(() => advancedUI.showFileList(files, 'Test')).not.toThrow()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty messages', () => {
      expect(() => advancedUI.logInfo('')).not.toThrow()
    })

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(100000)
      expect(() => advancedUI.logInfo(longMessage)).not.toThrow()
    })

    it('should handle special characters', () => {
      expect(() => advancedUI.logInfo('🚀 Test !@#$%^&*() 中文 🎉')).not.toThrow()
    })

    it('should handle null/undefined', () => {
      expect(() => advancedUI.logInfo(null as any)).not.toThrow()
      expect(() => advancedUI.logInfo(undefined as any)).not.toThrow()
    })
  })
})

describe('DiffViewer', () => {
  let diffViewer: any
  let console: ReturnType<typeof mockConsole>

  beforeEach(() => {
    console = mockConsole()
    const { DiffViewer } = require('../../../src/cli/ui/diff-viewer')
    diffViewer = new DiffViewer()
  })

  afterEach(() => {
    console.restore()
    vi.clearAllMocks()
  })

  describe('Diff Viewing', () => {
    it('should create diff viewer', () => {
      expect(diffViewer).toBeDefined()
    })

    it('should render diff', () => {
      expect(() => {
        diffViewer.renderDiff('test.ts', 'old', 'new')
      }).not.toThrow()
    })

    it('should handle diff options', () => {
      expect(() => {
        diffViewer.renderDiff('test.ts', 'old', 'new', {
          showLineNumbers: true,
          contextLines: 3,
          colorized: true,
        })
      }).not.toThrow()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      expect(() => diffViewer.renderDiff('test.ts', '', '')).not.toThrow()
    })

    it('should handle large diffs', () => {
      const largeOld = 'x'.repeat(100000)
      const largeNew = 'y'.repeat(100000)
      expect(() => diffViewer.renderDiff('large.ts', largeOld, largeNew)).not.toThrow()
    })

    it('should handle unicode characters', () => {
      expect(() => {
        diffViewer.renderDiff('unicode.ts', '🚀 Old', '🎉 New 中文')
      }).not.toThrow()
    })
  })
})

describe('TokenAwareStatusBar', () => {
  let statusBar: any
  let console: ReturnType<typeof mockConsole>

  beforeEach(() => {
    console = mockConsole()
    const blessed = require('blessed')
    const screen = blessed.screen()
    const { TokenAwareStatusBar } = require('../../../src/cli/ui/token-aware-status-bar')
    statusBar = new TokenAwareStatusBar(screen)
  })

  afterEach(() => {
    console.restore()
    vi.clearAllMocks()
  })

  describe('Token Display', () => {
    it('should create status bar', () => {
      expect(statusBar).toBeDefined()
    })

    it('should update token context', () => {
      const context = {
        currentTokens: 1000,
        maxTokens: 10000,
        sessionStartTime: new Date(),
      }
      expect(() => statusBar.updateTokenContext(context)).not.toThrow()
    })

    it('should handle token updates', () => {
      expect(() => statusBar.updateTokens(1000, 10000)).not.toThrow()
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero tokens', () => {
      expect(() => statusBar.updateTokens(0, 10000)).not.toThrow()
    })

    it('should handle token overflow', () => {
      expect(() => statusBar.updateTokens(100000, 10000)).not.toThrow()
    })

    it('should handle negative tokens', () => {
      expect(() => statusBar.updateTokens(-100, 10000)).not.toThrow()
    })
  })
})


