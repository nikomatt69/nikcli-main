// lib/store.ts
// Global state management with Zustand

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Message, AuthTokens, ApprovalRequest } from './api-client'

export interface ChatMessage extends Message {
  id: string
}

export interface ChatSession {
  id: string
  workspaceId?: string
  messages: ChatMessage[]
  createdAt: string
  lastActivity: string
}

export interface WorkspaceConnection {
  id: string
  name?: string
  path?: string
  connected: boolean
  lastConnected?: string
}

export interface AppState {
  // Authentication
  isAuthenticated: boolean
  userId: string | null
  accessToken: string | null

  // Current session
  currentSessionId: string | null
  sessions: Record<string, ChatSession>

  // Workspace
  currentWorkspaceId: string | null
  workspaces: WorkspaceConnection[]

  // WebSocket
  isWebSocketConnected: boolean

  // UI State
  isSidebarOpen: boolean
  isCommandPaletteOpen: boolean
  isApprovalPanelOpen: boolean

  // Pending operations
  pendingApprovals: ApprovalRequest[]
  offlineQueue: Array<{ type: string; data: any; timestamp: string }>

  // Actions - Auth
  setAuthenticated: (authenticated: boolean, userId?: string, token?: string) => void
  logout: () => void

  // Actions - Sessions
  setCurrentSession: (sessionId: string) => void
  createSession: (workspaceId?: string) => string
  addMessage: (sessionId: string, message: ChatMessage) => void
  updateSession: (sessionId: string, updates: Partial<ChatSession>) => void
  closeSession: (sessionId: string) => void

  // Actions - Workspace
  setCurrentWorkspace: (workspaceId: string | null) => void
  addWorkspace: (workspace: WorkspaceConnection) => void
  updateWorkspace: (workspaceId: string, updates: Partial<WorkspaceConnection>) => void
  removeWorkspace: (workspaceId: string) => void

  // Actions - WebSocket
  setWebSocketConnected: (connected: boolean) => void

  // Actions - UI
  toggleSidebar: () => void
  openCommandPalette: () => void
  closeCommandPalette: () => void
  openApprovalPanel: () => void
  closeApprovalPanel: () => void

  // Actions - Approvals
  addApproval: (approval: ApprovalRequest) => void
  removeApproval: (approvalId: string) => void

  // Actions - Offline
  addToOfflineQueue: (type: string, data: any) => void
  processOfflineQueue: () => Promise<void>
  clearOfflineQueue: () => void
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      userId: null,
      accessToken: null,

      currentSessionId: null,
      sessions: {},

      currentWorkspaceId: null,
      workspaces: [],

      isWebSocketConnected: false,

      isSidebarOpen: false,
      isCommandPaletteOpen: false,
      isApprovalPanelOpen: false,

      pendingApprovals: [],
      offlineQueue: [],

      // Auth actions
      setAuthenticated: (authenticated, userId, token) => {
        set({
          isAuthenticated: authenticated,
          userId: userId || null,
          accessToken: token || null,
        })
      },

      logout: () => {
        set({
          isAuthenticated: false,
          userId: null,
          accessToken: null,
          currentSessionId: null,
          sessions: {},
          currentWorkspaceId: null,
          pendingApprovals: [],
          offlineQueue: [],
        })
      },

      // Session actions
      setCurrentSession: (sessionId) => {
        set({ currentSessionId: sessionId })

        // Update last activity
        const sessions = get().sessions
        if (sessions[sessionId]) {
          set({
            sessions: {
              ...sessions,
              [sessionId]: {
                ...sessions[sessionId],
                lastActivity: new Date().toISOString(),
              },
            },
          })
        }
      },

      createSession: (workspaceId) => {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const now = new Date().toISOString()

        const newSession: ChatSession = {
          id: sessionId,
          workspaceId,
          messages: [],
          createdAt: now,
          lastActivity: now,
        }

        set({
          currentSessionId: sessionId,
          sessions: {
            ...get().sessions,
            [sessionId]: newSession,
          },
        })

        return sessionId
      },

      addMessage: (sessionId, message) => {
        const sessions = get().sessions
        const session = sessions[sessionId]

        if (!session) return

        set({
          sessions: {
            ...sessions,
            [sessionId]: {
              ...session,
              messages: [...session.messages, message],
              lastActivity: new Date().toISOString(),
            },
          },
        })
      },

