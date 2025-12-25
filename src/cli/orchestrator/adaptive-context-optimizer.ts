import { EventEmitter } from 'node:events'
import type { AgentTodo } from '../../core/agent-todo-manager'
import type {
  AgentContextSlice,
  ContextBudget,
  OptimizationResult,
  TaskComplexityMetrics,
} from './types/orchestrator-types'
import { userPreferenceManager } from './user-preference-manager'

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4-20250514': 200000,
  'claude-sonnet-4-20250514': 200000,
  'claude-haiku-4-20250514': 200000,
  'gpt-4o': 128000,
  'gpt-4o-2024-11-20': 128000,
  'gpt-4': 128000,
  'gemini-1.5-pro': 2000000,
  'gemini-1.5-flash': 1000000,
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const OUTPUT_RESERVE_RATIO = 0.15

export class AdaptiveContextOptimizer extends EventEmitter {
  private modelContextLimit: number
  private outputReserveRatio: number

  constructor(modelName: string = DEFAULT_MODEL) {
    super()
    this.modelContextLimit = MODEL_CONTEXT_LIMITS[modelName] ?? 200000
    this.outputReserveRatio = OUTPUT_RESERVE_RATIO
  }

  calculateTaskComplexity(todos: AgentTodo[]): TaskComplexityMetrics {
    let codeComplexity = 0
    let dependencyComplexity = 0
    let scopeComplexity = 0
    let interdependencyComplexity = 0

    for (const todo of todos) {
      const tags = todo.tags ?? []
      const descLength = todo.description?.length ?? 0

      if (tags.includes('implementation') || tags.includes('refactoring')) {
        codeComplexity += 25
      } else if (tags.includes('analysis') || tags.includes('review')) {
        codeComplexity += 15
      } else if (tags.includes('testing') || tags.includes('debug')) {
        codeComplexity += 20
      } else if (tags.includes('documentation') || tags.includes('docs')) {
        codeComplexity += 8
      }

      const deps = todo.dependencies ?? []
      dependencyComplexity += Math.min(100, deps.length * 12)

      if (descLength > 200) {
        scopeComplexity += 20
      } else if (descLength > 100) {
        scopeComplexity += 10
      } else if (descLength > 50) {
        scopeComplexity += 5
      }

      const hasDependentTodos = todos.some((t) => (t.dependencies ?? []).includes(todo.id))
      if (hasDependentTodos) {
        interdependencyComplexity += 15
      }

      if (todo.priority === 'critical') {
        interdependencyComplexity += 10
      } else if (todo.priority === 'high') {
        interdependencyComplexity += 5
      }
    }

    codeComplexity = Math.min(100, codeComplexity)
    dependencyComplexity = Math.min(100, dependencyComplexity)
    scopeComplexity = Math.min(100, scopeComplexity)
    interdependencyComplexity = Math.min(100, interdependencyComplexity)

    const totalScore =
      codeComplexity * 0.35 + dependencyComplexity * 0.25 + scopeComplexity * 0.2 + interdependencyComplexity * 0.2

    const baseTokens = 2000
    const perTodoTokens = 1500
    const complexityMultiplier = 1 + (totalScore / 100) * 0.6
    const todosMultiplier = Math.log2(todos.length + 1) * 0.8 + 0.6

    const minimum = Math.round(baseTokens + todos.length * perTodoTokens * 0.6 * complexityMultiplier * todosMultiplier)
    const optimal = Math.round(baseTokens + todos.length * perTodoTokens * complexityMultiplier * todosMultiplier)
    const maximum = Math.round(baseTokens + todos.length * perTodoTokens * 1.5 * complexityMultiplier * todosMultiplier)

    const recommendedAgentCount = this.calculateRecommendedAgentCount(todos, totalScore)

    return {
      score: Math.round(totalScore),
      factors: {
        codeComplexity,
        dependencyComplexity,
        scopeComplexity,
        interdependencyComplexity,
      },
      estimatedTokens: {
        minimum: Math.max(minimum, 2000),
        optimal: Math.max(optimal, minimum + 1000),
        maximum: Math.max(maximum, optimal + 2000),
      },
      recommendedAgentCount,
    }
  }

  private calculateRecommendedAgentCount(todos: AgentTodo[], complexity: number): number {
    let count = Math.ceil(todos.length / 3)
    count = Math.max(1, count)

    if (complexity > 70) {
      count = Math.max(2, count)
    } else if (complexity < 30) {
      count = Math.min(2, count)
    }

    const maxAgents = userPreferenceManager.getMaxParallelAgents()
    return Math.min(Math.min(3, maxAgents), count)
  }

