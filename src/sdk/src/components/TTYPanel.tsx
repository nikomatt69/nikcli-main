/**
 * NikCLI SDK TTY Panel Component
 * Terminal-style panel component for TTY applications
 */

import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react'
import { useTTYPanel } from '../hooks/useTTY'
import type { TTYPanelProps } from '../types'

/**
 * TTY Panel Component
 * Provides terminal-style panel functionality
 */
export const TTYPanel = forwardRef<HTMLDivElement, TTYPanelProps>(
  ({
    id,
    className = '',
    style,
    title,
    position = 'right',
    width = 300,
    height = 200,
    resizable = true,
    collapsible = true,
    defaultCollapsed = false,
    children,
    ...props
  }, ref) => {
    const {
      collapsed,
      resizing,
      dimensions,
      error,
      toggleCollapsed,
      startResizing,
      stopResizing,
      updateDimensions,
    } = useTTYPanel({
      title,
      position,
      width,
      height,
      resizable,
      collapsible,
      defaultCollapsed,
    })

    const panelRef = useRef<HTMLDivElement>(null)
    const resizeHandleRef = useRef<HTMLDivElement>(null)

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      toggleCollapsed,
      startResizing,
      stopResizing,
      updateDimensions,
      ...panelRef.current,
    }))

    // Handle resize
    useEffect(() => {
      if (!resizing || !resizeHandleRef.current) return

      const handleMouseMove = (e: MouseEvent) => {
        const rect = panelRef.current?.getBoundingClientRect()
        if (!rect) return

        const newWidth = e.clientX - rect.left
        const newHeight = e.clientY - rect.top

        if (position === 'right' || position === 'left') {
          updateDimensions({ width: Math.max(200, newWidth) })
        } else {
          updateDimensions({ height: Math.max(100, newHeight) })
        }
      }

      const handleMouseUp = () => {
        stopResizing()
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }, [resizing, position, updateDimensions, stopResizing])

    const baseClasses = `
      tty-panel
      tty-panel--${position}
      ${collapsed ? 'tty-panel--collapsed' : ''}
      ${resizing ? 'tty-panel--resizing' : ''}
      ${error ? 'tty-panel--error' : ''}
      ${className}
    `.trim()

    const panelStyle: React.CSSProperties = {
      position: 'absolute',
      backgroundColor: '#1a1a1a',
      border: '1px solid #333',
      borderRadius: '4px',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      ...style,
    }

    // Position styles
    const positionStyles: Record<string, React.CSSProperties> = {
      top: {
        top: 0,
        left: 0,
        right: 0,
        height: `${dimensions.height}px`,
      },
      bottom: {
        bottom: 0,
        left: 0,
        right: 0,
        height: `${dimensions.height}px`,
      },
      left: {
        top: 0,
        left: 0,
        bottom: 0,
        width: `${dimensions.width}px`,
      },
      right: {
        top: 0,
        right: 0,
        bottom: 0,
        width: `${dimensions.width}px`,
      },
    }

    const headerStyle: React.CSSProperties = {
      padding: '8px 12px',
      backgroundColor: '#2a2a2a',
      borderBottom: '1px solid #333',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: '32px',
    }

    const contentStyle: React.CSSProperties = {
      flex: 1,
      padding: '12px',
      overflow: 'auto',
      display: collapsed ? 'none' : 'block',
    }

    const resizeHandleStyle: React.CSSProperties = {
      position: 'absolute',
      backgroundColor: 'transparent',
      cursor: position === 'right' || position === 'left' ? 'ew-resize' : 'ns-resize',
      zIndex: 10,
    }

    const resizeHandlePosition: Record<string, React.CSSProperties> = {
      top: {
        bottom: 0,
        left: 0,
        right: 0,
        height: '4px',
      },
      bottom: {
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
      },
      left: {
        top: 0,
        bottom: 0,
        right: 0,
        width: '4px',
      },
      right: {
        top: 0,
        bottom: 0,
        left: 0,
        width: '4px',
      },
    }

    return (
      <div
        ref={panelRef}
        id={id}
        className={baseClasses}
        style={{
          ...panelStyle,
          ...positionStyles[position],
        }}
        {...props}
      >
        {/* Header */}
        <div style={headerStyle}>
          <span
            style={{
              color: '#fff',
              fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            {title}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {collapsible && (
              <button
                onClick={toggleCollapsed}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '4px',
                }}
              >
                {collapsed ? '▶' : '▼'}
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {children}
        </div>

        {/* Resize Handle */}
        {resizable && !collapsed && (
          <div
            ref={resizeHandleRef}
            style={{
              ...resizeHandleStyle,
              ...resizeHandlePosition[position],
            }}
            onMouseDown={startResizing}
          />
        )}
      </div>
    )
  }
)

TTYPanel.displayName = 'TTYPanel'

/**
 * TTY Panel with Tabs
 * Panel component with tabbed content
 */
export const TTYPanelWithTabs = forwardRef<HTMLDivElement, TTYPanelProps & {
  tabs: Array<{
    id: string
    label: string
    content: React.ReactNode
    icon?: string
  }>
  activeTab?: string
  onTabChange?: (tabId: string) => void
}>(
  ({
    tabs,
    activeTab,
    onTabChange,
    children,
    ...props
  }, ref) => {
    const [currentTab, setCurrentTab] = useState(activeTab || tabs[0]?.id || '')

    const handleTabChange = (tabId: string) => {
      setCurrentTab(tabId)
      onTabChange?.(tabId)
    }

    const activeTabContent = tabs.find(tab => tab.id === currentTab)?.content

    return (
      <TTYPanel ref={ref} {...props}>
        {/* Tab Headers */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #333',
            backgroundColor: '#2a2a2a',
          }}
        >
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                background: currentTab === tab.id ? '#333' : 'transparent',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                padding: '8px 12px',
                fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                borderRight: '1px solid #333',
              }}
            >
              {tab.icon && <span>{tab.icon}</span>}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div
          style={{
            flex: 1,
            padding: '12px',
            overflow: 'auto',
          }}
        >
          {activeTabContent}
        </div>

        {children}
      </TTYPanel>
    )
  }
)

TTYPanelWithTabs.displayName = 'TTYPanelWithTabs'

/**
 * TTY Panel with Status
 * Panel component with status indicator
 */
export const TTYPanelWithStatus = forwardRef<HTMLDivElement, TTYPanelProps & {
  status: 'idle' | 'busy' | 'error' | 'offline' | 'initializing'
  statusMessage?: string
  showStatus?: boolean
}>(
  ({
    status,
    statusMessage,
    showStatus = true,
    children,
    ...props
  }, ref) => {
    const statusColors = {
      idle: '#4caf50',
      busy: '#ff9800',
      error: '#f44336',
      offline: '#9e9e9e',
      initializing: '#2196f3',
    }

    return (
      <TTYPanel ref={ref} {...props}>
        {/* Status Bar */}
        {showStatus && (
          <div
            style={{
              padding: '4px 12px',
              backgroundColor: '#2a2a2a',
              borderBottom: '1px solid #333',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: statusColors[status],
              }}
            />
            <span style={{ color: '#fff' }}>
              {statusMessage || status.toUpperCase()}
            </span>
          </div>
        )}

        {/* Content */}
        <div
          style={{
            flex: 1,
            padding: '12px',
            overflow: 'auto',
          }}
        >
          {children}
        </div>
      </TTYPanel>
    )
  }
)

TTYPanelWithStatus.displayName = 'TTYPanelWithStatus'
