/**
 * Slack Notifier
 * Listens to BackgroundAgentService events and sends Slack notifications
 */

import { notifyJobCompleted, notifyJobFailed, notifyJobStarted } from '../api/slack-routes'
import type { BackgroundAgentService } from '../background-agent-service'
import type { BackgroundJob } from '../types'

export class SlackNotifier {
  private enabled: boolean

  constructor(private service: BackgroundAgentService) {
    this.enabled = process.env.SLACK_TASK_NOTIFICATIONS === 'true'

    if (this.enabled) {
      this.setupListeners()
      console.log('✓ Slack notifications enabled')
    } else {
      console.log('ℹ Slack notifications disabled (set SLACK_TASK_NOTIFICATIONS=true to enable)')
    }
  }

  private setupListeners(): void {
    // Listen to job started events
    this.service.on('job:started', async (jobId: string, job: BackgroundJob) => {
      if (!this.enabled) return

      try {
        await notifyJobStarted(jobId, job.repo, job.task)
      } catch (error) {
        console.error('[SlackNotifier] Failed to send job started notification:', error)
      }
    })

    // Listen to job completed events
    this.service.on('job:completed', async (jobId: string, job: BackgroundJob) => {
      if (!this.enabled) return

      try {
        const duration =
          job.completedAt && job.startedAt ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime() : 0

        await notifyJobCompleted(jobId, job.repo, duration)
      } catch (error) {
        console.error('[SlackNotifier] Failed to send job completed notification:', error)
      }
    })

    // Listen to job failed events
    this.service.on('job:failed', async (jobId: string, job: BackgroundJob) => {
      if (!this.enabled) return

      try {
        await notifyJobFailed(jobId, job.repo, job.error || 'Unknown error')
      } catch (error) {
        console.error('[SlackNotifier] Failed to send job failed notification:', error)
      }
    })

    // Listen to job timeout events
    this.service.on('job:timeout', async (jobId: string, job: BackgroundJob) => {
      if (!this.enabled) return

      try {
        await notifyJobFailed(jobId, job.repo, 'Job exceeded time limit')
      } catch (error) {
        console.error('[SlackNotifier] Failed to send job timeout notification:', error)
      }
    })
  }

  /**
   * Enable or disable notifications at runtime
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled
    console.log(`Slack notifications ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Check if notifications are enabled
   */
  public isEnabled(): boolean {
    return this.enabled
  }
}
