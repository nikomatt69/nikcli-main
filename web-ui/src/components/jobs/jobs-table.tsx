import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { wsClient } from '@/lib/websocket'
import { BackgroundJob, JobListFilters } from '@/types/jobs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, XCircle } from 'lucide-react'
import { formatRelativeTime, formatDuration, getStatusBadgeColor } from '@/lib/utils'
import { toast } from 'sonner'
import JobDetailsDialog from './job-details-dialog'

interface JobsTableProps {
  filters: JobListFilters
}

export default function JobsTable({ filters }: JobsTableProps) {
  const [selectedJob, setSelectedJob] = useState<BackgroundJob | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)

  const { data: response, isLoading, refetch, error } = useQuery({
    queryKey: ['jobs', filters],
    queryFn: async () => {
      const result = await apiClient.get<{ jobs: BackgroundJob[]; total: number; offset: number; limit: number } | BackgroundJob[]>('/v1/jobs', { params: filters })
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch jobs')
      }
      return result.data
    },
    refetchInterval: 5000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false, // Reduce unnecessary refetches
  })

  // Safely extract jobs array - handle both response formats
  // Backend returns: { jobs: [...], total, offset, limit } or BackgroundJob[]
  // Response is already unwrapped data from apiClient.get
  let jobs: BackgroundJob[] = []
  if (response) {
    if (Array.isArray(response)) {
      jobs = response
    } else if ('jobs' in response && Array.isArray(response.jobs)) {
      jobs = response.jobs
    }
  }

  // Listen to WebSocket updates
  useEffect(() => {
    const unsubscribe = wsClient.onMessageType('job:created', () => refetch())
    const unsubscribe2 = wsClient.onMessageType('job:started', () => refetch())
    const unsubscribe3 = wsClient.onMessageType('job:completed', () => refetch())
    const unsubscribe4 = wsClient.onMessageType('job:failed', () => refetch())

    return () => {
      unsubscribe()
      unsubscribe2()
      unsubscribe3()
      unsubscribe4()
    }
  }, [refetch])

  const handleCancelJob = async (jobId: string) => {
    const result = await apiClient.delete(`/v1/jobs/${jobId}`)
    if (result.success) {
      toast.success('Job cancelled successfully')
      refetch()
    } else {
      toast.error(result.error?.message || 'Failed to cancel job')
    }
  }

  const handleViewDetails = (job: BackgroundJob) => {
    setSelectedJob(job)
    setIsDetailsOpen(true)
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-3">
          <Eye className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">No jobs found</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {filters.repo
            ? 'Try adjusting your filters'
            : 'Create a new background job to get started'}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-sm text-muted-foreground">
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 pr-4 font-medium">Repository</th>
              <th className="pb-3 pr-4 font-medium">Task</th>
              <th className="pb-3 pr-4 font-medium">Created</th>
              <th className="pb-3 pr-4 font-medium">Duration</th>
              <th className="pb-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {jobs.map((job) => (
              <tr key={job.id} className="group hover:bg-accent/50">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className={`status-indicator ${job.status}`} />
                    <Badge className={getStatusBadgeColor(job.status)}>
                      {job.status}
                    </Badge>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <div className="font-mono text-sm">{job.repo}</div>
                  {job.workBranch && (
                    <div className="text-xs text-muted-foreground">{job.workBranch}</div>
                  )}
                </td>
                <td className="py-3 pr-4 max-w-md">
                  <div className="truncate text-sm">{job.task}</div>
                  {job.playbook && (
                    <div className="text-xs text-muted-foreground">
                      Playbook: {job.playbook}
                    </div>
                  )}
                </td>
                <td className="py-3 pr-4 text-sm text-muted-foreground">
                  {formatRelativeTime(job.createdAt)}
                </td>
                <td className="py-3 pr-4 text-sm">
                  {job.completedAt && job.startedAt
                    ? formatDuration(
                      new Date(job.completedAt).getTime() -
                      new Date(job.startedAt).getTime()
                    )
                    : job.startedAt
                      ? formatDuration(Date.now() - new Date(job.startedAt).getTime())
                      : '-'}
                </td>
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewDetails(job)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {(job.status === 'queued' || job.status === 'running') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelJob(job.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedJob && (
        <JobDetailsDialog
          job={selectedJob}
          open={isDetailsOpen}
          onOpenChange={setIsDetailsOpen}
        />
      )}
    </>
  )
}
