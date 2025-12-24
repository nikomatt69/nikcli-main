/**
 * NikCLI Mobile - WebSocket Server Extension
 * Real-time streaming for mobile clients
 */

import type { Server as HTTPServer, IncomingMessage } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { agentService } from '../../services/agent-service'
import { streamttyService } from '../../services/streamtty-service'
import { diffManager } from '../../ui/diff-manager'

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

export class MobileWebSocketServer {
  private wss: WebSocketServer
  private clients: Map<string, WebSocket> = new Map()
  private heartbeatInterval?: NodeJS.Timeout
  private streamBuffer: Map<string, string> = new Map()

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/mobile',
      verifyClient: (info, callback) => {
        // Allow all origins in production (Railway handles this)
        // In development, verify against allowed origins
        if (process.env.NODE_ENV === 'production') {
          callback(true)
          return
        }

        const origin = info.origin
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:8081', // Expo default
          'exp://localhost:8081',
        ]

        callback(!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*'))
      },
    })

    this.setupWebSocketServer()
    this.setupServiceListeners()
    this.startHeartbeat()
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      const clientId = this.generateClientId()
      this.clients.set(clientId, ws)

      console.log(`📱 Mobile client connected: ${clientId}`)

      // Send connection established with initial state
      this.sendToClient(clientId, {
        type: 'connection:established',
        data: {
          clientId,
          connectedAt: new Date(),
          status: this.getCurrentStatus(),
        },
        timestamp: new Date(),
      })

      // Handle incoming messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message: MobileClientMessage = JSON.parse(data.toString())
          await this.handleClientMessage(clientId, message)
        } catch (error) {
          console.error('Error parsing mobile WebSocket message:', error)
          this.sendToClient(clientId, {
            type: 'error',
            data: {
              error: 'Invalid message format',
              details: error instanceof Error ? error.message : 'Unknown error',
            },
            timestamp: new Date(),
          })
        }
      })

      ws.on('close', () => {
        this.clients.delete(clientId)
        this.streamBuffer.delete(clientId)
        console.log(`📱 Mobile client disconnected: ${clientId}`)
      })

      ws.on('error', (error: Error) => {
        console.error(`📱 Mobile WebSocket error for ${clientId}:`, error)
        this.clients.delete(clientId)
      })
    })
  }

  private setupServiceListeners(): void {
    // Agent events
    agentService.on('task_start', (task: any) => {
      this.broadcastToAll({
        type: 'agent:started',
        data: {
          agentId: task.id,
          agentType: task.agentType,
          task: task.task,
        },
        timestamp: new Date(),
      })
    })

    agentService.on('task_progress', (task: any, update: any) => {
      this.broadcastToAll({
        type: 'agent:progress',
        data: {
          agentId: task.id,
          agentType: task.agentType,
          progress: update.progress,
          description: update.description,
        },
        timestamp: new Date(),
      })
    })

    agentService.on('tool_use', (task: any, update: any) => {
      this.broadcastToAll({
        type: 'message:tool',
        data: {
          agentId: task.id,
          tool: update.tool,
          description: update.description,
        },
        timestamp: new Date(),
      })
    })

    agentService.on('task_complete', (task: any) => {
      const eventType = task.status === 'completed' ? 'agent:completed' : 'agent:failed'
      this.broadcastToAll({
        type: eventType,
        data: {
          agentId: task.id,
          agentType: task.agentType,
          status: task.status,
          result: task.result,
          error: task.error,
        },
        timestamp: new Date(),
      })
    })

    // Stream events from streamtty service
    streamttyService.on('chunk', (chunk: any) => {
      this.broadcastToAll({
        type: 'stream:chunk',
        data: {
          content: chunk.content,
          chunkType: chunk.type,
          isComplete: false,
        },
        timestamp: new Date(),
      })
    })

    streamttyService.on('complete', (data: any) => {
      this.broadcastToAll({
        type: 'stream:complete',
        data: {
          content: data.content,
          totalLength: data.totalLength,
        },
        timestamp: new Date(),
      })
    })

    // Diff events
    diffManager.on('diff:created', (diff: any) => {
      this.broadcastToAll({
        type: 'diff:created',
        data: diff,
        timestamp: new Date(),
      })
    })

    diffManager.on('diff:accepted', (diffId: string) => {
      this.broadcastToAll({
        type: 'diff:accepted',
        data: { diffId },
        timestamp: new Date(),
      })
    })

    diffManager.on('diff:rejected', (diffId: string) => {
      this.broadcastToAll({
        type: 'diff:rejected',
        data: { diffId },
        timestamp: new Date(),
      })
    })
  }

  private async handleClientMessage(clientId: string, message: MobileClientMessage): Promise<void> {
    switch (message.type) {
      case 'send_message':
        await this.handleSendMessage(clientId, message.payload)
        break

      case 'launch_agent':
        await this.handleLaunchAgent(clientId, message.payload)
        break

      case 'stop_agent':
        await this.handleStopAgent(clientId, message.payload)
        break

      case 'command':
        await this.handleCommand(clientId, message.payload)
        break

      case 'ping':
        this.sendToClient(clientId, {
          type: 'heartbeat',
          data: { pong: true, timestamp: new Date() },
          timestamp: new Date(),
        })
        break

      case 'subscribe':
        // Client wants to subscribe to specific events
        console.log(`📱 Client ${clientId} subscribed to:`, message.payload)
        break

      default:
        console.log(`📱 Unknown message type from ${clientId}:`, message.type)
    }
  }

  private async handleSendMessage(clientId: string, payload: { content: string }): Promise<void> {
    const { content } = payload

    if (!content?.trim()) {
      this.sendToClient(clientId, {
        type: 'error',
        data: { error: 'Message content is required' },
        timestamp: new Date(),
      })
      return
    }

    // Echo user message back
    this.sendToClient(clientId, {
      type: 'message:user',
      data: {
        id: `msg_${Date.now()}`,
        content,
        status: 'completed',
      },
      timestamp: new Date(),
    })

    // Process through streaming orchestrator if available
    const orchestrator = (global as any).__streamingOrchestrator
    if (orchestrator) {
      // System message to confirm processing
      this.sendToClient(clientId, {
        type: 'message:system',
        data: {
          id: `sys_${Date.now()}`,
          content: `⚡ Processing: "${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"`,
          status: 'completed',
        },
        timestamp: new Date(),
      })

      // Check for agent commands
      if (content.startsWith('@')) {
        const match = content.match(/^@([\w-]+)\s*(.*)$/)
        if (match) {
          const agentName = match[1]
          const task = match[2]?.trim() || ''
          await this.handleLaunchAgent(clientId, { agentName, task })
          return
        }
      }

      // Check for slash commands
      if (content.startsWith('/')) {
        const parts = content.slice(1).split(' ')
        await this.handleCommand(clientId, {
          command: parts[0],
          args: parts.slice(1),
        })
        return
      }

      // Regular message - queue for processing
      orchestrator.queueVMMessage(content)
    } else {
      this.sendToClient(clientId, {
        type: 'message:system',
        data: {
          id: `sys_${Date.now()}`,
          content: '⚠️ Orchestrator not available. Start nikcli in TUI mode first.',
          status: 'completed',
        },
        timestamp: new Date(),
      })
    }
  }

  private async handleLaunchAgent(clientId: string, payload: { agentName: string; task: string }): Promise<void> {
    const { agentName, task } = payload

    if (!agentName || !task) {
      this.sendToClient(clientId, {
        type: 'error',
        data: { error: 'agentName and task are required' },
        timestamp: new Date(),
      })
      return
    }

    try {
      // Check capacity
      const activeAgents = agentService.getActiveAgents()
      if (activeAgents.length >= 3) {
        this.sendToClient(clientId, {
          type: 'message:system',
          data: {
            id: `sys_${Date.now()}`,
            content: `⏳ Agent ${agentName} queued (${activeAgents.length}/3 active)`,
            status: 'completed',
          },
          timestamp: new Date(),
        })
      }

      const taskId = await agentService.executeTask(agentName, task, {})

      this.sendToClient(clientId, {
        type: 'message:system',
        data: {
          id: `sys_${Date.now()}`,
          content: `🚀 Launched ${agentName} agent (Task ID: ${taskId.slice(-6)})`,
          status: 'completed',
        },
        timestamp: new Date(),
      })
    } catch (error: any) {
      this.sendToClient(clientId, {
        type: 'message:error',
        data: {
          id: `err_${Date.now()}`,
          content: `❌ Failed to launch ${agentName}: ${error.message}`,
          status: 'completed',
        },
        timestamp: new Date(),
      })
    }
  }

  private async handleStopAgent(clientId: string, payload: { agentId: string }): Promise<void> {
    const { agentId } = payload

    try {
      const cancelled = await agentService.cancelTask(agentId)

      this.sendToClient(clientId, {
        type: 'message:system',
        data: {
          id: `sys_${Date.now()}`,
          content: cancelled
            ? `⏹️ Agent ${agentId.slice(-6)} stopped`
            : `⚠️ Agent ${agentId.slice(-6)} not found or already stopped`,
          status: 'completed',
        },
        timestamp: new Date(),
      })
    } catch (error: any) {
      this.sendToClient(clientId, {
        type: 'message:error',
        data: {
          id: `err_${Date.now()}`,
          content: `❌ Failed to stop agent: ${error.message}`,
          status: 'completed',
        },
        timestamp: new Date(),
      })
    }
  }

  private async handleCommand(clientId: string, payload: { command: string; args?: string[] }): Promise<void> {
    const { command, args = [] } = payload

    switch (command.toLowerCase()) {
      case 'status':
        const status = this.getCurrentStatus()
        this.sendToClient(clientId, {
          type: 'message:system',
          data: {
            id: `sys_${Date.now()}`,
            content: `📊 Status:
• Working Dir: ${status.workingDirectory}
• Active Agents: ${status.activeAgents}/3
• Queued Tasks: ${status.queuedTasks}
• Pending Diffs: ${status.pendingDiffs}
• Context: ${status.contextLeft}%
• Plan Mode: ${status.mode.plan ? 'ON' : 'OFF'}
• Auto-Accept: ${status.mode.autoAccept ? 'ON' : 'OFF'}
• VM Mode: ${status.mode.vm ? 'ON' : 'OFF'}`,
            status: 'completed',
          },
          timestamp: new Date(),
        })
        break

      case 'agents':
        const activeAgents = agentService.getActiveAgents()
        const agentList = activeAgents.length > 0
          ? activeAgents.map((a: any) => `• ${a.agentType} [${a.status}] ${a.progress ? `${a.progress}%` : ''}`).join('\n')
          : 'No active agents'

        this.sendToClient(clientId, {
          type: 'message:system',
          data: {
            id: `sys_${Date.now()}`,
            content: `🔌 Active Agents (${activeAgents.length}/3):\n${agentList}`,
            status: 'completed',
          },
          timestamp: new Date(),
        })
        break

      case 'help':
      case 'commands':
        this.sendToClient(clientId, {
          type: 'message:system',
          data: {
            id: `sys_${Date.now()}`,
            content: `📋 Available Commands:
• /status - Show current status
• /agents - List active agents
• /help - Show this help
• @agent-name task - Launch agent`,
            status: 'completed',
          },
          timestamp: new Date(),
        })
        break

      default:
        this.sendToClient(clientId, {
          type: 'message:error',
          data: {
            id: `err_${Date.now()}`,
            content: `❌ Unknown command: /${command}. Type /help for available commands.`,
            status: 'completed',
          },
          timestamp: new Date(),
        })
    }
  }

  private getCurrentStatus(): any {
    const activeAgents = agentService.getActiveAgents()
    const queuedTasks = agentService.getQueuedTasks()
    const pendingDiffs = diffManager.getPendingCount()

    const orchestrator = (global as any).__streamingOrchestrator
    const context = orchestrator?.context || {
      planMode: false,
      autoAcceptEdits: true,
      vmMode: false,
      contextLeft: 100,
    }

    return {
      workingDirectory: process.cwd(),
      activeAgents: activeAgents.length,
      queuedTasks: queuedTasks.length,
      pendingDiffs,
      contextLeft: context.contextLeft,
      mode: {
        plan: context.planMode,
        autoAccept: context.autoAcceptEdits,
        vm: context.vmMode,
      },
    }
  }

  private sendToClient(clientId: string, message: MobileWebSocketMessage): void {
    const client = this.clients.get(clientId)
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify({ ...message, clientId }))
      } catch (error) {
        console.error(`Error sending to mobile client ${clientId}:`, error)
        this.clients.delete(clientId)
      }
    }
  }

  private broadcastToAll(message: MobileWebSocketMessage): void {
    const deadClients: string[] = []

    for (const [clientId, client] of this.clients.entries()) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify({ ...message, clientId }))
        } catch (error) {
          console.error(`Error broadcasting to mobile client ${clientId}:`, error)
          deadClients.push(clientId)
        }
      } else {
        deadClients.push(clientId)
      }
    }

    deadClients.forEach(id => this.clients.delete(id))
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.broadcastToAll({
        type: 'heartbeat',
        data: {
          timestamp: new Date(),
          connectedClients: this.clients.size,
          status: this.getCurrentStatus(),
        },
        timestamp: new Date(),
      })
    }, 30000)
  }

  private generateClientId(): string {
    return `mobile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }

  public getConnectedClients(): number {
    return this.clients.size
  }

  public shutdown(): void {
    console.log('📱 Shutting down Mobile WebSocket server...')

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.close(1000, 'Server shutting down')
      } catch (error) {
        console.error(`Error closing mobile client ${clientId}:`, error)
      }
    }

    this.clients.clear()
    this.wss.close()

    console.log('📱 Mobile WebSocket server shut down')
  }
}
