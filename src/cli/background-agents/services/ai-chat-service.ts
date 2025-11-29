/**
 * AI Chat Service
 * Integrates AI SDK for generating chat responses in interactive mode via OpenRouter
 */

import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { LanguageModelV1, streamText, type CoreMessage } from 'ai'
import { EventEmitter } from 'node:events'
import type { ChatMessage, ChatSession } from '../types'
import { retryOperation, withTimeout, ExternalServiceError } from '../middleware/error-handler'

export interface AIChatServiceConfig {
  model?: string
  apiKey?: string
  maxTokens?: number
  temperature?: number
}

export class AIChatService extends EventEmitter {
  private model: string
  private openrouter: ReturnType<typeof createOpenRouter>
  private maxTokens: number
  private temperature: number

  // Circuit breaker state
  private failureCount: number = 0
  private lastFailureTime: number = 0
  private circuitState: 'closed' | 'open' | 'half-open' = 'closed'
  private readonly failureThreshold: number = 5
  private readonly resetTimeout: number = 60000 // 1 minute

  constructor(config?: AIChatServiceConfig) {
    super()
    // Default to MiniMax M2 for background agents (fast, reliable, low cost)
    this.model = config?.model || process.env.OPENROUTER_MODEL || 'minimax/minimax-m2'
    const apiKey = config?.apiKey || process.env.OPENROUTER_API_KEY || ''
    this.maxTokens = config?.maxTokens || 8000
    this.temperature = config?.temperature || 0.7

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is required for AI Chat Service')
    }

