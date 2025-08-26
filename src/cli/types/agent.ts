export interface Agent {
  id: string;
  name: string;
  type: 'analysis' | 'generation' | 'review' | 'optimization';
  status: 'idle' | 'running' | 'completed' | 'error';
  task: string;
  progress: number;
  results?: any;
  error?: string;
}

export interface AgentConfig {
  apiKey: string;
  model: string;
  maxConcurrency: number;
  timeout: number;
}
