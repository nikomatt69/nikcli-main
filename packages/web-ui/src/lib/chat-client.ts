/**
 * Chat API Client
 * REST API calls for chat session management
 */

import { apiClient } from './api-client'
import type {
  ApproveToolRequest,
  ApproveToolResponse,
  ChatSession,
  CreateChatSessionRequest,
  CreateChatSessionResponse,
  SendMessageRequest,
  SendMessageResponse,
} from '@/types/chat'

/**
 * Create a new chat session
 */
export async function createChatSession(
  request: CreateChatSessionRequest
): Promise<CreateChatSessionResponse> {
  const response = await apiClient.post<CreateChatSessionResponse>(
    '/v1/chat/sessions',
    request
  )

  if (!response.data) {
    throw new Error('No data returned from createChatSession')
  }

  return response.data
}

/**
 * Get all chat sessions for a user
 */
export async function getChatSessions(userId?: string): Promise<{ sessions: ChatSession[] }> {
  const response = await apiClient.get<ChatSession[] | { success: boolean; sessions: ChatSession[] }>(
    '/v1/chat/sessions',
    {
      params: userId ? { userId } : undefined,
    }
  )

  if (!response.success || !response.data) {
    console.error('getChatSessions error:', response.error)
    return { sessions: [] }
  }

  // Handle different response formats
  // Case 1: Direct array response
  if (Array.isArray(response.data)) {
    return { sessions: response.data }
  }

  // Case 2: Object with sessions property
  if (typeof response.data === 'object' && 'sessions' in response.data) {
    const sessions = (response.data as { sessions?: ChatSession[] }).sessions
    return { sessions: Array.isArray(sessions) ? sessions : [] }
  }

  // Fallback: empty array
  console.warn('getChatSessions: Unexpected response format', response.data)
  return { sessions: [] }
}

/**
 * Get a specific chat session
 */
export async function getChatSession(sessionId: string): Promise<{ session: ChatSession }> {
  const response = await apiClient.get<{ success: boolean; session: ChatSession }>(
    `/v1/chat/sessions/${sessionId}`
  )

  if (!response.data?.session) {
    throw new Error(`Session ${sessionId} not found`)
  }

  return { session: response.data.session }
}

/**
 * Send a message in a chat session
 */
export async function sendChatMessage(
  request: SendMessageRequest
): Promise<SendMessageResponse> {
  const response = await apiClient.post<SendMessageResponse>(
    `/v1/chat/sessions/${request.sessionId}/messages`,
    { message: request.message }
  )

  if (!response.data) {
    throw new Error('No data returned from sendChatMessage')
  }

  return response.data
}

/**
 * Approve or reject a tool call
 */
export async function approveTool(request: ApproveToolRequest): Promise<ApproveToolResponse> {
  const response = await apiClient.post<ApproveToolResponse>(
    `/v1/chat/sessions/${request.sessionId}/approve-tool`,
    {
      toolApprovalId: request.toolApprovalId,
      approved: request.approved,
    }
  )

  if (!response.data) {
    throw new Error('No data returned from approveTool')
  }

  return response.data
}

/**
 * Close a chat session
 */
export async function closeChatSession(sessionId: string): Promise<{ success: boolean }> {
  const response = await apiClient.delete<{ success: boolean }>(
    `/v1/chat/sessions/${sessionId}`
  )

  if (!response.data) {
    throw new Error('No data returned from closeChatSession')
  }

  return response.data
}
