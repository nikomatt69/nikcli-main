/**
 * NikCLI SDK Stream Manager
 * Handles real-time streaming for TTY applications
 */

import { EventEmitter } from 'node:events'
import { nanoid } from 'nanoid'
import type {
  StreamEvent,
  StreamEventType,
  StreamConfig,
  AgentEvent,
} from '../types'

/**
 * Stream Manager Class
 * Manages real-time streaming and event handling
 */
export class StreamManager extends EventEmitter {
  private events: StreamEvent[] = []
  private isStreaming = false
  private config: StreamConfig
  private eventBuffer: StreamEvent[] = []
  private bufferSize: number
  private maxStreamDuration: number
  private streamStartTime?: Date
  private streamTimeout?: NodeJS.Timeout

  constructor(config: Partial<StreamConfig> = {}) {
    super()
    this.config = {
      enableRealTimeUpdates: true,
      tokenTrackingEnabled: true,
      maxStreamDuration: 300000,
      bufferSize: 1000,
      enableBackgroundAgents: true,
      enableProgressTracking: true,
      ...config,
    }
    this.bufferSize = this.config.bufferSize
    this.maxStreamDuration = this.config.maxStreamDuration
    this.setupEventHandlers()
  }

  /**
   * Start streaming
   */
  async startStream(): Promise<void> {
    if (this.isStreaming) {
      console.warn('Stream is already running')
      return
    }

    this.isStreaming = true
    this.streamStartTime = new Date()
    this.events = []
    this.eventBuffer = []

    // Setup stream timeout
    this.streamTimeout = setTimeout(() => {
      this.stopStream()
    }, this.maxStreamDuration)

    // Emit start event
    this.emitStreamEvent('start', 'Stream started')

    console.log('Stream started')
  }

  /**
   * Stop streaming
   */
  stopStream(): void {
    if (!this.isStreaming) {
      console.warn('Stream is not running')
      return
    }

    this.isStreaming = false

    // Clear timeout
    if (this.streamTimeout) {
      clearTimeout(this.streamTimeout)
      this.streamTimeout = undefined
    }

    // Flush remaining events
    this.flushEventBuffer()

    // Emit complete event
    this.emitStreamEvent('complete', 'Stream completed')

    console.log('Stream stopped')
  }

  /**
   * Send a message through the stream
   */
  async sendMessage(message: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.isStreaming) {
      throw new Error('Stream is not running')
    }

