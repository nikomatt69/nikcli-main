// lib/websocket-client.ts
// WebSocket client with auto-reconnection

import { EventEmitter } from 'events'

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000'

export interface WSMessage {
  id: string
  type: 'ping' | 'pong' | 'subscribe' | 'unsubscribe' | 'message' | 'stream' | 'approval' | 'error'
  sessionId?: string
  payload?: any
  compressed?: boolean
  timestamp: string
}

export interface WSConfig {
  url: string
  reconnectInterval?: number
  maxReconnectAttempts?: number
  heartbeatInterval?: number
}

/**
 * WebSocket Client with reconnection
 */
export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null
  private config: Required<WSConfig>
  private reconnectAttempts = 0
  private reconnectTimeout?: NodeJS.Timeout
  private heartbeatInterval?: NodeJS.Timeout
  private isIntentionallyClosed = false
  private subscribedSessions: Set<string> = new Set()

  constructor(config: WSConfig) {
    super()

    this.config = {
      url: config.url,
      reconnectInterval: config.reconnectInterval || 3000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      heartbeatInterval: config.heartbeatInterval || 30000,
    }
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    this.isIntentionallyClosed = false

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url)

        this.ws.onopen = () => {
          console.log('[WS] Connected')
          this.reconnectAttempts = 0
          this.startHeartbeat()
          this.emit('connected')

          // Re-subscribe to sessions
          this.resubscribe()

          resolve()
        }

        this.ws.onmessage = async (event) => {
          try {
            await this.handleMessage(event.data)
          } catch (error) {
            console.error('[WS] Message handling error:', error)
            this.emit('error', error)
          }
        }

        this.ws.onerror = (error) => {
          console.error('[WS] Error:', error)
          this.emit('error', error)
        }

        this.ws.onclose = (event) => {
          console.log('[WS] Closed:', event.code, event.reason)
          this.stopHeartbeat()
          this.emit('disconnected')

          if (!this.isIntentionallyClosed) {
            this.scheduleReconnect()
          }
        }

        // Connection timeout
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            reject(new Error('Connection timeout'))
          }
        }, 10000)

      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isIntentionallyClosed = true

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    this.stopHeartbeat()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Subscribe to session updates
   */
  async subscribe(sessionId: string): Promise<void> {
    this.subscribedSessions.add(sessionId)

    if (this.isConnected()) {
      await this.send({
        id: this.generateId(),
        type: 'subscribe',
        sessionId,
        timestamp: new Date().toISOString(),
      })
    }
  }

  /**
   * Unsubscribe from session updates
   */
  async unsubscribe(sessionId: string): Promise<void> {
    this.subscribedSessions.delete(sessionId)

    if (this.isConnected()) {
      await this.send({
        id: this.generateId(),
        type: 'unsubscribe',
        sessionId,
        timestamp: new Date().toISOString(),
      })
    }
  }

  /**
   * Send approval response
   */
  async respondToApproval(
    approvalId: string,
    approved: boolean,
    reason?: string
  ): Promise<void> {
    await this.send({
      id: this.generateId(),
      type: 'approval',
      payload: {
        id: approvalId,
        approved,
        reason,
      },
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Send message
   */
  private async send(message: WSMessage): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('WebSocket not connected')
    }

    try {
      const json = JSON.stringify(message)
      this.ws!.send(json)
    } catch (error) {
      console.error('[WS] Send error:', error)
      throw error
    }
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(data: string | ArrayBuffer | Blob): Promise<void> {
    let message: WSMessage

    try {
      // Handle different data types
      let text: string

      if (data instanceof ArrayBuffer) {
        text = new TextDecoder().decode(data)
      } else if (data instanceof Blob) {
        const buffer = await data.arrayBuffer()
        text = new TextDecoder().decode(buffer)
      } else {
        text = data
      }

      message = JSON.parse(text)
    } catch (error) {
      console.error('[WS] Failed to parse message:', error)
      return
    }

    // Handle different message types
    switch (message.type) {
      case 'pong':
        // Heartbeat response
        break

      case 'message':
        this.emit('message', message.payload, message.sessionId)
        break

      case 'stream':
        this.emit('stream', message.payload, message.sessionId)
        break

      case 'approval':
        this.emit('approval', message.payload, message.sessionId)
        break

      case 'error':
        this.emit('error', new Error(message.payload?.message || 'Unknown error'))
        break

      default:
        console.warn('[WS] Unknown message type:', message.type)
    }
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({
          id: this.generateId(),
          type: 'ping',
          timestamp: new Date().toISOString(),
        }).catch((error) => {
          console.error('[WS] Heartbeat error:', error)
        })
      }
    }, this.config.heartbeatInterval)
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = undefined
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[WS] Max reconnection attempts reached')
      this.emit('reconnect_failed')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30s
    )

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    this.emit('reconnecting', this.reconnectAttempts)

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[WS] Reconnection failed:', error)
      })
    }, delay)
  }

  /**
   * Re-subscribe to sessions after reconnection
   */
  private resubscribe(): void {
    for (const sessionId of this.subscribedSessions) {
      this.subscribe(sessionId).catch((error) => {
        console.error(`[WS] Failed to resubscribe to ${sessionId}:`, error)
      })
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// Singleton instance
export const wsClient = new WebSocketClient({
  url: `${WS_URL}/mobile/ws`,
})
