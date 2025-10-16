/**
 * NikCLI SDK Types
 * Core type definitions for building TTY applications and CLI agents
 */

import { z } from 'zod'

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Agent Status Types
 */
export const AgentStatusSchema = z.enum(['idle', 'busy', 'error', 'offline', 'initializing'])
export type AgentStatus = z.infer<typeof AgentStatusSchema>

/**
 * Task Status Types
 */
export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled'])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

/**
 * Task Priority Types
 */
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical'])
export type TaskPriority = z.infer<typeof TaskPrioritySchema>

/**
 * Log Level Types
 */
export const LogLevelSchema = z.enum(['error', 'warn', 'info', 'debug', 'trace'])
export type LogLevel = z.infer<typeof LogLevelSchema>

// ============================================================================
// AGENT TYPES
// ============================================================================

/**
 * Agent Capability Schema
 */
export const AgentCapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  supportedTasks: z.array(z.string()),
  performanceScore: z.number().min(0).max(100),
  isActive: z.boolean(),
})

/**
 * Agent Configuration Schema
 */
export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  specialization: z.string(),
  capabilities: z.array(AgentCapabilitySchema),
  maxConcurrentTasks: z.number().positive(),
  timeout: z.number().positive(),
  retryAttempts: z.number().min(0),
  autonomyLevel: z.enum(['supervised', 'semi-autonomous', 'fully-autonomous']),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
})

/**
 * Agent Task Schema
 */
export const AgentTaskSchema = z.object({
  id: z.string(),
  type: z.enum(['user_request', 'internal', 'scheduled', 'recovery']),
  title: z.string(),
  description: z.string(),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  data: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  dependencies: z.array(z.string()).optional(),
  requiredCapabilities: z.array(z.string()).optional(),
  estimatedDuration: z.number().optional(),
  timeout: z.number().optional(),
  progress: z.number().min(0).max(100).optional(),
  retryCount: z.number().min(0).optional(),
  maxRetries: z.number().min(0).optional(),
  lastError: z.string().optional(),
})

/**
 * Agent Task Result Schema
 */
export const AgentTaskResultSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
  status: TaskStatusSchema,
  result: z.unknown().optional(),
  output: z.string().optional(),
  artifacts: z.array(z.object({
    id: z.string(),
    type: z.enum(['file', 'output', 'log', 'screenshot', 'data']),
    name: z.string(),
    path: z.string().optional(),
    content: z.string().optional(),
    size: z.number(),
    mimeType: z.string().optional(),
    createdAt: z.date(),
  })).optional(),
  startTime: z.date(),
  endTime: z.date().optional(),
  duration: z.number().optional(),
  error: z.string().optional(),
  errorDetails: z.unknown().optional(),
  tokensUsed: z.number().optional(),
  toolsUsed: z.array(z.string()).optional(),
  filesModified: z.array(z.string()).optional(),
  commandsExecuted: z.array(z.string()).optional(),
})

/**
 * Agent Metrics Schema
 */
export const AgentMetricsSchema = z.object({
  tasksExecuted: z.number(),
  tasksSucceeded: z.number(),
  tasksFailed: z.number(),
  tasksInProgress: z.number(),
  averageExecutionTime: z.number(),
  totalExecutionTime: z.number(),
  successRate: z.number(),
  tokensConsumed: z.number(),
  apiCallsTotal: z.number(),
  lastActive: z.date(),
  uptime: z.number(),
  productivity: z.number(),
  accuracy: z.number(),
})

// ============================================================================
// STREAMING TYPES
// ============================================================================

/**
 * Stream Event Type Schema
 */
export const StreamEventTypeSchema = z.enum([
  'text_delta',
  'tool_call',
  'tool_result',
  'error',
  'complete',
  'start',
  'thinking',
  'agent_start',
  'agent_progress',
  'agent_complete',
])

/**
 * Stream Event Schema
 */
export const StreamEventSchema = z.object({
  type: StreamEventTypeSchema,
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.date().optional(),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
})

/**
 * Stream Configuration Schema
 */
export const StreamConfigSchema = z.object({
  enableRealTimeUpdates: z.boolean().default(true),
  tokenTrackingEnabled: z.boolean().default(true),
  maxStreamDuration: z.number().positive().default(300000),
  bufferSize: z.number().positive().default(1000),
  enableBackgroundAgents: z.boolean().default(true),
  enableProgressTracking: z.boolean().default(true),
})

// ============================================================================
// TTY COMPONENT TYPES
// ============================================================================

/**
 * TTY Component Props Base
 */
