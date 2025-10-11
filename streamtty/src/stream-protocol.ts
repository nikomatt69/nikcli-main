/**
 * Stream Protocol Implementation
 * 
 * This module provides utilities for validating, transforming, and
 * processing stream events according to the AI SDK protocol.
 */

import { 
  StreamEvent, 
  StreamEventType, 
  StreamEventOptions,
  ToolCallEvent,
  ToolResultEvent,
  TextDeltaEvent,
  ThinkingEvent,
  StatusEvent,
  ErrorEvent
} from './types/stream-events'

export class StreamProtocol {
  private static readonly VALID_EVENT_TYPES: Set<StreamEventType> = new Set([
    'text_delta',
    'tool_call', 
    'tool_result',
    'thinking',
    'start',
    'complete',
    'error',
    'reasoning',
    'step',
    'status'
  ])

  /**
   * Validate a stream event structure
   */
  static validateEvent(event: any): event is StreamEvent {
    if (!event || typeof event !== 'object') {
      return false
    }

    if (!this.VALID_EVENT_TYPES.has(event.type)) {
      return false
    }

    // Type-specific validation
    switch (event.type) {
      case 'tool_call':
        return this.validateToolCallEvent(event)
      case 'tool_result':
        return this.validateToolResultEvent(event)
      case 'text_delta':
        return this.validateTextDeltaEvent(event)
      case 'thinking':
      case 'reasoning':
        return this.validateThinkingEvent(event)
      case 'status':
      case 'step':
        return this.validateStatusEvent(event)
      case 'error':
        return this.validateErrorEvent(event)
      default:
        return true
    }
  }

  private static validateToolCallEvent(event: any): event is ToolCallEvent {
    return typeof event.toolName === 'string' && 
           typeof event.toolArgs === 'object' && 
           event.toolArgs !== null
  }

  private static validateToolResultEvent(event: any): event is ToolResultEvent {
    return event.toolResult !== undefined
  }

  private static validateTextDeltaEvent(event: any): event is TextDeltaEvent {
    return typeof event.content === 'string'
  }

  private static validateThinkingEvent(event: any): event is ThinkingEvent {
    return typeof event.content === 'string'
  }

  private static validateStatusEvent(event: any): event is StatusEvent {
    return typeof event.content === 'string' && 
           (!event.metadata || typeof event.metadata === 'object')
  }

  private static validateErrorEvent(event: any): event is ErrorEvent {
    return typeof event.content === 'string'
  }

  /**
   * Transform a generic event into a typed event
   */
  static transformEvent(event: StreamEvent): StreamEvent {
    const transformed: StreamEvent = {
      ...event,
      metadata: {
        timestamp: Date.now(),
        ...event.metadata
      }
    }

    return transformed
  }

  /**
   * Create a text delta event
   */
  static createTextDelta(content: string, metadata?: Record<string, any>): TextDeltaEvent {
    return {
      type: 'text_delta',
      content,
      metadata: {
        timestamp: Date.now(),
        ...metadata
      }
    }
  }

  /**
   * Create a tool call event
   */
  static createToolCall(
    toolName: string, 
    toolArgs: Record<string, any>,
    metadata?: Record<string, any>
  ): ToolCallEvent {
    return {
      type: 'tool_call',
      toolName,
      toolArgs,
      metadata: {
        timestamp: Date.now(),
        ...metadata
      }
    }
  }

  /**
   * Create a tool result event
   */
  static createToolResult(
    toolResult: any,
    metadata?: Record<string, any>
  ): ToolResultEvent {
    return {
      type: 'tool_result',
      toolResult,
      metadata: {
        timestamp: Date.now(),
        ...metadata
      }
    }
  }

  /**
   * Create a thinking event
   */
  static createThinking(
    content: string,
    metadata?: Record<string, any>
  ): ThinkingEvent {
    return {
      type: 'thinking',
      content,
      metadata: {
        timestamp: Date.now(),
        ...metadata
      }
    }
  }

  /**
   * Create a reasoning event
   */
  static createReasoning(
    content: string,
    metadata?: Record<string, any>
  ): ThinkingEvent {
    return {
      type: 'reasoning',
      content,
      metadata: {
        timestamp: Date.now(),
        ...metadata
      }
    }
  }

  /**
   * Create a status event
   */
  static createStatus(
    content: string,
    status?: 'pending' | 'running' | 'completed' | 'failed',
    metadata?: Record<string, any>
  ): StatusEvent {
    return {
      type: 'status',
      content,
      metadata: {
        timestamp: Date.now(),
        status,
        ...metadata
      }
    }
  }

  /**
   * Create an error event
   */
  static createError(
    content: string,
    error?: Error,
    metadata?: Record<string, any>
  ): ErrorEvent {
    return {
      type: 'error',
      content,
      metadata: {
        timestamp: Date.now(),
        error,
        code: error?.name || 'UNKNOWN_ERROR',
        ...metadata
      }
    }
  }

  /**
   * Check if an event should be rendered based on options
   */
  static shouldRenderEvent(event: StreamEvent, options: StreamEventOptions = {}): boolean {
    switch (event.type) {
      case 'thinking':
      case 'reasoning':
        return options.showThinking !== false
      default:
        return true
    }
  }

  /**
   * Get event priority for rendering order
   */
  static getEventPriority(event: StreamEvent): number {
    const priorities: Record<StreamEventType, number> = {
      'error': 0,
      'start': 1,
      'complete': 1,
      'status': 2,
      'step': 2,
      'tool_call': 3,
      'tool_result': 3,
      'thinking': 4,
      'reasoning': 4,
      'text_delta': 5
    }
    
    return priorities[event.type] || 10
  }
}
