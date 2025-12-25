/**
 * Chat Panel
 * AI chat interface in a TUI panel
 */

import { eventBus } from '../../core/EventBus'
import { PanelElement, type PanelElementConfig } from '../specialized/PanelElement'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  metadata?: Record<string, any>
}

export interface ChatPanelConfig extends PanelElementConfig {
  panelType: 'chat-panel'
  messages?: ChatMessage[]
  model?: string
  provider?: string
  systemPrompt?: string
}

export class ChatPanel extends PanelElement {
  private messages: ChatMessage[] = []
  private inputBuffer = ''
  private isWaitingForResponse = false
  private model = 'default'
  private provider = 'default'
  private systemPrompt = ''

  constructor(config: ChatPanelConfig, eventBus: any, theme: any) {
    super({ ...config, type: 'panel' }, eventBus, theme)

    this.messages = config.messages || []
    this.model = config.model || 'default'
    this.provider = config.provider || 'default'
    this.systemPrompt = config.systemPrompt || ''
  }

  protected onMount(): void {
    super.onMount()

    // Listen to chat events
    eventBus.on('chat:send', (data: { content: string; role?: 'user' | 'system' }) => {
      this.sendMessage(data.content, data.role || 'user')
    })

    eventBus.on('chat:response', (message: ChatMessage) => {
      this.addMessage(message)
    })

    eventBus.on('chat:clear', () => {
      this.clearChat()
    })

    eventBus.on('chat:model:change', (data: { model: string; provider?: string }) => {
      this.model = data.model
      if (data.provider) {
        this.provider = data.provider
      }
      this.updateTitle(`Chat (${this.provider}/${this.model})`)
    })

    // Initial render
    this.renderChat()
  }

  /**
   * Send message
   */
  sendMessage(content: string, role: 'user' | 'system' = 'user'): void {
    if (this.isWaitingForResponse || !content.trim()) return

    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role,
      content: content.trim(),
      timestamp: Date.now(),
    }

    this.addMessage(message)
    this.inputBuffer = ''

    // Emit event for AI processing
    if (role === 'user') {
      this.isWaitingForResponse = true
      eventBus.emit('chat:request', {
        message,
        context: {
          model: this.model,
          provider: this.provider,
          systemPrompt: this.systemPrompt,
          history: this.messages.slice(-10), // Last 10 messages for context
        },
      })
    }
  }

  /**
   * Add message to chat
   */
  addMessage(message: ChatMessage): void {
    this.messages.push(message)
    this.isWaitingForResponse = false
    this.renderChat()

    // Scroll to bottom if auto-scroll enabled
    eventBus.emit('chat:message:added', message)
  }

  /**
   * Clear chat
   */
  clearChat(): void {
    this.messages = []
    this.renderChat()
    eventBus.emit('chat:cleared', {})
  }

  /**
   * Get messages
   */
  getMessages(): ChatMessage[] {
    return [...this.messages]
  }

  /**
   * Set system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt
  }

  /**
   * Get model info
   */
  getModelInfo(): { model: string; provider: string } {
    return {
      model: this.model,
      provider: this.provider,
    }
  }

  /**
   * Render chat
   */
  private renderChat(): void {
    // Format messages for display
    const formattedMessages = this.messages.map((msg) => {
      const time = new Date(msg.timestamp).toLocaleTimeString()
      const role = msg.role.toUpperCase()
      const prefix = msg.role === 'user' ? '>' : msg.role === 'assistant' ? 'AI' : 'SYS'
      return `{dim}[${time}]{/} {bold}${prefix}:{/} ${msg.content}`
    })

    // Add waiting indicator
    if (this.isWaitingForResponse) {
      formattedMessages.push(`{dim}AI is thinking...{/}`)
    }

    // Update panel content
    super.renderList(formattedMessages)
  }

  /**
   * Get message count
   */
  getMessageCount(): number {
    return this.messages.length
  }

  /**
   * Get token count (approximate)
   */
  getTokenCount(): number {
    return this.messages.reduce((count, msg) => {
      // Rough estimation: 1 token ≈ 4 characters
      return count + Math.ceil(msg.content.length / 4)
    }, 0)
  }

  protected onInput(key: string): boolean {
    // Handle special keys
    if (key === 'enter') {
      // Send message
      if (this.inputBuffer.trim()) {
        this.sendMessage(this.inputBuffer)
      }
      return true
    } else if (key === 'esc') {
      // Clear input
      this.inputBuffer = ''
      return true
    } else if (key === 'C-l') {
      // Clear chat
      this.clearChat()
      return true
    } else if (key === 'C-k') {
      // Clear last message
      const lastUserMessage = [...this.messages].reverse().find((m) => m.role === 'user')
      if (lastUserMessage) {
        this.messages = this.messages.filter((m) => m.id !== lastUserMessage.id)
        this.renderChat()
      }
      return true
    } else if (key === 'C-r') {
      // Regenerate last response
      const lastUserMessage = [...this.messages].reverse().find((m) => m.role === 'user')
      if (lastUserMessage && !this.isWaitingForResponse) {
        this.sendMessage(lastUserMessage.content)
      }
      return true
    }

    // For other keys, add to input buffer
    if (key.length === 1 && !key.startsWith('C-') && !key.startsWith('S-')) {
      this.inputBuffer += key
    }

    return super.onInput(key)
  }

  protected onUpdate(data: any): void {
    if (data.type === 'chat') {
      this.messages = data.messages || []
      this.renderChat()
    } else if (data.type === 'model') {
      this.model = data.model
      this.provider = data.provider || this.provider
      this.updateTitle(`Chat (${this.provider}/${this.model})`)
    } else if (data.type === 'input') {
      this.inputBuffer = data.content || ''
    } else if (data.type === 'response') {
      this.addMessage(data.message)
    } else {
      super.onUpdate(data)
    }
  }

  protected onMouse(event: any): boolean {
    if (event.type === 'click') {
      // Focus chat panel for input
      this.focus()
      return true
    }
    return super.onMouse(event)
  }

  protected onDestroy(): void {
    this.messages = []
    this.inputBuffer = ''
    super.onDestroy()
  }
}
