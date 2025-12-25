/**
 * Event Bus for TUI
 * Central event system for communication between TUI components
 */

export type EventHandler<T = any> = (data: T) => void | Promise<void>

export interface EventSubscription {
  unsubscribe(): void
}

export class EventBus {
  private events = new Map<string, Set<EventHandler>>()

  /**
   * Subscribe to an event
   */
  on<T>(event: string, handler: EventHandler<T>): EventSubscription {
    if (!this.events.has(event)) {
      this.events.set(event, new Set())
    }

    const handlers = this.events.get(event)!
    handlers.add(handler as EventHandler)

    return {
      unsubscribe: () => {
        handlers.delete(handler as EventHandler)
        if (handlers.size === 0) {
          this.events.delete(event)
        }
      },
    }
  }

  /**
   * Subscribe to an event once
   */
  once<T>(event: string, handler: EventHandler<T>): EventSubscription {
    const subscription = this.on(event, (data: T) => {
      handler(data)
      subscription.unsubscribe()
    })
    return subscription
  }

  /**
   * Emit an event
   */
  async emit<T>(event: string, data: T): Promise<void> {
    const handlers = this.events.get(event)
    if (!handlers) return

    const promises = Array.from(handlers).map((handler) => {
      try {
        return Promise.resolve(handler(data))
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error)
        return Promise.resolve()
      }
    })

    await Promise.all(promises)
  }

  /**
   * Remove all handlers for an event
   */
  off(event: string): void {
    this.events.delete(event)
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events.clear()
  }

  /**
   * Get all registered events
   */
  getEvents(): string[] {
    return Array.from(this.events.keys())
  }
}

// Global event bus instance
export const eventBus = new EventBus()
