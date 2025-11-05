import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
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
import { apiClient } from '@/lib/api-client'
import { CreateJobRequest } from '@/types/jobs'
import { toast } from 'sonner'

const createJobSchema = z.object({
  repo: z.string().min(1, 'Repository is required').regex(/^[^/]+\/[^/]+$/, 'Format: owner/repo'),
  baseBranch: z.string().optional(),
  task: z.string().min(10, 'Task description must be at least 10 characters'),
  playbook: z.string().optional(),
  envVars: z.string().optional(),
})

type CreateJobForm = z.infer<typeof createJobSchema>

interface CreateJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function CreateJobDialog({ open, onOpenChange }: CreateJobDialogProps) {
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateJobForm>({
    resolver: zodResolver(createJobSchema),
    defaultValues: {
      baseBranch: 'main',
    },
  })

  const createJobMutation = useMutation({
    mutationFn: (data: CreateJobRequest) => apiClient.post<{ jobId: string }>('/v1/jobs', data),
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
      let envVars: Record<string, string> | undefined
      if (data.envVars) {
        try {
          envVars = JSON.parse(data.envVars)
        } catch {
          toast.error('Invalid JSON format for environment variables')
          setIsSubmitting(false)
          return
        }
      }

      const jobRequest: CreateJobRequest = {
        repo: data.repo,
        baseBranch: data.baseBranch || 'main',
        task: data.task,
        playbook: data.playbook || undefined,
        envVars,
      }

      await createJobMutation.mutateAsync(jobRequest)
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
