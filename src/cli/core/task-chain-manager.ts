import { EventEmitter } from 'node:events'
import { nanoid } from 'nanoid'
import chalk from 'chalk'
import { advancedUI } from '../ui/advanced-cli-ui'
import { EventBus, EventTypes } from '../automation/agents/event-bus'

export interface TaskChain {
  id: string
  name: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed'
  agents: string[]
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
  progress: number
  metadata: {
    rootTaskId?: string
    parentChainId?: string
    totalSteps: number
    completedSteps: number
  }
}

export interface TaskChainMember {
  agentId: string
  chainId: string
  joinedAt: Date
  role: 'primary' | 'secondary' | 'coordinator'
}

export class TaskChainManager extends EventEmitter {
  private static instance: TaskChainManager | null = null
  private chains: Map<string, TaskChain> = new Map()
  private agentToChain: Map<string, string> = new Map()

  private constructor() {
    super()
    this.setupEventListeners()
  }

  static getInstance(): TaskChainManager {
    if (!TaskChainManager.instance) {
      TaskChainManager.instance = new TaskChainManager()
    }
    return TaskChainManager.instance
  }

  private setupEventListeners(): void {
    const eventBus = EventBus.getInstance()
    eventBus.subscribe(EventTypes.TASK_COMPLETED, async (event: any) => {
      this.handleTaskCompleted(event.data?.agentId, event.data?.taskId)
    })
    eventBus.subscribe(EventTypes.TASK_FAILED, async (event: any) => {
      this.handleTaskFailed(event.data?.agentId, event.data?.taskId)
    })
  }

  createChain(options: {
    name: string
    rootTaskId?: string
    parentChainId?: string
  }): TaskChain {
    const chain: TaskChain = {
      id: `chain_${nanoid(10)}`,
      name: options.name,
      status: 'pending',
      agents: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      progress: 0,
      metadata: {
        rootTaskId: options.rootTaskId,
        parentChainId: options.parentChainId,
        totalSteps: 1,
        completedSteps: 0,
      },
    }
    this.chains.set(chain.id, chain)
    advancedUI.logInfo(chalk.cyan(`[TaskChain] Created: ${chain.name}`))
    return chain
  }

  addAgentToChain(chainId: string, agentId: string, role: TaskChainMember['role'] = 'secondary'): boolean {
    const chain = this.chains.get(chainId)
    if (!chain) return false
    if (!chain.agents.includes(agentId)) chain.agents.push(agentId)
    this.agentToChain.set(agentId, chainId)
    chain.updatedAt = new Date()
    chain.status = chain.status === 'pending' ? 'running' : chain.status
    return true
  }

  removeAgentFromChain(agentId: string): boolean {
    const chainId = this.agentToChain.get(agentId)
    if (!chainId) return false
    const chain = this.chains.get(chainId)
    if (chain) {
      chain.agents = chain.agents.filter((id) => id !== agentId)
      chain.updatedAt = new Date()
    }
    this.agentToChain.delete(agentId)
    return true
  }

  getChainForAgent(agentId: string): TaskChain | undefined {
    const chainId = this.agentToChain.get(agentId)
    return chainId ? this.chains.get(chainId) : undefined
  }

  isAgentInActiveChain(agentId: string): boolean {
    const chain = this.getChainForAgent(agentId)
    return chain !== undefined && (chain.status === 'running' || chain.status === 'pending')
  }

  updateProgress(chainId: string, completedSteps: number, totalSteps?: number): void {
    const chain = this.chains.get(chainId)
    if (!chain) return
    if (totalSteps) chain.metadata.totalSteps = totalSteps
    chain.metadata.completedSteps = completedSteps
    chain.progress = Math.round((completedSteps / chain.metadata.totalSteps) * 100)
    chain.updatedAt = new Date()
    if (chain.progress >= 100) this.completeChain(chainId)
  }

  completeChain(chainId: string): void {
    const chain = this.chains.get(chainId)
    if (!chain) return
    chain.status = 'completed'
    chain.completedAt = new Date()
    chain.progress = 100
    chain.updatedAt = new Date()
    for (const agentId of chain.agents) this.agentToChain.delete(agentId)
    advancedUI.logSuccess(chalk.green(`[TaskChain] Completed: ${chain.name}`))
  }

  failChain(chainId: string, reason: string): void {
    const chain = this.chains.get(chainId)
    if (!chain) return
    chain.status = 'failed'
    chain.completedAt = new Date()
    chain.updatedAt = new Date()
    for (const agentId of chain.agents) this.agentToChain.delete(agentId)
    advancedUI.logError(chalk.red(`[TaskChain] Failed: ${chain.name} - ${reason}`))
  }

  getActiveChains(): TaskChain[] {
    return Array.from(this.chains.values()).filter(
      (c) => c.status === 'running' || c.status === 'pending'
    )
  }

  getChainStatus(): { totalChains: number; activeChains: number; completedChains: number; failedChains: number; protectedAgents: number } {
    let active = 0, completed = 0, failed = 0
    for (const chain of this.chains.values()) {
      switch (chain.status) {
        case 'running': case 'pending': active++; break
        case 'completed': completed++; break
        case 'failed': failed++; break
      }
    }
    return { totalChains: this.chains.size, activeChains: active, completedChains: completed, failedChains: failed, protectedAgents: this.agentToChain.size }
  }

  private handleTaskCompleted(agentId: string, _taskId: string): void {
    if (!agentId) return
    const chain = this.getChainForAgent(agentId)
    if (chain) {
      chain.metadata.completedSteps++
      chain.progress = Math.round((chain.metadata.completedSteps / chain.metadata.totalSteps) * 100)
      chain.updatedAt = new Date()
      if (chain.progress >= 100) this.completeChain(chain.id)
    }
  }

  private handleTaskFailed(agentId: string, taskId: string): void {
    if (!agentId) return
    const chain = this.getChainForAgent(agentId)
    if (chain) this.failChain(chain.id, `Task ${taskId} failed`)
  }

  cleanupStaleChains(_maxAge: number = 30 * 60 * 1000): number {
    let cleaned = 0
    for (const [chainId, chain] of this.chains.entries()) {
      if ((chain.status === 'running' || chain.status === 'pending') && chain.updatedAt.getTime() + 60 * 60 * 1000 < Date.now()) {
        this.failChain(chainId, 'Stale chain - exceeded 1 hour without activity')
        cleaned++
      }
    }
    if (cleaned > 0) advancedUI.logInfo(chalk.gray(`[TaskChain] Cleaned ${cleaned} stale chains`))
    return cleaned
  }

  showDashboard(): void {
    const status = this.getChainStatus()
    const activeChains = this.getActiveChains()
    console.log(chalk.blue.bold('\n[TaskChain Manager]'))
    console.log(chalk.gray('='.repeat(40)))
    console.log(`Total: ${status.totalChains} | Active: ${status.activeChains} | Completed: ${status.completedChains} | Failed: ${status.failedChains}`)
    console.log(`Protected Agents: ${status.protectedAgents}`)
    if (activeChains.length > 0) {
      console.log(chalk.blue.bold('\nActive Chains:'))
      for (const chain of activeChains) {
        const bar = '█'.repeat(Math.round(chain.progress / 5)) + '░'.repeat(20 - Math.round(chain.progress / 5))
        console.log(`  ⚡ ${chalk.bold(chain.name)} [${bar}] ${chain.progress}%`)
        console.log(chalk.gray(`     Agents: ${chain.agents.join(', ')}`))
      }
    }
  }
}

export const taskChainManager = TaskChainManager.getInstance()
