import { EventEmitter } from 'node:events'
import type { CoreMessage } from 'ai'
import chalk from 'chalk'
import { structuredLogger } from '../utils/structured-logger'
import { type ModelLimits, type TokenUsage, universalTokenizer } from './universal-tokenizer-service'

export interface SessionContext {
  sessionId: string
  provider: string
  model: string
  startTime: Date
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  messageCount: number
  lastActivity: Date
  modelLimits: ModelLimits
}

export interface MessageTokenInfo {
  messageId: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  tokens: number
  cost: number
  timestamp: Date
  cumulativeTokens: number
}

export interface ContextOptimization {
  shouldTrim: boolean
  currentUsage: number
  maxTokens: number
  usagePercentage: number
  recommendation: 'continue' | 'trim_context' | 'switch_model' | 'summarize'
  reason: string
}

/**
 * Real-time Context and Token Manager
 * Tracks token usage throughout chat sessions and provides optimization recommendations
 */
export class ContextTokenManager extends EventEmitter {
  private currentSession: SessionContext | null = null
  private messageHistory: Map<string, MessageTokenInfo> = new Map()
  private conversationMessages: CoreMessage[] = []

  // Configuration
  private readonly WARNING_THRESHOLD = 0.8 // 80%
  private readonly CRITICAL_THRESHOLD = 0.9 // 90%
  private readonly MAX_MESSAGES_HISTORY = 100

  constructor() {
    super()
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    // Listen to tokenizer events
    universalTokenizer.on('token_count', (data) => {
      this.emit('token_counted', data)
    })

    universalTokenizer.on('messages_token_count', (data) => {
      this.emit('messages_counted', data)
    })
  }

