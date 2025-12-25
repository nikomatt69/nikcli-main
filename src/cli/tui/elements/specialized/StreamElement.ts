/**
 * Stream Element
 * Integrates StreamttyService with OpenTUI for real-time output streaming
 */

import { eventBus } from '../../core/EventBus'
import { BaseElement, type ElementConfig, type OpenTUIElement } from '../base/BaseElement'

export interface StreamElementConfig extends ElementConfig {
  type: 'stream'
  source: 'streamtty' | 'ai' | 'tool' | 'log'
  batchSize?: number
  batchTimeout?: number
  autoScroll?: boolean
  preserveHistory?: boolean
  maxLines?: number
}

export interface StreamChunk {
  content: string
  type: 'text' | 'error' | 'success' | 'info' | 'data'
  timestamp: number
}

export class StreamElement extends BaseElement {
  private buffer: StreamChunk[] = []
  private batchTimer: NodeJS.Timeout | null = null
  private maxLines: number
  private autoScroll: boolean
  private preserveHistory: boolean
  private batchSize: number
  private batchTimeout: number
  private scrollPosition = 0

  constructor(config: StreamElementConfig, eventBus: any, theme: any) {
    super(config, eventBus, theme)

    this.maxLines = config.maxLines || 1000
    this.autoScroll = config.autoScroll !== false
    this.preserveHistory = config.preserveHistory !== false
    this.batchSize = config.batchSize || 50
    this.batchTimeout = config.batchTimeout || 16

    this.setupStreamttyIntegration()
  }

  protected createElement(): OpenTUIElement {
    return {
      id: this.config.id,
      type: 'stream',
      parent: null,
      children: [],
      props: {
        scrollable: true,
        tags: true,
      },
      text: '',
      visible: this.config.hidden !== true,
      focused: false,

      append: (child: OpenTUIElement) => {
        child.parent = this.element
        this.element.children.push(child)
      },
      remove: (child: OpenTUIElement) => {
        const index = this.element.children.indexOf(child)
        if (index > -1) {
          this.element.children.splice(index, 1)
          child.parent = null
        }
      },
      clear: () => {
        this.element.children = []
      },
      focus: () => {
        this.element.focused = true
      },
      blur: () => {
        this.element.focused = false
      },
      show: () => {
        this.element.visible = true
      },
      hide: () => {
        this.element.visible = false
      },
      update: (props: Record<string, any>) => {
        this.element.props = { ...this.element.props, ...props }
      },
      destroy: () => {
        this.clear()
      },
    }
  }

  private setupStreamttyIntegration(): void {
    // Listen to streamtty events
    eventBus.on('streamtty:chunk', (data: { chunk: string; type: string }) => {
      this.streamChunk(data.chunk, data.type as any)
    })

    eventBus.on('streamtty:ai-event', (event: any) => {
      this.streamAISDKEvent(event)
    })

    // Listen to stream events based on source
    if ((this.config as StreamElementConfig).source === 'streamtty') {
      eventBus.on('streamtty:output', (data: any) => {
        this.addToBuffer(data.content, data.type || 'text')
      })
    } else if ((this.config as StreamElementConfig).source === 'ai') {
      eventBus.on('ai:response', (data: any) => {
        this.addToBuffer(data.content, 'text')
      })
    } else if ((this.config as StreamElementConfig).source === 'tool') {
      eventBus.on('tool:output', (data: any) => {
        this.addToBuffer(data.content, data.type || 'text')
      })
    } else if ((this.config as StreamElementConfig).source === 'log') {
      eventBus.on('log:message', (data: any) => {
        this.addToBuffer(data.message, data.level || 'info')
      })
    }
  }

  /**
   * Stream chunk of data
   */
  streamChunk(chunk: string, type: StreamChunk['type']): void {
    this.addToBuffer(chunk, type)
  }

  /**
   * Stream AI SDK event
   */
  streamAISDKEvent(event: any): void {
    // Convert StreamEvent to displayable content
    let content = ''
    let chunkType: StreamChunk['type'] = 'text'

    if (event.type === 'response') {
      content = event.content || ''
      chunkType = 'text'
    } else if (event.type === 'error') {
      content = `Error: ${event.error}`
      chunkType = 'error'
    } else if (event.type === 'data') {
      content = JSON.stringify(event.data, null, 2)
      chunkType = 'data'
    } else if (event.type === 'tool_call') {
      content = `Tool: ${event.tool}`
      chunkType = 'info'
    }

    if (content) {
      this.addToBuffer(content, chunkType)
    }
  }

