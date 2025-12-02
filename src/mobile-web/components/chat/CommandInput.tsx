'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Command } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/lib/store'

interface CommandInputProps {
  onSend: (message: string) => void
  disabled?: boolean
}

export function CommandInput({ onSend, disabled }: CommandInputProps) {
  const [message, setMessage] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { openCommandPalette } = useStore()

  const commands = [
    { cmd: '/help', desc: 'Show help' },
    { cmd: '/agents', desc: 'List agents' },
    { cmd: '/tools', desc: 'List tools' },
    { cmd: '/plan', desc: 'Create plan' },
    { cmd: '/workspace', desc: 'Workspace info' },
  ]

  const filteredCommands = message.startsWith('/')
    ? commands.filter((c) => c.cmd.startsWith(message.toLowerCase()))
    : []

  useEffect(() => {
    setShowSuggestions(filteredCommands.length > 0)
  }, [filteredCommands.length])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || disabled) return

    onSend(message)
    setMessage('')
    setShowSuggestions(false)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)

    // Auto-resize
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }

  const selectCommand = (cmd: string) => {
    setMessage(cmd + ' ')
    setShowSuggestions(false)
    textareaRef.current?.focus()
  }

  return (
    <div className="safe-bottom border-t border-border bg-card">
      {/* Command suggestions */}
      {showSuggestions && (
        <div className="border-b border-border">
          {filteredCommands.map((c) => (
            <button
              key={c.cmd}
              onClick={() => selectCommand(c.cmd)}
              className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent"
            >
              <Command className="h-4 w-4 text-primary" />
              <div className="flex-1">
                <div className="font-medium">{c.cmd}</div>
                <div className="text-xs text-muted-foreground">{c.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3">
        <button
          type="button"
          onClick={() => openCommandPalette()}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          )}
        >
          <Command className="h-5 w-5" />
        </button>

        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Message or /command..."
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-lg border border-input bg-background px-4 py-2.5',
            'text-base placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'max-h-[120px] overflow-y-auto scrollbar-thin'
          )}
        />

        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            'bg-primary text-primary-foreground',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'hover:bg-primary/90 transition-colors'
          )}
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  )
}
