/*
 * Polymarket WebSocket Manager
 *
 * Manages real-time connections to Polymarket's CLOB WebSocket
 * Handles subscription management, auto-reconnection, and message routing
 * Supports up to 500 simultaneous market subscriptions
 */

import { EventEmitter } from 'events'

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface WebSocketSubscription {
  channel: 'market'
  asset_id: string
}

export interface BookUpdate {
  event_type: 'book'
  asset_id: string
  market: string
  timestamp: number
  hash: string
  bids: Array<{ price: string; size: string }>
  asks: Array<{ price: string; size: string }>
}

export interface PriceChangeUpdate {
  event_type: 'price_change'
  changes: Array<{
    asset_id: string
    price: string
    size: string
    side: 'BUY' | 'SELL'
    best_bid: string
    best_ask: string
    hash: string
  }>
}

export interface LastTradePriceUpdate {
  event_type: 'last_trade_price'
  asset_id: string
  market: string
  price: string
  side: 'BUY' | 'SELL'
  size: string
  fee_rate_bps: string
  timestamp: number
}

export interface TickSizeChangeUpdate {
  event_type: 'tick_size_change'
  asset_id: string
  market: string
  old_tick_size: string
  new_tick_size: string
  timestamp: number
}

export type WebSocketUpdate =
  | BookUpdate
  | PriceChangeUpdate
  | LastTradePriceUpdate
  | TickSizeChangeUpdate

export interface ConnectionStats {
  connected: boolean
  subscriptions: number
  messageCount: number
  lastMessageTime: number
  uptime: number
  reconnectAttempts: number
}

// ============================================================
// WEBSOCKET MANAGER
// ============================================================

export class PolymarketWebSocketManager extends EventEmitter {
  private wsUrl: string
  private ws: WebSocket | null = null
  private subscriptions: Set<string> = new Set()
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 10
  private reconnectDelay: number = 1000 // Start with 1 second
  private maxReconnectDelay: number = 30000 // Max 30 seconds
  private messageHandlers: Map<string, (update: WebSocketUpdate) => void> = new Map()
  private connectionStartTime: number = 0
  private messageCount: number = 0
  private lastMessageTime: number = 0
  private isManuallyClosing: boolean = false
  private reconnectTimeout: NodeJS.Timeout | null = null
  private pingInterval: NodeJS.Timeout | null = null

  constructor(wsUrl: string = 'wss://ws-subscriptions-clob.polymarket.com/ws/') {
    super()
    this.wsUrl = wsUrl
  }

  /**
   * Connect to WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔌 Connecting to Polymarket WebSocket...')
        this.ws = new WebSocket(this.wsUrl)

        this.ws.onopen = () => {
          console.log('✓ WebSocket connected')
          this.connectionStartTime = Date.now()
          this.reconnectAttempts = 0
          this.reconnectDelay = 1000
          this.emit('connected')
          this.startPingInterval()
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = (event) => {
          console.error('✖ WebSocket error:', event)
          this.emit('error', event)
          reject(event)
        }

        this.ws.onclose = () => {
          console.log('⚠︎ WebSocket closed')
          this.emit('disconnected')
          this.stopPingInterval()

          // Attempt reconnection if not manually closed
          if (!this.isManuallyClosing) {
            this.scheduleReconnect()
          }
        }
      } catch (error) {
        console.error('✖ WebSocket connection failed:', error)
        reject(error)
      }
    })
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    console.log('🔌 Disconnecting from WebSocket...')
    this.isManuallyClosing = true

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    this.stopPingInterval()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.subscriptions.clear()
    this.messageHandlers.clear()
  }

  /**
   * Subscribe to market updates
   */
  subscribe(assetId: string, handler?: (update: WebSocketUpdate) => void): void {
    if (this.subscriptions.size >= 500) {
      throw new Error('Maximum 500 subscriptions reached')
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    try {
      const subscription: WebSocketSubscription = {
        channel: 'market',
        asset_id: assetId
      }

      this.ws.send(JSON.stringify(subscription))
      this.subscriptions.add(assetId)

      if (handler) {
        this.messageHandlers.set(assetId, handler)
      }

      console.log(`✓ Subscribed to market: ${assetId}`)
      this.emit('subscribed', assetId)
    } catch (error) {
      console.error(`✖ Failed to subscribe to ${assetId}:`, error)
      throw error
    }
  }

  /**
   * Unsubscribe from market
   * Note: Polymarket doesn't support unsubscribe, so we close and reopen connection
   */
  unsubscribe(assetId: string): void {
    if (!this.subscriptions.has(assetId)) {
      return
    }

    this.subscriptions.delete(assetId)
    this.messageHandlers.delete(assetId)

    // If more subscriptions remain, reconnect with new set
    if (this.subscriptions.size > 0) {
      console.log(`⚠︎ Closing and reconnecting (Polymarket doesn't support unsubscribe)`)
      this.disconnect()
      this.isManuallyClosing = false

      // Reconnect after delay
      setTimeout(() => {
        this.connect().then(() => {
          // Re-subscribe to all remaining
          this.subscriptions.forEach(id => {
            this.subscribe(id, this.messageHandlers.get(id))
          })
        })
      }, 1000)
    } else {
      this.disconnect()
    }

    console.log(`ℹ️ Unsubscribed from market: ${assetId}`)
    this.emit('unsubscribed', assetId)
  }

  /**
   * Register handler for specific asset updates
   */
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener)
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const update = JSON.parse(data) as WebSocketUpdate
      this.lastMessageTime = Date.now()
      this.messageCount++

      // Route to specific handler if registered
      if ('asset_id' in update && update.asset_id) {
        const handler = this.messageHandlers.get(update.asset_id)
        if (handler) {
          handler(update)
        }
      }

      // Emit global event
      this.emit('update', update)

      // Emit specific event type
      const eventType = update.event_type
      this.emit(eventType, update)
    } catch (error) {
      console.error('✖ Failed to parse WebSocket message:', error)
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('✖ Max reconnection attempts reached')
      this.emit('maxReconnectAttemptsReached')
      return
    }

    this.reconnectAttempts++

    // Exponential backoff with jitter
    const jitter = Math.random() * 1000
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) + jitter,
      this.maxReconnectDelay
    )

    console.log(`🔄 Reconnecting in ${delay.toFixed(0)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    this.reconnectTimeout = setTimeout(() => {
      this.isManuallyClosing = false
      this.connect()
        .then(() => {
          // Re-subscribe to all markets
          this.subscriptions.forEach(assetId => {
            this.subscribe(assetId, this.messageHandlers.get(assetId))
          })
        })
        .catch((error) => {
          console.error('✖ Reconnection failed:', error)
          this.scheduleReconnect()
        })
    }, delay)
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    // Ping every 30 seconds
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }))
        } catch {
          // Ignore ping errors
        }
      }
    }, 30000)
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    const uptime = this.connectionStartTime > 0 ? Date.now() - this.connectionStartTime : 0

    return {
      connected: this.ws !== null && this.ws.readyState === WebSocket.OPEN,
      subscriptions: this.subscriptions.size,
      messageCount: this.messageCount,
      lastMessageTime: this.lastMessageTime,
      uptime,
      reconnectAttempts: this.reconnectAttempts
    }
  }

  /**
   * Get subscribed assets
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions)
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    return this.isConnected() && Date.now() - this.lastMessageTime < 60000
  }
}

export default PolymarketWebSocketManager
