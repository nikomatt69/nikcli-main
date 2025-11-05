/**
 * Settings Page
 * Real backend integration with Supabase for user settings persistence
 */

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import MainLayout from '@/components/layout/main-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Key, Bell, Shield, Settings2, Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const apiKeySchema = z.object({
  openrouterKey: z
    .string()
    .min(1, 'OpenRouter API key is required')
    .regex(/^sk-or-v1-/, 'Invalid OpenRouter key format (must start with sk-or-v1-)'),
  githubToken: z
    .string()
    .regex(/^(gh[ps]_|github_pat_)/, 'Invalid GitHub token format')
    .optional()
    .or(z.literal('')),
  supabaseUrl: z.string().url('Invalid Supabase URL').optional(),
  supabaseKey: z.string().optional(),
})

type ApiKeyForm = z.infer<typeof apiKeySchema>

interface UserSettings {
  user_id: string
  api_keys?: {
    openrouter?: string
    github?: string
  }
  preferences?: {
    dark_mode: boolean
    auto_save: boolean
    notifications: boolean
    sound_effects: boolean
    stream_responses: boolean
    auto_approve_tools: boolean
  }
  security?: {
    two_factor: boolean
    session_timeout: number
    ip_whitelist: string
    audit_log: boolean
  }
  notification_settings?: {
    job_complete: boolean
    tool_approval: boolean
    file_changes: boolean
    pull_requests: boolean
    email: boolean
    slack: boolean
  }
  updated_at?: string
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [userId, setUserId] = useState<string | null>(null)

  const [preferences, setPreferences] = useState({
    darkMode: true,
    autoSave: true,
    notifications: true,
    soundEffects: false,
    streamResponses: true,
    autoApproveTools: false,
  })

  const [security, setSecurity] = useState({
    twoFactor: false,
    sessionTimeout: 30,
    ipWhitelist: '',
    auditLog: true,
  })

