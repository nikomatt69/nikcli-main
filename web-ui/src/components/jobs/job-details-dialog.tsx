import { useEffect, useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { BackgroundJob, JobLog } from '@/types/jobs'
import { getStatusBadgeColor, formatRelativeTime, formatDuration, formatNumber } from '@/lib/utils'
import { createJobLogStream } from '@/lib/sse-client'
import { Clock, Cpu, FileText, Activity, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface JobDetailsDialogProps {
  job: BackgroundJob
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function JobDetailsDialog({ job, open, onOpenChange }: JobDetailsDialogProps) {
  const [logs, setLogs] = useState<JobLog[]>(job.logs || [])
  const [currentJob, setCurrentJob] = useState(job)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    // Subscribe to log stream
    const sseClient = createJobLogStream(job.id)

    sseClient.onEventType('log', (logEntry: JobLog) => {
      setLogs(prev => [...prev, logEntry])

      // Auto-scroll to bottom
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }, 100)
    })

    sseClient.onEventType('job', (updatedJob: BackgroundJob) => {
      setCurrentJob(updatedJob)
    })

    sseClient.connect()

    return () => {
      sseClient.disconnect()
    }
  }, [job.id, open])

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400'
      case 'warn': return 'text-yellow-400'
      case 'info': return 'text-blue-400'
      case 'debug': return 'text-gray-400'
      default: return 'text-foreground'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DialogTitle>Job Details</DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {currentJob.id}
              </DialogDescription>
            </div>
            <Badge className={getStatusBadgeColor(currentJob.status)}>
              {currentJob.status}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="logs">Logs {logs.length > 0 && `(${logs.length})`}</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            {currentJob.artifacts.length > 0 && (
              <TabsTrigger value="artifacts">Artifacts ({currentJob.artifacts.length})</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Task Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Repository</div>
                  <div className="font-mono text-sm mt-1">{currentJob.repo}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Branches</div>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline">{currentJob.baseBranch}</Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant="outline">{currentJob.workBranch}</Badge>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Task</div>
                  <div className="text-sm mt-1">{currentJob.task}</div>
                </div>
                {currentJob.playbook && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Playbook</div>
                    <div className="font-mono text-sm mt-1">{currentJob.playbook}</div>
                  </div>
                )}
                {currentJob.prUrl && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Pull Request</div>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 mt-1"
                      asChild
                    >
                      <a href={currentJob.prUrl} target="_blank" rel="noopener noreferrer">
                        View PR <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  </div>
                )}
                {currentJob.error && (
                  <div>
                    <div className="text-sm font-medium text-red-400">Error</div>
                    <div className="text-sm text-red-300 mt-1 p-2 bg-red-500/10 rounded">
                      {currentJob.error}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>{formatRelativeTime(currentJob.createdAt)}</span>
                  </div>
                  {currentJob.startedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Started</span>
                      <span>{formatRelativeTime(currentJob.startedAt)}</span>
                    </div>
                  )}
                  {currentJob.completedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Completed</span>
                      <span>{formatRelativeTime(currentJob.completedAt)}</span>
                    </div>
                  )}
                  {currentJob.startedAt && currentJob.completedAt && (
                    <>
                      <Separator />
                      <div className="flex justify-between font-medium">
                        <span>Duration</span>
                        <span>
                          {formatDuration(
                            new Date(currentJob.completedAt).getTime() -
                              new Date(currentJob.startedAt).getTime()
                          )}
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    Limits
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time Limit</span>
                    <span>{currentJob.limits.timeMin} min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Tool Calls</span>
                    <span>{currentJob.limits.maxToolCalls}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Memory</span>
                    <span>{currentJob.limits.maxMemoryMB} MB</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <ScrollArea className="h-[400px] w-full rounded-lg border bg-muted/30 p-4" ref={scrollRef}>
              <div className="space-y-1 font-mono text-xs">
                {logs.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No logs available yet
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-muted-foreground shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`shrink-0 uppercase ${getLogLevelColor(log.level)}`}>
                        [{log.level}]
                      </span>
                      <span className="text-muted-foreground shrink-0">
                        {log.source}:
                      </span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="metrics" className="mt-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Token Usage', value: formatNumber(currentJob.metrics.tokenUsage), icon: Activity },
                { label: 'Tool Calls', value: formatNumber(currentJob.metrics.toolCalls), icon: Activity },
                { label: 'Execution Time', value: formatDuration(currentJob.metrics.executionTime), icon: Clock },
                { label: 'Memory Usage', value: `${currentJob.metrics.memoryUsage} MB`, icon: Cpu },
              ].map((metric) => {
                const Icon = metric.icon
                return (
                  <Card key={metric.label}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">{metric.label}</p>
                          <p className="text-2xl font-bold mt-1">{metric.value}</p>
                        </div>
                        <Icon className="h-8 w-8 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>

          {currentJob.artifacts.length > 0 && (
            <TabsContent value="artifacts" className="mt-4">
              <div className="space-y-2">
                {currentJob.artifacts.map((artifact, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <CardTitle className="text-sm">{artifact.path}</CardTitle>
                        </div>
                        <Badge variant="outline">{artifact.type}</Badge>
                      </div>
                      <CardDescription className="text-xs">
                        {(artifact.size / 1024).toFixed(2)} KB • Created {formatRelativeTime(artifact.createdAt)}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
