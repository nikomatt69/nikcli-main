'use client'

import { motion } from 'framer-motion'
import { Activity, AlertCircle, CheckCircle2, Clock, ExternalLink, Play, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card } from '../components/ui/card'
import type { BackgroundJob } from '../lib/api-client'
import { useApiClient } from '../lib/api-client'
import { useWebSocket } from '../lib/websocket-context'

type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout'

export function JobsListPage() {
  const apiClient = useApiClient()
  const { connected, subscribe } = useWebSocket()
  const [jobs, setJobs] = useState<BackgroundJob[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all')

  useEffect(() => {
    loadJobs()

    // Subscribe to job updates via WebSocket
    const unsubscribe = subscribe((message) => {
      if (message.type.startsWith('job:')) {
        loadJobs() // Reload jobs on any job event
      }
    })

    return () => unsubscribe()
  }, [statusFilter])

  async function loadJobs() {
    try {
      const params = statusFilter !== 'all' ? { status: statusFilter } : {}
      const response = await apiClient.getJobs(params)
      if (response.jobs) {
        setJobs(response.jobs)
      }
    } catch (error) {
      console.error('Failed to load jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  function getStatusIcon(status: JobStatus) {
    switch (status) {
      case 'running':
        return <Play className="h-4 w-4 text-green-500 animate-pulse" />
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-500" />
      case 'succeeded':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      case 'failed':
      case 'timeout':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-orange-500" />
      default:
        return null
    }
  }

  function getStatusColor(status: JobStatus) {
    switch (status) {
      case 'running':
        return 'bg-green-500/10 text-green-500'
      case 'queued':
        return 'bg-yellow-500/10 text-yellow-500'
      case 'succeeded':
        return 'bg-emerald-500/10 text-emerald-500'
      case 'failed':
      case 'timeout':
        return 'bg-red-500/10 text-red-500'
      case 'cancelled':
        return 'bg-orange-500/10 text-orange-500'
      default:
        return 'bg-gray-500/10 text-gray-500'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Background Jobs</h1>
          <p className="text-muted-foreground mt-1">Monitor and manage all background agent jobs</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
          onClick={() => (window.location.href = '/jobs/new')}
        >
          Create New Job
        </motion.button>
      </div>

      {/* Status Filter */}
      <Card className="p-4">
        <div className="flex items-center space-x-2 overflow-x-auto">
          {['all', 'running', 'queued', 'succeeded', 'failed', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                statusFilter === status
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </Card>

      {/* Jobs List */}
      <div className="space-y-4">
        {jobs.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No jobs found</p>
              <p className="text-sm mt-2">Create a new background job to get started</p>
            </div>
          </Card>
        ) : (
          jobs.map((job, index) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      {getStatusIcon(job.status)}
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(job.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold mb-2">{job.task}</h3>

                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>Repository: {job.repo}</span>
                      <span>Branch: {job.workBranch}</span>
                      {job.prUrl && (
                        <a
                          href={job.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-1 text-primary hover:underline"
                        >
                          <span>View PR</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    {job.error && (
                      <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-sm text-red-500">{job.error}</p>
                      </div>
                    )}

                    <div className="mt-4 flex items-center space-x-6 text-sm">
                      <div>
                        <span className="text-muted-foreground">Tool Calls: </span>
                        <span className="font-medium">{job.metrics.toolCalls}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tokens: </span>
                        <span className="font-medium">{job.metrics.tokenUsage.toLocaleString()}</span>
                      </div>
                      {job.metrics.executionTime > 0 && (
                        <div>
                          <span className="text-muted-foreground">Duration: </span>
                          <span className="font-medium">{(job.metrics.executionTime / 1000).toFixed(1)}s</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="ml-4 px-4 py-2 bg-accent text-foreground rounded-lg font-medium hover:bg-accent/80 transition-colors"
                    onClick={() => (window.location.href = `/jobs/${job.id}`)}
                  >
                    View Details
                  </motion.button>
                </div>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Connection Status */}
      {!connected && (
        <div className="fixed bottom-4 right-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-500">WebSocket disconnected - updates may be delayed</p>
        </div>
      )}
    </div>
  )
}
