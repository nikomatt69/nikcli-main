/**
 * Chat API Routes
 * Provides SSE streaming and REST endpoints for interactive chat sessions
 */

import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import type { ChatSessionService } from '../services/chat-session-service'
import type { SSEEvent } from '../types'

export function createChatRouter(chatSessionService: ChatSessionService): Router {
  const router = Router()

  /**
   * POST /sessions
   * Create a new chat session
   */
  router.post('/sessions', async (req: Request, res: Response): Promise<void> => {
    try {
      const { repo, baseBranch, initialMessage, userId } = req.body

      if (!repo) {
        res.status(400).json({
          success: false,
          error: 'Repository is required',
        })
        return
      }

      const session = await chatSessionService.createSession({
        repo,
        baseBranch,
        initialMessage,
        userId,
      })

      res.json({
        success: true,
        session,
      })
      return
    } catch (error: any) {
      console.error('[ChatRoutes] Error creating session:', error)
      res.status(500).json({
        success: false,
        error: error.message,
      })
      return
    }
  })

  /**
   * GET /sessions
   * List all chat sessions (optionally filtered by userId)
   */
  router.get('/sessions', (req: Request, res: Response): void => {
    try {
      const { userId } = req.query
      const sessions = chatSessionService.listSessions(userId as string | undefined)

      res.json({
        success: true,
        sessions,
      })
      return
    } catch (error: any) {
      console.error('[ChatRoutes] Error listing sessions:', error)
      res.status(500).json({
        success: false,
        error: error.message,
      })
      return
    }
  })

  /**
   * GET /sessions/:id
   * Get a specific chat session
   */
  router.get('/sessions/:id', (req: Request, res: Response): void => {
    try {
      const { id } = req.params
      const session = chatSessionService.getSession(id)

      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found',
        })
        return
      }

      res.json({
        success: true,
        session,
      })
      return
    } catch (error: any) {
      console.error('[ChatRoutes] Error getting session:', error)
      res.status(500).json({
        success: false,
        error: error.message,
      })
      return
    }
  })

  /**
   * POST /sessions/:id/messages
   * Send a message in a chat session
   */
  router.post('/sessions/:id/messages', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      const { message } = req.body

      if (!message) {
        res.status(400).json({
          success: false,
          error: 'Message is required',
        })
        return
      }

      const chatMessage = await chatSessionService.sendMessage({
        sessionId: id,
        message,
      })

      res.json({
        success: true,
        message: chatMessage,
      })
      return
    } catch (error: any) {
      console.error('[ChatRoutes] Error sending message:', error)
      res.status(500).json({
        success: false,
        error: error.message,
      })
      return
    }
  })

  /**
   * POST /sessions/:id/approve-tool
   * Approve or reject a tool call
   */
  router.post('/sessions/:id/approve-tool', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      const { toolApprovalId, approved } = req.body

      if (!toolApprovalId || typeof approved !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'toolApprovalId and approved (boolean) are required',
        })
        return
      }

      await chatSessionService.approveTool({
        sessionId: id,
        toolApprovalId,
        approved,
      })

      res.json({
        success: true,
        message: `Tool ${approved ? 'approved' : 'rejected'} successfully`,
      })
      return
    } catch (error: any) {
      console.error('[ChatRoutes] Error approving tool:', error)
      res.status(500).json({
        success: false,
        error: error.message,
      })
      return
    }
  })

  /**
   * DELETE /sessions/:id
   * Close a chat session
   */
  router.delete('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      await chatSessionService.closeSession(id)

      res.json({
        success: true,
        message: 'Session closed successfully',
      })
      return
    } catch (error: any) {
      console.error('[ChatRoutes] Error closing session:', error)
      res.status(500).json({
        success: false,
        error: error.message,
      })
      return
    }
  })

  /**
   * GET /sessions/:id/stream
   * SSE endpoint for real-time chat session updates
   */
  router.get('/sessions/:id/stream', (req: Request, res: Response): void => {
    const { id } = req.params
    const connectionId = uuidv4()

    // Verify session exists
    const session = chatSessionService.getSession(id)
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      })
      return
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering

    // Send initial connection event
    sendSSEEvent(res, {
      type: 'connection:established',
      data: {
        sessionId: id,
        connectionId,
        timestamp: new Date(),
      },
      timestamp: new Date(),
    })

    // Register connection
    chatSessionService.registerConnection(id, connectionId)

    // Listen for SSE events from the chat session service
    const onSSEEvent = ({ sessionId, event }: { sessionId: string; event: SSEEvent }) => {
      if (sessionId === id) {
        sendSSEEvent(res, event)
      }
    }

    chatSessionService.on('sse:event', onSSEEvent)

    // Handle client disconnect
    req.on('close', () => {
      console.log(`[ChatRoutes] SSE connection closed: ${connectionId}`)
      chatSessionService.unregisterConnection(id, connectionId)
      chatSessionService.off('sse:event', onSSEEvent)
      res.end()
    })

    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
      sendSSEEvent(res, {
        type: 'status:update',
        data: { heartbeat: true },
        timestamp: new Date(),
      })
    }, 30000) // Every 30 seconds

    req.on('close', () => {
      clearInterval(heartbeat)
    })
  })

  /**
   * Helper function to send SSE events
   */
  function sendSSEEvent(res: Response, event: SSEEvent): void {
    const data = JSON.stringify({
      type: event.type,
      data: event.data,
      timestamp: event.timestamp,
    })

    res.write(`event: ${event.type}\n`)
    res.write(`data: ${data}\n\n`)
  }

  return router
}
