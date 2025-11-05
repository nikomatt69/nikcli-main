import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import MainLayout from '@/components/layout/main-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Slack, CheckCircle2, XCircle, Send, AlertCircle } from 'lucide-react'
import { getSlackConnection, sendSlackTestMessage, updateSlackConfig, getSlackConfig } from '@/lib/slack-client'
import { toast } from 'sonner'

export default function SlackPage() {
  const queryClient = useQueryClient()
  const [testMessage, setTestMessage] = useState('Test message from NikCLI Web UI')

  // Fetch Slack connection status
  const { data: connectionResponse, isLoading: isLoadingConnection } = useQuery({
    queryKey: ['slack-connection'],
    queryFn: getSlackConnection,
    refetchInterval: 10000, // Refresh every 10s
  })

  // Fetch Slack config
  const { data: configResponse, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['slack-config'],
    queryFn: getSlackConfig,
    refetchInterval: 30000,
  })

  const connection = connectionResponse?.data
  const config = configResponse?.data

  // Test message mutation
  const testMessageMutation = useMutation({
    mutationFn: sendSlackTestMessage,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Test message sent to Slack!')
        queryClient.invalidateQueries({ queryKey: ['slack-connection'] })
      } else {
        toast.error(result.error?.message || 'Failed to send test message')
      }
    },
    onError: () => {
      toast.error('Failed to send test message')
    },
  })

  // Update config mutation
  const updateConfigMutation = useMutation({
    mutationFn: updateSlackConfig,
    onSuccess: () => {
      toast.success('Slack configuration updated')
      queryClient.invalidateQueries({ queryKey: ['slack-config'] })
    },
    onError: () => {
      toast.error('Failed to update configuration')
    },
  })

  const handleTestMessage = () => {
    testMessageMutation.mutate({
      message: testMessage,
      channel: config?.channel,
    })
  }

  const handleToggleNotification = (key: string, value: boolean) => {
    updateConfigMutation.mutate({
      [key]: value,
    })
  }

  const isConnected = connection?.isConnected || false
  const isLoading = isLoadingConnection || isLoadingConfig

  return (
    <MainLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Slack Integration</h1>
          <p className="text-muted-foreground">
            Manage Slack notifications for your background jobs
          </p>
        </div>

        {/* Connection Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Slack className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Connection Status</CardTitle>
                  <CardDescription>
                    {isConnected ? 'Connected to Slack workspace' : 'Not connected'}
                  </CardDescription>
                </div>
              </div>
              <Badge variant={isConnected ? 'default' : 'secondary'} className="gap-2">
                {isConnected ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    Connected
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3" />
                    Disconnected
                  </>
                )}
              </Badge>
            </div>
          </CardHeader>
          {connection && (
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Channel</p>
                  <p className="text-sm font-mono mt-1">{connection.channel || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Username</p>
                  <p className="text-sm mt-1">{connection.username || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Messages Sent</p>
                  <p className="text-sm mt-1">{connection.messageCount || 0}</p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Configuration Card */}
        {config && (
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>
                Configure which events trigger Slack notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Master Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Enable Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Master switch for all Slack notifications
                  </p>
                </div>
                <Switch
                  checked={config.taskNotifications || false}
                  onCheckedChange={(checked) => handleToggleNotification('taskNotifications', checked)}
                  disabled={updateConfigMutation.isPending}
                />
              </div>

              <Separator />

              {/* Individual Settings */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Job Completed</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when a background job completes successfully
                    </p>
                  </div>
                  <Switch
                    checked={config.taskNotifications || false}
                    disabled={!config.taskNotifications || updateConfigMutation.isPending}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Job Failed</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when a background job fails
                    </p>
                  </div>
                  <Switch
                    checked={config.taskNotifications || false}
                    disabled={!config.taskNotifications || updateConfigMutation.isPending}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Job Started</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when a background job starts
                    </p>
                  </div>
                  <Switch
                    checked={false}
                    disabled={!config.taskNotifications || updateConfigMutation.isPending}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Test Message Card */}
        <Card>
          <CardHeader>
            <CardTitle>Test Connection</CardTitle>
            <CardDescription>
              Send a test message to verify your Slack integration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-message">Test Message</Label>
              <Input
                id="test-message"
                placeholder="Enter a test message..."
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                disabled={!isConnected || testMessageMutation.isPending}
              />
            </div>
            <Button
              onClick={handleTestMessage}
              disabled={!isConnected || !testMessage || testMessageMutation.isPending}
              className="w-full"
            >
              <Send className="mr-2 h-4 w-4" />
              {testMessageMutation.isPending ? 'Sending...' : 'Send Test Message'}
            </Button>

            {!isConnected && (
              <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 p-3 text-sm text-yellow-400">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Slack not configured</p>
                  <p className="text-xs text-yellow-400/80 mt-1">
                    Configure SLACK_WEBHOOK_URL in your environment variables to enable Slack integration.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Environment Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Your Slack integration is configured via environment variables:
              </p>
              <div className="rounded-lg bg-muted/50 p-3 font-mono text-xs space-y-1">
                <div>SLACK_TASK_NOTIFICATIONS=true</div>
                <div>SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...</div>
                <div>SLACK_CHANNEL=#all-nikcli-bot</div>
                <div>SLACK_USERNAME=NikCLI Bot</div>
              </div>
              <p className="text-xs text-muted-foreground">
                These settings are read from your <code className="text-xs">.env.production</code> file.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
