import { EventEmitter } from 'node:events'
import type { AgentTodo } from '../core/agent-todo-manager'
import { AdaptiveContextOptimizer } from './adaptive-context-optimizer'
import type { AgentContextSlice, ContextBudget, ExecutionPlan, TaskChainContext } from './types/orchestrator-types'
import { UserPreferenceManager } from './user-preference-manager'

export class ParallelTaskContextManager extends EventEmitter {
  private chains: Map<string, TaskChainContext> = new Map()
  private optimizer: AdaptiveContextOptimizer
  private preferenceManager: UserPreferenceManager
  private agentCounter: number = 0

  constructor() {
    super()
    this.optimizer = new AdaptiveContextOptimizer()
    this.preferenceManager = new UserPreferenceManager()
  }

  createChainContext(chainId: string, rootTaskId: string, todos: AgentTodo[], agentIds?: string[]): TaskChainContext {
    const maxTokens = this.preferenceManager.getMaxContextTokens()
    const sharedRatio = this.preferenceManager.getSharedContextRatio()

    const complexity = this.optimizer.calculateTaskComplexity(todos)
    const agentCount = Math.max(1, agentIds?.length ?? complexity.recommendedAgentCount)

    const agents = agentIds ?? this.generateAgentIds(agentCount)

    const agentSlices = new Map<string, AgentContextSlice>()
    let sharedContext = ''
    let budget: ContextBudget | null = null

    for (let i = 0; i < agents.length; i++) {
      const agentId = agents[i]
      const sliceResult = this.optimizer.calculateOptimalSlice(rootTaskId, agentId, todos, {
        maxContextTokens: maxTokens,
        sharedContextRatio: sharedRatio,
      })

      if (i === 0) {
        sharedContext = sliceResult.optimalSlice.sharedContext
        budget = sliceResult.budget
      }

      agentSlices.set(agentId, {
        ...sliceResult.optimalSlice,
        sharedContext: '',
        taskContext: '',
      })
    }

    if (!budget) {
      const firstSlice = this.optimizer.calculateOptimalSlice(rootTaskId, agents[0], todos, {
        maxContextTokens: maxTokens,
        sharedContextRatio: sharedRatio,
      })
      budget = firstSlice.budget
    }

    if (!budget) {
      budget = {
        totalBudget: 10000,
        sharedAllocation: 3000,
        perAgentAllocation: 2000,
        reservedForOutput: 2000,
        currentUsage: 0,
        agents: new Map(),
      }
    }

    const chainContext: TaskChainContext = {
      chainId,
      rootTaskId,
      agentSlices,
      sharedContext,
      budget,
      todos,
      status: 'pending',
    }

    this.chains.set(chainId, chainContext)
    this.emit('chainCreated', chainContext)

    return chainContext
  }

  private generateAgentIds(count: number): string[] {
    const ids: string[] = []
    for (let i = 0; i < count; i++) {
      ids.push(`agent-${this.agentCounter++}`)
    }
    return ids
  }

  getAgentContext(chainId: string, agentId: string): AgentContextSlice | undefined {
    const chain = this.chains.get(chainId)
    if (!chain) return undefined

    const slice = chain.agentSlices.get(agentId)
    if (!slice) return undefined

    const agentTodos = chain.todos.filter((t) => t.agentId === agentId || (!t.agentId && t.status !== 'completed'))
    const completed = agentTodos.filter((t) => t.status === 'completed').length
    const pending = agentTodos.filter((t) => t.status !== 'completed').length

    const taskContext = this.generateMergedTaskContext(chain.todos, agentId, completed, pending)

    return {
      ...slice,
      sharedContext: chain.sharedContext,
      taskContext,
    }
  }

  private generateMergedTaskContext(todos: AgentTodo[], agentId: string, completed: number, pending: number): string {
    const agentTodos = todos.filter((t) => t.agentId === agentId || (!t.agentId && t.status !== 'completed'))
    const activeTasks = agentTodos.filter((t) => t.status === 'in_progress')

    let context = `## Task Context for ${agentId}\n\n`
    context += `**Progress:** ${completed}/${agentTodos.length} completed\n`
    context += `**Pending:** ${pending}\n\n`

    if (activeTasks.length > 0) {
      context += `**Active Tasks:**\n${activeTasks.map((t) => `- ${t.title}`).join('\n')}\n`
    } else if (pending > 0) {
      const planningTasks = agentTodos.filter((t) => t.status === 'planning').slice(0, 3)
      if (planningTasks.length > 0) {
        context += `**Next Tasks:**\n${planningTasks.map((t) => `- ${t.title}`).join('\n')}\n`
      }
    }

    const dependencies = new Set<string>()
    for (const todo of agentTodos) {
      for (const dep of todo.dependencies ?? []) {
        dependencies.add(dep)
      }
    }
    if (dependencies.size > 0) {
      context += `\n**Dependencies:** Waiting on ${dependencies.size} task(s)\n`
    }

    return context
  }

