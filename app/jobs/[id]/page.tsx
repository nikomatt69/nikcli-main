'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MainLayout } from '../../../src/web/components/layout/main-layout';
import { Button } from '../../../src/web/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../src/web/components/ui/card';
import { useWebSocket } from '../../../src/web/lib/websocket-context';
import { WebBackgroundJob, WebJobLog } from '../../../src/web/types';
import {
  ArrowLeft,
  Play,
  Square,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  Github,
  Eye,
  Download,
  RefreshCw,
  AlertCircle,
  Info,
  Terminal,
  FileText,
  Code,
  Zap,
  Target,
  Timer,
  HardDrive,
  Cpu,
  Network,
  Database,
  Settings,
  ExternalLink,
  Copy,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import React from 'react';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { jobs, connected, subscribe } = useWebSocket();
  const [job, setJob] = useState<WebBackgroundJob | null>(null);
  const [logs, setLogs] = useState<WebJobLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'logs' | 'metrics' | 'artifacts'>('logs');
  const [autoScroll, setAutoScroll] = useState(true);

  const jobId = params.id as string;

  useEffect(() => {
    // Get job from WebSocket context
    const jobFromContext = jobs.get(jobId);
    if (jobFromContext) {
      setJob(jobFromContext);
      setLogs(jobFromContext.webLogs || []);
      setLoading(false);
    } else {
      // Fetch job from API if not in context
      fetchJob();
    }
  }, [jobId, jobs]);

  useEffect(() => {
    // Subscribe to real-time updates
    const unsubscribe = subscribe('job:log', (data) => {
      if (data.jobId === jobId) {
        setLogs(prev => [...prev, data.logEntry]);
      }
    });

    const unsubscribeJob = subscribe('job:completed', (data) => {
      if (data.id === jobId) {
        setJob(data);
      }
    });

    const unsubscribeFailed = subscribe('job:failed', (data) => {
      if (data.id === jobId) {
        setJob(data);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeJob();
      unsubscribeFailed();
    };
  }, [jobId, subscribe]);

  const fetchJob = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v1/web/jobs/${jobId}`);
      if (!response.ok) {
        throw new Error('Job not found');
      }
      const data = await response.json();
      setJob(data.job);
      setLogs(data.job.webLogs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch job');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelJob = async () => {
    try {
      const response = await fetch(`/api/v1/web/jobs/${jobId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await fetchJob();
      }
    } catch (err) {
      console.error('Error cancelling job:', err);
    }
  };

  const handleRetryJob = async () => {
    try {
      const response = await fetch(`/api/v1/web/jobs/${jobId}/retry`, {
        method: 'POST',
      });
      if (response.ok) {
        await fetchJob();
      }
    } catch (err) {
      console.error('Error retrying job:', err);
    }
  };

  const copyJobId = () => {
    navigator.clipboard.writeText(jobId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800';
      case 'failed':
        return 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800';
      case 'running':
        return 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800';
      case 'cancelled':
        return 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-900/20 dark:border-gray-800';
      default:
        return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/20 dark:border-yellow-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return CheckCircle;
      case 'failed':
        return XCircle;
      case 'running':
        return Activity;
      case 'cancelled':
        return Square;
      default:
        return Clock;
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }

  if (error || !job) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Job Not Found</h3>
            <p className="text-muted-foreground mb-4">{error || 'The requested job could not be found.'}</p>
            <Link href="/jobs">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Jobs
              </Button>
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  const StatusIcon = getStatusIcon(job.status);

  return (
    <MainLayout>
      <div className="min-h-full p-4 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-6">
            <Link href="/jobs">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
                  Job Details
                </h1>
                <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border text-sm font-medium ${getStatusColor(job.status)}`}>
                  <StatusIcon className="h-4 w-4" />
                  <span className="capitalize">{job.status}</span>
                </div>
              </div>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                <span>ID: {jobId.substring(0, 8)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyJobId}
                  className="h-6 px-2 text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy ID
                </Button>
                <span>•</span>
                <span>Created: {new Date(job.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Job Info Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center space-x-3">
                <Terminal className="h-6 w-6 text-primary" />
                <span>Task Description</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground text-lg leading-relaxed mb-4">
                {job.task}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-3">
                  <Github className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Repository</p>
                    <p className="text-sm text-muted-foreground">{job.repo}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Code className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Branch</p>
                    <p className="text-sm text-muted-foreground">{job.baseBranch}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Timer className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Duration</p>
                    <p className="text-sm text-muted-foreground">
                      {job.completedAt && job.startedAt
                        ? `${Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000 / 60)}min`
                        : job.startedAt
                        ? `${Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000 / 60)}min`
                        : 'Not started'
                      }
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3 mb-6">
            {job.status === 'running' && (
              <Button
                variant="destructive"
                onClick={handleCancelJob}
                className="bg-red-500 hover:bg-red-600"
              >
                <Square className="h-4 w-4 mr-2" />
                Cancel Job
              </Button>
            )}
            {['failed', 'cancelled'].includes(job.status) && (
              <Button
                onClick={handleRetryJob}
                className="bg-blue-500 hover:bg-blue-600"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Job
              </Button>
            )}
            {job.prUrl && (
              <Button variant="outline" asChild>
                <a href={job.prUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Pull Request
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={fetchJob}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="flex space-x-1 bg-muted/50 p-1 rounded-xl">
            {[
              { id: 'logs', name: 'Logs', icon: Terminal },
              { id: 'metrics', name: 'Metrics', icon: BarChart3 },
              { id: 'artifacts', name: 'Artifacts', icon: FileText },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'logs' && (
            <motion.div
              key="logs"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2">
                      <Terminal className="h-5 w-5" />
                      <span>Real-time Logs</span>
                    </CardTitle>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAutoScroll(!autoScroll)}
                      >
                        {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-black rounded-lg p-4 font-mono text-sm max-h-96 overflow-y-auto">
                    {logs.length === 0 ? (
                      <div className="text-muted-foreground">
                        No logs available yet...
                      </div>
                    ) : (
                      logs.map((log, index) => (
                        <div
                          key={index}
                          className={`flex items-start space-x-3 py-1 ${
                            log.level === 'error' ? 'text-red-400' :
                            log.level === 'warn' ? 'text-yellow-400' :
                            log.level === 'success' ? 'text-green-400' :
                            'text-gray-300'
                          }`}
                        >
                          <span className="text-gray-500 text-xs mt-0.5">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="text-gray-500 text-xs mt-0.5">
                            [{log.level.toUpperCase()}]
                          </span>
                          <span className="flex-1">{log.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === 'metrics' && (
            <motion.div
              key="metrics"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                        <Zap className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Token Usage</p>
                        <p className="text-2xl font-bold text-foreground">
                          {job.metrics?.tokenUsage || 0}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                        <Target className="h-5 w-5 text-green-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Tool Calls</p>
                        <p className="text-2xl font-bold text-foreground">
                          {job.metrics?.toolCalls || 0}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
                  <HardDrive className="h-5 w-5 text-purple-500" />
                </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Memory Usage</p>
                        <p className="text-2xl font-bold text-foreground">
                          {job.metrics?.memoryUsage ? `${Math.round(job.metrics.memoryUsage / 1024 / 1024)}MB` : '0MB'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                        <Timer className="h-5 w-5 text-orange-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Execution Time</p>
                        <p className="text-2xl font-bold text-foreground">
                          {job.metrics?.executionTime ? `${Math.round(job.metrics.executionTime / 1000)}s` : '0s'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}

          {activeTab === 'artifacts' && (
            <motion.div
              key="artifacts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <FileText className="h-5 w-5" />
                    <span>Generated Artifacts</span>
                  </CardTitle>
                  <CardDescription>
                    Files and reports generated during job execution
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {job.artifacts && job.artifacts.length > 0 ? (
                    <div className="space-y-3">
                      {job.artifacts.map((artifact, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{artifact.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {artifact.type} • {Math.round(artifact.size / 1024)}KB
                              </p>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No artifacts generated yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MainLayout>
  );
}