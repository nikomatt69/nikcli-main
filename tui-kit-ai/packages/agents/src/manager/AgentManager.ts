import { BaseAgent } from '../base/BaseAgent';

export class AgentManager {
  private agents = new Map<string, BaseAgent>();

  registerAgent(agent: BaseAgent) {
    this.agents.set(agent.name, agent);
  }

  async startAllAgents() {
    for (const agent of this.agents.values()) {
      await agent.start();
    }
  }
}