  async updateAfterExecution(
    chainId: string,
    agentId: string,
    outcome: { success: boolean; tokensUsed: number; duration: number }
  ): Promise<void> {
    const chain = this.chains.get(chainId)
    if (!chain) return

    const slice = chain.agentSlices.get(agentId)
    if (!slice) return

    slice.usedTokens = outcome.tokensUsed

    await this.preferenceManager.recordOutcome({
      taskId: chain.rootTaskId,
      agentId,
      timestamp: new Date(),
      duration: outcome.duration,
      success: outcome.success,
      contextTokensUsed: outcome.tokensUsed,
      contextBudget: slice.allocatedTokens,
      efficiencyRatio: slice.allocatedTokens > 0 ? outcome.tokensUsed / slice.allocatedTokens : 0,
      complexityScore: this.optimizer.calculateTaskComplexity(chain.todos).score,
    })

    if (outcome.success) {
      for (const todo of chain.todos) {
        if (todo.agentId === agentId && todo.status === 'in_progress') {
          todo.status = 'completed'
          todo.actualDuration = outcome.duration
        }
      }
    }

    const allComplete = Array.from(chain.agentSlices.values()).every((s) => s.usedTokens > 0)
    const allSuccessful = Array.from(chain.agentSlices.values()).every((s) => s.usedTokens > 0)

    if (allComplete) {
      chain.status = allSuccessful ? 'completed' : 'failed'
      this.emit('chainCompleted', chain)
    }
  }

  createExecutionPlan(todos: AgentTodo[], maxAgents?: number): ExecutionPlan {
    const levels = this.groupByDependencyLevel(todos)
    const chains: TaskChainContext[] = []

    const effectiveMaxAgents = maxAgents ?? this.preferenceManager.getMaxParallelAgents()

    for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
      const level = levels[levelIndex]
      const chainId = `chain_${Date.now()}_${levelIndex}`
      const chainAgents = this.generateAgentIds(Math.min(level.length, effectiveMaxAgents))

      const chainContext = this.createChainContext(chainId, `task-${level[0]?.id ?? 'root'}`, level, chainAgents)
      chains.push(chainContext)
    }

    const strategy = this.determineStrategy(chains)

    const estimatedTokens = chains.reduce((sum, chain) => {
      return sum + (chain.budget?.totalBudget ?? 0) * chain.agentSlices.size
    }, 0)

    const totalAgents = chains.reduce((sum, chain) => sum + chain.agentSlices.size, 0)

    return {
      id: `plan_${Date.now()}`,
      chains,
      totalAgents,
      estimatedTokens,
      strategy,
    }
  }

  private groupByDependencyLevel(todos: AgentTodo[]): AgentTodo[][] {
    const levels: AgentTodo[][] = []
    const processed = new Set<string>()
    let currentLevel = todos.filter((t) => !t.dependencies || t.dependencies.length === 0)

    while (currentLevel.length > 0) {
      levels.push(currentLevel)

      for (const todo of currentLevel) {
        processed.add(todo.id)
      }

      const nextLevel: AgentTodo[] = []
      for (const todo of todos) {
        if (processed.has(todo.id)) continue
        const deps = todo.dependencies ?? []
        if (deps.length === 0 || deps.every((d) => processed.has(d))) {
          nextLevel.push(todo)
        }
      }

      currentLevel = nextLevel
    }

    if (levels.length === 0 && todos.length > 0) {
      levels.push(todos)
    }

    return levels
  }

  private determineStrategy(chains: TaskChainContext[]): 'sequential' | 'parallel' | 'hybrid' {
    if (chains.length <= 1) return 'sequential'
    if (chains.length > 3 && this.preferenceManager.getParallelExecutionEnabled()) return 'parallel'
    return 'hybrid'
  }

  getChainStatus(): {
    totalChains: number
    activeChains: number
    completedChains: number
  } {
    let active = 0,
      completed = 0
    for (const chain of this.chains.values()) {
      if (chain.status === 'running' || chain.status === 'pending') active++
      else if (chain.status === 'completed') completed++
    }
    return {
      totalChains: this.chains.size,
      activeChains: active,
      completedChains: completed,
    }
  }

  getChain(chainId: string): TaskChainContext | undefined {
    return this.chains.get(chainId)
  }

  getAllChains(): TaskChainContext[] {
    return Array.from(this.chains.values())
  }

  async cleanupStaleChains(maxAge: number = 3600000): Promise<number> {
    const staleChains: string[] = []
    const now = Date.now()

    for (const [chainId, chain] of this.chains.entries()) {
      if (chain.status === 'running' || chain.status === 'pending') {
        const lastActivity = Math.max(...Array.from(chain.agentSlices.values()).map((s) => s.generatedAt.getTime()), 0)
        if (now - lastActivity > maxAge) {
          staleChains.push(chainId)
        }
      }
    }

    staleChains.forEach((id) => this.chains.delete(id))
    return staleChains.length
  }

  removeChain(chainId: string): boolean {
    return this.chains.delete(chainId)
  }

  clearChains(): void {
    this.chains.clear()
  }
}

export const parallelTaskContextManager = new ParallelTaskContextManager()
