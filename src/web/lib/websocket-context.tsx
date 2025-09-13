'use client'

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import type { WebBackgroundJob, WebSocketMessage } from '../types'

interface WebSocketContextType {
  connected: boolean
  jobs: Map<string, WebBackgroundJob>
  subscribe: (event: string, callback: (data: any) => void) => () => void
  unsubscribe: (event: string, callback: (data: any) => void) => void
  sendMessage: (message: any) => void
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [jobs, setJobs] = useState<Map<string, WebBackgroundJob>>(new Map())
  const [subscribers, setSubscribers] = useState<Map<string, Set<(data: any) => void>>>(new Map())

  const connect = useCallback(() => {
    try {
      // Connect to the Express WebSocket endpoint
      const wsUrl =
        process.env.NODE_ENV === 'production' ? `wss://${window.location.host}/ws` : 'ws://localhost:3000/ws'

      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('WebSocket connected to Background Agents server')
        setConnected(true)
      }

      ws.onclose = () => {
        console.log('WebSocket disconnected from Background Agents server')
        setConnected(false)
        // Reconnect after 3 seconds
        setTimeout(connect, 3000)
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setConnected(false)
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          handleWebSocketMessage(message)
        } catch (err) {
          console.error('Error parsing WebSocket message:', err)
        }
      }

      setSocket(ws)
    } catch (error) {
      console.error('Error connecting to WebSocket:', error)
    }
  }, [])

  const handleWebSocketMessage = (message: WebSocketMessage) => {
    const { type, data } = message

    // Update jobs map based on message type
    switch (type) {
      case 'job:created':
      case 'job:started':
      case 'job:completed':
      case 'job:failed':
        setJobs((prev) => {
          const newJobs = new Map(prev)
          newJobs.set(data.id, {
            ...data,
            webCreatedAt: new Date(data.createdAt),
            userInitiated: true,
            webLogs: [],
          })
          return newJobs
        })
        break

      case 'job:log':
        if (data.jobId) {
          setJobs((prev) => {
            const newJobs = new Map(prev)
            const job = newJobs.get(data.jobId)
            if (job) {
              job.webLogs = [
                ...(job.webLogs || []),
                {
                  id: `${data.jobId}-${Date.now()}`,
                  jobId: data.jobId,
                  timestamp: new Date(),
                  ...data.logEntry,
                },
              ]
              newJobs.set(data.jobId, job)
            }
            return newJobs
          })
        }
        break
    }

    // Notify subscribers
    const eventSubscribers = subscribers.get(type)
    if (eventSubscribers) {
      eventSubscribers.forEach((callback) => {
        try {
          callback(data)
        } catch (err) {
          console.error('Error in WebSocket subscriber:', err)
        }
      })
    }
  }

  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    setSubscribers((prev) => {
      const newSubscribers = new Map(prev)
      if (!newSubscribers.has(event)) {
        newSubscribers.set(event, new Set())
      }
      newSubscribers.get(event)!.add(callback)
      return newSubscribers
    })

    // Return unsubscribe function
    return () => {
      setSubscribers((prev) => {
        const newSubscribers = new Map(prev)
        const eventSubscribers = newSubscribers.get(event)
        if (eventSubscribers) {
          eventSubscribers.delete(callback)
          if (eventSubscribers.size === 0) {
            newSubscribers.delete(event)
          }
        }
        return newSubscribers
      })
    }
  }, [])

  const unsubscribe = useCallback((event: string, callback: (data: any) => void) => {
    setSubscribers((prev) => {
      const newSubscribers = new Map(prev)
      const eventSubscribers = newSubscribers.get(event)
      if (eventSubscribers) {
        eventSubscribers.delete(callback)
        if (eventSubscribers.size === 0) {
          newSubscribers.delete(event)
        }
      }
      return newSubscribers
    })
  }, [])

  const sendMessage = useCallback(
    (message: any) => {
      if (socket && connected) {
        socket.send(JSON.stringify(message))
      }
    },
    [socket, connected]
  )

  useEffect(() => {
    connect()

    return () => {
      if (socket) {
        socket.close()
      }
    }
  }, [connect])

  return (
    <WebSocketContext.Provider
      value={{
        connected,
        jobs,
        subscribe,
        unsubscribe,
        sendMessage,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocket() {
  const context = useContext(WebSocketContext)
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}
