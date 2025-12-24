/**
 * NikCLI Mobile - Log Store
 * Manages log entries for debugging and monitoring
 */

import { create } from 'zustand'
import type { LogEntry, LogLevel } from '@/types'

interface LogState {
  // Log entries
  logs: LogEntry[]
  
  // Filters
  levelFilter: LogLevel | 'all'
  sourceFilter: string | null
  searchQuery: string
  
  // Panel state
  isExpanded: boolean
  maxVisibleLogs: number
  
  // Actions
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void
  clearLogs: () => void
  
  // Filter actions
  setLevelFilter: (level: LogLevel | 'all') => void
  setSourceFilter: (source: string | null) => void
  setSearchQuery: (query: string) => void
  
  // Panel actions
  toggleExpanded: () => void
  setMaxVisibleLogs: (count: number) => void
  
  // Computed
  getFilteredLogs: () => LogEntry[]
}

const MAX_LOGS = 500

const generateLogId = () => `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

export const useLogStore = create<LogState>((set, get) => ({
  // Initial state
  logs: [],
  levelFilter: 'all',
  sourceFilter: null,
  searchQuery: '',
  isExpanded: false,
  maxVisibleLogs: 5,
  
  // Log actions
  addLog: (log) => {
    const newLog: LogEntry = {
      ...log,
      id: generateLogId(),
      timestamp: new Date(),
    }
    
    set((state) => {
      // Keep only last MAX_LOGS entries
      const updatedLogs = [...state.logs, newLog].slice(-MAX_LOGS)
      return { logs: updatedLogs }
    })
  },
  
  clearLogs: () => {
    set({ logs: [] })
  },
  
  // Filter actions
  setLevelFilter: (level) => {
    set({ levelFilter: level })
  },
  
  setSourceFilter: (source) => {
    set({ sourceFilter: source })
  },
  
  setSearchQuery: (query) => {
    set({ searchQuery: query })
  },
  
  // Panel actions
  toggleExpanded: () => {
    set((state) => ({ isExpanded: !state.isExpanded }))
  },
  
  setMaxVisibleLogs: (count) => {
    set({ maxVisibleLogs: count })
  },
  
  // Computed
  getFilteredLogs: () => {
    const { logs, levelFilter, sourceFilter, searchQuery } = get()
    
    return logs.filter((log) => {
      // Level filter
      if (levelFilter !== 'all' && log.level !== levelFilter) {
        return false
      }
      
      // Source filter
      if (sourceFilter && log.source !== sourceFilter) {
        return false
      }
      
      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          log.message.toLowerCase().includes(query) ||
          log.source.toLowerCase().includes(query)
        )
      }
      
      return true
    })
  },
}))

// Selectors
export const selectLogs = (state: LogState) => state.logs

export const selectFilteredLogs = (state: LogState) => state.getFilteredLogs()

export const selectIsExpanded = (state: LogState) => state.isExpanded

export const selectLevelFilter = (state: LogState) => state.levelFilter

// Helper to get log level color
export const getLogLevelColor = (level: LogLevel): string => {
  switch (level) {
    case 'info':
      return '#3b82f6' // blue
    case 'warn':
      return '#f59e0b' // amber
    case 'error':
      return '#ef4444' // red
    case 'debug':
      return '#64748b' // slate
    case 'success':
      return '#10b981' // emerald
    default:
      return '#64748b'
  }
}

// Helper to get log level icon
export const getLogLevelIcon = (level: LogLevel): string => {
  switch (level) {
    case 'info':
      return 'ℹ️'
    case 'warn':
      return '⚠️'
    case 'error':
      return '❌'
    case 'debug':
      return '🔍'
    case 'success':
      return '✅'
    default:
      return '•'
  }
}
