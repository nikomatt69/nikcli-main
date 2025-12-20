'use client'

import { type ChatMessage } from '@/lib/store'
import { cn } from '@/lib/utils'
import { CodeBlock } from './CodeBlock'
import { User, Bot, AlertCircle, Wrench } from 'lucide-react'

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.type === 'user'
  const isSystem = message.type === 'system'
  const isError = message.type === 'error'
  const isTool = message.type === 'tool'

  // Parse content for code blocks
  const hasCodeBlock = message.content.includes('```')

  return (
    <div
      className={cn(
        'flex w-full gap-3 px-4 py-3',
        isUser && 'flex-row-reverse'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser && 'bg-primary',
          !isUser && !isSystem && 'bg-muted',
          isSystem && 'bg-accent',
          isError && 'bg-destructive'
        )}
      >
        {isUser && <User className="h-4 w-4 text-primary-foreground" />}
        {!isUser && !isSystem && !isError && !isTool && <Bot className="h-4 w-4" />}
        {isSystem && <AlertCircle className="h-4 w-4" />}
        {isTool && <Wrench className="h-4 w-4" />}
        {isError && <AlertCircle className="h-4 w-4 text-destructive-foreground" />}
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex max-w-[85%] flex-col gap-2',
          isUser && 'items-end'
        )}
      >
        {/* Message bubble */}
        <div
          className={cn(
            'message-bubble',
            isUser && 'message-bubble-user',
            !isUser && 'message-bubble-assistant',
            isError && 'bg-destructive/10 text-destructive',
            isSystem && 'bg-accent text-accent-foreground text-sm'
          )}
        >
          {hasCodeBlock ? (
            <MessageContent content={message.content} />
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>

        {/* Metadata */}
        {message.metadata && (
          <div className="flex gap-2 text-xs text-muted-foreground">
            {message.metadata.toolsUsed && message.metadata.toolsUsed.length > 0 && (
              <span>🔧 {message.metadata.toolsUsed.join(', ')}</span>
            )}
            {message.metadata.tokensUsed && (
              <span>📊 {message.metadata.tokensUsed} tokens</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g)

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w+)?\n([\s\S]*?)```/)
          if (match) {
            const [, language = 'text', code] = match
            return <CodeBlock key={index} code={code.trim()} language={language} />
          }
        }
        return part.trim() ? (
          <p key={index} className="whitespace-pre-wrap break-words">
            {part}
          </p>
        ) : null
      })}
    </div>
  )
}
