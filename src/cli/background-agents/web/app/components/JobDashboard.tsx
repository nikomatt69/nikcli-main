'use client'

import { useState } from 'react'
import { Clock, CheckCircle, XCircle, Loader, AlertTriangle, Play } from 'lucide-react'
import type { BackgroundJob } from '../hooks/useJobList'

interface JobDashboardProps {
    jobs: BackgroundJob[]
    selectedJobId?: string
    onSelectJob: (jobId: string) => void
    onCreateNew: () => void
}

export default function JobDashboard({
    jobs,
    selectedJobId,
    onSelectJob,
    onCreateNew,
}: JobDashboardProps) {
    const [filter, setFilter] = useState<'all' | 'queued' | 'running' | 'succeeded' | 'failed'>(
        'all'
    )

    const filteredJobs =
        filter === 'all' ? jobs : jobs.filter((job) => job.status === filter)

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'queued':
                return <Clock className="w-4 h-4 text-gray-500" />
            case 'running':
                return <Loader className="w-4 h-4 text-blue-500 animate-spin" />
            case 'succeeded':
                return <CheckCircle className="w-4 h-4 text-green-500" />
            case 'failed':
                return <XCircle className="w-4 h-4 text-red-500" />
            case 'timeout':
                return <AlertTriangle className="w-4 h-4 text-orange-500" />
            default:
                return null
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'queued':
                return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            case 'running':
                return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
            case 'succeeded':
                return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
            case 'failed':
                return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
            case 'timeout':
                return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
            default:
                return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
        }
    }

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
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Background Agents</h1>
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

            {/* Filters */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex gap-2 overflow-x-auto">
                {(['all', 'queued', 'running', 'succeeded', 'failed'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filter === f
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
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
                            <button
                                key={job.id}
                                onClick={() => onSelectJob(job.id)}
                                className={`w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${selectedJobId === job.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                    }`}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {getStatusIcon(job.status)}
                                        <span className="font-medium text-gray-900 dark:text-white">{job.repo}</span>
                                    </div>
                                    <span
                                        className={`text-xs px-2 py-1 rounded-full ${getStatusColor(job.status)}`}
                                    >
                                        {job.status}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                                    {job.task}
                                </p>
                                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                    <span>{new Date(job.createdAt).toLocaleString()}</span>
                                    {job.metrics && (
                                        <span>{job.metrics.toolCalls} calls</span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

