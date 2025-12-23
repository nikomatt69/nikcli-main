/**
 * NewSessionDialog Component
 * Dialog for creating a new chat session
 */

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod/v3';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CreateChatSessionRequest } from '@/types/chat'

const createSessionSchema = z.object({
  repo: z.string().min(1, 'Repository is required').regex(/^[^/]+\/[^/]+$/, {
    message: 'Repository must be in format: owner/repo',
  }),
  baseBranch: z.string().optional(),
  initialMessage: z.string().min(10, 'Initial message must be at least 10 characters'),
})

type CreateSessionForm = z.infer<typeof createSessionSchema>

export interface NewSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (request: CreateChatSessionRequest) => void
  isCreating?: boolean
}

export function NewSessionDialog({
  open,
  onOpenChange,
  onSubmit,
  isCreating,
}: NewSessionDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateSessionForm>({
    resolver: zodResolver(createSessionSchema),
    defaultValues: {
      baseBranch: 'main',
      initialMessage: '',
    },
  })

  const onSubmitForm = (data: CreateSessionForm) => {
    onSubmit({
      repo: data.repo,
      baseBranch: data.baseBranch || 'main',
      initialMessage: data.initialMessage,
    })
    reset()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Chat Session</DialogTitle>
          <DialogDescription>
            Start an interactive chat session with a background agent
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="repo">Repository *</Label>
            <Input
              id="repo"
              placeholder="owner/repository"
              {...register('repo')}
              disabled={isCreating}
            />
            {errors.repo && (
              <p className="text-xs text-destructive">{errors.repo.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="baseBranch">Base Branch</Label>
            <Input
              id="baseBranch"
              placeholder="main"
              {...register('baseBranch')}
              disabled={isCreating}
            />
            {errors.baseBranch && (
              <p className="text-xs text-destructive">{errors.baseBranch.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="initialMessage">Initial Message *</Label>
            <Textarea
              id="initialMessage"
              placeholder="What would you like the agent to do? Be specific..."
              rows={4}
              {...register('initialMessage')}
              disabled={isCreating}
            />
            {errors.initialMessage && (
              <p className="text-xs text-destructive">{errors.initialMessage.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Describe the task you want the background agent to work on
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Session'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
