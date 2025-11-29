/*
 * Polymarket RTDS (Real-Time Data Stream)
 *
 * WebSocket client for real-time data feeds including crypto prices,
 * comments, and market updates. Supports dynamic subscriptions without
 * disconnecting.
 */

import { EventEmitter } from 'events'

// ============================================================
// TYPE DEFINITIONS & INTERFACES
// ============================================================

export interface RTDSConfig {
  wsUrl?: string
  chainId?: number
  walletAddress?: string
  apiKey?: string
  secret?: string
  passphrase?: string
}

export interface RTDSMessage {
  topic: string
  type: string
  timestamp: number
  payload: any
}

export interface CryptoPriceUpdate {
  symbol: string
  price: number
  timestamp: number
  change24h?: number
  volume24h?: string
}

export interface CommentUpdate {
  id: string
  author: string
  text: string
  timestamp: number
  reactions?: Record<string, number>
}

export interface ConnectionStats {
  connected: boolean
  uptime: number
  messageCount: number
  lastMessageTime: number
  subscriptions: Set<string>
  reconnectAttempts: number
}

// ============================================================
// RTDS CLIENT
// ============================================================

export class PolymarketRTDS extends EventEmitter {
  private ws: WebSocket | null = null
  private wsUrl: string
  private config: RTDSConfig
  private subscriptions: Set<string> = new Set()
  private isManuallyClosing: boolean = false
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 10
  private reconnectDelay: number = 1000
  private maxReconnectDelay: number = 30000
  private reconnectTimeout: NodeJS.Timeout | null = null
  private pingInterval: NodeJS.Timeout | null = null
  private messageCount: number = 0
  private startTime: number = 0
  private lastMessageTime: number = 0

  constructor(config: RTDSConfig = {}) {
    super()
    this.config = config
    this.wsUrl = config.wsUrl || 'wss://ws-live-data.polymarket.com'
  }

  /**
   * Connect to RTDS WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔌 Connecting to RTDS...')

        this.ws = new WebSocket(this.wsUrl)
        this.startTime = Date.now()
        this.reconnectAttempts = 0

        this.ws.onopen = () => {
          console.log('✓ Connected to RTDS')
          this.emit('connected')
          this.startPingInterval()
          this.resubscribeToAll()
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as RTDSMessage
            this.handleMessage(message)
          } catch (error) {
            console.error('✖ Failed to parse RTDS message:', error)
          }
        }

        this.ws.onerror = (error) => {
          console.error('✖ RTDS connection error:', error)
          this.emit('error', error)
          reject(error)
        }

        this.ws.onclose = () => {
          console.log('🔌 Disconnected from RTDS')
          this.stopPingInterval()
          this.emit('disconnected')

          if (!this.isManuallyClosing) {
            this.scheduleReconnect()
          }
        }

        // Timeout if connection takes too long
        setTimeout(() => {
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            reject(new Error('RTDS connection timeout'))
          }
        }, 10000)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Disconnect from RTDS
   */
  disconnect(): void {
    console.log('🔌 Disconnecting from RTDS...')
    this.isManuallyClosing = true

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    this.stopPingInterval()
    this.subscriptions.clear()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.emit('disconnect')
  }

  /**
   * Subscribe to topic
   */
  subscribe(topic: string, handler?: (data: any) => void): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠︎ WebSocket not connected, queuing subscription')
      this.subscriptions.add(topic)
      return
    }

    this.subscriptions.add(topic)

    const subscribeMessage = {
      type: 'subscribe',
      topic: topic,
    }

    try {
      this.ws.send(JSON.stringify(subscribeMessage))
      console.log(`✓ Subscribed to: ${topic}`)

      if (handler) {
        this.on(`topic:${topic}`, handler)
      }

      this.emit('subscribed', { topic })
    } catch (error) {
      console.error(`✖ Failed to subscribe to ${topic}:`, error)
      this.subscriptions.delete(topic)
    }
  }

  /**
   * Unsubscribe from topic
   */
  unsubscribe(topic: string): void {
    this.subscriptions.delete(topic)

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠︎ Not connected, topic removed from subscriptions')
      return
    }

    const unsubscribeMessage = {
      type: 'unsubscribe',
      topic: topic,
    }

    try {
      this.ws.send(JSON.stringify(unsubscribeMessage))
      console.log(`✓ Unsubscribed from: ${topic}`)
      this.emit('unsubscribed', { topic })
    } catch (error) {
      console.error(`✖ Failed to unsubscribe from ${topic}:`, error)
    }
  }

  /**
   * Subscribe to crypto price updates
   */
  subscribeToCryptoPrices(symbols: string[], handler?: (update: CryptoPriceUpdate) => void): void {
    for (const symbol of symbols) {
      const topic = `crypto_prices:${symbol}`
      this.subscribe(topic, handler)
    }
  }

  /**
   * Subscribe to comments
   */
  subscribeToComments(marketId: string, handler?: (update: CommentUpdate) => void): void {
    const topic = `comments:${marketId}`
    this.subscribe(topic, handler)
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    return {
      connected: this.isConnected(),
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      messageCount: this.messageCount,
      lastMessageTime: this.lastMessageTime,
      subscriptions: new Set(this.subscriptions),
      reconnectAttempts: this.reconnectAttempts,
    }
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
    return this.isConnected()
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: RTDSMessage): void {
    this.lastMessageTime = Date.now()
    this.messageCount++

    // Emit message event
    this.emit('message', message)

    // Emit topic-specific event
    const topicEvent = `topic:${message.topic}`
    this.emit(topicEvent, message.payload)

    // Handle specific message types
    switch (message.type) {
      case 'price_update':
        this.emit('priceUpdate', message.payload as CryptoPriceUpdate)
        break
      case 'comment_update':
        this.emit('commentUpdate', message.payload as CommentUpdate)
        break
      case 'subscription_confirmation':
        console.log(`✓ Subscription confirmed: ${message.payload.topic}`)
        break
      case 'error':
        console.error('✖ RTDS error:', message.payload)
        this.emit('rtdsError', message.payload)
        break
    }
  }

  /**
   * Resubscribe to all topics after reconnection
   */
  private resubscribeToAll(): void {
    const topics = Array.from(this.subscriptions)
    for (const topic of topics) {
      this.subscribe(topic)
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
    const jitter = Math.random() * 1000
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) + jitter,
      this.maxReconnectDelay
    )

    console.log(`⏳︎ Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})...`)

    this.reconnectTimeout = setTimeout(() => {
      this.connect()
        .then(() => {
          this.reconnectAttempts = 0
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
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingMessage = {
          type: 'ping',
          timestamp: Date.now(),
        }
        try {
          this.ws.send(JSON.stringify(pingMessage))
        } catch (error) {
          console.error('✖ Failed to send ping:', error)
        }
      }
    }, 5000)
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
}

export default PolymarketRTDS
