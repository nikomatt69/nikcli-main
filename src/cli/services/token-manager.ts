import chalk from 'chalk'
import { contextTokenManager } from '../core/context-token-manager'
import { chatManager } from '../chat/chat-manager'
import { universalTokenizer } from '../core/universal-tokenizer'
import { enhancedSupabaseProvider } from '../providers/supabase/enhanced-supabase-provider'
import { authProvider } from '../providers/supabase/auth-provider'
import { recordTokenUsageForCurrentUser } from '../core/token-usage-tracker'

/**
 * TokenManager - Handles token management and tracking
 * Extracted from lines 14003-14367 in nik-cli.ts
 */
export class TokenManager {
  private nikCLI: any
  private sessionTokenUsage: number = 0
  private contextTokens: number = 0
  private realTimeCost: number = 0
  private sessionStartTime: Date = new Date()
  private toolchainContext: Map<string, number> = new Map()
  private toolchainTokenLimit: number = 50000
  private modelPricing: Map<string, { input: number; output: number }> = new Map()
  private aiOperationStart: Date | null = null
  private activeSpinner: any = null
  private tokenDisplay: any = null

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
    this.initializeModelPricing()
  }

  getSessionTokenUsage(): number {
    return this.sessionTokenUsage
  }

  resetSessionTokenUsage(): void {
    this.sessionTokenUsage = 0
    this.contextTokens = 0
    this.realTimeCost = 0
    this.sessionStartTime = new Date()
  }

  manageToolchainTokens(toolName: string, estimatedTokens: number): boolean {
    const currentUsage = this.toolchainContext.get(toolName) || 0
    const newTotal = currentUsage + estimatedTokens

    if (newTotal > this.toolchainTokenLimit) {
      console.log(chalk.yellow(`⚠️ Toolchain token limit reached for ${toolName}`))
      console.log(
        chalk.dim(`   Current: ${currentUsage}, Adding: ${estimatedTokens}, Limit: ${this.toolchainTokenLimit}`)
      )

      // Clear old context for this tool
      this.toolchainContext.set(toolName, estimatedTokens)
      return false // Indicates limit reached
    }

    this.toolchainContext.set(toolName, newTotal)
    return true // Indicates safe to proceed
  }

  clearToolchainContext(toolName?: string): void {
    if (toolName) {
      this.toolchainContext.delete(toolName)
      console.log(chalk.blue(`🧹 Cleared context for ${toolName}`))
    } else {
      this.toolchainContext.clear()
      console.log(chalk.blue(`🧹 Cleared all toolchain context`))
    }
  }

  private initializeModelPricing(): void {
    // Anthropic Claude pricing (per 1M tokens)
    this.modelPricing.set('claude-sonnet-4-20250514', { input: 15.0, output: 75.0 })
    this.modelPricing.set('claude-3-5-sonnet-latest', { input: 0.25, output: 1.25 })
    this.modelPricing.set('claude-4-opus-20250514', { input: 3.0, output: 15.0 })

    // OpenAI pricing (per 1M tokens)
    this.modelPricing.set('gpt-4o', { input: 5.0, output: 15.0 })
    this.modelPricing.set('gpt-4o-mini', { input: 0.15, output: 0.6 })
    this.modelPricing.set('gpt-5', { input: 10.0, output: 30.0 })

    // Google Gemini pricing (per 1M tokens)
    this.modelPricing.set('gemini-2.5-pro', { input: 1.25, output: 5.0 })
    this.modelPricing.set('gemini-2.5-flash', { input: 0.075, output: 0.3 })
    this.modelPricing.set('gemini-2.5-flash-lite', { input: 0.075, output: 0.3 })
  }

  private calculateCost(inputTokens: number, outputTokens: number, modelName: string): number {
    const pricing = this.modelPricing.get(modelName)
    if (!pricing) return 0

    const inputCost = (inputTokens / 1000000) * pricing.input
    const outputCost = (outputTokens / 1000000) * pricing.output
    return inputCost + outputCost
  }

  startAIOperation(operation: string = 'Processing'): void {
    this.aiOperationStart = new Date()
    this.stopSpinner() // Stop any existing spinner

    const ora = require('ora')
    this.activeSpinner = ora({
      text: '',
      spinner: 'dots',
      color: 'cyan',
    }).start()

    this.updateSpinnerText(operation)

    // Update spinner every 500ms with realtime stats
    const interval = setInterval(() => {
      if (!this.activeSpinner || !this.aiOperationStart) {
        clearInterval(interval)
        return
      }
      this.updateSpinnerText(operation)
    }, 500)

    // Store interval for cleanup
    ;(this.activeSpinner as any)._interval = interval
  }

  private updateSpinnerText(operation: string): void {
    if (!this.activeSpinner || !this.aiOperationStart) return

    const elapsed = Math.floor((Date.now() - this.aiOperationStart.getTime()) / 1000)
    const totalTokens = this.sessionTokenUsage + this.contextTokens
    const tokensDisplay = totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens.toString()
    const cost = this.realTimeCost.toFixed(4)

    const spinnerText = `${operation}... (${elapsed}s • ${tokensDisplay} tokens • $${cost} • esc to interrupt)`
    this.activeSpinner.text = spinnerText
  }

  stopAIOperation(): void {
    this.stopSpinner()
    this.aiOperationStart = null
  }

  private stopSpinner(): void {
    if (this.activeSpinner) {
      if ((this.activeSpinner as any)._interval) {
        clearInterval((this.activeSpinner as any)._interval)
      }
      this.activeSpinner.stop()
      this.activeSpinner = null
    }
  }

  updateTokenUsage(tokens: number, isOutput: boolean = false, modelName?: string): void {
    this.sessionTokenUsage += tokens

    if (modelName) {
      const inputTokens = isOutput ? 0 : tokens
      const outputTokens = isOutput ? tokens : 0
      this.realTimeCost += this.calculateCost(inputTokens, outputTokens, modelName)
    }

    // Don't update UI during streaming to avoid duplicates
    // UI will be updated when streaming completes
  }

  private initializeTokenTrackingSystem(): void {
    try {
      // Setup event listeners for token tracking
      contextTokenManager.on('session_started', (session) => {
        console.log(chalk.dim(`🔢 Token tracking started for ${session.provider}:${session.model}`))
        this.updateTokenDisplay()
      })

      contextTokenManager.on('warning_threshold_reached', ({ percentage, context }) => {
        console.log(chalk.yellow(`⚠️  Token usage at ${percentage.toFixed(1)}% of context limit`))
      })

      contextTokenManager.on('critical_threshold_reached', ({ percentage, context }) => {
        console.log(
          chalk.red(`🚨 Critical: Token usage at ${percentage.toFixed(1)}% - consider summarizing conversation`)
        )
      })

      contextTokenManager.on('message_tracked', async ({ messageInfo, session, optimization }) => {
        if (optimization.shouldTrim) {
          console.log(chalk.yellow(`💡 ${optimization.reason}`))
        }
        this.updateTokenDisplay()

        // Record per-user token usage metrics when authenticated
        try {
          if (
            authProvider.isAuthenticated() &&
            (messageInfo.role === 'user' || messageInfo.role === 'assistant')
          ) {
            await recordTokenUsageForCurrentUser(messageInfo, session)
          }
        } catch (error) {
          console.debug('Failed to record token usage metric:', error)
        }
      })

      // Initialize token display
      if (this.tokenDisplay) {
        this.tokenDisplay.reset()
      }
    } catch (error) {
      console.debug('Token tracking system initialization failed:', error)
    }
  }

  private async startTokenSession(): Promise<void> {
    try {
      const currentModel = this.nikCLI.configManager.getCurrentModel()
      const modelConfig = this.nikCLI.configManager.getModelConfig(currentModel)
      const currentProvider = modelConfig?.provider || 'anthropic' // Fallback only if config missing

      await contextTokenManager.startSession(currentProvider, currentModel)

      // Listen for session end to finalize and save to database
      contextTokenManager.once('session_ended', async (endedSession: any) => {
        try {
          const profile = authProvider.getCurrentProfile()
          if (profile) {
            const totalTokens = endedSession.totalInputTokens + endedSession.totalOutputTokens
            // Persist session end metrics (optional DB update for historical tracking)
            await enhancedSupabaseProvider.recordMetric({
              user_id: profile.id,
              session_id: endedSession.sessionId,
              event_type: 'session_ended',
              event_data: {
                duration: Date.now() - endedSession.startTime.getTime(),
                totalTokens,
                inputTokens: endedSession.totalInputTokens,
                outputTokens: endedSession.totalOutputTokens,
                totalCost: endedSession.totalCost,
                messageCount: endedSession.messageCount,
              },
              metadata: {
                source: 'nikcli-cli',
                provider: endedSession.provider,
                model: endedSession.model,
              },
            })
          }
        } catch (error: any) {
          console.debug('[startTokenSession] Failed to record session end:', error.message)
        }
      })
    } catch (error) {
      console.debug('Failed to start token session:', error)
    }
  }

  private updateTokenDisplay(): void {
    try {
      const tokenSession = contextTokenManager.getCurrentSession()
      if (tokenSession) {
        const stats = contextTokenManager.getSessionStats()
        if (stats?.session) {
          const totalTokens = stats.session.totalInputTokens + stats.session.totalOutputTokens
          const limits = universalTokenizer.getModelLimits(tokenSession.model, tokenSession.provider)

          if (this.tokenDisplay) {
            this.tokenDisplay.update(
              totalTokens,
              limits.context,
              tokenSession.provider,
              tokenSession.model,
              stats.session.totalCost
            )
          }
        }
      } else {
        // Fallback to chat session
        const chatSession = chatManager.getCurrentSession()
        if (chatSession) {
          const currentModel = this.nikCLI.configManager.getCurrentModel()
          const currentProvider = 'anthropic' // Fallback for now

          const userTokens = Math.round(
            chatSession.messages.filter((m) => m.role === 'user').reduce((sum, m) => sum + m.content.length, 0) / 4
          )
          const assistantTokens = Math.round(
            chatSession.messages
              .filter((m) => m.role === 'assistant')
              .reduce((sum, m) => sum + m.content.length, 0) / 4
          )
          const totalTokens = userTokens + assistantTokens
          const cost = universalTokenizer.calculateCost(userTokens, assistantTokens, currentModel).totalCost
          const limits = universalTokenizer.getModelLimits(currentModel, currentProvider)

          if (this.tokenDisplay) {
            this.tokenDisplay.update(totalTokens, limits.context, currentProvider, currentModel, cost)
          }
        }
      }
    } catch (error) {
      console.debug('Token display update failed:', error)
    }
  }

  async syncTokensFromSession(): Promise<void> {
    try {
      const session = chatManager.getCurrentSession()
      if (session) {
        // Calculate tokens the same way as /tokens command
        const userTokens = Math.round(
          session.messages.filter((m) => m.role === 'user').reduce((sum, m) => sum + m.content.length, 0) / 4
        )
        const assistantTokens = Math.round(
          session.messages.filter((m) => m.role === 'assistant').reduce((sum, m) => sum + m.content.length, 0) / 4
        )

        // Update session tokens
        this.sessionTokenUsage = userTokens + assistantTokens

        // Calculate real cost using the same method as /tokens
        const { calculateTokenCost } = await import('../config/token-limits')
        const currentModel = this.nikCLI.configManager.getCurrentModel()
        this.realTimeCost = calculateTokenCost(userTokens, assistantTokens, currentModel).totalCost
      }
    } catch (error) {
      // Fallback to keep existing values if import fails
      console.debug('Failed to sync tokens from session:', error)
    }
  }

  updateContextTokens(tokens: number): void {
    this.contextTokens = tokens

    // Don't update UI during streaming to avoid duplicates
    // UI will be updated when streaming completes
  }

  startToolTracking(): void {
    if (this.nikCLI.advancedUI) {
      this.nikCLI.advancedUI.startToolSession()
    }
  }

  endToolTracking(): void {
    if (this.nikCLI.advancedUI) {
      this.nikCLI.advancedUI.endToolSession()
    }
  }

  trackTool(
    type: 'grep' | 'search' | 'read' | 'write' | 'shell' | 'other',
    description: string,
    target?: string,
    lines?: string,
    count?: number
  ): void {
    if (this.nikCLI.advancedUI) {
      this.nikCLI.advancedUI.trackToolCall(type, description, target, lines, count)
    }
  }
}
