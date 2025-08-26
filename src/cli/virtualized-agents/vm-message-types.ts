/**
 * VM Message Types - Definisce le interfacce per la comunicazione VM
 * 
 * Questo file contiene tutti i tipi e interfacce necessari per la comunicazione
 * real-time tra host e agenti VM tramite WebSocket.
 */

export type VMMessageType = 
  | 'chat_message'
  | 'command'
  | 'response'
  | 'status_update'
  | 'error'
  | 'heartbeat'
  | 'session_init'
  | 'session_end'
  | 'stream_start'
  | 'stream_chunk'
  | 'stream_end';

export interface VMMessage {
  id: string;
  type: VMMessageType;
  timestamp: Date;
  containerId: string;
  sessionId: string;
  payload: any;
}

export interface VMChatMessage extends VMMessage {
  type: 'chat_message';
  payload: {
    content: string;
    sender: 'user' | 'agent';
    metadata?: {
      messageId?: string;
      replyTo?: string;
      priority?: 'low' | 'normal' | 'high';
    };
  };
}

export interface VMCommand extends VMMessage {
  type: 'command';
  payload: {
    command: string;
    args: string[];
    workingDirectory?: string;
    environment?: Record<string, string>;
    timeout?: number;
  };
}

export interface VMResponse extends VMMessage {
  type: 'response';
  payload: {
    success: boolean;
    data?: any;
    error?: string;
    executionTime?: number;
    metadata?: {
      tokensUsed?: number;
      modelUsed?: string;
      processingTime?: number;
    };
  };
}

export interface VMStatusUpdate extends VMMessage {
  type: 'status_update';
  payload: {
    status: VMAgentStatus;
    health: VMHealthStatus;
    metrics?: VMMetrics;
    message?: string;
  };
}

export interface VMError extends VMMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: any;
    recoverable: boolean;
  };
}

export interface VMHeartbeat extends VMMessage {
  type: 'heartbeat';
  payload: {
    uptime: number;
    lastActivity: Date;
    status: 'healthy' | 'warning' | 'error';
  };
}

export interface VMSessionInit extends VMMessage {
  type: 'session_init';
  payload: {
    agentId: string;
    capabilities: string[];
    sessionToken: string;
    configuration?: VMSessionConfig;
  };
}

export interface VMStreamChunk extends VMMessage {
  type: 'stream_chunk';
  payload: {
    streamId: string;
    chunkIndex: number;
    content: string;
    isLastChunk: boolean;
    metadata?: any;
  };
}

// Supporting Types
export type VMAgentStatus = 
  | 'initializing'
  | 'ready'
  | 'busy'
  | 'idle'
  | 'error'
  | 'disconnected'
  | 'shutting_down';

export interface VMHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    container: 'up' | 'down' | 'restarting';
    websocket: 'connected' | 'disconnected' | 'reconnecting';
    agent: 'active' | 'inactive' | 'error';
  };
  lastCheck: Date;
}

export interface VMMetrics {
  memoryUsage: number; // MB
  cpuUsage: number; // Percentage
  diskUsage: number; // MB
  networkActivity: number; // Bytes/sec
  uptime: number; // Seconds
  messagesProcessed: number;
  averageResponseTime: number; // ms
}

export interface VMSessionConfig {
  maxMessageHistory: number;
  responseTimeout: number;
  heartbeatInterval: number;
  autoReconnect: boolean;
  retryAttempts: number;
  debugMode?: boolean;
}

export interface VMSessionInfo {
  sessionId: string;
  containerId: string;
  agentId: string;
  status: VMAgentStatus;
  startTime: Date;
  lastActivity: Date;
  messageCount: number;
  isActive: boolean;
}

// Connection Events
export interface VMConnectionEvent {
  type: 'connected' | 'disconnected' | 'reconnected' | 'error';
  containerId: string;
  sessionId: string;
  timestamp: Date;
  details?: any;
}

