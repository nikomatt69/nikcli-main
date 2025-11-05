/**
 * useSSEStream Hook
 * Subscribe to Server-Sent Events for real-time chat updates
 */

import { useEffect, useRef, useState } from 'react'
import type { SSEEvent, SSEEventType } from '@/types/chat'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface UseSSEStreamOptions {
  sessionId: string
  onEvent?: (event: SSEEvent) => void
  onTextDelta?: (delta: string, accumulated: string) => void
  onTextComplete?: (message: any) => void
  onToolApprovalRequired?: (approval: any) => void
  onToolResult?: (result: any) => void
  onFileChange?: (change: any) => void
  onStatusUpdate?: (status: any) => void
  onError?: (error: any) => void
  onSessionComplete?: () => void
  enabled?: boolean
}

export function useSSEStream(options: UseSSEStreamOptions) {
  const {
    sessionId,
    onEvent,
    onTextDelta,
    onTextComplete,
    onToolApprovalRequired,
    onToolResult,
    onFileChange,
    onStatusUpdate,
    onError,
    onSessionComplete,
    enabled = true,
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled || !sessionId) {
      return
    }

    let mounted = true
    const streamUrl = `${API_URL}/v1/chat/sessions/${sessionId}/stream`

    console.log('[SSE] Connecting to:', streamUrl)

    const eventSource = new EventSource(streamUrl)
    eventSourceRef.current = eventSource

    // Connection established
    eventSource.addEventListener('connection:established', (e: MessageEvent) => {
      if (!mounted) return
      console.log('[SSE] Connection established')
      setIsConnected(true)
      setError(null)

      const event: SSEEvent = JSON.parse(e.data)
      onEvent?.(event)
    })

    // Text delta (streaming)
    eventSource.addEventListener('text:delta', (e: MessageEvent) => {
      if (!mounted) return
      const event: SSEEvent = JSON.parse(e.data)
      onEvent?.(event)

      if (onTextDelta && event.data) {
        const { delta, accumulated } = event.data as { delta: string; accumulated: string }
        onTextDelta(delta, accumulated)
      }
    })

    // Text complete
    eventSource.addEventListener('text:complete', (e: MessageEvent) => {
      if (!mounted) return
      const event: SSEEvent = JSON.parse(e.data)
      onEvent?.(event)
      onTextComplete?.(event.data)
    })

    // Tool approval required
    eventSource.addEventListener('tool:approval_required', (e: MessageEvent) => {
      if (!mounted) return
      const event: SSEEvent = JSON.parse(e.data)
      onEvent?.(event)
      onToolApprovalRequired?.(event.data)
    })

    // Tool result
    eventSource.addEventListener('tool:result', (e: MessageEvent) => {
      if (!mounted) return
      const event: SSEEvent = JSON.parse(e.data)
      onEvent?.(event)
      onToolResult?.(event.data)
    })

    // File change
    eventSource.addEventListener('file:change', (e: MessageEvent) => {
      if (!mounted) return
      const event: SSEEvent = JSON.parse(e.data)
      onEvent?.(event)
      onFileChange?.(event.data)
    })

    // Status update
    eventSource.addEventListener('status:update', (e: MessageEvent) => {
      if (!mounted) return
      const event: SSEEvent = JSON.parse(e.data)
      onEvent?.(event)

      // Ignore heartbeats
      if (event.data && (event.data as any).heartbeat) {
        return
      }

      onStatusUpdate?.(event.data)
    })

    // Error
    eventSource.addEventListener('error', (e: MessageEvent) => {
      if (!mounted) return
      const event: SSEEvent = JSON.parse(e.data)
      onEvent?.(event)
      onError?.(event.data)
    })

    // Session complete
    eventSource.addEventListener('session:complete', (e: MessageEvent) => {
      if (!mounted) return
      const event: SSEEvent = JSON.parse(e.data)
      onEvent?.(event)
      onSessionComplete?.()
    })

    // EventSource error handler
    eventSource.onerror = (err) => {
      if (!mounted) return
      console.error('[SSE] Connection error:', err)
      setIsConnected(false)
      setError(new Error('SSE connection failed'))

      // EventSource will auto-reconnect
    }

    // Cleanup
    return () => {
      mounted = false
      console.log('[SSE] Closing connection')
      eventSource.close()
      eventSourceRef.current = null
    }
  }, [
    sessionId,
    enabled,
    onEvent,
    onTextDelta,
    onTextComplete,
    onToolApprovalRequired,
    onToolResult,
    onFileChange,
    onStatusUpdate,
    onError,
    onSessionComplete,
  ])

  return {
    isConnected,
    error,
    close: () => {
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      setIsConnected(false)
    },
  }
}
