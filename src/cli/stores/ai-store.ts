import type { ModelMessage } from 'ai'
import chalk from 'chalk'
import { create } from 'zustand'

/**
 * Centralized AI Store using @ai-sdk-tools/store patterns
 *
 * Provides unified state management for:
 * - Chat sessions and message history
 * - Agent orchestration state
 * - Tool execution tracking
 * - Context and RAG metrics
 * - UI panel state
 *
 * Opt-in via AI_STORE=true env variable
 */

// Type definitions
export interface ToolExecution {
  id: string
  name: string
  startTime: Date
  endTime?: Date
  success?: boolean
  output?: any
  error?: string
}

export interface AgentState {
  id: string
  mode: string
  status: 'idle' | 'active' | 'paused' | 'error'
  currentTask?: string
  executionHistory: string[]
}

export interface ChatSession {
  id: string
  messages: ModelMessage[]
  workingDirectory: string
  createdAt: Date
  agentMode?: string
  autonomous: boolean
  planMode: boolean
  autoAcceptEdits: boolean
}

export interface ContextMetrics {
  totalFiles: number
  ragAvailable: boolean
  cacheHitRate: number
  embeddingsCost: number
  lastUpdate: Date
}

export interface UIPanelState {
  showChat: boolean
  showTools: boolean
  showMetrics: boolean
  showLogs: boolean
  activePanel: 'chat' | 'tools' | 'metrics' | 'logs'
}

interface AIStoreState {
  // Chat state
  currentSession: ChatSession | null
  sessions: Map<string, ChatSession>

  // Agent state
  agents: Map<string, AgentState>
  activeAgent: string | null

  // Tool execution tracking
  activeTools: Map<string, ToolExecution>
  toolHistory: ToolExecution[]

  // Context and RAG
  contextMetrics: ContextMetrics | null

  // UI state
  uiState: UIPanelState

  // Actions - Chat
  setCurrentSession: (session: ChatSession) => void
  addMessage: (message: ModelMessage) => void
  updateMessages: (messages: ModelMessage[]) => void
  clearMessages: () => void

  // Actions - Agents
  registerAgent: (agent: AgentState) => void
  updateAgentStatus: (agentId: string, status: AgentState['status']) => void
  setActiveAgent: (agentId: string) => void

  // Actions - Tools
  startToolExecution: (tool: Omit<ToolExecution, 'id' | 'startTime'>) => string
  endToolExecution: (id: string, success: boolean, output?: any, error?: string) => void
  getActiveTools: () => ToolExecution[]

  // Actions - Context
  updateContextMetrics: (metrics: Partial<ContextMetrics>) => void

  // Actions - UI
  setUIState: (state: Partial<UIPanelState>) => void
  togglePanel: (panel: UIPanelState['activePanel']) => void

  // Utility
  getStats: () => {
    totalSessions: number
    totalMessages: number
    totalTools: number
    activeTools: number
    totalAgents: number
  }
}

