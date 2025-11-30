import { advancedUI } from '../../ui/advanced-cli-ui'
import { CliUI } from '../../utils/cli-ui'
import { EventBus, EventTypes } from './event-bus'

/**
 * Production-ready Agent Router
 * Intelligently routes tasks to specialized agents based on task type and context
 */
export class AgentRouter {
  private eventBus: EventBus
  private agents: Map<string, AgentInstance> = new Map()
  private routingRules: RoutingRule[] = []
  private taskQueue: TaskQueueItem[] = []
  private activeRoutes: Map<string, RouteExecution> = new Map()
  private routingMetrics: RoutingMetrics = {
    totalTasks: 0,
    successfulRoutes: 0,
    failedRoutes: 0,
    averageRoutingTime: 0,
    agentUtilization: new Map(),
  }

  constructor() {
    this.eventBus = EventBus.getInstance()
    this.setupEventListeners()
    this.initializeDefaultRoutingRules()
    this.setupPerformanceOptimizations()
  }

  /**
   * Register a specialized agent
   */
  registerAgent(agentId: string, agent: AgentInstance): void {
    if (this.agents.has(agentId)) {
      advancedUI.logWarning(`Agent ${agentId} already registered. Overwriting...`)
    }

    this.agents.set(agentId, agent)
    this.routingMetrics.agentUtilization.set(agentId, {
      tasksAssigned: 0,
      tasksCompleted: 0,
      averageExecutionTime: 0,
      successRate: 0,
    })

    advancedUI.logInfo(`🔌 Agent registered: ${agentId} (${agent.capabilities.join(', ')})`)

    // Publish agent registration event
    this.eventBus.publish(EventTypes.AGENT_STARTED, {
      agentId,
      capabilities: agent.capabilities,
      specialization: agent.specialization,
    })
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) return false

    this.agents.delete(agentId)
    this.routingMetrics.agentUtilization.delete(agentId)

    advancedUI.logInfo(`🔌 Agent unregistered: ${agentId}`)

    // Publish agent stop event
    this.eventBus.publish(EventTypes.AGENT_STOPPED, { agentId })