// Chat History
export interface VMChatHistory {
  sessionId: string;
  containerId: string;
  messages: VMChatMessage[];
  startTime: Date;
  endTime?: Date;
  metadata: {
    messageCount: number;
    totalTokens?: number;
    averageResponseTime?: number;
  };
}

// Request/Response Patterns
export interface VMRequest {
  id: string;
  type: 'chat' | 'command' | 'status' | 'config';
  containerId: string;
  payload: any;
  timeout?: number;
  retries?: number;
}

export interface VMBridgeResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    responseTime: number;
    containerId: string;
    sessionId: string;
  };
}

// WebSocket Configuration
export interface VMWebSocketConfig {
  port: number;
  host: string;
  path: string;
  maxConnections: number;
  messageTimeout: number;
  heartbeatInterval: number;
  reconnectDelay: number;
  maxReconnectAttempts: number;
}

// Agent Communication Context
export interface VMAgentContext {
  containerId: string;
  sessionId: string;
  agentCapabilities: string[];
  currentTask?: string;
  conversationHistory: VMChatMessage[];
  settings: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  };
}

// Errors
export class VMCommunicationError extends Error {
  constructor(
    message: string,
    public containerId: string,
    public code: string,
    public recoverable: boolean = false
  ) {
    super(message);
    this.name = 'VMCommunicationError';
  }
}

export class VMSessionError extends Error {
  constructor(
    message: string,
    public sessionId: string,
    public reason: 'timeout' | 'disconnected' | 'invalid_state' | 'security'
  ) {
    super(message);
    this.name = 'VMSessionError';
  }
}

// Utility Types
export type VMMessageHandler<T extends VMMessage = VMMessage> = (message: T) => Promise<void>;

export interface VMEventEmitter {
  on(event: 'message', handler: VMMessageHandler): void;
  on(event: 'connected', handler: (containerId: string) => void): void;
  on(event: 'disconnected', handler: (containerId: string) => void): void;
  on(event: 'error', handler: (error: VMCommunicationError) => void): void;
  emit(event: string, ...args: any[]): boolean;
}

// Message Factory Functions
export function createVMChatMessage(
  containerId: string,
  sessionId: string,
  content: string,
  sender: 'user' | 'agent'
): VMChatMessage {
  return {
    id: generateMessageId(),
    type: 'chat_message',
    timestamp: new Date(),
    containerId,
    sessionId,
    payload: {
      content,
      sender
    }
  };
}

export function createVMCommand(
  containerId: string,
  sessionId: string,
  command: string,
  args: string[] = []
): VMCommand {
  return {
    id: generateMessageId(),
    type: 'command',
    timestamp: new Date(),
    containerId,
    sessionId,
    payload: {
      command,
      args
    }
  };
}

export function createVMResponse(
  containerId: string,
  sessionId: string,
  success: boolean,
  data?: any,
  error?: string
): VMResponse {
  return {
    id: generateMessageId(),
    type: 'response',
    timestamp: new Date(),
    containerId,
    sessionId,
    payload: {
      success,
      data,
      error
    }
  };
}

// Utility function to generate unique message IDs
function generateMessageId(): string {
  return `vm_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Message validation
export function validateVMMessage(message: any): message is VMMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    typeof message.id === 'string' &&
    typeof message.type === 'string' &&
    message.timestamp instanceof Date &&
    typeof message.containerId === 'string' &&
    typeof message.sessionId === 'string' &&
    message.payload !== undefined
  );
}

// Default configurations
export const DEFAULT_VM_WEBSOCKET_CONFIG: VMWebSocketConfig = {
  port: 8081,
  host: 'localhost',
  path: '/vm-chat',
  maxConnections: 100,
  messageTimeout: 30000,
  heartbeatInterval: 10000,
  reconnectDelay: 5000,
  maxReconnectAttempts: 5
};

export const DEFAULT_VM_SESSION_CONFIG: VMSessionConfig = {
  maxMessageHistory: 100,
  responseTimeout: 30000,
  heartbeatInterval: 10000,
  autoReconnect: true,
  retryAttempts: 3,
  debugMode: false
};