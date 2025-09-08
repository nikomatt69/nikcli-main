import { BaseAgent } from '../base/BaseAgent';

export class AgentManager {
  private agents = new Map<string, BaseAgent>();
  private emitter = new (require('events').EventEmitter)();

  registerAgent(agent: BaseAgent) {
    this.agents.set(agent.name, agent);
    this.emitter.emit('agentRegistered', agent.name);
  }

  unregisterAgent(name: string) {
    const agent = this.agents.get(name);
    if (agent) {
      this.agents.delete(name);
      this.emitter.emit('agentUnregistered', name);
    }
  }

  async startAllAgents() {
    const startPromises = [];
    for (const agent of this.agents.values()) {
      if (!agent.started) {
        startPromises.push(agent.start());
      }
    }
    await Promise.all(startPromises);
    this.emitter.emit('allAgentsStarted');
  }

  async stopAllAgents() {
    const stopPromises = [];
    for (const agent of this.agents.values()) {
      if (agent.started) {
        stopPromises.push(agent.stop());
      }
    }
    await Promise.all(stopPromises);
    this.emitter.emit('allAgentsStopped');
  }

  getAgent(name: string): BaseAgent | undefined {
    return this.agents.get(name);
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  getStartedAgents(): BaseAgent[] {
    return this.getAllAgents().filter(agent => agent.started);
  }

  // Event handling
  on(event: string, listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void) {
    this.emitter.off(event, listener);
  }

  destroy() {
    this.stopAllAgents();
    this.agents.clear();
    this.emitter.removeAllListeners();
  }
}


