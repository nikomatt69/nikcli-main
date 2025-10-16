/**
 * NikCLI SDK React Hooks - useTTY
 * Hook for managing TTY interface in applications
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  UseTTYReturn,
} from '../types'
import { getSDK } from '../core/sdk'

/**
 * useTTY Hook
 * Manages TTY interface state and operations
 */
export function useTTY(): UseTTYReturn {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(false)
  const [historyIndex, setHistoryIndex] = useState(-1)
  
  const sdk = useRef(getSDK())
  const streamManager = sdk.current.getStreamManager()

  /**
   * Set input value
   */
  const setInputValue = useCallback((value: string) => {
    setInput(value)
  }, [])

  /**
   * Submit input
   */
  const submitInput = useCallback(async (): Promise<void> => {
    if (!input.trim()) return

    try {
      setLoading(true)
      setError(null)

      // Add to history
      setHistory(prev => [...prev, input])
      setHistoryIndex(-1)

      // Send message through stream
      await streamManager.sendMessage(input)

      // Update output
      setOutput(prev => prev + `\n> ${input}\n`)

      // Clear input
      setInput('')
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to submit input')
      setError(error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [input, streamManager])

  /**
   * Clear output
   */
  const clearOutput = useCallback((): void => {
    setOutput('')
    streamManager.clearEvents()
  }, [streamManager])

  /**
   * Add to history
   */
  const addToHistory = useCallback((item: string): void => {
    setHistory(prev => [...prev, item])
  }, [])

  /**
   * Navigate history
   */
  const navigateHistory = useCallback((direction: 'up' | 'down'): void => {
    if (history.length === 0) return

    setHistoryIndex(prev => {
      let newIndex = prev

      if (direction === 'up') {
        newIndex = prev === -1 ? history.length - 1 : Math.max(0, prev - 1)
      } else {
        newIndex = prev === -1 ? -1 : Math.min(history.length - 1, prev + 1)
      }

      // Set input to history item
      if (newIndex >= 0 && newIndex < history.length) {
        setInput(history[newIndex])
      } else if (newIndex === -1) {
        setInput('')
      }

      return newIndex
    })
  }, [history])

  // Setup stream event listeners
  useEffect(() => {
    const handleStreamEvent = (event: any) => {
      if (event.content) {
        setOutput(prev => prev + event.content)
      }
    }

    streamManager.addEventListener('streamEvent', handleStreamEvent)

    return () => {
      streamManager.removeEventListener('streamEvent', handleStreamEvent)
    }
  }, [streamManager])

  return {
    input,
    output,
    history,
    setInput: setInputValue,
    submitInput,
    clearOutput,
    addToHistory,
    navigateHistory,
    error,
    loading,
  }
}

/**
 * useTTYInput Hook
 * Manages TTY input specifically
 */
export function useTTYInput(options: {
  placeholder?: string
  multiline?: boolean
  maxLength?: number
  autoFocus?: boolean
  onSubmit?: (value: string) => void
  onChange?: (value: string) => void
} = {}) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  /**
   * Handle input change
   */
  const handleChange = useCallback((newValue: string) => {
    if (options.maxLength && newValue.length > options.maxLength) {
      return
    }
    
    setValue(newValue)
    options.onChange?.(newValue)
  }, [options])

  /**
   * Handle submit
   */
  const handleSubmit = useCallback(() => {
    if (!value.trim()) return
    
    try {
      options.onSubmit?.(value)
      setValue('')
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to submit input'))
    }
  }, [value, options])

  /**
   * Handle key press
   */
  const handleKeyPress = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      if (options.multiline && event.shiftKey) {
        // Allow new line in multiline mode
        return
      }
      
      event.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit, options.multiline])

  /**
   * Focus input
   */
  const focus = useCallback(() => {
    inputRef.current?.focus()
    setFocused(true)
  }, [])

  /**
   * Blur input
   */
  const blur = useCallback(() => {
    inputRef.current?.blur()
    setFocused(false)
  }, [])

  // Auto focus
  useEffect(() => {
    if (options.autoFocus) {
      focus()
    }
  }, [options.autoFocus, focus])

  return {
    value,
    setValue: handleChange,
    focused,
    error,
    inputRef,
    handleKeyPress,
    focus,
    blur,
    submit: handleSubmit,
  }
}

