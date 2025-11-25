// src/cli/background-agents/api/mobile/mobile-routes.ts
// Mobile-optimized API routes for NikCLI

import { Router, type Request, type Response } from 'express'
import { headlessMode } from '../../../modes/headless-mode'
import type {
  HeadlessCommand,
  HeadlessResponse,
  ApprovalResponse,
} from '../../../modes/headless-mode'
import { nanoid } from 'nanoid'

export interface MobileAPIConfig {
  maxMessageSize?: number
  streamTimeout?: number
  enableCompression?: boolean
}

/**
 * Create mobile routes router
 */
export function createMobileRouter(config: MobileAPIConfig = {}): Router {
  const router = Router()

  // Configuration defaults
  const maxMessageSize = config.maxMessageSize || 50000 // 50KB max message
  const streamTimeout = config.streamTimeout || 30000 // 30s timeout

  /**
   * POST /api/mobile/chat/send
   * Send a message or command
   */
  router.post('/chat/send', async (req: Request, res: Response) => {
    try {
      const { message, sessionId, userId, workspaceId, options } = req.body

      // Validation
      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          error: 'INVALID_MESSAGE',
          message: 'Message is required and must be a string',
        })
      }

      if (message.length > maxMessageSize) {
        return res.status(400).json({
          error: 'MESSAGE_TOO_LARGE',
          message: `Message exceeds maximum size of ${maxMessageSize} bytes`,
        })
      }

      // Generate session ID if not provided
      const finalSessionId = sessionId || `mobile_${nanoid()}`

      // Build command
      const command: HeadlessCommand = {
        command: message,
        sessionId: finalSessionId,
        userId,
        workspaceId,
        options: {
          streaming: false, // Non-streaming for simple POST
          ...options,
        },
      }

      // Execute command
      const response: HeadlessResponse = await headlessMode.executeCommand(command)

      // Return response
      res.json({
        success: response.success,
        sessionId: response.sessionId,
        messages: response.messages,
        metadata: response.metadata,
        error: response.error,
      })
    } catch (error) {
      console.error('Error in /chat/send:', error)
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * GET /api/mobile/chat/stream
   * Server-Sent Events for streaming responses
   */
  router.get('/chat/stream', async (req: Request, res: Response) => {
    const { sessionId } = req.query

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        error: 'INVALID_SESSION',
        message: 'Valid sessionId is required',
      })
    }

    // Setup SSE
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`)

    // Listen for stream chunks
    const chunkHandler = (data: any) => {
      if (data.sessionId === sessionId) {
        res.write(`data: ${JSON.stringify(data)}\n\n`)
      }
    }

    const messageHandler = (data: any) => {
      if (data.sessionId === sessionId) {
        res.write(`data: ${JSON.stringify({ type: 'message', ...data })}\n\n`)
      }
    }

    headlessMode.on('stream:chunk', chunkHandler)
    headlessMode.on('message', messageHandler)

    // Cleanup on close
    req.on('close', () => {
      headlessMode.removeListener('stream:chunk', chunkHandler)
      headlessMode.removeListener('message', messageHandler)
    })

    // Timeout protection
    setTimeout(() => {
      res.write(`data: ${JSON.stringify({ type: 'timeout' })}\n\n`)
      res.end()
    }, streamTimeout)
  })

  /**
   * POST /api/mobile/chat/command
   * Execute a slash command
   */
  router.post('/chat/command', async (req: Request, res: Response) => {
    try {
      const { command, sessionId, userId, workspaceId, options } = req.body

      if (!command || !command.startsWith('/')) {
        return res.status(400).json({
          error: 'INVALID_COMMAND',
          message: 'Command must start with /',
        })
      }

      const finalSessionId = sessionId || `mobile_${nanoid()}`

      const cmd: HeadlessCommand = {
        command,
        sessionId: finalSessionId,
        userId,
        workspaceId,
        options,
      }

      const response = await headlessMode.executeCommand(cmd)

      res.json(response)
    } catch (error) {
      console.error('Error in /chat/command:', error)
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * GET /api/mobile/sessions
   * List active sessions
   */
  router.get('/sessions', async (req: Request, res: Response) => {
    try {
      const sessions = headlessMode.getActiveSessions()

      res.json({
        success: true,
        sessions: sessions.map((id) => ({
          id,
          messages: headlessMode.getSessionMessages(id).length,
        })),
      })
    } catch (error) {
      console.error('Error in /sessions:', error)
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * POST /api/mobile/sessions/create
   * Create a new session
   */
  router.post('/sessions/create', async (req: Request, res: Response) => {
    try {
      const { userId, workspaceId, metadata } = req.body
      const sessionId = `mobile_${nanoid()}`

      // Session will be created on first message
      res.json({
        success: true,
        sessionId,
        metadata: {
          userId,
          workspaceId,
          ...metadata,
        },
      })
    } catch (error) {
      console.error('Error in /sessions/create:', error)
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * GET /api/mobile/sessions/:sessionId/messages
   * Get session messages
   */
  router.get('/sessions/:sessionId/messages', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params
      const messages = headlessMode.getSessionMessages(sessionId)

      res.json({
        success: true,
        sessionId,
        messages,
      })
    } catch (error) {
      console.error('Error in /sessions/:sessionId/messages:', error)
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * DELETE /api/mobile/sessions/:sessionId
   * Close a session
   */
  router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params
      await headlessMode.closeSession(sessionId)

      res.json({
        success: true,
        sessionId,
      })
    } catch (error) {
      console.error('Error in DELETE /sessions/:sessionId:', error)
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * GET /api/mobile/approvals
   * Get pending approvals for session
   */
  router.get('/approvals', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.query

      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({
          error: 'INVALID_SESSION',
          message: 'Valid sessionId is required',
        })
      }

      const approvals = headlessMode.getPendingApprovals(sessionId)

      res.json({
        success: true,
        approvals,
      })
    } catch (error) {
      console.error('Error in /approvals:', error)
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * POST /api/mobile/approvals/respond
   * Respond to an approval request
   */
  router.post('/approvals/respond', async (req: Request, res: Response) => {
    try {
      const { id, approved, reason } = req.body

      if (!id || typeof approved !== 'boolean') {
        return res.status(400).json({
          error: 'INVALID_RESPONSE',
          message: 'id and approved (boolean) are required',
        })
      }

      const response: ApprovalResponse = {
        id,
        approved,
        reason,
      }

      headlessMode.respondToApproval(response)

      res.json({
        success: true,
        response,
      })
    } catch (error) {
      console.error('Error in /approvals/respond:', error)
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * GET /api/mobile/health
   * Health check endpoint
   */
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      success: true,
      status: 'healthy',
      mode: 'mobile',
      timestamp: new Date().toISOString(),
    })
  })

  return router
}
