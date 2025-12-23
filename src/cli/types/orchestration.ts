/**
 * Orchestration Types for NikCLI
 * Defines types for cognitive orchestration, state management, and system coordination
 */

import { z } from 'zod/v3';

// Orchestration Level Types
export const OrchestrationLevelSchema = z.enum(['minimal', 'basic', 'intermediate', 'advanced', 'expert', 'maximum'])

export const OrchestrationModeSchema = z.enum(['manual', 'semi-automatic', 'automatic', 'cognitive'])

// Cognitive State Types
export const CognitiveLoadSchema = z.object({
  current: z.number().min(0).max(100),
  peak: z.number().min(0).max(100),
  average: z.number().min(0).max(100),
  trend: z.enum(['increasing', 'decreasing', 'stable']),
})

export const CognitiveMetricsSchema = z.object({
  attention: z.number().min(0).max(1),
  comprehension: z.number().min(0).max(1),
  reasoningText: z.number().min(0).max(1),
  learning: z.number().min(0).max(1),
  adaptation: z.number().min(0).max(1),
})

export const CognitiveStateSchema = z.object({
  level: OrchestrationLevelSchema,
  mode: OrchestrationModeSchema,
  load: CognitiveLoadSchema,
  metrics: CognitiveMetricsSchema,
  activeProcesses: z.number(),
  memoryUsage: z.number(),
  lastUpdate: z.date(),
  adaptationEnabled: z.boolean(),
})

// Event System Types
export const EventPrioritySchema = z.enum(['low', 'medium', 'high', 'critical'])

export const EventTypeSchema = z.enum(['system', 'agent', 'task', 'ui', 'error', 'performance', 'security'])

export const EventMetadataSchema = z.record(z.unknown())

export const OrchestrationEventSchema = z.object({
  id: z.string(),
  type: EventTypeSchema,
  priority: EventPrioritySchema,
  source: z.string(),
  target: z.string().optional(),
  timestamp: z.date(),
  data: z.unknown(),
  metadata: EventMetadataSchema.optional(),
  correlationId: z.string().optional(),
})

// State Management Types
export const StateTransitionSchema = z.object({
  from: z.string(),
  to: z.string(),
  trigger: z.string(),
  conditions: z.array(z.string()).optional(),
  actions: z.array(z.string()).optional(),
})

export const SystemStateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  transitions: z.array(StateTransitionSchema),
  isActive: z.boolean(),
  enteredAt: z.date().optional(),
  exitedAt: z.date().optional(),
})

export const OrchestrationStateSchema = z.object({
  current: SystemStateSchema,
  history: z.array(SystemStateSchema),
  cognitiveState: CognitiveStateSchema,
  activeTasks: z.number(),
  pendingEvents: z.number(),
  lastTransition: z.date().optional(),
})

// Coordination Types
export const CoordinationRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  conditions: z.array(z.string()),
  actions: z.array(z.string()),
  priority: z.number(),
  enabled: z.boolean(),
})

export const CoordinationContextSchema = z.object({
  rules: z.array(CoordinationRuleSchema),
  activeRules: z.array(z.string()),
  lastEvaluation: z.date().optional(),
  performanceMetrics: z.record(z.number()).optional(),
})

// Performance Monitoring Types
export const PerformanceMetricSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  timestamp: z.date(),
  tags: z.record(z.string()).optional(),
})

export const PerformanceThresholdSchema = z.object({
  metric: z.string(),
  warning: z.number(),
  critical: z.number(),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']),
})

export const PerformanceAlertSchema = z.object({
  id: z.string(),
  metric: z.string(),
  value: z.number(),
  threshold: PerformanceThresholdSchema,
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string(),
  timestamp: z.date(),
  resolved: z.boolean(),
})

// Workflow Types
export const WorkflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['task', 'decision', 'parallel', 'join', 'end']),
  dependencies: z.array(z.string()).optional(),
  config: z.record(z.unknown()).optional(),
  timeout: z.number().optional(),
  retryCount: z.number().optional(),
})

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  steps: z.array(WorkflowStepSchema),
  status: z.enum(['draft', 'active', 'paused', 'completed', 'failed']),
  createdAt: z.date(),
  updatedAt: z.date(),
  executionCount: z.number().optional(),
})

// Exported Types
export type OrchestrationLevel = z.infer<typeof OrchestrationLevelSchema>
export type OrchestrationMode = z.infer<typeof OrchestrationModeSchema>
export type CognitiveLoad = z.infer<typeof CognitiveLoadSchema>
export type CognitiveMetrics = z.infer<typeof CognitiveMetricsSchema>
export type CognitiveState = z.infer<typeof CognitiveStateSchema>
export type EventPriority = z.infer<typeof EventPrioritySchema>
export type EventType = z.infer<typeof EventTypeSchema>
export type EventMetadata = z.infer<typeof EventMetadataSchema>
export type OrchestrationEvent<T = unknown> = Omit<z.infer<typeof OrchestrationEventSchema>, 'data'> & { data: T }
export type StateTransition = z.infer<typeof StateTransitionSchema>
export type SystemState = z.infer<typeof SystemStateSchema>
export type OrchestrationState = z.infer<typeof OrchestrationStateSchema>
export type CoordinationRule = z.infer<typeof CoordinationRuleSchema>
export type CoordinationContext = z.infer<typeof CoordinationContextSchema>
export type PerformanceMetric = z.infer<typeof PerformanceMetricSchema>
export type PerformanceThreshold = z.infer<typeof PerformanceThresholdSchema>
export type PerformanceAlert = z.infer<typeof PerformanceAlertSchema>
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>
export type Workflow = z.infer<typeof WorkflowSchema>

// Orchestration Interfaces
export interface Orchestrator<TState = unknown, TEvent = unknown> {
  getState(): TState
  transition(event: TEvent): Promise<boolean>
  canTransition(event: TEvent): boolean
  getAvailableTransitions(): string[]
  addListener(listener: OrchestrationListener<TState, TEvent>): void
  removeListener(listener: OrchestrationListener<TState, TEvent>): void
}

export interface OrchestrationListener<TState = unknown, TEvent = unknown> {
  onStateChange(from: TState, to: TState, event: TEvent): void
  onError(error: Error, state: TState): void
  onEvent(event: TEvent, state: TState): void
}

export interface CognitiveOrchestrator extends Orchestrator<CognitiveState, OrchestrationEvent> {
  adaptToLoad(load: CognitiveLoad): Promise<void>
  optimizePerformance(): Promise<PerformanceMetric[]>
  predictOptimalState(): Promise<CognitiveState>
  learnFromExecution(execution: WorkflowExecution): Promise<void>
}

export interface WorkflowExecution {
  workflowId: string
  executionId: string
  status: 'running' | 'completed' | 'failed' | 'paused'
  currentStep: string
  results: Record<string, unknown>
  errors: Error[]
  startedAt: Date
  completedAt?: Date
  duration: number
}

// Utility Types
export type EventHandler<T = unknown> = (event: OrchestrationEvent<T>) => void | Promise<void>
export type StatePredicate<T = unknown> = (state: T) => boolean
export type TransitionGuard<TState = unknown, TEvent = unknown> = (
  from: TState,
  to: TState,
  event: TEvent
) => boolean | Promise<boolean>

// Configuration Types
export interface OrchestrationConfig {
  level: OrchestrationLevel
  mode: OrchestrationMode
  enableCognitive: boolean
  enableLearning: boolean
  performanceMonitoring: boolean
  alertThresholds: PerformanceThreshold[]
  maxConcurrentTasks: number
  timeout: number
  retryAttempts: number
}
