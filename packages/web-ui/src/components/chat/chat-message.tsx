/**
 * ChatMessage Component
 * Display a single chat message with markdown and code highlighting
 */

import { motion } from 'framer-motion'
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
    <motion.div
      className={cn(
        'flex gap-3 p-4 rounded-2xl transition-all duration-200',
        'backdrop-blur-sm shadow-lg',
        isUser
          ? 'bg-gradient-to-br from-primary/10 to-accent/5 border border-primary/20'
          : 'bg-card/80 border border-border/50'
      )}
      style={{
        boxShadow: isUser
          ? '0 4px 16px rgba(99, 102, 241, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
          : '0 4px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        willChange: 'transform',
      }}
      whileHover={{
        scale: 1.005,
        boxShadow: isUser
          ? '0 8px 24px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          : '0 8px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
      }}
      transition={{ duration: 0.2 }}
    >
      {/* Avatar */}
      <motion.div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-lg',
          isUser
            ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground'
            : 'bg-gradient-to-br from-accent to-accent/80 text-accent-foreground',
          isStreaming && 'pulse-holo'
        )}
        style={{
          boxShadow: isUser
            ? '0 4px 12px rgba(99, 102, 241, 0.3)'
            : '0 4px 12px rgba(168, 85, 247, 0.3)',
          willChange: 'transform',
        }}
        whileHover={{ scale: 1.1, rotate: 5 }}
        transition={{ type: 'spring', stiffness: 300 }}
      >
        {isUser ? <UserIcon className="h-4 w-4" /> : <BotIcon className="h-4 w-4" />}
      </motion.div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium">
            {isUser ? 'You' : 'Background Agent'}
          </span>
          {isStreaming && (
            <Badge variant="outline" className="text-xs" pulse>
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
          <motion.div
            className="mt-3 space-y-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {message.toolCalls.map((tool, index) => (
              <motion.div
                key={tool.id}
                className="text-xs bg-accent/30 rounded-xl p-3 border border-border/50 backdrop-blur-sm"
                style={{
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{
                  x: 4,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                }}
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
                    pulse={tool.status !== 'completed' && tool.status !== 'failed'}
                  >
                    {tool.status}
                  </Badge>
                </div>
                {tool.affectedFiles && tool.affectedFiles.length > 0 && (
                  <div className="mt-1 text-muted-foreground">
                    Files: {tool.affectedFiles.join(', ')}
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
