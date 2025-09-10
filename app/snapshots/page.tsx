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
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Project Snapshots</h1>
            <p className="text-muted-foreground mt-2">
              Create and manage project snapshots for safe agent operations
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={fetchSnapshots}
              disabled={loading}
            >
              <RefreshCw className={clsx("h-4 w-4 mr-2", loading && "animate-spin")} />
              Refresh
            </Button>

            <Button
              onClick={() => setShowCreateDialog(true)}
              disabled={!config?.defaultRepository}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Snapshot
            </Button>
          </div>
        </div>

        {/* Info Card */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-900">About Snapshots</h3>
                <p className="text-sm text-blue-800 mt-1">
                  Snapshots create safe restore points before agents make changes to your code.
                  They're automatically created before background agent execution and can be manually created anytime.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Create Snapshot Dialog */}
        {showCreateDialog && (
          <Card>
            <CardHeader>
              <CardTitle>Create Project Snapshot</CardTitle>
              <CardDescription>
                Create a snapshot of the current project state
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Repository
                </label>
                <div className="flex items-center space-x-2">
                  <Github className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {config?.defaultRepository || 'No repository configured'}
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="snapshot-name" className="text-sm font-medium mb-2 block">
                  Snapshot Name *
                </label>
                <Input
                  id="snapshot-name"
                  value={newSnapshot.name}
                  onChange={(e) => setNewSnapshot(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Pre-refactor snapshot"
                />
              </div>

              <div>
                <label htmlFor="snapshot-description" className="text-sm font-medium mb-2 block">
                  Description (Optional)
                </label>
                <textarea
                  id="snapshot-description"
                  value={newSnapshot.description}
                  onChange={(e) => setNewSnapshot(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this snapshot captures..."
                  className="w-full h-20 px-3 py-2 text-sm border border-border rounded-md resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div className="flex items-center justify-end space-x-3">
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

        {/* Snapshots List */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : snapshots.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12">
                <div className="text-center">
                  <Camera className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No snapshots yet</h3>
                  <p className="text-muted-foreground mb-6">
                    Create your first project snapshot to enable safe agent operations
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Camera className="h-4 w-4 mr-2" />
                    Create First Snapshot
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {snapshots.map((snapshot) => (
                <Card key={snapshot.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg line-clamp-1">
                          {snapshot.name}
                        </CardTitle>
                        <CardDescription className="line-clamp-2 mt-1">
                          {snapshot.description || 'No description'}
                        </CardDescription>
                      </div>
                      <Camera className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Repository Info */}
                    <div className="flex items-center space-x-2 text-sm">
                      <Github className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate">{snapshot.repository}</span>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center space-x-2">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span>{snapshot.metadata.totalFiles} files</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <HardDrive className="h-3 w-3 text-muted-foreground" />
                        <span>{formatFileSize(snapshot.size)}</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span>{new Date(snapshot.createdAt).toLocaleDateString()}</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Code className="h-3 w-3 text-muted-foreground" />
                        <span>{snapshot.metadata.languages.slice(0, 2).join(', ')}</span>
                      </div>
                    </div>

                    {/* Branch and Commit */}
                    <div className="text-xs text-muted-foreground">
                      <div>Branch: <span className="font-mono">{snapshot.branch}</span></div>
                      <div>Commit: <span className="font-mono">{snapshot.commit}</span></div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <Button size="sm" variant="outline">
                        <Download className="h-3 w-3 mr-1" />
                        Restore
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteSnapshot(snapshot.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Stats Summary */}
        {snapshots.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Snapshot Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {snapshots.length}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total Snapshots
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {formatFileSize(snapshots.reduce((acc, s) => acc + s.size, 0))}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total Storage
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {Math.round(snapshots.reduce((acc, s) => acc + s.metadata.totalFiles, 0) / snapshots.length)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Avg Files per Snapshot
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {snapshots.filter(s =>
                      new Date(s.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    ).length}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    This Week
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}