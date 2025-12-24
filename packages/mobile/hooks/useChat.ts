/**
 * NikCLI Mobile - useChat Hook
 * Production-ready hook for chat interactions with nikcli backend
 */

import { useCallback, useEffect, useRef } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useAgentStore } from '@/stores/agentStore'
import { useLogStore } from '@/stores/logStore'
import { useConnectionStore } from '@/stores/connectionStore'
import type { ChatMessage, StreamChunk, MobileWebSocketMessage } from '@/types'

const DEFAULT_WS_ENDPOINT = 'ws://bg.nikcli.store/ws/mobile'
const DEFAULT_API_ENDPOINT = 'http://localhost:3001/api/v1/mobile'

export function useChat() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const retryCountRef = useRef(0)
  const maxRetries = 10
  const reconnectDelay = 5000

  // Stores
  const {
    messages,
    isProcessing,
    context,
    inputText,
    addMessage,
    updateMessage,
    appendToMessage,
    clearMessages,
    setInputText,
    setProcessing,
    setContext,
    togglePlanMode,
    toggleAutoAccept,
    toggleVmMode,
  } = useChatStore()

  const { addAgent, updateAgent, removeAgent } = useAgentStore()
  const { addLog } = useLogStore()
  const { 
    connection, 
    endpoint,
    autoReconnect,
    setStatus, 
    setError, 
    incrementRetry, 
    resetRetry,
    setServerStatus,
  } = useConnectionStore()

  // WebSocket message handler
  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
      const message: MobileWebSocketMessage = JSON.parse(event.data)
      
      switch (message.type) {
        case 'connection:established':
          setStatus('connected')
          resetRetry()
          if (message.data.status) {
            setServerStatus(message.data.status)
            setContext({
              workingDirectory: message.data.status.workingDirectory,
              planMode: message.data.status.mode?.plan || false,
              autoAcceptEdits: message.data.status.mode?.autoAccept || true,
              vmMode: message.data.status.mode?.vm || false,
              contextLeft: message.data.status.contextLeft || 100,
            })
          }
          addMessage({
            type: 'system',
            content: '🔗 Connected to NikCLI backend',
            status: 'completed',
          })
          break

        case 'message:user':
        case 'message:system':
        case 'message:agent':
        case 'message:tool':
        case 'message:error':
        case 'message:vm':
        case 'message:diff':
          const msgType = message.type.replace('message:', '') as ChatMessage['type']
          addMessage({
            type: msgType,
            content: message.data.content,
            status: message.data.status || 'completed',
            metadata: message.data.metadata,
          })
          break

        case 'stream:chunk':
          // Find last streaming message or create new one
          const lastMsg = messages[messages.length - 1]
          if (lastMsg?.status === 'streaming') {
            appendToMessage(lastMsg.id, message.data.content)
          } else {
            addMessage({
              type: 'agent',
              content: message.data.content,
              status: 'streaming',
              metadata: { isStreaming: true, chunkLength: message.data.content.length },
            })
          }
          break

        case 'stream:complete':
          const streamingMsg = messages.find(m => m.status === 'streaming')
          if (streamingMsg) {
            updateMessage(streamingMsg.id, { status: 'completed' })
          }
          break

        case 'agent:started':
          addAgent({
            id: message.data.agentId,
            type: message.data.agentType,
            status: 'running',
            task: message.data.task,
          })
          addLog({
            level: 'info',
            message: `Agent ${message.data.agentType} started`,
            source: 'agents',
          })
          break

        case 'agent:progress':
          updateAgent(message.data.agentId, {
            progress: message.data.progress,
          })
          break

        case 'agent:completed':
          updateAgent(message.data.agentId, {
            status: 'completed',
            completedAt: new Date(),
          })
          addLog({
            level: 'success',
            message: `Agent ${message.data.agentType} completed`,
            source: 'agents',
          })
          break

        case 'agent:failed':
          updateAgent(message.data.agentId, {
            status: 'error',
            error: message.data.error,
          })
          addLog({
            level: 'error',
            message: `Agent ${message.data.agentType} failed: ${message.data.error}`,
            source: 'agents',
          })
          break

        case 'diff:created':
          addLog({
            level: 'info',
            message: `New diff created: ${message.data.filePath}`,
            source: 'diffs',
          })
          break

        case 'status:update':
          if (message.data.status) {
            setServerStatus(message.data.status)
          }
          break

        case 'heartbeat':
          // Update connection status
          if (message.data.status) {
            setServerStatus(message.data.status)
          }
          break

        case 'error':
          addMessage({
            type: 'error',
            content: message.data.error || 'Unknown error',
            status: 'completed',
          })
          addLog({
            level: 'error',
            message: message.data.error || 'Unknown error',
            source: 'websocket',
          })
          break
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error)
      addLog({
        level: 'error',
        message: `WebSocket message parse error: ${error}`,
        source: 'websocket',
      })
    }
  }, [messages, addMessage, appendToMessage, updateMessage, addAgent, updateAgent, addLog, setStatus, resetRetry, setServerStatus, setContext])

  // Connect to WebSocket
  const connect = useCallback((customEndpoint?: string) => {
    const wsEndpoint = customEndpoint || endpoint || DEFAULT_WS_ENDPOINT
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    setStatus('connecting')

    try {
      wsRef.current = new WebSocket(wsEndpoint)

      wsRef.current.onopen = () => {
        console.log('WebSocket connected')
        retryCountRef.current = 0
      }

      wsRef.current.onmessage = handleWebSocketMessage

      wsRef.current.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason)
        setStatus('disconnected')
        
        // Auto reconnect if enabled
        if (autoReconnect && retryCountRef.current < maxRetries) {
          reconnectTimeoutRef.current = setTimeout(() => {
            retryCountRef.current++
            incrementRetry()
            connect(wsEndpoint)
          }, reconnectDelay)
        }
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        setError('WebSocket connection failed')
        setStatus('error')
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      setError(error instanceof Error ? error.message : 'Unknown error')
      setStatus('error')
    }
  }, [endpoint, autoReconnect, handleWebSocketMessage, setStatus, setError, incrementRetry])

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect')
      wsRef.current = null
    }

    setStatus('disconnected')
  }, [setStatus])

  // Send message through WebSocket
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addMessage({
        type: 'error',
        content: '❌ Not connected to server. Please wait for connection.',
        status: 'completed',
      })
      return
    }

    setProcessing(true)

    try {
      wsRef.current.send(JSON.stringify({
        type: 'send_message',
        payload: { content: content.trim() },
      }))

      addLog({
        level: 'info',
        message: `Sent: ${content.slice(0, 50)}${content.length > 50 ? '...' : ''}`,
        source: 'chat',
      })
    } catch (error) {
      addMessage({
        type: 'error',
        content: `❌ Failed to send message: ${error}`,
        status: 'completed',
      })
      addLog({
        level: 'error',
        message: `Send error: ${error}`,
        source: 'chat',
      })
    } finally {
      setProcessing(false)
      setInputText('')
    }
  }, [addMessage, addLog, setProcessing, setInputText])

  // Launch agent through WebSocket
  const launchAgent = useCallback(async (agentName: string, task: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addMessage({
        type: 'error',
        content: '❌ Not connected to server',
        status: 'completed',
      })
      return
    }

    try {
      wsRef.current.send(JSON.stringify({
        type: 'launch_agent',
        payload: { agentName, task },
      }))
    } catch (error) {
      addMessage({
        type: 'error',
        content: `❌ Failed to launch agent: ${error}`,
        status: 'completed',
      })
    }
  }, [addMessage])

  // Stop agent through WebSocket
  const stopAgent = useCallback(async (agentId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return
    }

    try {
      wsRef.current.send(JSON.stringify({
        type: 'stop_agent',
        payload: { agentId },
      }))
    } catch (error) {
      console.error('Failed to stop agent:', error)
    }
  }, [])

  // Send command through WebSocket
  const sendCommand = useCallback(async (command: string, args: string[] = []) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return
    }

    try {
      wsRef.current.send(JSON.stringify({
        type: 'command',
        payload: { command, args },
      }))
    } catch (error) {
      console.error('Failed to send command:', error)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    // State
    messages,
    isProcessing,
    context,
    inputText,
    connectionStatus: connection.status,
    isConnected: connection.status === 'connected',

    // Actions
    sendMessage,
    setInputText,
    clearMessages,

    // Mode toggles
    togglePlanMode,
    toggleAutoAccept,
    toggleVmMode,

    // Connection
    connect,
    disconnect,

    // Agents
    launchAgent,
    stopAgent,

    // Commands
    sendCommand,
  }
}
