/**
 * Chat Page
 * Interactive chat interface with background agents
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import MainLayout from '@/components/layout/main-layout'
import { ChatInterface } from '@/components/chat/chat-interface'
import { SessionList } from '@/components/chat/session-list'
import { NewSessionDialog } from '@/components/chat/new-session-dialog'
import { Button } from '@/components/ui/button'
import { PlusIcon } from 'lucide-react'
import { getChatSessions, createChatSession, closeChatSession } from '@/lib/chat-client'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import type { ChatSession, CreateChatSessionRequest } from '@/types/chat'

export default function ChatPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false)

  // Fetch chat sessions
  const {
    data: sessionsData,
    isLoading: isLoadingSessions,
    error: sessionsError,
  } = useQuery({
    queryKey: ['chat-sessions', user?.id],
    queryFn: () => getChatSessions(user?.id),
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  const sessions = sessionsData?.sessions || []

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: createChatSession,
    onSuccess: (response) => {
      if (response.success && response.session) {
        queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
        setSelectedSessionId(response.session.id)
        setNewSessionDialogOpen(false)
        toast.success('Chat session created successfully')
      } else {
        toast.error(response.error || 'Failed to create session')
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create session')
    },
  })

  // Close session mutation
  const closeSessionMutation = useMutation({
    mutationFn: closeChatSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
      toast.success('Session closed')
      setSelectedSessionId(null)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to close session')
    },
  })

  // Auto-select first session if none selected
  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(sessions[0].id)
    }
  }, [sessions, selectedSessionId])

  const handleCreateSession = (request: CreateChatSessionRequest) => {
    createSessionMutation.mutate({
      ...request,
      userId: user?.id,
    })
  }

  const handleCloseSession = (sessionId: string) => {
    if (confirm('Are you sure you want to close this session?')) {
      closeSessionMutation.mutate(sessionId)
    }
  }

  const selectedSession = sessions.find((s) => s.id === selectedSessionId)

  return (
    <MainLayout>
      <div className="flex h-full overflow-hidden">
        {/* Left sidebar - Session list */}
        <div className="w-80 border-r border-border bg-card flex flex-col min-h-0">
          <div className="p-4 border-b border-border flex-shrink-0">
            <Button
              onClick={() => setNewSessionDialogOpen(true)}
              className="w-full"
              size="sm"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              New Chat Session
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            <SessionList
              sessions={sessions}
              selectedSessionId={selectedSessionId}
              onSelectSession={setSelectedSessionId}
              onCloseSession={handleCloseSession}
              isLoading={isLoadingSessions}
            />
          </div>
        </div>

        {/* Main content - Chat interface */}
        <div className="flex-1 flex flex-col min-h-0">
          {selectedSession ? (
            <ChatInterface
              session={selectedSession}
              onClose={() => handleCloseSession(selectedSession.id)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-4">
                <p className="text-lg">No chat session selected</p>
                <Button onClick={() => setNewSessionDialogOpen(true)}>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create New Session
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New session dialog */}
      <NewSessionDialog
        open={newSessionDialogOpen}
        onOpenChange={setNewSessionDialogOpen}
        onSubmit={handleCreateSession}
        isCreating={createSessionMutation.isPending}
      />
    </MainLayout>
  )
}
