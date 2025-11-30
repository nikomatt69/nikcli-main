// TODO: Consider refactoring for reduced complexity
import type { BaseTask, SafeRecord, TaskPriority, TaskStatus } from '../types/base-types'

// ============================================================================
// Risk Assessment
// ============================================================================

/**
 * Assessment of risk level for an operation or plan
 */
export interface RiskAssessment {
  /** Overall risk level */
  readonly overallRisk: 'low' | 'medium' | 'high'
  /** Count of destructive operations */
  readonly destructiveOperations: number
  /** Count of file modifications */
  readonly fileModifications: number
  /** Count of external API calls */
  readonly externalCalls: number
}

// ============================================================================
// Tool Capability Discovery
// ============================================================================

/**
 * Information about a capability provided by a tool
 * Used to understand what operations are available
 */
export interface PlanningToolCapability {
  /** Tool capability name */
  readonly name: string
  /** Human-readable description */
  readonly description: string
  /** Risk level of using this capability */
  readonly riskLevel: 'low' | 'medium' | 'high'
  /** Whether operation can be undone */
  readonly reversible: boolean
  /** Estimated execution duration in milliseconds */
  readonly estimatedDuration: number
  /** Required arguments for this capability */
  readonly requiredArgs: readonly string[]
  /** Optional arguments */
  readonly optionalArgs: readonly string[]
}

// ============================================================================
// Execution Steps
// ============================================================================

/**
 * Single step in an execution plan
 * Represents an atomic operation to be performed
 *
 * @example
 * ```ts
 * const step: ExecutionStep = {
 *   id: 'step-1',
 *   type: 'tool',
 *   title: 'Create Component',
 *   description: 'Generate a new React component file',
 *   toolName: 'generate-component',
 *   toolArgs: { name: 'Button', type: 'functional' },
 *   riskLevel: 'low',
 *   reversible: true,
 * }
 * ```
 */
export interface ExecutionStep {
  /** Unique step identifier */
  readonly id: string
  /** Type of step to execute */
  readonly type: 'tool' | 'validation' | 'user_input' | 'decision'
  /** Display title for the step */
  readonly title: string
  /** Detailed description of what step does */
  readonly description: string
  /** Tool name (if type is 'tool') */
  readonly toolName?: string
  /** Arguments to pass to tool */
  readonly toolArgs?: SafeRecord
  /** IDs of steps that must complete before this one */
  readonly dependencies?: readonly string[]
  /** Estimated time to complete in milliseconds */
  readonly estimatedDuration?: number
  /** Risk level of this operation */
  readonly riskLevel: 'low' | 'medium' | 'high'
  /** Whether this step can be rolled back */
  readonly reversible: boolean
  /** Additional metadata for this step */
  readonly metadata?: SafeRecord
}

// ============================================================================
// Execution Plan
// ============================================================================

/**
 * Complete plan for executing a complex operation
 * Contains all steps, context, and metadata needed for execution
 *
 * @example
 * ```ts
 * const plan: ExecutionPlan = {
 *   id: 'plan-1',
 *   title: 'Setup React Project',
 *   description: 'Initialize a new React project with dependencies',
 *   steps: [step1, step2, step3],
 *   todos: [todo1, todo2],
 *   status: 'pending',
 *   estimatedTotalDuration: 30000,
 *   riskAssessment: { ... },
 *   createdAt: new Date(),
 *   createdBy: 'react-agent',
 *   context: { ... }
 * }
 * ```
 */
export interface ExecutionPlan {
  /** Unique plan identifier */
  readonly id: string
  /** Plan title */
  readonly title: string
  /** Plan description */
  readonly description: string
  /** Ordered list of steps to execute */
  readonly steps: readonly ExecutionStep[]
  /** Related todo items */
  readonly todos: readonly PlanTodo[]
  /** Current execution status */
  readonly status: 'pending' | 'running' | 'completed' | 'failed'
  /** Estimated total duration in milliseconds */
  readonly estimatedTotalDuration: number
  /** Actual duration if completed */
  readonly actualDuration?: number
  /** Risk assessment for entire plan */
  readonly riskAssessment: RiskAssessment
  /** When plan was created */
  readonly createdAt: Date
  /** Agent that created this plan */
  readonly createdBy: string
  /** Execution context and metadata */
  readonly context: {
    /** Original user request */
    userRequest: string
    /** Project path for operation */
    projectPath: string
    /** Files relevant to this plan */
    relevantFiles?: readonly string[]
    /** Planning reasoning (explanation of choices) */
    reasoning?: string
    /** Whether this is a simple plan (few steps) */
    simple?: boolean
  }
}

/**
 * Mutable version of ExecutionPlan for internal use
 */
