import { EventEmitter } from 'events';

export type AgentConfig = {
  name: string;
  description?: string;
};

// Discriminated union types for tasks
export type CreateTask = { type: 'create'; data: { title: string } };
export type UpdateTask = { type: 'update'; data: { id: string; patch: Partial<any> } };
export type DeleteTask = { type: 'delete'; data: { id: string } };
export type AgentTask = CreateTask | UpdateTask | DeleteTask;

export type Task = { id: string; type: string; data: unknown };

export abstract class BaseAgent extends EventEmitter {
  name: string;
  description?: string;
  private isStarted = false;
  private timers: NodeJS.Timeout[] = [];
  private intervals: ReturnType<typeof setInterval>[] = [];

  constructor(config: AgentConfig) {
    super();
    this.name = config.name;
    this.description = config.description;
  }

  // Lifecycle management
  async start(): Promise<void> {
    if (this.isStarted) {
      console.warn(`Agent ${this.name} is already started`);
      return;
    }
    
    this.isStarted = true;
    this.emit('started', this.name);
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    // Clear all timers and intervals
    this.timers.forEach(timer => clearTimeout(timer));
    this.intervals.forEach(interval => clearInterval(interval));
    this.timers = [];
    this.intervals = [];

    // Remove all listeners
    this.removeAllListeners('task');
    this.removeAllListeners('started');
    this.removeAllListeners('stopped');

    this.isStarted = false;
    this.emit('stopped', this.name);
  }

  // Utility methods for timer management
  protected setTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const timer = setTimeout(callback, delay);
    this.timers.push(timer);
    return timer;
  }

  protected setInterval(callback: () => void, delay: number): ReturnType<typeof setInterval> {
    const interval = setInterval(callback, delay);
    this.intervals.push(interval);
    return interval;
  }

  get started(): boolean {
    return this.isStarted;
  }
}


