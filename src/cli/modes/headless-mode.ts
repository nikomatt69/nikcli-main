// src/cli/modes/headless-mode.ts
// Headless mode for NikCLI - enables API-driven operation without terminal UI

import { EventEmitter } from 'node:events'
import type { NikCLI } from '../nik-cli'
import type { ChatSession } from '../chat/chat-manager'

export interface HeadlessMessage {
  type: 'user' | 'assistant' | 'system' | 'tool' | 'error'
  content: string
  timestamp: Date
  metadata?: {
    sessionId?: string
    commandType?: 'chat' | 'slash_command' | 'agent'
    streaming?: boolean
    toolCalls?: any[]
    [key: string]: any
  }
}

export interface HeadlessCommand {
  command: string
  sessionId: string
  userId?: string
  workspaceId?: string
  options?: {
    streaming?: boolean
    autoApprove?: boolean
    timeout?: number
    [key: string]: any
  }
}

export interface HeadlessResponse {
  success: boolean
  sessionId: string
  messages: HeadlessMessage[]
  metadata?: {
    tokensUsed?: number
    executionTime?: number
    toolsUsed?: string[]
    [key: string]: any
  }
  error?: {
    code: string
    message: string
    details?: any
  }
}

export interface ApprovalRequest {
  id: string
  type: 'file_change' | 'command_execution' | 'agent_action'
  title: string
  description: string
  details: {
    files?: Array<{
      path: string
      changes: string
      diff?: string
    }>
    command?: string
    risk?: 'low' | 'medium' | 'high'
    [key: string]: any
  }
  timestamp: Date
}

export type ApprovalResponse = {
  id: string
  approved: boolean
  reason?: string
}

/**
 * HeadlessMode - Enables NikCLI to run without terminal UI
 * All I/O happens through events and API calls
 */
export class HeadlessMode extends EventEmitter {
  private nikCLI: NikCLI | null = null
  private activeSessions: Map<string, ChatSession> = new Map()
  private pendingApprovals: Map<string, ApprovalRequest> = new Map()
  private messageBuffer: Map<string, HeadlessMessage[]> = new Map()
  private isInitialized = false

  constructor() {
    super()
    this.setMaxListeners(50) // Support many concurrent sessions
  }

  /**
   * Initialize headless mode with NikCLI instance
   */
  async initialize(nikCLI: NikCLI): Promise<void> {
    if (this.isInitialized) {
      throw new Error('HeadlessMode already initialized')
    }

    this.nikCLI = nikCLI
    this.setupEventHandlers()
    this.isInitialized = true

    this.emit('initialized')
  }

