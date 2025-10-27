// ============================================================================
// Error and Status Types
// ============================================================================

/**
 * Structured error representation for better error handling and logging
 */
export interface TaskError {
  /** Error code for programmatic handling */
  readonly code: string;
  /** Human-readable error message */
  readonly message: string;
  /** Additional error details and context */
  readonly details?: Record<string, string | number | boolean>;
  /** Stack trace for debugging */
  readonly stack?: string;
  /** Timestamp when error occurred */
  readonly timestamp: Date;
}

/**
 * Create a TaskError from a standard Error or string
 */
export function createTaskError(
  error: Error | string,
  code: string = 'UNKNOWN_ERROR',
): TaskError {
  if (typeof error === 'string') {
    return {
      code,
      message: error,
      timestamp: new Date(),
    };
  }

  return {
    code,
    message: error.message,
    stack: error.stack,
    timestamp: new Date(),
  };
}

// ============================================================================
// Status Type Definitions (with const assertions for type safety)
// ============================================================================

/** Agent operational status values */
export const AGENT_STATUS = {
  INITIALIZING: 'initializing',
  READY: 'ready',
  BUSY: 'busy',
  ERROR: 'error',
  OFFLINE: 'offline',
} as const;

export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];

/** Task execution status values */
export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

/** Task priority levels */
export const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type TaskPriority = (typeof TASK_PRIORITY)[keyof typeof TASK_PRIORITY];

// ============================================================================
// Execution and Context Types
// ============================================================================

/**
 * Execution context for all CLI operations
 * Provides environment, configuration, and runtime information
 */
export interface ExecutionContext {
  /** Unique session identifier */
  readonly sessionId: string;
  /** Working directory for operations */
  readonly workspacePath: string;
  /** Current active agent identifier (optional) */
  readonly currentAgent?: string;
  /** Execution mode */
  readonly mode: 'default' | 'auto' | 'plan';
  /** User ID for audit logging */
  readonly userId?: string;
  /** Execution start time */
  readonly startTime: Date;
}

/**
 * Tool execution result
 */
export interface ToolResult<T = unknown> {
  /** Success indicator */
  readonly success: boolean;
  /** Execution result data (type-safe) */
  readonly output?: T;
  /** Error information if failed */
  readonly error?: TaskError;
  /** Additional execution metadata */
  readonly metadata?: Record<string, string | number | boolean>;
  /** Execution duration in milliseconds */
  readonly duration?: number;
}

// ============================================================================
// Base Task Interface
// ============================================================================

/**
 * Base interface for all task-like entities
 * Provides common fields and behavior for AgentTask and AgentTodo
 */
export interface BaseTask {
  /** Unique task identifier */
  readonly id: string;
  /** Human-readable task title */
  readonly title: string;
  /** Detailed task description */
  readonly description: string;
  /** Current execution status */
  readonly status: TaskStatus;
  /** Task priority level */
  readonly priority: TaskPriority;
  /** Task creation timestamp */
  readonly createdAt: Date;
  /** Task last update timestamp */
  readonly updatedAt: Date;
  /** Task completion timestamp (if completed) */
  readonly completedAt?: Date;
  /** Task progress percentage (0-100) */
  readonly progress: number; // @min 0 @max 100
  /** Estimated duration in milliseconds */
  readonly estimatedDuration?: number;
  /** Actual duration in milliseconds (if completed) */
  readonly actualDuration?: number;
  /** Dependencies on other task IDs */
  readonly dependencies?: readonly string[];
  /** Related metadata */
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Metadata and Configuration Types
// ============================================================================

/**
 * Sandbox execution mode (security levels)
 */
export const SANDBOX_MODE = {
  READ_ONLY: 'read-only',
  WORKSPACE_WRITE: 'workspace-write',
  SYSTEM_WRITE: 'system-write',
  DANGER_FULL_ACCESS: 'danger-full-access',
} as const;

export type SandboxMode = (typeof SANDBOX_MODE)[keyof typeof SANDBOX_MODE];

/**
 * Logging level configuration
 */
export const LOG_LEVEL = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace',
} as const;

export type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL];

/**
 * Autonomy level for agent operations
 */
export const AUTONOMY_LEVEL = {
  SUPERVISED: 'supervised',
  SEMI_AUTONOMOUS: 'semi-autonomous',
  FULLY_AUTONOMOUS: 'fully-autonomous',
} as const;

export type AutonomyLevel =
  (typeof AUTONOMY_LEVEL)[keyof typeof AUTONOMY_LEVEL];

// ============================================================================
// Lifecycle and Disposable Pattern
// ============================================================================

/**
 * Standard interface for resources that need cleanup
 */
export interface Disposable {
  /** Release all resources held by this object */
  dispose(): Promise<void> | void;
}

/**
 * Type guard for Disposable objects
 */
export const isDisposable = (value: unknown): value is Disposable =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Disposable).dispose === 'function';

// ============================================================================
// Generic Constraint Types
// ============================================================================

/**
 * Constrained record type for safer metadata handling
 */
export type SafeRecord = Record<string, string | number | boolean | null>;

/**
 * Generic event type with discriminated union support
 */
export interface BaseEvent<
  TType extends string,
  TData extends SafeRecord = SafeRecord,
> {
  readonly id: string;
  readonly type: TType;
  readonly timestamp: Date;
  readonly data: TData;
  readonly sessionId?: string;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validates that a value is within a range (inclusive)
 */
export function validateRange(
  value: number,
  min: number,
  max: number,
): boolean {
  return value >= min && value <= max;
}

/**
 * Validates progress value (0-100)
 */
export function isValidProgress(value: number): boolean {
  return validateRange(value, 0, 100);
}

/**
 * Validates that a status is valid
 */
export function isValidTaskStatus(status: unknown): status is TaskStatus {
  return Object.values(TASK_STATUS).includes(status as TaskStatus);
}

/**
 * Validates that a priority is valid
 */
export function isValidTaskPriority(
  priority: unknown,
): priority is TaskPriority {
  return Object.values(TASK_PRIORITY).includes(priority as TaskPriority);
}

/**
 * Validates that an agent status is valid
 */
export function isValidAgentStatus(status: unknown): status is AgentStatus {
  return Object.values(AGENT_STATUS).includes(status as AgentStatus);
}
