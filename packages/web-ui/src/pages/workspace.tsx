/**
 * Workspace Page
 * Real integration with backend API for job management and repository operations
 */

import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/main-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  FolderOpen,
  GitBranch,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Play,
  XCircle,
} from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { supabase } from '@/lib/supabase'
import type { BackgroundJob } from '@/types/jobs'

interface Repository {
  name: string
  owner: string
  fullName: string
  branch: string
  lastSync: Date
  status: 'active' | 'syncing' | 'error' | 'idle'
  jobsCount: number
}

export default function WorkspacePage() {
  const [loading, setLoading] = useState(true)
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [jobs, setJobs] = useState<BackgroundJob[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [newRepoUrl, setNewRepoUrl] = useState('')
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [stats, setStats] = useState({
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    activeJobs: 0,
  })

  useEffect(() => {
    let isMounted = true

    const loadDataSafe = async () => {
      if (isMounted) {
        await loadData()
      }
    }

    loadDataSafe()
    const interval = setInterval(loadDataSafe, 5000) // Refresh every 5s

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, []) // loadData is stable, no need to include

  const loadData = async () => {
    try {
      setLoading(true)

      // Load jobs from backend
      const jobsRes = await apiClient.get<{ jobs: BackgroundJob[]; total: number }>('/v1/jobs')

      if (!jobsRes.success || !jobsRes.data) {
        const errorMsg = jobsRes.error?.message || 'Failed to load jobs'
        // Only show error toast if we've loaded successfully before (not initial load failure)
        if (hasLoadedOnce || jobsRes.error?.code !== 'NETWORK_ERROR') {
          toast.error(errorMsg)
        }
        console.error('Failed to load jobs:', jobsRes.error)
        return
      }

      const fetchedJobs = jobsRes.data.jobs

      setJobs(fetchedJobs)

      // Extract unique repositories from jobs
      const repoMap = new Map<string, Repository>()

      for (const job of fetchedJobs) {
        // Validate repo format (must be owner/name)
        const parts = job.repo.split('/')
        if (parts.length !== 2) {
          console.warn(`[Workspace] Invalid repo format: ${job.repo}`)
          continue
        }

        const [owner, name] = parts

        if (!repoMap.has(job.repo)) {
          const repoJobs = fetchedJobs.filter((j) => j.repo === job.repo)
          const latestJob = repoJobs.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0]

          let status: Repository['status'] = 'idle'
          if (latestJob.status === 'running' || latestJob.status === 'queued') status = 'syncing'
          else if (latestJob.status === 'failed') status = 'error'
          else if (latestJob.status === 'succeeded') status = 'active'

          repoMap.set(job.repo, {
            name,
            owner,
            fullName: job.repo,
            branch: job.baseBranch,
            lastSync: new Date(latestJob.completedAt || latestJob.createdAt),
            status,
            jobsCount: repoJobs.length,
          })
        }
      }

      const repos = Array.from(repoMap.values())
      setRepositories(repos)

      // Handle selectedRepo state
      if (repos.length > 0) {
        if (!selectedRepo) {
          // No repo selected, select first
          setSelectedRepo(repos[0])
        } else {
          // Check if current selectedRepo still exists
          const stillExists = repos.find((r) => r.fullName === selectedRepo.fullName)
          if (!stillExists) {
            // Selected repo was removed, select first available
            setSelectedRepo(repos[0])
          } else {
            // Update selectedRepo with latest data
            setSelectedRepo(stillExists)
          }
        }
      } else {
        // No repos, clear selection
        setSelectedRepo(null)
      }

      // Calculate stats
      setStats({
        totalJobs: fetchedJobs.length,
        completedJobs: fetchedJobs.filter((j) => j.status === 'succeeded').length,
        failedJobs: fetchedJobs.filter((j) => j.status === 'failed').length,
        activeJobs: fetchedJobs.filter((j) => j.status === 'running').length,
      })
      
      // Mark as successfully loaded
      setHasLoadedOnce(true)
    } catch (error) {
      console.error('Failed to load workspace data:', error)
      // Only show error toast if we've loaded successfully before (not initial load failure)
      if (hasLoadedOnce) {
        toast.error('Failed to load workspace data')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleAddRepo = async () => {
    if (!newRepoUrl.trim()) {
      toast.error('Please enter a repository name')
      return
    }

    // Extract owner/repo from URL or direct input
    let repoName = newRepoUrl.trim()
    if (repoName.includes('github.com/')) {
      const match = repoName.match(/github\.com\/([^\/]+\/[^\/]+)/)
      if (match) {
        repoName = match[1].replace('.git', '')
      }
    }

    // Validate format (must be owner/repo)
    const parts = repoName.split('/')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      toast.error('Invalid repository format. Use: owner/repo or GitHub URL')
      return
    }

    // Check if already exists
    const exists = repositories.find((r) => r.fullName === repoName)
    if (exists) {
      toast.error(`Repository ${repoName} already added`)
      return
    }

    try {
      // Load user preferences for model and API key
      let headers: Record<string, string> = {}
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.id) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('preferences')
            .eq('id', session.user.id)
            .single()

          if (profile?.preferences) {
            const prefs = profile.preferences as any
            if (prefs.api_keys?.openrouterModel) {
              headers['x-ai-model'] = prefs.api_keys.openrouterModel
            }
            if (prefs.api_keys?.openrouter) {
              headers['x-ai-provider'] = 'openrouter'
              headers['x-ai-key'] = prefs.api_keys.openrouter
            }
          }
        }
      } catch (error) {
        console.error('Failed to load user preferences:', error)
      }

      // Create a new job for this repository
      const rawClient = apiClient.getRawClient()
      const response = await rawClient.post('/v1/jobs', {
        repo: repoName,
        task: 'Initialize repository workspace',
        baseBranch: 'main',
      }, { headers })
      
      const res = {
        success: true,
        data: response.data,
      }

      if (!res.success) {
        throw new Error('Failed to add repository')
      }

      toast.success(`Repository ${repoName} added successfully`)
      setNewRepoUrl('')
      await loadData()
    } catch (error) {
      console.error('Failed to add repository:', error)
      toast.error('Failed to add repository')
    }
  }

  const handleSyncRepo = async (repo: Repository) => {
    try {
      // Load user preferences for model and API key
      let headers: Record<string, string> = {}
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.id) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('preferences')
            .eq('id', session.user.id)
            .single()

          if (profile?.preferences) {
            const prefs = profile.preferences as any
            if (prefs.api_keys?.openrouterModel) {
              headers['x-ai-model'] = prefs.api_keys.openrouterModel
            }
            if (prefs.api_keys?.openrouter) {
              headers['x-ai-provider'] = 'openrouter'
              headers['x-ai-key'] = prefs.api_keys.openrouter
            }
          }
        }
      } catch (error) {
        console.error('Failed to load user preferences:', error)
      }

      const rawClient = apiClient.getRawClient()
      const response = await rawClient.post('/v1/jobs', {
        repo: repo.fullName,
        task: 'Sync repository',
        baseBranch: repo.branch,
      }, { headers })
      
      const res = {
        success: true,
        data: response.data,
      }

      if (!res.success) {
        throw new Error('Failed to sync repository')
      }

      toast.success(`Syncing ${repo.owner}/${repo.name}...`)
      await loadData()
    } catch (error) {
      console.error('Failed to sync repository:', error)
      toast.error('Failed to sync repository')
    }
  }

  const handleCancelJob = async (jobId: string) => {
    try {
      const res = await apiClient.delete(`/v1/jobs/${jobId}`)

      if (!res.success) {
        throw new Error('Failed to cancel job')
      }

      toast.success('Job cancelled')
      await loadData()
    } catch (error) {
      console.error('Failed to cancel job:', error)
      toast.error('Failed to cancel job')
    }
  }

  const getStatusBadge = (status: Repository['status'] | BackgroundJob['status']) => {
    switch (status) {
      case 'active':
      case 'succeeded':
        return (
          <Badge variant="default" className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            Active
          </Badge>
        )
      case 'syncing':
      case 'running':
      case 'queued':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Running
          </Badge>
        )
      case 'error':
      case 'failed':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Error
          </Badge>
        )
      case 'cancelled':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Cancelled
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Idle
          </Badge>
        )
    }
  }

  const filteredRepos = repositories.filter(
    (repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.owner.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const repoJobs = selectedRepo ? jobs.filter((j) => j.repo === selectedRepo.fullName) : []

  if (loading && repositories.length === 0) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="flex h-full overflow-hidden">
        {/* Left sidebar - Repository list */}
        <div className="w-80 border-r border-border bg-card flex flex-col min-h-0">
          <div className="p-4 border-b border-border flex-shrink-0">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Workspaces
            </h2>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Add new repo */}
            <div className="space-y-2">
              <Input
                placeholder="owner/repo or GitHub URL"
                value={newRepoUrl}
                onChange={(e) => setNewRepoUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddRepo()
                  }
                }}
              />
              <Button onClick={handleAddRepo} className="w-full" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Repository
              </Button>
            </div>
          </div>

          {/* Repository list */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 space-y-1">
              {filteredRepos.length === 0 ? (
                <div className="text-center p-6 text-muted-foreground">
                  <p className="text-sm">No repositories found</p>
                  <p className="text-xs mt-2">Add a repository to get started</p>
                </div>
              ) : (
                filteredRepos.map((repo) => (
                  <div
                    key={repo.fullName}
                    className={`p-3 rounded-lg cursor-pointer ${
                      selectedRepo?.fullName === repo.fullName
                        ? 'bg-accent border border-primary'
                        : 'hover:bg-accent'
                    }`}
                    onClick={() => setSelectedRepo(repo)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium truncate">
                          {repo.owner}/{repo.name}
                        </h3>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <GitBranch className="h-3 w-3" />
                          {repo.branch}
                        </div>
                      </div>
                      {getStatusBadge(repo.status)}
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{repo.jobsCount} jobs</span>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                      <Clock className="h-3 w-3" />
                      Updated {Math.round((Date.now() - repo.lastSync.getTime()) / 60000)}m ago
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-h-0">
          {selectedRepo ? (
            <>
              {/* Header */}
              <div className="border-b border-border p-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold">
                      {selectedRepo.owner}/{selectedRepo.name}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                      Branch: {selectedRepo.branch} • {selectedRepo.jobsCount} jobs
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSyncRepo(selectedRepo)}
                      disabled={selectedRepo.status === 'syncing'}
                    >
                      <RefreshCw
                        className={`h-4 w-4 mr-2 ${selectedRepo.status === 'syncing' ? 'animate-spin' : ''}`}
                      />
                      Sync
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => loadData()}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </div>
              </div>

              {/* Content area */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="p-6">
                  <div className="space-y-6 max-w-4xl">
                    {/* Repository Stats */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Workspace Statistics</CardTitle>
                        <CardDescription>Overview of all repositories and jobs</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-4 gap-4">
                          <div className="text-center">
                            <div className="text-3xl font-bold text-primary">{stats.totalJobs}</div>
                            <div className="text-xs text-muted-foreground mt-1">Total Jobs</div>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold text-green-600">{stats.completedJobs}</div>
                            <div className="text-xs text-muted-foreground mt-1">Completed</div>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold text-blue-600">{stats.activeJobs}</div>
                            <div className="text-xs text-muted-foreground mt-1">Running</div>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold text-red-600">{stats.failedJobs}</div>
                            <div className="text-xs text-muted-foreground mt-1">Failed</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Recent Jobs */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Recent Jobs</CardTitle>
                        <CardDescription>Jobs for {selectedRepo.fullName}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {repoJobs.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              <p className="text-sm">No jobs found for this repository</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-4"
                                onClick={() => handleSyncRepo(selectedRepo)}
                              >
                                <Play className="h-4 w-4 mr-2" />
                                Create First Job
                              </Button>
                            </div>
                          ) : (
                            repoJobs.slice(0, 10).map((job) => (
                              <div
                                key={job.id}
                                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium truncate">{job.task}</p>
                                    {getStatusBadge(job.status)}
                                  </div>
                                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                    <span>ID: {job.id.slice(0, 8)}</span>
                                    <span>
                                      Created: {new Date(job.createdAt).toLocaleString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                    {job.completedAt && (
                                      <span>
                                        Completed: {new Date(job.completedAt).toLocaleString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                    )}
                                  </div>
                                  {job.error && (
                                    <p className="text-xs text-destructive mt-1 truncate">{job.error}</p>
                                  )}
                                </div>
                                <div className="flex gap-2 ml-4">
                                  {job.status === 'running' && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleCancelJob(job.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Repository Info */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Repository Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-muted-foreground">Repository</Label>
                            <p className="text-sm font-medium">{selectedRepo.fullName}</p>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">Default Branch</Label>
                            <p className="text-sm font-medium">{selectedRepo.branch}</p>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">Status</Label>
                            <div className="mt-1">{getStatusBadge(selectedRepo.status)}</div>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">Total Jobs</Label>
                            <p className="text-sm font-medium">{selectedRepo.jobsCount}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <FolderOpen className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>Select a repository to view details</p>
                <p className="text-sm mt-2">or add a new one to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  )
}
