'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '../../src/web/components/layout/main-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../src/web/components/ui/card';
import { Button } from '../../src/web/components/ui/button';
import { Input } from '../../src/web/components/ui/input';
import { useWebConfig } from '../../src/web/lib/config-context';
import { ProjectSnapshot } from '../../src/web/types';
import {
  Camera,
  Plus,
  Download,
  Trash2,
  Calendar,
  HardDrive,
  FileText,
  Code,
  Github,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { clsx } from 'clsx';
import React from 'react';

export default function SnapshotsPage() {
  const { config } = useWebConfig();
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newSnapshot, setNewSnapshot] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    fetchSnapshots();
  }, []);

  const fetchSnapshots = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/web/snapshots');
      if (response.ok) {
        const data = await response.json();
        setSnapshots(data.snapshots || []);
      }
    } catch (error) {
      console.error('Error fetching snapshots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSnapshot = async () => {
    if (!newSnapshot.name.trim() || !config?.defaultRepository) return;

    try {
      setCreating(true);

      const response = await fetch('/api/v1/web/snapshots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newSnapshot.name,
          repository: config.defaultRepository,
          description: newSnapshot.description,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSnapshots([data.snapshot, ...snapshots]);
        setNewSnapshot({ name: '', description: '' });
        setShowCreateDialog(false);
      } else {
        throw new Error('Failed to create snapshot');
      }
    } catch (error) {
      console.error('Error creating snapshot:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    try {
      const response = await fetch(`/api/v1/web/snapshots/${snapshotId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSnapshots(snapshots.filter(s => s.id !== snapshotId));
      } else {
        throw new Error('Failed to delete snapshot');
      }
    } catch (error) {
      console.error('Error deleting snapshot:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Enhanced Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-4xl lg:text-5xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
              Project Snapshots
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              Create and manage project snapshots for safe agent operations with enterprise-grade backup solutions
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={fetchSnapshots}
              disabled={loading}
              className="button-padding"
            >
              <RefreshCw className={clsx("h-5 w-5 mr-3", loading && "animate-spin")} />
              Refresh
            </Button>

            <Button
              size="lg"
              onClick={() => setShowCreateDialog(true)}
              disabled={!config?.defaultRepository}
              className="button-padding"
            >
              <Plus className="h-5 w-5 mr-3" />
              Create Snapshot
            </Button>
          </div>
        </div>

        {/* Enhanced Info Card */}
        <Card className="bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200/50 dark:border-blue-800/50">
          <CardContent className="card-padding">
            <div className="flex items-start space-x-4">
              <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                <AlertCircle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-100">About Snapshots</h3>
                <p className="text-base text-blue-800 dark:text-blue-200 leading-relaxed">
                  Snapshots create safe restore points before agents make changes to your code.
                  They're automatically created before background agent execution and can be manually created anytime.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Enhanced Create Snapshot Dialog */}
        {showCreateDialog && (
          <Card className="border-2 border-primary/20 bg-gradient-to-br from-card/50 to-card/30">
            <CardHeader className="card-padding">
              <CardTitle className="text-2xl">Create Project Snapshot</CardTitle>
              <CardDescription className="text-base">
                Create a snapshot of the current project state for safe agent operations
              </CardDescription>
            </CardHeader>
            <CardContent className="card-padding space-y-6">
              <div className="space-y-2">
                <label className="text-base font-semibold text-foreground">
                  Repository
                </label>
                <div className="flex items-center space-x-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                  <Github className="h-5 w-5 text-muted-foreground" />
                  <span className="text-base font-medium">
                    {config?.defaultRepository || 'No repository configured'}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <label htmlFor="snapshot-name" className="text-base font-semibold text-foreground">
                  Snapshot Name *
                </label>
                <Input
                  id="snapshot-name"
                  size="lg"
                  value={newSnapshot.name}
                  onChange={(e) => setNewSnapshot(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Pre-refactor snapshot"
                />
              </div>

              <div className="space-y-3">
                <label htmlFor="snapshot-description" className="text-base font-semibold text-foreground">
                  Description (Optional)
                </label>
                <textarea
                  id="snapshot-description"
                  value={newSnapshot.description}
                  onChange={(e) => setNewSnapshot(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this snapshot captures..."
                  className="w-full h-24 px-4 py-3 text-base border border-border rounded-xl resize-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background/50"
                />
              </div>

              <div className="flex items-center justify-end space-x-4 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateSnapshot}
                  disabled={!newSnapshot.name.trim() || creating}
                >
                  {creating ? (
                    <>
                      <Camera className="h-4 w-4 mr-2 animate-pulse" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4 mr-2" />
                      Create Snapshot
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Enhanced Snapshots List with Better Organization */}
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground">Project Snapshots</h2>
              <p className="text-muted-foreground mt-2">Manage your project backup points and restore operations</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
            </div>
          ) : snapshots.length === 0 ? (
            <Card className="border-2 border-dashed border-border/50">
              <CardContent className="card-padding">
                <div className="text-center py-12">
                  <Camera className="h-20 w-20 text-muted-foreground mx-auto mb-6" />
                  <h3 className="text-2xl font-semibold text-foreground mb-4">No snapshots yet</h3>
                  <p className="text-muted-foreground mb-8 text-lg leading-relaxed max-w-lg mx-auto">
                    Create your first project snapshot to enable safe agent operations and backup your code
                  </p>
                  <Button size="xl" onClick={() => setShowCreateDialog(true)} className="button-padding">
                    <Camera className="h-5 w-5 mr-3" />
                    Create First Snapshot
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {snapshots.map((snapshot) => (
                <Card key={snapshot.id} className="hover:shadow-lg transition-all duration-300 hover:scale-[1.02] border-border/50">
                  <CardHeader className="card-padding pb-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <CardTitle className="text-xl line-clamp-1">
                          {snapshot.name}
                        </CardTitle>
                        <CardDescription className="line-clamp-2 text-base">
                          {snapshot.description || 'No description'}
                        </CardDescription>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30">
                        <Camera className="h-6 w-6 text-muted-foreground" />
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="card-padding space-y-6">
                    {/* Repository Info */}
                    <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/20">
                      <Github className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">{snapshot.repository}</span>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/10">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-semibold">{snapshot.metadata.totalFiles}</div>
                          <div className="text-xs text-muted-foreground">files</div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/10">
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-semibold">{formatFileSize(snapshot.size)}</div>
                          <div className="text-xs text-muted-foreground">size</div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/10">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-semibold">{new Date(snapshot.createdAt).toLocaleDateString()}</div>
                          <div className="text-xs text-muted-foreground">created</div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/10">
                        <Code className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-semibold">{snapshot.metadata.languages.slice(0, 2).join(', ')}</div>
                          <div className="text-xs text-muted-foreground">languages</div>
                        </div>
                      </div>
                    </div>

                    {/* Branch and Commit */}
                    <div className="space-y-2 p-3 rounded-lg bg-muted/10">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Branch:</span>
                        <span className="font-mono ml-2 text-foreground">{snapshot.branch}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Commit:</span>
                        <span className="font-mono ml-2 text-foreground">{snapshot.commit}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-border/50">
                      <Button size="lg" variant="outline" className="button-padding">
                        <Download className="h-4 w-4 mr-2" />
                        Restore
                      </Button>

                      <Button
                        size="lg"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 button-padding"
                        onClick={() => handleDeleteSnapshot(snapshot.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Enhanced Stats Summary */}
        {snapshots.length > 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground">Snapshot Statistics</h2>
              <p className="text-muted-foreground mt-2">Overview of your project backup metrics</p>
            </div>

            <Card className="border-2 border-primary/10 bg-gradient-to-br from-card/50 to-card/30">
              <CardHeader className="card-padding">
                <CardTitle className="text-2xl">Storage Overview</CardTitle>
              </CardHeader>
              <CardContent className="card-padding">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                  <div className="text-center p-6 rounded-xl bg-primary/5 border border-primary/10">
                    <div className="text-4xl font-bold text-primary mb-2">
                      {snapshots.length}
                    </div>
                    <div className="text-base text-muted-foreground font-medium">
                      Total Snapshots
                    </div>
                  </div>

                  <div className="text-center p-6 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                    <div className="text-4xl font-bold text-emerald-600 mb-2">
                      {formatFileSize(snapshots.reduce((acc, s) => acc + s.size, 0))}
                    </div>
                    <div className="text-base text-muted-foreground font-medium">
                      Total Storage
                    </div>
                  </div>

                  <div className="text-center p-6 rounded-xl bg-blue-500/5 border border-blue-500/10">
                    <div className="text-4xl font-bold text-blue-600 mb-2">
                      {Math.round(snapshots.reduce((acc, s) => acc + s.metadata.totalFiles, 0) / snapshots.length)}
                    </div>
                    <div className="text-base text-muted-foreground font-medium">
                      Avg Files per Snapshot
                    </div>
                  </div>

                  <div className="text-center p-6 rounded-xl bg-amber-500/5 border border-amber-500/10">
                    <div className="text-4xl font-bold text-amber-600 mb-2">
                      {snapshots.filter(s =>
                        new Date(s.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                      ).length}
                    </div>
                    <div className="text-base text-muted-foreground font-medium">
                      This Week
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </MainLayout>
  );
}