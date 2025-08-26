/**
 * Core Types for Enterprise AI Agent System
 * Unified interfaces for production-ready agent architecture
 */

export type AgentStatus = 'initializing' | 'ready' | 'busy' | 'error' | 'offline';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Enterprise Agent Interface - Unifies all agent capabilities
 */
export interface Agent {
  // Identity and metadata
  id: string;
  name: string;
  description: string;
  specialization: string;
  capabilities: string[];
  version: string;

  // Status and state
  status: AgentStatus;
  currentTasks: number;
  maxConcurrentTasks: number;

  // Core lifecycle methods
  initialize(context?: AgentContext): Promise<void>;
  run(task: AgentTask): Promise<AgentTaskResult>;
  cleanup(): Promise<void>;

  // Task execution
  executeTodo(todo: AgentTodo): Promise<void>;
  executeTask(task: AgentTask): Promise<AgentTaskResult>;

  // State management
  getStatus(): AgentStatus;
  getMetrics(): AgentMetrics;
  getCapabilities(): string[];
  canHandle(task: AgentTask): boolean;

  // Configuration and guidance
  updateGuidance(guidance: string): void;
  updateConfiguration(config: Partial<AgentConfig>): void;
}

/**
 * Agent Task - Represents work to be done by an agent
 */
export interface AgentTask {
  id: string;
  type: 'user_request' | 'internal' | 'scheduled' | 'recovery' | 'vm-todo';
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;

  // Task data and context
  data: Record<string, any>;
  context?: AgentContext;

  // Timing and lifecycle
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  // Dependencies and requirements
  dependencies?: string[];
  requiredCapabilities?: string[];
  estimatedDuration?: number;
  timeout?: number;

  // Progress tracking
  progress: number; // 0-100
  steps?: TaskStep[];

  // Error handling
  retryCount?: number;
  maxRetries?: number;
  lastError?: string;
}

/**
 * Agent Todo - Specific actionable item for agents
 */
export interface AgentTodo {
  id: string;
  agentId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;

  // Timing
  createdAt: Date;
  updatedAt: Date;
  estimatedDuration?: number;
  actualDuration?: number;

  // Context and metadata
  tags: string[];
  context?: {
    files?: string[];
    commands?: string[];
    reasoning?: string;
    guidance?: string;
  };

  // Hierarchy and dependencies
  subtasks?: AgentTodo[];
  dependencies?: string[];
  progress: number; // 0-100
}

/**
 * Task execution step
 */
export interface TaskStep {
  id: string;
  title: string;
  status: TaskStatus;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

/**
 * Agent execution context
 */
export interface AgentContext {
  // Environment
  workingDirectory: string;
  projectPath: string;

  // Guidance and configuration
  guidance?: string;
  configuration?: AgentConfig;

  // User preferences and session
  userId?: string;
  sessionId?: string;
  userPreferences?: Record<string, any>;

  // Project information
  projectAnalysis?: ProjectAnalysis;
  availableTools?: string[];

  // Execution environment
  executionPolicy?: ExecutionPolicy;
  sandboxMode?: SandboxMode;
  approvalRequired?: boolean;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  // Behavior settings
  autonomyLevel: 'supervised' | 'semi-autonomous' | 'fully-autonomous';
  temperature?: number;
  maxTokens?: number;

  // Execution settings
  maxConcurrentTasks: number;
  defaultTimeout: number;
  retryPolicy: RetryPolicy;

  // Integration settings
  enabledTools: string[];
  guidanceFiles: string[];
  logLevel: LogLevel;

  // Security and permissions
  permissions: AgentPermissions;
  sandboxRestrictions: string[];
}

/**
 * Agent task execution result
 */
export interface AgentTaskResult {
  taskId: string;
  agentId: string;
  status: TaskStatus;

  // Results
  result?: any;
  output?: string;
  artifacts?: TaskArtifact[];

  // Execution details
  startTime: Date;
  endTime?: Date;
  duration?: number;