export interface TTYComponentProps {
  id?: string
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

/**
 * TTY Input Component Props
 */
export interface TTYInputProps extends TTYComponentProps {
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  disabled?: boolean
  multiline?: boolean
  maxLength?: number
  autoFocus?: boolean
}

/**
 * TTY Output Component Props
 */
export interface TTYOutputProps extends TTYComponentProps {
  content: string
  type?: 'text' | 'markdown' | 'json' | 'code'
  language?: string
  theme?: 'light' | 'dark' | 'auto'
  maxHeight?: number
  scrollable?: boolean
  timestamp?: boolean
}

/**
 * TTY Panel Component Props
 */
export interface TTYPanelProps extends TTYComponentProps {
  title: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  width?: number
  height?: number
  resizable?: boolean
  collapsible?: boolean
  defaultCollapsed?: boolean
}

/**
 * TTY Status Component Props
 */
export interface TTYStatusProps extends TTYComponentProps {
  status: AgentStatus
  message?: string
  progress?: number
  showProgress?: boolean
  animated?: boolean
}

// ============================================================================
// HOOK TYPES
// ============================================================================

/**
 * Use Agent Hook Return Type
 */
export interface UseAgentReturn {
  agent: AgentConfig | null
  status: AgentStatus
  metrics: AgentMetrics
  tasks: AgentTask[]
  executeTask: (task: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<AgentTaskResult>
  cancelTask: (taskId: string) => Promise<void>
  refresh: () => Promise<void>
  error: Error | null
  loading: boolean
}

/**
 * Use Stream Hook Return Type
 */
export interface UseStreamReturn {
  events: StreamEvent[]
  isStreaming: boolean
  startStream: (config?: Partial<StreamConfig>) => Promise<void>
  stopStream: () => void
  sendMessage: (message: string) => Promise<void>
  clearEvents: () => void
  error: Error | null
}

/**
 * Use TTY Hook Return Type
 */
export interface UseTTYReturn {
  input: string
  output: string
  history: string[]
  setInput: (value: string) => void
  submitInput: () => Promise<void>
  clearOutput: () => void
  addToHistory: (item: string) => void
  navigateHistory: (direction: 'up' | 'down') => void
  error: Error | null
  loading: boolean
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * SDK Configuration Schema
 */
export const SDKConfigSchema = z.object({
  apiKeys: z.object({
    anthropic: z.string().optional(),
    openai: z.string().optional(),
    google: z.string().optional(),
    openrouter: z.string().optional(),
  }),
  defaultModel: z.string().default('claude-3-5-sonnet-20241022'),
  workingDirectory: z.string().default(process.cwd()),
  logLevel: LogLevelSchema.default('info'),
  enableStreaming: z.boolean().default(true),
  enableAgents: z.boolean().default(true),
  enableTools: z.boolean().default(true),
  maxConcurrentTasks: z.number().positive().default(5),
  defaultTimeout: z.number().positive().default(300000),
  retryPolicy: z.object({
    maxAttempts: z.number().min(0).default(3),
    backoffMs: z.number().positive().default(1000),
    backoffMultiplier: z.number().positive().default(2),
    retryableErrors: z.array(z.string()).default(['NetworkError', 'TimeoutError']),
  }),
})

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type AgentCapability = z.infer<typeof AgentCapabilitySchema>
export type AgentConfig = z.infer<typeof AgentConfigSchema>
export type AgentTask = z.infer<typeof AgentTaskSchema>
export type AgentTaskResult = z.infer<typeof AgentTaskResultSchema>
export type AgentMetrics = z.infer<typeof AgentMetricsSchema>
export type StreamEventType = z.infer<typeof StreamEventTypeSchema>
export type StreamEvent = z.infer<typeof StreamEventSchema>
export type StreamConfig = z.infer<typeof StreamConfigSchema>
export type SDKConfig = z.infer<typeof SDKConfigSchema>

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Create Agent Task Helper
 */
export type CreateAgentTask = Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>

/**
 * Update Agent Task Helper
 */
export type UpdateAgentTask = Partial<Pick<AgentTask, 'title' | 'description' | 'priority' | 'data' | 'context' | 'progress'>>

/**
 * Agent Event Types
 */
export type AgentEventType = 
  | 'agent.initialized'
  | 'agent.status.changed'
  | 'task.started'
  | 'task.progress'
  | 'task.completed'
  | 'task.failed'
  | 'error.occurred'

/**
 * Agent Event
 */
export interface AgentEvent<T = unknown> {
  id: string
  type: AgentEventType
  agentId: string
  timestamp: Date
  data: T
  sessionId?: string
}

/**
 * Event Handler
 */
export type EventHandler<T = unknown> = (event: AgentEvent<T>) => void | Promise<void>

/**
 * Tool Definition
 */
export interface ToolDefinition {
  name: string
  description: string
  parameters: z.ZodSchema
  execute: (args: unknown) => Promise<unknown>
}

/**
 * Agent Factory
 */
export type AgentFactory = (config: Partial<AgentConfig>) => AgentConfig

/**
 * Tool Registry
 */
export interface ToolRegistry {
  register: (tool: ToolDefinition) => void
  unregister: (name: string) => void
  get: (name: string) => ToolDefinition | undefined
  list: () => ToolDefinition[]
}

/**
 * Agent Registry
 */
export interface AgentRegistry {
  register: (factory: AgentFactory, metadata: Partial<AgentConfig>) => void
  unregister: (id: string) => void
  get: (id: string) => AgentFactory | undefined
  list: () => Array<{ id: string; factory: AgentFactory; metadata: Partial<AgentConfig> }>
  create: (id: string, config?: Partial<AgentConfig>) => AgentConfig
}