  calculateOptimalSlice(
    taskId: string,
    agentId: string,
    todos: AgentTodo[],
    customPreferences?: Partial<{ maxContextTokens: number; sharedContextRatio: number }>
  ): OptimizationResult {
    const complexity = this.calculateTaskComplexity(todos)

    const maxTokens = customPreferences?.maxContextTokens ?? userPreferenceManager.getMaxContextTokens()
    const sharedRatio = customPreferences?.sharedContextRatio ?? userPreferenceManager.getSharedContextRatio()

    const totalBudget = Math.min(maxTokens, this.modelContextLimit)
    const outputReserve = Math.round(totalBudget * this.outputReserveRatio)
    const availableForContext = totalBudget - outputReserve

    const sharedAllocation = Math.round(availableForContext * sharedRatio)
    const perAgentAllocation = Math.round(
      (availableForContext - sharedAllocation) / Math.max(1, complexity.recommendedAgentCount)
    )

    const sharedContext = this.generateSharedContext(todos)
    const agentContext = this.generateAgentContext(agentId, todos)
    const taskContext = this.generateTaskContext(todos)

    const slice: AgentContextSlice = {
      agentId,
      taskId,
      sharedContext,
      agentSpecificContext: agentContext,
      taskContext,
      allocatedTokens: perAgentAllocation,
      usedTokens: 0,
      priority: this.calculatePriority(complexity),
      dependencies: this.extractDependencies(todos),
      generatedAt: new Date(),
    }

    const budget: ContextBudget = {
      totalBudget,
      sharedAllocation,
      perAgentAllocation,
      reservedForOutput: outputReserve,
      currentUsage: 0,
      agents: new Map(),
    }

    const recommendations = this.generateRecommendations(complexity, slice, budget)

    return {
      optimalSlice: slice,
      budget,
      complexity,
      recommendations,
    }
  }

  private generateSharedContext(todos: AgentTodo[]): string {
    const activeTodos = todos.filter((t) => t.status !== 'completed').slice(0, 8)
    const goals = activeTodos.map((t) => `- ${t.title}: ${(t.description ?? '').slice(0, 80)}`).join('\n')

    const dependencies = new Set<string>()
    for (const todo of todos) {
      for (const dep of todo.dependencies ?? []) {
        dependencies.add(dep)
      }
    }

    return `## Shared Task Context

**Goal:** Execute the following tasks efficiently with optimal context management.

**Tasks Overview:**
${goals}

${dependencies.size > 0 ? `**Dependencies:** Tasks depend on completion of ${dependencies.size} prerequisite tasks.\n` : ''}
**Execution Strategy:** Tasks should be executed respecting dependencies. High-priority tasks are marked critical.`
  }

  private generateAgentContext(agentId: string, todos: AgentTodo[]): string {
    const agentTodos = todos.filter((t) => t.agentId === agentId || (!t.agentId && t.status !== 'completed'))
    const pendingCount = agentTodos.filter((t) => t.status !== 'completed').length

    return `## Agent Context (${agentId})

This agent is responsible for executing ${pendingCount} task(s).

**Assigned Tasks:**
${
  agentTodos
    .slice(0, 5)
    .map((t) => `- [${t.status}] ${t.title}`)
    .join('\n') || '- No active tasks'
}

**Coordination:** Communicate with other agents for shared dependencies. Report progress for tracking.`
  }

  private generateTaskContext(todos: AgentTodo[]): string {
    const activeTodos = todos.filter((t) => t.status === 'in_progress' || t.status === 'planning')
    const pendingTodos = todos.filter((t) => t.status === 'pending')
    const blockedTodos = todos.filter((t) => t.status === 'blocked')

    return `## Current Execution Context

**In Progress:** ${activeTodos.length}
${activeTodos.map((t) => `- ${t.title}`).join('\n') || '  None'}

**Pending:** ${pendingTodos.length}
**Blocked:** ${blockedTodos.length}

**Progress:** ${Math.round((todos.filter((t) => t.status === 'completed').length / Math.max(1, todos.length)) * 100)}% complete`
  }

  private calculatePriority(complexity: TaskComplexityMetrics): number {
    return Math.round(50 + complexity.score / 2 + complexity.recommendedAgentCount * 5)
  }

  private extractDependencies(todos: AgentTodo[]): string[] {
    const deps = new Set<string>()
    for (const todo of todos) {
      for (const dep of todo.dependencies ?? []) {
        deps.add(dep)
      }
    }
    return Array.from(deps)
  }

  private generateRecommendations(
    complexity: TaskComplexityMetrics,
    slice: AgentContextSlice,
    budget: ContextBudget
  ): string[] {
    const recommendations: string[] = []

    if (complexity.score > 70) {
      recommendations.push('High complexity - consider increasing context budget')
    }

    if (slice.allocatedTokens < complexity.estimatedTokens.minimum) {
      recommendations.push('Context budget may be insufficient - consider increasing maxContextTokens')
    }

    if (complexity.recommendedAgentCount > 1) {
      recommendations.push(`Parallel execution recommended (${complexity.recommendedAgentCount} agents)`)
    }

    if (budget.reservedForOutput < 15000) {
      recommendations.push('Output reserve may be tight for verbose models')
    }

    if (complexity.factors.interdependencyComplexity > 60) {
      recommendations.push('Many dependencies - ensure proper coordination between agents')
    }

    return recommendations
  }

  adjustSliceForUsage(slice: AgentContextSlice, usedTokens: number, _budget: ContextBudget): AgentContextSlice {
    const efficiencyRatio = slice.allocatedTokens > 0 ? usedTokens / slice.allocatedTokens : 0

    let priorityAdjustment = 0
    if (efficiencyRatio > 0.95) {
      priorityAdjustment = 5
    } else if (efficiencyRatio < 0.5) {
      priorityAdjustment = -10
    } else if (efficiencyRatio > 0.8) {
      priorityAdjustment = 2
    }

    return {
      ...slice,
      usedTokens,
      priority: Math.max(0, Math.min(100, slice.priority + priorityAdjustment)),
    }
  }

  getModelContextLimit(): number {
    return this.modelContextLimit
  }

  getOutputReserveRatio(): number {
    return this.outputReserveRatio
  }
}

export const adaptiveContextOptimizer = new AdaptiveContextOptimizer()
