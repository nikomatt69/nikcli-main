// ============================================================================
// Base Types - Foundation of entire type system
// ============================================================================

import type { ToolResult } from '../tools'
import type { BaseEvent } from './base-types'

export {
  // Status constants (immutable objects with const assertion)
  AGENT_STATUS,
  // Status type unions
  type AgentStatus,
  AUTONOMY_LEVEL,
  type AutonomyLevel,
  type BaseEvent,
  // Base interfaces
  type BaseTask,
  createTaskError,
  // Lifecycle pattern
  type Disposable,
  // Execution and context
  type ExecutionContext,
  isDisposable,
  isValidAgentStatus,
  isValidProgress,
  isValidTaskPriority,
  isValidTaskStatus,
  LOG_LEVEL,
  type LogLevel,
  SANDBOX_MODE,
  // Generic constraints
  type SafeRecord,
  type SandboxMode,
  TASK_PRIORITY,
  TASK_STATUS,
  // Error types
  type TaskError,
  type TaskPriority,
  type TaskStatus,
  type ToolResult,
  // Validation utilities
  validateRange,
} from './base-types'

// ============================================================================
// Core Types - Agent and task definitions
// ============================================================================

export {
  // Interfaces
  type Agent,
  // Legacy enums (deprecated - use constants instead)
  AgentStatusEnum,
  type AgentTask,
  // Factory functions
  createAgentTask,
  type ExecutionStep,
  // Type guards
  isAgent,
  isAgentTask,
  isFailedResult,
  isSuccessfulResult,
  TaskPriorityEnum,
  TaskStatusEnum,
  type TypedToolResult,
  type WorkspaceInfo,
} from '../core/types'

// ============================================================================
// Middleware Types - Request/response processing
// ============================================================================

export {
  // Classes
  BaseMiddleware,
  // Type guards
  hasError,
  isSuccessResponse,
  type MiddlewareChainResult,
  type MiddlewareCondition,
  type MiddlewareConfig,
  // Interfaces
  type MiddlewareContext,
  type MiddlewareEvent,
  type MiddlewareExecutionContext,
  type MiddlewareMetrics,
  type MiddlewareNext,
  // Enums
  MiddlewarePhase,
  type MiddlewareRegistration,
  type MiddlewareRequest,
  type MiddlewareResponse,
} from '../middleware/types'

// ============================================================================
// Planning Types - Execution plan generation and tracking
// ============================================================================

export {
  type ConversationContext,
  // Utility functions
  calculatePlanRiskScore,
  type ExecutionPlan,
  type ExecutionStep as PlanningExecutionStep,
  // Type guards
  isToolStep,
  isUserInputStep,
  type PlanApprovalRequest,
  type PlanApprovalResponse,
  type PlanExecutionResult,
  type PlannerConfig,
  type PlannerContext,
  type PlanningToolCapability,
  type PlanTodo,
  type PlanValidationResult,
  // Interfaces
  type RiskAssessment,
  type StepExecutionResult,
} from '../planning/types'

// ============================================================================
// Agent Types - Specialized agent definitions
// ============================================================================

export type {
  // All agent-related types from dedicated agent types file
  Agent as AgentInterface,
  AgentConfig,
  AgentContext,
  AgentEvent,
  AgentMetadata,
  AgentMetrics,
  AgentPermissions,
  AgentRegistryEntry,
  AgentTask as AgentTaskInterface,
  AgentTaskResult,
  AgentTodo,
  AgentWorkPlan,
  ExecutionPolicy,
  ProjectAnalysis,
  RetryPolicy,
  TaskArtifact,
  TaskStep,
} from './types'

// ============================================================================
// Additional Type Exports
// ============================================================================

// Export all types from specialized type files for backward compatibility
export * from './agent'
export * from './cache'
export * from './chat'
export * from './config'
export * from './errors'
export * from './orchestration'
export * from './output-styles'
export * from './project'
export * from './report'

export * from './taskmaster-types'
export * from './ui'

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
export type ToolResultType<T> = T extends ToolResult<infer U> ? U : never

/**
 * Helper type for making all properties optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

/**
 * Helper type for making all properties readonly recursively
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

/**
 * Helper type for event type mapping
 * Maps event type strings to their data types
 */
export type EventTypeMap = Record<string, BaseEvent<string>>

// ============================================================================
// Version Info
// ============================================================================

/**
 * Type system version for compatibility checking
 */
export const TYPE_SYSTEM_VERSION = '1.5.0' as const

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
} as const
