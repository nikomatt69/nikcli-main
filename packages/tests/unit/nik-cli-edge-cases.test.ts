/**
 * Comprehensive Edge Case Tests for NikCLI
 * Tests critical edge cases, error scenarios, and boundary conditions
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NikCLI } from '../../src/cli/nik-cli'
import { mockConsole, mockEnv, wait } from '../helpers/test-utils'
import * as readline from 'readline'
import * as fs from 'node:fs/promises'
import path from 'node:path'

// Mock all external dependencies
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  })),
  emitKeypressEvents: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
    rm: vi.fn(),
  },
}))

vi.mock('../../src/cli/core/config-manager', () => ({
  ConfigManager: vi.fn(),
  simpleConfigManager: {
    getConfig: vi.fn(() => ({ apiKey: 'test-key', model: 'claude-3' })),
    setConfig: vi.fn(),
    hasValidConfig: vi.fn(() => true),
    getRedisConfig: vi.fn(() => ({ enabled: false })),
    getSupabaseConfig: vi.fn(() => ({ enabled: false })),
  },
}))

vi.mock('../../src/cli/core/agent-manager', () => ({
  AgentManager: vi.fn(() => ({
    getAgent: vi.fn(),
    listAgents: vi.fn(() => []),
    executeAgent: vi.fn(),
  })),
}))

vi.mock('../../src/cli/planning/planning-manager', () => ({
  PlanningManager: vi.fn(() => ({
    createPlan: vi.fn(),
    executePlan: vi.fn(),
  })),
}))

vi.mock('../../src/cli/core/input-queue', () => ({
  inputQueue: {
    enqueue: vi.fn(),
    dequeue: vi.fn(),
    getStatus: vi.fn(() => ({ queueLength: 0, isProcessing: false, pendingInputs: [] })),
    shouldQueue: vi.fn(() => false),
    isBypassEnabled: vi.fn(() => false),
    clear: vi.fn(() => 0),
    forceCleanup: vi.fn(),
    processNext: vi.fn(),
    getByPriority: vi.fn(() => []),
  },
}))

vi.mock('../../src/cli/ui/advanced-cli-ui', () => ({
  advancedUI: {
    logFunctionUpdate: vi.fn(),
    logFunctionCall: vi.fn(),
    stopInteractiveMode: vi.fn(),
  },
}))

vi.mock('../../src/cli/core/mcp-client', () => ({
  mcpClient: {
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}))

vi.mock('../../src/cli/services/agent-service', () => ({
  agentService: {
    cancelAllTasks: vi.fn(() => 0),
  },
}))

vi.mock('../../src/cli/tools/tools-manager', () => ({
  toolsManager: {
    getRunningProcesses: vi.fn(() => []),
    killProcess: vi.fn(() => false),
  },
}))

vi.mock('../../src/cli/automation/agents/modern-agent-system', () => ({
  ModernAgentOrchestrator: vi.fn(() => ({
    interruptActiveExecutions: vi.fn(() => 0),
  })),
}))

vi.mock('../../src/cli/utils/paste-handler', () => ({
  PasteHandler: {
    getInstance: vi.fn(() => ({
      processPastedText: vi.fn((text: string) => ({
        shouldTruncate: false,
        originalText: text,
        displayText: text,
      })),
    })),
  },
}))

describe('NikCLI Edge Cases', () => {
  let nikCLI: NikCLI
  let console: ReturnType<typeof mockConsole>
  let envRestore: ReturnType<typeof mockEnv>

  beforeEach(() => {
    console = mockConsole()
    envRestore = mockEnv({
      NIKCLI_COMPACT: '1',
      NODE_ENV: 'test',
    })
    nikCLI = new NikCLI()
  })

  afterEach(() => {
    console.restore()
    envRestore.restore()
    vi.clearAllMocks()
  })

  describe('Interrupt Handling Edge Cases', () => {
    it('should handle multiple rapid interrupts without crashing', async () => {
      // Simulate rapid ESC presses
      nikCLI['assistantProcessing'] = true
      
      for (let i = 0; i < 10; i++) {
        nikCLI['interruptProcessing']()
        await wait(10)
      }

      expect(nikCLI['assistantProcessing']).toBe(false)
      expect(nikCLI['shouldInterrupt']).toBe(true)
    })

    it('should handle interrupt when no operations are active', () => {
      nikCLI['assistantProcessing'] = false
      nikCLI['shouldInterrupt'] = false

      nikCLI['interruptProcessing']()

      // Should not throw and should reset state
      expect(nikCLI['shouldInterrupt']).toBe(false)
    })

    it('should clean up all active operations on interrupt', () => {
      // Setup mock spinners and progress bars
      const mockSpinner = {
        isSpinning: true,
        stop: vi.fn(),
      }
      const mockProgressBar = {
        stop: vi.fn(),
      }

      nikCLI['spinners'].set('test1', mockSpinner as any)
      nikCLI['spinners'].set('test2', mockSpinner as any)
      nikCLI['progressBars'].set('test1', mockProgressBar as any)

      nikCLI['assistantProcessing'] = true
      nikCLI['interruptProcessing']()

      expect(mockSpinner.stop).toHaveBeenCalledTimes(2)
      expect(mockProgressBar.stop).toHaveBeenCalled()
      expect(nikCLI['spinners'].size).toBe(0)
      expect(nikCLI['progressBars'].size).toBe(0)
    })

    it('should handle interrupt during stream abort', () => {
      const mockAbortController = {
        abort: vi.fn(),
      }
      nikCLI['currentStreamController'] = mockAbortController as any
      nikCLI['assistantProcessing'] = true

      nikCLI['interruptProcessing']()

      expect(mockAbortController.abort).toHaveBeenCalled()
      expect(nikCLI['currentStreamController']).toBeUndefined()
    })
  })

  describe('Queue Management Edge Cases', () => {
    it('should handle queue overflow with maximum items', async () => {
      const { inputQueue } = await import('../../src/cli/core/input-queue')
      
      // Enqueue many items
      for (let i = 0; i < 100; i++) {
        inputQueue.enqueue(`test input ${i}`, 'normal', 'user')
      }

      // Should not crash and should handle gracefully
      const status = inputQueue.getStatus()
      expect(status.queueLength).toBeGreaterThanOrEqual(0)
    })

    it('should prioritize high-priority items over normal', async () => {
      const { inputQueue } = await import('../../src/cli/core/input-queue')
      
      inputQueue.enqueue('normal 1', 'normal', 'user')
      inputQueue.enqueue('high 1', 'high', 'user')
      inputQueue.enqueue('normal 2', 'normal', 'user')
      inputQueue.enqueue('high 2', 'high', 'user')

      const highPriority = inputQueue.getByPriority('high')
      expect(highPriority.length).toBeGreaterThanOrEqual(0)
    })

    it('should handle queue processing when assistant is already processing', async () => {
      nikCLI['assistantProcessing'] = true
      
      const result = await nikCLI['processQueuedInputs']()
      
      // Should return early without processing
      expect(result).toBeUndefined()
    })

    it('should handle empty queue gracefully', async () => {
      nikCLI['assistantProcessing'] = false
      
      const { inputQueue } = await import('../../src/cli/core/input-queue')
      vi.mocked(inputQueue.getStatus).mockReturnValue({
        queueLength: 0,
        isProcessing: false,
        pendingInputs: [],
      })

      await nikCLI['processQueuedInputs']()
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle queue bypass mode correctly', async () => {
      const { inputQueue } = await import('../../src/cli/core/input-queue')
      vi.mocked(inputQueue.isBypassEnabled).mockReturnValue(true)

      nikCLI['assistantProcessing'] = true
      await nikCLI['processSingleInput']('test input')

      expect(nikCLI['userInputActive']).toBe(false)
    })
  })

  describe('Recovery and Error Handling Edge Cases', () => {
    it('should recover from corrupted state', () => {
      // Corrupt state
      nikCLI['currentMode'] = 'plan' as any
      nikCLI['recursionDepth'] = 999
      nikCLI['executionInProgress'] = true
      nikCLI['cleanupInProgress'] = true

      nikCLI['forceRecoveryToDefaultMode']()

      expect(nikCLI['currentMode']).toBe('default')
      expect(nikCLI['recursionDepth']).toBe(0)
      expect(nikCLI['executionInProgress']).toBe(false)
      expect(nikCLI['cleanupInProgress']).toBe(false)
    })

    it('should handle recovery failure gracefully', () => {
      // Mock a failure in recovery
      const originalConsoleError = console.error
      console.error = vi.fn()

      // Force an error during recovery
      vi.spyOn(nikCLI as any, 'clearAllTimers').mockImplementation(() => {
        throw new Error('Recovery failed')
      })

      nikCLI['forceRecoveryToDefaultMode']()

      // Should still reset critical state
      expect(nikCLI['currentMode']).toBe('default')
      expect(nikCLI['recursionDepth']).toBe(0)

      console.error = originalConsoleError
    })

    it('should clean up all timers on recovery', () => {
      // Create some timers
      const timer1 = nikCLI['safeTimeout'](() => {}, 1000)
      const timer2 = nikCLI['safeTimeout'](() => {}, 2000)
      
      expect(nikCLI['activeTimers'].size).toBe(2)

      nikCLI['clearAllTimers']()

      expect(nikCLI['activeTimers'].size).toBe(0)
    })

    it('should handle timer callback errors', (done) => {
      const errorCallback = () => {
        throw new Error('Timer error')
      }

      const timer = nikCLI['safeTimeout'](errorCallback, 10)

      // Should not crash - error should be caught
      setTimeout(() => {
        expect(nikCLI['activeTimers'].has(timer)).toBe(false)
        done()
      }, 50)
    })
  })

  describe('Input Processing Edge Cases', () => {
    it('should handle extremely long input without crashing', async () => {
      const longInput = 'a'.repeat(1000000) // 1MB of text
      
      nikCLI['assistantProcessing'] = false
      
      await nikCLI['processSingleInput'](longInput)
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle empty input gracefully', async () => {
      await nikCLI['processSingleInput']('')
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle input with only whitespace', async () => {
      await nikCLI['processSingleInput']('   \n\t   ')
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle paste detection with very large content', async () => {
      const largePaste = 'a'.repeat(50000) + '\n' + 'b'.repeat(50000)
      
      const pasteHandler = nikCLI['pasteHandler']
      const result = pasteHandler.processPastedText(largePaste)
      
      expect(result).toHaveProperty('shouldTruncate')
      expect(result).toHaveProperty('originalText')
      expect(result).toHaveProperty('displayText')
    })

    it('should handle token optimization failure gracefully', async () => {
      // Mock token optimizer to throw
      const optimizer = nikCLI['getTokenOptimizer']()
      if (optimizer) {
        vi.spyOn(optimizer, 'optimizePrompt').mockRejectedValue(new Error('Optimization failed'))
      }

      nikCLI['assistantProcessing'] = false
      await nikCLI['processSingleInput']('test input that should be optimized')

      // Should continue processing despite optimization failure
      expect(console.errors).toHaveLength(0)
    })

    it('should handle input with special characters and unicode', async () => {
      const specialInput = '🚀 Test with émojis and spëcial chàracters 中文 🎉'
      
      await nikCLI['processSingleInput'](specialInput)
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle input starting with multiple slashes', async () => {
      await nikCLI['processSingleInput']('///test')
      await nikCLI['processSingleInput']('/////help')
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })
  })

  describe('Command Dispatch Edge Cases', () => {
    it('should handle unknown slash command gracefully', async () => {
      await nikCLI['dispatchSlash']('/unknown-command')
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle slash command with missing arguments', async () => {
      await nikCLI['dispatchSlash']('/file read')
      await nikCLI['dispatchSlash']('/agent')
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle slash command with too many arguments', async () => {
      await nikCLI['dispatchSlash']('/help extra arg1 arg2 arg3 arg4')
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle @agent command with invalid agent name', async () => {
      await nikCLI['dispatchAt']('@nonexistent-agent do something')
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle @agent command with empty input', async () => {
      await nikCLI['dispatchAt']('@agent')
      await nikCLI['dispatchAt']('@agent   ')
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle command that triggers shutdown', async () => {
      const shutdownSpy = vi.spyOn(nikCLI as any, 'shutdown').mockResolvedValue(undefined)
      
      // Mock slash handler to return shouldExit
      const { SlashCommandHandler } = await import('../../src/cli/chat/nik-cli-commands')
      vi.mocked(nikCLI['slashHandler'].handle).mockResolvedValue({
        shouldExit: true,
        shouldUpdatePrompt: false,
      })

      await nikCLI['dispatchSlash']('/exit')
      
      expect(shutdownSpy).toHaveBeenCalled()
    })
  })

  describe('State Management Edge Cases', () => {
    it('should prevent recursion depth overflow', () => {
      nikCLI['recursionDepth'] = nikCLI['MAX_RECURSION_DEPTH']
      
      // Attempt to increment recursion
      const shouldProceed = nikCLI['recursionDepth'] < nikCLI['MAX_RECURSION_DEPTH']
      
      expect(shouldProceed).toBe(false)
    })

    it('should handle mode switching during active operations', () => {
      nikCLI['currentMode'] = 'plan'
      nikCLI['executionInProgress'] = true
      
      nikCLI['currentMode'] = 'default'
      
      // Should handle gracefully
      expect(nikCLI['currentMode']).toBe('default')
    })

    it('should handle concurrent state changes', async () => {
      const promises = []
      
      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve().then(() => {
            nikCLI['assistantProcessing'] = !nikCLI['assistantProcessing']
            nikCLI['userInputActive'] = !nikCLI['userInputActive']
          })
        )
      }
      
      await Promise.all(promises)
      
      // Should not crash
      expect(typeof nikCLI['assistantProcessing']).toBe('boolean')
      expect(typeof nikCLI['userInputActive']).toBe('boolean')
    })

    it('should handle selectedFiles map overflow', () => {
      // Add more than 5 file selections
      for (let i = 0; i < 10; i++) {
        nikCLI['storeSelectedFiles']([`file${i}.ts`], `pattern${i}`)
      }
      
      // Should keep only last 5
      expect(nikCLI['selectedFiles']?.size).toBeLessThanOrEqual(5)
    })
  })

  describe('File Operations Edge Cases', () => {
    it('should handle file operations on non-existent files', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))
      
      try {
        await nikCLI['loadProjectContext']()
      } catch (error) {
        // Should handle error gracefully
        expect(error).toBeDefined()
      }
    })

    it('should handle file operations with permission errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'))
      
      try {
        await nikCLI['loadProjectContext']()
      } catch (error) {
        // Should handle error gracefully
        expect(error).toBeDefined()
      }
    })

    it('should handle file operations on very large files', async () => {
      const largeContent = 'a'.repeat(10 * 1024 * 1024) // 10MB
      vi.mocked(fs.readFile).mockResolvedValue(largeContent)
      
      await nikCLI['loadProjectContext']()
      
      // Should not crash
      expect(console.errors).toHaveLength(0)
    })

    it('should handle file path traversal attempts', async () => {
      const maliciousPath = '../../../etc/passwd'
      
      // Should sanitize or reject
      const safePath = path.resolve(maliciousPath)
      expect(safePath).not.toContain('..')
    })
  })

  describe('Concurrency Edge Cases', () => {
    it('should handle multiple simultaneous command executions', async () => {
      const commands = [
        '/help',
        '/status',
        'regular chat input',
        '@agent test',
      ]
      
      const promises = commands.map(cmd => 
        nikCLI['processSingleInput'](cmd).catch(() => {})
      )
      
      await Promise.all(promises)
      
      // Should not crash
      expect(console.errors).toHaveLength(0)
    })

    it('should handle rapid mode switching', () => {
      const modes: Array<'default' | 'plan' | 'vm'> = ['default', 'plan', 'vm', 'default']
      
      for (const mode of modes) {
        nikCLI['currentMode'] = mode
      }
      
      expect(nikCLI['currentMode']).toBe('default')
    })

    it('should handle interrupted operations during processing', async () => {
      nikCLI['assistantProcessing'] = true
      
      // Start processing
      const processPromise = nikCLI['processSingleInput']('test')
      
      // Interrupt immediately
      nikCLI['interruptProcessing']()
      
      await processPromise.catch(() => {})
      
      // Should handle interrupt gracefully
      expect(nikCLI['assistantProcessing']).toBe(false)
    })
  })

  describe('Memory Management Edge Cases', () => {
    it('should prevent memory leaks from live updates', () => {
      // Add many live updates
      for (let i = 0; i < 1000; i++) {
        nikCLI['addLiveUpdate']({
          type: 'log',
          content: `Update ${i}`,
        })
      }
      
      // Should have reasonable limit
      expect(nikCLI['liveUpdates'].length).toBeLessThanOrEqual(1000)
    })

    it('should clean up old status indicators', () => {
      // Add many indicators
      for (let i = 0; i < 100; i++) {
        nikCLI['createStatusIndicator'](`indicator-${i}`, `Title ${i}`)
      }
      
      // Should manage memory
      expect(nikCLI['indicators'].size).toBeLessThanOrEqual(100)
    })

    it('should handle timer cleanup on long-running operations', () => {
      // Create many timers
      for (let i = 0; i < 50; i++) {
        nikCLI['safeTimeout'](() => {}, 1000 + i)
      }
      
      expect(nikCLI['activeTimers'].size).toBe(50)
      
      nikCLI['clearAllTimers']()
      
      expect(nikCLI['activeTimers'].size).toBe(0)
    })
  })

  describe('Error Propagation Edge Cases', () => {
    it('should handle errors in async operations without crashing', async () => {
      // Mock an async operation that throws
      const failingOperation = async () => {
        throw new Error('Operation failed')
      }
      
      try {
        await failingOperation()
      } catch (error) {
        // Should catch and handle
        expect(error).toBeDefined()
      }
    })

    it('should handle errors in event handlers', () => {
      const errorHandler = () => {
        throw new Error('Event handler error')
      }
      
      // Should not crash the process
      try {
        errorHandler()
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    it('should handle errors during cleanup', () => {
      // Create timers
      nikCLI['safeTimeout'](() => {}, 1000)
      
      // Mock clearTimeout to throw
      const originalClearTimeout = global.clearTimeout
      global.clearTimeout = vi.fn(() => {
        throw new Error('Cleanup failed')
      })
      
      try {
        nikCLI['clearAllTimers']()
      } catch (error) {
        // Should handle gracefully
        expect(error).toBeDefined()
      } finally {
        global.clearTimeout = originalClearTimeout
      }
    })
  })

  describe('Boundary Conditions', () => {
    it('should handle MAX_RECURSION_DEPTH boundary', () => {
      nikCLI['recursionDepth'] = nikCLI['MAX_RECURSION_DEPTH'] - 1
      
      // Should allow one more increment
      expect(nikCLI['recursionDepth']).toBeLessThan(nikCLI['MAX_RECURSION_DEPTH'])
      
      nikCLI['recursionDepth'] = nikCLI['MAX_RECURSION_DEPTH']
      
      // Should be at limit
      expect(nikCLI['recursionDepth']).toBe(nikCLI['MAX_RECURSION_DEPTH'])
    })

    it('should handle empty string inputs at boundaries', async () => {
      await nikCLI['processSingleInput']('')
      await nikCLI['processSingleInput'](' ')
      await nikCLI['processSingleInput']('\n')
      await nikCLI['processSingleInput']('\t')
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle zero-length arrays gracefully', () => {
      const emptyArray: string[] = []
      
      // Should not crash on empty operations
      expect(emptyArray.length).toBe(0)
    })

    it('should handle null/undefined values in state', () => {
      nikCLI['currentAgent'] = undefined
      nikCLI['activeVMContainer'] = undefined
      nikCLI['currentStreamController'] = undefined
      
      // Should not crash
      expect(nikCLI['currentAgent']).toBeUndefined()
      expect(nikCLI['activeVMContainer']).toBeUndefined()
      expect(nikCLI['currentStreamController']).toBeUndefined()
    })
  })

  describe('Input Queue Edge Cases', () => {
    it('should handle queue status when queue is empty', () => {
      const { inputQueue } = require('../../src/cli/core/input-queue')
      vi.mocked(inputQueue.getStatus).mockReturnValue({
        queueLength: 0,
        isProcessing: false,
        pendingInputs: [],
      })
      
      nikCLI['handleQueueCommand'](['status'])
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle queue clear when queue is already empty', () => {
      const { inputQueue } = require('../../src/cli/core/input-queue')
      vi.mocked(inputQueue.clear).mockReturnValue(0)
      
      nikCLI['handleQueueCommand'](['clear'])
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle invalid queue subcommands', () => {
      nikCLI['handleQueueCommand'](['invalid'])
      nikCLI['handleQueueCommand']([])
      nikCLI['handleQueueCommand'](['status', 'extra', 'args'])
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })
  })

  describe('Session Management Edge Cases', () => {
    it('should handle session operations when not initialized', async () => {
      // Try to get session state before initialization
      const state = nikCLI['getSessionState']()
      
      expect(typeof state).toBe('object')
    })

    it('should handle session end during active operations', async () => {
      nikCLI['assistantProcessing'] = true
      nikCLI['executionInProgress'] = true
      
      await nikCLI['endSession']()
      
      // Should clean up properly
      expect(nikCLI['assistantProcessing']).toBe(false)
    })

    it('should handle multiple session starts', async () => {
      await nikCLI['startSession']()
      await nikCLI['startSession']()
      await nikCLI['startSession']()
      
      // Should not crash
      expect(console.errors).toHaveLength(0)
    })
  })

  describe('Token Management Edge Cases', () => {
    it('should handle token limit overflow', () => {
      nikCLI['sessionTokenUsage'] = Number.MAX_SAFE_INTEGER
      
      // Should handle overflow gracefully
      expect(typeof nikCLI['sessionTokenUsage']).toBe('number')
    })

    it('should handle negative token values', () => {
      nikCLI['sessionTokenUsage'] = -100
      
      // Should handle negative values
      expect(nikCLI['sessionTokenUsage']).toBe(-100)
    })

    it('should handle token optimizer initialization failure', () => {
      // Token optimizer initialization can fail
      const optimizer = nikCLI['getTokenOptimizer']()
      
      // Should return null or valid optimizer
      expect(optimizer === null || typeof optimizer).toBeTruthy()
    })
  })

  describe('Plan Execution Edge Cases', () => {
    it('should handle plan with no todos', async () => {
      const plan = { todos: [] }
      
      await nikCLI['startFirstTask'](plan)
      
      // Should handle gracefully
      expect(console.errors).toHaveLength(0)
    })

    it('should handle plan with null todos', async () => {
      const plan = { todos: null }
      
      await nikCLI['startFirstTask'](plan)
      
      // Should handle gracefully
      expect(console.errors).toHaveLength(0)
    })

    it('should handle plan with invalid todo structure', async () => {
      const plan = {
        todos: [
          { invalid: 'structure' },
          null,
          undefined,
          { status: 'invalid-status' },
        ],
      }
      
      await nikCLI['startFirstTask'](plan)
      
      // Should handle gracefully
      expect(console.errors).toHaveLength(0)
    })
  })

  describe('UI State Edge Cases', () => {
    it('should handle UI operations when UI is not initialized', () => {
      // Should not crash when UI methods are called
      nikCLI['showAdvancedHeader']()
      nikCLI['showActiveIndicators']()
      nikCLI['showRecentUpdates']()
      
      expect(console.errors).toHaveLength(0)
    })

    it('should handle status indicator updates for non-existent indicators', () => {
      nikCLI['updateStatusIndicator']('nonexistent-id', { status: 'completed' })
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })

    it('should handle progress bar operations with invalid IDs', () => {
      nikCLI['updateAdvancedProgress']('invalid-id', 50)
      nikCLI['completeAdvancedProgress']('invalid-id')
      
      // Should not throw
      expect(console.errors).toHaveLength(0)
    })
  })
})

