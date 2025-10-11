/**
 * AI SDK Compatible Stream Event Types
 * 
 * This module defines the stream event protocol that enables streamtty
 * to handle AI SDK streaming events including tool calls, text deltas,
 * and structured agent interactions.
 */

export type StreamEventType = 
  | 'text_delta'      // Streaming text chunks from AI
  | 'tool_call'       // Tool execution request from AI
  | 'tool_result'     // Tool execution result
  | 'thinking'        // Reasoning/cognitive process
  | 'start'           // Stream start
  | 'complete'        // Stream complete
  | 'error'           // Error occurred
  | 'reasoning'       // Deep thinking mode
  | 'step'            // Execution step
  | 'status';         // Status update

export interface StreamEvent {
  type: StreamEventType
  content?: string
  toolName?: string
  toolArgs?: Record<string, any>
  toolResult?: any
  metadata?: {
    timestamp?: number
    duration?: number
    agentId?: string
    taskId?: string
    [key: string]: any
  }
}

export interface ToolCallEvent extends StreamEvent {
  type: 'tool_call'
  toolName: string
  toolArgs: Record<string, any>
}

export interface ToolResultEvent extends StreamEvent {
  type: 'tool_result'
  toolResult: any
}

export interface TextDeltaEvent extends StreamEvent {
  type: 'text_delta'
  content: string
}

export interface ThinkingEvent extends StreamEvent {
  type: 'thinking' | 'reasoning'
  content: string
}

export interface StatusEvent extends StreamEvent {
  type: 'status' | 'step'
  content: string
  metadata: {
    status?: 'pending' | 'running' | 'completed' | 'failed'
    progress?: number
    [key: string]: any
  }
}

export interface ErrorEvent extends StreamEvent {
  type: 'error'
  content: string
  metadata: {
    error?: Error
    code?: string
    [key: string]: any
  }
}

export interface StreamEventOptions {
  parseIncompleteMarkdown?: boolean
  syntaxHighlight?: boolean
  formatToolCalls?: boolean
  showThinking?: boolean
  maxToolResultLength?: number
}

export type StreamEventHandler = (event: StreamEvent) => void | Promise<void>

export interface StreamEventEmitter {
  on(event: StreamEventType | 'all', handler: StreamEventHandler): void
  off(event: StreamEventType | 'all', handler: StreamEventHandler): void
  emit(event: StreamEvent): void
}
