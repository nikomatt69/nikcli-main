// api/jobs/index.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { backgroundAgentService } from '../../src/cli/background-agents/background-agent-service'

/**
 * GET /api/jobs - List all jobs with optional filtering
 * GET /api/jobs?status=running - Filter by status
 * GET /api/jobs?limit=10 - Limit results
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const { status, limit = '20', offset = '0' } = req.query

    const jobs = backgroundAgentService.listJobs({
      status: status as any,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    })

    const stats = backgroundAgentService.getStats()

    return res.status(200).json({
      jobs: jobs.map((job) => ({
        id: job.id,
        repo: job.repo,
        task: job.task,
        status: job.status,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        prUrl: job.prUrl,
        containerId: job.containerId,
        metrics: {
          tokenUsage: job.metrics.tokenUsage,
          toolCalls: job.metrics.toolCalls,
          executionTime: job.metrics.executionTime,
        },
        githubContext: job.githubContext
          ? {
              issueNumber: job.githubContext.issueNumber,
              repository: job.githubContext.repository,
              author: job.githubContext.author,
            }
          : undefined,
      })),
      stats,
      pagination: {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        total: jobs.length,
      },
    })
  } catch (error: any) {
    console.error('Error listing jobs:', error)

    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to list jobs',
    })
  }
}
