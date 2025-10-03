'use client'

import { motion } from 'framer-motion'
import { Activity, AlertCircle, CheckCircle2, Clock, PlayCircle, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card } from '../components/ui/card'
import { useApiClient } from '../lib/api-client'
import type { JobStats } from '../lib/api-client'
import { useWebSocket } from '../lib/websocket-context'

export function DashboardPage() {
  const apiClient = useApiClient()
  const { connected } = useWebSocket()
  const [stats, setStats] = useState<JobStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [])

  async function loadStats() {
    try {
      const response = await apiClient.getStats()
      if (response.data) {
        setStats(response.data)
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    )
  }

  const statsCards = [
    {
      title: 'Total Jobs',
      value: stats?.total || 0,
      icon: Activity,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Running',
      value: stats?.running || 0,
      icon: PlayCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Queued',
      value: stats?.queued || 0,
      icon: Clock,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
    },
    {
      title: 'Succeeded',
      value: stats?.succeeded || 0,
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
    {
      title: 'Failed',
      value: stats?.failed || 0,
      icon: XCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
    {
      title: 'Cancelled',
      value: stats?.cancelled || 0,
      icon: AlertCircle,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
  ]

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Background Agents Dashboard</h1>
          <p className="text-muted-foreground mt-1">Monitor and manage your background agent jobs</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`h-3 w-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
          <span className="text-sm text-muted-foreground">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statsCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="p-4 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="p-4 border border-border rounded-lg hover:bg-accent transition-colors text-left"
            onClick={() => (window.location.href = '/jobs/new')}
          >
            <PlayCircle className="h-8 w-8 text-primary mb-2" />
            <h3 className="font-semibold">Create New Job</h3>
            <p className="text-sm text-muted-foreground mt-1">Start a new background agent task</p>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="p-4 border border-border rounded-lg hover:bg-accent transition-colors text-left"
            onClick={() => (window.location.href = '/jobs')}
          >
            <Activity className="h-8 w-8 text-primary mb-2" />
            <h3 className="font-semibold">View All Jobs</h3>
            <p className="text-sm text-muted-foreground mt-1">Monitor job status and logs</p>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="p-4 border border-border rounded-lg hover:bg-accent transition-colors text-left"
            onClick={() => (window.location.href = '/config')}
          >
            <Activity className="h-8 w-8 text-primary mb-2" />
            <h3 className="font-semibold">Configuration</h3>
            <p className="text-sm text-muted-foreground mt-1">Manage settings and integrations</p>
          </motion.button>
        </div>
      </Card>

      {/* System Status */}
      {stats && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">System Status</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Active Jobs</span>
              <span className="font-medium">{stats.running}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Success Rate</span>
              <span className="font-medium">
                {stats.total > 0 ? ((stats.succeeded / stats.total) * 100).toFixed(1) : 0}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last Updated</span>
              <span className="font-medium">{new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
