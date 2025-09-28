import { EventEmitter } from 'node:events'
import type { CoreMessage } from 'ai'
import type { ModernAIProvider } from '../../ai/modern-ai-provider'
import type { SimpleConfigManager } from '../../core/config-manager'
import { CliUI } from '../../utils/cli-ui'
import type { VimState } from '../types/vim-types'
import type { VimModeConfig } from '../vim-mode-manager'

export interface VimAIRequest {
  type: 'generate' | 'explain' | 'refactor' | 'comment' | 'assist'
  context: string
  prompt?: string
  selection?: {
    startLine: number
    endLine: number
    content: string
  }
}

export class VimAIIntegration extends EventEmitter {
  private state: VimState
  private config: VimModeConfig
  private aiProvider: ModernAIProvider
  private configManager: SimpleConfigManager
  private isProcessing: boolean = false

  constructor(
    state: VimState,
    config: VimModeConfig,
    aiProvider: ModernAIProvider,
    configManager: SimpleConfigManager
  ) {
    super()
    this.state = state
    this.config = config
    this.aiProvider = aiProvider
    this.configManager = configManager
  }

  async processAIRequest(request: VimAIRequest): Promise<string> {
    if (!this.config.aiIntegration) {
      throw new Error('AI integration is disabled')
    }

    if (this.isProcessing) {
      throw new Error('AI request already in progress')
    }

    this.isProcessing = true
    this.emit('processingStarted', request)

    try {
      const response = await this.executeAIRequest(request)
      this.emit('processingCompleted', request, response)
      return response
    } catch (error: any) {
      this.emit('processingFailed', request, error)
      throw error
    } finally {
      this.isProcessing = false
    }
  }

  private async executeAIRequest(request: VimAIRequest): Promise<string> {
    const messages = this.buildAIMessages(request)

    try {
      const response = await this.aiProvider.generateWithStyle(messages, { outputStyle: 'technical-precise' })

      return response.text
    } catch (error: any) {
      CliUI.logError(`AI request failed: ${error.message}`)
      throw error
    }
  }

  private buildAIMessages(request: VimAIRequest): CoreMessage[] {
    const messages: CoreMessage[] = []

    // System message with vim context
    messages.push({
      role: 'system',
      content: this.buildSystemPrompt(request.type),
    })

    // Context message
    if (request.context) {
      messages.push({
        role: 'user',
        content: this.buildContextMessage(request),
      })
    }

    return messages
  }

  private buildSystemPrompt(type: string): string {
    const basePrompt = `You are an AI assistant integrated with a Vim editor. You help users with coding tasks directly in their editor.

IMPORTANT GUIDELINES:
- Provide concise, actionable responses
- Focus on code quality and best practices
- Consider the current file context and cursor position
- Return only the relevant code or explanation, no extra formatting
- For code generation, return only the code without markdown blocks
- For explanations, be clear and brief`

    switch (type) {
      case 'generate':
        return `${basePrompt}

TASK: Generate code based on user requirements
- Write clean, production-ready code
- Follow established patterns in the codebase
- Include necessary imports and dependencies
- Consider error handling and edge cases`

      case 'explain':
        return `${basePrompt}

TASK: Explain code functionality
- Break down complex logic into simple terms
- Highlight important patterns and concepts
- Mention potential improvements or issues
- Keep explanations concise but comprehensive`

      case 'refactor':
        return `${basePrompt}

TASK: Refactor existing code
- Improve readability and maintainability
- Apply best practices and design patterns
- Preserve original functionality
- Suggest performance optimizations where applicable`

      case 'comment':
        return `${basePrompt}

TASK: Add appropriate comments to code
- Write clear, meaningful comments
- Explain complex logic and business rules
- Use proper comment syntax for the language
- Avoid obvious or redundant comments`

      case 'assist':
        return `${basePrompt}

TASK: General coding assistance
- Help debug issues and errors
- Suggest improvements and alternatives
- Provide guidance on best practices
- Answer technical questions clearly`

      default:
        return basePrompt
    }
  }

  private buildContextMessage(request: VimAIRequest): string {
    let message = `Current context in Vim editor:\n`

    // Add cursor position
    message += `Cursor position: Line ${this.state.cursor.line + 1}, Column ${this.state.cursor.column + 1}\n`

    // Add current mode
    message += `Mode: ${this.state.mode}\n`

    // Add selection if available
    if (request.selection) {
      message += `Selected text (lines ${request.selection.startLine + 1}-${request.selection.endLine + 1}):\n`
      message += `\`\`\`\n${request.selection.content}\n\`\`\`\n`
    }

    // Add surrounding context
    const contextLines = this.getContextLines()
    if (contextLines.length > 0) {
      message += `\nSurrounding code:\n\`\`\`\n${contextLines.join('\n')}\n\`\`\`\n`
    }

    // Add user prompt if provided
    if (request.prompt) {
      message += `\nUser request: ${request.prompt}\n`
    }

    // Add request type specific context
    switch (request.type) {
      case 'generate':
        message += `\nPlease generate code that fits naturally at the current cursor position.`
        break
      case 'explain':
        message += `\nPlease explain the selected code or the code at the current cursor position.`
        break
      case 'refactor':
        message += `\nPlease refactor the selected code or suggest improvements.`
        break
      case 'comment':
        message += `\nPlease add appropriate comments to the selected code.`
        break
      case 'assist':
        message += `\nPlease provide assistance with the current code or task.`
        break
    }

    return message
  }

  private getContextLines(): string[] {
    const currentLine = this.state.cursor.line
    const contextRange = 5 // Lines before and after cursor

    const startLine = Math.max(0, currentLine - contextRange)
    const endLine = Math.min(this.state.buffer.length - 1, currentLine + contextRange)

    const contextLines: string[] = []
    for (let i = startLine; i <= endLine; i++) {
      const line = this.state.buffer[i] || ''
      const marker = i === currentLine ? '→ ' : '  '
      contextLines.push(`${i + 1}${marker}${line}`)
    }

    return contextLines
  }

  async generateCode(prompt: string): Promise<string> {
    return this.processAIRequest({
      type: 'generate',
      context: this.getCurrentContext(),
      prompt,
    })
  }

  async explainCode(selection?: string): Promise<string> {
    return this.processAIRequest({
      type: 'explain',
      context: selection || this.getCurrentContext(),
    })
  }

  async refactorCode(selection: string, instruction?: string): Promise<string> {
    return this.processAIRequest({
      type: 'refactor',
      context: selection,
      prompt: instruction,
    })
  }

  async commentCode(selection: string): Promise<string> {
    return this.processAIRequest({
      type: 'comment',
      context: selection,
    })
  }

  async assistWithCode(prompt: string): Promise<string> {
    return this.processAIRequest({
      type: 'assist',
      context: this.getCurrentContext(),
      prompt,
    })
  }

  private getCurrentContext(): string {
    const currentLine = this.state.cursor.line
    return this.state.buffer[currentLine] || ''
  }

  isAIProcessing(): boolean {
    return this.isProcessing
  }

  abortCurrentRequest(): void {
    if (this.isProcessing) {
      this.isProcessing = false
      this.emit('processingAborted')
    }
  }
}
