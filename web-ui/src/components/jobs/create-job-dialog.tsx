import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiClient } from '@/lib/api-client'
import { CreateJobRequest } from '@/types/jobs'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

const createJobSchema = z.object({
  repo: z.string().min(1, 'Repository is required').regex(/^[^/]+\/[^/]+$/, 'Format: owner/repo'),
  baseBranch: z.string().optional(),
  task: z.string().min(10, 'Task description must be at least 10 characters'),
  playbook: z.string().optional(),
  envVars: z.string().optional(),
  model: z.string().optional(),
})

type CreateJobForm = z.infer<typeof createJobSchema>

interface CreateJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function CreateJobDialog({ open, onOpenChange }: CreateJobDialogProps) {
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [userModel, setUserModel] = useState<string | null>(null)
  const [userApiKey, setUserApiKey] = useState<string | null>(null)
  const [openRouterModels, setOpenRouterModels] = useState<Array<{ id: string; name: string; context_length: number }>>([])
  const [loadingModels, setLoadingModels] = useState(false)

  // Load user preferences for model and API key
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.id) return

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('preferences')
          .eq('id', session.user.id)
          .single()

        if (profile?.preferences) {
          const prefs = profile.preferences as any
          if (prefs.api_keys?.openrouterModel) {
            setUserModel(prefs.api_keys.openrouterModel)
            setValue('model', prefs.api_keys.openrouterModel)
          }
          if (prefs.api_keys?.openrouter) {
            setUserApiKey(prefs.api_keys.openrouter)
          }
        }
      } catch (error) {
        console.error('Failed to load user preferences:', error)
      }
    }

    if (open) {
      loadUserPreferences()
    }
  }, [open])

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<CreateJobForm>({
    resolver: zodResolver(createJobSchema),
    defaultValues: {
      baseBranch: 'main',
      model: '@preset/nikcli',
    },
  })

  const fetchOpenRouterModels = async () => {
    if (openRouterModels.length > 0) return // Already loaded

    try {
      setLoadingModels(true)
      const response = await apiClient.get<{ success: boolean; models: Array<{ id: string; name: string; context_length: number }> }>('/v1/models/openrouter')

      if (response.success && response.data?.models) {
        setOpenRouterModels(response.data.models)
      } else {
        console.error('Failed to fetch models:', response)
      }
    } catch (error) {
      console.error('Error fetching OpenRouter models:', error)
    } finally {
      setLoadingModels(false)
    }
  }

  const createJobMutation = useMutation({
    mutationFn: async (data: CreateJobForm) => {
      // Prepare headers with selected model (from form) or user's saved model, and API key
      const headers: Record<string, string> = {}
      const selectedModel = data.model || userModel || '@preset/nikcli'
      if (selectedModel) {
        headers['x-ai-model'] = selectedModel
      }
      if (userApiKey) {
        headers['x-ai-provider'] = 'openrouter'
        headers['x-ai-key'] = userApiKey
      }

      // Use apiClient's raw client to add custom headers
      const rawClient = apiClient.getRawClient()
      const jobRequest: CreateJobRequest = {
        repo: data.repo,
        baseBranch: data.baseBranch || 'main',
        task: data.task,
        playbook: data.playbook || undefined,
        envVars: data.envVars ? JSON.parse(data.envVars) : undefined,
      }
      const response = await rawClient.post<{ jobId: string }>('/v1/jobs', jobRequest, { headers })

      return {
        success: true,
        data: response.data,
      }
    },
    onSuccess: () => {
      toast.success('Job created successfully!')
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['job-stats'] })
      reset()
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create job')
    },
  })

  const onSubmit = async (data: CreateJobForm) => {
    setIsSubmitting(true)

    try {
      // Parse environment variables if provided
      if (data.envVars) {
        try {
          JSON.parse(data.envVars)
        } catch {
          toast.error('Invalid JSON format for environment variables')
          setIsSubmitting(false)
          return
        }
      }

      await createJobMutation.mutateAsync(data)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Background Job</DialogTitle>
          <DialogDescription>
            Configure a new AI-powered background agent task
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="repo">
              Repository <span className="text-red-400">*</span>
            </Label>
            <Input
              id="repo"
              placeholder="owner/repository"
              {...register('repo')}
              disabled={isSubmitting}
            />
            {errors.repo && (
              <p className="text-sm text-red-400">{errors.repo.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="baseBranch">Base Branch</Label>
            <Input
              id="baseBranch"
              placeholder="main"
              {...register('baseBranch')}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task">
              Task Description <span className="text-red-400">*</span>
            </Label>
            <Textarea
              id="task"
              placeholder="Describe what you want the agent to do..."
              rows={4}
              {...register('task')}
              disabled={isSubmitting}
            />
            {errors.task && (
              <p className="text-sm text-red-400">{errors.task.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="playbook">Playbook (optional)</Label>
            <Input
              id="playbook"
              placeholder="fix-tests, update-dependencies, etc."
              {...register('playbook')}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Reference a playbook from .nik/playbooks/
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="envVars">Environment Variables (optional)</Label>
            <Textarea
              id="envVars"
              placeholder='{"NODE_ENV": "production"}'
              rows={3}
              {...register('envVars')}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              JSON format: {'{'}key: value{'}'}
            </p>
            {errors.envVars && (
              <p className="text-sm text-red-400">{errors.envVars.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">AI Model</Label>
            <Select
              value={watch('model') || userModel || '@preset/nikcli'}
              onValueChange={(value) => setValue('model', value)}
              onOpenChange={(open) => {
                if (open && openRouterModels.length === 0) {
                  fetchOpenRouterModels()
                }
              }}
            >
              <SelectTrigger id="model" disabled={loadingModels || isSubmitting}>
                <SelectValue placeholder="Select a model">
                  {loadingModels ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading models...
                    </span>
                  ) : (
                    watch('model') || userModel || '@preset/nikcli'
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {openRouterModels.length === 0 ? (
                  <SelectItem value="@preset/nikcli">@preset/nikcli (Default)</SelectItem>
                ) : (
                  openRouterModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.id === '@preset/nikcli' ? '⭐ ' : ''}
                      {model.name || model.id}
                      {model.context_length > 0 && ` (${(model.context_length / 1000).toFixed(0)}k)`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select the AI model to use for this job. Defaults to your saved preference.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Job'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
