/**
 * NikCLI SDK TTY Status Component
 * Terminal-style status component for TTY applications
 */

import React, { forwardRef, useImperativeHandle, useRef, useEffect } from 'react'
import { useTTYStatus } from '../hooks/useTTY'
import type { TTYStatusProps } from '../types'

/**
 * TTY Status Component
 * Provides terminal-style status display functionality
 */
export const TTYStatus = forwardRef<HTMLDivElement, TTYStatusProps>(
  ({
    id,
    className = '',
    style,
    status,
    message,
    progress,
    showProgress = false,
    animated = true,
    ...props
  }, ref) => {
    const {
      status: internalStatus,
      message: internalMessage,
      progress: internalProgress,
      error,
      updateStatus,
      updateProgress,
      clearStatus,
    } = useTTYStatus({
      status,
      message,
      progress,
      showProgress,
      animated,
    })

    const statusRef = useRef<HTMLDivElement>(null)

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      updateStatus,
      updateProgress,
      clearStatus,
      ...statusRef.current,
    }))

    // Sync external props
    useEffect(() => {
      if (status !== internalStatus || message !== internalMessage) {
        updateStatus(status, message)
      }
    }, [status, message, internalStatus, internalMessage, updateStatus])

    useEffect(() => {
      if (progress !== undefined && progress !== internalProgress) {
        updateProgress(progress)
      }
    }, [progress, internalProgress, updateProgress])

    const baseClasses = `
      tty-status
      tty-status--${internalStatus}
      ${animated ? 'tty-status--animated' : ''}
      ${error ? 'tty-status--error' : ''}
      ${className}
    `.trim()

    const statusColors = {
      idle: '#4caf50',
      busy: '#ff9800',
      error: '#f44336',
      offline: '#9e9e9e',
      initializing: '#2196f3',
    }

    const statusStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      backgroundColor: '#2a2a2a',
      border: '1px solid #333',
      borderRadius: '4px',
      color: '#fff',
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      fontSize: '14px',
      ...style,
    }

    const indicatorStyle: React.CSSProperties = {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      backgroundColor: statusColors[internalStatus],
      ...(animated && internalStatus === 'busy' && {
        animation: 'pulse 1.5s infinite',
      }),
    }

    const progressBarStyle: React.CSSProperties = {
      width: '100px',
      height: '4px',
      backgroundColor: '#333',
      borderRadius: '2px',
      overflow: 'hidden',
      marginLeft: '8px',
    }

    const progressFillStyle: React.CSSProperties = {
      width: `${internalProgress}%`,
      height: '100%',
      backgroundColor: statusColors[internalStatus],
      transition: 'width 0.3s ease',
    }

    return (
      <div
        ref={statusRef}
        id={id}
        className={baseClasses}
        style={statusStyle}
        {...props}
      >
        {/* Status Indicator */}
        <div style={indicatorStyle} />

        {/* Status Message */}
        <span>{internalMessage || internalStatus.toUpperCase()}</span>

        {/* Progress Bar */}
        {showProgress && internalProgress !== undefined && (
          <div style={progressBarStyle}>
            <div style={progressFillStyle} />
          </div>
        )}

        {/* Progress Percentage */}
        {showProgress && internalProgress !== undefined && (
          <span style={{ fontSize: '12px', color: '#999' }}>
            {Math.round(internalProgress)}%
          </span>
        )}
      </div>
    )
  }
)

TTYStatus.displayName = 'TTYStatus'

/**
 * TTY Status with Icon
 * Status component with icon support
 */
export const TTYStatusWithIcon = forwardRef<HTMLDivElement, TTYStatusProps & {
  icon?: string
  showIcon?: boolean
}>(
  ({
    icon,
    showIcon = true,
    ...props
  }, ref) => {
    const statusIcons = {
      idle: '✓',
      busy: '⏳',
      error: '✗',
      offline: '●',
      initializing: '⟳',
    }

    const displayIcon = icon || statusIcons[props.status]

    return (
      <TTYStatus
        ref={ref}
        {...props}
        style={{
          ...props.style,
        }}
      >
        {showIcon && displayIcon && (
          <span style={{ fontSize: '16px', marginRight: '4px' }}>
            {displayIcon}
          </span>
        )}
      </TTYStatus>
    )
  }
)

TTYStatusWithIcon.displayName = 'TTYStatusWithIcon'

/**
 * TTY Status with Timer
 * Status component with timer functionality
 */
export const TTYStatusWithTimer = forwardRef<HTMLDivElement, TTYStatusProps & {
  startTime?: Date
  showTimer?: boolean
  format?: 'elapsed' | 'remaining' | 'both'
}>(
  ({
    startTime,
    showTimer = true,
    format = 'elapsed',
    ...props
  }, ref) => {
    const [currentTime, setCurrentTime] = useState(new Date())

    useEffect(() => {
      if (!showTimer || !startTime) return

      const interval = setInterval(() => {
        setCurrentTime(new Date())
      }, 1000)

      return () => clearInterval(interval)
    }, [showTimer, startTime])

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    }

    const getElapsedTime = () => {
      if (!startTime) return '00:00:00'
      const elapsed = currentTime.getTime() - startTime.getTime()
      const hours = Math.floor(elapsed / 3600000)
      const minutes = Math.floor((elapsed % 3600000) / 60000)
      const seconds = Math.floor((elapsed % 60000) / 1000)
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }

    const getRemainingTime = () => {
      if (!startTime || !props.progress) return '00:00:00'
      const elapsed = currentTime.getTime() - startTime.getTime()
      const total = (elapsed / props.progress) * 100
      const remaining = total - elapsed
      const hours = Math.floor(remaining / 3600000)
      const minutes = Math.floor((remaining % 3600000) / 60000)
      const seconds = Math.floor((remaining % 60000) / 1000)
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }

    const getTimerText = () => {
      switch (format) {
        case 'elapsed':
          return getElapsedTime()
        case 'remaining':
          return getRemainingTime()
        case 'both':
          return `${getElapsedTime()} / ${getRemainingTime()}`
        default:
          return getElapsedTime()
      }
    }

    return (
      <TTYStatus
        ref={ref}
        {...props}
        style={{
          ...props.style,
        }}
      >
        {showTimer && startTime && (
          <span style={{ fontSize: '12px', color: '#999', marginLeft: '8px' }}>
            {getTimerText()}
          </span>
        )}
      </TTYStatus>
    )
  }
)

TTYStatusWithTimer.displayName = 'TTYStatusWithTimer'

// Add CSS for animations
const style = document.createElement('style')
style.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  .tty-status--animated {
    transition: all 0.3s ease;
  }
  
  .tty-status--busy .tty-status__indicator {
    animation: pulse 1.5s infinite;
  }
`
document.head.appendChild(style)