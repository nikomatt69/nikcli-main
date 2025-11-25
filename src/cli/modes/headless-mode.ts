// src/cli/modes/headless-mode.ts
// Headless mode for NikCLI - enables API-driven operation without terminal UI

import { EventEmitter } from 'node:events'
import type { NikCLI } from '../nik-cli'

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

interface HeadlessSession {
  id: string
  userId?: string
  workspaceId?: string
  createdAt: Date
  messages: HeadlessMessage[]
}

/**
 * HeadlessMode - Enables NikCLI to run without terminal UI
 * All I/O happens through events and API calls
 */
export class HeadlessMode extends EventEmitter {
  private nikCLI: NikCLI | null = null
  private activeSessions: Map<string, HeadlessSession> = new Map()
  private pendingApprovals: Map<string, ApprovalRequest> = new Map()
  private messageBuffer: Map<string, HeadlessMessage[]> = new Map()
  private isInitialized = false

  constructor() {
    super()
    this.setMaxListeners(50)
  }

  async initialize(nikCLI: NikCLI): Promise<void> {
    if (this.isInitialized) {
      throw new Error('HeadlessMode already initialized')
    }

    this.nikCLI = nikCLI
    this.setupEventHandlers()
    this.isInitialized = true

    this.emit('initialized')
  }

