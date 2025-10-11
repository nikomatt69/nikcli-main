'use client'

import { memo } from 'react'
import { cn, formatRelativeTime, getStatusColor, getStatusIcon } from '../lib/utils'
import type { BackgroundJob } from '../hooks/useJobList'

interface JobItemProps {
  job: BackgroundJob
  isSelected: boolean
  onSelect: (jobId: string) => void
}

function JobItem({ job, isSelected, onSelect }: JobItemProps) {
  const getStatusIconComponent = (status: string) => {
    const iconName = getStatusIcon(status)
    // Import icons dynamically to reduce bundle size
    switch (iconName) {
      case 'clock':
        return <div className="w-4 h-4 text-gray-500">⏰</div>
      case 'loader-2':
        return <div className="w-4 h-4 text-blue-500 animate-spin">⟳</div>
      case 'check-circle':
        return <div className="w-4 h-4 text-green-500">✓</div>
      case 'x-circle':
        return <div className="w-4 h-4 text-red-500">✗</div>
      case 'alert-triangle':
        return <div className="w-4 h-4 text-orange-500">⚠</div>
      default:
        return null
    }
  }

  return (
    <button
      onClick={() => onSelect(job.id)}
      className={cn(
        'w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200',
        isSelected && 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-600'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {getStatusIconComponent(job.status)}
          <span className="font-medium text-gray-900 dark:text-white truncate">{job.repo}</span>
        </div>
        <span className={cn('text-xs px-2 py-1 rounded-full flex-shrink-0', getStatusColor(job.status))}>
          {job.status}
        </span>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">{job.task}</p>
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>{formatRelativeTime(job.createdAt)}</span>
        {job.metrics && <span>{job.metrics.toolCalls} calls</span>}
        {job.workBranch && <span className="font-mono">{job.workBranch}</span>}
      </div>
    </button>
  )
}

export default memo(JobItem)