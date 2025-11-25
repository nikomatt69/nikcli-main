'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { getDeviceInfo } from '@/lib/utils'

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true)
  const { isAuthenticated, setAuthenticated } = useStore()

  useEffect(() => {
    // Auto-login on mount
    const autoLogin = async () => {
      if (!isAuthenticated) {
        try {
          const deviceInfo = getDeviceInfo()
          const tokens = await apiClient.login(deviceInfo)
          setAuthenticated(true, tokens.userId, tokens.accessToken)
        } catch (error) {
          console.error('Auto-login failed:', error)
        }
      }
      setIsLoading(false)
    }

    autoLogin()
  }, [isAuthenticated, setAuthenticated])

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
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="safe-top border-b border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold text-primary">NikCLI Mobile</h1>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-muted-foreground">Connected</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <div className="text-6xl mb-4">🚀</div>
          <h2 className="text-3xl font-bold">Welcome to NikCLI Mobile</h2>
          <p className="text-muted-foreground text-lg">
            Your context-aware AI development assistant, now on mobile.
          </p>

          <div className="glass rounded-lg p-6 text-left space-y-3">
            <h3 className="font-semibold text-lg mb-3">Quick Start:</h3>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li>1. Start the workspace bridge on your dev machine</li>
              <li>2. Connect your workspace using the ID</li>
              <li>3. Start coding from anywhere! 💻</li>
            </ol>
          </div>

          <button
            className="w-full touch-target bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
            onClick={() => alert('Chat interface coming soon!')}
          >
            Get Started
          </button>

          <div className="text-xs text-muted-foreground">
            <p>Status: {isAuthenticated ? '✅ Authenticated' : '❌ Not authenticated'}</p>
            <p className="mt-1">Phase 2 - Frontend: In Progress 🚧</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="safe-bottom border-t border-border bg-card p-4 text-center text-sm text-muted-foreground">
        <p>NikCLI Mobile v1.0.0 - Phase 2 MVP</p>
      </footer>
    </div>
  )
}
