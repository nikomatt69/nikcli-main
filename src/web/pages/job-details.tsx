'use client'

import { motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MessageSquare,
  Play,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import type { BackgroundJob } from '../lib/api-client'
import { useApiClient } from '../lib/api-client'
import { useWebSocket } from '../lib/websocket-context'

interface JobDetailsPageProps {
  jobId: string
}

export function JobDetailsPage({ jobId }: JobDetailsPageProps) {
  const apiClient = useApiClient()
  const { connected, subscribe } = useWebSocket()
  const [job, setJob] = useState<BackgroundJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [followUpMessage, setFollowUpMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadJob()

    // Subscribe to real-time updates
    const unsubscribe = subscribe((message) => {
      if (message.type.includes('job:') && message.data?.id === jobId) {
        loadJob()
      }
    })

    return () => unsubscribe()
  }, [jobId])

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [job?.logs])

  async function loadJob() {
    try {
      const response = await apiClient.getJob(jobId)
      if (response.data?.job) {
        setJob(response.data.job)
      }
    } catch (error) {
      console.error('Failed to load job:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSendFollowUp() {
    if (!followUpMessage.trim()) return

    setSendingMessage(true)
    try {
      await apiClient.sendFollowUpMessage(jobId, followUpMessage, 'normal')
      setFollowUpMessage('')
      loadJob()
    } catch (error) {
      console.error('Failed to send follow-up:', error)
    } finally {
      setSendingMessage(false)
    }
  }

  async function handleCancelJob() {
    if (!confirm('Are you sure you want to cancel this job?')) return

    try {
      await apiClient.cancelJob(jobId)
      loadJob()
    } catch (error) {
      console.error('Failed to cancel job:', error)
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'running':
        return <Play className="h-5 w-5 text-green-500 animate-pulse" />
      case 'queued':
        return <Clock className="h-5 w-5 text-yellow-500" />
      case 'succeeded':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />
      case 'failed':
      case 'timeout':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'cancelled':
        return <AlertCircle className="h-5 w-5 text-orange-500" />
      default:
        return null
    }
  }

  function getLogLevelColor(level: string) {
    switch (level) {
      case 'error':
        return 'text-red-500'
      case 'warn':
        return 'text-yellow-500'
      case 'info':
        return 'text-blue-500'
      case 'debug':
        return 'text-gray-500'
      default:
        return 'text-foreground'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Job Not Found</h2>
          <p className="text-muted-foreground">The requested job could not be found.</p>
          <button
            onClick={() => (window.location.href = '/jobs')}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
          >
            Back to Jobs
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            {getStatusIcon(job.status)}
            <h1 className="text-3xl font-bold text-foreground">{job.task}</h1>
          </div>
          <p className="text-muted-foreground">Job ID: {job.id}</p>
        </div>

        {job.status === 'running' && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCancelJob}
            className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
          >
            Cancel Job
          </motion.button>
        )}
      </div>

      {/* Job Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Repository</p>
          <p className="font-medium">{job.repo}</p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Branch</p>
          <p className="font-medium">{job.workBranch}</p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Status</p>
          <p className="font-medium capitalize">{job.status}</p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Created</p>
          <p className="font-medium">{new Date(job.createdAt).toLocaleString()}</p>
        </Card>
      </div>

      {/* Metrics */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Tool Calls</p>
            <p className="text-2xl font-bold">{job.metrics.toolCalls}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Token Usage</p>
            <p className="text-2xl font-bold">{job.metrics.tokenUsage.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Memory Usage</p>
            <p className="text-2xl font-bold">{job.metrics.memoryUsage} MB</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Execution Time</p>
            <p className="text-2xl font-bold">
              {job.metrics.executionTime > 0 ? `${(job.metrics.executionTime / 1000).toFixed(1)}s` : '-'}
            </p>
          </div>
        </div>
      </Card>

      {/* PR Link */}
      {job.prUrl && (
        <Card className="p-4">
          <a
            href={job.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between hover:text-primary transition-colors"
          >
            <div className="flex items-center space-x-3">
              <ExternalLink className="h-5 w-5" />
              <div>
                <p className="font-semibold">Pull Request Created</p>
                <p className="text-sm text-muted-foreground">{job.prUrl}</p>
              </div>
            </div>
            <span className="text-sm text-primary">View →</span>
          </a>
        </Card>
      )}

      {/* Error Display */}
      {job.error && (
        <Card className="p-4 bg-red-500/10 border-red-500/20">
          <div className="flex items-start space-x-3">
            <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <div>
              <p className="font-semibold text-red-500">Error</p>
              <p className="text-sm text-red-500 mt-1">{job.error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Logs */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Logs</h2>
        <div className="bg-black/90 rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-sm">
          {job.logs.length === 0 ? (
            <p className="text-gray-500">No logs yet...</p>
          ) : (
            <div className="space-y-1">
              {job.logs.map((log, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <span className="text-gray-500 text-xs whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`text-xs font-semibold uppercase ${getLogLevelColor(log.level)}`}>
                    [{log.level}]
                  </span>
                  <span className="text-gray-300 flex-1">{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </Card>

      {/* Follow-up Messages */}
      {job.status === 'running' && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center space-x-2">
            <MessageSquare className="h-5 w-5" />
            <span>Send Follow-up Message</span>
          </h2>
          <div className="flex items-center space-x-3">
            <Input
              type="text"
              placeholder="Send a message to the running agent..."
              value={followUpMessage}
              onChange={(e) => setFollowUpMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendFollowUp()}
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSendFollowUp}
              disabled={sendingMessage || !followUpMessage.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center space-x-2"
            >
              {sendingMessage && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Send</span>
            </motion.button>
          </div>
        </Card>
      )}

      {/* Connection Status */}
      {!connected && (
        <div className="fixed bottom-4 right-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-500">WebSocket disconnected - updates may be delayed</p>
        </div>
      )}
    </div>
  )
}
