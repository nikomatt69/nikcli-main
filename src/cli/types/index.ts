// ============================================================================
// Base Types - Foundation of entire type system
// ============================================================================

import { ToolResult } from '../tools';
import { BaseEvent } from './base-types';

export {
  // Error types
  type TaskError,
  createTaskError,
  // Status constants (immutable objects with const assertion)
  AGENT_STATUS,
  TASK_STATUS,
  TASK_PRIORITY,
  SANDBOX_MODE,
  LOG_LEVEL,
  AUTONOMY_LEVEL,
  // Status type unions
  type AgentStatus,
  type TaskStatus,
  type TaskPriority,
  type SandboxMode,
  type LogLevel,
  type AutonomyLevel,
  // Execution and context
  type ExecutionContext,
  type ToolResult,
  // Base interfaces
  type BaseTask,
  // Generic constraints
  type SafeRecord,
  type BaseEvent,
  // Validation utilities
  validateRange,
  isValidProgress,
  isValidTaskStatus,
  isValidTaskPriority,
  isValidAgentStatus,
  // Lifecycle pattern
  type Disposable,
  isDisposable,
} from './base-types';

// ============================================================================
// Core Types - Agent and task definitions
// ============================================================================

export {
  // Interfaces
  type Agent,
  type AgentTask,
  type WorkspaceInfo,
  type TypedToolResult,
  type ExecutionStep,
  // Type guards
  isAgent,
  isAgentTask,
  isSuccessfulResult,
  isFailedResult,
  // Factory functions
  createAgentTask,
  // Legacy enums (deprecated - use constants instead)
  AgentStatusEnum,
  TaskStatusEnum,
  TaskPriorityEnum,
} from '../core/types';

// ============================================================================
// Middleware Types - Request/response processing
// ============================================================================

export {
  // Interfaces
  type MiddlewareContext,
  type MiddlewareRequest,
  type MiddlewareResponse,
  type MiddlewareNext,
  type MiddlewareExecutionContext,
  type MiddlewareConfig,
  type MiddlewareCondition,
  type MiddlewareRegistration,
  type MiddlewareMetrics,
  type MiddlewareEvent,
  type MiddlewareChainResult,
  // Classes
  BaseMiddleware,
  // Enums
  MiddlewarePhase,
  // Type guards
  hasError,
  isSuccessResponse,
} from '../middleware/types';

// ============================================================================
// Planning Types - Execution plan generation and tracking
// ============================================================================

export {
  // Interfaces
  type RiskAssessment,
  type PlanningToolCapability,
  type ExecutionStep as PlanningExecutionStep,
  type ExecutionPlan,
  type StepExecutionResult,
  type PlanExecutionResult,
  type PlanApprovalRequest,
  type PlanApprovalResponse,
  type PlannerConfig,
  type PlanValidationResult,
  type PlannerContext,
  type PlanTodo,
  type ConversationContext,
  // Type guards
  isToolStep,
  isUserInputStep,
  // Utility functions
  calculatePlanRiskScore,
} from '../planning/types';

// ============================================================================
// Agent Types - Specialized agent definitions
// ============================================================================

export {
  // All agent-related types from dedicated agent types file
  type Agent as AgentInterface,
  type AgentMetadata,
  type AgentConfig,
  type AgentContext,
  type AgentEvent,
  type AgentMetrics,
  type AgentTask as AgentTaskInterface,
  type AgentTodo,
  type AgentWorkPlan,
  type ProjectAnalysis,
  type AgentPermissions,
  type RetryPolicy,
  type TaskArtifact,
  type TaskStep,
  type ExecutionPolicy,
  type AgentRegistryEntry,
  type AgentTaskResult,
} from './types';

// ============================================================================
// Additional Type Exports
// ============================================================================

// Export all types from specialized type files for backward compatibility
export * from './agent';
export * from './cache';
export * from './chat';
export * from './config';
export * from './errors';
export * from './orchestration';
export * from './output-styles';
export * from './project';
export * from './report';

export * from './taskmaster-types';
export * from './ui';

// ============================================================================
// Type Utilities and Helpers
// ============================================================================

/**
 * Helper type for extracting the type from a ToolResult
 * @example
 * ```ts
 * type StringResult = ToolResultType<ToolResult<string>> // string
 * ```
 */
export type ToolResultType<T> = T extends ToolResult<infer U> ? U : never;

/**
 * Helper type for making all properties optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Helper type for making all properties readonly recursively
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Helper type for event type mapping
 * Maps event type strings to their data types
 */
export type EventTypeMap = Record<string, BaseEvent<string>>;

// ============================================================================
// Version Info
// ============================================================================

/**
 * Type system version for compatibility checking
 */
export const TYPE_SYSTEM_VERSION = '1.0.3' as const;

/**
 * Supported type system features
 */
export const TYPE_SYSTEM_FEATURES = {
  BASE_TYPES: true,
  TYPE_GUARDS: true,
  FACTORY_FUNCTIONS: true,
  VALIDATION_UTILITIES: true,
  DISPOSABLE_PATTERN: true,
  DISCRIMINATED_UNIONS: false, // Planned for v1.1.0
  STRICT_GENERICS: true,
} as const;
