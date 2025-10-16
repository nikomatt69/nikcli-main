/**
 * NikCLI SDK React Hooks - useAgent
 * Hook for managing agents in TTY applications
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  AgentConfig,
  AgentStatus,
  AgentMetrics,
  AgentTask,
  AgentTaskResult,
  CreateAgentTask,
  UseAgentReturn,
} from '../types'
import { getSDK } from '../core/sdk'

/**
 * useAgent Hook
 * Manages agent state and operations
 */
export function useAgent(agentId: string): UseAgentReturn {
  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [status, setStatus] = useState<AgentStatus>('offline')
  const [metrics, setMetrics] = useState<AgentMetrics>({
    tasksExecuted: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    tasksInProgress: 0,
    averageExecutionTime: 0,
    totalExecutionTime: 0,
    successRate: 0,
    tokensConsumed: 0,
    apiCallsTotal: 0,
    lastActive: new Date(),
    uptime: 0,
    productivity: 0,
    accuracy: 0,
  })
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(false)
  
  const sdk = useRef(getSDK())
  const agentManager = sdk.current.getAgentManager()

  /**
   * Load agent data
   */
  const loadAgent = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const agentData = agentManager.getAgent(agentId)
      if (!agentData) {
        setAgent(null)
        setStatus('offline')
        return
      }

      setAgent(agentData)
      setStatus('ready')

      // Load metrics
      const agentMetrics = agentManager.getAgentMetrics(agentId)
      if (agentMetrics) {
        setMetrics(agentMetrics)
      }

      // Load tasks (simplified - would need proper task tracking)
      setTasks([])
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load agent'))
    } finally {
      setLoading(false)
    }
  }, [agentId, agentManager])

  /**
   * Execute a task
   */
  const executeTask = useCallback(async (task: CreateAgentTask): Promise<AgentTaskResult> => {
    try {
      setLoading(true)
      setError(null)

      const taskId = await agentManager.scheduleTask(task, agentId)
      
      // Wait for task completion (simplified)
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Return mock result
      const result: AgentTaskResult = {
        taskId,
        agentId,
        status: 'completed',
        startTime: new Date(),
        endTime: new Date(),
        result: { message: 'Task completed successfully' },
        output: `Agent ${agentId} completed: ${task.title}`,
      }

      // Refresh agent data
      await loadAgent()

      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to execute task')
      setError(error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [agentId, agentManager, loadAgent])

  /**
   * Cancel a task
   */
  const cancelTask = useCallback(async (taskId: string): Promise<void> => {
    try {
      setError(null)
      await agentManager.cancelTask(taskId)
      await loadAgent()
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to cancel task')
      setError(error)
      throw error
    }
  }, [agentManager, loadAgent])

  /**
   * Refresh agent data
   */
  const refresh = useCallback(async () => {
    await loadAgent()
  }, [loadAgent])

  // Load agent on mount and when agentId changes
  useEffect(() => {
    loadAgent()
  }, [loadAgent])

  // Setup event listeners
  useEffect(() => {
    const handleAgentEvent = (event: any) => {
      if (event.agentId === agentId) {
        loadAgent()
      }
    }

    agentManager.addEventListener('agent.registered', handleAgentEvent)
    agentManager.addEventListener('task.started', handleAgentEvent)
    agentManager.addEventListener('task.completed', handleAgentEvent)
    agentManager.addEventListener('task.failed', handleAgentEvent)
    agentManager.addEventListener('error.occurred', handleAgentEvent)

    return () => {
      agentManager.removeEventListener('agent.registered', handleAgentEvent)
      agentManager.removeEventListener('task.started', handleAgentEvent)
      agentManager.removeEventListener('task.completed', handleAgentEvent)
      agentManager.removeEventListener('task.failed', handleAgentEvent)
      agentManager.removeEventListener('error.occurred', handleAgentEvent)
    }
  }, [agentId, agentManager, loadAgent])

  return {
    agent,
    status,
    metrics,
    tasks,
    executeTask,
    cancelTask,
    refresh,
    error,
    loading,
  }
}

/**
 * useAgents Hook
 * Manages multiple agents
 */
export function useAgents() {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  const sdk = useRef(getSDK())
  const agentManager = sdk.current.getAgentManager()

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const agentsList = agentManager.listAgents()
      setAgents(agentsList)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load agents'))
    } finally {
      setLoading(false)
    }
  }, [agentManager])

  const refresh = useCallback(async () => {
    await loadAgents()
  }, [loadAgents])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  return {
    agents,
    loading,
    error,
    refresh,
  }
}

/**
 * useAgentStats Hook
 * Manages agent statistics
 */
export function useAgentStats() {
  const [stats, setStats] = useState({
    totalAgents: 0,
    activeAgents: 0,
    totalTasks: 0,
    pendingTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageTaskDuration: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  const sdk = useRef(getSDK())
  const agentManager = sdk.current.getAgentManager()

  const loadStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const agentStats = agentManager.getStats()
      setStats(agentStats)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load stats'))
    } finally {
      setLoading(false)
    }
  }, [agentManager])

  const refresh = useCallback(async () => {
    await loadStats()
  }, [loadStats])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  return {
    stats,
    loading,
    error,
    refresh,
  }
}