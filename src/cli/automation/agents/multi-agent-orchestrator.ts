import type { AgentManager } from '../../core/agent-manager'

/**
 * Coordinates execution of todos across multiple agents
 * with a concurrency limit.
 */
export class MultiAgentOrchestrator {
  private agentManager: AgentManager

  constructor(agentManager: AgentManager) {
    this.agentManager = agentManager
  }

  async runParallel(concurrency: number = 3): Promise<void> {
    await this.agentManager.runParallel(concurrency)
  }
}
