import { create } from 'zustand';
import { Agent } from '../types/agent';

interface AgentState {
  agents: Agent[];
  runningAgents: number;
  addAgent: (agent: Agent) => void;
  removeAgent: (id: string) => void;
  updateAgentStatus: (id: string, status: 'idle' | 'running' | 'completed' | 'error') => void;
}

export const AgentStore = create<AgentState>((set) => ({
  agents: [],
  runningAgents: 0,
  addAgent: (agent) => set((state) => ({
    agents: [...state.agents, agent],
    runningAgents: state.runningAgents + 1,
  })),
  removeAgent: (id) => set((state) => ({
    agents: state.agents.filter((agent) => agent.id !== id),
    runningAgents: state.runningAgents - 1,
  })),
  updateAgentStatus: (id, status) => set((state) => ({
    agents: state.agents.map((agent) =>

      agent.id === id ? { ...agent, status } : agent
    ),
  })),
}));
