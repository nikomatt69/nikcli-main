'use client';

import { useEffect, useState } from 'react';
import { MainLayout } from '../../src/web/components/layout/main-layout';
import { Button } from '../../src/web/components/ui/button';
import { useWebSocket } from '../../src/web/lib/websocket-context';
import { useWebConfig } from '../../src/web/lib/config-context';
import { WebJobStats } from '../../src/web/types';
import {
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  Settings,
  AlertCircle,
  Zap,
  Target,
  BarChart3,
  ArrowUpRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import React from 'react';

export default function DashboardPage() {
  const { jobs, connected } = useWebSocket();
  const { config, loading: configLoading } = useWebConfig();
  const [stats, setStats] = useState<WebJobStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);

  useEffect(() => {
    // Calculate stats from jobs
    const jobsArray = Array.from(jobs.values());
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayJobs = jobsArray.filter(job =>
      new Date(job.createdAt) >= today
    );

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekJobs = jobsArray.filter(job =>
      new Date(job.createdAt) >= weekAgo
    );

    const completedJobs = jobsArray.filter(job => job.status === 'succeeded');
    const avgCompletionTime = completedJobs.length > 0
      ? completedJobs.reduce((acc, job) => {
        if (job.completedAt && job.startedAt) {
          return acc + (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime());
        }
        return acc;
      }, 0) / completedJobs.length
      : 0;

    setStats({
      total: jobsArray.length,
      active: jobsArray.filter(job => job.status === 'running').length,
      completed: jobsArray.filter(job => job.status === 'succeeded').length,
      failed: jobsArray.filter(job => job.status === 'failed').length,
      todayActive: todayJobs.length,
      weeklyActive: weekJobs.length,
      averageCompletionTime: Math.round(avgCompletionTime / 1000 / 60), // minutes
    });

    // Set recent jobs (last 5)
    setRecentJobs(
      jobsArray
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
    );
  }, [jobs]);

  const isConfigured = config?.github?.token && config?.defaultRepository;

  if (configLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex-1 p-6">
        {/* Header */}
        <motion.div 
          className="mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">Background Agents</h1>
              <p className="text-muted-foreground">
                Create agents to edit and run code, asynchronously
              </p>
            </div>
            
            <div className="flex items-center space-x-3">
              {!isConfigured && (
                <Link href="/config">
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Setup Required
                  </Button>
                </Link>
              )}
              <Link href="/jobs">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Agent
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Configuration Warning */}
        <AnimatePresence>
          {!isConfigured && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="mb-6"
            >
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <div className="flex-1">
                    <h3 className="font-medium text-foreground">Setup Required</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Configure your GitHub integration and default repository to start creating background agents.
                    </p>
                  </div>
                  <Link href="/config">
                    <Button size="sm">
                      Configure Now
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Jobs</h3>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-foreground">{stats?.total || 0}</div>
              <p className="text-xs text-muted-foreground">
                +{stats?.weeklyActive || 0} this week
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Active Jobs</h3>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-foreground">{stats?.active || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.todayActive || 0} started today
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Completed</h3>
              <Target className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-foreground">{stats?.completed || 0}</div>
              <p className="text-xs text-muted-foreground">
                ~{stats?.averageCompletionTime || 0}min avg duration
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Failed</h3>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-foreground">{stats?.failed || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.failed ? Math.round((stats.failed / (stats.total || 1)) * 100) : 0}% error rate
              </p>
            </div>
          </div>
        </div>

        {/* Recent Jobs Section */}
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Recent Jobs</h2>
              <p className="text-sm text-muted-foreground">
                Your latest background agent executions
              </p>
            </div>
            <Link href="/jobs">
              <Button variant="outline" size="sm">
                View All
                <ArrowUpRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>

          <div className="p-6">
            {recentJobs.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No jobs yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first background agent to get started
                </p>
                <Link href="/jobs">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Agent
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-4 rounded-md border bg-background">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-3">
                        <div className={`h-2 w-2 rounded-full ${
                          job.status === 'succeeded' ? 'bg-green-500' :
                          job.status === 'failed' ? 'bg-red-500' :
                          job.status === 'running' ? 'bg-blue-500' :
                          'bg-yellow-500'
                        }`} />
                        <span className={`px-2 py-1 text-xs font-medium rounded-md ${
                          job.status === 'succeeded' ? 'bg-green-500/10 text-green-500' :
                          job.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                          job.status === 'running' ? 'bg-blue-500/10 text-blue-500' :
                          'bg-yellow-500/10 text-yellow-500'
                        }`}>
                          {job.status}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{job.task}</p>
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <span>{job.repo}</span>
                          <span>•</span>
                          <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}