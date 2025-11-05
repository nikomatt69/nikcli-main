/**
 * Chat Interface Types
 * For Claude-style AI interaction with Background Agents
 */

export type MessageRole = 'user' | 'assistant' | 'system'

export type ToolCallStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'failed'

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  status: ToolCallStatus
  result?: unknown
  error?: string
  riskLevel?: 'low' | 'medium' | 'high'
  affectedFiles?: string[]
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  timestamp: Date | string
  toolCalls?: ToolCall[]
  streamComplete?: boolean
}

export interface FileChange {
  path: string
  type: 'added' | 'modified' | 'deleted'
  diff: string
  timestamp: Date | string
}

export interface ChatSession {
  id: string
  jobId: string
  repo: string
  status: 'active' | 'completed' | 'failed'
  messages: ChatMessage[]
  createdAt: Date | string
  updatedAt: Date | string
  fileChanges: FileChange[]
  userId?: string
}

export interface PendingToolApproval {
  id: string
  toolCall: ToolCall
  requestedAt: Date | string
  resolvedAt?: Date | string
  approved?: boolean
}

/**
 * SSE Event Types
 */
export type SSEEventType =
  | 'connection:established'
  | 'text:delta'
  | 'text:complete'
  | 'tool:call'
  | 'tool:result'
  | 'tool:approval_required'
  | 'file:change'
  | 'status:update'
  | 'error'
  | 'session:complete'

export interface SSEEvent<T = unknown> {
  type: SSEEventType
  data: T
  timestamp: Date | string
}

/**
 * Chat API Request/Response Types
 */
export interface CreateChatSessionRequest {
  repo: string
  baseBranch?: string
  userId?: string
  initialMessage?: string
}

export interface CreateChatSessionResponse {
  success: boolean
  session?: ChatSession
  error?: string
}

export interface SendMessageRequest {
  sessionId: string
  message: string
}

export interface SendMessageResponse {
  success: boolean
  message?: ChatMessage
  error?: string
}

export interface ApproveToolRequest {
  sessionId: string
  toolApprovalId: string
  approved: boolean
}

export interface ApproveToolResponse {
  success: boolean
  message?: string
  error?: string
}

export interface ContextMetrics {
  used: number
  total: number
  percentage: number
  filesIndexed: number
  vectorDBStatus: 'available' | 'error' | 'initializing'
}
