/**
 * NikCLI Mobile - Utility Functions
 */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { MessageType, LogLevel, AgentStatus } from '@/types'

// ============================================================================
// Tailwind Class Merging
// ============================================================================

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ============================================================================
// Time Formatting
// ============================================================================

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  
  if (diffSeconds < 60) {
    return 'just now'
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  } else if (diffHours < 24) {
    return `${diffHours}h ago`
  } else {
    return formatTime(date)
  }
}

// ============================================================================
// Message Type Styling
// ============================================================================

export function getMessageTypeColor(type: MessageType): string {
  const colors: Record<MessageType, string> = {
    user: '#3b82f6',     // blue
    system: '#64748b',   // slate
    agent: '#8b5cf6',    // violet
    tool: '#10b981',     // emerald
    error: '#ef4444',    // red
    vm: '#06b6d4',       // cyan
    diff: '#f59e0b',     // amber
  }
  return colors[type]
}

export function getMessageTypeIcon(type: MessageType): string {
  const icons: Record<MessageType, string> = {
    user: '💬',
    system: 'ℹ️',
    agent: '🔌',
    tool: '🔧',
    error: '❌',
    vm: '🐳',
    diff: '📝',
  }
  return icons[type]
}

export function getMessageTypeLabel(type: MessageType): string {
  const labels: Record<MessageType, string> = {
    user: 'You',
    system: 'System',
    agent: 'Agent',
    tool: 'Tool',
    error: 'Error',
    vm: 'VM',
    diff: 'Diff',
  }
  return labels[type]
}

// ============================================================================
// Agent Status Styling
// ============================================================================

export function getAgentStatusColor(status: AgentStatus): string {
  const colors: Record<AgentStatus, string> = {
    idle: '#64748b',
    running: '#3b82f6',
    completed: '#10b981',
    error: '#ef4444',
    queued: '#f59e0b',
  }
  return colors[status]
}

export function getAgentStatusIcon(status: AgentStatus): string {
  const icons: Record<AgentStatus, string> = {
    idle: '⏸️',
    running: '▶️',
    completed: '✅',
    error: '❌',
    queued: '⏳',
  }
  return icons[status]
}

// ============================================================================
// Log Level Styling
// ============================================================================

export function getLogLevelColor(level: LogLevel): string {
  const colors: Record<LogLevel, string> = {
    info: '#3b82f6',
    warn: '#f59e0b',
    error: '#ef4444',
    debug: '#64748b',
    success: '#10b981',
  }
  return colors[level]
}

export function getLogLevelIcon(level: LogLevel): string {
  const icons: Record<LogLevel, string> = {
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
    debug: '🔍',
    success: '✅',
  }
  return icons[level]
}

// ============================================================================
// Progress Bar
// ============================================================================

export function createProgressBar(progress: number, width = 20): string {
  const filled = Math.round((progress / 100) * width)
  const empty = width - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

// ============================================================================
// Command Parsing
// ============================================================================

export function parseCommand(input: string): { command: string; args: string[] } | null {
  if (!input.startsWith('/')) {
    return null
  }
  
  const parts = input.slice(1).split(' ')
  const command = parts[0] || ''
  const args = parts.slice(1)
  
  return { command, args }
}

export function parseAgentCommand(input: string): { agentName: string; task: string } | null {
  if (!input.startsWith('@')) {
    return null
  }
  
  const match = input.match(/^@([\w-]+)\s*(.*)$/)
  if (!match) {
    return null
  }
  
  return {
    agentName: match[1] || '',
    task: match[2]?.trim() || '',
  }
}

// ============================================================================
// Text Truncation
// ============================================================================

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength - 3) + '...'
}

// ============================================================================
// ID Generation
// ============================================================================

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ============================================================================
// Debounce
// ============================================================================

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  }
}

// ============================================================================
// Throttle
// ============================================================================

export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}
