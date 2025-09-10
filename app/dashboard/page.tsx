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
      <div className="min-h-full p-4 lg:p-8">
        {/* Enhanced Header */}
        <div className="mb-8 lg:mb-12">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3">
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground">
                Background Agents
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Create intelligent agents to edit and run code asynchronously with enterprise-grade monitoring
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
              <Link href="/jobs">
                <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg">
                  <Plus className="h-4 w-4 mr-2" />
                  New Agent
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Enhanced Configuration Warning */}
        {!isConfigured && (
          <div className="mb-8">
            <div className="rounded-2xl border border-destructive/20 bg-gradient-to-r from-destructive/5 to-destructive/10 p-6 backdrop-blur-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">Setup Required</h3>
                  <p className="text-muted-foreground">
                    Configure your GitHub integration and default repository to start creating background agents.
                  </p>
                </div>
                <Link href="/config">
                  <Button size="lg" className="bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg">
                    Configure Now
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Stats Grid with Better Organization */}
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground">Job Statistics</h2>
              <p className="text-muted-foreground mt-2">Overview of your background agent performance</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: 'Total Jobs',
                value: stats?.total || 0,
                subtitle: `+${stats?.weeklyActive || 0} this week`,
                icon: BarChart3,
                color: 'text-blue-500',
                bgColor: 'bg-blue-500/10',
                borderColor: 'border-blue-500/20'
              },
              {
                title: 'Active Jobs',
                value: stats?.active || 0,
                subtitle: `${stats?.todayActive || 0} started today`,
                icon: Zap,
                color: 'text-emerald-500',
                bgColor: 'bg-emerald-500/10',
                borderColor: 'border-emerald-500/20'
              },
              {
                title: 'Completed',
                value: stats?.completed || 0,
                subtitle: `~${stats?.averageCompletionTime || 0}min avg duration`,
                icon: Target,
                color: 'text-green-500',
                bgColor: 'bg-green-500/10',
                borderColor: 'border-green-500/20'
              },
              {
                title: 'Failed',
                value: stats?.failed || 0,
                subtitle: `${stats?.failed ? Math.round((stats.failed / (stats.total || 1)) * 100) : 0}% error rate`,
                icon: XCircle,
                color: 'text-red-500',
                bgColor: 'bg-red-500/10',
                borderColor: 'border-red-500/20'
              }
            ].map((stat) => (
              <div
                key={stat.title}
                className={`rounded-2xl border ${stat.borderColor} bg-card/50 backdrop-blur-sm card-padding hover:shadow-lg transition-all duration-300 hover:scale-[1.02]`}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {stat.title}
                  </h3>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.bgColor} shadow-sm`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="text-4xl font-bold text-foreground">
                    {stat.value}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {stat.subtitle}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Enhanced Recent Jobs Section with Better Organization */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground">Recent Jobs</h2>
              <p className="text-muted-foreground text-lg">
                Your latest background agent executions and performance metrics
              </p>
            </div>
            <Link href="/jobs">
              <Button variant="outline" size="lg" className="button-padding">
                View All
                <ArrowUpRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
          </div>

          <motion.div
            className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >

            <div className="card-padding">
              {recentJobs.length === 0 ? (
                <motion.div
                  className="text-center py-20"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 1 }}
                >
                  <Activity className="h-20 w-20 text-muted-foreground mx-auto mb-8" />
                  <h3 className="text-2xl font-semibold text-foreground mb-4">No jobs yet</h3>
                  <p className="text-muted-foreground mb-8 max-w-lg mx-auto text-lg leading-relaxed">
                    Create your first background agent to get started with intelligent code automation
                  </p>
                  <Link href="/jobs">
                    <Button size="xl" className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg button-padding">
                      <Plus className="h-5 w-5 mr-3" />
                      Create First Agent
                    </Button>
                  </Link>
                </motion.div>
              ) : (
                <div className="space-y-6">
                  {recentJobs.map((job, index) => (
                    <motion.div
                      key={job.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-6 rounded-xl border border-border/50 bg-background/50 hover:bg-background/80 transition-all duration-300 hover:shadow-md"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 1 + index * 0.1 }}
                      whileHover={{ scale: 1.01, y: -2 }}
                    >
                      <div className="flex items-center space-x-4 flex-1">
                        <div className="flex items-center space-x-3">
                          <motion.div
                            className={`h-3 w-3 rounded-full ${job.status === 'succeeded' ? 'bg-emerald-500' :
                              job.status === 'failed' ? 'bg-red-500' :
                                job.status === 'running' ? 'bg-blue-500' :
                                  'bg-yellow-500'
                              }`}
                            animate={{
                              scale: job.status === 'running' ? [1, 1.2, 1] : 1,
                              opacity: job.status === 'running' ? [1, 0.7, 1] : 1
                            }}
                            transition={{ duration: 2, repeat: job.status === 'running' ? Infinity : 0 }}
                          />
                          <span className={`px-3 py-1 text-xs font-semibold rounded-full ${job.status === 'succeeded' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                            job.status === 'failed' ? 'bg-red-500/10 text-red-600 border border-red-500/20' :
                              job.status === 'running' ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20' :
                                'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20'
                            }`}>
                            {job.status}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">{job.task}</p>
                          <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2 text-sm text-muted-foreground">
                            <span className="truncate">{job.repo}</span>
                            <span className="hidden sm:inline">•</span>
                            <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <motion.div
                        className="mt-4 sm:mt-0"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <Button variant="ghost" size="lg">
                          <ArrowUpRight className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </MainLayout>
  );
}