export interface MutableExecutionPlan {
  /** Unique plan identifier */
  readonly id: string
  /** Plan title */
  title: string
  /** Plan description */
  description: string
  /** Ordered list of steps to execute */
  steps: ExecutionStep[]
  /** Related todo items */
  todos: MutablePlanTodo[]
  /** Current execution status */
  status: 'pending' | 'running' | 'completed' | 'failed'
  /** Estimated total duration in milliseconds */
  estimatedTotalDuration: number
  /** Actual duration if completed */
  actualDuration?: number
  /** Risk assessment for entire plan */
  riskAssessment: RiskAssessment
  /** When plan was created */
  readonly createdAt: Date
  /** Agent that created this plan */
  createdBy: string
  /** Execution context and metadata */
  context: {
    /** Original user request */
    userRequest: string
    /** Project path for operation */
    projectPath: string
    /** Files relevant to this plan */
    relevantFiles?: string[]
    /** Planning reasoning (explanation of choices) */
    reasoning?: string
    /** Whether this is a simple plan (few steps) */
    simple?: boolean
  }
}

// ============================================================================
// Step Execution Results
// ============================================================================

/**
 * Result of executing a single step
 */
export interface StepExecutionResult {
  /** ID of executed step */
  readonly stepId: string
  /** Outcome of execution */
  readonly status: 'success' | 'failure' | 'skipped' | 'cancelled'
  /** Output data from step */
  readonly output?: unknown
  /** Error if step failed */
  readonly error?: Error
  /** How long step took to execute in milliseconds */
  readonly duration: number
  /** When step was executed */
  readonly timestamp: Date
  /** Execution logs */
  readonly logs?: readonly string[]
}

/**
 * Mutable version of StepExecutionResult for internal use
 */
export interface MutableStepExecutionResult {
  /** ID of executed step */
  readonly stepId: string
  /** Outcome of execution */
  status: 'success' | 'failure' | 'skipped' | 'cancelled'
  /** Output data from step */
  output?: unknown
  /** Error if step failed */
  error?: Error
  /** How long step took to execute in milliseconds */
  duration: number
  /** When step was executed */
  readonly timestamp: Date
  /** Execution logs */
  logs?: string[]
}

/**
 * Complete result of executing a plan
 */
export interface PlanExecutionResult {
  /** ID of executed plan */
  readonly planId: string
  /** Overall execution status */
  readonly status: 'completed' | 'failed' | 'cancelled' | 'partial'
  /** When execution started */
  readonly startTime: Date
  /** When execution ended */
  readonly endTime?: Date
  /** Results for each step */
  readonly stepResults: readonly StepExecutionResult[]
  /** Summary statistics */
  readonly summary: {
    /** Total number of steps */
    totalSteps: number
    /** Steps completed successfully */
    successfulSteps: number
    /** Steps that failed */
    failedSteps: number
    /** Steps that were skipped */
    skippedSteps: number
  }
}

/**
 * Mutable version of PlanExecutionResult for internal use
 */
export interface MutablePlanExecutionResult {
  /** ID of executed plan */
  readonly planId: string
  /** Overall execution status */
  status: 'completed' | 'failed' | 'cancelled' | 'partial'
  /** When execution started */
  readonly startTime: Date
  /** When execution ended */
  endTime?: Date
  /** Results for each step */
  stepResults: MutableStepExecutionResult[]
  /** Summary statistics */
  summary: {
    /** Total number of steps */
    totalSteps: number
    /** Steps completed successfully */
    successfulSteps: number
    /** Steps that failed */
    failedSteps: number
    /** Steps that were skipped */
    skippedSteps: number
  }
}

// ============================================================================
// Plan Approval
// ============================================================================

/**
 * Request for user approval of a plan
 * Used when plan contains risky operations or user approval is required
 */
export interface PlanApprovalRequest {
  /** Plan requiring approval */
  readonly plan: ExecutionPlan
  /** When approval was requested */
  readonly timestamp: Date
  /** Whether confirmation is required before execution */
  readonly requiresConfirmation: boolean
  /** Warning messages about risky operations */
  readonly warningMessages?: readonly string[]
}

/**
 * User response to plan approval request
 */
export interface PlanApprovalResponse {
  /** Whether user approved the plan */
  readonly approved: boolean
  /** IDs of steps user wants to skip */
  readonly modifiedSteps?: readonly string[]
  /** User's comments about the plan */
  readonly userComments?: string
  /** When approval decision was made */
  readonly timestamp: Date
}

// ============================================================================
// Planner Configuration
// ============================================================================

/**
 * Configuration for the planning system
 */
export interface PlannerConfig {
  /** Maximum number of steps allowed in a single plan */
  readonly maxStepsPerPlan: number
  /** Risk level that requires user approval */
  readonly requireApprovalForRisk: 'medium' | 'high'
  /** Enable automatic rollback on failure */
  readonly enableRollback: boolean
  /** Logging verbosity level */
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error'
  /** Timeout per step in milliseconds */
  readonly timeoutPerStep: number
  /** Auto-approve read-only operations */
  readonly autoApproveReadonly?: boolean
}

// ============================================================================
// Plan Validation
// ============================================================================

