export type AgentConfig = {
  name: string;
  description?: string;
};

export type Task = { id: string; type: string; data: unknown };

export abstract class BaseAgent {
  name: string;
  description?: string;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.description = config.description;
  }

  abstract start(): Promise<void> | void;
}
