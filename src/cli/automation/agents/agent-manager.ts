import { Agent } from './types';
import { BaseAgent } from './base-agent';

// Type for concrete agent classes that extend BaseAgent
type ConcreteAgentClass = new (workingDirectory?: string) => BaseAgent;

export class AgentManager {
  private agents: Map<string, ConcreteAgentClass> = new Map();
  private workingDirectory: string;

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
  }

  registerAgent(agentClass: ConcreteAgentClass): void {
    // Create a temporary instance to get the name
    const tempInstance = new agentClass(this.workingDirectory);
    if (!tempInstance.id) {
      throw new Error('Agent class must have an id property');
    }
    this.agents.set(tempInstance.id, agentClass);
  }

  getAgent(name: string): BaseAgent | null {
    const AgentClass = this.agents.get(name);
    if (!AgentClass) return null;
    return new AgentClass(this.workingDirectory);
  }

  listAgents(): BaseAgent[] {
    return Array.from(this.agents.values()).map(AgentClass => new AgentClass(this.workingDirectory));
  }

  getAvailableAgentNames(): string[] {
    return Array.from(this.agents.keys());
  }
}
