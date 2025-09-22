// src/cli/background-agents/github/github-integration.ts

import { Octokit } from '@octokit/rest'
import type { BackgroundJob, CommitConfig, GitHubConfig } from '../types'

export interface GitHubPRResult {
  prNumber: number
  prUrl: string
  checkRunId?: number
}

export interface GitHubCheckStatus {
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out'
  output?: {
    title: string
    summary: string
    text?: string
  }
}

export class GitHubIntegration {
  private octokit: Octokit
  private config: GitHubConfig

  constructor(config: GitHubConfig) {
    this.config = config
    this.octokit = new Octokit({
      auth: this.generateJWT(),
      userAgent: 'nikCLI-background-agents/0.2.1',
    })
  }

  /**
   * Generate JWT for GitHub App authentication
   */
  private generateJWT(): string {
    const jwt = require('jsonwebtoken')
    const payload = {
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
      iss: this.config.appId,
    }

    return jwt.sign(payload, this.config.privateKey, { algorithm: 'RS256' })
  }

  /**
   * Get installation access token
   */
  private async getInstallationToken(): Promise<string> {
    const response = await this.octokit.apps.createInstallationAccessToken({
      installation_id: parseInt(this.config.installationId),
    })

    return response.data.token
  }

  /**
   * Initialize authenticated Octokit with installation token
   */
  private async getAuthenticatedOctokit(): Promise<Octokit> {
    const token = await this.getInstallationToken()
    return new Octokit({
      auth: token,
      userAgent: 'nikCLI-background-agents/0.2.1',
    })
  }

