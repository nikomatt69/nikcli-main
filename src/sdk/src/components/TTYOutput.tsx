/**
 * NikCLI SDK TTY Output Component
 * Terminal-style output component for TTY applications
 */

import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState } from 'react'
import { useTTYOutput } from '../hooks/useTTY'
import type { TTYOutputProps } from '../types'

/**
 * TTY Output Component
 * Provides terminal-style output functionality
 */
export const TTYOutput = forwardRef<HTMLDivElement, TTYOutputProps>(
  ({
    id,
    className = '',
    style,
    content,
    type = 'text',
    language = 'text',
    theme = 'dark',
    maxHeight = 400,
    scrollable = true,
    timestamp = false,
    ...props
  }, ref) => {
    const {
      content: internalContent,
      setContent,
      append,
      clear,
      scrollPosition,
      setScrollPosition,
      error,
      outputRef,
      scrollToBottom,
      scrollToTop,
    } = useTTYOutput({
      type,
      language,
      theme,
      maxHeight,
      scrollable,
      timestamp,
    })

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      append,
      clear,
      scrollToBottom,
      scrollToTop,
      ...outputRef.current,
    }))

    // Sync external content
    useEffect(() => {
      if (content !== undefined && content !== internalContent) {
        setContent(content)
      }
    }, [content, internalContent, setContent])

    const baseClasses = `
      tty-output
      tty-output--${type}
      tty-output--${theme}
      ${scrollable ? 'tty-output--scrollable' : ''}
      ${error ? 'tty-output--error' : ''}
      ${className}
    `.trim()

    const outputStyle: React.CSSProperties = {
      width: '100%',
      minHeight: '200px',
      maxHeight: scrollable ? `${maxHeight}px` : 'none',
      padding: '12px',
      border: '1px solid #333',
      borderRadius: '4px',
      backgroundColor: theme === 'dark' ? '#000' : '#fff',
      color: theme === 'dark' ? '#fff' : '#000',
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      fontSize: '14px',
      lineHeight: '1.4',
      overflow: scrollable ? 'auto' : 'visible',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      ...style,
    }

    // Format content based on type
    const formatContent = (text: string) => {
      if (type === 'json') {
        try {
          return JSON.stringify(JSON.parse(text), null, 2)
        } catch {
          return text
        }
      }
      return text
    }

    return (
      <div
        ref={outputRef}
        id={id}
        className={baseClasses}
        style={outputStyle}
        {...props}
      >
        {formatContent(internalContent)}
      </div>
    )
  }
)

TTYOutput.displayName = 'TTYOutput'

/**
 * TTY Output with Syntax Highlighting
 * Output component with syntax highlighting support
 */
export const TTYOutputWithHighlighting = forwardRef<HTMLDivElement, TTYOutputProps & {
  highlightLanguage?: string
}>(
  ({
    highlightLanguage,
    language,
    ...props
  }, ref) => {
    const [highlightedContent, setHighlightedContent] = useState('')

    useEffect(() => {
      // Simple syntax highlighting (in a real implementation, you'd use a library like Prism.js)
      const highlight = (text: string, lang: string) => {
        if (lang === 'json') {
          return text.replace(
            /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
            (match) => {
              let cls = 'number'
              if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                  cls = 'key'
                } else {
                  cls = 'string'
                }
              } else if (/true|false/.test(match)) {
                cls = 'boolean'
              } else if (/null/.test(match)) {
                cls = 'null'
              }
              return `<span class="tty-highlight--${cls}">${match}</span>`
            }
          )
        }
        return text
      }

      const highlighted = highlight(props.content || '', highlightLanguage || language || 'text')
      setHighlightedContent(highlighted)
    }, [props.content, highlightLanguage, language])

    return (
      <TTYOutput
        ref={ref}
        {...props}
        content={highlightedContent}
        style={{
          ...props.style,
        }}
      />
    )
  }
)

TTYOutputWithHighlighting.displayName = 'TTYOutputWithHighlighting'

/**
 * TTY Output with Streaming
 * Output component that supports streaming content
 */
export const TTYOutputWithStreaming = forwardRef<HTMLDivElement, TTYOutputProps & {
  streamDelay?: number
  onStreamComplete?: () => void
}>(
  ({
    streamDelay = 50,
    onStreamComplete,
    content,
    ...props
  }, ref) => {
    const [streamedContent, setStreamedContent] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const streamRef = useRef<NodeJS.Timeout>()

    useEffect(() => {
      if (content && content !== streamedContent) {
        setIsStreaming(true)
        
        // Clear existing stream
        if (streamRef.current) {
          clearTimeout(streamRef.current)
        }

        // Stream content character by character
        let index = 0
        const stream = () => {
          if (index < content.length) {
            setStreamedContent(prev => prev + content[index])
            index++
            streamRef.current = setTimeout(stream, streamDelay)
          } else {
            setIsStreaming(false)
            onStreamComplete?.()
          }
        }

        stream()
      }

      return () => {
        if (streamRef.current) {
          clearTimeout(streamRef.current)
        }
      }
    }, [content, streamedContent, streamDelay, onStreamComplete])

    return (
      <TTYOutput
        ref={ref}
        {...props}
        content={streamedContent}
        style={{
          ...props.style,
          position: 'relative',
        }}
      >
        {streamedContent}
        {isStreaming && (
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '16px',
              backgroundColor: '#fff',
              animation: 'blink 1s infinite',
            }}
          />
        )}
      </TTYOutput>
    )
  }
)

TTYOutputWithStreaming.displayName = 'TTYOutputWithStreaming'

/**
 * TTY Output with Logs
 * Output component specifically for log display
 */
export const TTYOutputWithLogs = forwardRef<HTMLDivElement, TTYOutputProps & {
  logs?: Array<{
    timestamp: Date
    level: 'info' | 'warn' | 'error' | 'debug'
    message: string
    source?: string
  }>
  showLevel?: boolean
  showSource?: boolean
}>(
  ({
    logs = [],
    showLevel = true,
    showSource = true,
    content,
    ...props
  }, ref) => {
    const formatLogs = (logEntries: typeof logs) => {
      return logEntries
        .map(log => {
          const timestamp = log.timestamp.toISOString()
          const level = showLevel ? `[${log.level.toUpperCase()}]` : ''
          const source = showSource && log.source ? `[${log.source}]` : ''
          return `${timestamp} ${level} ${source} ${log.message}`
        })
        .join('\n')
    }

    const logContent = logs.length > 0 ? formatLogs(logs) : content

    return (
      <TTYOutput
        ref={ref}
        {...props}
        content={logContent}
        type="text"
        style={{
          ...props.style,
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          fontSize: '12px',
        }}
      />
    )
  }
)

TTYOutputWithLogs.displayName = 'TTYOutputWithLogs'

// Add CSS for blinking cursor animation
const style = document.createElement('style')
style.textContent = `
  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
  
  .tty-highlight--string { color: #98d982; }
  .tty-highlight--number { color: #f78c6c; }
  .tty-highlight--boolean { color: #c792ea; }
  .tty-highlight--null { color: #676e95; }
  .tty-highlight--key { color: #82aaff; }
`
document.head.appendChild(style)