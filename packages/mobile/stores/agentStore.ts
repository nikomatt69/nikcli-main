/**
 * NikCLI Mobile - Agent Store
 * Manages agent state and active tasks
 */

import { create } from 'zustand'
import type { AgentInfo, AgentStatus, AgentTask } from '@/types'

interface AgentState {
  // Active agents (max 3 parallel as in nikcli)
  activeAgents: Map<string, AgentInfo>
  
  // Queued tasks
  queuedTasks: AgentTask[]
  
  // Available agent types
  availableAgents: string[]
  
  // Selected agent for quick launch
  selectedAgent: string | null
  
  // Actions
  addAgent: (agent: AgentInfo) => void
  updateAgent: (id: string, updates: Partial<AgentInfo>) => void
  removeAgent: (id: string) => void
  clearAgents: () => void
  
  // Task actions
  queueTask: (task: AgentTask) => void
  processNextTask: () => AgentTask | undefined
  clearTasks: () => void
  
  // Selection
  setSelectedAgent: (agentType: string | null) => void
  
  // Computed
  getActiveCount: () => number
  canLaunchAgent: () => boolean
}

const MAX_PARALLEL_AGENTS = 3

// Default available agents (from streaming-orchestrator.ts selectBestAgent)
const DEFAULT_AGENTS = [
  'universal-agent',
  'react-expert',
  'backend-expert',
  'frontend-expert',
  'devops-expert',
  'code-review',
  'autonomous-coder',
  'vm-agent',
]

export const useAgentStore = create<AgentState>((set, get) => ({
  // Initial state
  activeAgents: new Map(),
  queuedTasks: [],
  availableAgents: DEFAULT_AGENTS,
  selectedAgent: null,
  
  // Agent actions
  addAgent: (agent) => {
    set((state) => {
      const newAgents = new Map(state.activeAgents)
      newAgents.set(agent.id, agent)
      return { activeAgents: newAgents }
    })
  },
  
  updateAgent: (id, updates) => {
    set((state) => {
      const newAgents = new Map(state.activeAgents)
      const existing = newAgents.get(id)
      if (existing) {
        newAgents.set(id, { ...existing, ...updates })
      }
      return { activeAgents: newAgents }
    })
  },
  
  removeAgent: (id) => {
    set((state) => {
      const newAgents = new Map(state.activeAgents)
      newAgents.delete(id)
      return { activeAgents: newAgents }
    })
  },
  
  clearAgents: () => {
    set({ activeAgents: new Map() })
  },
  
  // Task actions
  queueTask: (task) => {
    set((state) => ({
      queuedTasks: [...state.queuedTasks, task],
    }))
  },
  
  processNextTask: () => {
    const { queuedTasks } = get()
    if (queuedTasks.length === 0) return undefined
    
    const [next, ...rest] = queuedTasks
    set({ queuedTasks: rest })
    return next
  },
  
  clearTasks: () => {
    set({ queuedTasks: [] })
  },
  
  // Selection
  setSelectedAgent: (agentType) => {
    set({ selectedAgent: agentType })
  },
  
  // Computed
  getActiveCount: () => {
    return get().activeAgents.size
  },
  
  canLaunchAgent: () => {
    return get().activeAgents.size < MAX_PARALLEL_AGENTS
  },
}))

// Selectors
export const selectActiveAgents = (state: AgentState) => 
  Array.from(state.activeAgents.values())

export const selectQueuedTasks = (state: AgentState) => state.queuedTasks

export const selectAvailableAgents = (state: AgentState) => state.availableAgents

export const selectSelectedAgent = (state: AgentState) => state.selectedAgent

export const selectActiveCount = (state: AgentState) => state.activeAgents.size

export const selectCanLaunch = (state: AgentState) => 
  state.activeAgents.size < MAX_PARALLEL_AGENTS