  const [notificationSettings, setNotificationSettings] = useState({
    jobComplete: true,
    toolApproval: true,
    fileChanges: false,
    pullRequests: true,
    email: false,
    slack: true,
  })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ApiKeyForm>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      openrouterKey: '',
      githubToken: '',
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    },
  })

  const watchedKeys = watch()

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Please login to access settings')
        return
      }

      setUserId(user.id)

      // Use user_profiles table with JSONB preferences
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('preferences')
        .eq('id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      if (profile?.preferences) {
        const prefs = profile.preferences as any

        // Load API keys (stored in preferences.api_keys)
        if (prefs.api_keys?.openrouter) {
          setValue('openrouterKey', prefs.api_keys.openrouter)
        }
        if (prefs.api_keys?.github) {
          setValue('githubToken', prefs.api_keys.github)
        }

        // Load preferences
        if (prefs.settings) {
          setPreferences({
            darkMode: prefs.settings.dark_mode ?? true,
            autoSave: prefs.settings.auto_save ?? true,
            notifications: prefs.settings.notifications ?? true,
            soundEffects: prefs.settings.sound_effects ?? false,
            streamResponses: prefs.settings.stream_responses ?? true,
            autoApproveTools: prefs.settings.auto_approve_tools ?? false,
          })
        }

        // Load security
        if (prefs.security) {
          setSecurity({
            twoFactor: prefs.security.two_factor ?? false,
            sessionTimeout: prefs.security.session_timeout ?? 30,
            ipWhitelist: prefs.security.ip_whitelist ?? '',
            auditLog: prefs.security.audit_log ?? true,
          })
        }

        // Load notification settings
        if (prefs.notification_settings) {
          setNotificationSettings({
            jobComplete: prefs.notification_settings.job_complete ?? true,
            toolApproval: prefs.notification_settings.tool_approval ?? true,
            fileChanges: prefs.notification_settings.file_changes ?? false,
            pullRequests: prefs.notification_settings.pull_requests ?? true,
            email: prefs.notification_settings.email ?? false,
            slack: prefs.notification_settings.slack ?? true,
          })
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveApiKeys = async (data: ApiKeyForm) => {
    if (!userId) {
      toast.error('Please login to save settings')
      return
    }

    try {
      setSaving(true)

      // Load current preferences to merge
      const { data: currentProfile } = await supabase
        .from('user_profiles')
        .select('preferences')
        .eq('id', userId)
        .single()

      const currentPrefs = (currentProfile?.preferences as any) || {}

      const { error } = await supabase
        .from('user_profiles')
        .update({
          preferences: {
            ...currentPrefs,
            api_keys: {
              openrouter: data.openrouterKey,
              github: data.githubToken || null,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (error) throw error

      toast.success('API keys saved successfully')
    } catch (error) {
      console.error('Failed to save API keys:', error)
      toast.error('Failed to save API keys')
    } finally {
      setSaving(false)
    }
  }

  const handleSavePreferences = async () => {
    if (!userId) {
      toast.error('Please login to save settings')
      return
    }

    try {
      setSaving(true)

      // Load current preferences to merge
      const { data: currentProfile } = await supabase
        .from('user_profiles')
        .select('preferences')
        .eq('id', userId)
        .single()

      const currentPrefs = (currentProfile?.preferences as any) || {}

      const { error } = await supabase
        .from('user_profiles')
        .update({
          preferences: {
            ...currentPrefs,
            settings: {
              dark_mode: preferences.darkMode,
              auto_save: preferences.autoSave,
              notifications: preferences.notifications,
              sound_effects: preferences.soundEffects,
              stream_responses: preferences.streamResponses,
              auto_approve_tools: preferences.autoApproveTools,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (error) throw error

      toast.success('Preferences saved successfully')
    } catch (error) {
      console.error('Failed to save preferences:', error)
      toast.error('Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSecurity = async () => {
    if (!userId) {
      toast.error('Please login to save settings')
      return
    }

    try {
      setSaving(true)

      // Load current preferences to merge
      const { data: currentProfile } = await supabase
        .from('user_profiles')
        .select('preferences')
        .eq('id', userId)
        .single()

      const currentPrefs = (currentProfile?.preferences as any) || {}

      const { error } = await supabase
        .from('user_profiles')
        .update({
          preferences: {
            ...currentPrefs,
            security: {
              two_factor: security.twoFactor,
              session_timeout: Math.max(5, Math.min(1440, security.sessionTimeout)), // 5min - 24h
              ip_whitelist: security.ipWhitelist,
              audit_log: security.auditLog,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (error) throw error

      toast.success('Security settings saved successfully')
    } catch (error) {
      console.error('Failed to save security settings:', error)
      toast.error('Failed to save security settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotifications = async () => {
    if (!userId) {
      toast.error('Please login to save settings')
      return
    }

    try {
      setSaving(true)

      // Load current preferences to merge
      const { data: currentProfile } = await supabase
        .from('user_profiles')
        .select('preferences')
        .eq('id', userId)
        .single()

      const currentPrefs = (currentProfile?.preferences as any) || {}

      const { error } = await supabase
        .from('user_profiles')
        .update({
          preferences: {
            ...currentPrefs,
            notification_settings: {
              job_complete: notificationSettings.jobComplete,
              tool_approval: notificationSettings.toolApproval,
              file_changes: notificationSettings.fileChanges,
              pull_requests: notificationSettings.pullRequests,
              email: notificationSettings.email,
              slack: notificationSettings.slack,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (error) throw error

      toast.success('Notification settings saved successfully')
    } catch (error) {
      console.error('Failed to save notification settings:', error)
      toast.error('Failed to save notification settings')
    } finally {
      setSaving(false)
    }
  }

  const toggleKeyVisibility = (key: string) => {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const getConnectionStatus = (key?: string) => {
    if (!key || key === '') {
      return (
        <Badge variant="secondary" className="flex items-center gap-1 w-fit">
          <XCircle className="h-3 w-3" />
          Not Configured
        </Badge>
      )
    }
    return (
      <Badge variant="default" className="flex items-center gap-1 w-fit">
        <CheckCircle className="h-3 w-3" />
        Connected
      </Badge>
    )
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="container mx-auto p-6 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings2 className="h-8 w-8" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your API keys, preferences, security, and notifications
          </p>
        </div>

        <Tabs defaultValue="api-keys" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="api-keys" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="preferences" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Preferences
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Security
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
          </TabsList>

          {/* API Keys Tab */}
          <TabsContent value="api-keys">
            <Card>
              <CardHeader>
                <CardTitle>API Keys & Integrations</CardTitle>
                <CardDescription>
                  Configure your API keys for AI providers and external services
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(handleSaveApiKeys)} className="space-y-6">
                  {/* OpenRouter */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="openrouterKey">OpenRouter API Key *</Label>
                      {getConnectionStatus(watchedKeys.openrouterKey)}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id="openrouterKey"
                        type={showKeys.openrouter ? 'text' : 'password'}
                        placeholder="sk-or-v1-..."
                        {...register('openrouterKey')}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => toggleKeyVisibility('openrouter')}
                      >
                        {showKeys.openrouter ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {errors.openrouterKey && (
                      <p className="text-sm text-destructive">{errors.openrouterKey.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Required for AI chat functionality. Get your key from{' '}
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        OpenRouter
                      </a>
                    </p>
                  </div>

                  <Separator />

                  {/* GitHub Token */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="githubToken">GitHub Personal Access Token</Label>
                      {getConnectionStatus(watchedKeys.githubToken)}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id="githubToken"
                        type={showKeys.github ? 'text' : 'password'}
                        placeholder="ghp_..."
                        {...register('githubToken')}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => toggleKeyVisibility('github')}
                      >
                        {showKeys.github ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Optional. Required for creating PRs and GitHub integrations
                    </p>
                  </div>

                  <Separator />

                  {/* Supabase */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="supabaseUrl">Supabase URL</Label>
                      <Input id="supabaseUrl" type="url" {...register('supabaseUrl')} disabled />
                      <p className="text-xs text-muted-foreground">Configured via environment variables</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="supabaseKey">Supabase Anon Key</Label>
                      <Input id="supabaseKey" type="password" {...register('supabaseKey')} disabled />
                      <p className="text-xs text-muted-foreground">Configured via environment variables</p>
                    </div>
                  </div>

                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save API Keys
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences">
            <Card>
              <CardHeader>
                <CardTitle>User Preferences</CardTitle>
                <CardDescription>Customize your experience</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Dark Mode</Label>
                    <p className="text-sm text-muted-foreground">Use dark theme</p>
                  </div>
                  <Switch
                    checked={preferences.darkMode}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({ ...prev, darkMode: checked }))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-save</Label>
                    <p className="text-sm text-muted-foreground">Automatically save settings</p>
                  </div>
                  <Switch
                    checked={preferences.autoSave}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({ ...prev, autoSave: checked }))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Notifications</Label>
                    <p className="text-sm text-muted-foreground">Show system notifications</p>
                  </div>
                  <Switch
                    checked={preferences.notifications}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({ ...prev, notifications: checked }))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Sound Effects</Label>
                    <p className="text-sm text-muted-foreground">Play sounds for actions</p>
                  </div>
                  <Switch
                    checked={preferences.soundEffects}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({ ...prev, soundEffects: checked }))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Stream Responses</Label>
                    <p className="text-sm text-muted-foreground">Stream AI responses in real-time</p>
                  </div>
                  <Switch
                    checked={preferences.streamResponses}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({ ...prev, streamResponses: checked }))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-approve Safe Tools</Label>
                    <p className="text-sm text-muted-foreground">Automatically approve low-risk tool calls</p>
                  </div>
                  <Switch
                    checked={preferences.autoApproveTools}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({ ...prev, autoApproveTools: checked }))
                    }
                  />
                </div>

                <Button onClick={handleSavePreferences} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Protect your account and data</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
                  </div>
                  <Switch
                    checked={security.twoFactor}
                    onCheckedChange={(checked) => setSecurity((prev) => ({ ...prev, twoFactor: checked }))}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    min="5"
                    max="1440"
                    value={security.sessionTimeout}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 30
                      const clamped = Math.max(5, Math.min(1440, value))
                      setSecurity((prev) => ({ ...prev, sessionTimeout: clamped }))
                    }}
                  />
                  <p className="text-sm text-muted-foreground">
                    Auto-logout after inactivity (5-1440 minutes)
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="ipWhitelist">IP Whitelist</Label>
                  <Input
                    id="ipWhitelist"
                    placeholder="192.168.1.1, 10.0.0.1"
                    value={security.ipWhitelist}
                    onChange={(e) => setSecurity((prev) => ({ ...prev, ipWhitelist: e.target.value }))}
                  />
                  <p className="text-sm text-muted-foreground">Comma-separated list of allowed IP addresses</p>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Audit Logging</Label>
                    <p className="text-sm text-muted-foreground">Track all account activities</p>
                  </div>
                  <Switch
                    checked={security.auditLog}
                    onCheckedChange={(checked) => setSecurity((prev) => ({ ...prev, auditLog: checked }))}
                  />
                </div>

                <Button onClick={handleSaveSecurity} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Security Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Choose what notifications you want to receive</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Job Completion</Label>
                    <p className="text-sm text-muted-foreground">Notify when background jobs complete</p>
                  </div>
                  <Switch
                    checked={notificationSettings.jobComplete}
                    onCheckedChange={(checked) =>
                      setNotificationSettings((prev) => ({ ...prev, jobComplete: checked }))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Tool Approval Required</Label>
                    <p className="text-sm text-muted-foreground">Notify when tools need approval</p>
                  </div>
                  <Switch
                    checked={notificationSettings.toolApproval}
                    onCheckedChange={(checked) =>
                      setNotificationSettings((prev) => ({ ...prev, toolApproval: checked }))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>File Changes</Label>
                    <p className="text-sm text-muted-foreground">Notify when files are modified</p>
                  </div>
                  <Switch
                    checked={notificationSettings.fileChanges}
                    onCheckedChange={(checked) =>
                      setNotificationSettings((prev) => ({ ...prev, fileChanges: checked }))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Pull Requests</Label>
                    <p className="text-sm text-muted-foreground">Notify about PR activity</p>
                  </div>
                  <Switch
                    checked={notificationSettings.pullRequests}
                    onCheckedChange={(checked) =>
                      setNotificationSettings((prev) => ({ ...prev, pullRequests: checked }))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Send notifications via email</p>
                  </div>
                  <Switch
                    checked={notificationSettings.email}
                    onCheckedChange={(checked) =>
                      setNotificationSettings((prev) => ({ ...prev, email: checked }))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Slack Notifications</Label>
                    <p className="text-sm text-muted-foreground">Send notifications to Slack</p>
                  </div>
                  <Switch
                    checked={notificationSettings.slack}
                    onCheckedChange={(checked) =>
                      setNotificationSettings((prev) => ({ ...prev, slack: checked }))
                    }
                  />
                </div>

                <Button onClick={handleSaveNotifications} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Notification Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}