  /**
   * Extract text content from complex content types
   */
  private extractTextContent(content: any): string {
    if (typeof content === 'string') {
      return content
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part
          if (part?.text) return part.text
          if (part?.type === 'text' && part?.text) return part.text
          return ''
        })
        .join('')
    }

    if (content?.text) {
      return content.text
    }

    return JSON.stringify(content)
  }

  /**
   * Start a new chat session with context tracking
   */
  async startSession(provider: string, model: string, sessionId?: string): Promise<SessionContext> {
    // End current session if exists
    if (this.currentSession) {
      await this.endSession()
    }

    const limits = universalTokenizer.getModelLimits(model, provider)

    this.currentSession = {
      sessionId: sessionId || this.generateSessionId(),
      provider,
      model,
      startTime: new Date(),
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      messageCount: 0,
      lastActivity: new Date(),
      modelLimits: limits,
    }

    // Clear history for new session
    this.messageHistory.clear()
    this.conversationMessages = []

    structuredLogger.info(
      'Started new token tracking session',
      JSON.stringify({
        sessionId: this.currentSession.sessionId,
        provider,
        model,
        contextLimit: limits.context,
      })
    )

    this.emit('session_started', this.currentSession)
    return this.currentSession
  }

  /**
   * Track a new message and update session context
   */
  async trackMessage(message: CoreMessage, messageId?: string, isOutput: boolean = false): Promise<MessageTokenInfo> {
    if (!this.currentSession) {
      throw new Error('No active session. Call startSession() first.')
    }

    const id = messageId || this.generateMessageId()
    const tokens = await universalTokenizer.countTokens(
      this.extractTextContent(message.content),
      this.currentSession.model,
      this.currentSession.provider
    )

    // Calculate cost
    const cost = isOutput
      ? universalTokenizer.calculateCost(0, tokens, this.currentSession.model).outputCost
      : universalTokenizer.calculateCost(tokens, 0, this.currentSession.model).inputCost

    // Update session totals
    if (isOutput) {
      this.currentSession.totalOutputTokens += tokens
    } else {
      this.currentSession.totalInputTokens += tokens
    }

    this.currentSession.totalCost += cost
    this.currentSession.messageCount++
    this.currentSession.lastActivity = new Date()

    // Create message info
    const messageInfo: MessageTokenInfo = {
      messageId: id,
      role: message.role,
      tokens,
      cost,
      timestamp: new Date(),
      cumulativeTokens: this.currentSession.totalInputTokens + this.currentSession.totalOutputTokens,
    }

    // Store in history
    this.messageHistory.set(id, messageInfo)
    this.conversationMessages.push(message)

    // Keep history manageable
    this.trimMessageHistory()

    // Check if we need optimization
    const optimization = this.analyzeContextOptimization()

    this.emit('message_tracked', {
      messageInfo,
      session: this.currentSession,
      optimization,
    })

    // Emit warnings if needed
    if (optimization.usagePercentage >= this.CRITICAL_THRESHOLD * 100) {
      this.emit('critical_threshold_reached', {
        session: this.currentSession,
        optimization,
      })
    } else if (optimization.usagePercentage >= this.WARNING_THRESHOLD * 100) {
      this.emit('warning_threshold_reached', {
        session: this.currentSession,
        optimization,
      })
    }

    return messageInfo
  }

  /**
   * Track multiple messages (conversation context)
   */
  async trackConversation(messages: CoreMessage[]): Promise<TokenUsage> {
    if (!this.currentSession) {
      throw new Error('No active session. Call startSession() first.')
    }

    const usage = await universalTokenizer.getTokenUsage(
      messages,
      this.currentSession.model,
      this.currentSession.provider,
      0 // No output tokens for context analysis
    )

    // Update session
    this.currentSession.totalInputTokens = usage.promptTokens
    this.currentSession.totalCost = usage.estimatedCost
    this.currentSession.lastActivity = new Date()

    // Update conversation messages
    this.conversationMessages = [...messages]

    this.emit('conversation_tracked', {
      usage,
      session: this.currentSession,
      optimization: this.analyzeContextOptimization(),
    })

    return usage
  }

  /**
   * Pre-request token validation - Hard guard against context overflow
   */
  validateRequestTokens(
    messages: CoreMessage[],
    maxOutputTokens: number = 4000
  ): {
    isValid: boolean
    totalTokens: number
    maxTokens: number
    error?: string
    recommendation: ContextOptimization
  } {
    if (!this.currentSession) {
      return {
        isValid: false,
        totalTokens: 0,
        maxTokens: 0,
        error: 'No active session',
        recommendation: {
          shouldTrim: false,
          currentUsage: 0,
          maxTokens: 0,
          usagePercentage: 0,
          recommendation: 'continue',
          reason: 'No active session',
        },
      }
    }

    // Count tokens for all messages
    let totalInputTokens = 0
    for (const message of messages) {
      totalInputTokens += this.estimateTokens(this.extractTextContent(message.content))
    }

    // Add overhead for message structure and tool calls
    totalInputTokens += messages.length * 4 // Message overhead
    totalInputTokens += 50 // Conversation overhead

    const totalTokens = totalInputTokens + maxOutputTokens
    const maxTokens = this.currentSession.modelLimits.context
    const usagePercentage = (totalTokens / maxTokens) * 100

    // Hard limit check - fail if over 95% of context
    const HARD_LIMIT_THRESHOLD = 0.95
    const isValid = usagePercentage < HARD_LIMIT_THRESHOLD * 100

    let error: string | undefined
    if (!isValid) {
      const excessTokens = totalTokens - maxTokens
      error = `🚫 Token limit exceeded: ${totalTokens.toLocaleString()} tokens requested (max: ${maxTokens.toLocaleString()}). Excess: ${excessTokens.toLocaleString()} tokens. Please break your request into smaller parts.`
    }

    const recommendation = this.analyzeContextOptimization()
    recommendation.shouldTrim = !isValid || usagePercentage > 80

    return {
      isValid,
      totalTokens,
      maxTokens,
      error,
      recommendation,
    }
  }

  /**
   * Estimate tokens for text content (fallback method)
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4)
  }

  /**
   * Analyze current context and provide optimization recommendations
   */
  analyzeContextOptimization(): ContextOptimization {
    if (!this.currentSession) {
      return {
        shouldTrim: false,
        currentUsage: 0,
        maxTokens: 0,
        usagePercentage: 0,
        recommendation: 'continue',
        reason: 'No active session',
      }
    }

    const totalTokens = this.currentSession.totalInputTokens + this.currentSession.totalOutputTokens
    const maxTokens = this.currentSession.modelLimits.context
    const usagePercentage = (totalTokens / maxTokens) * 100

    let recommendation: ContextOptimization['recommendation'] = 'continue'
    let reason = 'Token usage is within acceptable limits'
    let shouldTrim = false

    if (usagePercentage >= this.CRITICAL_THRESHOLD * 100) {
      recommendation = 'summarize'
      reason = `Critical usage at ${usagePercentage.toFixed(1)}%. Consider summarizing conversation history.`
      shouldTrim = true
    } else if (usagePercentage >= this.WARNING_THRESHOLD * 100) {
      recommendation = 'trim_context'
      reason = `High usage at ${usagePercentage.toFixed(1)}%. Consider trimming older messages.`
      shouldTrim = true
    } else if (usagePercentage >= 50) {
      reason = `Moderate usage at ${usagePercentage.toFixed(1)}%. Monitor for continued growth.`
    }

    return {
      shouldTrim,
      currentUsage: totalTokens,
      maxTokens,
      usagePercentage,
      recommendation,
      reason,
    }
  }

  /**
   * Get optimized message context (smart trimming)
   */
  async getOptimizedContext(maxTokens?: number): Promise<{
    messages: CoreMessage[]
    removedCount: number
    tokensSaved: number
    strategy: 'none' | 'trim_oldest' | 'trim_middle' | 'summarize'
  }> {
    if (!this.currentSession || this.conversationMessages.length === 0) {
      return {
        messages: [],
        removedCount: 0,
        tokensSaved: 0,
        strategy: 'none',
      }
    }

    const targetTokens = maxTokens || Math.floor(this.currentSession.modelLimits.context * 0.7)
    const currentTokens = await universalTokenizer.countMessagesTokens(
      this.conversationMessages,
      this.currentSession.model,
      this.currentSession.provider
    )

    if (currentTokens <= targetTokens) {
      return {
        messages: this.conversationMessages,
        removedCount: 0,
        tokensSaved: 0,
        strategy: 'none',
      }
    }

    // Strategy 1: Trim oldest messages (keep system + recent)
    const systemMessages = this.conversationMessages.filter((m) => m.role === 'system')
    const nonSystemMessages = this.conversationMessages.filter((m) => m.role !== 'system')

    const optimizedMessages: CoreMessage[] = [...systemMessages]
    let tokensUsed = 0

    // Add system message tokens
    for (const msg of systemMessages) {
      tokensUsed += await universalTokenizer.countTokens(
        this.extractTextContent(msg.content),
        this.currentSession.model,
        this.currentSession.provider
      )
    }

    // Add recent messages from the end
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msgTokens = await universalTokenizer.countTokens(
        this.extractTextContent(nonSystemMessages[i].content),
        this.currentSession.model,
        this.currentSession.provider
      )

      if (tokensUsed + msgTokens <= targetTokens) {
        optimizedMessages.unshift(nonSystemMessages[i])
        tokensUsed += msgTokens
      } else {
        break
      }
    }

    // Preserve conversation order
    optimizedMessages.sort((a, b) => {
      const aIndex = this.conversationMessages.indexOf(a)
      const bIndex = this.conversationMessages.indexOf(b)
      return aIndex - bIndex
    })

    const removedCount = this.conversationMessages.length - optimizedMessages.length
    const tokensSaved = currentTokens - tokensUsed

    return {
      messages: optimizedMessages,
      removedCount,
      tokensSaved,
      strategy: 'trim_oldest',
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    session: SessionContext | null
    averageTokensPerMessage: number
    tokensPerMinute: number
    costPerMessage: number
    remainingContext: number
    remainingPercentage: number
  } | null {
    if (!this.currentSession) return null

    const totalTokens = this.currentSession.totalInputTokens + this.currentSession.totalOutputTokens
    const remainingTokens = this.currentSession.modelLimits.context - totalTokens
    const sessionDurationMinutes = (Date.now() - this.currentSession.startTime.getTime()) / 60000

    return {
      session: this.currentSession,
      averageTokensPerMessage:
        this.currentSession.messageCount > 0 ? totalTokens / this.currentSession.messageCount : 0,
      tokensPerMinute: sessionDurationMinutes > 0 ? totalTokens / sessionDurationMinutes : 0,
      costPerMessage:
        this.currentSession.messageCount > 0 ? this.currentSession.totalCost / this.currentSession.messageCount : 0,
      remainingContext: remainingTokens,
      remainingPercentage: (remainingTokens / this.currentSession.modelLimits.context) * 100,
    }
  }

  /**
   * Get current session context
   */
  getCurrentSession(): SessionContext | null {
    return this.currentSession
  }

  /**
   * Get message history
   */
  getMessageHistory(): MessageTokenInfo[] {
    return Array.from(this.messageHistory.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }

  /**
   * End current session
   */
  async endSession(): Promise<SessionContext | null> {
    if (!this.currentSession) return null

    const endedSession = { ...this.currentSession }

    structuredLogger.info(
      'Ended token tracking session',
      JSON.stringify({
        sessionId: endedSession.sessionId,
        duration: Date.now() - endedSession.startTime.getTime(),
        totalTokens: endedSession.totalInputTokens + endedSession.totalOutputTokens,
        totalCost: endedSession.totalCost,
        messageCount: endedSession.messageCount,
      })
    )

    this.emit('session_ended', endedSession)

    // Clean up
    this.currentSession = null
    this.messageHistory.clear()
    this.conversationMessages = []

    return endedSession
  }

  /**
   * Switch to different model within same session
   */
  async switchModel(newProvider: string, newModel: string): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session to switch model')
    }

    const oldModel = `${this.currentSession.provider}:${this.currentSession.model}`

    this.currentSession.provider = newProvider
    this.currentSession.model = newModel
    this.currentSession.modelLimits = universalTokenizer.getModelLimits(newModel, newProvider)
    this.currentSession.lastActivity = new Date()

    structuredLogger.info(
      'Switched model in active session',
      JSON.stringify({
        sessionId: this.currentSession.sessionId,
        oldModel,
        newModel: `${newProvider}:${newModel}`,
      })
    )

    this.emit('model_switched', {
      session: this.currentSession,
      oldModel,
      newModel: `${newProvider}:${newModel}`,
    })

    // Re-analyze optimization with new limits
    const optimization = this.analyzeContextOptimization()
    this.emit('context_reanalyzed', {
      session: this.currentSession,
      optimization,
    })
  }

  /**
   * Get a formatted status string for display
   */
  getStatusString(): string {
    if (!this.currentSession) {
      return chalk.gray('No active session')
    }

    const totalTokens = this.currentSession.totalInputTokens + this.currentSession.totalOutputTokens
    const percentage = (totalTokens / this.currentSession.modelLimits.context) * 100
    const cost = this.currentSession.totalCost

    const tokenStr = totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens.toString()
    const limitStr =
      this.currentSession.modelLimits.context >= 1000
        ? `${(this.currentSession.modelLimits.context / 1000).toFixed(0)}k`
        : this.currentSession.modelLimits.context.toString()

    const colorFn = percentage >= 90 ? chalk.red : percentage >= 80 ? chalk.yellow : chalk.green

    return (
      colorFn(`${tokenStr}/${limitStr} (${percentage.toFixed(1)}%)`) +
      chalk.cyan(` | $${cost.toFixed(4)}`) +
      chalk.blue(` | ${this.currentSession.provider}:${this.currentSession.model}`)
    )
  }

  // Private helper methods

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private trimMessageHistory(): void {
    if (this.messageHistory.size <= this.MAX_MESSAGES_HISTORY) return

    const entries = Array.from(this.messageHistory.entries()).sort(
      (a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime()
    )

    // Remove oldest entries
    const toRemove = entries.slice(0, entries.length - this.MAX_MESSAGES_HISTORY)
    for (const [id] of toRemove) {
      this.messageHistory.delete(id)
    }
  }
}

// Singleton instance
export const contextTokenManager = new ContextTokenManager()
