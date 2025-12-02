'use client'

import { useState, useMemo, useEffect } from 'react'
import { Command, X, Search, Zap, Users, Tool, Settings, FileCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/lib/store'

interface CommandPaletteProps {
  onSelectCommand: (command: string) => void
}

interface CommandItem {
  cmd: string
  desc: string
  category: 'agents' | 'tools' | 'workspace' | 'system'
  icon: React.ReactNode
}

const COMMANDS: CommandItem[] = [
  // Agents
  { cmd: '/agents', desc: 'List all available agents', category: 'agents', icon: <Users className="h-4 w-4" /> },
  { cmd: '/plan', desc: 'Create implementation plan', category: 'agents', icon: <FileCode className="h-4 w-4" /> },
  { cmd: '/explore', desc: 'Explore codebase', category: 'agents', icon: <Search className="h-4 w-4" /> },
  { cmd: '/review', desc: 'Review code changes', category: 'agents', icon: <FileCode className="h-4 w-4" /> },

  // Tools
  { cmd: '/tools', desc: 'List all available tools', category: 'tools', icon: <Tool className="h-4 w-4" /> },
  { cmd: '/grep', desc: 'Search in files', category: 'tools', icon: <Search className="h-4 w-4" /> },
  { cmd: '/glob', desc: 'Find files by pattern', category: 'tools', icon: <Search className="h-4 w-4" /> },
  { cmd: '/read', desc: 'Read file contents', category: 'tools', icon: <FileCode className="h-4 w-4" /> },
  { cmd: '/write', desc: 'Write to file', category: 'tools', icon: <FileCode className="h-4 w-4" /> },
  { cmd: '/edit', desc: 'Edit file', category: 'tools', icon: <FileCode className="h-4 w-4" /> },
  { cmd: '/bash', desc: 'Execute bash command', category: 'tools', icon: <Zap className="h-4 w-4" /> },

  // Workspace
  { cmd: '/workspace', desc: 'Show workspace info', category: 'workspace', icon: <Settings className="h-4 w-4" /> },
  { cmd: '/sessions', desc: 'List chat sessions', category: 'workspace', icon: <Settings className="h-4 w-4" /> },
  { cmd: '/history', desc: 'Show command history', category: 'workspace', icon: <Settings className="h-4 w-4" /> },

  // System
  { cmd: '/help', desc: 'Show help information', category: 'system', icon: <Command className="h-4 w-4" /> },
  { cmd: '/clear', desc: 'Clear chat messages', category: 'system', icon: <X className="h-4 w-4" /> },
  { cmd: '/settings', desc: 'Open settings', category: 'system', icon: <Settings className="h-4 w-4" /> },
]

const CATEGORY_LABELS = {
  agents: 'Agents',
  tools: 'Tools',
  workspace: 'Workspace',
  system: 'System',
}

const CATEGORY_COLORS = {
  agents: 'text-blue-500',
  tools: 'text-green-500',
  workspace: 'text-purple-500',
  system: 'text-orange-500',
}

export function CommandPalette({ onSelectCommand }: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const { isCommandPaletteOpen, closeCommandPalette } = useStore()

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCommandPaletteOpen) {
        closeCommandPalette()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCommandPaletteOpen, closeCommandPalette])

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    const searchLower = search.toLowerCase()
    return COMMANDS.filter(
      (cmd) =>
        cmd.cmd.toLowerCase().includes(searchLower) ||
        cmd.desc.toLowerCase().includes(searchLower) ||
        cmd.category.toLowerCase().includes(searchLower)
    )
  }, [search])

  // Group by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {
      agents: [],
      tools: [],
      workspace: [],
      system: [],
    }

    filteredCommands.forEach((cmd) => {
      groups[cmd.category].push(cmd)
    })

    return groups
  }, [filteredCommands])

  const handleSelectCommand = (cmd: string) => {
    onSelectCommand(cmd)
    closeCommandPalette()
    setSearch('')
  }

  if (!isCommandPaletteOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={closeCommandPalette}
      />

      {/* Bottom Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] animate-slide-up">
        <div className="rounded-t-3xl border-t border-border bg-card shadow-2xl">
          {/* Handle */}
          <div className="flex justify-center py-3">
            <div className="h-1.5 w-12 rounded-full bg-muted" />
          </div>

          {/* Header */}
          <div className="border-b border-border px-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Command className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Commands</h2>
              </div>
              <button
                onClick={closeCommandPalette}
                className="rounded-lg p-2 hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search commands..."
                className={cn(
                  'w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-4',
                  'text-base placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                autoFocus
              />
            </div>
          </div>

          {/* Commands List */}
          <div className="max-h-[calc(80vh-180px)] overflow-y-auto scrollbar-thin">
            {filteredCommands.length === 0 ? (
              <div className="py-12 text-center">
                <Command className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-3 text-muted-foreground">No commands found</p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {Object.entries(groupedCommands).map(([category, commands]) => {
                  if (commands.length === 0) return null

                  return (
                    <div key={category} className="space-y-1">
                      {/* Category Header */}
                      <div className="px-3 py-2">
                        <p
                          className={cn(
                            'text-xs font-semibold uppercase tracking-wider',
                            CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS]
                          )}
                        >
                          {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
                        </p>
                      </div>

                      {/* Commands */}
                      {commands.map((cmd) => (
                        <button
                          key={cmd.cmd}
                          onClick={() => handleSelectCommand(cmd.cmd)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-3',
                            'text-left transition-colors',
                            'hover:bg-accent active:bg-accent/80'
                          )}
                        >
                          <div
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                              'bg-secondary'
                            )}
                          >
                            <span className={CATEGORY_COLORS[cmd.category]}>
                              {cmd.icon}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{cmd.cmd}</div>
                            <div className="text-sm text-muted-foreground truncate">
                              {cmd.desc}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Safe bottom padding */}
          <div className="safe-bottom h-2" />
        </div>
      </div>
    </>
  )
}