  /**
   * Create work branch for background job
   */
  async createWorkBranch(job: BackgroundJob): Promise<void> {
    const octokit = await this.getAuthenticatedOctokit()
    const [owner, repo] = job.repo.split('/')

    try {
      // Get base branch SHA
      const baseBranchResponse = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${job.baseBranch}`,
      })

      const baseSha = baseBranchResponse.data.object.sha

      // Create work branch
      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${job.workBranch}`,
        sha: baseSha,
      })
    } catch (error: any) {
      if (error.status === 422 && error.message.includes('Reference already exists')) {
        // Branch already exists, that's okay
        return
      }
      throw new Error(`Failed to create work branch: ${error.message}`)
    }
  }

  /**
   * Create pull request for completed job
   */
  async createPullRequest(job: BackgroundJob, commitConfig: CommitConfig): Promise<GitHubPRResult> {
    const octokit = await this.getAuthenticatedOctokit()
    const [owner, repo] = job.repo.split('/')

    try {
      // Check if there are changes to commit
      const changesExist = await this.checkForChanges(job)
      if (!changesExist) {
        throw new Error('No changes to commit')
      }

      // Create pull request
      const prResponse = await octokit.pulls.create({
        owner,
        repo,
        title: this.generatePRTitle(job, commitConfig),
        body: this.generatePRBody(job, commitConfig),
        head: job.workBranch,
        base: job.baseBranch,
        draft: commitConfig.draft || false,
      })

      const prNumber = prResponse.data.number
      const prUrl = prResponse.data.html_url

      // Add reviewers if specified
      if (commitConfig.reviewers && commitConfig.reviewers.length > 0) {
        const reviewers = commitConfig.reviewers.filter((r) => !r.startsWith('@')).map((r) => r.replace(/^@/, ''))

        if (reviewers.length > 0) {
          await octokit.pulls.requestReviewers({
            owner,
            repo,
            pull_number: prNumber,
            reviewers,
          })
        }
      }

      // Add labels if specified
      if (commitConfig.labels && commitConfig.labels.length > 0) {
        await octokit.issues.addLabels({
          owner,
          repo,
          issue_number: prNumber,
          labels: commitConfig.labels,
        })
      }

      // Create initial check run
      const checkRunResponse = await this.createCheckRun(job, {
        name: 'nikCLI Background Agent',
        status: 'completed',
        conclusion: 'success',
        output: {
          title: 'Background job completed successfully',
          summary: `Task: ${job.task}`,
          text: this.generateCheckRunDetails(job),
        },
      })

      return {
        prNumber,
        prUrl,
        checkRunId: checkRunResponse.data.id,
      }
    } catch (error: any) {
      throw new Error(`Failed to create pull request: ${error.message}`)
    }
  }

  /**
   * Create check run for job status
   */
  async createCheckRun(job: BackgroundJob, checkStatus: GitHubCheckStatus): Promise<any> {
    const octokit = await this.getAuthenticatedOctokit()
    const [owner, repo] = job.repo.split('/')

    try {
      // Get the latest commit SHA from work branch
      const branchResponse = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${job.workBranch}`,
      })

      const headSha = branchResponse.data.object.sha

      return await octokit.checks.create({
        owner,
        repo,
        name: checkStatus.name,
        head_sha: headSha,
        status: checkStatus.status,
        conclusion: checkStatus.conclusion,
        output: checkStatus.output,
        started_at: job.startedAt?.toISOString(),
        completed_at: checkStatus.status === 'completed' ? new Date().toISOString() : undefined,
      })
    } catch (error: any) {
      throw new Error(`Failed to create check run: ${error.message}`)
    }
  }

  /**
   * Update check run status
   */
  async updateCheckRun(job: BackgroundJob, checkRunId: number, checkStatus: GitHubCheckStatus): Promise<void> {
    const octokit = await this.getAuthenticatedOctokit()
    const [owner, repo] = job.repo.split('/')

    try {
      await octokit.checks.update({
        owner,
        repo,
        check_run_id: checkRunId,
        status: checkStatus.status,
        conclusion: checkStatus.conclusion,
        output: checkStatus.output,
        completed_at: checkStatus.status === 'completed' ? new Date().toISOString() : undefined,
      })
    } catch (error: any) {
      console.error(`Failed to update check run ${checkRunId}:`, error.message)
    }
  }

  /**
   * Add comment to pull request
   */
  async addPRComment(job: BackgroundJob, prNumber: number, comment: string): Promise<void> {
    const octokit = await this.getAuthenticatedOctokit()
    const [owner, repo] = job.repo.split('/')

    try {
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: comment,
      })
    } catch (error: any) {
      console.error(`Failed to add PR comment:`, error.message)
    }
  }

  /**
   * Check if there are changes in the work branch
   */
  private async checkForChanges(job: BackgroundJob): Promise<boolean> {
    const octokit = await this.getAuthenticatedOctokit()
    const [owner, repo] = job.repo.split('/')

    try {
      const comparison = await octokit.repos.compareCommitsWithBasehead({
        owner,
        repo,
        basehead: `${job.baseBranch}...${job.workBranch}`,
      })

      return Boolean(comparison.data.files && comparison.data.files.length > 0)
    } catch (error: any) {
      console.error(`Failed to check for changes:`, error.message)
      return false
    }
  }

  /**
   * Generate PR title
   */
  private generatePRTitle(job: BackgroundJob, commitConfig: CommitConfig): string {
    if (commitConfig.message) {
      return commitConfig.message
    }

    return `feat: ${job.task} (nikCLI background agent)`
  }

  /**
   * Generate PR body
   */
  private generatePRBody(job: BackgroundJob, commitConfig: CommitConfig): string {
    const body = [
      '## 🤖 Background Agent Task',
      '',
      `**Task:** ${job.task}`,
      `**Agent:** ${job.playbook || 'direct-task'}`,
      `**Branch:** \`${job.workBranch}\``,
      '',
      '## 📊 Execution Summary',
      '',
      `- **Duration:** ${this.formatDuration(job)}`,
      `- **Tool Calls:** ${job.metrics.toolCalls}`,
      `- **Token Usage:** ${job.metrics.tokenUsage}`,
      '',
      '## 🔗 Links',
      '',
      `- [Job Logs](${this.getJobLogsUrl(job)})`,
      '',
      '---',
      '',
      '*This PR was created automatically by nikCLI Background Agents*',
    ]

    return body.join('\n')
  }

  /**
   * Generate check run details
   */
  private generateCheckRunDetails(job: BackgroundJob): string {
    const details = [
      `**Job ID:** ${job.id}`,
      `**Task:** ${job.task}`,
      `**Playbook:** ${job.playbook || 'Direct task execution'}`,
      `**Duration:** ${this.formatDuration(job)}`,
      `**Tool Calls:** ${job.metrics.toolCalls}`,
      `**Token Usage:** ${job.metrics.tokenUsage}`,
      '',
      '**Execution Log:**',
      '',
      ...job.logs.slice(-10).map((log) => `${log.timestamp.toISOString()}: [${log.level}] ${log.message}`),
    ]

    return details.join('\n')
  }

  /**
   * Format job duration
   */
  private formatDuration(job: BackgroundJob): string {
    if (!job.startedAt || !job.completedAt) {
      return 'Unknown'
    }

    const durationMs = job.completedAt.getTime() - job.startedAt.getTime()
    const minutes = Math.floor(durationMs / 60000)
    const seconds = Math.floor((durationMs % 60000) / 1000)

    return `${minutes}m ${seconds}s`
  }

  /**
   *
   * Get job logs URL (this would point to your console)
   */
  private getJobLogsUrl(job: BackgroundJob): string {
    return `${process.env.CONSOLE_URL || 'http://localhost:3001'}/jobs/${job.id}`
  }

  /**
   * Handle GitHub webhook events
   */
  async handleWebhookEvent(event: string, payload: any): Promise<void> {
    switch (event) {
      case 'check_run':
        await this.handleCheckRunEvent(payload)
        break
      case 'pull_request':
        await this.handlePullRequestEvent(payload)
        break
      case 'push':
        await this.handlePushEvent(payload)
        break
      default:
        console.log(`Unhandled webhook event: ${event}`)
    }
  }

  /**
   * Handle check run events
   */
  private async handleCheckRunEvent(payload: any): Promise<void> {
    const { action, check_run } = payload

    if (action === 'rerequested') {
      // User requested to re-run the check
      console.log(`Check run re-requested: ${check_run.id}`)
      // This would trigger a new background job
    }
  }

  /**
   * Handle pull request events
   */
  private async handlePullRequestEvent(payload: any): Promise<void> {
    const { action, pull_request } = payload

    if (action === 'closed' && pull_request.merged) {
      // PR was merged, cleanup work branch
      console.log(`PR merged: ${pull_request.number}`)
      await this.cleanupWorkBranch(pull_request.head.ref, payload.repository)
    }
  }

  /**
   * Handle push events
   */
  private async handlePushEvent(payload: any): Promise<void> {
    const { ref, repository } = payload

    if (ref.startsWith('refs/heads/nik/BA-')) {
      // Push to work branch, update check status
      console.log(`Push to work branch: ${ref}`)
    }
  }

  /**
   * Cleanup work branch after PR is merged
   */
  private async cleanupWorkBranch(branchName: string, repository: any): Promise<void> {
    const octokit = await this.getAuthenticatedOctokit()

    try {
      await octokit.git.deleteRef({
        owner: repository.owner.login,
        repo: repository.name,
        ref: `heads/${branchName}`,
      })

      console.log(`Deleted work branch: ${branchName}`)
    } catch (error: any) {
      console.error(`Failed to delete work branch ${branchName}:`, error.message)
    }
  }

  /**
   * Verify webhook signature
   */
  static verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('node:crypto')
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')

    return crypto.timingSafeEqual(Buffer.from(`sha256=${expectedSignature}`, 'utf8'), Buffer.from(signature, 'utf8'))
  }
}
