/**
 * Chat Session Service
 * Manages interactive chat sessions with background agents
 */

import { EventEmitter } from 'node:events'
import { v4 as uuidv4 } from 'uuid'
import type { BackgroundAgentService } from '../background-agent-service'
import type {
  ChatMessage,
  ChatSession,
  CreateBackgroundJobRequest,
  FileChange,
  PendingToolApproval,
  SSEEvent,
  ToolCall,
} from '../types'
import { AIChatService } from './ai-chat-service'

export interface CreateChatSessionRequest {
  repo: string
  baseBranch?: string
  userId?: string
  initialMessage?: string
}

export interface SendMessageRequest {
  sessionId: string
  message: string
}

export interface ApproveToolRequest {
  sessionId: string
  toolApprovalId: string
  approved: boolean
}

export class ChatSessionService extends EventEmitter {
  private sessions: Map<string, ChatSession> = new Map()
  private sessionConnections: Map<string, Set<string>> = new Map() // sessionId -> Set of connectionIds
  private aiChatService: AIChatService

  constructor(private backgroundAgentService: BackgroundAgentService) {
    super()
    this.aiChatService = new AIChatService()
    this.setupBackgroundAgentListeners()
  }

  /**
   * Listen to background agent events and forward to chat sessions
   */
  private setupBackgroundAgentListeners(): void {
    // Listen to job events and map them to chat session events
    this.backgroundAgentService.on('job:log', (jobId: string, log: any) => {
      const session = this.getSessionByJobId(jobId)
      if (session) {
        this.emitSSE(session.id, {
          type: 'status:update',
          data: { level: log.level, message: log.message },
          timestamp: new Date(),
        })
      }
    })

    this.backgroundAgentService.on('job:completed', (jobId: string) => {
      const session = this.getSessionByJobId(jobId)
      if (session) {
        session.status = 'completed'
        session.updatedAt = new Date()
        this.emitSSE(session.id, {
          type: 'session:complete',
          data: { status: 'completed' },
          timestamp: new Date(),
        })
      }
    })

    this.backgroundAgentService.on('job:failed', (jobId: string, job: any) => {
      const session = this.getSessionByJobId(jobId)
      if (session) {
        session.status = 'failed'
        session.updatedAt = new Date()
        this.emitSSE(session.id, {
          type: 'error',
          data: { message: job.error || 'Job failed' },
          timestamp: new Date(),
        })
      }
    })
  }

  /**
   * Create a new chat session with an interactive background agent
   */
  async createSession(request: CreateChatSessionRequest): Promise<ChatSession> {
    const sessionId = uuidv4()

    // Create background job in interactive mode
    const jobRequest: CreateBackgroundJobRequest = {
      repo: request.repo,
      baseBranch: request.baseBranch || 'main',
      task: request.initialMessage || 'Interactive chat session',
    }

    const jobId = await this.backgroundAgentService.createJob(jobRequest)

    // Get the job and set it to interactive mode
    const job = this.backgroundAgentService.getJob(jobId)
    if (job) {
      job.mode = 'interactive'
      job.chatSessionId = sessionId
      job.pendingToolApprovals = []
      job.fileChanges = []
    }

    // Create session
    const session: ChatSession = {
      id: sessionId,
      jobId,
      repo: request.repo,
      status: 'active',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      fileChanges: [],
      userId: request.userId,
    }

    this.sessions.set(sessionId, session)
    this.sessionConnections.set(sessionId, new Set())

    // Add initial message if provided
    if (request.initialMessage) {
      this.addMessage(sessionId, {
        role: 'user',
        content: request.initialMessage,
      })
    }

    this.emit('session:created', session)

    return session
  }

  /**
   * Send a message in a chat session
   */
  async sendMessage(request: SendMessageRequest): Promise<ChatMessage> {
    const session = this.sessions.get(request.sessionId)
    if (!session) {
      throw new Error(`Session ${request.sessionId} not found`)
    }

    if (session.status !== 'active') {
      throw new Error(`Session ${request.sessionId} is not active`)
    }

    // Add user message to session
    const userMessage = this.addMessage(request.sessionId, {
      role: 'user',
      content: request.message,
    })

    // Emit user message via SSE
    this.emitSSE(request.sessionId, {
      type: 'text:complete',
      data: userMessage,
      timestamp: new Date(),
    })

    // Generate AI response with streaming
    this.generateAIResponse(request.sessionId, request.message)

    return userMessage
  }

