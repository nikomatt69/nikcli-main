import { nanoid } from 'nanoid'
import type { ChatMessage } from '../ai/model-provider'
import { TOKEN_LIMITS } from '../config/token-limits'
import { simpleConfigManager as configManager } from '../core/config-manager'
import { contextManager } from '../core/context-manager'
import { UnifiedTokenBudget } from '../core/performance-optimizer'
import { tokenTelemetry } from '../core/token-telemetry'

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
  systemPrompt?: string
}

export class ChatManager {
  private currentSession: ChatSession | null = null
  private sessions: Map<string, ChatSession> = new Map()
  private budget: UnifiedTokenBudget = new UnifiedTokenBudget()

  createNewSession(title?: string, systemPrompt?: string): ChatSession {
    const session: ChatSession = {
      id: nanoid(),
      title: title || `Chat ${new Date().toLocaleTimeString()}`,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      systemPrompt: systemPrompt,
    }

    // Add system message if system prompt is provided
    if (session.systemPrompt) {
      session.messages.push({
        role: 'system',
        content: session.systemPrompt,
        timestamp: new Date(),
      })
    }

    this.sessions.set(session.id, session)
    this.currentSession = session

    // Apply adaptive per-session context cap
    this.applyAdaptiveCap(session)
    return session
  }

  getCurrentSession(): ChatSession | null {
    return this.currentSession
  }

  setCurrentSession(sessionId: string): ChatSession | null {
    const session = this.sessions.get(sessionId)
    if (session) {
      this.currentSession = session
    }
    return session || null
  }

  addMessage(content: string, role: 'user' | 'assistant'): ChatMessage {
    if (!this.currentSession) {
      this.createNewSession()
    }

    const message: ChatMessage = {
      role,
      content,
      timestamp: new Date(),
    }

    this.currentSession!.messages.push(message)
    this.currentSession!.updatedAt = new Date()

    // Trim history if needed
    this.trimHistory()

    return message
  }

  private applyAdaptiveCap(session: ChatSession): void {
    try {
      const complexity = Math.min(10, Math.ceil((session.systemPrompt?.length || 0) / 800))
      const allocation = this.budget.allocateTokens('chat-session', session.id, complexity || 3, 'normal')
      const reservePct = 0.25 // reserve for model output/tool calls
      const baseMax = TOKEN_LIMITS.CHAT?.MAX_CONTEXT_TOKENS ?? 18000
      const minCap = 6000
      const cap = Math.max(minCap, Math.min(baseMax, Math.floor(allocation * (1 - reservePct))))

      contextManager.setMaxTokensForSession(cap)
      tokenTelemetry.recordPrompt({
        source: 'ChatManager.applyAdaptiveCap',
        estimatedTokens: 0,
        tokenLimit: cap,
        messages: session.messages.length,
      })
    } catch {
      // fallback to default cap if budgeting fails
      contextManager.setMaxTokensForSession(null)
    }
  }

  getMessages(): ChatMessage[] {
    return this.currentSession?.messages || []
  }

  getContextMessages(): ChatMessage[] {
    const messages = this.getMessages()

    if (!configManager.get('chatHistory')) {
      return this.getMinimalContext(messages)
    }

    // Apply progressive compression instead of returning all
    return this.getCompressedContext(messages)
  }

  private getMinimalContext(messages: ChatMessage[]): ChatMessage[] {
    // Return only system message and last user message if history is disabled
    const systemMessage = messages.find((m) => m.role === 'system')
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop()

    return [...(systemMessage ? [systemMessage] : []), ...(lastUserMessage ? [lastUserMessage] : [])]
  }

  private getCompressedContext(messages: ChatMessage[]): ChatMessage[] {
    const maxTokens = TOKEN_LIMITS.CHAT.MAX_CONTEXT_TOKENS
    let currentTokens = 0
    const result: ChatMessage[] = []

    // Always include system message
    const systemMessage = messages.find((m) => m.role === 'system')
    if (systemMessage) {
      result.push(systemMessage)
      currentTokens += this.estimateTokens(systemMessage.content)
    }

    // Include recent messages first (last 4 messages)
    const recentMessages = messages.filter((m) => m.role !== 'system').slice(-4)
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i]
      const tokens = this.estimateTokens(msg.content)

      if (currentTokens + tokens > maxTokens) break

      result.unshift(msg)
      currentTokens += tokens
    }

    return result
  }

  /**
   * Estimate token count for a string (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4)
  }

  private trimHistory(): void {
    if (!this.currentSession) return

    const maxLength = configManager.get('maxHistoryLength')
    const messages = this.currentSession.messages

    if (messages.length <= maxLength) return

    // Always keep system message
    const systemMessage = messages.find((m) => m.role === 'system')
    const otherMessages = messages.filter((m) => m.role !== 'system')

    const maxRecent = TOKEN_LIMITS.CHAT?.MAX_RECENT_NON_SYSTEM ?? maxLength - 1
    const keepCount = Math.min(maxRecent, Math.max(0, maxLength - 1))
    const trimmedCount = Math.max(0, otherMessages.length - keepCount)

    // Keep only the most recent non-system messages up to configured limit
    const keepMessages = otherMessages.slice(-keepCount)

    const notice: ChatMessage | null =
      trimmedCount > 0
        ? {
            role: 'system',
            content: `[Conversation trimmed] ${trimmedCount} older messages were removed to fit history limits. Recent context preserved.`,
            timestamp: new Date(),
          }
        : null

    this.currentSession.messages = [
      ...(systemMessage ? [systemMessage] : []),
      ...(notice ? [notice] : []),
      ...keepMessages,
    ]
  }

  clearCurrentSession(): void {
    if (this.currentSession) {
      this.currentSession.messages = []
      if (this.currentSession.systemPrompt) {
        this.currentSession.messages.push({
          role: 'system',
          content: this.currentSession.systemPrompt,
          timestamp: new Date(),
        })
      }
      this.currentSession.updatedAt = new Date()
    }
  }

  listSessions(): ChatSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }

  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId)
    if (this.currentSession?.id === sessionId) {
      this.currentSession = null
    }
    return deleted
  }

  exportSession(sessionId?: string): string {
    const session = sessionId ? this.sessions.get(sessionId) : this.currentSession

    if (!session) {
      throw new Error('No session found')
    }

    const messages = session.messages
      .filter((m) => m.role !== 'system')
      .map((m) => `**${m.role.toUpperCase()}**: ${m.content}`)
      .join('\n\n---\n\n')

    return `# ${session.title}\n\nCreated: ${(session.createdAt, true)}\nUpdated: ${(session.updatedAt, true)}\n\n---\n\n${messages}`
  }

  getSessionStats(): { totalSessions: number; totalMessages: number; currentSessionMessages: number } {
    const totalMessages = Array.from(this.sessions.values()).reduce((sum, session) => sum + session.messages.length, 0)

    return {
      totalSessions: this.sessions.size,
      totalMessages,
      currentSessionMessages: this.currentSession?.messages.length || 0,
    }
  }
}

export const chatManager = new ChatManager()
