/**
 * Unit tests for NikCLI - Core CLI interface
 * Updated to test actual public methods available in NikCLI class
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NikCLI } from '../../src/cli/nik-cli'
import { mockConsole } from '../helpers/test-utils'
import { EventEmitter } from 'events'

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

vi.mock('../../src/cli/core/config-manager', () => ({
  simpleConfigManager: {
    getConfig: vi.fn(() => ({ apiKey: 'test-key', model: 'claude-3' })),
    setConfig: vi.fn(),
    hasValidConfig: vi.fn(() => true),
    getRedisConfig: vi.fn(() => ({ enabled: false })),
    getSupabaseConfig: vi.fn(() => ({ enabled: false })),
  },
  ConfigManager: vi.fn(),
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
  },
}))

vi.mock('../../src/cli/ui/advanced-cli-ui', () => ({
  advancedUI: {
    logFunctionUpdate: vi.fn(),
    logFunctionCall: vi.fn(),
    stopInteractiveMode: vi.fn(),
  },
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

describe('NikCLI', () => {
  let nikCLI: NikCLI
  let console: ReturnType<typeof mockConsole>

  beforeEach(() => {
    console = mockConsole()
    nikCLI = new NikCLI()
  })

  afterEach(() => {
    console.restore()
  })

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(nikCLI).toBeInstanceOf(NikCLI)
    })

    it('should initialize without throwing errors', () => {
      expect(() => new NikCLI()).not.toThrow()
    })
  })

  describe('Public Methods - Plan HUD', () => {
    it('should show plan HUD', () => {
      expect(() => nikCLI.showPlanHud()).not.toThrow()
    })

    it('should hide plan HUD', () => {
      expect(() => nikCLI.hidePlanHud()).not.toThrow()
    })

    it('should clear plan HUD', () => {
      expect(() => nikCLI.clearPlanHud()).not.toThrow()
    })
  })

  describe('Public Methods - Prompt Management', () => {
    it('should show prompt', () => {
      expect(() => nikCLI.showPrompt()).not.toThrow()
    })

    it('should suspend prompt', () => {
      expect(() => nikCLI.suspendPrompt()).not.toThrow()
    })

    it('should resume prompt and render', () => {
      expect(() => nikCLI.resumePromptAndRender()).not.toThrow()
    })

    it('should begin panel output', () => {
      expect(() => nikCLI.beginPanelOutput()).not.toThrow()
    })

    it('should end panel output', () => {
      expect(() => nikCLI.endPanelOutput()).not.toThrow()
    })
  })

  describe('Public Methods - Token Management', () => {
    it('should get session token usage', () => {
      const usage = nikCLI.getSessionTokenUsage()
      expect(typeof usage).toBe('number')
      expect(usage).toBeGreaterThanOrEqual(0)
    })

    it('should reset session token usage', () => {
      expect(() => nikCLI.resetSessionTokenUsage()).not.toThrow()
      const usage = nikCLI.getSessionTokenUsage()
      expect(usage).toBe(0)
    })

    it('should manage toolchain tokens', () => {
      const result = nikCLI.manageToolchainTokens('test-tool', 1000)
      expect(typeof result).toBe('boolean')
    })

    it('should clear toolchain context', () => {
      expect(() => nikCLI.clearToolchainContext()).not.toThrow()
      expect(() => nikCLI.clearToolchainContext('specific-tool')).not.toThrow()
    })

    it('should update token usage', () => {
      expect(() => nikCLI.updateTokenUsage(100)).not.toThrow()
      expect(() => nikCLI.updateTokenUsage(50, true)).not.toThrow()
      expect(() => nikCLI.updateTokenUsage(25, false, 'claude-3')).not.toThrow()
    })

    it('should update context tokens', () => {
      expect(() => nikCLI.updateContextTokens(500)).not.toThrow()
    })
  })

  describe('Public Methods - AI Operation Tracking', () => {
    it('should start AI operation', () => {
      expect(() => nikCLI.startAIOperation()).not.toThrow()
      expect(() => nikCLI.startAIOperation('Custom operation')).not.toThrow()
    })

    it('should stop AI operation', () => {
      nikCLI.startAIOperation()
      expect(() => nikCLI.stopAIOperation()).not.toThrow()
    })
  })

  describe('Public Methods - Tool Tracking', () => {
    it('should start tool tracking', () => {
      expect(() => nikCLI.startToolTracking()).not.toThrow()
    })

    it('should end tool tracking', () => {
      nikCLI.startToolTracking()
      expect(() => nikCLI.endToolTracking()).not.toThrow()
    })

    it('should track tool execution', () => {
      expect(() => {
        nikCLI.trackTool('test-tool', { param: 'value' }, { success: true })
      }).not.toThrow()
    })
  })

  describe('Event Handling', () => {
    it('should handle event listener registration', () => {
      const listener = vi.fn()
      // NikCLI may extend EventEmitter or have event methods
      if (typeof (nikCLI as any).on === 'function') {
        ;(nikCLI as any).on('test', listener)
        if (typeof (nikCLI as any).emit === 'function') {
          ;(nikCLI as any).emit('test', 'data')
          expect(listener).toHaveBeenCalledWith('data')
        }
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid method calls gracefully', () => {
      // Test that methods handle edge cases
      expect(() => nikCLI.clearToolchainContext()).not.toThrow()
      expect(() => nikCLI.manageToolchainTokens('', -1)).not.toThrow()
    })

    it('should handle multiple rapid calls', () => {
      for (let i = 0; i < 10; i++) {
        expect(() => nikCLI.showPrompt()).not.toThrow()
        expect(() => nikCLI.getSessionTokenUsage()).not.toThrow()
      }
    })
  })
})