    this.emitStreamEvent('text_delta', message, metadata)
  }

  /**
   * Emit a stream event
   */
  emitStreamEvent(
    type: StreamEventType,
    content?: string,
    metadata?: Record<string, unknown>,
    agentId?: string,
    taskId?: string
  ): void {
    const event: StreamEvent = {
      type,
      content,
      metadata,
      timestamp: new Date(),
      agentId,
      taskId,
    }

    // Add to events array
    this.events.push(event)

    // Add to buffer
    this.eventBuffer.push(event)

    // Emit to listeners
    this.emit('streamEvent', event)

    // Flush buffer if it's full
    if (this.eventBuffer.length >= this.bufferSize) {
      this.flushEventBuffer()
    }
  }

  /**
   * Flush event buffer
   */
  private flushEventBuffer(): void {
    if (this.eventBuffer.length === 0) return

    this.emit('bufferFlush', this.eventBuffer)
    this.eventBuffer = []
  }

  /**
   * Handle agent events
   */
  handleAgentEvent(event: AgentEvent): void {
    if (!this.isStreaming) return

    const streamEventType = this.mapAgentEventToStreamEvent(event.type)
    if (!streamEventType) return

    this.emitStreamEvent(
      streamEventType,
      this.formatAgentEventContent(event),
      event.data,
      event.agentId
    )
  }

  /**
   * Map agent event type to stream event type
   */
  private mapAgentEventToStreamEvent(agentEventType: string): StreamEventType | null {
    const mapping: Record<string, StreamEventType> = {
      'agent.initialized': 'agent_start',
      'task.started': 'agent_start',
      'task.progress': 'agent_progress',
      'task.completed': 'agent_complete',
      'task.failed': 'error',
      'error.occurred': 'error',
    }

    return mapping[agentEventType] || null
  }

  /**
   * Format agent event content for stream
   */
  private formatAgentEventContent(event: AgentEvent): string {
    switch (event.type) {
      case 'agent.initialized':
        return `Agent ${event.data.agent?.name || event.agentId} initialized`
      case 'task.started':
        return `Task started: ${event.data.task?.title || 'Unknown task'}`
      case 'task.progress':
        return `Task progress: ${event.data.progress || 0}%`
      case 'task.completed':
        return `Task completed: ${event.data.task?.title || 'Unknown task'}`
      case 'task.failed':
        return `Task failed: ${event.data.task?.title || 'Unknown task'} - ${event.data.error || 'Unknown error'}`
      case 'error.occurred':
        return `Error occurred: ${event.data.error || 'Unknown error'}`
      default:
        return `Agent event: ${event.type}`
    }
  }

  /**
   * Simulate thinking process
   */
  async simulateThinking(duration: number = 1000): Promise<void> {
    if (!this.isStreaming) return

    this.emitStreamEvent('thinking', 'Agent is thinking...')

    // Simulate thinking with progress updates
    const steps = Math.max(1, Math.floor(duration / 200))
    for (let i = 0; i < steps; i++) {
      await new Promise(resolve => setTimeout(resolve, 200))
      this.emitStreamEvent('thinking', `Thinking... ${Math.round(((i + 1) / steps) * 100)}%`)
    }
  }

  /**
   * Simulate tool call
   */
  async simulateToolCall(toolName: string, args: Record<string, unknown> = {}): Promise<void> {
    if (!this.isStreaming) return

    this.emitStreamEvent('tool_call', `Calling tool: ${toolName}`, {
      toolName,
      arguments: args,
    })

    // Simulate tool execution
    await new Promise(resolve => setTimeout(resolve, 500))

    this.emitStreamEvent('tool_result', `Tool ${toolName} completed`, {
      toolName,
      result: { success: true, output: `Tool ${toolName} executed successfully` },
    })
  }

  /**
   * Get current events
   */
  getEvents(): StreamEvent[] {
    return [...this.events]
  }

  /**
   * Get events by type
   */
  getEventsByType(type: StreamEventType): StreamEvent[] {
    return this.events.filter(event => event.type === type)
  }

  /**
   * Get events by agent
   */
  getEventsByAgent(agentId: string): StreamEvent[] {
    return this.events.filter(event => event.agentId === agentId)
  }

  /**
   * Clear all events
   */
  clearEvents(): void {
    this.events = []
    this.eventBuffer = []
    this.emit('eventsCleared')
  }

  /**
   * Get stream statistics
   */
  getStats() {
    const now = new Date()
    const duration = this.streamStartTime ? now.getTime() - this.streamStartTime.getTime() : 0

    return {
      isStreaming: this.isStreaming,
      totalEvents: this.events.length,
      bufferSize: this.eventBuffer.length,
      duration,
      eventsByType: this.events.reduce((acc, event) => {
        acc[event.type] = (acc[event.type] || 0) + 1
        return acc
      }, {} as Record<string, number>),
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<StreamConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.bufferSize = this.config.bufferSize
    this.maxStreamDuration = this.config.maxStreamDuration
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('streamEvent', (event: StreamEvent) => {
      if (this.config.enableRealTimeUpdates) {
        console.log(`[${event.timestamp?.toISOString()}] ${event.type}: ${event.content}`)
      }
    })

    this.on('bufferFlush', (events: StreamEvent[]) => {
      console.log(`Buffer flushed: ${events.length} events`)
    })

    this.on('eventsCleared', () => {
      console.log('Events cleared')
    })
  }

  /**
   * Add event listener
   */
  addEventListener(event: string, handler: (...args: any[]) => void): void {
    this.on(event, handler)
  }

  /**
   * Remove event listener
   */
  removeEventListener(event: string, handler: (...args: any[]) => void): void {
    this.off(event, handler)
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    this.stopStream()
    this.clearEvents()
    this.removeAllListeners()
  }
}