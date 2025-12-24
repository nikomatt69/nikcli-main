/**
 * NikCLI Mobile - API Routes
 * Extends existing background-agents API with mobile-specific endpoints
 */

import { Router, type Request, type Response } from 'express'
import { agentService } from '../../services/agent-service'
import { streamttyService } from '../../services/streamtty-service'
import { diffManager } from '../../ui/diff-manager'
import { simpleConfigManager } from '../../core/config-manager'
import type { BackgroundJob } from '../types'

// Mobile-specific types
export interface MobileStatusResponse {
  connected: boolean
  workingDirectory: string
  activeAgents: number
  queuedTasks: number
  pendingDiffs: number
  contextLeft: number
  maxContext: number
  mode: {
    plan: boolean
    autoAccept: boolean
    vm: boolean
  }
  version: string
  timestamp: string
}

export interface MobileSendMessageRequest {
  content: string
  sessionId?: string
}

export interface MobileAgentLaunchRequest {
  agentName: string
  task: string
}

// Global mobile context state (shared with streaming-orchestrator)
const mobileContext = {
  planMode: false,
  autoAcceptEdits: true,
  vmMode: false,
  contextLeft: 100,
  maxContext: 100,
}

export function createMobileRouter(): Router {
  const router = Router()

  /**
   * GET /status
   * Get current system status for mobile app
   */
  router.get('/status', async (_req: Request, res: Response): Promise<void> => {
    try {
      const activeAgents = agentService.getActiveAgents()
      const queuedTasks = agentService.getQueuedTasks()
      const pendingDiffs = diffManager.getPendingCount()
      const config = simpleConfigManager.getConfig()

      const status: MobileStatusResponse = {
        connected: true,
        workingDirectory: process.cwd(),
        activeAgents: activeAgents.length,
        queuedTasks: queuedTasks.length,
        pendingDiffs,
        contextLeft: mobileContext.contextLeft,
        maxContext: mobileContext.maxContext,
        mode: {
          plan: mobileContext.planMode,
          autoAccept: mobileContext.autoAcceptEdits,
          vm: mobileContext.vmMode,
        },
        version: '1.6.0',
        timestamp: new Date().toISOString(),
      }

      res.json(status)
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * POST /send
   * Send a message to the AI system
   */
  router.post('/send', async (req: Request, res: Response): Promise<void> => {
    try {
      const { content, sessionId } = req.body as MobileSendMessageRequest

      if (!content || !content.trim()) {
        res.status(400).json({
          success: false,
          error: 'Message content is required',
        })
        return
      }

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      // Process the message through the streaming orchestrator if available
      const orchestrator = (global as any).__streamingOrchestrator
      if (orchestrator) {
        // Queue the message for processing
        orchestrator.queueVMMessage(content)
      }

      res.json({
        success: true,
        messageId,
        timestamp: new Date().toISOString(),
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * GET /agents
   * List all active agents
   */
  router.get('/agents', async (_req: Request, res: Response): Promise<void> => {
    try {
      const activeAgents = agentService.getActiveAgents()
      const queuedTasks = agentService.getQueuedTasks()

      const agents = activeAgents.map((agent: any) => ({
        id: agent.id,
        type: agent.agentType || agent.type,
        status: agent.status,
        task: agent.task,
        progress: agent.progress || 0,
        startedAt: agent.startedAt,
      }))

      res.json({
        success: true,
        agents,
        queued: queuedTasks.length,
        maxParallel: 3,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * POST /agents/launch
   * Launch a new agent with a task
   */
  router.post('/agents/launch', async (req: Request, res: Response): Promise<void> => {
    try {
      const { agentName, task } = req.body as MobileAgentLaunchRequest

      if (!agentName || !task) {
        res.status(400).json({
          success: false,
          error: 'agentName and task are required',
        })
        return
      }

      // Check capacity (max 3 parallel agents)
      const activeAgents = agentService.getActiveAgents()
      if (activeAgents.length >= 3) {
        res.status(429).json({
          success: false,
          error: 'Maximum concurrent agents reached (3/3). Task will be queued.',
          queued: true,
        })
        return
      }

      const taskId = await agentService.executeTask(agentName, task, {})

      res.json({
        success: true,
        agentId: taskId,
        agentName,
        status: 'running',
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * POST /agents/:id/stop
   * Stop a running agent
   */
  router.post('/agents/:id/stop', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      
      // Attempt to cancel the task
      const cancelled = await agentService.cancelTask(id)

      if (!cancelled) {
        res.status(404).json({
          success: false,
          error: `Agent ${id} not found or already stopped`,
        })
        return
      }

      res.json({
        success: true,
        stopped: true,
        agentId: id,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * GET /diffs
   * Get all pending diffs
   */
  router.get('/diffs', async (_req: Request, res: Response): Promise<void> => {
    try {
      const diffs = diffManager.getAllDiffs()

      res.json({
        success: true,
        diffs: diffs.map((diff: any) => ({
          id: diff.id,
          filePath: diff.filePath,
          additions: diff.additions || 0,
          deletions: diff.deletions || 0,
          status: diff.status || 'pending',
        })),
        total: diffs.length,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * POST /diffs/:id/accept
   * Accept a specific diff
   */
  router.post('/diffs/:id/accept', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      diffManager.acceptDiff(id)

      res.json({
        success: true,
        accepted: true,
        diffId: id,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * POST /diffs/:id/reject
   * Reject a specific diff
   */
  router.post('/diffs/:id/reject', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      diffManager.rejectDiff(id)

      res.json({
        success: true,
        rejected: true,
        diffId: id,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * POST /diffs/accept-all
   * Accept all pending diffs
   */
  router.post('/diffs/accept-all', async (_req: Request, res: Response): Promise<void> => {
    try {
      const count = diffManager.getPendingCount()
      diffManager.acceptAllDiffs()

      res.json({
        success: true,
        accepted: count,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * POST /mode/plan
   * Toggle plan mode
   */
  router.post('/mode/plan', async (_req: Request, res: Response): Promise<void> => {
    try {
      mobileContext.planMode = !mobileContext.planMode
      
      // Sync with global streaming orchestrator if available
      const orchestrator = (global as any).__streamingOrchestrator
      if (orchestrator && orchestrator.context) {
        orchestrator.context.planMode = mobileContext.planMode
      }

      res.json({
        success: true,
        planMode: mobileContext.planMode,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * POST /mode/auto-accept
   * Toggle auto-accept mode
   */
  router.post('/mode/auto-accept', async (_req: Request, res: Response): Promise<void> => {
    try {
      mobileContext.autoAcceptEdits = !mobileContext.autoAcceptEdits
      diffManager.setAutoAccept(mobileContext.autoAcceptEdits)

      res.json({
        success: true,
        autoAccept: mobileContext.autoAcceptEdits,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * POST /mode/vm
   * Toggle VM mode
   */
  router.post('/mode/vm', async (_req: Request, res: Response): Promise<void> => {
    try {
      mobileContext.vmMode = !mobileContext.vmMode

      // Sync with global streaming orchestrator if available
      const orchestrator = (global as any).__streamingOrchestrator
      if (orchestrator && orchestrator.context) {
        orchestrator.context.vmMode = mobileContext.vmMode
      }

      res.json({
        success: true,
        vmMode: mobileContext.vmMode,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * POST /command
   * Execute a slash command
   */
  router.post('/command', async (req: Request, res: Response): Promise<void> => {
    try {
      const { command, args = [] } = req.body

      if (!command) {
        res.status(400).json({
          success: false,
          error: 'Command is required',
        })
        return
      }

      let result: any = { executed: true }

      switch (command.toLowerCase()) {
        case 'status':
          const activeAgents = agentService.getActiveAgents()
          const queuedTasks = agentService.getQueuedTasks()
          result = {
            activeAgents: activeAgents.length,
            queuedTasks: queuedTasks.length,
            pendingDiffs: diffManager.getPendingCount(),
            mode: mobileContext,
          }
          break

        case 'clear':
          // Clear operation would be handled by streaming orchestrator
          result = { cleared: true }
          break

        case 'help':
          result = {
            commands: [
              '/status - Show current status',
              '/plan - Toggle plan mode',
              '/accept - Toggle auto-accept',
              '/vm - Toggle VM mode',
              '/clear - Clear messages',
              '/agents - List available agents',
            ],
          }
          break

        default:
          result = { error: `Unknown command: ${command}` }
      }

      res.json({
        success: true,
        command,
        result,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  })

  return router
}

// Export for use in main server
export const mobileRouter = createMobileRouter()
