// api/jobs/[jobId].ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { backgroundAgentService } from '../../src/cli/background-agents/background-agent-service'

/**
 * GET /api/jobs/:jobId - Get job status
 * GET /api/jobs/:jobId/logs - Get job logs (streaming)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { jobId } = req.query

  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({
      error: 'Invalid job ID',
    })
  }

  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only GET requests are supported',
    })
  }

  try {
    // Check if requesting logs
    const isLogsRequest = req.url?.includes('/logs')

    const job = backgroundAgentService.getJob(jobId)

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        jobId,
      })
    }

    // Return logs if requested
    if (isLogsRequest) {
      return res.status(200).json({
        jobId: job.id,
        logs: job.logs,
        totalLogs: job.logs.length,
      })
    }

    // Return full job status
    return res.status(200).json({
      id: job.id,
      repo: job.repo || job.repo,
      task: job.task,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      prUrl: job.prUrl,
      containerId: job.containerId,
      metrics: job.metrics,
      githubContext: job.githubContext,
      error: job.error,
      logsCount: job.logs.length,
    })
  } catch (error: any) {
    console.error('Error fetching job:', error)

    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to fetch job',
    })
  }
}
