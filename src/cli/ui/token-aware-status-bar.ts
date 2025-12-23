// TODO: Consider refactoring for reduced complexity
import { EventEmitter } from 'node:events'
import blessed from 'blessed'
import chalk from 'chalk'
import type { LanguageModelUsage } from 'ai'
import { type ModelLimits, universalTokenizer } from '../core/universal-tokenizer-service'

export interface TokenDisplayOptions {
  showPercentage?: boolean
  showCost?: boolean
  showModel?: boolean
  refreshInterval?: number
  warningThreshold?: number // 0.8 = 80%
  criticalThreshold?: number // 0.9 = 90%
  planMode?: boolean
}

export interface TokenContext {
  currentTokens: number
  maxOutputTokens: number
  provider: string
  model: string
  estimatedCost: number
  sessionStartTime: Date
}

/**
 * Token-Aware Status Bar for real-time context and token display
 * Extends the basic blessed.js interface for CLI integration
 */
export class TokenAwareStatusBar extends EventEmitter {
  private screen: blessed.Widgets.Screen
  private statusElement!: blessed.Widgets.BoxElement
  private tokenElement!: blessed.Widgets.TextElement
  private costElement!: blessed.Widgets.TextElement
  private modelElement!: blessed.Widgets.TextElement

  private tokenContext: TokenContext | null = null
  private options: TokenDisplayOptions
  private refreshTimer: NodeJS.Timeout | null = null
  private isVisible: boolean = true
  private planMode: boolean = false

  constructor(screen: blessed.Widgets.Screen, options: TokenDisplayOptions = {}) {
    super()

    this.screen = screen
    this.options = {
      showPercentage: true,
      showCost: true,
      showModel: true,
      refreshInterval: 1000, // 1 second
      warningThreshold: 0.8,
      criticalThreshold: 0.9,
      planMode: false,
      ...options,
    }

    this.planMode = !!this.options.planMode

    this.createStatusBar()
    this.startRefreshTimer()
  }

