/**
 * NikCLI SDK
 * Official SDK for building TTY applications and CLI agents
 */

// Core SDK
export { NikCLISDK, createSDK, getSDK, initializeSDK } from './core/sdk'
export { AgentManager } from './core/agent-manager'
export { StreamManager } from './core/stream-manager'

// React Hooks
export { useAgent, useAgents, useAgentStats } from './hooks/useAgent'
export { useStream, useStreamEvents, useStreamStats, useStreamConfig } from './hooks/useStream'
export { useTTY, useTTYInput, useTTYOutput, useTTYPanel, useTTYStatus } from './hooks/useTTY'

// React Components
export * from './components'

// Types
export type {
  // Core Types
  AgentStatus,
  TaskStatus,
  TaskPriority,
  LogLevel,
  
  // Agent Types
  AgentCapability,
  AgentConfig,
  AgentTask,
  AgentTaskResult,
  AgentMetrics,
  
  // Streaming Types
  StreamEventType,
  StreamEvent,
  StreamConfig,
  
  // TTY Component Types
  TTYComponentProps,
  TTYInputProps,
  TTYOutputProps,
  TTYPanelProps,
  TTYStatusProps,
  
  // Hook Types
  UseAgentReturn,
  UseStreamReturn,
  UseTTYReturn,
  
  // Configuration Types
  SDKConfig,
  
  // Utility Types
  CreateAgentTask,
  UpdateAgentTask,
  AgentEventType,
  AgentEvent,
  EventHandler,
  ToolDefinition,
  ToolRegistry,
  AgentRegistry,
  AgentFactory,
} from './types'

// Schemas for validation
export {
  AgentStatusSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
  LogLevelSchema,
  AgentCapabilitySchema,
  AgentConfigSchema,
  AgentTaskSchema,
  AgentTaskResultSchema,
  AgentMetricsSchema,
  StreamEventTypeSchema,
  StreamEventSchema,
  StreamConfigSchema,
  SDKConfigSchema,
} from './types'