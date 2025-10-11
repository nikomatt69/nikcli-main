/**
 * Event-Driven Architecture
 * 
 * This module provides a comprehensive event system for streamtty,
 * enabling lifecycle hooks, custom event handling, and inter-component communication.
 */

import { EventEmitter } from 'events';
import { StreamEvent, StreamEventType } from './types/stream-events';
import { StreamttyError } from './errors';

/**
 * Streamtty event types
 */
export type StreamttyEventType =
  | 'streamtty:init'           // Streamtty initialized
  | 'streamtty:destroy'        // Streamtty destroyed
  | 'streamtty:clear'          // Content cleared
  | 'streamtty:render'         // Render completed
  | 'streamtty:error'          // Error occurred
  | 'parser:chunk'             // Chunk parsed
  | 'parser:complete'          // Parsing complete
  | 'parser:error'             // Parse error
  | 'renderer:start'           // Rendering started
  | 'renderer:complete'        // Rendering completed
  | 'renderer:error'           // Render error
  | 'ai:event'                 // AI SDK event processed
  | 'ai:stream_start'          // AI stream started
  | 'ai:stream_complete'       // AI stream completed
  | 'ai:stream_error'          // AI stream error
  | 'ui:keypress'              // Key pressed
  | 'ui:scroll'                // Scrolled
  | 'ui:resize'                // Screen resized
  | 'performance:slow'         // Performance warning
  | 'performance:memory'       // Memory usage warning
  | 'custom';                  // Custom events

/**
 * Event data interfaces
 */
export interface StreamttyEventData {
  timestamp: number;
  source: string;
  context?: Record<string, any>;
}

export interface ParserEventData extends StreamttyEventData {
  chunk?: string;
  tokens?: any[];
  error?: Error;
}

export interface RendererEventData extends StreamttyEventData {
  tokens?: any[];
  duration?: number;
  error?: Error;
}

export interface AIEventData extends StreamttyEventData {
  event?: StreamEvent;
  streamId?: string;
  error?: Error;
}

export interface UIEventData extends StreamttyEventData {
  key?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  delta?: number;
  dimensions?: { width: number; height: number };
}

export interface PerformanceEventData extends StreamttyEventData {
  operation: string;
  duration: number;
  threshold: number;
  memoryUsage?: NodeJS.MemoryUsage;
}

/**
 * Event handler types
 */
export type StreamttyEventHandler<T = any> = (data: T) => void | Promise<void>;
export type StreamttyEventFilter<T = any> = (data: T) => boolean;

/**
 * Enhanced EventEmitter for Streamtty
 */
export class StreamttyEventEmitter extends EventEmitter {
  private eventHistory: Array<{ type: string; data: any; timestamp: number }> = [];
  private maxHistorySize: number = 100;
  private filters: Map<string, StreamttyEventFilter[]> = new Map();

  constructor(maxHistorySize: number = 100) {
    super();
    this.maxHistorySize = maxHistorySize;
    this.setMaxListeners(50); // Increase default limit
  }

  /**
   * Emit an event with automatic timestamp and history tracking
   */
  emit(event: string, data?: any): boolean {
    const timestamp = Date.now();
    const eventData = {
      ...data,
      timestamp,
      source: this.constructor.name
    };

    // Apply filters
    if (this.shouldFilterEvent(event, eventData)) {
      return false;
    }

    // Add to history
    this.addToHistory(event, eventData, timestamp);

    // Emit the event
    const result = super.emit(event, eventData);

    // Emit wildcard event for global listeners
    super.emit('*', event, eventData);

    return result;
  }

  /**
   * Add event listener with optional filter
   */
  on<T = any>(
    event: string,
    handler: StreamttyEventHandler<T>,
    filter?: StreamttyEventFilter<T>
  ): this {
    const wrappedHandler = (data: T) => {
      if (!filter || filter(data)) {
        handler(data);
      }
    };

    super.on(event, wrappedHandler);
    return this;
  }

  /**
   * Add one-time event listener
   */
  once<T = any>(
    event: string,
    handler: StreamttyEventHandler<T>,
    filter?: StreamttyEventFilter<T>
  ): this {
    const wrappedHandler = (data: T) => {
      if (!filter || filter(data)) {
        handler(data);
        this.off(event, wrappedHandler);
      }
    };

    super.once(event, wrappedHandler);
    return this;
  }

  /**
   * Add event filter
   */
  addFilter<T = any>(event: string, filter: StreamttyEventFilter<T>): this {
    if (!this.filters.has(event)) {
      this.filters.set(event, []);
    }
    this.filters.get(event)!.push(filter);
    return this;
  }

  /**
   * Remove event filter
   */
  removeFilter(event: string, filter?: StreamttyEventFilter): this {
    if (!this.filters.has(event)) {
      return this;
    }

    if (filter) {
      const filters = this.filters.get(event)!;
      const index = filters.indexOf(filter);
      if (index > -1) {
        filters.splice(index, 1);
      }
    } else {
      this.filters.delete(event);
    }

    return this;
  }

  /**
   * Get event history
   */
  getHistory(event?: string, limit?: number): Array<{ type: string; data: any; timestamp: number }> {
    let history = this.eventHistory;

    if (event) {
      history = history.filter(item => item.type === event);
    }

    if (limit && limit > 0) {
      history = history.slice(-limit);
    }

    return history;
  }

  /**
   * Clear event history
   */
  clearHistory(): this {
    this.eventHistory = [];
    return this;
  }