/**
 * useTTYOutput Hook
 * Manages TTY output specifically
 */
export function useTTYOutput(options: {
  type?: 'text' | 'markdown' | 'json' | 'code'
  language?: string
  theme?: 'light' | 'dark' | 'auto'
  maxHeight?: number
  scrollable?: boolean
  timestamp?: boolean
} = {}) {
  const [content, setContent] = useState('')
  const [scrollPosition, setScrollPosition] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  
  const outputRef = useRef<HTMLDivElement>(null)

  /**
   * Append content
   */
  const append = useCallback((newContent: string) => {
    const timestamp = options.timestamp ? `[${new Date().toISOString()}] ` : ''
    setContent(prev => prev + timestamp + newContent)
  }, [options.timestamp])

  /**
   * Clear content
   */
  const clear = useCallback(() => {
    setContent('')
    setScrollPosition(0)
  }, [])

  /**
   * Scroll to bottom
   */
  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [])

  /**
   * Scroll to top
   */
  const scrollToTop = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = 0
    }
  }, [])

  // Auto scroll to bottom when content changes
  useEffect(() => {
    if (options.scrollable) {
      scrollToBottom()
    }
  }, [content, options.scrollable, scrollToBottom])

  return {
    content,
    setContent,
    append,
    clear,
    scrollPosition,
    setScrollPosition,
    error,
    outputRef,
    scrollToBottom,
    scrollToTop,
  }
}

/**
 * useTTYPanel Hook
 * Manages TTY panel state
 */
export function useTTYPanel(options: {
  title: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  width?: number
  height?: number
  resizable?: boolean
  collapsible?: boolean
  defaultCollapsed?: boolean
} = { title: 'Panel' }) {
  const [collapsed, setCollapsed] = useState(options.defaultCollapsed || false)
  const [resizing, setResizing] = useState(false)
  const [dimensions, setDimensions] = useState({
    width: options.width || 300,
    height: options.height || 200,
  })
  const [error, setError] = useState<Error | null>(null)

  /**
   * Toggle collapsed state
   */
  const toggleCollapsed = useCallback(() => {
    if (options.collapsible) {
      setCollapsed(prev => !prev)
    }
  }, [options.collapsible])

  /**
   * Start resizing
   */
  const startResizing = useCallback(() => {
    if (options.resizable) {
      setResizing(true)
    }
  }, [options.resizable])

  /**
   * Stop resizing
   */
  const stopResizing = useCallback(() => {
    setResizing(false)
  }, [])

  /**
   * Update dimensions
   */
  const updateDimensions = useCallback((newDimensions: { width?: number; height?: number }) => {
    if (options.resizable) {
      setDimensions(prev => ({
        ...prev,
        ...newDimensions,
      }))
    }
  }, [options.resizable])

  return {
    collapsed,
    resizing,
    dimensions,
    error,
    toggleCollapsed,
    startResizing,
    stopResizing,
    updateDimensions,
  }
}

/**
 * useTTYStatus Hook
 * Manages TTY status display
 */
export function useTTYStatus(options: {
  status: 'idle' | 'busy' | 'error' | 'offline' | 'initializing'
  message?: string
  progress?: number
  showProgress?: boolean
  animated?: boolean
} = { status: 'idle' }) {
  const [status, setStatus] = useState(options.status)
  const [message, setMessage] = useState(options.message || '')
  const [progress, setProgress] = useState(options.progress || 0)
  const [error, setError] = useState<Error | null>(null)

  /**
   * Update status
   */
  const updateStatus = useCallback((newStatus: typeof status, newMessage?: string) => {
    setStatus(newStatus)
    if (newMessage !== undefined) {
      setMessage(newMessage)
    }
  }, [])

  /**
   * Update progress
   */
  const updateProgress = useCallback((newProgress: number) => {
    setProgress(Math.max(0, Math.min(100, newProgress)))
  }, [])

  /**
   * Clear status
   */
  const clearStatus = useCallback(() => {
    setStatus('idle')
    setMessage('')
    setProgress(0)
  }, [])

  return {
    status,
    message,
    progress,
    error,
    updateStatus,
    updateProgress,
    clearStatus,
  }
}