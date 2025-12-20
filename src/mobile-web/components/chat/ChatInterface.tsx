'use client'

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { wsClient } from '@/lib/websocket-client'
import { MessageBubble } from './MessageBubble'
import { CommandInput } from './CommandInput'
import { Loader2 } from 'lucide-react'

export function ChatInterface() {
  const {
    currentSessionId,
    sessions,
    addMessage,
    createSession,
    currentWorkspaceId,
  } = useStore()

  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const currentSession = currentSessionId ? sessions[currentSessionId] : null

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentSession?.messages, streamingContent])

  // Setup WebSocket
  useEffect(() => {
    if (!currentSessionId) return

    // Connect if not connected
    if (!wsClient.isConnected()) {
      wsClient.connect().catch(console.error)
    }

    // Subscribe to session
    wsClient.subscribe(currentSessionId)

    // Listen for messages
    const handleMessage = (message: any, sessionId: string) => {
      if (sessionId === currentSessionId) {
        addMessage(sessionId, {
          id: `msg_${Date.now()}`,
          type: message.type,
          content: message.content,
          timestamp: message.timestamp,
          metadata: message.metadata,
        })
      }
    }

    const handleStream = (data: any, sessionId: string) => {
      if (sessionId === currentSessionId) {
        setStreamingContent((prev) => prev + data.chunk)
      }
    }

    wsClient.on('message', handleMessage)
    wsClient.on('stream', handleStream)

    return () => {
      wsClient.removeListener('message', handleMessage)
      wsClient.removeListener('stream', handleStream)
      wsClient.unsubscribe(currentSessionId)
    }
  }, [currentSessionId, addMessage])

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return

    let sessionId = currentSessionId
    if (!sessionId) {
      sessionId = createSession(currentWorkspaceId || undefined)
    }

    // Add user message immediately
    addMessage(sessionId, {
      id: `msg_${Date.now()}`,
      type: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    })

    setIsLoading(true)
    setStreamingContent('')

    try {
      const isCommand = message.startsWith('/')

      if (isCommand) {
        await apiClient.executeCommand(message, sessionId, {
          workspaceId: currentWorkspaceId || undefined,
        })
      } else {
        await apiClient.sendMessage(message, sessionId, {
          workspaceId: currentWorkspaceId || undefined,
          streaming: false,
        })
      }
    } catch (error) {
      console.error('Send message error:', error)
      addMessage(sessionId, {
        id: `msg_${Date.now()}`,
        type: 'error',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      })
    } finally {
      setIsLoading(false)
      setStreamingContent('')
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {currentSession?.messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="text-6xl mb-4">💬</div>
            <h2 className="text-xl font-semibold mb-2">Start a conversation</h2>
            <p className="text-muted-foreground text-sm max-w-sm">
              Ask me anything or use slash commands like /help, /agents, /tools
            </p>
          </div>
        )}

        {currentSession?.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Streaming indicator */}
        {isLoading && !streamingContent && (
          <div className="flex gap-3 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}

        {/* Streaming content */}
        {streamingContent && (
          <div className="flex gap-3 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
            <div className="message-bubble message-bubble-assistant">
              <p className="whitespace-pre-wrap break-words">{streamingContent}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <CommandInput onSend={handleSendMessage} disabled={isLoading} />
    </div>
  )
}