  // Error information
  error?: string;
  errorDetails?: any;

  // Metadata
  tokensUsed?: number;
  toolsUsed?: string[];
  filesModified?: string[];
  commandsExecuted?: string[];
}

/**
 * Agent performance metrics
 */
export interface AgentMetrics {
  // Task statistics
  tasksExecuted: number;
  tasksSucceeded: number;
  tasksFailed: number;
  tasksInProgress: number;

  // Performance metrics
  averageExecutionTime: number;
  totalExecutionTime: number;
  successRate: number;

  // Resource usage
  tokensConsumed: number;
  apiCallsTotal: number;

  // Activity tracking
  lastActive: Date;
  uptime: number;

  // Efficiency metrics
  productivity: number; // tasks completed per hour
  accuracy: number; // percentage of successful tasks
}

/**
 * Task artifact (files, outputs, etc.)
 */
export interface TaskArtifact {
  id: string;
  type: 'file' | 'output' | 'log' | 'screenshot' | 'data';
  name: string;
  path?: string;
  content?: string;
  size: number;
  mimeType?: string;
  createdAt: Date;
}

/**
 * Project analysis information
 */
export interface ProjectAnalysis {
  // Basic project info
  projectType: string;
  languages: string[];
  frameworks: string[];

  // Structure
  fileCount: number;
  directoryCount: number;
  totalSize: number;

  // Dependencies and tools
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;

  // Analysis results
  complexity: 'low' | 'medium' | 'high';
  maintainability: number;
  testCoverage?: number;
}

/**
 * Execution policy settings
 */
export interface ExecutionPolicy {
  approval: 'never' | 'untrusted' | 'on-failure' | 'always';
  sandbox: SandboxMode;
  timeoutMs: number;
  maxRetries: number;
}

export type SandboxMode = 'read-only' | 'workspace-write' | 'system-write' | 'danger-full-access';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

/**
 * Agent permissions system
 */
export interface AgentPermissions {
  // File system permissions
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canDeleteFiles: boolean;
  allowedPaths: string[];
  forbiddenPaths: string[];

  // Command execution
  canExecuteCommands: boolean;
  allowedCommands: string[];
  forbiddenCommands: string[];

  // Network and API access
  canAccessNetwork: boolean;
  allowedDomains: string[];

  // System operations
  canInstallPackages: boolean;
  canModifyConfig: boolean;
  canAccessSecrets: boolean;
}

/**
 * Agent work plan for complex tasks
 */
export interface AgentWorkPlan {
  id: string;
  agentId: string;
  goal: string;
  todos: AgentTodo[];

  // Planning information
  estimatedTimeTotal: number;
  actualTimeTotal?: number;
  complexity: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';

  // Status tracking
  status: TaskStatus;
  progress: number;
  createdAt: Date;
  completedAt?: Date;

  // Dependencies and resources
  requiredResources: string[];
  dependencies: string[];

  // Results
  results?: Record<string, any>;
  artifacts?: TaskArtifact[];
}

/**
 * Agent event for real-time monitoring
 */
export interface AgentEvent<T = any> {
  id: string;
  type: AgentEventType;
  agentId: string;
  timestamp: Date;
  data: T;
  sessionId?: string;
}

export type AgentEventType =
  | 'agent.initialized'
  | 'agent.status.changed'
  | 'task.started'
  | 'task.progress'
  | 'task.completed'
  | 'task.failed'
  | 'error.occurred'
  | 'guidance.updated'
  | 'config.changed';

/**
 * Agent registry entry
 */
export interface AgentRegistryEntry {
  agentClass: new (...args: any[]) => Agent;
  metadata: AgentMetadata;
  isEnabled: boolean;
}

/**
 * Agent metadata for registry
 */
export interface AgentMetadata {
  id: string;
  name: string;
  description: string;
  specialization: string;
  capabilities: string[];
  version: string;
  author?: string;
  category: string;
  tags: string[];
  requiresGuidance: boolean;
  defaultConfig: Partial<AgentConfig>;
}