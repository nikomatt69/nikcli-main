'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '../../src/web/components/layout/main-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../src/web/components/ui/card';
import { Button } from '../../src/web/components/ui/button';
import { useWebSocket } from '../../src/web/lib/websocket-context';
import { apiClient } from '../../src/web/lib/api-client';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  Zap,
  Target,
  Timer,
  HardDrive,
  Cpu,
  Network,
  RefreshCw,
  Download,
  Calendar,
  Users,
  GitBranch,
  Code,
  AlertTriangle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import React from 'react';

interface AnalyticsData {
  jobs: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  performance: {
    averageExecutionTime: number;
    averageTokenUsage: number;
    averageMemoryUsage: number;
    successRate: number;
  };
  trends: {
    dailyJobs: Array<{ date: string; count: number }>;
    hourlyJobs: Array<{ hour: number; count: number }>;
    modelUsage: Array<{ model: string; count: number }>;
  };
}

export default function AnalyticsPage() {
  const { jobs, connected } = useWebSocket();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsResponse, queueResponse] = await Promise.all([
        apiClient.getStats(),
        apiClient.getQueueStats(),
      ]);

      if (statsResponse.success && queueResponse.success) {
        const jobsArray = Array.from(jobs.values());
        
        // Calculate performance metrics
        const completedJobs = jobsArray.filter(job => job.status === 'succeeded');
        const avgExecutionTime = completedJobs.length > 0
          ? completedJobs.reduce((acc, job) => {
              if (job.completedAt && job.startedAt) {
                return acc + (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime());
              }
              return acc;
            }, 0) / completedJobs.length / 1000 / 60 // minutes
          : 0;

        const avgTokenUsage = completedJobs.length > 0
          ? completedJobs.reduce((acc, job) => acc + (job.metrics?.tokenUsage || 0), 0) / completedJobs.length
          : 0;

        const avgMemoryUsage = completedJobs.length > 0
          ? completedJobs.reduce((acc, job) => acc + (job.metrics?.memoryUsage || 0), 0) / completedJobs.length / 1024 / 1024 // MB
          : 0;

        const successRate = jobsArray.length > 0
          ? (jobsArray.filter(job => job.status === 'succeeded').length / jobsArray.length) * 100
          : 0;

        // Generate mock trends data
        const dailyJobs = Array.from({ length: 7 }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - (6 - i));
          return {
            date: date.toISOString().split('T')[0],
            count: Math.floor(Math.random() * 20) + 5,
          };
        });

        const hourlyJobs = Array.from({ length: 24 }, (_, i) => ({
          hour: i,
          count: Math.floor(Math.random() * 10) + 1,
        }));

        const modelUsage = [
          { model: 'Claude 3.5 Sonnet', count: 45 },
          { model: 'GPT-4 Turbo', count: 30 },
          { model: 'GPT-3.5 Turbo', count: 20 },
          { model: 'Gemini Pro', count: 5 },
        ];

        setAnalytics({
          jobs: {
            total: jobsArray.length,
            active: jobsArray.filter(job => job.status === 'running').length,
            completed: jobsArray.filter(job => job.status === 'succeeded').length,
            failed: jobsArray.filter(job => job.status === 'failed').length,
            cancelled: jobsArray.filter(job => job.status === 'cancelled').length,
          },
          queue: queueResponse.data?.queue || {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
          },
          performance: {
            averageExecutionTime: Math.round(avgExecutionTime),
            averageTokenUsage: Math.round(avgTokenUsage),
            averageMemoryUsage: Math.round(avgMemoryUsage),
            successRate: Math.round(successRate),
          },
          trends: {
            dailyJobs,
            hourlyJobs,
            modelUsage,
          },
        });
      } else {
        throw new Error('Failed to fetch analytics data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
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

  if (error || !analytics) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Failed to Load Analytics</h3>
            <p className="text-muted-foreground mb-4">{error || 'Unable to fetch analytics data'}</p>
            <Button onClick={fetchAnalytics}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-full p-4 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3">
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground">
                Analytics Dashboard
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Monitor performance metrics and usage patterns for your background agents
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                {['7d', '30d', '90d'].map((range) => (
                  <Button
                    key={range}
                    variant={timeRange === range ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTimeRange(range as any)}
                  >
                    {range}
                  </Button>
                ))}
              </div>
              <Button variant="outline" onClick={fetchAnalytics}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Jobs</p>
                  <p className="text-2xl font-bold text-foreground">{analytics.jobs.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold text-foreground">{analytics.performance.successRate}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
                  <Timer className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Duration</p>
                  <p className="text-2xl font-bold text-foreground">{analytics.performance.averageExecutionTime}m</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                  <Zap className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Tokens</p>
                  <p className="text-2xl font-bold text-foreground">{analytics.performance.averageTokenUsage.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Job Status Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5" />
                <span>Job Status Distribution</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { status: 'Completed', count: analytics.jobs.completed, color: 'bg-green-500', icon: CheckCircle },
                  { status: 'Active', count: analytics.jobs.active, color: 'bg-blue-500', icon: Activity },
                  { status: 'Failed', count: analytics.jobs.failed, color: 'bg-red-500', icon: XCircle },
                  { status: 'Cancelled', count: analytics.jobs.cancelled, color: 'bg-gray-500', icon: Clock },
                ].map((item) => {
                  const Icon = item.icon;
                  const percentage = analytics.jobs.total > 0 ? (item.count / analytics.jobs.total) * 100 : 0;
                  
                  return (
                    <div key={item.status} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{item.status}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">{item.count} ({percentage.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <motion.div
                          className={`h-2 rounded-full ${item.color}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 1, delay: 0.2 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5" />
                <span>Queue Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { status: 'Waiting', count: analytics.queue.waiting, color: 'bg-yellow-500' },
                  { status: 'Active', count: analytics.queue.active, color: 'bg-blue-500' },
                  { status: 'Completed', count: analytics.queue.completed, color: 'bg-green-500' },
                  { status: 'Failed', count: analytics.queue.failed, color: 'bg-red-500' },
                  { status: 'Delayed', count: analytics.queue.delayed, color: 'bg-orange-500' },
                ].map((item) => {
                  const total = Object.values(analytics.queue).reduce((acc, val) => acc + val, 0);
                  const percentage = total > 0 ? (item.count / total) * 100 : 0;
                  
                  return (
                    <div key={item.status} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{item.status}</span>
                        <span className="text-sm text-muted-foreground">{item.count}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <motion.div
                          className={`h-2 rounded-full ${item.color}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 1, delay: 0.4 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Memory className="h-5 w-5" />
                <span>Memory Usage</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-3xl font-bold text-foreground mb-2">
                  {analytics.performance.averageMemoryUsage}MB
                </div>
                <p className="text-sm text-muted-foreground">Average per job</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Cpu className="h-5 w-5" />
                <span>Resource Efficiency</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-3xl font-bold text-foreground mb-2">
                  {Math.round((analytics.performance.averageTokenUsage / analytics.performance.averageMemoryUsage) * 100) / 100}
                </div>
                <p className="text-sm text-muted-foreground">Tokens per MB</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Network className="h-5 w-5" />
                <span>Throughput</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-3xl font-bold text-foreground mb-2">
                  {Math.round(analytics.jobs.total / 7)}
                </div>
                <p className="text-sm text-muted-foreground">Jobs per day</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Model Usage */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Code className="h-5 w-5" />
              <span>Model Usage Distribution</span>
            </CardTitle>
            <CardDescription>
              Breakdown of AI models used across all jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.trends.modelUsage.map((model, index) => {
                const total = analytics.trends.modelUsage.reduce((acc, m) => acc + m.count, 0);
                const percentage = (model.count / total) * 100;
                
                return (
                  <div key={model.model} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{model.model}</span>
                      <span className="text-sm text-muted-foreground">{model.count} ({percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <motion.div
                        className="h-2 rounded-full bg-gradient-to-r from-primary to-primary/80"
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 1, delay: 0.6 + index * 0.1 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Export Options */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Download className="h-5 w-5" />
              <span>Export Analytics</span>
            </CardTitle>
            <CardDescription>
              Download analytics data for external analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export as CSV
              </Button>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export as JSON
              </Button>
              <Button variant="outline">
                <Calendar className="h-4 w-4 mr-2" />
                Schedule Report
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}