/**
 * Result of plan validation
 */
export interface PlanValidationResult {
  /** Whether plan is valid */
  readonly isValid: boolean
  /** Validation errors */
  readonly errors: readonly string[]
  /** Non-critical warnings */
  readonly warnings: readonly string[]
  /** Suggestions for improvement */
  readonly suggestions: readonly string[]
}

// ============================================================================
// Planner Context
// ============================================================================

/**
 * Context information for plan generation
 */
export interface PlannerContext {
  /** User's original request */
  readonly userRequest: string
  /** Project root path */
  readonly projectPath: string
  /** Available tools for planning */
  readonly availableTools: readonly PlanningToolCapability[]
  /** Analysis of the project */
  readonly projectAnalysis?: {
    /** Number of files in project */
    fileCount: number
    /** Languages used in project */
    languages: readonly string[]
    /** Frameworks detected */
    frameworks: readonly string[]
    /** Whether project has tests */
    hasTests: boolean
    /** Whether project has documentation */
    hasDocumentation: boolean
  }
  /** User preferences for planning */
  readonly userPreferences?: {
    /** How much risk user is willing to accept */
    riskTolerance: 'conservative' | 'moderate' | 'aggressive'
    /** Tools user prefers to use */
    preferredTools: readonly string[]
    /** Operations to avoid */
    excludedOperations: readonly string[]
  }
}

// ============================================================================
// Plan Todos
// ============================================================================

/**
 * Individual todo item within a plan
 * Extends BaseTask with plan-specific fields
 */
export interface PlanTodo extends BaseTask {
  /** Title of the todo */
  readonly title: string
  /** Detailed description */
  readonly description: string
  /** Agent assigned to this todo */
  readonly assignedAgent?: string
  /** Reasoning for this todo */
  readonly reasoning?: string
  /** Tools needed to complete this todo */
  readonly tools?: readonly string[]
}

/**
 * Mutable version of PlanTodo for internal use
 */
export interface MutablePlanTodo {
  /** Unique task identifier */
  readonly id: string
  /** Human-readable task title */
  title: string
  /** Detailed task description */
  description: string
  /** Current execution status */
  status: TaskStatus
  /** Task priority level */
  priority: TaskPriority
  /** Task creation timestamp */
  readonly createdAt: Date
  /** Task last update timestamp */
  updatedAt: Date
  /** Task completion timestamp (if completed) */
  completedAt?: Date
  /** Task progress percentage (0-100) */
  progress: number
  /** Estimated duration in milliseconds */
  estimatedDuration?: number
  /** Actual duration in milliseconds (if completed) */
  actualDuration?: number
  /** Dependencies on other task IDs */
  dependencies?: string[]
  /** Related metadata */
  metadata?: Record<string, unknown>
  /** Agent assigned to this todo */
  assignedAgent?: string
  /** Reasoning for this todo */
  reasoning?: string
  /** Tools needed to complete this todo */
  tools?: string[]
}

// ============================================================================
// Conversation Context
// ============================================================================

/**
 * Context of ongoing conversation for multi-turn planning
 */
export interface ConversationContext {
  /** Message history */
  readonly messages: readonly {
    /** Who sent the message */
    role: 'user' | 'assistant' | 'system'
    /** Message content */
    content: string
    /** When message was sent */
    timestamp: Date
  }[]
  /** Conversation session ID */
  readonly sessionId: string
  /** Project analysis from earlier in conversation */
  readonly workspaceAnalysis?: unknown
  /** Files currently being worked on */
  readonly activeFiles?: readonly string[]
  /** Last modification time in workspace */
  readonly lastModified?: Date
}

// ============================================================================
// Type Guards and Utilities
// ============================================================================

/**
 * Type guard to check if step is a tool invocation
 * @param step - The step to check
 * @returns true if step executes a tool
 */
export function isToolStep(step: ExecutionStep): step is ExecutionStep & { toolName: string } {
  return step.type === 'tool' && step.toolName !== undefined
}

/**
 * Type guard to check if step requires user input
 * @param step - The step to check
 * @returns true if step requires user interaction
 */
export function isUserInputStep(step: ExecutionStep): boolean {
  return step.type === 'user_input' || step.type === 'decision'
}

/**
 * Calculate total risk score for a plan
 * @param plan - The plan to assess
 * @returns Risk score 0-100
 */
export function calculatePlanRiskScore(plan: ExecutionPlan): number {
  const riskAssessment = plan.riskAssessment
  let score = 0

  // Base score from overall risk
  if (riskAssessment.overallRisk === 'high') score += 50
  else if (riskAssessment.overallRisk === 'medium') score += 25

  // Add points for destructive operations
  score += Math.min(riskAssessment.destructiveOperations * 5, 20)

  // Add points for file modifications
  score += Math.min(riskAssessment.fileModifications * 3, 15)

  // Add points for external calls
  score += Math.min(riskAssessment.externalCalls * 2, 10)

  return Math.min(score, 100)
}
