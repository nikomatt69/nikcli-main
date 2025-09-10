'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { MainLayout } from '../../src/web/components/layout/main-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../src/web/components/ui/card';
import { Button } from '../../src/web/components/ui/button';
import { Input } from '../../src/web/components/ui/input';
import { useWebConfig } from '../../src/web/lib/config-context';
import { GitHubRepository } from '../../src/web/types';
import { 
  Github, 
  Slack, 
  Activity,
  Settings,
  Check,
  AlertCircle,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { clsx } from 'clsx';

type TabType = 'github' | 'repositories' | 'models' | 'notifications';

export default function ConfigPage() {
  const searchParams = useSearchParams();
  const { config, loading, updateConfig } = useWebConfig();
  const [activeTab, setActiveTab] = useState<TabType>('github');
  const [saving, setSaving] = useState(false);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Handle tab from URL params
  useEffect(() => {
    const tab = searchParams.get('tab') as TabType;
    if (tab && ['github', 'repositories', 'models', 'notifications'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleGitHubConnect = async () => {
    try {
      // Redirect to GitHub OAuth
      window.location.href = '/api/v1/auth/github';
    } catch (error) {
      console.error('Error connecting to GitHub:', error);
    }
  };

  const fetchRepositories = async () => {
    if (!config?.github?.token) return;
    
    try {
      setLoadingRepos(true);
      const response = await fetch('/api/v1/repositories');
      if (response.ok) {
        const data = await response.json();
        setRepositories(data.repositories || []);
      }
    } catch (error) {
      console.error('Error fetching repositories:', error);
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    if (config?.github?.token) {
      fetchRepositories();
    }
  }, [config?.github?.token]);

  const handleDefaultRepoSelect = async (repoName: string) => {
    try {
      setSaving(true);
      await updateConfig({
        defaultRepository: repoName,
      });
    } catch (error) {
      console.error('Error updating default repository:', error);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'github', name: 'GitHub', icon: Github },
    { id: 'repositories', name: 'Repositories', icon: Activity },
    { id: 'models', name: 'Models', icon: Settings },
    { id: 'notifications', name: 'Notifications', icon: Slack },
  ];

  if (loading) {
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
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Configuration</h1>
            <p className="text-muted-foreground mt-2">
              Manage your integrations and settings
            </p>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 mb-8 border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={clsx(
                  'flex items-center space-x-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
                )}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="space-y-6">
            {activeTab === 'github' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Github className="h-5 w-5" />
                    <span>GitHub Integration</span>
                  </CardTitle>
                  <CardDescription>
                    Connect your GitHub account to enable repository access and PR creation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {config?.github?.token ? (
                    <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Check className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium text-green-900">GitHub Connected</p>
                          <p className="text-sm text-green-700">
                            Connected as @{config.github.username || 'user'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm">
                          Disconnect
                        </Button>
                        <Button variant="outline" size="sm">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          GitHub
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <AlertCircle className="h-5 w-5 text-yellow-600" />
                        <div>
                          <p className="font-medium text-yellow-900">GitHub Not Connected</p>
                          <p className="text-sm text-yellow-700">
                            Connect your GitHub account to enable background agents
                          </p>
                        </div>
                      </div>
                      <Button onClick={handleGitHubConnect} className="bg-[#24292e] hover:bg-[#1a1e22]">
                        <Github className="h-4 w-4 mr-2" />
                        Connect GitHub
                      </Button>
                    </div>
                  )}

                  {config?.github?.token && (
                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-2xl font-bold">
                            {repositories.length}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Accessible Repositories
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-2xl font-bold">
                            {repositories.filter(r => r.private).length}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Private Repositories
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {activeTab === 'repositories' && (
              <Card>
                <CardHeader>
                  <CardTitle>Default Repository</CardTitle>
                  <CardDescription>
                    Choose a default repository for new background agents
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!config?.github?.token ? (
                    <div className="text-center py-8">
                      <Github className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground mb-4">
                        Connect your GitHub account to manage repositories
                      </p>
                      <Button onClick={() => setActiveTab('github')}>
                        Go to GitHub Settings
                      </Button>
                    </div>
                  ) : loadingRepos ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : repositories.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">
                        No repositories found
                      </p>
                      <Button onClick={fetchRepositories} variant="outline">
                        Refresh Repositories
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {repositories.slice(0, 10).map((repo) => (
                        <div
                          key={repo.id}
                          className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                              {repo.private ? (
                                <div className="h-2 w-2 bg-yellow-500 rounded-full" />
                              ) : (
                                <div className="h-2 w-2 bg-green-500 rounded-full" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{repo.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {repo.description || 'No description'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {repo.language && (
                              <span className="px-2 py-1 text-xs bg-muted rounded">
                                {repo.language}
                              </span>
                            )}
                            {config.defaultRepository === repo.full_name ? (
                              <Button size="sm" disabled>
                                <Check className="h-4 w-4 mr-1" />
                                Default
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDefaultRepoSelect(repo.full_name)}
                                disabled={saving}
                              >
                                Select
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {activeTab === 'models' && (
              <Card>
                <CardHeader>
                  <CardTitle>Default Model</CardTitle>
                  <CardDescription>
                    Choose the default AI model for background agents
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet Latest', recommended: true },
                      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
                      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
                      { id: 'gemini-pro', name: 'Gemini Pro' },
                    ].map((model) => (
                      <div
                        key={model.id}
                        className="flex items-center justify-between p-3 border border-border rounded-lg"
                      >
                        <div className="flex items-center space-x-3">
                          <input
                            type="radio"
                            name="defaultModel"
                            checked={config?.defaultModel === model.id}
                            onChange={() => updateConfig({ defaultModel: model.id })}
                            className="h-4 w-4"
                          />
                          <div>
                            <p className="font-medium">{model.name}</p>
                            {model.recommended && (
                              <p className="text-xs text-primary">Recommended</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Slack className="h-5 w-5" />
                      <span>Slack Notifications</span>
                    </CardTitle>
                    <CardDescription>
                      Get notified in Slack when agents complete tasks
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Enable Slack notifications</p>
                        <p className="text-sm text-muted-foreground">
                          Receive updates when Background Agents complete tasks
                        </p>
                      </div>
                      <Button variant="outline">
                        <Slack className="h-4 w-4 mr-2" />
                        Connect
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Activity className="h-5 w-5" />
                      <span>Linear Integration</span>
                    </CardTitle>
                    <CardDescription>
                      Create Linear issues when agents encounter errors
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Connect Linear workspace</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically create issues for failed agent executions
                        </p>
                      </div>
                      <Button variant="outline">
                        <Activity className="h-4 w-4 mr-2" />
                        Connect
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}