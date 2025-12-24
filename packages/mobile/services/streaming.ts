/**
 * NikCLI Mobile - Streaming Service
 * WebSocket-based real-time communication with nikcli backend
 */

import type { StreamChunk, ChunkType, AgentCommand } from '@/types'

type StreamCallback = (chunk: StreamChunk) => void
type ConnectionCallback = (status: 'connected' | 'disconnected' | 'error', error?: string) => void

interface StreamingServiceConfig {
  endpoint: string
  autoReconnect?: boolean
  reconnectInterval?: number
  maxRetries?: number
}

class StreamingServiceImpl {
  private ws: WebSocket | null = null
  private config: StreamingServiceConfig
  private streamCallbacks: Set<StreamCallback> = new Set()
  private connectionCallbacks: Set<ConnectionCallback> = new Set()
  private reconnectTimer: NodeJS.Timeout | null = null
  private retryCount = 0
  private isIntentionallyClosed = false
  
  constructor() {
    this.config = {
      endpoint: 'ws://localhost:3001/ws/chat',
      autoReconnect: true,
      reconnectInterval: 5000,
      maxRetries: 10,
    }
  }
  
  // ============================================================================
  // Connection Management
  // ============================================================================
  
  configure(config: Partial<StreamingServiceConfig>): void {
    this.config = { ...this.config, ...config }
  }
  
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }
    
    this.isIntentionallyClosed = false
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.endpoint)
        
        this.ws.onopen = () => {
          this.retryCount = 0
          this.notifyConnection('connected')
          resolve()
        }
        
        this.ws.onclose = (event) => {
          if (!this.isIntentionallyClosed && this.config.autoReconnect) {
            this.scheduleReconnect()
          }
          this.notifyConnection('disconnected')
        }
        
        this.ws.onerror = (error) => {
          this.notifyConnection('error', 'WebSocket error')
          reject(new Error('WebSocket connection failed'))
        }
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }
      } catch (error) {
        reject(error)
      }
    })
  }
  
  disconnect(): void {
    this.isIntentionallyClosed = true
    this.clearReconnectTimer()
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
  
  private scheduleReconnect(): void {
    if (this.retryCount >= (this.config.maxRetries || 10)) {
      this.notifyConnection('error', 'Max retries exceeded')
      return
    }
    
    this.clearReconnectTimer()
    
    this.reconnectTimer = setTimeout(() => {
      this.retryCount++
      this.connect().catch(() => {
        // Error handled in connect()
      })
    }, this.config.reconnectInterval)
  }
  
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
  
  // ============================================================================
  // Message Handling
  // ============================================================================
  
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data)
      
      // Convert to StreamChunk format
      const chunk: StreamChunk = {
        id: message.id || `chunk_${Date.now()}`,
        type: this.mapMessageType(message.type),
        content: message.content || '',
        timestamp: new Date(message.timestamp || Date.now()),
        metadata: message.metadata,
      }
      
      this.notifyStream(chunk)
    } catch (error) {
      // Handle non-JSON messages as plain text
      const chunk: StreamChunk = {
        id: `chunk_${Date.now()}`,
        type: 'text',
        content: data,
        timestamp: new Date(),
      }
      this.notifyStream(chunk)
    }
  }
  
  private mapMessageType(type: string): ChunkType {
    const typeMap: Record<string, ChunkType> = {
      user: 'user',
      system: 'system',
      agent: 'agent',
      tool: 'tool',
      error: 'error',
      vm: 'vm',
      diff: 'diff',
      text: 'text',
      code: 'code',
      markdown: 'markdown',
    }
    return typeMap[type] || 'text'
  }
  
  // ============================================================================
  // Sending Messages
  // ============================================================================
  
  async sendMessage(content: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }
    
    const message = {
      type: 'user_message',
      content,
      timestamp: new Date().toISOString(),
    }
    
    this.ws.send(JSON.stringify(message))
  }
  
  async sendCommand(command: string, args: string[] = []): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }
    
    const message = {
      type: 'command',
      command,
      args,
      timestamp: new Date().toISOString(),
    }
    
    this.ws.send(JSON.stringify(message))
  }
  
  async launchAgent(agentName: string, task: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }
    
    const message = {
      type: 'agent_launch',
      agentName,
      task,
      timestamp: new Date().toISOString(),
    }
    
    this.ws.send(JSON.stringify(message))
  }
  
  async stopAgent(agentId: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }
    
    const message = {
      type: 'agent_stop',
      agentId,
      timestamp: new Date().toISOString(),
    }
    
    this.ws.send(JSON.stringify(message))
  }
  
  // ============================================================================
  // Callbacks
  // ============================================================================
  
  onStreamChunk(callback: StreamCallback): () => void {
    this.streamCallbacks.add(callback)
    return () => this.streamCallbacks.delete(callback)
  }
  
  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback)
    return () => this.connectionCallbacks.delete(callback)
  }
  
  private notifyStream(chunk: StreamChunk): void {
    this.streamCallbacks.forEach((callback) => {
      try {
        callback(chunk)
      } catch (error) {
        console.error('Stream callback error:', error)
      }
    })
  }
  
  private notifyConnection(status: 'connected' | 'disconnected' | 'error', error?: string): void {
    this.connectionCallbacks.forEach((callback) => {
      try {
        callback(status, error)
      } catch (err) {
        console.error('Connection callback error:', err)
      }
    })
  }
  
  // ============================================================================
  // Status
  // ============================================================================
  
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
  
  getRetryCount(): number {
    return this.retryCount
  }
}

// Singleton instance
export const streamingService = new StreamingServiceImpl()

export type { StreamingServiceConfig }