  /**
   * Execute a command in headless mode
   */
  async executeCommand(cmd: HeadlessCommand): Promise<HeadlessResponse> {
    if (!this.isInitialized || !this.nikCLI) {
      throw new Error('HeadlessMode not initialized')
    }

    const startTime = Date.now()
    const { command, sessionId, options = {} } = cmd

    try {
      // Get or create session
      let session = this.activeSessions.get(sessionId)
      if (!session) {
        session = await this.createSession(sessionId, cmd.userId, cmd.workspaceId)
      }

      // Clear message buffer for this session
      this.messageBuffer.set(sessionId, [])

      // Emit command start
      this.emit('command:start', { sessionId, command })

      // Detect command type
      const isSlashCommand = command.startsWith('/')
      const commandType = isSlashCommand ? 'slash_command' : 'chat'

      // Execute command through NikCLI
      let result: any

      if (isSlashCommand) {
        // Execute slash command
        result = await this.executeSlashCommand(command, sessionId, options)
      } else {
        // Execute as chat message
        result = await this.executeChatMessage(command, sessionId, options)
      }

      // Collect messages from buffer
      const messages = this.messageBuffer.get(sessionId) || []
      const executionTime = Date.now() - startTime

      // Build response
      const response: HeadlessResponse = {
        success: true,
        sessionId,
        messages,
        metadata: {
          executionTime,
          commandType,
          tokensUsed: result?.tokensUsed,
          toolsUsed: result?.toolsUsed,
        },
      }

      // Emit command complete
      this.emit('command:complete', { sessionId, response })

      return response
    } catch (error) {
      const executionTime = Date.now() - startTime
      const messages = this.messageBuffer.get(sessionId) || []

      const response: HeadlessResponse = {
        success: false,
        sessionId,
        messages,
        metadata: {
          executionTime,
        },
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          details: error,
        },
      }

      this.emit('command:error', { sessionId, error })

      return response
    }
  }

  /**
   * Execute slash command
   */
  private async executeSlashCommand(
    command: string,
    sessionId: string,
    options: any,
  ): Promise<any> {
    // TODO: Integrate with actual slash command handler
    // For now, emit message that command was received
    this.addMessage(sessionId, {
      type: 'system',
      content: `Executing command: ${command}`,
      timestamp: new Date(),
      metadata: { commandType: 'slash_command' },
    })

    // Simulate command execution
    // In real implementation, this would call nikCLI's command handler
    await new Promise((resolve) => setTimeout(resolve, 100))

    this.addMessage(sessionId, {
      type: 'assistant',
      content: `Command executed: ${command}`,
      timestamp: new Date(),
    })

    return { success: true }
  }

  /**
   * Execute chat message
   */
  private async executeChatMessage(
    message: string,
    sessionId: string,
    options: any,
  ): Promise<any> {
    // Add user message
    this.addMessage(sessionId, {
      type: 'user',
      content: message,
      timestamp: new Date(),
    })

    // TODO: Integrate with actual chat handler
    // For now, emit that we're processing
    this.addMessage(sessionId, {
      type: 'system',
      content: 'Processing message...',
      timestamp: new Date(),
      metadata: { streaming: options.streaming },
    })

    // Simulate AI response
    await new Promise((resolve) => setTimeout(resolve, 100))

    this.addMessage(sessionId, {
      type: 'assistant',
      content: 'Response to: ' + message,
      timestamp: new Date(),
    })

    return { success: true }
  }

  /**
   * Create new session
   */
  private async createSession(
    sessionId: string,
    userId?: string,
    workspaceId?: string,
  ): Promise<ChatSession> {
    // TODO: Integrate with actual ChatManager
    const session: any = {
      id: sessionId,
      userId,
      workspaceId,
      createdAt: new Date(),
      messages: [],
    }

    this.activeSessions.set(sessionId, session)
    this.emit('session:created', { sessionId, userId, workspaceId })

    return session
  }

  /**
   * Stream message chunk (for streaming responses)
   */
  streamChunk(sessionId: string, chunk: string, metadata?: any): void {
    this.emit('stream:chunk', {
      sessionId,
      chunk,
      metadata,
      timestamp: new Date(),
    })
  }

  /**
   * Request approval for sensitive operation
   */
  async requestApproval(
    sessionId: string,
    request: Omit<ApprovalRequest, 'id' | 'timestamp'>,
  ): Promise<boolean> {
    const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const fullRequest: ApprovalRequest = {
      id: approvalId,
      timestamp: new Date(),
      ...request,
    }

    this.pendingApprovals.set(approvalId, fullRequest)

    // Emit approval request
    this.emit('approval:requested', {
      sessionId,
      approval: fullRequest,
    })

    // Wait for approval response (with timeout)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingApprovals.delete(approvalId)
        reject(new Error('Approval timeout'))
      }, 5 * 60 * 1000) // 5 minutes timeout

      const handler = (response: ApprovalResponse) => {
        if (response.id === approvalId) {
          clearTimeout(timeout)
          this.pendingApprovals.delete(approvalId)
          this.removeListener('approval:response', handler)
          resolve(response.approved)
        }
      }

      this.on('approval:response', handler)
    })
  }

  /**
   * Respond to approval request
   */
  respondToApproval(response: ApprovalResponse): void {
    this.emit('approval:response', response)
  }

  /**
   * Get pending approvals for session
   */
  getPendingApprovals(sessionId: string): ApprovalRequest[] {
    // Filter approvals by session (stored in events)
    return Array.from(this.pendingApprovals.values())
  }

  /**
   * Get session messages
   */
  getSessionMessages(sessionId: string): HeadlessMessage[] {
    return this.messageBuffer.get(sessionId) || []
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys())
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<void> {
    this.activeSessions.delete(sessionId)
    this.messageBuffer.delete(sessionId)
    this.emit('session:closed', { sessionId })
  }

  /**
   * Shutdown headless mode
   */
  async shutdown(): Promise<void> {
    // Close all sessions
    for (const sessionId of this.activeSessions.keys()) {
      await this.closeSession(sessionId)
    }

    this.isInitialized = false
    this.removeAllListeners()
    this.emit('shutdown')
  }

  /**
   * Setup event handlers for NikCLI integration
   */
  private setupEventHandlers(): void {
    // These will be connected to actual NikCLI events
    // For now, just setup the structure
  }

  /**
   * Add message to session buffer
   */
  private addMessage(sessionId: string, message: HeadlessMessage): void {
    const buffer = this.messageBuffer.get(sessionId) || []
    buffer.push(message)
    this.messageBuffer.set(sessionId, buffer)

    // Emit message event for real-time listeners
    this.emit('message', { sessionId, message })
  }
}

// Singleton instance
export const headlessMode = new HeadlessMode()
