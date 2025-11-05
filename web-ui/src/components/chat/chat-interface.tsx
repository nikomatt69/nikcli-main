/**
 * ChatInterface Component
 * Main chat interface with 3-column layout: chat + file changes + tool approvals
 */

import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { SendIcon, XIcon, GitPullRequestIcon } from 'lucide-react'
import { ChatMessage } from './chat-message'
import { FileChangesPanel } from './file-changes-panel'
import { ToolApprovalCard } from './tool-approval-card'
import { useSSEStream } from '@/hooks/useSSEStream'
import { sendChatMessage, approveTool } from '@/lib/chat-client'
import { toast } from 'sonner'
import type { ChatSession, ChatMessage as ChatMessageType, FileChange, PendingToolApproval } from '@/types/chat'

export interface ChatInterfaceProps {
  session: ChatSession
  onClose: () => void
}

export function ChatInterface({ session, onClose }: ChatInterfaceProps) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [streamingMessage, setStreamingMessage] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [messages, setMessages] = useState<ChatMessageType[]>(session.messages)
  const [fileChanges, setFileChanges] = useState<FileChange[]>(session.fileChanges)
  const [pendingApprovals, setPendingApprovals] = useState<PendingToolApproval[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingMessage])

  // SSE connection
  const { isConnected } = useSSEStream({
    sessionId: session.id,
    enabled: session.status === 'active',
    onTextDelta: (delta, accumulated) => {
      setStreamingMessage(accumulated)
      setIsStreaming(true)
    },
    onTextComplete: (msg) => {
      setMessages((prev) => [...prev, msg])
      setStreamingMessage('')
      setIsStreaming(false)
    },
    onToolApprovalRequired: (approval: PendingToolApproval) => {
      setPendingApprovals((prev) => [...prev, approval])
      toast.info('Tool approval required')
    },
    onToolResult: (result: any) => {
      setPendingApprovals((prev) => prev.filter((a) => a.id !== result.approvalId))
    },
    onFileChange: (change: FileChange) => {
      setFileChanges((prev) => [...prev, change])
    },
    onStatusUpdate: (status) => {
      console.log('[Chat] Status update:', status)
    },
    onError: (error) => {
      toast.error(error.message || 'Chat error occurred')
    },
    onSessionComplete: () => {
      toast.success('Session completed')
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
    },
  })

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: () => {
      setMessage('')
      textareaRef.current?.focus()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send message')
    },
  })

  // Approve tool mutation
  const approveToolMutation = useMutation({
    mutationFn: approveTool,
    onError: (error: any) => {
      toast.error(error.message || 'Failed to approve tool')
    },
  })

  const handleSendMessage = () => {
    if (!message.trim() || sendMessageMutation.isPending) return

    sendMessageMutation.mutate({
      sessionId: session.id,
      message: message.trim(),
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleApproveTool = (approvalId: string, approved: boolean) => {
    approveToolMutation.mutate({
      sessionId: session.id,
      toolApprovalId: approvalId,
      approved,
    })
  }

  return (
    <div className="flex h-full">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-border p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{session.repo}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant={
                  session.status === 'active'
                    ? 'default'
                    : session.status === 'completed'
                    ? 'secondary'
                    : 'destructive'
                }
              >
                {session.status}
              </Badge>
              {isConnected && (
                <Badge variant="outline" className="text-xs">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse" />
                  Connected
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {/* Streaming message */}
            {isStreaming && streamingMessage && (
              <ChatMessage
                message={{
                  id: 'streaming',
                  sessionId: session.id,
                  role: 'assistant',
                  content: streamingMessage,
                  timestamp: new Date(),
                  streamComplete: false,
                }}
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Shift+Enter for new line)"
              className="flex-1 min-h-[80px] max-h-[200px]"
              disabled={session.status !== 'active' || sendMessageMutation.isPending}
            />
            <Button
              onClick={handleSendMessage}
              disabled={
                !message.trim() ||
                session.status !== 'active' ||
                sendMessageMutation.isPending
              }
              size="icon"
              className="h-[80px] w-[80px]"
            >
              <SendIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Right sidebar - Tool approvals and file changes */}
      <div className="w-96 border-l border-border flex flex-col">
        {/* Pending tool approvals */}
        {pendingApprovals.length > 0 && (
          <>
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                Tool Approvals
                <Badge variant="destructive">{pendingApprovals.length}</Badge>
              </h3>
            </div>
            <div className="p-4 space-y-3 border-b border-border">
              {pendingApprovals.map((approval) => (
                <ToolApprovalCard
                  key={approval.id}
                  approval={approval}
                  onApprove={(approved) => handleApproveTool(approval.id, approved)}
                  isProcessing={approveToolMutation.isPending}
                />
              ))}
            </div>
          </>
        )}

        {/* File changes */}
        <FileChangesPanel fileChanges={fileChanges} />
      </div>
    </div>
  )
}
