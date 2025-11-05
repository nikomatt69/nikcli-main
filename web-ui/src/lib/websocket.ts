import { WebSocketMessage } from '@/types/api'

type MessageHandler<T = unknown> = (message: WebSocketMessage<T>) => void
type ErrorHandler = (error: Event) => void
type ConnectionHandler = () => void

/**
 * WebSocket Client for real-time updates
 */
export class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private messageHandlers: Set<MessageHandler> = new Set()
  private errorHandlers: Set<ErrorHandler> = new Set()
  private openHandlers: Set<ConnectionHandler> = new Set()
  private closeHandlers: Set<ConnectionHandler> = new Set()
  private pingInterval: NodeJS.Timeout | null = null
  private isIntentionallyClosed = false

  constructor(url?: string) {
    this.url = url || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'

    // Ensure /ws path
    if (!this.url.endsWith('/ws')) {
      this.url = `${this.url}/ws`
    }
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.isIntentionallyClosed = false
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('[WebSocket] Connected')
          this.reconnectAttempts = 0
          this.startPing()
          this.openHandlers.forEach(handler => handler())
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data)
            this.messageHandlers.forEach(handler => handler(message))
          } catch (error) {
            console.error('[WebSocket] Failed to parse message:', error)
          }
        }

        this.ws.onerror = (error) => {
          console.error('[WebSocket] Error:', error)
          this.errorHandlers.forEach(handler => handler(error))
          reject(error)
        }

        this.ws.onclose = () => {
          console.log('[WebSocket] Disconnected')
          this.stopPing()
          this.closeHandlers.forEach(handler => handler())

          if (!this.isIntentionallyClosed) {
            this.reconnect()
          }
        }
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
    this.stopPing()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * Send message to server
   */
  send<T = unknown>(type: string, data: T): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot send message: not connected')
      return
    }

    const message: WebSocketMessage<T> = {
      type,
      data,
      timestamp: new Date().toISOString(),
    }

    this.ws.send(JSON.stringify(message))
  }

  /**
   * Subscribe to messages
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  /**
   * Subscribe to specific message type
   */
  onMessageType<T = unknown>(type: string, handler: (data: T) => void): () => void {
    const wrappedHandler: MessageHandler<T> = (message) => {
      if (message.type === type) {
        handler(message.data)
      }
    }

    this.messageHandlers.add(wrappedHandler as MessageHandler)
    return () => this.messageHandlers.delete(wrappedHandler as MessageHandler)
  }

  /**
   * Subscribe to errors
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler)
    return () => this.errorHandlers.delete(handler)
  }

  /**
   * Subscribe to connection open
   */
  onOpen(handler: ConnectionHandler): () => void {
    this.openHandlers.add(handler)
    return () => this.openHandlers.delete(handler)
  }

  /**
   * Subscribe to connection close
   */
  onClose(handler: ConnectionHandler): () => void {
    this.closeHandlers.add(handler)
    return () => this.closeHandlers.delete(handler)
  }

  /**
   * Get connection state
   */
  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  /**
   * Reconnect to server with exponential backoff
   */
  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached')
      return
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts)
    console.log(`[WebSocket] Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts + 1})`)

    setTimeout(() => {
      this.reconnectAttempts++
      this.connect().catch(console.error)
    }, delay)
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send('ping', {})
    }, 30000) // 30 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }
}

// Export singleton instance
export const wsClient = new WebSocketClient()
export default wsClient
