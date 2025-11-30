import os from 'node:os'
import type { Agent, AgentTask, AgentTaskResult } from '../types/types'
import type { AnalyticsEvent } from './analytics-manager'

export interface AgentInfo {
  id: string
  name: string
  status: 'idle' | 'busy' | 'error'
  currentTask?: string
  uptime: number
  tasksCompleted: number
}

export interface DashboardMetrics {
  agents: {
    active: AgentInfo[]
    total: number
    busyCount: number
    tasks: { queued: number; running: number; completed: number }
  }
  performance: {
    cpu: number
    memory: { used: number; total: number }
    uptime: number
    responseTimes: number[]
  }
  ai: {
    totalTokens: number
    totalCost: number
    cacheHitRate: number
    requestsPerMin: number
  }
  tools: {
    mostUsed: Array<{ name: string; count: number }>
    successRate: number
  }
}

export interface MetricsProvider {
  getAgentMetrics?(): {
    activeAgents: Agent[]
    activeTaskCount: number
    queueSizes: Map<string, AgentTask[]>
    taskHistory: Map<string, AgentTaskResult>
  }
  getUsageStats?(): {
    totalTokens: number
    totalCost: number
    requestCount: number
    cacheHits: number
  }
  getRecentEvents?(limit?: number): AnalyticsEvent[]
  getSummary?(): {
    totalQueries: number
    averageResponseTime: number
    cacheHitRate: number
    errorRate: number
    mostUsedTools: Record<string, number>
    popularQueries: string[]
    performanceTrends: any[]
  }
}

export class DashboardMetricsCollector {
  private agentManager?: MetricsProvider
  private analyticsManager?: MetricsProvider
  private aiProvider?: MetricsProvider
  private startTime: number = Date.now()
  private recentResponseTimes: number[] = []
  private maxResponseTimeHistory = 50

  constructor(agentManager?: MetricsProvider, analyticsManager?: MetricsProvider, aiProvider?: MetricsProvider) {
    this.agentManager = agentManager
    this.analyticsManager = analyticsManager
    this.aiProvider = aiProvider
  }

  public addResponseTime(responseTime: number): void {
    this.recentResponseTimes.push(responseTime)
    if (this.recentResponseTimes.length > this.maxResponseTimeHistory) {
      this.recentResponseTimes = this.recentResponseTimes.slice(-this.maxResponseTimeHistory)
    }
  }

  public async collectMetrics(): Promise<DashboardMetrics> {
    const [agentMetrics, aiMetrics, toolMetrics] = await Promise.all([
      this.collectAgentMetrics(),
      this.collectAIMetrics(),
      this.collectToolMetrics(),
    ])

    return {
      agents: agentMetrics,
      performance: this.collectPerformanceMetrics(),
      ai: aiMetrics,
      tools: toolMetrics,
    }
  }

  private async collectAgentMetrics() {
    const defaultMetrics = {
      active: [],
      total: 0,
      busyCount: 0,
      tasks: { queued: 0, running: 0, completed: 0 },
    }

    if (!this.agentManager?.getAgentMetrics) {
      return defaultMetrics
    }

    try {
      const metrics = this.agentManager.getAgentMetrics()
      const activeAgents: AgentInfo[] = metrics.activeAgents.map((agent) => {
        const agentMetrics = agent.getMetrics()
        return {
          id: agent.id,
          name: agent.name || 'Unknown',
          status: agent.status as 'idle' | 'busy' | 'error',
          currentTask: agent.currentTasks > 0 ? `${agent.currentTasks} task(s)` : undefined,
          tasksCompleted: agentMetrics.tasksExecuted,
          uptime: agentMetrics.uptime,
        }
      })

      const busyCount = activeAgents.filter((agent) => agent.status === 'busy').length

      let totalQueued = 0
      for (const queue of metrics.queueSizes.values()) {
        totalQueued += queue.length
      }

      const totalCompleted = metrics.taskHistory.size

      return {
        active: activeAgents,
        total: metrics.activeAgents.length,
        busyCount,
        tasks: {
          queued: totalQueued,
          running: metrics.activeTaskCount,
          completed: totalCompleted,
        },
      }
    } catch (error) {
      return defaultMetrics
    }
  }

  private async collectAIMetrics() {
    const defaultMetrics = {
      totalTokens: 0,
      totalCost: 0,
      cacheHitRate: 0,
      requestsPerMin: 0,
    }

    if (!this.aiProvider?.getUsageStats) {
      return defaultMetrics
    }

    try {
      const stats = this.aiProvider.getUsageStats()
      const cacheHitRate = stats.requestCount > 0 ? (stats.cacheHits / stats.requestCount) * 100 : 0

      const uptimeMinutes = (Date.now() - this.startTime) / (1000 * 60)
      const requestsPerMin = uptimeMinutes > 0 ? stats.requestCount / uptimeMinutes : 0

      return {
        totalTokens: stats.totalTokens,
        totalCost: stats.totalCost,
        cacheHitRate: Math.round(cacheHitRate),
        requestsPerMin: Math.round(requestsPerMin),
      }
    } catch (error) {
      return defaultMetrics
    }
  }

  private async collectToolMetrics() {
    const defaultMetrics = {
      mostUsed: [],
      successRate: 0,
    }

    if (!this.analyticsManager?.getSummary) {
      return defaultMetrics
    }

    try {
      const summary = this.analyticsManager.getSummary()
      const mostUsed = Object.entries(summary.mostUsedTools)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      const successRate = Math.round((1 - summary.errorRate) * 100)

      return {
        mostUsed,
        successRate,
      }
    } catch (error) {
      return defaultMetrics
    }
  }

  private collectPerformanceMetrics() {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem

    const loadAvg = os.loadavg()
    const cpuUsage = Math.round(loadAvg[0] * 100)

    const uptime = Date.now() - this.startTime

    return {
      cpu: Math.min(cpuUsage, 100),
      memory: {
        used: Math.round((usedMem / 1024 / 1024 / 1024) * 100) / 100, // GB
        total: Math.round((totalMem / 1024 / 1024 / 1024) * 100) / 100, // GB
      },
      uptime,
      responseTimes: [...this.recentResponseTimes],
    }
  }
}
