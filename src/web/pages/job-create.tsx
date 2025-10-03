'use client'

import { motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import type { CreateJobRequest } from '../lib/api-client'
import { useApiClient } from '../lib/api-client'

export function JobCreatePage() {
  const apiClient = useApiClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)

  const [formData, setFormData] = useState<CreateJobRequest>({
    repo: '',
    baseBranch: 'main',
    task: '',
    playbook: '',
    envVars: {},
    limits: {
      timeMin: 30,
      maxToolCalls: 50,
      maxMemoryMB: 2048,
    },
    priority: 5,
  })

  function handleInputChange(field: keyof CreateJobRequest, value: any) {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  function handleLimitChange(field: string, value: number) {
    setFormData((prev) => ({
      ...prev,
      limits: { ...prev.limits, [field]: value },
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      // Validate required fields
      if (!formData.repo || !formData.task) {
        throw new Error('Repository and task are required')
      }

      // Create job
      const response = await apiClient.createJob(formData)

      if (response.data?.jobId) {
        setJobId(response.data.jobId)
        setSuccess(true)

        // Redirect to job details after 2 seconds
        setTimeout(() => {
          window.location.href = `/jobs/${response.data.jobId}`
        }, 2000)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create job')
    } finally {
      setLoading(false)
    }
  }

  if (success && jobId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="p-8 max-w-md w-full text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Job Created Successfully!</h2>
          <p className="text-muted-foreground mb-4">Job ID: {jobId}</p>
          <p className="text-sm text-muted-foreground">Redirecting to job details...</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Create Background Job</h1>
        <p className="text-muted-foreground mt-1">Configure and start a new background agent task</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Repository <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="owner/repository (e.g., nikomatt69/nikcli)"
                value={formData.repo}
                onChange={(e) => handleInputChange('repo', e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">GitHub repository in format: owner/repo</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Base Branch</label>
              <Input
                type="text"
                placeholder="main"
                value={formData.baseBranch}
                onChange={(e) => handleInputChange('baseBranch', e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">The branch to work from (default: main)</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Task Description <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground min-h-[120px] focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Describe the task you want the background agent to perform..."
                value={formData.task}
                onChange={(e) => handleInputChange('task', e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Clear description of what you want the agent to accomplish
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Playbook (Optional)</label>
              <Input
                type="text"
                placeholder="playbook.yaml"
                value={formData.playbook}
                onChange={(e) => handleInputChange('playbook', e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Path to playbook file (if using structured workflow)</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Priority</label>
              <Input
                type="number"
                min="1"
                max="10"
                placeholder="5"
                value={formData.priority}
                onChange={(e) => handleInputChange('priority', parseInt(e.target.value, 10))}
              />
              <p className="text-xs text-muted-foreground mt-1">Job priority (1-10, higher = more priority)</p>
            </div>
          </div>
        </Card>

        {/* Resource Limits */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Resource Limits</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Max Time (minutes)</label>
              <Input
                type="number"
                min="1"
                max="120"
                value={formData.limits?.timeMin}
                onChange={(e) => handleLimitChange('timeMin', parseInt(e.target.value, 10))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Max Tool Calls</label>
              <Input
                type="number"
                min="1"
                max="200"
                value={formData.limits?.maxToolCalls}
                onChange={(e) => handleLimitChange('maxToolCalls', parseInt(e.target.value, 10))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Max Memory (MB)</label>
              <Input
                type="number"
                min="512"
                max="8192"
                step="512"
                value={formData.limits?.maxMemoryMB}
                onChange={(e) => handleLimitChange('maxMemoryMB', parseInt(e.target.value, 10))}
              />
            </div>
          </div>
        </Card>

        {/* Environment Variables */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Environment Variables (Optional)</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Add environment variables that will be available to the background agent
          </p>
          <div className="space-y-2">
            <textarea
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground min-h-[80px] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="KEY1=value1&#10;KEY2=value2"
              onChange={(e) => {
                const lines = e.target.value.split('\n')
                const envVars: Record<string, string> = {}
                for (const line of lines) {
                  const [key, ...valueParts] = line.split('=')
                  if (key && valueParts.length > 0) {
                    envVars[key.trim()] = valueParts.join('=').trim()
                  }
                }
                handleInputChange('envVars', envVars)
              }}
            />
          </div>
        </Card>

        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3"
          >
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-sm text-red-500">{error}</p>
          </motion.div>
        )}

        {/* Submit Button */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => (window.location.href = '/jobs')}
            className="px-6 py-3 border border-border rounded-lg font-medium hover:bg-accent transition-colors"
          >
            Cancel
          </button>

          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.05 }}
            whileTap={{ scale: loading ? 1 : 0.95 }}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{loading ? 'Creating Job...' : 'Create Job'}</span>
          </motion.button>
        </div>
      </form>
    </div>
  )
}
