// src/cli/background-agents/api/mobile/mobile-websocket-adapter.ts
// Mobile-optimized WebSocket adapter with compression and reconnection

import type { Server as HTTPServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { headlessMode } from '../../../modes/headless-mode'
import type { HeadlessMessage } from '../../../modes/headless-mode'
import { nanoid } from 'nanoid'
import { promisify } from 'node:util'
import { gzip, gunzip } from 'node:zlib'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

export interface MobileWebSocketMessage {
  id: string
  type:
    | 'ping'
    | 'pong'
    | 'subscribe'
    | 'unsubscribe'
    | 'message'
    | 'command'
    | 'stream'
    | 'approval'
    | 'error'
  sessionId?: string
  payload?: any
  compressed?: boolean
  timestamp: string
}

export interface MobileWSConfig {
  compressionThreshold?: number // Compress messages larger than this (bytes)
  heartbeatInterval?: number // Heartbeat interval (ms)
  maxMessageSize?: number // Max message size (bytes)
  enableCompression?: boolean
}

/**
 * Mobile WebSocket Adapter
 * Optimized for mobile networks with compression and efficient reconnection
 */
export class MobileWebSocketAdapter {
  private wss: WebSocketServer
  private clients: Map<string, MobileWSClient> = new Map()
  private config: Required<MobileWSConfig>
  private heartbeatInterval?: NodeJS.Timeout

  constructor(server: HTTPServer, config: MobileWSConfig = {}) {
    this.config = {
      compressionThreshold: config.compressionThreshold || 1024, // 1KB
      heartbeatInterval: config.heartbeatInterval || 30000, // 30s
      maxMessageSize: config.maxMessageSize || 100 * 1024, // 100KB
      enableCompression: config.enableCompression ?? true,
    }

    this.wss = new WebSocketServer({
      server,
      path: '/mobile/ws',
      maxPayload: this.config.maxMessageSize,
    })

    this.setupWebSocketServer()
    this.setupHeadlessModeListeners()
    this.startHeartbeat()
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request: any) => {
      const clientId = nanoid()
      const client = new MobileWSClient(clientId, ws, this.config)

      this.clients.set(clientId, client)
      console.log(`📱 Mobile WebSocket client connected: ${clientId}`)

      // Send connection acknowledgment
      client.send({
        id: nanoid(),
        type: 'pong',
        payload: {
          clientId,
          connectedAt: new Date().toISOString(),
          compression: this.config.enableCompression,
        },
        timestamp: new Date().toISOString(),
      })

      // Handle client messages
      ws.on('message', async (data: Buffer) => {
        try {
          await this.handleClientMessage(client, data)
        } catch (error) {
          console.error('Error handling mobile client message:', error)
          client.send({
            id: nanoid(),
            type: 'error',
            payload: {
              error: 'MESSAGE_HANDLING_ERROR',
              message: error instanceof Error ? error.message : 'Unknown error',
            },
            timestamp: new Date().toISOString(),
          })
        }
      })

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(clientId)
        console.log(`📱 Mobile WebSocket client disconnected: ${clientId}`)
      })

      // Handle errors
      ws.on('error', (error: Error) => {
        console.error(`📱 Mobile WebSocket error for client ${clientId}:`, error)
        this.clients.delete(clientId)
      })
    })
  }

  /**
   * Handle client message
   */
  private async handleClientMessage(client: MobileWSClient, data: Buffer): Promise<void> {
    let message: MobileWebSocketMessage

    try {
      // Check if compressed
      const isCompressed = data[0] === 0x1f && data[1] === 0x8b // Gzip magic numbers

      let jsonData: string
      if (isCompressed) {
        const decompressed = await gunzipAsync(data)
        jsonData = decompressed.toString('utf-8')
      } else {
        jsonData = data.toString('utf-8')
      }

      message = JSON.parse(jsonData)
    } catch (error) {
      throw new Error('Failed to parse message')
    }

    // Handle different message types
    switch (message.type) {
      case 'ping':
        client.send({
          id: message.id,
          type: 'pong',
          timestamp: new Date().toISOString(),
        })
        break

      case 'subscribe':
        if (message.sessionId) {
          client.subscribeToSession(message.sessionId)
          client.send({
            id: nanoid(),
            type: 'message',
            payload: {
              subscribed: true,
              sessionId: message.sessionId,
            },
            timestamp: new Date().toISOString(),
          })
        }
        break

      case 'unsubscribe':
        if (message.sessionId) {
          client.unsubscribeFromSession(message.sessionId)
          client.send({
            id: nanoid(),
            type: 'message',
            payload: {
              unsubscribed: true,
              sessionId: message.sessionId,
            },
            timestamp: new Date().toISOString(),
          })
        }
        break

      case 'message':
      case 'command':
        // Forward to headless mode (handled by REST API)
        client.send({
          id: message.id,
          type: 'message',
          payload: {
            acknowledged: true,
            message: 'Use REST API for sending messages/commands',
          },
          timestamp: new Date().toISOString(),
        })
        break

      case 'approval':
        // Handle approval response
        if (message.payload?.id && typeof message.payload?.approved === 'boolean') {
          headlessMode.respondToApproval({
            id: message.payload.id,
            approved: message.payload.approved,
            reason: message.payload.reason,
          })

          client.send({
            id: nanoid(),
            type: 'message',
            payload: {
              approvalSubmitted: true,
              id: message.payload.id,
            },
            timestamp: new Date().toISOString(),
          })
        }
        break

      default:
        throw new Error(`Unknown message type: ${message.type}`)
    }
  }

  /**
   * Setup listeners for headless mode events
   */
  private setupHeadlessModeListeners(): void {
    // Forward stream chunks to subscribed clients
    headlessMode.on('stream:chunk', (data: any) => {
      const { sessionId, chunk, metadata } = data
      this.broadcastToSession(sessionId, {
        id: nanoid(),
        type: 'stream',
        sessionId,
        payload: { chunk, metadata },
        timestamp: new Date().toISOString(),
      })
    })

    // Forward messages to subscribed clients
    headlessMode.on('message', (data: any) => {
      const { sessionId, message } = data
      this.broadcastToSession(sessionId, {
        id: nanoid(),
        type: 'message',
        sessionId,
        payload: message,
        timestamp: new Date().toISOString(),
      })
    })

    // Forward approval requests
    headlessMode.on('approval:requested', (data: any) => {
      const { sessionId, approval } = data
      this.broadcastToSession(sessionId, {
        id: nanoid(),
        type: 'approval',
        sessionId,
        payload: approval,
        timestamp: new Date().toISOString(),
      })
    })

    // Forward command events
    headlessMode.on('command:start', (data: any) => {
      this.broadcastToSession(data.sessionId, {
        id: nanoid(),
        type: 'message',
        sessionId: data.sessionId,
        payload: {
          event: 'command:start',
          command: data.command,
        },
        timestamp: new Date().toISOString(),
      })
    })

    headlessMode.on('command:complete', (data: any) => {
      this.broadcastToSession(data.sessionId, {
        id: nanoid(),
        type: 'message',
        sessionId: data.sessionId,
        payload: {
          event: 'command:complete',
          response: data.response,
        },
        timestamp: new Date().toISOString(),
      })
    })

    headlessMode.on('command:error', (data: any) => {
      this.broadcastToSession(data.sessionId, {
        id: nanoid(),
        type: 'error',
        sessionId: data.sessionId,
        payload: {
          event: 'command:error',
          error: data.error,
        },
        timestamp: new Date().toISOString(),
      })
    })
  }

  /**
   * Broadcast message to all clients subscribed to session
   */
  private broadcastToSession(sessionId: string, message: MobileWebSocketMessage): void {
    for (const client of this.clients.values()) {
      if (client.isSubscribedTo(sessionId)) {
        client.send(message)
      }
    }
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [clientId, client] of this.clients) {
        if (!client.isAlive()) {
          console.log(`📱 Closing dead mobile client: ${clientId}`)
          this.clients.delete(clientId)
          client.close()
        } else {
          client.ping()
        }
      }
    }, this.config.heartbeatInterval)
  }

  /**
   * Shutdown adapter
   */
  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    for (const client of this.clients.values()) {
      client.close()
    }

    this.clients.clear()

    await new Promise<void>((resolve, reject) => {
      this.wss.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }
}

