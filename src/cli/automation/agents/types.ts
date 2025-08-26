export interface Agent {
  name: string;
  description: string;
  initialize(): Promise<void>;
  run(task?: string): Promise<any>;
  cleanup(): Promise<void>;
}
