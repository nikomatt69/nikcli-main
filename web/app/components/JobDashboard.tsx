'use client'

import { Play, Search } from 'lucide-react'
import { useState, useMemo } from 'react'
import type { BackgroundJob } from '../hooks/useJobList'
import SubscriptionBadge from './SubscriptionBadge'
import JobItem from './JobItem'
import { cn } from '../lib/utils'

interface JobDashboardProps {
  jobs: BackgroundJob[]
  selectedJobId?: string
  onSelectJob: (jobId: string) => void
  onCreateNew: () => void
  userId?: string
  onUpgradeClick?: () => void
}

export default function JobDashboard({ jobs, selectedJobId, onSelectJob, onCreateNew, userId, onUpgradeClick }: JobDashboardProps) {
  const [filter, setFilter] = useState<'all' | 'queued' | 'running' | 'succeeded' | 'failed'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredJobs = useMemo(() => {
    let filtered = filter === 'all' ? jobs : jobs.filter((job) => job.status === filter)
    
    if (searchQuery) {
      filtered = filtered.filter((job) => 
        job.repo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.task.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.workBranch.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    return filtered
  }, [jobs, filter, searchQuery])


  const stats = {
    total: jobs.length,
    queued: jobs.filter((j) => j.status === 'queued').length,
    running: jobs.filter((j) => j.status === 'running').length,
    succeeded: jobs.filter((j) => j.status === 'succeeded').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Background Agents</h1>
            <SubscriptionBadge userId={userId} onUpgradeClick={onUpgradeClick} />
          </div>
          <button
            onClick={onCreateNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            New Agent
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-600 dark:text-gray-400' },
            { label: 'Queued', value: stats.queued, color: 'text-gray-600 dark:text-gray-400' },
            { label: 'Running', value: stats.running, color: 'text-blue-600 dark:text-blue-400' },
            {
              label: 'Succeeded',
              value: stats.succeeded,
              color: 'text-green-600 dark:text-green-400',
            },
            { label: 'Failed', value: stats.failed, color: 'text-red-600 dark:text-red-400' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10 pr-4"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {(['all', 'queued', 'running', 'succeeded', 'failed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                filter === f
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Jobs List */}
      <div className="flex-1 overflow-y-auto">
        {filteredJobs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <Play className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No jobs found</p>
              <p className="text-sm mt-1">Create a new background agent to get started</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredJobs.map((job) => (
              <JobItem
                key={job.id}
                job={job}
                isSelected={selectedJobId === job.id}
                onSelect={onSelectJob}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
