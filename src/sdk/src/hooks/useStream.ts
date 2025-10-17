/**
 * NikCLI SDK React Hooks - useStream
 * Hook for managing streaming in TTY applications
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  StreamEvent,
  StreamConfig,
  UseStreamReturn,
} from '../types'
import { getSDK } from '../core/sdk'

/**
 * useStream Hook
 * Manages streaming state and operations
 */
export function useStream(): UseStreamReturn {
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  const sdk = useRef(getSDK())
  const streamManager = sdk.current.getStreamManager()

  /**
   * Start streaming
   */
  const startStream = useCallback(async (config?: Partial<StreamConfig>): Promise<void> => {
    try {
      setError(null)
      
      if (config) {
        streamManager.updateConfig(config)
      }
      
      await streamManager.startStream()
      setIsStreaming(true)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start stream')
      setError(error)
      throw error
    }
  }, [streamManager])

  /**
   * Stop streaming
   */
  const stopStream = useCallback((): void => {
    try {
      streamManager.stopStream()
      setIsStreaming(false)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to stop stream')
      setError(error)
    }
  }, [streamManager])

  /**
   * Send a message
   */
  const sendMessage = useCallback(async (message: string): Promise<void> => {
    try {
      setError(null)
      await streamManager.sendMessage(message)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to send message')
      setError(error)
      throw error
    }
  }, [streamManager])

  /**
   * Clear events
   */
  const clearEvents = useCallback((): void => {
    streamManager.clearEvents()
    setEvents([])
  }, [streamManager])

  // Load events on mount
  useEffect(() => {
    const loadEvents = () => {
      const currentEvents = streamManager.getEvents()
      setEvents(currentEvents)
    }

    loadEvents()
  }, [streamManager])

  // Setup event listeners
  useEffect(() => {
    const handleStreamEvent = (event: StreamEvent) => {
      setEvents(prev => [...prev, event])
    }

    const handleBufferFlush = (newEvents: StreamEvent[]) => {
      setEvents(prev => [...prev, ...newEvents])
    }

    const handleEventsCleared = () => {
      setEvents([])
    }

    streamManager.addEventListener('streamEvent', handleStreamEvent)
    streamManager.addEventListener('bufferFlush', handleBufferFlush)
    streamManager.addEventListener('eventsCleared', handleEventsCleared)

    return () => {
      streamManager.removeEventListener('streamEvent', handleStreamEvent)
      streamManager.removeEventListener('bufferFlush', handleBufferFlush)
      streamManager.removeEventListener('eventsCleared', handleEventsCleared)
    }
  }, [streamManager])

  return {
    events,
    isStreaming,
    startStream,
    stopStream,
    sendMessage,
    clearEvents,
    error,
  }
}

/**
 * useStreamEvents Hook
 * Manages stream events with filtering
 */
export function useStreamEvents(options: {
  types?: string[]
  agentId?: string
  limit?: number
} = {}) {
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  const sdk = useRef(getSDK())
  const streamManager = sdk.current.getStreamManager()

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      let allEvents = streamManager.getEvents()
      
      // Filter by type
      if (options.types && options.types.length > 0) {
        allEvents = allEvents.filter(event => options.types!.includes(event.type))
      }
      
      // Filter by agent
      if (options.agentId) {
        allEvents = allEvents.filter(event => event.agentId === options.agentId)
      }
      
      // Limit results
      if (options.limit) {
        allEvents = allEvents.slice(-options.limit)
      }
      
      setEvents(allEvents)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load events'))
    } finally {
      setLoading(false)
    }
  }, [streamManager, options.types, options.agentId, options.limit])

  const refresh = useCallback(async () => {
    await loadEvents()
  }, [loadEvents])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  return {
    events,
    loading,
    error,
    refresh,
  }
}

/**
 * useStreamStats Hook
 * Manages stream statistics
 */
export function useStreamStats() {
  const [stats, setStats] = useState({
    isStreaming: false,
    totalEvents: 0,
    bufferSize: 0,
    duration: 0,
    eventsByType: {} as Record<string, number>,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  const sdk = useRef(getSDK())
  const streamManager = sdk.current.getStreamManager()

  const loadStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const streamStats = streamManager.getStats()
      setStats(streamStats)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load stats'))
    } finally {
      setLoading(false)
    }
  }, [streamManager])

  const refresh = useCallback(async () => {
    await loadStats()
  }, [loadStats])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  return {
    stats,
    loading,
    error,
    refresh,
  }
}

/**
 * useStreamConfig Hook
 * Manages stream configuration
 */
export function useStreamConfig() {
  const [config, setConfig] = useState<StreamConfig>({
    enableRealTimeUpdates: true,
    tokenTrackingEnabled: true,
    maxStreamDuration: 300000,
    bufferSize: 1000,
    enableBackgroundAgents: true,
    enableProgressTracking: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  const sdk = useRef(getSDK())
  const streamManager = sdk.current.getStreamManager()

  const updateConfig = useCallback(async (newConfig: Partial<StreamConfig>): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      
      const updatedConfig = { ...config, ...newConfig }
      streamManager.updateConfig(updatedConfig)
      setConfig(updatedConfig)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update config')
      setError(error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [config, streamManager])

  return {
    config,
    updateConfig,
    loading,
    error,
  }
}
