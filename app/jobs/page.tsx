'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '../../src/web/components/layout/main-layout';
import { Button } from '../../src/web/components/ui/button';
import { useWebSocket } from '../../src/web/lib/websocket-context';
import { useWebConfig } from '../../src/web/lib/config-context';
import { WebBackgroundJob, CreateWebJobRequest } from '../../src/web/types';
import {
  Plus,
  Play,
  Square,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  Github,
  Eye,
  Trash2,
  Settings,
  ArrowUpRight
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import React from 'react';

export default function JobsPage() {
  const { jobs, connected } = useWebSocket();
  const { config } = useWebConfig();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newJobTask, setNewJobTask] = useState('');
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const jobsArray = Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleCreateJob = async () => {
    if (!newJobTask.trim() || !config?.defaultRepository) return;

    try {
      setCreating(true);

      const jobRequest: CreateWebJobRequest = {
        repositoryId: 1, // Mock ID
        repositoryName: config.defaultRepository,
        repo: config.defaultRepository,
        baseBranch: 'main',
        task: newJobTask,
        createSnapshot: true,
        notifyOnCompletion: true,
        autoCreatePR: true,
      };

      const response = await fetch('/api/v1/web/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobRequest),
      });

      if (response.ok) {
        setNewJobTask('');
        setShowCreateDialog(false);
      } else {
        throw new Error('Failed to create job');
      }
    } catch (error) {
      console.error('Error creating job:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/v1/web/jobs/${jobId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to cancel job');
      }
    } catch (error) {
      console.error('Error cancelling job:', error);
    }
  };


  const isConfigured = config?.github?.token && config?.defaultRepository;

  return (
    <MainLayout>
      <div className="min-h-full p-4 lg:p-8">
        {/* Enhanced Header */}
        <div className="mb-8 lg:mb-12">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3">
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground">
                Background Agents
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Manage and monitor your background agent executions with enterprise-grade tools
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {!isConfigured && (
                <Link href="/config">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">
                    <Settings className="h-4 w-4 mr-2" />
                    Setup Required
                  </Button>
                </Link>
              )}
              <Button
                onClick={() => setShowCreateDialog(true)}
                disabled={!isConfigured}
                size="lg"
                className="w-full sm:w-auto bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Agent
              </Button>
            </div>
          </div>
        </div>

        {/* Enhanced Create Job Dialog */}
        <AnimatePresence>
          {showCreateDialog && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="mb-8"
            >
              <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-foreground mb-2">Create New Background Agent</h2>
                  <p className="text-muted-foreground">
                    Describe the task you want the agent to perform with detailed instructions
                  </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-base font-semibold text-foreground mb-3 block">
                      Repository
                    </label>
                    <div className="flex items-center space-x-3 px-4 py-3 bg-background/50 backdrop-blur-sm rounded-xl border border-border/50">
                      <Github className="h-5 w-5 text-muted-foreground" />
                      <span className="text-foreground font-medium">
                        {config?.defaultRepository || 'No repository configured'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="task" className="text-base font-semibold text-foreground mb-3 block">
                      Task Description
                    </label>
                    <textarea
                      id="task"
                      value={newJobTask}
                      onChange={(e) => setNewJobTask(e.target.value)}
                      placeholder="Describe what you want the agent to do in detail..."
                      className="w-full h-32 px-4 py-3 text-sm bg-background/50 backdrop-blur-sm border border-border/50 rounded-xl resize-none focus:ring-2 focus:ring-primary focus:border-transparent text-foreground transition-all duration-200"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setShowCreateDialog(false)}
                      className="w-full sm:w-auto"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateJob}
                      disabled={!newJobTask.trim() || creating}
                      size="lg"
                      className="w-full sm:w-auto bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg"
                    >
                      {creating ? (
                        <>
                          <Activity className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Create Agent
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Jobs List */}
        <div>
          {jobsArray.length === 0 ? (
            <div className="rounded-lg border bg-card">
              <div className="p-12 text-center">
                <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No background agents yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first background agent to automate code tasks
                </p>
                {!isConfigured ? (
                  <Link href="/config">
                    <Button>
                      <Settings className="h-4 w-4 mr-2" />
                      Setup GitHub Integration
                    </Button>
                  </Link>
                ) : (
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Agent
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {jobsArray.map((job) => (
                <div key={job.id} className="rounded-lg border bg-card p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <div className="flex items-center space-x-2">
                          <div className={`h-2 w-2 rounded-full ${job.status === 'succeeded' ? 'bg-green-500' :
                            job.status === 'failed' ? 'bg-red-500' :
                              job.status === 'running' ? 'bg-blue-500' :
                                'bg-yellow-500'
                            }`} />
                          <span className={`px-2 py-1 text-xs font-medium rounded-md ${job.status === 'succeeded' ? 'bg-green-500/10 text-green-500' :
                            job.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                              job.status === 'running' ? 'bg-blue-500/10 text-blue-500' :
                                'bg-yellow-500/10 text-yellow-500'
                            }`}>
                            {job.status}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          ID: {job.id.substring(0, 8)}
                        </span>
                      </div>

                      <h3 className="font-medium text-foreground mb-2 line-clamp-2">
                        {job.task}
                      </h3>

                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <div className="flex items-center space-x-1">
                          <Github className="h-3 w-3" />
                          <span>{job.repo}</span>
                        </div>
                        <span>•</span>
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                        </div>
                        {job.completedAt && (
                          <>
                            <span>•</span>
                            <span>
                              {Math.round((new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime()) / 1000 / 60)}min
                            </span>
                          </>
                        )}
                      </div>

                      {job.error && (
                        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-sm text-red-500">
                          {job.error}
                        </div>
                      )}

                      {job.prUrl && (
                        <div className="mt-3">
                          <a
                            href={job.prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1 text-sm text-primary hover:underline"
                          >
                            <Github className="h-3 w-3" />
                            <span>View Pull Request</span>
                            <ArrowUpRight className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="ghost">
                        <Eye className="h-4 w-4" />
                      </Button>

                      {job.status === 'running' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCancelJob(job.id)}
                        >
                          <Square className="h-4 w-4" />
                        </Button>
                      )}

                      {['succeeded', 'failed', 'cancelled'].includes(job.status) && (
                        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}