      updateSession: (sessionId, updates) => {
        const sessions = get().sessions
        const session = sessions[sessionId]

        if (!session) return

        set({
          sessions: {
            ...sessions,
            [sessionId]: {
              ...session,
              ...updates,
              lastActivity: new Date().toISOString(),
            },
          },
        })
      },

      closeSession: (sessionId) => {
        const sessions = { ...get().sessions }
        delete sessions[sessionId]

        set({
          sessions,
          currentSessionId: get().currentSessionId === sessionId ? null : get().currentSessionId,
        })
      },

      // Workspace actions
      setCurrentWorkspace: (workspaceId) => {
        set({ currentWorkspaceId: workspaceId })
      },

      addWorkspace: (workspace) => {
        set({
          workspaces: [...get().workspaces, workspace],
        })
      },

      updateWorkspace: (workspaceId, updates) => {
        set({
          workspaces: get().workspaces.map((ws) =>
            ws.id === workspaceId ? { ...ws, ...updates } : ws
          ),
        })
      },

      removeWorkspace: (workspaceId) => {
        set({
          workspaces: get().workspaces.filter((ws) => ws.id !== workspaceId),
          currentWorkspaceId:
            get().currentWorkspaceId === workspaceId ? null : get().currentWorkspaceId,
        })
      },

      // WebSocket actions
      setWebSocketConnected: (connected) => {
        set({ isWebSocketConnected: connected })
      },

      // UI actions
      toggleSidebar: () => {
        set({ isSidebarOpen: !get().isSidebarOpen })
      },

      openCommandPalette: () => {
        set({ isCommandPaletteOpen: true })
      },

      closeCommandPalette: () => {
        set({ isCommandPaletteOpen: false })
      },

      openApprovalPanel: () => {
        set({ isApprovalPanelOpen: true })
      },

      closeApprovalPanel: () => {
        set({ isApprovalPanelOpen: false })
      },

      // Approval actions
      addApproval: (approval) => {
        set({
          pendingApprovals: [...get().pendingApprovals, approval],
          isApprovalPanelOpen: true,
        })
      },

      removeApproval: (approvalId) => {
        set({
          pendingApprovals: get().pendingApprovals.filter((a) => a.id !== approvalId),
        })

        // Close panel if no more approvals
        if (get().pendingApprovals.length === 0) {
          set({ isApprovalPanelOpen: false })
        }
      },

      // Offline queue actions
      addToOfflineQueue: (type, data) => {
        set({
          offlineQueue: [
            ...get().offlineQueue,
            {
              type,
              data,
              timestamp: new Date().toISOString(),
            },
          ],
        })
      },

      processOfflineQueue: async () => {
        const queue = get().offlineQueue

        if (queue.length === 0) return

        console.log('[Store] Processing offline queue:', queue.length, 'items')

        const { apiClient } = await import('./api-client')
        const errors: string[] = []

        for (const item of queue) {
          try {
            switch (item.type) {
              case 'message':
                await apiClient.sendMessage(
                  item.data.message,
                  item.data.sessionId,
                  item.data.options
                )
                break

              case 'command':
                await apiClient.executeCommand(
                  item.data.command,
                  item.data.sessionId,
                  item.data.options
                )
                break

              case 'approval':
                await apiClient.respondToApproval(
                  item.data.id,
                  item.data.approved,
                  item.data.reason
                )
                break

              default:
                console.warn(`[Store] Unknown queue item type: ${item.type}`)
            }
          } catch (error) {
            console.error(`[Store] Failed to process queue item:`, error)
            errors.push(`${item.type}: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }

        // Clear queue after processing
        set({ offlineQueue: [] })

        if (errors.length > 0) {
          console.error('[Store] Queue processing completed with errors:', errors)
        } else {
          console.log('[Store] Queue processing completed successfully')
        }
      },

      clearOfflineQueue: () => {
        set({ offlineQueue: [] })
      },
    }),
    {
      name: 'nikcli-mobile-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist these fields
        userId: state.userId,
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
        workspaces: state.workspaces,
        currentWorkspaceId: state.currentWorkspaceId,
      }),
    }
  )
)
