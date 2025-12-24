import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import JobsTable from './jobs-table'
import CreateJobDialog from './create-job-dialog'
import JobStatsCards from './job-stats-cards'
import JobFilters from './job-filters'
import { JobListFilters, JobStatus } from '@/types/jobs'

export default function JobsDashboard() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [filters, setFilters] = useState<JobListFilters>({})

  const handleFilterChange = (key: keyof JobListFilters, value: unknown) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }))
  }

  const handleStatusFilter = (status: JobStatus | 'all') => {
    if (status === 'all') {
      setFilters(prev => {
        const { status, ...rest } = prev
        return rest
      })
    } else {
      setFilters(prev => ({
        ...prev,
        status,
      }))
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Background Jobs</h1>
          <p className="text-muted-foreground">
            Monitor and manage your AI-powered development tasks
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Job
        </Button>
      </div>

      {/* Stats Cards */}
      <JobStatsCards onStatusClick={handleStatusFilter} />

      {/* Filters */}
      <JobFilters filters={filters} onFilterChange={handleFilterChange} />

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Jobs</CardTitle>
          <CardDescription>
            Real-time view of all background agent tasks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JobsTable filters={filters} />
        </CardContent>
      </Card>

      {/* Create Job Dialog */}
      <CreateJobDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  )
}
