// WebSocket server for real-time updates in Background Agents web interface
import type { Server as HTTPServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { backgroundAgentService } from '../background-agent-service'
import type { BackgroundJob } from '../types'

export interface WebSocketMessage {
  type:
  | 'job:created'
  | 'job:started'
  | 'job:completed'
  | 'job:failed'
  | 'job:log'
  | 'heartbeat'
  | 'connection:established'
  data: any
  timestamp: Date
  clientId?: string
}

export class BackgroundAgentsWebSocketServer {
  private wss: WebSocketServer
  private clients: Map<string, WebSocket> = new Map()
  private heartbeatInterval?: NodeJS.Timeout

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
    })

    this.setupWebSocketServer()
    this.setupEventListeners()
    this.startHeartbeat()
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, _request) => {
      const clientId = this.generateClientId()
      this.clients.set(clientId, ws)

      console.log(`📡 WebSocket client connected: ${clientId}`)

      // Send connection established message
      this.sendToClient(clientId, {
        type: 'connection:established',
        data: { clientId, connectedAt: new Date() },
        timestamp: new Date(),
      })

      // Handle client messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleClientMessage(clientId, message)
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
          // Send error back to client
          this.sendToClient(clientId, {
            type: 'connection:established' as any,
            data: {
              error: 'Invalid message format',
              details: error instanceof Error ? error.message : 'Unknown error'
            },
            timestamp: new Date(),
          })
        }
      })

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(clientId)
        console.log(`📡 WebSocket client disconnected: ${clientId}`)
      })

      // Handle errors
      ws.on('error', (error) => {
        console.error(`📡 WebSocket error for client ${clientId}:`, error)
        this.clients.delete(clientId)
      })

      // Send initial data
      this.sendInitialData(clientId)
    })
  }

  private setupEventListeners(): void {
    // Listen to background agent service events
    backgroundAgentService.on('job:created', (job: BackgroundJob) => {
      this.broadcastToAll({
        type: 'job:created',
        data: job,
        timestamp: new Date(),
      })
    })

    backgroundAgentService.on('job:started', (job: BackgroundJob) => {
      this.broadcastToAll({
        type: 'job:started',
        data: job,
        timestamp: new Date(),
      })
    })

    backgroundAgentService.on('job:completed', (job: BackgroundJob) => {
      this.broadcastToAll({
        type: 'job:completed',
        data: job,
        timestamp: new Date(),
      })
    })

    backgroundAgentService.on('job:failed', (job: BackgroundJob) => {
      this.broadcastToAll({
        type: 'job:failed',
        data: job,
        timestamp: new Date(),
      })
    })

    backgroundAgentService.on('job:log', (jobId: string, logEntry: any) => {
      this.broadcastToAll({
        type: 'job:log',
        data: { jobId, logEntry },
        timestamp: new Date(),
      })
    })
  }

  private handleClientMessage(clientId: string, message: any): void {
    // Handle different message types from clients
    switch (message.type) {
      case 'ping':
        this.sendToClient(clientId, {
          type: 'heartbeat',
          data: { pong: true },
          timestamp: new Date(),
        })
        break

      case 'subscribe':
        // Handle subscription to specific job updates
        // Implementation would depend on specific requirements
        break

      default:
        console.log(`📡 Unknown message type from ${clientId}:`, message.type)
    }
  }

  private sendInitialData(clientId: string): void {
    try {
      // Send current jobs state to new client
      const jobs = backgroundAgentService.listJobs({ limit: 50, offset: 0 })

      jobs.forEach((job) => {
        this.sendToClient(clientId, {
          type: 'job:created',
          data: job,
          timestamp: new Date(),
        })
      })

      // Send current statistics
      const stats = backgroundAgentService.getStats()
      this.sendToClient(clientId, {
        type: 'connection:established',
        data: {
          stats,
          totalJobs: jobs.length,
          connectedClients: this.clients.size,
        },
        timestamp: new Date(),
      })
    } catch (error) {
      console.error('Error sending initial data to client:', error)
    }
  }

  private sendToClient(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId)
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        client.send(
          JSON.stringify({
            ...message,
            clientId,
          })
        )
      } catch (error) {
        console.error(`Error sending message to client ${clientId}:`, error)
        this.clients.delete(clientId)
      }
    }
  }

  private broadcastToAll(message: WebSocketMessage): void {
    const deadClients: string[] = []

    for (const [clientId, client] of this.clients.entries()) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(
            JSON.stringify({
              ...message,
              clientId,
            })
          )
        } catch (error) {
          console.error(`Error broadcasting to client ${clientId}:`, error)
          deadClients.push(clientId)
        }
      } else {
        deadClients.push(clientId)
      }
    }

    // Clean up dead connections
    deadClients.forEach((clientId) => {
      this.clients.delete(clientId)
    })
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.broadcastToAll({
        type: 'heartbeat',
        data: {
          timestamp: new Date(),
          connectedClients: this.clients.size,
          serverUptime: process.uptime(),
        },
        timestamp: new Date(),
      })
    }, 30000) // Send heartbeat every 30 seconds
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  public getConnectedClients(): number {
    return this.clients.size
  }

  public getStats() {
    return {
      connectedClients: this.clients.size,
      totalMessages: 0, // Could track this with a counter
      uptime: process.uptime(),
    }
  }

  public shutdown(): void {
    console.log('📡 Shutting down WebSocket server...')

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    // Close all client connections
    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.close(1000, 'Server shutting down')
      } catch (error) {
        console.error(`Error closing connection for client ${clientId}:`, error)
      }
    }

    this.clients.clear()
    this.wss.close()

    console.log('📡 WebSocket server shut down successfully')
  }
}