  /**
   * Get event statistics
   */
  getEventStats(): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const event of this.eventHistory) {
      stats[event.type] = (stats[event.type] || 0) + 1;
    }

    return stats;
  }

  private shouldFilterEvent(event: string, data: any): boolean {
    const filters = this.filters.get(event);
    if (!filters) {
      return false;
    }

    return filters.some(filter => !filter(data));
  }

  private addToHistory(event: string, data: any, timestamp: number): void {
    this.eventHistory.push({ type: event, data, timestamp });

    // Trim history if it exceeds max size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }
}

/**
 * Event Bus for inter-component communication
 */
export class StreamttyEventBus extends StreamttyEventEmitter {
  private components: Map<string, EventEmitter> = new Map();

  /**
   * Register a component
   */
  registerComponent(name: string, component: EventEmitter): this {
    this.components.set(name, component);

    // Forward component events to the bus (if wildcard supported)
    if (typeof (component as any).on === 'function') {
      const handler = (event: string, data: any) => {
        this.emit(`${name}:${event}`, data);
      };
      // Some EventEmitters don't support wildcard, skip if not available
      try {
        (component as any).on('*', handler);
      } catch {
        // Wildcard not supported, skip
      }
    }

    return this;
  }

  /**
   * Unregister a component
   */
  unregisterComponent(name: string): this {
    const component = this.components.get(name);
    if (component) {
      component.removeAllListeners();
      this.components.delete(name);
    }
    return this;
  }

  /**
   * Get a registered component
   */
  getComponent<T extends EventEmitter = EventEmitter>(name: string): T | undefined {
    return this.components.get(name) as T;
  }

  /**
   * Broadcast event to all components
   */
  broadcast(event: string, data?: any): this {
    for (const component of this.components.values()) {
      component.emit(event, data);
    }
    return this;
  }
}

/**
 * Lifecycle event manager
 */
export class StreamttyLifecycle {
  private eventBus: StreamttyEventBus;
  private hooks: Map<string, StreamttyEventHandler[]> = new Map();

  constructor(eventBus: StreamttyEventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Register a lifecycle hook
   */
  on(event: StreamttyEventType, handler: StreamttyEventHandler): this {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event)!.push(handler);
    return this;
  }

  /**
   * Remove a lifecycle hook
   */
  off(event: StreamttyEventType, handler: StreamttyEventHandler): this {
    const hooks = this.hooks.get(event);
    if (hooks) {
      const index = hooks.indexOf(handler);
      if (index > -1) {
        hooks.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * Trigger a lifecycle event
   */
  async trigger(event: StreamttyEventType, data?: any): Promise<void> {
    const hooks = this.hooks.get(event);
    if (hooks) {
      for (const hook of hooks) {
        try {
          await hook(data);
        } catch (error) {
          this.eventBus.emit('streamtty:error', {
            type: 'lifecycle_hook_error',
            event,
            error: error instanceof Error ? error : new Error(String(error))
          });
        }
      }
    }

    this.eventBus.emit(event, data);
  }

  /**
   * Trigger multiple lifecycle events
   */
  async triggerMultiple(events: Array<{ event: StreamttyEventType; data?: any }>): Promise<void> {
    for (const { event, data } of events) {
      await this.trigger(event, data);
    }
  }
}

/**
 * Event utilities
 */
export class EventUtils {
  /**
   * Create a debounced event handler
   */
  static debounce<T>(
    handler: StreamttyEventHandler<T>,
    delay: number
  ): StreamttyEventHandler<T> {
    let timeoutId: NodeJS.Timeout;

    return (data: T) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => handler(data), delay);
    };
  }

  /**
   * Create a throttled event handler
   */
  static throttle<T>(
    handler: StreamttyEventHandler<T>,
    delay: number
  ): StreamttyEventHandler<T> {
    let lastCall = 0;

    return (data: T) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        handler(data);
      }
    };
  }

  /**
   * Create a retry event handler
   */
  static retry<T>(
    handler: StreamttyEventHandler<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): StreamttyEventHandler<T> {
    return async (data: T) => {
      let attempts = 0;

      while (attempts < maxRetries) {
        try {
          await handler(data);
          return;
        } catch (error) {
          attempts++;
          if (attempts >= maxRetries) {
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempts - 1)));
        }
      }
    };
  }

  /**
   * Create a conditional event handler
   */
  static conditional<T>(
    condition: (data: T) => boolean,
    handler: StreamttyEventHandler<T>
  ): StreamttyEventHandler<T> {
    return (data: T) => {
      if (condition(data)) {
        handler(data);
      }
    };
  }

  /**
   * Create a chain of event handlers
   */
  static chain<T>(...handlers: StreamttyEventHandler<T>[]): StreamttyEventHandler<T> {
    return async (data: T) => {
      for (const handler of handlers) {
        await handler(data);
      }
    };
  }
}

/**
 * Global event bus instance
 */
export const globalEventBus = new StreamttyEventBus();

/**
 * Setup global error handling for events
 */
export function setupEventErrorHandling(): void {
  globalEventBus.on('error', (error: any) => {
    console.error('Streamtty Event Error:', error);
  });

  // Use EventEmitter's native on for wildcard since it has different signature
  (globalEventBus as any).on('*', (event: string, data: any) => {
    if (data?.error) {
      console.error(`Streamtty Event Error [${event}]:`, data.error);
    }
  });
}