    return true
  }

  /**
   * Route a task to the most appropriate agent
   */
  async routeTask(task: AgentTask): Promise<TaskRoutingResult> {
    const startTime = Date.now()
    this.routingMetrics.totalTasks++

    try {
      advancedUI.logInfo(`🎯 Routing task: ${task.type} - ${task.description}`)

      // Analyze task to determine requirements
      const taskAnalysis = await this.analyzeTask(task)

      // Find best agent for the task
      const selectedAgent = await this.selectAgent(task, taskAnalysis)

      if (!selectedAgent) {
        throw new Error(`No suitable agent found for task: ${task.type}`)
      }

      // Create route execution
      const routeExecution: RouteExecution = {
        taskId: task.id,
        agentId: selectedAgent.agentId,
        startTime: new Date(),
        status: 'routing',
        analysis: taskAnalysis,
      }

      this.activeRoutes.set(task.id, routeExecution)

      // Assign task to agent
      const result = await this.assignTaskToAgent(selectedAgent, task)

      // Update metrics
      const routingTime = Date.now() - startTime
      this.updateRoutingMetrics(selectedAgent.agentId, routingTime, true)

      // Update route execution
      routeExecution.status = 'assigned'
      routeExecution.endTime = new Date()
      routeExecution.result = result

      advancedUI.logSuccess(`✓ Task routed to ${selectedAgent.agentId} in ${routingTime}ms`)

      return {
        success: true,
        taskId: task.id,
        assignedAgent: selectedAgent.agentId,
        routingTime,
        analysis: taskAnalysis,
        result,
      }
    } catch (error: any) {
      const routingTime = Date.now() - startTime
      this.updateRoutingMetrics('unknown', routingTime, false)

      CliUI.logError(`✖ Task routing failed: ${error.message}`)

      return {
        success: false,
        taskId: task.id,
        assignedAgent: null,
        routingTime,
        error: error.message,
      }
    }
  }

  /**
   * Add a custom routing rule
   */
  addRoutingRule(rule: RoutingRule): void {
    this.routingRules.push(rule)
    this.routingRules.sort((a, b) => (b.priority || 0) - (a.priority || 0))

    advancedUI.logInfo(`📋 Routing rule added: ${rule.name}`)
  }

  /**
   * Remove a routing rule
   */
  removeRoutingRule(ruleName: string): boolean {
    const initialLength = this.routingRules.length
    this.routingRules = this.routingRules.filter((rule) => rule.name !== ruleName)

    const removed = this.routingRules.length < initialLength
    if (removed) {
      advancedUI.logInfo(`📋 Routing rule removed: ${ruleName}`)
    }

    return removed
  }

  /**
   * Get routing metrics
   */
  getRoutingMetrics(): RoutingMetrics {
    return { ...this.routingMetrics }
  }

  /**
   * Get active routes
   */
  getActiveRoutes(): RouteExecution[] {
    return Array.from(this.activeRoutes.values())
  }

  /**
   * Get registered agents
   */
  getRegisteredAgents(): AgentInfo[] {
    return Array.from(this.agents.entries()).map(([agentId, agent]) => ({
      agentId,
      capabilities: agent.capabilities,
      specialization: agent.specialization,
      status: agent.status,
      currentTasks: agent.currentTasks || 0,
      maxConcurrentTasks: agent.maxConcurrentTasks || 1,
    }))
  }

  /**
   * Analyze task to determine requirements
   */
  private async analyzeTask(task: AgentTask): Promise<TaskAnalysis> {
    const analysis: TaskAnalysis = {
      taskType: task.type,
      complexity: this.assessComplexity(task),
      requiredCapabilities: this.extractRequiredCapabilities(task),
      estimatedDuration: this.estimateDuration(task),
      priority: task.priority || 'normal',
      resourceRequirements: this.assessResourceRequirements(task),
      dependencies: task.dependencies || [],
    }

    // Apply custom analysis rules
    for (const rule of this.routingRules) {
      if (rule.taskAnalyzer) {
        const customAnalysis = await rule.taskAnalyzer(task, analysis)
        Object.assign(analysis, customAnalysis)
      }
    }

    return analysis
  }

  /**
   * Select the best agent for a task
   */
  private async selectAgent(task: AgentTask, analysis: TaskAnalysis): Promise<AgentSelection | null> {
    const candidates: AgentCandidate[] = []

    // Evaluate each agent
    for (const [agentId, agent] of Array.from(this.agents.entries())) {
      if (agent.status !== 'available') continue

      const score = await this.scoreAgent(agent, task, analysis)
      if (score > 0) {
        candidates.push({
          agentId,
          agent,
          score,
          reasoning: this.generateReasoningForScore(agent, task, analysis, score),
        })
      }
    }

    // Sort by score (highest first)
    candidates.sort((a, b) => b.score - a.score)

    // Apply routing rules
    for (const rule of this.routingRules) {
      if (rule.agentSelector) {
        const selectedCandidate = await rule.agentSelector(candidates, task, analysis)
        if (selectedCandidate) {
          return {
            agentId: selectedCandidate.agentId,
            agent: selectedCandidate.agent,
            score: selectedCandidate.score,
            reasoning: `Selected by rule: ${rule.name}. ${selectedCandidate.reasoning}`,
          }
        }
      }
    }

    // Return best candidate
    const bestCandidate = candidates[0]
    return bestCandidate
      ? {
          agentId: bestCandidate.agentId,
          agent: bestCandidate.agent,
          score: bestCandidate.score,
          reasoning: bestCandidate.reasoning,
        }
      : null
  }

  /**
   * Score an agent for a specific task
   */
  private async scoreAgent(agent: AgentInstance, _task: AgentTask, analysis: TaskAnalysis): Promise<number> {
    let score = 0

    // Capability matching (40% of score)
    const capabilityMatch = this.calculateCapabilityMatch(agent.capabilities, analysis.requiredCapabilities)
    score += capabilityMatch * 0.4

    // Specialization bonus (30% of score)
    if (agent.specialization === analysis.taskType || analysis.requiredCapabilities.includes(agent.specialization)) {
      score += 0.3
    }

    // Load balancing (20% of score)
    const currentLoad = (agent.currentTasks || 0) / (agent.maxConcurrentTasks || 1)
    score += (1 - currentLoad) * 0.2

    // Performance history (10% of score)
    const utilization = this.routingMetrics.agentUtilization.get(agent.id)
    if (utilization && utilization.tasksCompleted > 0) {
      score += utilization.successRate * 0.1
    }

    return Math.max(0, Math.min(1, score)) // Normalize to 0-1
  }

  /**
   * Assign task to selected agent
   */
  private async assignTaskToAgent(selection: AgentSelection, task: AgentTask): Promise<any> {
    const agent = selection.agent

    // Update agent status
    agent.currentTasks = (agent.currentTasks || 0) + 1
    if (agent.currentTasks >= (agent.maxConcurrentTasks || 1)) {
      agent.status = 'busy'
    }

    // Publish task assignment event
    await this.eventBus.publish(EventTypes.TASK_ASSIGNED, {
      taskId: task.id,
      agentId: selection.agentId,
      reasoning: selection.reasoning,
      score: selection.score,
    })

    try {
      // Execute task on agent
      const result = await agent.executeTask(task)

      // Update agent status
      agent.currentTasks = Math.max(0, (agent.currentTasks || 1) - 1)
      if (agent.currentTasks < (agent.maxConcurrentTasks || 1)) {
        agent.status = 'available'
      }

      // Publish completion event
      await this.eventBus.publish(EventTypes.TASK_COMPLETED, {
        taskId: task.id,
        agentId: selection.agentId,
        result,
      })

      return result
    } catch (error: any) {
      // Update agent status
      agent.currentTasks = Math.max(0, (agent.currentTasks || 1) - 1)
      agent.status = 'available'

      // Publish failure event
      await this.eventBus.publish(EventTypes.TASK_FAILED, {
        taskId: task.id,
        agentId: selection.agentId,
        error: error.message,
      })

      throw error
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for system events
    this.eventBus.subscribe(EventTypes.SYSTEM_SHUTDOWN, () => {
      advancedUI.logInfo('⚡︎ AgentRouter shutting down...')
      this.cleanup()
    })

    // Listen for agent errors
    this.eventBus.subscribe(EventTypes.AGENT_ERROR, (event) => {
      const { agentId, error } = event.data
      CliUI.logError(`🔌 Agent ${agentId} error: ${error}`)

      // Mark agent as unavailable temporarily
      const agent = this.agents.get(agentId)
      if (agent) {
        agent.status = 'error'
        setTimeout(() => {
          if (agent.status === 'error') {
            agent.status = 'available'
          }
        }, 30000) // Retry after 30 seconds
      }
    })
  }

  /**
   * Initialize default routing rules
   */
  private initializeDefaultRoutingRules(): void {
    // Frontend specialization rule
    this.addRoutingRule({
      name: 'frontend-specialization',
      priority: 10,
      agentSelector: async (candidates, task) => {
        if (task.type.includes('frontend') || task.type.includes('ui') || task.type.includes('component')) {
          return candidates.find((c) => c.agent.specialization === 'frontend') || candidates[0] || null
        }
        return null
      },
    })

    // Backend specialization rule
    this.addRoutingRule({
      name: 'backend-specialization',
      priority: 10,
      agentSelector: async (candidates, task) => {
        if (task.type.includes('backend') || task.type.includes('api') || task.type.includes('database')) {
          return candidates.find((c) => c.agent.specialization === 'backend') || candidates[0] || null
        }
        return null
      },
    })

    // Testing specialization rule
    this.addRoutingRule({
      name: 'testing-specialization',
      priority: 10,
      agentSelector: async (candidates, task) => {
        if (task.type.includes('test') || task.type.includes('spec') || task.type.includes('e2e')) {
          return candidates.find((c) => c.agent.specialization === 'testing') || candidates[0] || null
        }
        return null
      },
    })

    // Load balancing rule (fallback)
    this.addRoutingRule({
      name: 'load-balancing',
      priority: 1,
      agentSelector: async (candidates) => {
        // Return agent with lowest current load
        return candidates.reduce((best, current) => {
          const currentLoad = (current.agent.currentTasks || 0) / (current.agent.maxConcurrentTasks || 1)
          const bestLoad = (best.agent.currentTasks || 0) / (best.agent.maxConcurrentTasks || 1)
          return currentLoad < bestLoad ? current : best
        })
      },
    })
  }

  /**
   * Helper methods for task analysis
   */
  private assessComplexity(task: AgentTask): TaskComplexity {
    // Simple heuristic based on task description length and type
    const descriptionLength = task.description.length
    const hasMultipleSteps = task.description.includes('and') || task.description.includes('then')

    if (descriptionLength > 200 || hasMultipleSteps) return 'high'
    if (descriptionLength > 100) return 'medium'
    return 'low'
  }

  private extractRequiredCapabilities(task: AgentTask): string[] {
    const capabilities: string[] = []
    const description = task.description.toLowerCase()

    // File operations
    if (description.includes('read') || description.includes('file')) capabilities.push('file-read')
    if (description.includes('write') || description.includes('create')) capabilities.push('file-write')
    if (description.includes('delete') || description.includes('remove')) capabilities.push('file-delete')

    // Code operations
    if (description.includes('refactor') || description.includes('modify')) capabilities.push('code-modify')
    if (description.includes('test') || description.includes('spec')) capabilities.push('testing')
    if (description.includes('debug') || description.includes('fix')) capabilities.push('debugging')

    // System operations
    if (description.includes('command') || description.includes('run')) capabilities.push('command-execute')
    if (description.includes('install') || description.includes('setup')) capabilities.push('system-setup')

    return capabilities
  }

  private estimateDuration(task: AgentTask): number {
    const complexity = this.assessComplexity(task)
    const baseTime = {
      low: 30000, // 30 seconds
      medium: 120000, // 2 minutes
      high: 300000, // 5 minutes
    }

    return baseTime[complexity]
  }

  private assessResourceRequirements(task: AgentTask): ResourceRequirements {
    return {
      memory: 'low',
      cpu: 'low',
      network: task.description.includes('download') || task.description.includes('fetch') ? 'medium' : 'low',
      storage: task.description.includes('large') || task.description.includes('backup') ? 'medium' : 'low',
    }
  }

  private calculateCapabilityMatch(agentCapabilities: string[], requiredCapabilities: string[]): number {
    if (requiredCapabilities.length === 0) return 1

    const matches = requiredCapabilities.filter((cap) => agentCapabilities.includes(cap)).length
    return matches / requiredCapabilities.length
  }

  private generateReasoningForScore(
    agent: AgentInstance,
    _task: AgentTask,
    analysis: TaskAnalysis,
    _score: number
  ): string {
    const reasons: string[] = []

    if (agent.specialization === analysis.taskType) {
      reasons.push(`Specialized in ${agent.specialization}`)
    }

    const capabilityMatch = this.calculateCapabilityMatch(agent.capabilities, analysis.requiredCapabilities)
    if (capabilityMatch > 0.8) {
      reasons.push(`High capability match (${Math.round(capabilityMatch * 100)}%)`)
    }

    const currentLoad = (agent.currentTasks || 0) / (agent.maxConcurrentTasks || 1)
    if (currentLoad < 0.5) {
      reasons.push('Low current workload')
    }

    return reasons.join(', ') || 'Best available option'
  }

  private updateRoutingMetrics(agentId: string, routingTime: number, success: boolean): void {
    if (success) {
      this.routingMetrics.successfulRoutes++
    } else {
      this.routingMetrics.failedRoutes++
    }

    // Update average routing time
    const totalRoutes = this.routingMetrics.successfulRoutes + this.routingMetrics.failedRoutes
    this.routingMetrics.averageRoutingTime =
      (this.routingMetrics.averageRoutingTime * (totalRoutes - 1) + routingTime) / totalRoutes

    // Update agent utilization
    const utilization = this.routingMetrics.agentUtilization.get(agentId)
    if (utilization) {
      utilization.tasksAssigned++
      if (success) {
        utilization.tasksCompleted++
        utilization.successRate = utilization.tasksCompleted / utilization.tasksAssigned
      }
    }
  }

  private cleanup(): void {
    this.activeRoutes.clear()
    this.taskQueue = []
  }

  /**
   * Setup performance optimizations
   */
  private setupPerformanceOptimizations(): void {
    // Periodic cleanup of completed routes
    setInterval(
      () => {
        this.cleanupCompletedRoutes()
      },
      5 * 60 * 1000
    ) // Every 5 minutes

    // Performance metrics optimization
    setInterval(() => {
      this.optimizeAgentUtilization()
    }, 30 * 1000) // Every 30 seconds
  }

  /**
   * Clean up completed routes and old metrics
   */
  private cleanupCompletedRoutes(): void {
    const now = Date.now()
    const maxAge = 30 * 60 * 1000 // 30 minutes

    // Remove old active routes
    for (const [taskId, route] of this.activeRoutes.entries()) {
      if (route.startTime.getTime() + maxAge < now) {
        this.activeRoutes.delete(taskId)
      }
    }

    // Limit task queue size
    if (this.taskQueue.length > 100) {
      this.taskQueue = this.taskQueue.slice(-50)
    }

    CliUI.logDebug(`🧹 Cleaned up routes: ${this.activeRoutes.size} active`)
  }

  /**
   * Optimize agent utilization based on metrics
   */
  private optimizeAgentUtilization(): void {
    for (const [agentId, utilization] of this.routingMetrics.agentUtilization.entries()) {
      const agent = this.agents.get(agentId)
      if (!agent) continue

      // Adjust max concurrent tasks based on success rate
      if (utilization.successRate > 0.9 && utilization.tasksCompleted > 5) {
        // High-performing agent can handle more tasks
        if ((agent.maxConcurrentTasks || 1) < 5) {
          agent.maxConcurrentTasks = (agent.maxConcurrentTasks || 1) + 1
        }
      } else if (utilization.successRate < 0.7) {
        // Lower capacity for struggling agents
        if ((agent.maxConcurrentTasks || 1) > 1) {
          agent.maxConcurrentTasks = (agent.maxConcurrentTasks || 1) - 1
        }
      }
    }
  }

  /**
   * Get enhanced routing statistics for monitoring
   */
  getRoutingStatistics(): RoutingStatistics {
    const stats: RoutingStatistics = {
      totalTasks: this.routingMetrics.totalTasks,
      successfulRoutes: this.routingMetrics.successfulRoutes,
      failedRoutes: this.routingMetrics.failedRoutes,
      averageRoutingTime: this.routingMetrics.averageRoutingTime,
      activeRoutes: this.activeRoutes.size,
      queuedTasks: this.taskQueue.length,
      agentCount: this.agents.size,
      topPerformingAgents: this.getTopPerformingAgents(3),
      systemLoad: this.calculateSystemLoad(),
    }

    return stats
  }

  /**
   * Get top performing agents
   */
  private getTopPerformingAgents(limit: number): AgentPerformanceRank[] {
    const rankings: AgentPerformanceRank[] = []

    for (const [agentId, utilization] of this.routingMetrics.agentUtilization.entries()) {
      if (utilization.tasksCompleted > 0) {
        rankings.push({
          agentId,
          successRate: utilization.successRate,
          tasksCompleted: utilization.tasksCompleted,
          averageExecutionTime: utilization.averageExecutionTime,
        })
      }
    }

    return rankings.sort((a, b) => b.successRate - a.successRate).slice(0, limit)
  }

  /**
   * Calculate overall system load
   */
  private calculateSystemLoad(): number {
    let totalLoad = 0
    let agentCount = 0

    for (const agent of this.agents.values()) {
      const load = (agent.currentTasks || 0) / (agent.maxConcurrentTasks || 1)
      totalLoad += load
      agentCount++
    }

    return agentCount > 0 ? totalLoad / agentCount : 0
  }
}