  private createStatusBar(): void {
    // Main status bar container
    const barStyle = {
      bg: this.planMode ? 'magenta' : 'black',
      fg: 'white',
    }

    this.statusElement = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      style: barStyle,
    })

    // Token usage display
    const tokenStyle = {
      fg: this.planMode ? 'white' : 'green',
    }

    this.tokenElement = blessed.text({
      parent: this.statusElement,
      top: 0,
      left: 0,
      width: '40%',
      height: 1,
      content: 'Tokens: --',
      style: tokenStyle,
    })

    // Cost display
    const costStyle = {
      fg: this.planMode ? 'cyan' : 'yellow',
    }

    this.costElement = blessed.text({
      parent: this.statusElement,
      top: 0,
      left: '40%',
      width: '30%',
      height: 1,
      content: 'Cost: $0.00',
      style: costStyle,
    })

    // Model display
    const modelStyle = {
      fg: this.planMode ? 'black' : 'cyan',
    }

    this.modelElement = blessed.text({
      parent: this.statusElement,
      top: 0,
      right: 0,
      width: '30%',
      height: 1,
      content: 'Model: --',
      align: 'right',
      style: modelStyle,
    })

    // Make elements clickable for details
    this.tokenElement.enableMouse()
    this.tokenElement.on('click', () => {
      this.emit('token_details_requested', this.tokenContext)
    })

    this.costElement.enableMouse()
    this.costElement.on('click', () => {
      this.emit('cost_details_requested', this.tokenContext)
    })
  }

  /**
   * Update token context and refresh display
   */
  updateTokenContext(
    currentTokens: number,
    maxOutputTokens: number,
    provider: string,
    model: string,
    estimatedCost: number = 0
  ): void {
    this.tokenContext = {
      currentTokens,
      maxOutputTokens,
      provider,
      model,
      estimatedCost,
      sessionStartTime: this.tokenContext?.sessionStartTime || new Date(),
    }

    this.refreshDisplay()
    this.emit('token_context_updated', this.tokenContext)
  }

  /**
   * Update token context from TokenUsage object
   */
  updateFromTokenUsage(usage: LanguageModelUsage, limits: ModelLimits, provider?: string, model?: string, estimatedCost?: number): void {
    this.updateTokenContext(usage.inputTokens || 0, limits.context, provider || 'unknown', model || 'unknown', estimatedCost || 0)
  }

  /**
   * Increment current token count (for real-time tracking)
   */
  incrementTokens(additionalTokens: number, additionalCost: number = 0): void {
    if (this.tokenContext) {
      this.tokenContext.currentTokens += additionalTokens
      this.tokenContext.estimatedCost += additionalCost
      this.refreshDisplay()
    }
  }

  /**
   * Reset token context for new session
   */
  resetSession(provider: string, model: string): void {
    const limits = universalTokenizer.getModelLimits(model, provider)

    this.tokenContext = {
      currentTokens: 0,
      maxOutputTokens: limits.context,
      provider,
      model,
      estimatedCost: 0,
      sessionStartTime: new Date(),
    }

    this.refreshDisplay()
    this.emit('session_reset', this.tokenContext)
  }

  /**
   * Refresh the visual display
   */
  private refreshDisplay(): void {
    if (!this.tokenContext || !this.isVisible) return

    // Update token display
    const percentage = (this.tokenContext.currentTokens / this.tokenContext.maxOutputTokens) * 100
    const tokenColor = this.getTokenColor(percentage)
    const formattedTokens = this.formatTokens(this.tokenContext.currentTokens)
    const formattedMax = this.formatTokens(this.tokenContext.maxOutputTokens)

    let tokenText = `Tokens: ${formattedTokens}/${formattedMax}`
    if (this.options.showPercentage) {
      tokenText += ` (${percentage.toFixed(1)}%)`
    }

    this.tokenElement.setContent(tokenText)
    this.tokenElement.style.fg = tokenColor

    // Update cost display
    if (this.options.showCost) {
      const costText = `Cost: $${this.tokenContext.estimatedCost.toFixed(4)}`
      this.costElement.setContent(costText)
    }

    // Update model display
    if (this.options.showModel) {
      const modelText = `${this.tokenContext.provider}:${this.tokenContext.model}`
      this.modelElement.setContent(this.truncateModel(modelText))
    }

    // Trigger warnings if needed
    this.checkThresholds(percentage)

    // Render the screen
    this.screen.render()
  }

  private getTokenColor(percentage: number): string {
    if (percentage >= this.options.criticalThreshold! * 100) {
      return 'red'
    } else if (percentage >= this.options.warningThreshold! * 100) {
      return 'yellow'
    } else {
      return this.planMode ? 'white' : 'green'
    }
  }

  private formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`
    } else {
      return tokens.toString()
    }
  }

  private truncateModel(modelText: string): string {
    const maxWidth = 25 // Reasonable width for model display
    if (modelText.length <= maxWidth) return modelText

    // Try to keep the model name readable
    const parts = modelText.split(':')
    if (parts.length === 2) {
      const provider = parts[0].substring(0, 3) // First 3 chars of provider
      const model = parts[1]
      const available = maxWidth - provider.length - 1

      if (model.length > available) {
        return `${provider}:${model.substring(0, available - 2)}..`
      }
      return `${provider}:${model}`
    }

    return `${modelText.substring(0, maxWidth - 2)}..`
  }

  private checkThresholds(percentage: number): void {
    if (percentage >= this.options.criticalThreshold! * 100) {
      this.emit('critical_threshold_reached', {
        percentage,
        context: this.tokenContext,
      })
    } else if (percentage >= this.options.warningThreshold! * 100) {
      this.emit('warning_threshold_reached', {
        percentage,
        context: this.tokenContext,
      })
    }
  }

  private startRefreshTimer(): void {
    if (this.options.refreshInterval && this.options.refreshInterval > 0) {
      this.refreshTimer = setInterval(() => {
        this.refreshDisplay()
      }, this.options.refreshInterval)
    }
  }

  /**
   * Show/hide the status bar
   */
  setVisibility(visible: boolean): void {
    this.isVisible = visible
    this.statusElement.visible = visible
    this.screen.render()
  }

  /**
   * Toggle status bar visibility
   */
  toggle(): void {
    this.setVisibility(!this.isVisible)
  }

  /**
   * Set plan mode
   */
  setPlanMode(enabled: boolean): void {
    const prevMode = this.planMode
    this.planMode = enabled

    if (prevMode !== enabled) {
      // Update main bar
      this.statusElement.style.bg = enabled ? 'magenta' : 'black'
      this.statusElement.style.fg = 'white'

      // Update token element base color (but getTokenColor will handle dynamic)
      this.tokenElement.style.fg = this.getTokenColor(
        (this.tokenContext?.currentTokens || 0 / (this.tokenContext?.maxOutputTokens || 0)) * 100
      )

      // Update cost and model
      this.costElement.style.fg = enabled ? 'cyan' : 'yellow'
      this.modelElement.style.fg = enabled ? 'black' : 'cyan'

      this.screen.render()
      this.emit('plan_mode_changed', { enabled })
    }
  }

  /**
   * Get current token context
   */
  getTokenContext(): TokenContext | null {
    return this.tokenContext
  }

  /**
   * Get session duration in minutes
   */
  getSessionDuration(): number {
    if (!this.tokenContext) return 0
    const now = new Date()
    const duration = now.getTime() - this.tokenContext.sessionStartTime.getTime()
    return Math.round(duration / 60000) // Convert to minutes
  }

  /**
   * Get tokens per minute rate
   */
  getTokenRate(): number {
    if (!this.tokenContext) return 0
    const duration = this.getSessionDuration()
    if (duration === 0) return 0
    return Math.round(this.tokenContext.currentTokens / duration)
  }

  /**
   * Get comprehensive status info
   */
  getStatusInfo(): {
    context: TokenContext | null
    sessionDuration: number
    tokenRate: number
    thresholdWarning: boolean
    thresholdCritical: boolean
  } {
    const percentage = this.tokenContext ? (this.tokenContext.currentTokens / this.tokenContext.maxOutputTokens) * 100 : 0

    return {
      context: this.tokenContext,
      sessionDuration: this.getSessionDuration(),
      tokenRate: this.getTokenRate(),
      thresholdWarning: percentage >= this.options.warningThreshold! * 100,
      thresholdCritical: percentage >= this.options.criticalThreshold! * 100,
    }
  }

  /**
   * Create a simple console-friendly status string
   */
  getStatusString(): string {
    if (!this.tokenContext) return 'No active session'

    const formattedTokens = this.formatTokens(this.tokenContext.currentTokens)
    const formattedMax = this.formatTokens(this.tokenContext.maxOutputTokens)
    const percentage = (this.tokenContext.currentTokens / this.tokenContext.maxOutputTokens) * 100
    const cost = this.tokenContext.estimatedCost.toFixed(4)

    const baseColor = this.planMode ? chalk.magenta : chalk.white

    return baseColor(
      `Tokens: ${formattedTokens}/${formattedMax} (${percentage.toFixed(1)}%) | Cost: $${cost} | ${this.tokenContext.provider}:${this.tokenContext.model}`
    )
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }

    this.statusElement.destroy()
    this.removeAllListeners()
  }

  /**
   * Update configuration options
   */
  updateOptions(newOptions: Partial<TokenDisplayOptions>): void {
    this.options = { ...this.options, ...newOptions }

    // Handle planMode specifically
    if (newOptions.planMode !== undefined) {
      this.setPlanMode(newOptions.planMode)
    }

    // Restart timer if interval changed
    if (newOptions.refreshInterval !== undefined) {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer)
      }
      this.startRefreshTimer()
    }

    this.refreshDisplay()
  }
}

/**
 * Factory function to create TokenAwareStatusBar with default options
 */
export function createTokenAwareStatusBar(
  screen: blessed.Widgets.Screen,
  options?: TokenDisplayOptions
): TokenAwareStatusBar {
  return new TokenAwareStatusBar(screen, options)
}

/**
 * Helper function to create a simple console status display
 */
export function createConsoleTokenDisplay(): {
  update: (currentTokens: number, maxTokens: number, provider: string, model: string, cost: number) => void
  log: () => void
  reset: () => void
  setPlanMode: (enabled: boolean) => void
} {
  let context: TokenContext | null = null
  let planMode: boolean = false

  return {
    update: (currentTokens: number, maxTokens: number, provider: string, model: string, cost: number = 0) => {
      context = {
        currentTokens,
        maxOutputTokens: maxTokens,
        provider,
        model,
        estimatedCost: cost,
        sessionStartTime: context?.sessionStartTime || new Date(),
      }
    },

    log: () => {
      if (!context) {
        console.log(chalk.gray('No active token context'))
        return
      }

      const percentage = (context.currentTokens / context.maxOutputTokens) * 100
      const formattedTokens =
        context.currentTokens >= 1000
          ? `${(context.currentTokens / 1000).toFixed(1)}k`
          : context.currentTokens.toString()

      const formattedMax =
        context.maxOutputTokens >= 1000 ? `${(context.maxOutputTokens / 1000).toFixed(1)}k` : context.maxOutputTokens.toString()

      const color = percentage >= 90 ? chalk.red : percentage >= 80 ? chalk.yellow : chalk.green
      const baseStyle = planMode ? chalk.magenta.bgMagenta : chalk.white

      console.log(
        baseStyle(color(`🔢 Tokens: ${formattedTokens}/${formattedMax} (${percentage.toFixed(1)}%)`)) +
        chalk.cyan(` | 💰 $${context.estimatedCost.toFixed(4)}`) +
        chalk.blue(` | 🔌 ${context.provider}:${context.model}`)
      )
    },

    reset: () => {
      context = null
    },

    setPlanMode: (enabled: boolean) => {
      planMode = enabled
    },
  };
}
