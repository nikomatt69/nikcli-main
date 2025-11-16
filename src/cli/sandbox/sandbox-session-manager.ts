/**
 * Sandbox Session Manager
 * Tracks active sandbox sessions and manages lifecycle
 */

import { nanoid } from 'nanoid'
import { advancedUI } from '../ui/advanced-cli-ui'

export interface SandboxSession {
  id: string
  command: string
  startTime: Date
  status: 'running' | 'completed' | 'failed' | 'killed'
  exitCode?: number
  duration?: number
}

export class SandboxSessionManager {
  private sessions: Map<string, SandboxSession> = new Map()
  private history: SandboxSession[] = []
  private readonly maxHistory = 100

  /**
   * Create new sandbox session
   */
  createSession(command: string): SandboxSession {
    const session: SandboxSession = {
      id: nanoid(),
      command,
      startTime: new Date(),
      status: 'running',
    }

    this.sessions.set(session.id, session)
    return session
  }

  /**
   * Update session status
   */
  updateSession(sessionId: string, updates: Partial<SandboxSession>): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      const updated = { ...session, ...updates }
      this.sessions.set(sessionId, updated)

      // Move to history when completed
      if (updates.status && updates.status !== 'running') {
        this.sessions.delete(sessionId)
        this.history.push(updated)

        // Keep history size manageable
        if (this.history.length > this.maxHistory) {
          this.history.shift()
        }
      }
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): SandboxSession[] {
    return Array.from(this.sessions.values())
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SandboxSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * List all sessions (active + history)
   */
  listAllSessions(): SandboxSession[] {
    return [...Array.from(this.sessions.values()), ...this.history]
  }

  /**
   * Clear all sessions
   */
  clearAll(): void {
    const count = this.sessions.size + this.history.length
    this.sessions.clear()
    this.history = []
    advancedUI.logInfo(`🧹 Cleared ${count} sandbox sessions`)
  }

  /**
   * Get session statistics
   */
  getStats(): {
    active: number
    completed: number
    failed: number
    killed: number
    averageDuration: number
  } {
    const allSessions = this.listAllSessions()
    const completed = allSessions.filter((s) => s.status === 'completed')
    const failed = allSessions.filter((s) => s.status === 'failed')
    const killed = allSessions.filter((s) => s.status === 'killed')

    const durations = allSessions.filter((s) => s.duration).map((s) => s.duration || 0)
    const averageDuration = durations.length > 0 ? durations.reduce((a, b) => a + b) / durations.length : 0

    return {
      active: this.sessions.size,
      completed: completed.length,
      failed: failed.length,
      killed: killed.length,
      averageDuration,
    }
  }
}

// Singleton instance
let managerInstance: SandboxSessionManager | null = null

export function getSandboxSessionManager(): SandboxSessionManager {
  if (!managerInstance) {
    managerInstance = new SandboxSessionManager()
  }
  return managerInstance
}

export const sandboxSessionManager = getSandboxSessionManager()