// Enhanced type definitions for performance monitoring
interface RoutingStatistics {
  totalTasks: number
  successfulRoutes: number
  failedRoutes: number
  averageRoutingTime: number
  activeRoutes: number
  queuedTasks: number
  agentCount: number
  topPerformingAgents: AgentPerformanceRank[]
  systemLoad: number
}

interface AgentPerformanceRank {
  agentId: string
  successRate: number
  tasksCompleted: number
  averageExecutionTime: number
}

// Type definitions
export interface AgentInstance {
  id: string
  capabilities: string[]
  specialization: string
  status: AgentStatus
  currentTasks?: number
  maxConcurrentTasks?: number
  executeTask: (task: AgentTask) => Promise<any>
}

export interface AgentTask {
  id: string
  type: string
  description: string
  priority?: TaskPriority
  dependencies?: string[]
  metadata?: Record<string, any>
}

export interface TaskAnalysis {
  taskType: string
  complexity: TaskComplexity
  requiredCapabilities: string[]
  estimatedDuration: number
  priority: TaskPriority
  resourceRequirements: ResourceRequirements
  dependencies: string[]
}

export interface RoutingRule {
  name: string
  priority?: number
  taskAnalyzer?: (task: AgentTask, analysis: TaskAnalysis) => Promise<Partial<TaskAnalysis>>
  agentSelector?: (
    candidates: AgentCandidate[],
    task: AgentTask,
    analysis: TaskAnalysis
  ) => Promise<AgentCandidate | null>
}

