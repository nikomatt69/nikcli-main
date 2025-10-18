/**
 * NikCLI SDK TTY Input Component
 * Terminal-style input component for TTY applications
 */

import React, { forwardRef, useImperativeHandle, useRef, useEffect } from 'react'
import { useTTYInput } from '../hooks/useTTY'
import type { TTYInputProps } from '../types'

/**
 * TTY Input Component
 * Provides terminal-style input functionality
 */
export const TTYInput = forwardRef<HTMLInputElement | HTMLTextAreaElement, TTYInputProps>(
  ({
    id,
    className = '',
    style,
    placeholder = 'Enter command...',
    value,
    onChange,
    onSubmit,
    disabled = false,
    multiline = false,
    maxLength,
    autoFocus = false,
    ...props
  }, ref) => {
    const {
      value: internalValue,
      setValue,
      focused,
      error,
      inputRef,
      handleKeyPress,
      focus,
      blur,
      submit,
    } = useTTYInput({
      placeholder,
      multiline,
      maxLength,
      autoFocus,
      onSubmit,
      onChange,
    })

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focus,
      blur,
      submit,
      ...inputRef.current,
    }))

    // Sync external value
    useEffect(() => {
      if (value !== undefined && value !== internalValue) {
        setValue(value)
      }
    }, [value, internalValue, setValue])

    // Handle external onChange
    useEffect(() => {
      if (onChange && internalValue !== value) {
        onChange(internalValue)
      }
    }, [internalValue, onChange, value])

    const baseClasses = `
      tty-input
      ${multiline ? 'tty-input--multiline' : 'tty-input--single'}
      ${focused ? 'tty-input--focused' : ''}
      ${disabled ? 'tty-input--disabled' : ''}
      ${error ? 'tty-input--error' : ''}
      ${className}
    `.trim()

    const inputStyle: React.CSSProperties = {
      width: '100%',
      padding: '8px 12px',
      border: '1px solid #333',
      borderRadius: '4px',
      backgroundColor: '#000',
      color: '#fff',
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      fontSize: '14px',
      lineHeight: '1.4',
      outline: 'none',
      resize: 'none',
      ...style,
    }

    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          id={id}
          className={baseClasses}
          style={inputStyle}
          placeholder={placeholder}
          value={internalValue}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyPress}
          onFocus={() => focus()}
          onBlur={() => blur()}
          disabled={disabled}
          maxLength={maxLength}
          rows={3}
          {...props}
        />
      )
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        id={id}
        type="text"
        className={baseClasses}
        style={inputStyle}
        placeholder={placeholder}
        value={internalValue}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyPress}
        onFocus={() => focus()}
        onBlur={() => blur()}
        disabled={disabled}
        maxLength={maxLength}
        {...props}
      />
    )
  }
)

TTYInput.displayName = 'TTYInput'

/**
 * TTY Input with History
 * Input component with command history support
 */
export const TTYInputWithHistory = forwardRef<HTMLInputElement, TTYInputProps & {
  history?: string[]
  onHistoryNavigate?: (direction: 'up' | 'down') => void
}>(
  ({
    history = [],
    onHistoryNavigate,
    onKeyDown,
    ...props
  }, ref) => {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        onHistoryNavigate?.(event.key === 'ArrowUp' ? 'up' : 'down')
      }
      
      onKeyDown?.(event)
    }

    return (
      <TTYInput
        ref={ref}
        onKeyDown={handleKeyDown}
        {...props}
      />
    )
  }
)

TTYInputWithHistory.displayName = 'TTYInputWithHistory'

/**
 * TTY Input with Autocomplete
 * Input component with autocomplete support
 */
export const TTYInputWithAutocomplete = forwardRef<HTMLInputElement, TTYInputProps & {
  suggestions?: string[]
  onSuggestionSelect?: (suggestion: string) => void
}>(
  ({
    suggestions = [],
    onSuggestionSelect,
    onKeyDown,
    ...props
  }, ref) => {
    const [showSuggestions, setShowSuggestions] = React.useState(false)
    const [selectedIndex, setSelectedIndex] = React.useState(-1)

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (suggestions.length > 0 && showSuggestions) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSelectedIndex(prev => 
            prev < suggestions.length - 1 ? prev + 1 : prev
          )
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
        } else if (event.key === 'Enter' && selectedIndex >= 0) {
          event.preventDefault()
          onSuggestionSelect?.(suggestions[selectedIndex])
          setShowSuggestions(false)
          setSelectedIndex(-1)
        } else if (event.key === 'Escape') {
          setShowSuggestions(false)
          setSelectedIndex(-1)
        }
      }
      
      onKeyDown?.(event)
    }

    const handleFocus = () => {
      if (suggestions.length > 0) {
        setShowSuggestions(true)
      }
    }

    const handleBlur = () => {
      // Delay hiding suggestions to allow for clicks
      setTimeout(() => setShowSuggestions(false), 150)
    }

    return (
      <div style={{ position: 'relative' }}>
        <TTYInput
          ref={ref}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
        {showSuggestions && suggestions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderTop: 'none',
              borderRadius: '0 0 4px 4px',
              maxHeight: '200px',
              overflowY: 'auto',
              zIndex: 1000,
            }}
          >
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  backgroundColor: index === selectedIndex ? '#333' : 'transparent',
                  color: '#fff',
                  fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                  fontSize: '14px',
                }}
                onClick={() => {
                  onSuggestionSelect?.(suggestion)
                  setShowSuggestions(false)
                  setSelectedIndex(-1)
                }}
              >
                {suggestion}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
)

TTYInputWithAutocomplete.displayName = 'TTYInputWithAutocomplete'
