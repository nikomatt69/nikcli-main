/**
 * Core types for the CLI system
 */

export interface Agent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  status: AgentStatus;
  lastActivity?: Date;
}

export enum AgentStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ERROR = 'error',
  PAUSED = 'paused'
}

export interface AgentTask {
  id: string;
  agentId: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  updatedAt: Date;
  result?: any;
  error?: string;
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export interface WorkspaceInfo {
  path: string;
  name: string;
  type: 'project' | 'workspace';
  language?: string;
  framework?: string;
  packageManager?: string;
}

export interface ExecutionContext {
  workspacePath: string;
  currentAgent?: string;
  mode: 'default' | 'auto' | 'plan';
  sessionId: string;
}

export interface ToolResult {
  success: boolean;
  output?: any;
  error?: string;
  metadata?: Record<string, any>;
}