export interface AgentCandidate {
  agentId: string
  agent: AgentInstance
  score: number
  reasoning: string
}

export interface AgentSelection {
  agentId: string
  agent: AgentInstance
  score: number
  reasoning: string
}

export interface TaskRoutingResult {
  success: boolean
  taskId: string
  assignedAgent: string | null
  routingTime: number
  analysis?: TaskAnalysis
  result?: any
  error?: string
}

export interface RouteExecution {
  taskId: string
  agentId: string
  startTime: Date
  endTime?: Date
  status: RouteStatus
  analysis: TaskAnalysis
  result?: any
  error?: string
}

export interface RoutingMetrics {
  totalTasks: number
  successfulRoutes: number
  failedRoutes: number
  averageRoutingTime: number
  agentUtilization: Map<string, AgentUtilization>
}

export interface AgentUtilization {
  tasksAssigned: number
  tasksCompleted: number
  averageExecutionTime: number
  successRate: number
}

export interface AgentInfo {
  agentId: string
  capabilities: string[]
  specialization: string
  status: AgentStatus
  currentTasks: number
  maxConcurrentTasks: number
}

export interface TaskQueueItem {
  task: AgentTask
  priority: number
  queuedAt: Date
}

export interface ResourceRequirements {
  memory: ResourceLevel
  cpu: ResourceLevel
  network: ResourceLevel
  storage: ResourceLevel
}

export type AgentStatus = 'available' | 'busy' | 'error' | 'offline'
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical'
export type TaskComplexity = 'low' | 'medium' | 'high'
export type RouteStatus = 'routing' | 'assigned' | 'executing' | 'completed' | 'failed'
export type ResourceLevel = 'low' | 'medium' | 'high'
