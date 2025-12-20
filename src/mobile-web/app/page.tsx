'use client'

import { useEffect, useState } from 'react'
import { Menu, Wifi, WifiOff } from 'lucide-react'
import { useStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { wsClient } from '@/lib/websocket-client'
import { getDeviceInfo } from '@/lib/utils'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { CommandPalette } from '@/components/chat/CommandPalette'
import { ApprovalPanel } from '@/components/chat/ApprovalPanel'

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true)
  const {
    isAuthenticated,
    setAuthenticated,
    currentSessionId,
    createSession,
    isWebSocketConnected,
    setWebSocketConnected,
    toggleSidebar,
  } = useStore()

  useEffect(() => {
    const initialize = async () => {
      try {
        // Auto-login
        if (!isAuthenticated) {
          const deviceInfo = getDeviceInfo()
          const tokens = await apiClient.login(deviceInfo)
          setAuthenticated(true, tokens.userId, tokens.accessToken)
        }

        // Connect WebSocket
        await wsClient.connect()
        setWebSocketConnected(true)

        // WebSocket event listeners
        wsClient.on('connected', () => {
          console.log('[App] WebSocket connected')
          setWebSocketConnected(true)
        })

        wsClient.on('disconnected', () => {
          console.log('[App] WebSocket disconnected')
          setWebSocketConnected(false)
        })

        wsClient.on('reconnecting', (attempt: number) => {
          console.log(`[App] WebSocket reconnecting (attempt ${attempt})`)
        })

        // Create initial session if none exists
        if (!currentSessionId) {
          createSession()
        }
      } catch (error) {
        console.error('Initialization failed:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initialize()

    // Cleanup
    return () => {
      wsClient.removeAllListeners()
    }
  }, [])

  const handleCommandSelect = (command: string) => {
    // Command will be sent via ChatInterface
    console.log('[App] Command selected:', command)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="spinner w-12 h-12 border-4 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading NikCLI...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="safe-top border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="rounded-lg p-2 hover:bg-accent"
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold text-primary">NikCLI Mobile</h1>
          </div>

          <div className="flex items-center gap-2">
            {isWebSocketConnected ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Connected
                </span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-red-500" />
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Offline
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Chat Interface */}
      <main className="flex-1 overflow-hidden">
        <ChatInterface />
      </main>

      {/* Command Palette */}
      <CommandPalette onSelectCommand={handleCommandSelect} />

      {/* Approval Panel */}
      <ApprovalPanel />
    </div>
  )
}
