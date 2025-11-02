// TODO: Consider refactoring for reduced complexity
import type { BaseTask, TaskError, SafeRecord } from '../types/base-types';
import type { ModuleContext } from '../core/module-manager';

// ============================================================================
// Middleware Context
// ============================================================================

/**
 * Extended context for middleware execution
 * Combines module context with request-specific information
 */
export interface MiddlewareContext extends ModuleContext {
  /** Unique request identifier for tracing */
  readonly requestId: string;
  /** Request timestamp */
  readonly timestamp: Date;
  /** User ID for audit logging (optional) */
  readonly userId?: string;
  /** Additional request metadata */
  readonly metadata: SafeRecord;
}

// ============================================================================
// Middleware Request/Response
// ============================================================================

/**
 * Request object passed through middleware chain
 * Represents an operation that needs to be executed
 */
export interface MiddlewareRequest {
  /** Unique request identifier */
  readonly id: string;
  /** Type of operation being requested */
  readonly type: 'command' | 'agent' | 'tool' | 'file';
  /** Specific operation name */
  readonly operation: string;
  /** Arguments passed to the operation */
  readonly args: readonly unknown[];
  /** Execution context */
  readonly context: MiddlewareContext;
  /** Request-specific metadata */
  readonly metadata: SafeRecord;
}

/**
 * Response object returned from middleware chain
 * Represents the outcome of request processing
 */
export interface MiddlewareResponse {
  /** Indicates whether operation succeeded */
  readonly success: boolean;
  /** Result data from successful operation */
  readonly data?: unknown;
  /** Error information if operation failed */
  readonly error?: TaskError | string;
  /** Response metadata */
  readonly metadata?: SafeRecord;
  /** Whether request was modified during processing */
  readonly modified?: boolean;
}

/**
 * Type guard to check if response has an error
 */
export function hasError(
  response: MiddlewareResponse,
): response is MiddlewareResponse & {
  error: TaskError | string;
} {
  return !response.success && response.error !== undefined;
}

/**
 * Type guard to check if response succeeded
 */
export function isSuccessResponse(
  response: MiddlewareResponse,
): response is MiddlewareResponse & {
  data: unknown;
} {
  return response.success && response.data !== undefined;
}

// ============================================================================
// Middleware Execution
// ============================================================================

/**
 * Function signature for passing control to next middleware
 */
export type MiddlewareNext = () => Promise<MiddlewareResponse>;

/**
 * Context tracking middleware execution
 * Maintains state as request flows through the chain
 */
export interface MiddlewareExecutionContext {
  /** Original request object */
  readonly request: MiddlewareRequest;
  /** Current response object (set after first middleware) */
  response?: MiddlewareResponse;
  /** When this execution started */
  readonly startTime: Date;
  /** When this execution ended (set after completion) */
  endTime?: Date;
  /** Total execution duration in milliseconds */
  duration?: number;
  /** Whether execution was halted */
  readonly aborted: boolean;
  /** Number of retry attempts made */
  readonly retries: number;
}

/**
 * Mutable version of MiddlewareExecutionContext for internal use
 */
export interface MutableMiddlewareExecutionContext {
  /** Original request object */
  readonly request: MiddlewareRequest;
  /** Current response object (set after first middleware) */
  response?: MiddlewareResponse;
  /** When this execution started */
  readonly startTime: Date;
  /** When this execution ended (set after completion) */
  endTime?: Date;
  /** Total execution duration in milliseconds */
  duration?: number;
  /** Whether execution was halted */
  aborted: boolean;
  /** Number of retry attempts made */
  retries: number;
}

// ============================================================================
// Middleware Configuration
// ============================================================================

/**
 * Configuration for middleware behavior
 */
export interface MiddlewareConfig {
  /** Enable or disable this middleware */
  readonly enabled: boolean;
  /** Execution priority (lower number = higher priority) */
  readonly priority: number;
  /** Conditions that must be met to execute */
  readonly conditions?: readonly MiddlewareCondition[];
  /** Execution timeout in milliseconds */
  readonly timeout?: number;
  /** Number of retry attempts */
  readonly retries?: number;
  /** Additional configuration metadata */
  readonly metadata?: SafeRecord;
}

/**
 * Mutable version of MiddlewareConfig for internal use
 */
export interface MutableMiddlewareConfig {
  /** Enable or disable this middleware */
  enabled: boolean;
  /** Execution priority (lower number = higher priority) */
  priority: number;
  /** Conditions that must be met to execute */
  conditions?: readonly MiddlewareCondition[];
  /** Execution timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Additional configuration metadata */
  metadata?: SafeRecord;
}

/**
 * Condition for middleware execution
 * Supports evaluating whether middleware should run
 */
export interface MiddlewareCondition {
  /** What part of request to evaluate */
  readonly type: 'operation' | 'args' | 'context' | 'custom';
  /** Field name to evaluate */
  readonly field: string;
  /** Comparison operator */
  readonly operator: 'equals' | 'contains' | 'matches' | 'custom';
  /** Expected value */
  readonly value: unknown;
  /** Custom evaluation function */
  readonly customFn?: (request: MiddlewareRequest) => boolean;
}

// ============================================================================
// Middleware Registration
// ============================================================================

/**
 * Registration information for a middleware
 */
export interface MiddlewareRegistration {
  /** Unique middleware name */
  readonly name: string;
  /** Middleware instance */
  readonly middleware: BaseMiddleware;
  /** Middleware configuration */
  readonly config: MiddlewareConfig;
}

/**
 * Mutable version of MiddlewareRegistration for internal use
 */
