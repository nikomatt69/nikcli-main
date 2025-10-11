import chalk from 'chalk'
import { EventEmitter } from 'events'
import { advancedUI } from '../ui/advanced-cli-ui'
import {
  createVMChatMessage,
  DEFAULT_VM_SESSION_CONFIG,
  type VMAgentContext,
  type VMChatHistory,
  type VMChatMessage,
  type VMEventEmitter,
  type VMMessage,
  type VMSessionConfig,
  VMSessionError,
} from './vm-message-types'
import { vmWebSocketServer } from './vm-websocket-server'

/**
 * VMSessionManager - Gestisce le sessioni individuali di conversazione VM
 *
 * Ogni sessione rappresenta una conversazione continua con un agente VM specifico,
 * mantenendo lo storico, il contesto e gestendo persistenza e recovery delle sessioni.
 */
export class VMSessionManager extends EventEmitter implements VMEventEmitter {
  private sessions: Map<string, VMSession> = new Map()
  private messageQueues: Map<string, VMMessage[]> = new Map()
  private config: VMSessionConfig

  constructor(config?: Partial<VMSessionConfig>) {
    super()
    this.config = { ...DEFAULT_VM_SESSION_CONFIG, ...config }
    this.setupEventHandlers()
  }

  /**
   * Crea nuova sessione VM
   */
  async createSession(containerId: string, agentId: string, config?: Partial<VMSessionConfig>): Promise<VMSession> {
    const sessionId = this.generateSessionId()
    const sessionConfig = { ...this.config, ...config }

    const session: VMSession = {
      sessionId,
      containerId,
      agentId,
      status: 'initializing',
      startTime: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      isActive: false,
      config: sessionConfig,
      context: {
        containerId,
        sessionId,
        agentCapabilities: [],
        conversationHistory: [],
        settings: {},
      },
      history: {
        sessionId,
        containerId,
        messages: [],
        startTime: new Date(),
        metadata: {
          messageCount: 0,
        },
      },
    }

    this.sessions.set(sessionId, session)
    this.messageQueues.set(sessionId, [])

    advancedUI.logFunctionUpdate(
      'success',
      `Created VM session ${sessionId} for container ${containerId.slice(0, 12)}`,
      '📝'
    )

    // Initialize session with container
    await this.initializeSession(session)

    this.emit('session_created', sessionId)
    return session
  }

