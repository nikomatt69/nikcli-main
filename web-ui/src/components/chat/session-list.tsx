/**
 * SessionList Component
 * Display list of chat sessions
 */

import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { XIcon, MessageSquare, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatSession } from '@/types/chat'
import { formatDistanceToNow } from 'date-fns'

export interface SessionListProps {
  sessions: ChatSession[]
  selectedSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  isLoading?: boolean
}

export function SessionList({
  sessions,
  selectedSessionId,
  onSelectSession,
  onCloseSession,
  isLoading,
}: SessionListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-muted-foreground">Loading sessions...</div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No chat sessions yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Create a new session to get started
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-2 space-y-1">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={cn(
              'group relative rounded-lg p-3 cursor-pointer transition-colors',
              'hover:bg-accent',
              selectedSessionId === session.id && 'bg-accent border border-primary'
            )}
            onClick={() => onSelectSession(session.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-medium truncate">
                    {session.repo}
                  </h3>
                  <Badge
                    variant={
                      session.status === 'active'
                        ? 'default'
                        : session.status === 'completed'
                        ? 'secondary'
                        : 'destructive'
                    }
                    className="text-xs"
                  >
                    {session.status}
                  </Badge>
                </div>

                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(session.updatedAt), {
                    addSuffix: true,
                  })}
                </div>

                <p className="text-xs text-muted-foreground mt-1">
                  {session.messages.length} messages
                  {session.fileChanges.length > 0 &&
                    ` • ${session.fileChanges.length} file changes`}
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseSession(session.id)
                }}
              >
                <XIcon className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