    this.openrouter = createOpenRouter({
      apiKey,
    })
  }

  /**
   * Generate a streaming response for a chat session with circuit breaker and retry
   */
  async generateResponse(
    session: ChatSession,
    userMessage: string,
    onTextDelta?: (delta: string, accumulated: string) => void,
    onComplete?: (fullText: string) => void
  ): Promise<string> {
    // Check circuit breaker
    this.checkCircuitBreaker()

    // Convert chat messages to AI SDK format
    const messages: CoreMessage[] = this.convertMessagesToAIFormat(session.messages, userMessage)
    const systemPrompt = this.buildSystemPrompt(session)

    try {
      // Wrap operation with timeout and retry
      const fullText = await retryOperation(
        async () => {
          return await withTimeout(
            this.streamResponse(messages, systemPrompt, onTextDelta, onComplete),
            120000, // 2 minute timeout
            'AI response generation timed out'
          )
        },
        3, // max 3 retries
        2000, // 2 second initial delay
        2 // exponential backoff multiplier
      )

      // Success - reset circuit breaker
      this.onSuccess()

      return fullText
    } catch (error) {
      // Failure - update circuit breaker
      this.onFailure()

      console.error('[AI Chat] Error generating response:', error)
      this.emit('error', error)

      throw new ExternalServiceError('OpenRouter AI', error as Error)
    }
  }

  /**
   * Stream response from AI model
   */
  private async streamResponse(
    messages: CoreMessage[],
    systemPrompt: string,
    onTextDelta?: (delta: string, accumulated: string) => void,
    onComplete?: (fullText: string) => void
  ): Promise<string> {
    let fullText = ''

    const result = await streamText({
      model: this.openrouter.languageModel(this.model) as unknown as LanguageModelV1,
      system: systemPrompt,
      messages,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      onFinish: ({ text, usage }) => {
        console.log('[AI Chat] Response completed:', {
          length: text.length,
          usage,
        })
        this.emit('response:complete', { text, usage })
      },
    })

    // Stream the response - handle all chunk types like NikCLI toolchains
    try {
      for await (const event of result.fullStream) {
        const eventType = (event as any).type

        switch (eventType) {
          case 'text-delta':
            // Regular text streaming
            fullText += (event as any).textDelta
            onTextDelta?.((event as any).textDelta, fullText)
            break

          case 'thinking':
          case 'reasoning':
            // Reasoning chunks - ignore silently
            break

          case 'tool-call-delta':
          case 'tool-call-streaming-start':
          case 'tool-call':
            // Tool calls - ignore silently
            break

          case 'finish':
          case 'step-finish':
            // Completion events - ignore
            break

          default:
            // Unknown event types - handle gracefully
            if ((event as any).thinking) {
              // Reasoning chunk
              break
            } else if ((event as any).textDelta) {
              fullText += (event as any).textDelta
              onTextDelta?.((event as any).textDelta, fullText)
            }
            break
        }
      }
    } catch (streamError: any) {
      // Fallback to textStream if fullStream fails
      console.warn('[AI Chat] fullStream failed, falling back to textStream:', streamError.message)
      try {
        for await (const chunk of result.textStream) {
          fullText += chunk
          onTextDelta?.(chunk, fullText)
        }
      } catch (error: any) {
        console.error('[AI Chat] textStream fallback failed:', error.message)
        throw error
      }
    }

    onComplete?.(fullText)

    return fullText
  }

  /**
   * Circuit breaker: check if circuit is open
   */
  private checkCircuitBreaker(): void {
    const now = Date.now()

    // If circuit is open, check if we should try half-open
    if (this.circuitState === 'open') {
      if (now - this.lastFailureTime >= this.resetTimeout) {
        console.log('[AI Chat] Circuit breaker: Attempting half-open state')
        this.circuitState = 'half-open'
        this.failureCount = 0
      } else {
        throw new ExternalServiceError(
          'OpenRouter AI',
          new Error('Circuit breaker is OPEN - too many failures')
        )
      }
    }
  }

  /**
   * Circuit breaker: handle successful operation
   */
  private onSuccess(): void {
    if (this.circuitState === 'half-open') {
      console.log('[AI Chat] Circuit breaker: Closing circuit after successful half-open test')
      this.circuitState = 'closed'
    }
    this.failureCount = 0
  }

  /**
   * Circuit breaker: handle failed operation
   */
  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.failureThreshold) {
      console.error(
        `[AI Chat] Circuit breaker: OPENING circuit after ${this.failureCount} failures`
      )
      this.circuitState = 'open'
    }
  }

  /**
   * Convert chat messages to AI SDK CoreMessage format
   */
  private convertMessagesToAIFormat(
    messages: ChatMessage[],
    newUserMessage: string
  ): CoreMessage[] {
    const coreMessages: CoreMessage[] = []

    // Add existing messages
    for (const msg of messages) {
      if (msg.role === 'system') continue // System messages go in system prompt

      coreMessages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })
    }

    // Add new user message
    coreMessages.push({
      role: 'user',
      content: newUserMessage,
    })

    return coreMessages
  }

  /**
   * Build system prompt for the chat session
   */
  private buildSystemPrompt(session: ChatSession): string {
    return `You are NikCLI Background Agent, an AI assistant specialized in software development tasks.

Current Context:
- Repository: ${session.repo}
- Session ID: ${session.id}
- Job ID: ${session.jobId}
- Mode: Interactive (you must request approval for sensitive operations)

Your capabilities:
- Read and analyze code files
- Execute shell commands (with approval)
- Modify files and create commits
- Run tests and builds
- Create pull requests

Guidelines:
1. Always explain your reasoning before taking actions
2. Request approval for commands that modify files or execute code
3. Track file changes and provide clear diffs
4. Be concise but thorough in explanations
5. Use markdown formatting for code blocks
6. When making changes, explain the impact

Current session has ${session.messages.length} previous messages and ${session.fileChanges.length} file changes.

Remember: You are working in an isolated sandbox environment for this repository.`
  }

  /**
   * Generate a summary of file changes for PR description
   */
  generatePRDescription(session: ChatSession): string {
    const { fileChanges, messages } = session

    const summary = `## Summary

This PR was generated by NikCLI Background Agent in interactive chat session.

### Changes Made

${fileChanges.map((change) => `- **${change.type}**: \`${change.path}\``).join('\n')}

### Session Context

- Total messages: ${messages.length}
- Files changed: ${fileChanges.length}
- Session ID: ${session.id}

### Task Description

${messages.find((m) => m.role === 'user')?.content || 'Interactive development session'}

---
🤖 Generated with [NikCLI](https://github.com/nikomatt69/nikcli-main)
`

    return summary
  }
}
