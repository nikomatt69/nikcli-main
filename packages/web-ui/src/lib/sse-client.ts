import { SSEEvent } from '@/types/api'

type EventHandler<T = unknown> = (event: SSEEvent<T>) => void
type ErrorHandler = (error: Error) => void

/**
 * Server-Sent Events Client for log streaming
 */
export class SSEClient {
  private eventSource: EventSource | null = null
  private url: string
  private eventHandlers: Set<EventHandler> = new Set()
  private errorHandlers: Set<ErrorHandler> = new Set()

  constructor(url: string) {
    this.url = url
  }

  /**
   * Connect to SSE endpoint
   */
  connect(): void {
    if (this.eventSource) {
      console.warn('[SSE] Already connected')
      return
    }

    try {
      this.eventSource = new EventSource(this.url)

      this.eventSource.onmessage = (event) => {
        try {
          const data: SSEEvent = JSON.parse(event.data)
          this.eventHandlers.forEach(handler => handler(data))
        } catch (error) {
          console.error('[SSE] Failed to parse event:', error)
        }
      }

      this.eventSource.onerror = (error) => {
        console.error('[SSE] Error:', error)
        const errorObj = new Error('SSE connection error')
        this.errorHandlers.forEach(handler => handler(errorObj))
        this.disconnect()
      }

      this.eventSource.onopen = () => {
        console.log('[SSE] Connected to', this.url)
      }
    } catch (error) {
      console.error('[SSE] Failed to connect:', error)
      this.errorHandlers.forEach(handler =>
        handler(error instanceof Error ? error : new Error(String(error)))
      )
    }
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
      console.log('[SSE] Disconnected')
    }
  }

  /**
   * Subscribe to all events
   */
  onEvent<T = unknown>(handler: EventHandler<T>): () => void {
    this.eventHandlers.add(handler as EventHandler)
    return () => this.eventHandlers.delete(handler as EventHandler)
  }

  /**
   * Subscribe to specific event type
   */
  onEventType<T = unknown>(type: string, handler: (data: T) => void): () => void {
    const wrappedHandler: EventHandler<T> = (event) => {
      if (event.type === type) {
        handler(event.data)
      }
    }

    this.eventHandlers.add(wrappedHandler as EventHandler)
    return () => this.eventHandlers.delete(wrappedHandler as EventHandler)
  }

  /**
   * Subscribe to errors
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler)
    return () => this.errorHandlers.delete(handler)
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN
  }
}

/**
 * Create SSE client for job logs
 */
export function createJobLogStream(jobId: string): SSEClient {
  const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
  return new SSEClient(`${baseURL}/v1/jobs/${jobId}/stream`)
}

export default SSEClient
