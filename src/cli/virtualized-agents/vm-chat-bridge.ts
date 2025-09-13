import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import type { SecureVirtualizedAgent } from './secure-vm-agent'
import {
  type VMBridgeResponse,
  type VMChatMessage,
  VMCommunicationError,
  type VMEventEmitter,
  type VMMessage,
} from './vm-message-types'
import { type VMSession, vmSessionManager } from './vm-session-manager'
import { vmWebSocketServer } from './vm-websocket-server'

/**
 * VMChatBridge - Bridge principale per comunicazione VM mode <-> VM agents
 *
 * Questo componente orchestral la comunicazione bidirezionale tra:
 * - Chat interfaccia in VM mode (utente che digita messaggi)
 * - Agenti VM che girano nei containers
 *
 * Gestisce routing messaggi, sessioni, streaming e recovery della comunicazione.
 */
export class VMChatBridge extends EventEmitter implements VMEventEmitter {
  private isInitialized: boolean = false
  private activeAgents: Map<string, SecureVirtualizedAgent> = new Map()
  private bridgeStats: VMBridgeStats

  constructor() {
    super()
    this.bridgeStats = {
      totalMessagesRouted: 0,
      activeConnections: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      uptime: Date.now(),
    }

    this.setupEventHandlers()
  }

  /**
   * Inizializza il bridge di comunicazione VM
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log(chalk.yellow('⚠️ VM Chat Bridge already initialized'))
      return
    }

    try {
      console.log(chalk.blue('🌉 Initializing VM Chat Bridge...'))

      // Ensure WebSocket server is running
      if (!vmWebSocketServer.getServerStats().isRunning) {
        await vmWebSocketServer.start()
      }

      this.isInitialized = true
      console.log(chalk.green('✅ VM Chat Bridge initialized successfully'))

      this.emit('bridge_initialized')
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to initialize VM Chat Bridge: ${error.message}`))
      throw error
    }
  }

  /**
   * Registra agente VM con il bridge
   */
  async registerVMAgent(agent: SecureVirtualizedAgent): Promise<void> {
    try {
      this.activeAgents.set(agent.id, agent)

      // Create session for this agent if it has a container
      const containerId = agent.getContainerId()
      if (containerId) {
        const session = await vmSessionManager.createSession(containerId, agent.id)
        console.log(chalk.green(`📝 Created session ${session.sessionId} for VM agent ${agent.id}`))
      }

      console.log(chalk.cyan(`🤖 Registered VM agent ${agent.id} with bridge`))
      this.updateStats()
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to register VM agent ${agent.id}: ${error.message}`))
      throw error
    }
  }

  /**
   * Deregistra agente VM dal bridge
   */
  async unregisterVMAgent(agentId: string): Promise<void> {
    try {
      const agent = this.activeAgents.get(agentId)
      if (!agent) return

      // End sessions for this agent
      const sessions = vmSessionManager.getActiveSessions().filter((s) => s.agentId === agentId)
      for (const session of sessions) {
        await vmSessionManager.endSession(session.sessionId, 'agent_unregistered')
      }

      this.activeAgents.delete(agentId)
      console.log(chalk.yellow(`🤖 Unregistered VM agent ${agentId} from bridge`))
      this.updateStats()
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to unregister VM agent ${agentId}: ${error.message}`))
    }
  }

  /**
   * Invia messaggio da VM mode chat a specifico agente VM
   */
  async sendMessageToAgent(agentId: string, message: string, options?: VMChatOptions): Promise<VMBridgeResponse> {
    const startTime = Date.now()

    try {
      if (!this.isInitialized) {
        throw new Error('VM Chat Bridge not initialized')
      }

      const agent = this.activeAgents.get(agentId)
      if (!agent) {
        throw new VMCommunicationError(`VM agent ${agentId} not found or not registered`, agentId, 'AGENT_NOT_FOUND')
      }

      const containerId = agent.getContainerId()
      if (!containerId) {
        throw new VMCommunicationError(`VM agent ${agentId} has no active container`, agentId, 'NO_CONTAINER')
      }

      // Get or create session
      let session = vmSessionManager.getSessionByContainer(containerId)
      if (!session) {
        session = await vmSessionManager.createSession(containerId, agentId)
      }

      // Send chat message through session manager
      await vmSessionManager.sendChatMessage(session.sessionId, message, 'user')

      // Process message with VM agent
      const response = await this.processAgentMessage(agent, message, session)

      const responseTime = Date.now() - startTime
      this.bridgeStats.totalMessagesRouted++
      this.bridgeStats.successfulRequests++
      this.updateAverageResponseTime(responseTime)

      console.log(chalk.green(`💬 Successfully routed message to agent ${agentId} (${responseTime}ms)`))

      return {
        success: true,
        data: response,
        metadata: {
          responseTime,
          containerId,
          sessionId: session.sessionId,
        },
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime
      this.bridgeStats.failedRequests++

      console.error(chalk.red(`❌ Failed to send message to agent ${agentId}: ${error.message}`))

      return {
        success: false,
        error: error.message,
        metadata: {
          responseTime,
          containerId: '',
          sessionId: '',
        },
      }
    }
  }

  /**
   * Invia messaggio con streaming response
   */
  async *sendMessageToAgentStreaming(
    agentId: string,
    message: string,
    options?: VMChatOptions
  ): AsyncGenerator<VMStreamingChunk, VMBridgeResponse, unknown> {
    const startTime = Date.now()

    try {
      if (!this.isInitialized) {
        throw new Error('VM Chat Bridge not initialized')
      }

      const agent = this.activeAgents.get(agentId)
      if (!agent) {
        throw new VMCommunicationError(`VM agent ${agentId} not found or not registered`, agentId, 'AGENT_NOT_FOUND')
      }

      const containerId = agent.getContainerId()
      if (!containerId) {
        throw new VMCommunicationError(`VM agent ${agentId} has no active container`, agentId, 'NO_CONTAINER')
      }

      // Get or create session
      let session = vmSessionManager.getSessionByContainer(containerId)
      if (!session) {
        session = await vmSessionManager.createSession(containerId, agentId)
      }

      // Send initial message
      await vmSessionManager.sendChatMessage(session.sessionId, message, 'user')

      // Process with streaming
      let fullResponse = ''
      for await (const chunk of agent.processChatMessageStreaming(message)) {
        fullResponse += chunk

        yield {
          type: 'content',
          content: chunk,
          metadata: {
            agentId,
            containerId,
            sessionId: session.sessionId,
          },
        }
      }

      // Send agent response to session
      if (fullResponse) {
        await vmSessionManager.sendChatMessage(session.sessionId, fullResponse, 'agent')
      }

      const responseTime = Date.now() - startTime
      this.bridgeStats.totalMessagesRouted++
      this.bridgeStats.successfulRequests++
      this.updateAverageResponseTime(responseTime)

      console.log(chalk.green(`🌊 Successfully streamed response from agent ${agentId} (${responseTime}ms)`))

      return {
        success: true,
        data: fullResponse,
        metadata: {
          responseTime,
          containerId,
          sessionId: session.sessionId,
        },
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime
      this.bridgeStats.failedRequests++

      console.error(chalk.red(`❌ Failed to stream message to agent ${agentId}: ${error.message}`))

      yield {
        type: 'error',
        error: error.message,
        metadata: {
          agentId,
          containerId: '',
          sessionId: '',
        },
      }

      return {
        success: false,
        error: error.message,
        metadata: {
          responseTime,
          containerId: '',
          sessionId: '',
        },
      }
    }
  }

  /**
   * Broadcast messaggio a tutti gli agenti VM attivi
   */
  async broadcastMessage(message: string): Promise<VMBridgeResponse[]> {
    const promises = Array.from(this.activeAgents.keys()).map((agentId) => this.sendMessageToAgent(agentId, message))

    const results = await Promise.allSettled(promises)

    return results.map((result) =>
      result.status === 'fulfilled' ? result.value : { success: false, error: result.reason.message }
    )
  }

  /**
   * Ottieni agente VM per container ID
   */
  getAgentByContainer(containerId: string): SecureVirtualizedAgent | undefined {
    for (const agent of this.activeAgents.values()) {
      if (agent.getContainerId() === containerId) {
        return agent
      }
    }
    return undefined
  }

  /**
   * Ottieni tutti gli agenti VM attivi
   */
  getActiveAgents(): SecureVirtualizedAgent[] {
    return Array.from(this.activeAgents.values())
  }

  /**
   * Ottieni statistiche del bridge
   */
  getBridgeStats(): VMBridgeStats {
    return {
      ...this.bridgeStats,
      activeConnections: this.activeAgents.size,
      uptime: Date.now() - this.bridgeStats.uptime,
    }
  }

  /**
   * Chiudi il bridge e cleanup
   */
  async shutdown(): Promise<void> {
    try {
      console.log(chalk.yellow('🌉 Shutting down VM Chat Bridge...'))

      // Unregister all agents
      for (const agentId of this.activeAgents.keys()) {
        await this.unregisterVMAgent(agentId)
      }

      // End all active sessions
      const sessions = vmSessionManager.getActiveSessions()
      for (const session of sessions) {
        await vmSessionManager.endSession(session.sessionId, 'bridge_shutdown')
      }

      this.isInitialized = false
      console.log(chalk.green('✅ VM Chat Bridge shutdown complete'))
    } catch (error: any) {
      console.error(chalk.red(`❌ Error during bridge shutdown: ${error.message}`))
    }
  }

  // Private methods

  private async processAgentMessage(
    agent: SecureVirtualizedAgent,
    message: string,
    session: VMSession
  ): Promise<string> {
    try {
      // Ensure agent is in chat mode
      if (agent.getVMState() !== 'running') {
        await agent.startChatMode()
      }

      // Process message with agent
      const response = await agent.processChatMessage(message)

      // Send agent response to session
      await vmSessionManager.sendChatMessage(session.sessionId, response, 'agent')

      return response
    } catch (error: any) {
      console.error(chalk.red(`❌ Error processing message with agent ${agent.id}: ${error.message}`))
      throw error
    }
  }

  private setupEventHandlers(): void {
    // Handle WebSocket server events
    vmWebSocketServer.on('connected', (containerId: string) => {
      console.log(chalk.cyan(`🔗 Container ${containerId.slice(0, 12)} connected to bridge`))
      this.emit('container_connected', containerId)
    })

    vmWebSocketServer.on('disconnected', (containerId: string) => {
      console.log(chalk.yellow(`📵 Container ${containerId.slice(0, 12)} disconnected from bridge`))
      this.emit('container_disconnected', containerId)
    })

    vmWebSocketServer.on('message', (message: VMMessage) => {
      this.handleIncomingMessage(message)
    })

    // Handle session manager events
    vmSessionManager.on('session_created', (sessionId: string) => {
      console.log(chalk.green(`📝 Session ${sessionId} created in bridge`))
    })

    vmSessionManager.on('message_received', (sessionId: string, message: VMMessage) => {
      this.emit('message_received', sessionId, message)
    })
  }

  private async handleIncomingMessage(message: VMMessage): Promise<void> {
    try {
      // Route message to appropriate handler based on type
      if (message.type === 'chat_message') {
        await this.handleChatMessage(message as VMChatMessage)
      } else if (message.type === 'response') {
        this.emit('agent_response', message)
      } else if (message.type === 'error') {
        this.emit('agent_error', message)
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Error handling incoming message: ${error.message}`))
    }
  }

  private async handleChatMessage(message: VMChatMessage): Promise<void> {
    // This handles messages coming FROM agents TO the bridge/VM mode
    const agent = this.getAgentByContainer(message.containerId)
    if (agent) {
      console.log(
        chalk.blue(`📨 Received chat message from agent ${agent.id}: ${message.payload.content.slice(0, 50)}...`)
      )
      this.emit('agent_message', agent.id, message.payload.content)
    }
  }

  private updateStats(): void {
    this.bridgeStats.activeConnections = this.activeAgents.size
  }

  private updateAverageResponseTime(responseTime: number): void {
    const total = this.bridgeStats.successfulRequests
    const current = this.bridgeStats.averageResponseTime
    this.bridgeStats.averageResponseTime = (current * (total - 1) + responseTime) / total
  }
}

// Interfaces and types
export interface VMChatOptions {
  priority?: 'low' | 'normal' | 'high'
  timeout?: number
  streaming?: boolean
  metadata?: any
}

export interface VMStreamingChunk {
  type: 'content' | 'error' | 'complete'
  content?: string
  error?: string
  metadata?: {
    agentId: string
    containerId: string
    sessionId: string
  }
}

export interface VMBridgeStats {
  totalMessagesRouted: number
  activeConnections: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  uptime: number
}

// Singleton instance
export const vmChatBridge = new VMChatBridge()