  /**
   * Add content to buffer
   */
  private addToBuffer(content: string, type: StreamChunk['type']): void {
    const chunk: StreamChunk = {
      content,
      type,
      timestamp: Date.now(),
    }

    this.buffer.push(chunk)

    // Limit buffer size
    if (this.buffer.length > this.maxLines) {
      if (this.preserveHistory) {
        // Keep last maxLines
        this.buffer = this.buffer.slice(-this.maxLines)
      } else {
        // Remove oldest
        this.buffer.shift()
      }
    }

    // Schedule batch update
    this.scheduleUpdate()
  }

  /**
   * Schedule batch update
   */
  private scheduleUpdate(): void {
    if (this.batchTimer) return

    this.batchTimer = setTimeout(() => {
      this.flushBuffer()
      this.batchTimer = null
    }, this.batchTimeout)
  }

  /**
   * Flush buffer to display
   */
  private flushBuffer(): void {
    if (this.buffer.length === 0) return

    // Join buffer content
    const content = this.buffer.map((chunk) => this.formatChunk(chunk)).join('')
    this.buffer = []

    // Update element
    this.element.text = (this.element.text || '') + content

    // Auto-scroll if enabled
    if (this.autoScroll) {
      this.scrollToBottom()
    }
  }

  /**
   * Format chunk for display
   */
  private formatChunk(chunk: StreamChunk): string {
    const timestamp = new Date(chunk.timestamp).toLocaleTimeString()

    switch (chunk.type) {
      case 'error':
        return `{red-fg}[${timestamp}] Error: ${chunk.content}{/}\n`
      case 'success':
        return `{green-fg}[${timestamp}] ${chunk.content}{/}\n`
      case 'info':
        return `{cyan-fg}[${timestamp}] ${chunk.content}{/}\n`
      case 'data':
        return `{blue-fg}[${timestamp}] Data: ${chunk.content}{/}\n`
      default:
        return `[${timestamp}] ${chunk.content}\n`
    }
  }

  /**
   * Clear stream content
   */
  clear(): void {
    this.buffer = []
    this.element.text = ''
    this.scrollPosition = 0
  }

  /**
   * Scroll to bottom
   */
  scrollToBottom(): void {
    this.scrollPosition = this.element.children.length
    // TODO: Implement actual scrolling in OpenTUI
  }

  /**
   * Scroll up
   */
  scrollUp(lines: number = 1): void {
    this.scrollPosition = Math.max(0, this.scrollPosition - lines)
    // TODO: Implement actual scrolling
  }

  /**
   * Scroll down
   */
  scrollDown(lines: number = 1): void {
    this.scrollPosition = Math.min(this.element.children.length, this.scrollPosition + lines)
    // TODO: Implement actual scrolling
  }

  /**
   * Get current scroll position
   */
  getScrollPosition(): number {
    return this.scrollPosition
  }

  /**
   * Set auto-scroll
   */
  setAutoScroll(enabled: boolean): void {
    this.autoScroll = enabled
  }

  /**
   * Check if auto-scroll is enabled
   */
  isAutoScrollEnabled(): boolean {
    return this.autoScroll
  }

  /**
   * Get buffer size
   */
  getBufferSize(): number {
    return this.buffer.length
  }

  /**
   * Get max lines
   */
  getMaxLines(): number {
    return this.maxLines
  }

  /**
   * Set max lines
   */
  setMaxLines(lines: number): void {
    this.maxLines = lines
    if (this.buffer.length > this.maxLines) {
      this.buffer = this.buffer.slice(-this.maxLines)
    }
  }

  protected onInput(key: string): boolean {
    switch (key) {
      case 'up':
      case 'k':
        this.scrollUp()
        return true

      case 'down':
      case 'j':
        this.scrollDown()
        return true

      case 'g':
        this.scrollPosition = 0
        return true

      case 'G':
        this.scrollToBottom()
        return true

      case 'C-l':
        this.clear()
        return true

      default:
        return false
    }
  }

  protected onMouse(event: any): boolean {
    if (event.type === 'wheel') {
      if (event.direction === 'up') {
        this.scrollUp(3)
      } else if (event.direction === 'down') {
        this.scrollDown(3)
      }
      return true
    }
    return false
  }

  protected onUpdate(data: any): void {
    if (data.type === 'clear') {
      this.clear()
    } else if (data.type === 'scroll') {
      if (data.direction === 'up') {
        this.scrollUp(data.lines || 1)
      } else if (data.direction === 'down') {
        this.scrollDown(data.lines || 1)
      } else if (data.direction === 'bottom') {
        this.scrollToBottom()
      }
    } else if (data.type === 'config') {
      if (data.autoScroll !== undefined) {
        this.autoScroll = data.autoScroll
      }
      if (data.maxLines !== undefined) {
        this.setMaxLines(data.maxLines)
      }
    }
  }

  protected onDestroy(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
    this.buffer = []
    super.onDestroy()
  }
}
