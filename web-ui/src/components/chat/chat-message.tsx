/**
 * ChatMessage Component
 * Display a single chat message with markdown and code highlighting
 */

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ChatMessage as ChatMessageType } from '@/types/chat'
import { formatDistanceToNow } from 'date-fns'
import { UserIcon, BotIcon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism'

export interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isStreaming = !message.streamComplete

  return (
    <div
      className={cn(
        'flex gap-3 p-4 rounded-lg',
        isUser ? 'bg-accent/50' : 'bg-card border border-border'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
        )}
      >
        {isUser ? <UserIcon className="h-4 w-4" /> : <BotIcon className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium">
            {isUser ? 'You' : 'Background Agent'}
          </span>
          {isStreaming && (
            <Badge variant="outline" className="text-xs">
              <span className="w-2 h-2 bg-primary rounded-full mr-1 animate-pulse" />
              Streaming...
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
          </span>
        </div>

        {/* Message content with markdown */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown
            components={{
              code({ className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '')
                const isInline = !match

                return !isInline && match ? (
                  <SyntaxHighlighter
                    style={vscDarkPlus as any}
                    language={match[1]}
                    PreTag="div"
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                )
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Tool calls if any */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.toolCalls.map((tool) => (
              <div
                key={tool.id}
                className="text-xs bg-accent/50 rounded p-2 border border-border"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {tool.name}
                  </Badge>
                  <Badge
                    variant={
                      tool.status === 'completed'
                        ? 'default'
                        : tool.status === 'failed'
                        ? 'destructive'
                        : 'outline'
                    }
                    className="text-xs"
                  >
                    {tool.status}
                  </Badge>
                </div>
                {tool.affectedFiles && tool.affectedFiles.length > 0 && (
                  <div className="mt-1 text-muted-foreground">
                    Files: {tool.affectedFiles.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