/**
 * Mobile WebSocket Client wrapper
 */
class MobileWSClient {
  private lastPong: number = Date.now()
  private subscribedSessions: Set<string> = new Set()

  constructor(
    public readonly id: string,
    private ws: WebSocket,
    private config: Required<MobileWSConfig>,
  ) {
    // Listen for pong responses
    ws.on('pong', () => {
      this.lastPong = Date.now()
    })
  }

  /**
   * Send message to client with optional compression
   */
  async send(message: MobileWebSocketMessage): Promise<void> {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    try {
      const json = JSON.stringify(message)
      const buffer = Buffer.from(json, 'utf-8')

      // Compress if enabled and message is large enough
      if (this.config.enableCompression && buffer.length > this.config.compressionThreshold) {
        const compressed = await gzipAsync(buffer)
        this.ws.send(compressed)
      } else {
        this.ws.send(buffer)
      }
    } catch (error) {
      console.error('Error sending message to mobile client:', error)
    }
  }

  /**
   * Send ping to client
   */
  ping(): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.ping()
    }
  }

  /**
   * Check if client is alive
   */
  isAlive(): boolean {
    // Consider dead if no pong in 2x heartbeat interval
    return Date.now() - this.lastPong < this.config.heartbeatInterval * 2
  }

  /**
   * Subscribe to session
   */
  subscribeToSession(sessionId: string): void {
    this.subscribedSessions.add(sessionId)
  }

  /**
   * Unsubscribe from session
   */
  unsubscribeFromSession(sessionId: string): void {
    this.subscribedSessions.delete(sessionId)
  }

  /**
   * Check if subscribed to session
   */
  isSubscribedTo(sessionId: string): boolean {
    return this.subscribedSessions.has(sessionId)
  }

  /**
   * Close connection
   */
  close(): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close()
    }
  }
}