  /**
   * Ottieni sessione esistente
   */
  getSession(sessionId: string): VMSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Ottieni sessione per container
   */
  getSessionByContainer(containerId: string): VMSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.containerId === containerId) {
        return session
      }
    }
    return undefined
  }

  /**
   * Ottieni tutte le sessioni attive
   */
  getActiveSessions(): VMSession[] {
    return Array.from(this.sessions.values()).filter((session) => session.isActive)
  }

  /**
   * Clear message queue for session
   */
  async clearMessageQueue(sessionId: string): Promise<void> {
    const queue = this.messageQueues.get(sessionId)
    if (queue) {
      queue.length = 0
      advancedUI.logFunctionUpdate('info', `Cleared message queue for session ${sessionId}`, '🧹')
    }
  }

  /**
   * Invia messaggio chat alla sessione
   */
  async sendChatMessage(sessionId: string, content: string, sender: 'user' | 'agent' = 'user'): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.isActive) {
      throw new VMSessionError(`Session ${sessionId} not found or inactive`, sessionId, 'invalid_state')
    }

    try {
      const message = createVMChatMessage(session.containerId, sessionId, content, sender)

      // Add to session history
      await this.addMessageToHistory(session, message)

      // Send via WebSocket if container connected
      if (vmWebSocketServer.isConnected(session.containerId)) {
        await vmWebSocketServer.sendMessage(session.containerId, message)
        advancedUI.logFunctionUpdate(
          'info',
          `Sent chat message to ${session.containerId.slice(0, 12)}: ${content.slice(0, 50)}...`,
          '💬'
        )
      } else {
        // Queue message for when container reconnects
        this.queueMessage(sessionId, message)
        advancedUI.logFunctionUpdate(
          'warning',
          `Queued message for ${session.containerId.slice(0, 12)} (disconnected)`,
          '📫'
        )
      }

      // Update session activity
      session.lastActivity = new Date()
      session.messageCount++

      this.emit('message_sent', sessionId, message)
      return true
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to send message to session ${sessionId}: ${error.message}`))
      throw error
    }
  }

  /**
   * Ricevi messaggio dalla sessione
   */
  async receiveMessage(message: VMMessage): Promise<void> {
    const session = this.sessions.get(message.sessionId)
    if (!session) {
      console.error(chalk.red(`❌ Received message for unknown session: ${message.sessionId}`))
      return
    }

    try {
      // Add to session history
      if (message.type === 'chat_message') {
        await this.addMessageToHistory(session, message as VMChatMessage)
      }

      // Update session activity
      session.lastActivity = new Date()
      session.messageCount++

      // Emit message received event
      this.emit('message_received', message.sessionId, message)

      advancedUI.logFunctionUpdate(
        'info',
        `Received message from ${session.containerId.slice(0, 12)}: ${message.type}`,
        '📥'
      )
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Error processing received message: ${error.message}`, '❌')
    }
  }

  /**
   * Termina sessione
   */
  async endSession(sessionId: string, reason: string = 'manual'): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      session.status = 'ended'
      session.isActive = false
      session.history.endTime = new Date()

      // Save session to persistence if configured
      await this.saveSessionHistory(session)

      // Clean up message queue
      this.messageQueues.delete(sessionId)

      advancedUI.logFunctionUpdate('warning', `Ended VM session ${sessionId}: ${reason}`, '📝')

      this.emit('session_ended', sessionId, reason)
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Error ending session ${sessionId}: ${error.message}`, '❌')
    }
  }

  /**
   * Pulisci sessioni inattive
   */
  async cleanupInactiveSessions(maxAge: number = 3600000): Promise<number> {
    const now = new Date()
    let cleanedCount = 0

    for (const [sessionId, session] of this.sessions) {
      const age = now.getTime() - session.lastActivity.getTime()

      if (!session.isActive && age > maxAge) {
        await this.endSession(sessionId, 'cleanup_timeout')
        this.sessions.delete(sessionId)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      console.log(chalk.cyan(`🧹 Cleaned up ${cleanedCount} inactive sessions`))
    }

    return cleanedCount
  }

  /**
   * Ottieni statistiche sessioni
   */
  getSessionStats(): VMSessionStats {
    const sessions = Array.from(this.sessions.values())
    const activeSessions = sessions.filter((s) => s.isActive)
    const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0)

    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      totalMessages,
      averageMessagePerSession: sessions.length > 0 ? totalMessages / sessions.length : 0,
      oldestActiveSession:
        activeSessions.length > 0 ? Math.min(...activeSessions.map((s) => s.startTime.getTime())) : 0,
    }
  }

  /**
   * Esporta storico sessione
   */
  async exportSessionHistory(sessionId: string): Promise<VMChatHistory | null> {
    const session = this.sessions.get(sessionId)
    if (!session) return null

    return {
      ...session.history,
      metadata: {
        ...session.history.metadata,
        messageCount: session.history.messages.length,
        averageResponseTime: this.calculateAverageResponseTime(session.history.messages),
      },
    }
  }

  // Private methods

  private async initializeSession(session: VMSession): Promise<void> {
    try {
      session.status = 'active'
      session.isActive = true

      // Send session initialization if container is connected
      if (vmWebSocketServer.isConnected(session.containerId)) {
        const initMessage: VMMessage = {
          id: `init_${Date.now()}`,
          type: 'session_init',
          timestamp: new Date(),
          containerId: session.containerId,
          sessionId: session.sessionId,
          payload: {
            agentId: session.agentId,
            capabilities: session.context.agentCapabilities,
            sessionToken: `session_${session.sessionId}`,
            configuration: session.config,
          },
        }

        await vmWebSocketServer.sendMessage(session.containerId, initMessage)
      }

      // Process any queued messages
      await this.processQueuedMessages(session.sessionId)

      advancedUI.logFunctionUpdate('success', `Initialized session ${session.sessionId}`, '✓')
    } catch (error: any) {
      session.status = 'error'
      session.isActive = false
      throw new VMSessionError(`Failed to initialize session: ${error.message}`, session.sessionId, 'invalid_state')
    }
  }

  private async addMessageToHistory(session: VMSession, message: VMChatMessage): Promise<void> {
    session.history.messages.push(message)
    session.context.conversationHistory.push(message)

    // Maintain message history limit
    if (session.history.messages.length > session.config.maxMessageHistory) {
      const overflow = session.history.messages.length - session.config.maxMessageHistory
      session.history.messages.splice(0, overflow)
      session.context.conversationHistory.splice(0, overflow)
    }

    session.history.metadata.messageCount = session.history.messages.length
  }

  private queueMessage(sessionId: string, message: VMMessage): void {
    const queue = this.messageQueues.get(sessionId) || []
    queue.push(message)
    this.messageQueues.set(sessionId, queue)

    // Limit queue size
    if (queue.length > 50) {
      queue.splice(0, queue.length - 50)
    }
  }

  private async processQueuedMessages(sessionId: string): Promise<void> {
    const queue = this.messageQueues.get(sessionId)
    if (!queue || queue.length === 0) return

    const session = this.sessions.get(sessionId)
    if (!session || !vmWebSocketServer.isConnected(session.containerId)) return

    try {
      for (const message of queue) {
        await vmWebSocketServer.sendMessage(session.containerId, message)
      }

      this.messageQueues.set(sessionId, [])
      console.log(chalk.cyan(`📫 Processed ${queue.length} queued messages for session ${sessionId}`))
    } catch (error: any) {
      console.error(chalk.red(`❌ Error processing queued messages: ${error.message}`))
    }
  }

  private async saveSessionHistory(session: VMSession): Promise<void> {
    // Implementation for session persistence (file system, database, etc.)
    // For now, just log that we would save it
    console.log(
      chalk.cyan(` Would save session history for ${session.sessionId} (${session.history.messages.length} messages)`)
    )
  }

  private calculateAverageResponseTime(messages: VMChatMessage[]): number {
    if (messages.length < 2) return 0

    let totalTime = 0
    let responseCount = 0

    for (let i = 1; i < messages.length; i++) {
      if (messages[i].payload.sender === 'agent' && messages[i - 1].payload.sender === 'user') {
        const responseTime = messages[i].timestamp.getTime() - messages[i - 1].timestamp.getTime()
        totalTime += responseTime
        responseCount++
      }
    }

    return responseCount > 0 ? totalTime / responseCount : 0
  }

  private generateSessionId(): string {
    return `vm_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private setupEventHandlers(): void {
    // Handle WebSocket server events
    vmWebSocketServer.on('message', (message: VMMessage) => {
      this.receiveMessage(message)
    })

    vmWebSocketServer.on('connected', (containerId: string) => {
      // Process queued messages for this container
      const session = this.getSessionByContainer(containerId)
      if (session) {
        this.processQueuedMessages(session.sessionId)
      }
    })

    vmWebSocketServer.on('disconnected', (containerId: string) => {
      const session = this.getSessionByContainer(containerId)
      if (session) {
        console.log(
          chalk.yellow(
            `📵 Container ${containerId.slice(0, 12)} disconnected, session ${session.sessionId} now offline`
          )
        )
      }
    })

    // Periodic cleanup
    setInterval(() => {
      this.cleanupInactiveSessions()
    }, 300000) // Every 5 minutes
  }
}

// Interfaces and types
export interface VMSession {
  sessionId: string
  containerId: string
  agentId: string
  status: 'initializing' | 'active' | 'ended' | 'error'
  startTime: Date
  lastActivity: Date
  messageCount: number
  isActive: boolean
  config: VMSessionConfig
  context: VMAgentContext
  history: VMChatHistory
}

export interface VMSessionStats {
  totalSessions: number
  activeSessions: number
  totalMessages: number
  averageMessagePerSession: number
  oldestActiveSession: number
}

// Singleton instance
export const vmSessionManager = new VMSessionManager()
