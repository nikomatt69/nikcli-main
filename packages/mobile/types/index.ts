/**
 * NikCLI Mobile - Core Types
 * Aligned with src/cli/streaming-orchestrator.ts interfaces
 */

// ============================================================================
// Message Types
// ============================================================================

export type MessageType = 'user' | 'system' | 'agent' | 'tool' | 'diff' | 'error' | 'vm'

export type MessageStatus = 'queued' | 'processing' | 'completed' | 'streaming' | 'absorbed'

export interface ChatMessage {
  id: string
  type: MessageType
  content: string
  timestamp: Date
  status: MessageStatus
  metadata?: MessageMetadata
}

export interface MessageMetadata {
  agentId?: string
  agentType?: string
  progress?: number
  isStreaming?: boolean
  chunkLength?: number
  tool?: string
  result?: unknown
  error?: string
}

// ============================================================================
// Agent Types
// ============================================================================

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'queued'

export interface AgentInfo {
  id: string
  type: string
  status: AgentStatus
  task?: string
  progress?: number
  startedAt?: Date
  completedAt?: Date
  error?: string
}

export interface AgentTask {
  id: string
  agentType: string
  task: string
  status: AgentStatus
  result?: unknown
  error?: string
}

// ============================================================================
// Log Types
// ============================================================================

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success'

export interface LogEntry {
  id: string
  level: LogLevel
  message: string
  timestamp: Date
  source: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// Stream Types
// ============================================================================

export type ChunkType = 
  | 'text' 
  | 'code' 
  | 'markdown' 
  | 'error' 
  | 'system' 
  | 'agent' 
  | 'tool' 
  | 'vm'
  | 'user'
  | 'diff'

export interface StreamChunk {
  id: string
  type: ChunkType
  content: string
  timestamp: Date
  metadata?: {
    agentId?: string
    isComplete?: boolean
  }
}

// ============================================================================
// Context Types (aligned with streaming-orchestrator.ts)
// ============================================================================

export interface StreamContext {
  workingDirectory: string
  autonomous: boolean
  planMode: boolean
  autoAcceptEdits: boolean
  vmMode: boolean
  contextLeft: number
  maxContext: number
  adaptiveSupervision?: boolean
  intelligentPrioritization?: boolean
  cognitiveFiltering?: boolean
  orchestrationAwareness?: boolean
}

// ============================================================================
// Connection Types
// ============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ConnectionState {
  status: ConnectionStatus
  endpoint: string
  lastConnected?: Date
  error?: string
  retryCount: number
}

// ============================================================================
// Command Types
// ============================================================================

export interface SlashCommand {
  name: string
  description: string
  usage: string
  handler: (args: string[]) => void | Promise<void>
}

export interface AgentCommand {
  agentName: string
  task: string
}

// ============================================================================
// Plan Types (from unified-chat.ts)
// ============================================================================

export interface ExecutionPlan {
  id: string
  title: string
  description: string
  steps: PlanStep[]
  estimatedDuration: number
  riskLevel: 'low' | 'medium' | 'high'
  requiresApproval: boolean
}

export interface PlanStep {
  id: string
  title: string
  description: string
  toolName: string
  parameters: Record<string, unknown>
  dependencies: string[]
  estimatedTime: number
  requiresPermission: boolean
}

// ============================================================================
// Queue Types
// ============================================================================

export interface QueuedPrompt {
  id: string
  content: string
  timestamp: Date
  priority: 'low' | 'medium' | 'high'
  agentId?: string
}

export interface InputQueueStatus {
  queueLength: number
  isProcessing: boolean
  currentItem?: QueuedPrompt
}

// ============================================================================
// Panel Types (from TUI)
// ============================================================================

export interface Panel {
  id: string
  title: string
  position: 'top' | 'bottom' | 'left' | 'right'
  width?: number
  height?: number
  content: string[]
  maxLines?: number
  visible: boolean
}

// ============================================================================
// Diff Types
// ============================================================================

export interface DiffInfo {
  id: string
  filePath: string
  oldContent: string
  newContent: string
  additions: number
  deletions: number
  status: 'pending' | 'accepted' | 'rejected'
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  timestamp: Date
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

export interface MobileWebSocketMessage {
  type:
    | 'connection:established'
    | 'message:user'
    | 'message:system'
    | 'message:agent'
    | 'message:tool'
    | 'message:error'
    | 'message:vm'
    | 'message:diff'
    | 'stream:chunk'
    | 'stream:complete'
    | 'agent:started'
    | 'agent:progress'
    | 'agent:completed'
    | 'agent:failed'
    | 'diff:created'
    | 'diff:accepted'
    | 'diff:rejected'
    | 'status:update'
    | 'heartbeat'
    | 'error'
  data: any
  timestamp: Date
  clientId?: string
}

export interface MobileClientMessage {
  type: 'send_message' | 'launch_agent' | 'stop_agent' | 'command' | 'ping' | 'subscribe'
  payload: any
}

export interface StatusResponse {
  connected: boolean
  workingDirectory: string
  activeAgents: number
  queuedTasks: number
  pendingDiffs: number
  contextLeft: number
  mode: {
    plan: boolean
    autoAccept: boolean
    vm: boolean
  }
}