  /**
   * Generate AI response with streaming via AI SDK
   */
  private async generateAIResponse(sessionId: string, userMessage: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      await this.aiChatService.generateResponse(
        session,
        userMessage,
        // onTextDelta callback
        (delta, accumulated) => {
          this.emitSSE(sessionId, {
            type: 'text:delta',
            data: { delta, accumulated },
            timestamp: new Date(),
          })
        },
        // onComplete callback
        (fullText) => {
          const assistantMessage = this.addMessage(sessionId, {
            role: 'assistant',
            content: fullText,
          })

          this.emitSSE(sessionId, {
            type: 'text:complete',
            data: assistantMessage,
            timestamp: new Date(),
          })
        }
      )
    } catch (error: any) {
      console.error('[ChatSession] Error generating AI response:', error)
      this.emitSSE(sessionId, {
        type: 'error',
        data: { message: error.message || 'Failed to generate response' },
        timestamp: new Date(),
      })
    }
  }

  /**
   * Request tool approval in interactive mode
   */
  async requestToolApproval(sessionId: string, toolCall: ToolCall): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const job = this.backgroundAgentService.getJob(session.jobId)
    if (!job) {
      throw new Error(`Job ${session.jobId} not found`)
    }

    const approvalId = uuidv4()
    const approval: PendingToolApproval = {
      id: approvalId,
      toolCall,
      requestedAt: new Date(),
    }

    if (!job.pendingToolApprovals) {
      job.pendingToolApprovals = []
    }

    job.pendingToolApprovals.push(approval)

    // Emit SSE event for tool approval request
    this.emitSSE(sessionId, {
      type: 'tool:approval_required',
      data: approval,
      timestamp: new Date(),
    })

    return approvalId
  }

  /**
   * Approve or reject a tool call
   */
  async approveTool(request: ApproveToolRequest): Promise<void> {
    const session = this.sessions.get(request.sessionId)
    if (!session) {
      throw new Error(`Session ${request.sessionId} not found`)
    }

    const job = this.backgroundAgentService.getJob(session.jobId)
    if (!job || !job.pendingToolApprovals) {
      throw new Error('No pending tool approvals found')
    }

    const approval = job.pendingToolApprovals.find((a) => a.id === request.toolApprovalId)
    if (!approval) {
      throw new Error(`Tool approval ${request.toolApprovalId} not found`)
    }

    // Update approval status
    approval.approved = request.approved
    approval.resolvedAt = new Date()
    approval.toolCall.status = request.approved ? 'approved' : 'rejected'

    // Remove from pending queue
    job.pendingToolApprovals = job.pendingToolApprovals.filter((a) => a.id !== request.toolApprovalId)

    // Emit result via SSE
    this.emitSSE(request.sessionId, {
      type: 'tool:result',
      data: {
        approvalId: request.toolApprovalId,
        approved: request.approved,
        toolCall: approval.toolCall,
      },
      timestamp: new Date(),
    })

    // Emit event for background agent to continue execution
    this.emit('tool:approved', {
      sessionId: request.sessionId,
      jobId: session.jobId,
      approvalId: request.toolApprovalId,
      approved: request.approved,
      toolCall: approval.toolCall,
    })
  }

  /**
   * Track file changes in the session
   */
  trackFileChange(sessionId: string, fileChange: FileChange): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    session.fileChanges.push(fileChange)
    session.updatedAt = new Date()

    // Update job's file changes too
    const job = this.backgroundAgentService.getJob(session.jobId)
    if (job) {
      if (!job.fileChanges) {
        job.fileChanges = []
      }
      job.fileChanges.push(fileChange)
    }

    // Emit SSE event
    this.emitSSE(sessionId, {
      type: 'file:change',
      data: fileChange,
      timestamp: new Date(),
    })
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Get session by job ID
   */
  private getSessionByJobId(jobId: string): ChatSession | undefined {
    return Array.from(this.sessions.values()).find((s) => s.jobId === jobId)
  }

  /**
   * List all sessions for a user
   */
  listSessions(userId?: string): ChatSession[] {
    const allSessions = Array.from(this.sessions.values())
    if (!userId) return allSessions
    return allSessions.filter((s) => s.userId === userId)
  }

  /**
   * Add a message to a session
   */
  private addMessage(sessionId: string, message: Partial<ChatMessage>): ChatMessage {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const chatMessage: ChatMessage = {
      id: uuidv4(),
      sessionId,
      role: message.role || 'user',
      content: message.content || '',
      timestamp: new Date(),
      toolCalls: message.toolCalls,
      streamComplete: message.streamComplete ?? true,
    }

    session.messages.push(chatMessage)
    session.updatedAt = new Date()

    return chatMessage
  }

  /**
   * Register an SSE connection for a session
   */
  registerConnection(sessionId: string, connectionId: string): void {
    if (!this.sessionConnections.has(sessionId)) {
      this.sessionConnections.set(sessionId, new Set())
    }
    this.sessionConnections.get(sessionId)!.add(connectionId)
  }

  /**
   * Unregister an SSE connection
   */
  unregisterConnection(sessionId: string, connectionId: string): void {
    const connections = this.sessionConnections.get(sessionId)
    if (connections) {
      connections.delete(connectionId)
    }
  }

  /**
   * Emit an SSE event to all connections for a session
   */
  private emitSSE<T>(sessionId: string, event: SSEEvent<T>): void {
    this.emit('sse:event', { sessionId, event })
  }

  /**
   * Close a session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // Cancel the background job if still running
    if (session.status === 'active') {
      await this.backgroundAgentService.cancelJob(session.jobId)
    }

    session.status = 'completed'
    session.updatedAt = new Date()

    // Clean up connections
    this.sessionConnections.delete(sessionId)

    this.emit('session:closed', session)
  }
}