export const useAIStore = create<AIStoreState>((set, get) => ({
  // Initial state
  currentSession: null,
  sessions: new Map(),
  agents: new Map(),
  activeAgent: null,
  activeTools: new Map(),
  toolHistory: [],
  contextMetrics: null,
  uiState: {
    showChat: true,
    showTools: false,
    showMetrics: false,
    showLogs: false,
    activePanel: 'chat',
  },

  // Chat actions
  setCurrentSession: (session) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      newSessions.set(session.id, session)
      return {
        currentSession: session,
        sessions: newSessions,
      }
    })
  },

  addMessage: (message) => {
    set((state) => {
      if (!state.currentSession) return state

      const updatedSession = {
        ...state.currentSession,
        messages: [...state.currentSession.messages, message],
      }

      const newSessions = new Map(state.sessions)
      newSessions.set(updatedSession.id, updatedSession)

      return {
        currentSession: updatedSession,
        sessions: newSessions,
      }
    })
  },

  updateMessages: (messages) => {
    set((state) => {
      if (!state.currentSession) return state

      const updatedSession = {
        ...state.currentSession,
        messages,
      }

      const newSessions = new Map(state.sessions)
      newSessions.set(updatedSession.id, updatedSession)

      return {
        currentSession: updatedSession,
        sessions: newSessions,
      }
    })
  },

  clearMessages: () => {
    set((state) => {
      if (!state.currentSession) return state

      const updatedSession = {
        ...state.currentSession,
        messages: [],
      }

      const newSessions = new Map(state.sessions)
      newSessions.set(updatedSession.id, updatedSession)

      return {
        currentSession: updatedSession,
        sessions: newSessions,
      }
    })
  },

  // Agent actions
  registerAgent: (agent) => {
    set((state) => {
      const newAgents = new Map(state.agents)
      newAgents.set(agent.id, agent)
      return { agents: newAgents }
    })
  },

  updateAgentStatus: (agentId, status) => {
    set((state) => {
      const agent = state.agents.get(agentId)
      if (!agent) return state

      const newAgents = new Map(state.agents)
      newAgents.set(agentId, { ...agent, status })
      return { agents: newAgents }
    })
  },

  setActiveAgent: (agentId) => {
    set({ activeAgent: agentId })
  },

  // Tool actions
  startToolExecution: (tool) => {
    const id = `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const execution: ToolExecution = {
      ...tool,
      id,
      startTime: new Date(),
    }

    set((state) => {
      const newActiveTools = new Map(state.activeTools)
      newActiveTools.set(id, execution)
      return { activeTools: newActiveTools }
    })

    return id
  },

  endToolExecution: (id, success, output, error) => {
    set((state) => {
      const tool = state.activeTools.get(id)
      if (!tool) return state

      const completedTool: ToolExecution = {
        ...tool,
        endTime: new Date(),
        success,
        output,
        error,
      }

      const newActiveTools = new Map(state.activeTools)
      newActiveTools.delete(id)

      const newHistory = [...state.toolHistory, completedTool]
      // Keep only last 100 tool executions
      if (newHistory.length > 100) {
        newHistory.shift()
      }

      return {
        activeTools: newActiveTools,
        toolHistory: newHistory,
      }
    })
  },

  getActiveTools: () => {
    return Array.from(get().activeTools.values())
  },

  // Context actions
  updateContextMetrics: (metrics) => {
    set((state) => ({
      contextMetrics: {
        ...state.contextMetrics,
        ...metrics,
        lastUpdate: new Date(),
      } as ContextMetrics,
    }))
  },

  // UI actions
  setUIState: (state) => {
    set((current) => ({
      uiState: { ...current.uiState, ...state },
    }))
  },

  togglePanel: (panel) => {
    set((state) => ({
      uiState: {
        ...state.uiState,
        activePanel: panel,
        showChat: panel === 'chat',
        showTools: panel === 'tools',
        showMetrics: panel === 'metrics',
        showLogs: panel === 'logs',
      },
    }))
  },

  // Utility
  getStats: () => {
    const state = get()
    return {
      totalSessions: state.sessions.size,
      totalMessages: state.currentSession?.messages.length || 0,
      totalTools: state.toolHistory.length,
      activeTools: state.activeTools.size,
      totalAgents: state.agents.size,
    }
  },
}))

// Selectors for efficient state access
export const selectCurrentSession = () => useAIStore((state) => state.currentSession)
export const selectMessages = () => useAIStore((state) => state.currentSession?.messages || [])
export const selectActiveTools = () => useAIStore((state) => state.getActiveTools())
export const selectAgents = () => useAIStore((state) => Array.from(state.agents.values()))
export const selectContextMetrics = () => useAIStore((state) => state.contextMetrics)
export const selectUIState = () => useAIStore((state) => state.uiState)

// Helper to check if store is enabled (default: enabled)
export const isStoreEnabled = (): boolean => {
  return process.env.AI_STORE !== 'false' && process.env.ENABLE_STORE !== 'false'
}

// Initialize and log store status
if (isStoreEnabled()) {
  console.log(chalk.green('✓ Centralized AI store enabled by default for state management'))
}
