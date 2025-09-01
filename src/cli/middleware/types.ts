import { ModuleContext } from '../core/module-manager';
import { AgentTask } from '../types/types';
import { ExecutionPolicyManager } from '../policies/execution-policy';

export interface MiddlewareContext extends ModuleContext {
  requestId: string;
  timestamp: Date;
  userId?: string;
  metadata: Record<string, any>;
}

export interface MiddlewareRequest {
  id: string;
  type: 'command' | 'agent' | 'tool' | 'file';
  operation: string;
  args: any[];
  context: MiddlewareContext;
  metadata: Record<string, any>;
}

export interface MiddlewareResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
  modified?: boolean;
}

export interface MiddlewareNext {
  (): Promise<MiddlewareResponse>;
}

export interface MiddlewareExecutionContext {
  request: MiddlewareRequest;
  response?: MiddlewareResponse;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  aborted: boolean;
  retries: number;
}

export interface MiddlewareConfig {
  enabled: boolean;
  priority: number;
  conditions?: MiddlewareCondition[];
  timeout?: number;
  retries?: number;
  metadata?: Record<string, any>;
}

export interface MiddlewareCondition {
  type: 'operation' | 'args' | 'context' | 'custom';
  field: string;
  operator: 'equals' | 'contains' | 'matches' | 'custom';
  value: any;
  customFn?: (request: MiddlewareRequest) => boolean;
}

export interface MiddlewareRegistration {
  name: string;
  middleware: BaseMiddleware;
  config: MiddlewareConfig;
}

export abstract class BaseMiddleware {
  public readonly name: string;
  public readonly description: string;
  protected config: MiddlewareConfig;

  constructor(name: string, description: string, config: MiddlewareConfig) {
    this.name = name;
    this.description = description;
    this.config = config;
  }

  abstract execute(
    request: MiddlewareRequest,
    next: MiddlewareNext,
    context: MiddlewareExecutionContext
  ): Promise<MiddlewareResponse>;

  shouldExecute(request: MiddlewareRequest): boolean {
    if (!this.config.enabled) return false;
    
    if (!this.config.conditions) return true;

    return this.config.conditions.every(condition => 
      this.evaluateCondition(condition, request)
    );
  }

  protected evaluateCondition(
    condition: MiddlewareCondition,
    request: MiddlewareRequest
  ): boolean {
    let fieldValue: any;

    switch (condition.type) {
      case 'operation':
        fieldValue = request.operation;
        break;
      case 'args':
        fieldValue = request.args;
        break;
      case 'context':
        fieldValue = (request.context as any)[condition.field];
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
        return new RegExp(condition.value).test(String(fieldValue));
      case 'custom':
        return condition.customFn ? condition.customFn(request) : false;
      default:
        return false;
    }
  }

  getConfig(): MiddlewareConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<MiddlewareConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export enum MiddlewarePhase {
  BEFORE = 'before',
  AFTER = 'after',
  ERROR = 'error',
  FINALLY = 'finally'
}

export interface MiddlewareMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageExecutionTime: number;
  lastExecutionTime?: Date;
  errorRate: number;
}

export interface MiddlewareEvent {
  type: 'start' | 'complete' | 'error' | 'skip' | 'timeout';
  middlewareName: string;
  requestId: string;
  timestamp: Date;
  duration?: number;
  error?: Error;
  metadata?: Record<string, any>;
}

export interface MiddlewareChainResult {
  success: boolean;
  response?: MiddlewareResponse;
  error?: Error;
  executedMiddleware: string[];
  skippedMiddleware: string[];
  totalDuration: number;
  metrics: Record<string, MiddlewareMetrics>;
}