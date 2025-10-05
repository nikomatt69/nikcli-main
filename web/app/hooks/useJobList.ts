'use client'

import { useEffect, useState } from 'react'
import { useWebSocket } from './useWebSocket'

export interface BackgroundJob {
  id: string
  repo: string
  baseBranch: string
  workBranch: string
  task: string
  playbook?: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout'
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  error?: string
  logs: any[]
  prUrl?: string
  metrics: {
    tokenUsage: number
    toolCalls: number
    executionTime: number
    memoryUsage: number
  }
}

export function useJobList() {
  const [jobs, setJobs] = useState<BackgroundJob[]>([])
  const [loading, setLoading] = useState(true)
  const { lastMessage } = useWebSocket()

  // Fetch initial jobs
  useEffect(() => {
    fetch('/api/jobs')
      .then((res) => res.json())
      .then((data) => {
        setJobs(data.jobs || [])
        setLoading(false)
      })
      .catch((error) => {
        console.error('Failed to fetch jobs:', error)
        setLoading(false)
      })
  }, [])

  // Update jobs based on WebSocket messages
  useEffect(() => {
    if (!lastMessage) return

    const { type, data } = lastMessage

    switch (type) {
      case 'job:created':
        setJobs((prev) => [data, ...prev])
        break

      case 'job:started':
      case 'job:completed':
      case 'job:failed':
      case 'job:timeout':
        setJobs((prev) => prev.map((job) => (job.id === data.id ? data : job)))
        break

      case 'job:log':
        setJobs((prev) =>
          prev.map((job) => {
            if (job.id === data.jobId) {
              return {
                ...job,
                logs: [...job.logs, data.logEntry],
              }
            }
            return job
          })
        )
        break
    }
  }, [lastMessage])

  return { jobs, loading, setJobs }
}