  async executeCommand(cmd: HeadlessCommand): Promise<HeadlessResponse> {
    if (!this.isInitialized || !this.nikCLI) {
      throw new Error('HeadlessMode not initialized')
    }

    const startTime = Date.now()
    const { command, sessionId, options = {} } = cmd

    try {
      let session = this.activeSessions.get(sessionId)
      if (!session) {
        session = await this.createSession(sessionId, cmd.userId, cmd.workspaceId)
      }

      this.messageBuffer.set(sessionId, [])
      this.emit('command:start', { sessionId, command })

      const isSlashCommand = command.startsWith('/')
      const commandType = isSlashCommand ? 'slash_command' : 'chat'

      let result: any

      if (isSlashCommand) {
        result = await this.executeSlashCommand(command, sessionId, options)
      } else {
        result = await this.executeChatMessage(command, sessionId, options)
      }

      const messages = this.messageBuffer.get(sessionId) || []
      const executionTime = Date.now() - startTime

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

  private async executeSlashCommand(
    command: string,
    sessionId: string,
    options: any,
  ): Promise<any> {
    if (!this.nikCLI) {
      throw new Error('NikCLI not initialized')
    }

    this.addMessage(sessionId, {
      type: 'system',
      content: `Executing command: ${command}`,
      timestamp: new Date(),
      metadata: { commandType: 'slash_command' },
    })

    try {
      const result = await this.executeNikCLICommand(command, sessionId, options)

      this.addMessage(sessionId, {
        type: 'assistant',
        content: result.output || 'Command completed successfully',
        timestamp: new Date(),
        metadata: {
          toolsUsed: result.toolsUsed,
          tokensUsed: result.tokensUsed,
        },
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      this.addMessage(sessionId, {
        type: 'error',
        content: `Command failed: ${errorMessage}`,
        timestamp: new Date(),
      })

      throw error
    }
  }

  private async executeChatMessage(
    message: string,
    sessionId: string,
    options: any,
  ): Promise<any> {
    if (!this.nikCLI) {
      throw new Error('NikCLI not initialized')
    }

    this.addMessage(sessionId, {
      type: 'user',
      content: message,
      timestamp: new Date(),
    })

    try {
      const result = await this.executeNikCLIChat(message, sessionId, options)

      if (options.streaming && result.stream) {
        for await (const chunk of result.stream) {
          this.streamChunk(sessionId, chunk.content, chunk.metadata)
        }
      }

      this.addMessage(sessionId, {
        type: 'assistant',
        content: result.content || result.output,
        timestamp: new Date(),
        metadata: {
          toolsUsed: result.toolsUsed,
          tokensUsed: result.tokensUsed,
        },
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      this.addMessage(sessionId, {
        type: 'error',
        content: `Chat failed: ${errorMessage}`,
        timestamp: new Date(),
      })

      throw error
    }
  }

  private async executeNikCLICommand(
    command: string,
    sessionId: string,
    options: any,
  ): Promise<any> {
    if (!this.nikCLI) {
      throw new Error('NikCLI instance not available')
    }

    const parts = command.trim().split(' ')
    const cmd = parts[0].replace(/^\//, '')
    const args = parts.slice(1)

    const startTime = Date.now()
    const toolsUsed: string[] = []

    try {
      let output: string

      const nikCLI = this.nikCLI as any

      if (nikCLI.commandHandler?.execute) {
        const result = await nikCLI.commandHandler.execute(cmd, args, {
          sessionId,
          headless: true,
          ...options,
        })
        output = result.output || result.message || 'Command executed'
        if (result.toolsUsed) toolsUsed.push(...result.toolsUsed)
      } else if (nikCLI.slashCommandHandler?.handleCommand) {
        const result = await nikCLI.slashCommandHandler.handleCommand(command, {
          sessionId,
          headless: true,
          ...options,
        })
        output = result.output || result.message || 'Command executed'
        if (result.toolsUsed) toolsUsed.push(...result.toolsUsed)
      } else {
        output = await this.executeCommandDirect(cmd, args, sessionId, options)
      }

      const executionTime = Date.now() - startTime

      return {
        success: true,
        output,
        toolsUsed,
        tokensUsed: 0,
        executionTime,
      }
    } catch (error) {
      throw new Error(`Command execution failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async executeNikCLIChat(
    message: string,
    sessionId: string,
    options: any,
  ): Promise<any> {
    if (!this.nikCLI) {
      throw new Error('NikCLI instance not available')
    }

    const startTime = Date.now()
    const toolsUsed: string[] = []
    let tokensUsed = 0

    try {
      const nikCLI = this.nikCLI as any
      const chatManager = nikCLI.chatManager

      if (!chatManager) {
        throw new Error('Chat manager not available in NikCLI instance')
      }

      if (options.streaming) {
        const stream = this.executeStreamingChat(chatManager, message, sessionId, options)
        return {
          success: true,
          content: '',
          stream,
          toolsUsed,
          tokensUsed,
        }
      } else {
        const result = await chatManager.sendMessage(message, {
          sessionId,
          headless: true,
          ...options,
        })

        if (result.toolCalls) {
          toolsUsed.push(...result.toolCalls.map((t: any) => t.name))
        }
        if (result.usage) {
          tokensUsed = result.usage.totalTokens || 0
        }

        return {
          success: true,
          content: result.content || result.text || '',
          toolsUsed,
          tokensUsed,
          executionTime: Date.now() - startTime,
        }
      }
    } catch (error) {
      throw new Error(`Chat execution failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async *executeStreamingChat(
    chatManager: any,
    message: string,
    sessionId: string,
    options: any,
  ) {
    const stream = await chatManager.streamMessage(message, {
      sessionId,
      headless: true,
      ...options,
    })

    for await (const chunk of stream) {
      yield {
        content: chunk.delta || chunk.content || '',
        metadata: {
          toolCalls: chunk.toolCalls,
          finishReason: chunk.finishReason,
        },
      }
    }
  }

  private async executeCommandDirect(
    command: string,
    args: string[],
    sessionId: string,
    options: any,
  ): Promise<string> {
    const nikCLI = this.nikCLI as any

    switch (command) {
      case 'help':
        return 'NikCLI Mobile - Available commands: /agents, /tools, /plan, etc.'

      case 'agents':
        const agents = nikCLI.agentManager?.getRegisteredAgents?.() || []
        return `Available agents: ${agents.map((a: any) => a.name).join(', ')}`

      case 'tools':
        const tools = nikCLI.toolService?.getAvailableTools?.() || []
        return `Available tools: ${tools.map((t: any) => t.name).join(', ')}`

      default:
        throw new Error(`Command '${command}' not supported in headless mode yet`)
    }
  }

  private async createSession(
    sessionId: string,
    userId?: string,
    workspaceId?: string,
  ): Promise<HeadlessSession> {
    const session: HeadlessSession = {
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

  streamChunk(sessionId: string, chunk: string, metadata?: any): void {
    this.emit('stream:chunk', {
      sessionId,
      chunk,
      metadata,
      timestamp: new Date(),
    })
  }

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

    this.emit('approval:requested', {
      sessionId,
      approval: fullRequest,
    })

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingApprovals.delete(approvalId)
        reject(new Error('Approval timeout'))
      }, 5 * 60 * 1000)

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

  respondToApproval(response: ApprovalResponse): void {
    this.emit('approval:response', response)
  }

  getPendingApprovals(sessionId: string): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values())
  }

  getSessionMessages(sessionId: string): HeadlessMessage[] {
    return this.messageBuffer.get(sessionId) || []
  }

  getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys())
  }

  async closeSession(sessionId: string): Promise<void> {
    this.activeSessions.delete(sessionId)
    this.messageBuffer.delete(sessionId)
    this.emit('session:closed', { sessionId })
  }

  async shutdown(): Promise<void> {
    for (const sessionId of this.activeSessions.keys()) {
      await this.closeSession(sessionId)
    }

    this.isInitialized = false
    this.removeAllListeners()
    this.emit('shutdown')
  }

  private setupEventHandlers(): void {
    // Connect to NikCLI events when available
    const nikCLI = this.nikCLI as any

    if (nikCLI.on) {
      nikCLI.on('tool:call', (data: any) => {
        this.emit('tool:call', data)
      })

      nikCLI.on('approval:needed', (data: any) => {
        this.requestApproval(data.sessionId, data.request)
      })
    }
  }

  private addMessage(sessionId: string, message: HeadlessMessage): void {
    const buffer = this.messageBuffer.get(sessionId) || []
    buffer.push(message)
    this.messageBuffer.set(sessionId, buffer)

    this.emit('message', { sessionId, message })
  }
}

export const headlessMode = new HeadlessMode()
