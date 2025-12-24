/**
 * NikCLI Mobile - Connection Store
 * Manages WebSocket/API connection state
 */

import { create } from 'zustand'
import type { ConnectionStatus, ConnectionState, StatusResponse } from '@/types'

interface ConnectionStoreState {
  // Connection state
  connection: ConnectionState
  
  // Server status
  serverStatus: StatusResponse | null
  
  // Config
  endpoint: string
  autoReconnect: boolean
  reconnectInterval: number
  
  // Actions
  setStatus: (status: ConnectionStatus) => void
  setEndpoint: (endpoint: string) => void
  setError: (error: string | undefined) => void
  incrementRetry: () => void
  resetRetry: () => void
  
  // Server status actions
  setServerStatus: (status: StatusResponse | null) => void
  
  // Config actions
  setAutoReconnect: (enabled: boolean) => void
  setReconnectInterval: (ms: number) => void
}

const DEFAULT_ENDPOINT = 'ws://localhost:3001'
const DEFAULT_RECONNECT_INTERVAL = 5000

export const useConnectionStore = create<ConnectionStoreState>((set, get) => ({
  // Initial state
  connection: {
    status: 'disconnected',
    endpoint: DEFAULT_ENDPOINT,
    retryCount: 0,
  },
  serverStatus: null,
  endpoint: DEFAULT_ENDPOINT,
  autoReconnect: true,
  reconnectInterval: DEFAULT_RECONNECT_INTERVAL,
  
  // Connection actions
  setStatus: (status) => {
    set((state) => ({
      connection: {
        ...state.connection,
        status,
        lastConnected: status === 'connected' ? new Date() : state.connection.lastConnected,
      },
    }))
  },
  
  setEndpoint: (endpoint) => {
    set((state) => ({
      endpoint,
      connection: {
        ...state.connection,
        endpoint,
      },
    }))
  },
  
  setError: (error) => {
    set((state) => ({
      connection: {
        ...state.connection,
        error,
        status: error ? 'error' : state.connection.status,
      },
    }))
  },
  
  incrementRetry: () => {
    set((state) => ({
      connection: {
        ...state.connection,
        retryCount: state.connection.retryCount + 1,
      },
    }))
  },
  
  resetRetry: () => {
    set((state) => ({
      connection: {
        ...state.connection,
        retryCount: 0,
      },
    }))
  },
  
  // Server status actions
  setServerStatus: (status) => {
    set({ serverStatus: status })
  },
  
  // Config actions
  setAutoReconnect: (enabled) => {
    set({ autoReconnect: enabled })
  },
  
  setReconnectInterval: (ms) => {
    set({ reconnectInterval: ms })
  },
}))

// Selectors
export const selectConnectionStatus = (state: ConnectionStoreState) => 
  state.connection.status

export const selectIsConnected = (state: ConnectionStoreState) => 
  state.connection.status === 'connected'

export const selectEndpoint = (state: ConnectionStoreState) => state.endpoint

export const selectServerStatus = (state: ConnectionStoreState) => state.serverStatus

export const selectRetryCount = (state: ConnectionStoreState) => 
  state.connection.retryCount
