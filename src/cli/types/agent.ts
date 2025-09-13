/**
 * Agent Types for NikCLI
 * Defines types and interfaces for agent management, events, and communication
 */

import { z } from 'zod'

// Agent Event Types
export const AgentEventTypeSchema = z.enum([
  'task_started',
  'task_progress',
  'task_completed',
  'task_failed',
  'agent_selected',
  'tool_call',
  'tool_result',
  'status_changed',
])

export const AgentStatusSchema = z.enum(['idle', 'busy', 'error', 'offline', 'initializing'])

export const AgentEventMetadataSchema = z
  .object({
    agentId: z.string().optional(),
    taskId: z.string().optional(),
    progress: z.number().min(0).max(100).optional(),
    result: z.unknown().optional(),
    error: z.string().optional(),
    executionTime: z.number().optional(),
    toolName: z.string().optional(),
    toolArgs: z.record(z.unknown()).optional(),
  })
  .catchall(z.unknown())

export const AgentEventSchema = z.object({
  type: AgentEventTypeSchema,
  agentId: z.string(),
  taskId: z.string().optional(),
  timestamp: z.date(),
  metadata: AgentEventMetadataSchema.optional(),
})

// Cognition State Types
export const CognitionLevelSchema = z.enum(['basic', 'intermediate', 'advanced', 'expert'])

export const SystemLoadSchema = z.enum(['light', 'moderate', 'heavy', 'overloaded'])

export const CognitionStateSchema = z.object({
  level: CognitionLevelSchema,
  orchestrationLevel: z.number().min(1).max(10),
  systemLoad: SystemLoadSchema,
  activeAgents: z.number(),
  cognitiveScore: z.number().min(0).max(1).optional(),
  adaptationEnabled: z.boolean(),
  learningMode: z.boolean(),
})

// Agent Task Types
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical'])

export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled'])

export const TaskDependencySchema = z.object({
  taskId: z.string(),
  type: z.enum(['depends_on', 'blocks', 'parallel']),
})

export const AgentTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  agentId: z.string().optional(),
  dependencies: z.array(TaskDependencySchema).optional(),
  estimatedDuration: z.number().optional(), // in milliseconds
  actualDuration: z.number().optional(),
  progress: z.number().min(0).max(100).optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// Agent Capability Types
export const AgentCapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  supportedTasks: z.array(z.string()),
  performanceScore: z.number().min(0).max(100),
  isActive: z.boolean(),
})

// Agent Configuration Types
export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  capabilities: z.array(AgentCapabilitySchema),
  maxConcurrentTasks: z.number().positive(),
  timeout: z.number().positive(),
  retryAttempts: z.number().min(0),
  cognitiveLevel: CognitionLevelSchema,
  specialization: z.array(z.string()).optional(),
})

// Planning Types
export const PlanStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: TaskStatusSchema,
  agentId: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  estimatedDuration: z.number().optional(),
  progress: z.number().min(0).max(100).optional(),
})

export const ExecutionPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  steps: z.array(PlanStepSchema),
  status: TaskStatusSchema,
  totalEstimatedDuration: z.number().optional(),
  actualTotalDuration: z.number().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// Exported Types (inferred from schemas)
export type AgentEventType = z.infer<typeof AgentEventTypeSchema>
export type AgentStatus = z.infer<typeof AgentStatusSchema>
export type AgentEventMetadata = z.infer<typeof AgentEventMetadataSchema>
export type AgentEvent<T = unknown> = Omit<z.infer<typeof AgentEventSchema>, 'metadata'> & {
  metadata?: AgentEventMetadata & { result?: T; toolArgs?: Record<string, T> }
}
export type CognitionLevel = z.infer<typeof CognitionLevelSchema>
export type SystemLoad = z.infer<typeof SystemLoadSchema>
export type CognitionState = z.infer<typeof CognitionStateSchema>
export type TaskPriority = z.infer<typeof TaskPrioritySchema>
export type TaskStatus = z.infer<typeof TaskStatusSchema>
export type TaskDependency = z.infer<typeof TaskDependencySchema>
export type AgentTask = z.infer<typeof AgentTaskSchema>
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>
export type AgentConfig = z.infer<typeof AgentConfigSchema>
export type PlanStep = z.infer<typeof PlanStepSchema>
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>

// Generic Agent Event Handler
export interface AgentEventHandler<T = unknown> {
  canHandle(event: AgentEvent<T>): boolean
  handle(event: AgentEvent<T>): Promise<void> | void
  priority: number
}

// Agent Selector Interface
export interface AgentSelector {
  selectBestAgent(task: AgentTask, availableAgents: AgentConfig[]): Promise<AgentConfig | null>
  calculateScore(agent: AgentConfig, task: AgentTask): number
}

// Task Executor Interface
export interface TaskExecutor<TInput = unknown, TOutput = unknown> {
  execute(task: AgentTask, input: TInput): Promise<TOutput>
  canExecute(task: AgentTask): boolean
  getCapabilities(): AgentCapability[]
}