export interface MutableMiddlewareRegistration {
  /** Unique middleware name */
  readonly name: string;
  /** Middleware instance */
  readonly middleware: BaseMiddleware;
  /** Middleware configuration */
  config: MutableMiddlewareConfig;
}

/**
 * Base class for all middleware implementations
 * Provides common functionality and lifecycle management
 *
 * @example
 * ```ts
 * class LoggingMiddleware extends BaseMiddleware {
 *   constructor() {
 *     super('logging', 'Request logging middleware', {
 *       enabled: true,
 *       priority: 100,
 *     })
 *   }
 *
 *   async execute(request, next) {
 *     console.log('Request:', request.operation)
 *     const response = await next()
 *     console.log('Response:', response.success)
 *     return response
 *   }
 * }
 * ```
 */
export abstract class BaseMiddleware {
  /** Middleware name */
  public readonly name: string;
  /** Middleware description */
  public readonly description: string;
  /** Current configuration */
  protected config: MiddlewareConfig;

  /**
   * Initialize middleware
   * @param name - Unique middleware name
   * @param description - Human-readable description
   * @param config - Initial configuration
   */
  constructor(name: string, description: string, config: MiddlewareConfig) {
    this.name = name;
    this.description = description;
    this.config = config;
  }

  /**
   * Execute middleware logic
   * Must be implemented by subclasses
   *
   * @param request - The incoming request
   * @param next - Function to call next middleware
   * @param context - Execution context
   * @returns Response from this middleware or chain
   */
  abstract execute(
    request: MiddlewareRequest,
    next: MiddlewareNext,
    context: MiddlewareExecutionContext,
  ): Promise<MiddlewareResponse>;

  /**
   * Determine if middleware should execute for this request
   * Evaluates conditions if configured
   *
   * @param request - The incoming request
   * @returns true if middleware should execute
   */
  shouldExecute(request: MiddlewareRequest): boolean {
    if (!this.config.enabled) {
      return false;
    }

    if (!this.config.conditions) {
      return true;
    }

    return this.config.conditions.every((condition) =>
      this.evaluateCondition(condition, request),
    );
  }

  /**
   * Evaluate a single condition against the request
   * @param condition - Condition to evaluate
   * @param request - Request to evaluate against
   * @returns true if condition is met
   */
  protected evaluateCondition(
    condition: MiddlewareCondition,
    request: MiddlewareRequest,
  ): boolean {
    let fieldValue: unknown;

    switch (condition.type) {
      case 'operation':
        fieldValue = request.operation;
        break;
      case 'args':
        fieldValue = request.args;
        break;
      case 'context':
        fieldValue = (request.context as unknown as Record<string, unknown>)[
          condition.field
        ];
        break;
      case 'custom':
        return condition.customFn ? condition.customFn(request) : false;
      default:
        return false;
    }

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'contains':
        return Array.isArray(fieldValue)
          ? fieldValue.includes(condition.value)
          : String(fieldValue).includes(String(condition.value));
      case 'matches':
        return new RegExp(String(condition.value)).test(String(fieldValue));
      case 'custom':
        return condition.customFn ? condition.customFn(request) : false;
      default:
        return false;
    }
  }

  /**
   * Get current configuration
   * @returns Copy of configuration
   */
  getConfig(): MiddlewareConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param config - Partial configuration to merge
   */
  updateConfig(config: Partial<MiddlewareConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Middleware Lifecycle
// ============================================================================

/**
 * Execution phases in middleware lifecycle
 */
export enum MiddlewarePhase {
  BEFORE = 'before',
  AFTER = 'after',
  ERROR = 'error',
  FINALLY = 'finally',
}

// ============================================================================
// Middleware Monitoring and Metrics
// ============================================================================

/**
 * Performance metrics for middleware execution
 */
export interface MiddlewareMetrics {
  /** Total requests processed */
  readonly totalRequests: number;
  /** Successful requests */
  readonly successfulRequests: number;
  /** Failed requests */
  readonly failedRequests: number;
  /** Average execution time in milliseconds */
  readonly averageExecutionTime: number;
  /** Last execution timestamp */
  readonly lastExecutionTime?: Date;
  /** Error rate as percentage */
  readonly errorRate: number;
}

/**
 * Mutable version of MiddlewareMetrics for internal use
 */
export interface MutableMiddlewareMetrics {
  /** Total requests processed */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Average execution time in milliseconds */
  averageExecutionTime: number;
  /** Last execution timestamp */
  lastExecutionTime?: Date;
  /** Error rate as percentage */
  errorRate: number;
}

/**
 * Event emitted during middleware execution
 */
export interface MiddlewareEvent {
  /** Event type */
  readonly type: 'start' | 'complete' | 'error' | 'skip' | 'timeout';
  /** Name of middleware that triggered event */
  readonly middlewareName: string;
  /** Associated request ID */
  readonly requestId: string;
  /** When event occurred */
  readonly timestamp: Date;
  /** Execution duration if applicable */
  readonly duration?: number;
  /** Error if applicable */
  readonly error?: Error;
  /** Event metadata */
  readonly metadata?: SafeRecord;
}

/**
 * Result of executing an entire middleware chain
 */
export interface MiddlewareChainResult {
  /** Whether entire chain succeeded */
  readonly success: boolean;
  /** Final response from chain */
  readonly response?: MiddlewareResponse;
  /** Error if chain failed */
  readonly error?: Error;
  /** Names of executed middleware */
  readonly executedMiddleware: readonly string[];
  /** Names of skipped middleware */
  readonly skippedMiddleware: readonly string[];
  /** Total chain execution time in milliseconds */
  readonly totalDuration: number;
  /** Metrics for each middleware */
  readonly metrics: Record<string, MiddlewareMetrics>;
}
