// TODO: Consider refactoring for reduced complexity
import type {
  BaseTask,
  TaskStatus,
  TaskPriority,
  AgentStatus,
  ExecutionContext,
  ToolResult,
  SafeRecord,
} from '../types/base-types';

// ============================================================================
// Agent Interface (Core Definition)
// ============================================================================

/**
 * Core agent definition
 * All specialized agents (React, Backend, DevOps, etc.) implement this interface
 *
 * @example
 * ```ts
 * class MyAgent implements Agent {
 *   readonly id = 'my-agent'
 *   readonly status = 'ready'
 *   // ... implement required methods
 * }
 * ```
 */
export interface Agent {
  /** Unique agent identifier */
  readonly id: string;
  /** Display name for the agent */
  readonly name: string;
  /** Detailed description of agent capabilities */
  readonly description: string;
  /** Specialized domain (e.g., 'react', 'backend', 'devops') */
  readonly specialization: string;
  /** List of capabilities this agent provides */
  readonly capabilities: readonly string[];
  /** Current operational status */
  readonly status: AgentStatus;
  /** Timestamp of last activity */
  readonly lastActivity?: Date;

  /**
   * Get current agent status
   * @returns Current operational status
   */
  getStatus(): AgentStatus;

  /**
   * Check if agent can handle a specific task
   * @param task - The task to evaluate
   * @returns true if agent can handle this task
   */
  canHandle(task: AgentTask): boolean;

  /**
   * Get detailed agent capabilities
   * @returns Array of capability strings
   */
  getCapabilities(): readonly string[];
}

// ============================================================================
// Task Definition
// ============================================================================

/**
 * Represents a unit of work for an agent
 * Extends BaseTask with agent-specific fields
 *
 * @example
 * ```ts
 * const task: AgentTask = {
 *   id: 'task-1',
 *   agentId: 'agent-1',
 *   title: 'Generate Component',
 *   description: 'Create a new React component',
 *   status: 'in_progress',
 *   priority: 'high',
 *   // ... other fields
 * }
 * ```
 */
export interface AgentTask extends BaseTask {
  /** Agent assigned to execute this task */
  readonly agentId: string;
  /** Retry count for failed executions */
  readonly retryCount?: number;
  /** Maximum allowed retries */
  readonly maxRetries?: number;
  /** Last error encountered (if any) */
  readonly lastError?: string;
  /** Task execution result (if completed) */
  readonly result?: unknown;
}

// ============================================================================
// Workspace Information
// ============================================================================

/**
 * Information about the current workspace/project
 * Used for context and analysis across operations
 */
export interface WorkspaceInfo {
  /** Absolute path to workspace root */
  readonly path: string;
  /** Workspace display name */
  readonly name: string;
  /** Type of workspace */
  readonly type: 'project' | 'workspace' | 'monorepo';
  /** Primary programming language */
  readonly language?: string;
  /** Framework or runtime (e.g., 'react', 'express') */
  readonly framework?: string;
  /** Package manager in use */
  readonly packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
  /** Additional workspace metadata */
  readonly metadata?: SafeRecord;
}

// ============================================================================
// Tool Integration
// ============================================================================

/**
 * Extended tool result with generic type support
 * Provides type-safe results from tool execution
 *
 * @template T - The type of output data
 *
 * @example
 * ```ts
 * const result: ToolResult<string> = await runTool('read-file', {
 *   path: 'file.ts'
 * })
 * ```
 */
export interface TypedToolResult<T = unknown> extends ToolResult<T> {
  /** Human-readable status message */
  readonly message?: string;
}

/**
 * Type guard for successful tool results
 * @param result - The result to check
 * @returns true if result indicates success
 */
export function isSuccessfulResult<T>(
  result: ToolResult<T>,
): result is ToolResult<T> & { output: T } {
  return result.success && result.output !== undefined;
}

/**
 * Type guard for failed tool results
 * @param result - The result to check
 * @returns true if result indicates failure
 */
export function isFailedResult(
  result: ToolResult,
): result is ToolResult & { error: NonNullable<ToolResult['error']> } {
  return !result.success && result.error !== undefined;
}

// ============================================================================
// Execution Planning
// ============================================================================

/**
 * Represents a single step in an execution plan
 * Used by the planning system to create and track execution sequences
 */
export interface ExecutionStep {
  /** Unique step identifier */
  readonly id: string;
  /** Step title for UI/logging */
  readonly title: string;
  /** Detailed step description */
  readonly description: string;
  /** Tool or operation to execute */
  readonly operation: string;
  /** Arguments for the operation */
  readonly args?: readonly unknown[];
  /** IDs of steps that must complete first */
  readonly dependencies?: readonly string[];
  /** Risk level of this step */
  readonly riskLevel: 'low' | 'medium' | 'high';
  /** Whether this step can be rolled back */
  readonly reversible: boolean;
  /** Estimated duration in milliseconds */
  readonly estimatedDuration?: number;
  /** Additional metadata */
  readonly metadata?: SafeRecord;
}

// ============================================================================
// Status Enums (Deprecated - Use constants from base-types.ts instead)
// ============================================================================

/**
 * @deprecated Use AGENT_STATUS constant instead
 * Agent lifecycle statuses
 */
export enum AgentStatusEnum {
  IDLE = 'idle',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ERROR = 'error',
  PAUSED = 'paused',
}

/**
 * @deprecated Use TASK_STATUS constant instead
 * Task execution statuses
 */
export enum TaskStatusEnum {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * @deprecated Use TASK_PRIORITY constant instead
 * Task priority levels
 */
export enum TaskPriorityEnum {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

// ============================================================================
// Type Guards and Utilities
// ============================================================================

/**
 * Type guard to check if an object is an Agent
 * @param value - The value to check
 * @returns true if value implements Agent interface
 */
export function isAgent(value: unknown): value is Agent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'status' in value &&
    typeof (value as Agent).getStatus === 'function'
  );
}

/**
 * Type guard to check if an object is an AgentTask
 * @param value - The value to check
 * @returns true if value implements AgentTask interface
 */
export function isAgentTask(value: unknown): value is AgentTask {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'agentId' in value &&
    'status' in value &&
    'priority' in value
  );
}

/**
 * Factory function to create an AgentTask
 * @param data - Partial task data
 * @returns Complete AgentTask with defaults
 */
export function createAgentTask(
  data: Partial<AgentTask> & { id: string; agentId: string; title: string },
): AgentTask {
  const now = new Date();

  return {
    description: data.description ?? '',
    status: data.status ?? ('pending' as TaskStatus),
    priority: data.priority ?? ('medium' as TaskPriority),
    progress: data.progress ?? 0,
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
    ...data,
  };
}
