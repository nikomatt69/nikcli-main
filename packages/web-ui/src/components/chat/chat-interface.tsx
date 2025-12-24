/**
 * ChatInterface Component
 * Main chat interface with 3-column layout: chat + file changes + tool approvals
 */

import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
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
    <motion.div
      className="flex h-full overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <motion.div
          className="border-b border-border p-4 flex items-center justify-between glass-effect"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <div>
            <h2 className="text-lg font-semibold">{session.repo}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                pulse={session.status === 'active'}
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
                <Badge variant="outline" className="text-xs" pulse>
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse" />
                  Connected
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XIcon className="h-4 w-4" />
          </Button>
        </motion.div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <motion.div
            className="space-y-4"
            initial="hidden"
            animate="visible"
            variants={{
              visible: {
                transition: {
                  staggerChildren: 0.05,
                },
              },
            }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {messages.map((msg, index) => {
                // Only animate recent messages to avoid performance issues
                const shouldAnimate = messages.length - index <= 10
                return (
                  <motion.div
                    key={msg.id}
                    initial={shouldAnimate ? { opacity: 0, y: 20 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{
                      delay: shouldAnimate ? Math.min(index * 0.03, 0.3) : 0,
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                  >
                    <ChatMessage message={msg} />
                  </motion.div>
                )
              })}

              {/* Streaming message */}
              {isStreaming && streamingMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
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
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </motion.div>
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
      <motion.div
        className="w-96 border-l border-border flex flex-col glass-effect md:block hidden"
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        {/* Pending tool approvals */}
        <AnimatePresence>
          {pendingApprovals.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  Tool Approvals
                  <Badge variant="destructive" pulse>{pendingApprovals.length}</Badge>
                </h3>
              </div>
              <motion.div
                className="p-4 space-y-3 border-b border-border"
                initial="hidden"
                animate="visible"
                variants={{
                  visible: {
                    transition: {
                      staggerChildren: 0.1,
                    },
                  },
                }}
              >
                {pendingApprovals.map((approval) => (
                  <motion.div
                    key={approval.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ToolApprovalCard
                      approval={approval}
                      onApprove={(approved) => handleApproveTool(approval.id, approved)}
                      isProcessing={approveToolMutation.isPending}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* File changes */}
        <FileChangesPanel fileChanges={fileChanges} />
      </motion.div>
    </motion.div>
  )
}
