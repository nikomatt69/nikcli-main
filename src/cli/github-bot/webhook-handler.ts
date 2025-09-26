// src/cli/github-bot/webhook-handler.ts

import crypto from 'node:crypto'
import { Octokit } from '@octokit/rest'
import { CommentProcessor } from './comment-processor'
import { TaskExecutor } from './task-executor'
import type { GitHubWebhookEvent, NikCLIMention, ProcessingJob, GitHubBotConfig } from './types'


/**
 * GitHub Bot Webhook Handler for @nikcli mentions
 * Processes GitHub webhook events and handles @nikcli mentions in comments
 */
export class GitHubWebhookHandler {
  private octokit: Octokit
  private config: GitHubBotConfig
  private commentProcessor: CommentProcessor
  private taskExecutor: TaskExecutor
  private processingJobs: Map<string, ProcessingJob> = new Map()

  constructor(config: GitHubBotConfig) {
    this.config = config
    this.octokit = new Octokit({
      auth: config.githubToken,
      userAgent: 'nikCLI-bot/0.2.2'
    })

    this.commentProcessor = new CommentProcessor()
    this.taskExecutor = new TaskExecutor(this.octokit, config)
  }

  /**
   * Verify GitHub webhook signature
   */
  private verifySignature(payload: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(payload, 'utf8')
      .digest('hex')

    const expectedBuffer = Buffer.from(`sha256=${expectedSignature}`)
    const actualBuffer = Buffer.from(signature)

    return expectedBuffer.length === actualBuffer.length &&
           crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  }

  /**
   * Handle GitHub webhook request
   */
  async handleWebhook(req: any, res: any): Promise<void> {
    const signature = req.headers['x-hub-signature-256'] as string
    const event = req.headers['x-github-event'] as string
    const payload = JSON.stringify(req.body)

    // Verify webhook signature
    if (!this.verifySignature(payload, signature)) {
      console.error('❌ Invalid webhook signature')
      res.status(401).json({ error: 'Invalid signature' })
      return
    }

    console.log(`📥 Received GitHub webhook: ${event}`)

    try {
      await this.processWebhookEvent(event, req.body)
      res.status(200).json({ success: true })
    } catch (error) {
      console.error('❌ Webhook processing error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Process GitHub webhook event
   */
  private async processWebhookEvent(event: string, payload: GitHubWebhookEvent): Promise<void> {
    switch (event) {
      case 'issue_comment':
        if (payload.action === 'created') {
          await this.handleCommentEvent(payload)
        }
        break

      case 'pull_request_review_comment':
        if (payload.action === 'created') {
          await this.handlePRCommentEvent(payload)
        }
        break

      case 'issues':
        if (payload.action === 'opened') {
          await this.handleIssueEvent(payload)
        }
        break

      default:
        console.log(`ℹ️ Ignoring event: ${event}`)
    }
  }

  /**
   * Handle issue/PR comment events
   */
  private async handleCommentEvent(payload: any): Promise<void> {
    const comment = payload.comment
    const repository = payload.repository
    const issue = payload.issue

    console.log(`💬 New comment in ${repository.full_name}#${issue.number}`)
    console.log(`👤 Author: ${comment.user.login}`)
    console.log(`📝 Comment: ${comment.body.substring(0, 100)}...`)

    // Check if comment mentions @nikcli
    const mention = this.commentProcessor.extractNikCLIMention(comment.body)
    if (!mention) {
      console.log('ℹ️ No @nikcli mention found')
      return
    }

    console.log('🤖 @nikcli mentioned! Processing request...')

    // Create processing job
    const jobId = `${repository.full_name}-${issue.number}-${comment.id}`
    const job: ProcessingJob = {
      id: jobId,
      repository: repository.full_name,
      issueNumber: issue.number,
      commentId: comment.id,
      mention,
      status: 'queued',
      createdAt: new Date(),
      author: comment.user.login
    }

    this.processingJobs.set(jobId, job)

    // Add reaction to show we received the request
    await this.addReaction(repository.full_name, comment.id, '+1')

    // Process the mention asynchronously
    this.processMentionAsync(job)
  }

  /**
   * Handle PR review comment events
   */
  private async handlePRCommentEvent(payload: any): Promise<void> {
    const comment = payload.comment
    const repository = payload.repository
    const pullRequest = payload.pull_request

    console.log(`💬 New PR review comment in ${repository.full_name}#${pullRequest.number}`)

    const mention = this.commentProcessor.extractNikCLIMention(comment.body)
    if (!mention) return

    // Similar processing for PR comments
    const jobId = `${repository.full_name}-pr-${pullRequest.number}-${comment.id}`
    const job: ProcessingJob = {
      id: jobId,
      repository: repository.full_name,
      issueNumber: pullRequest.number,
      commentId: comment.id,
      mention,
      status: 'queued',
      createdAt: new Date(),
      author: comment.user.login,
      isPR: true
    }

    this.processingJobs.set(jobId, job)
    await this.addReaction(repository.full_name, comment.id, '+1')
    this.processMentionAsync(job)
  }

  /**
   * Handle new issue events (auto-analysis)
   */
  private async handleIssueEvent(payload: any): Promise<void> {
    const issue = payload.issue
    const repository = payload.repository

    console.log(`🆕 New issue in ${repository.full_name}#${issue.number}`)

    // Check if issue body contains @nikcli
    const mention = this.commentProcessor.extractNikCLIMention(issue.body)
    if (!mention) return

    // Process issue body as mention
    const jobId = `${repository.full_name}-issue-${issue.number}`
    const job: ProcessingJob = {
      id: jobId,
      repository: repository.full_name,
      issueNumber: issue.number,
      commentId: issue.id,
      mention,
      status: 'queued',
      createdAt: new Date(),
      author: issue.user.login,
      isIssue: true
    }

    this.processingJobs.set(jobId, job)
    this.processMentionAsync(job)
  }

  /**
   * Process @nikcli mention asynchronously
   */
  private async processMentionAsync(job: ProcessingJob): Promise<void> {
    try {
      job.status = 'processing'
      job.startedAt = new Date()

      console.log(`🔄 Processing job: ${job.id}`)
      console.log(`📋 Task: ${job.mention.command}`)

      // Update reaction to processing
      await this.addReaction(job.repository, job.commentId, 'eyes')

      // Execute the requested task
      const result = await this.taskExecutor.executeTask(job)

      job.status = 'completed'
      job.completedAt = new Date()
      job.result = result

      console.log(`✅ Job completed: ${job.id}`)

      // Add success reaction
      await this.addReaction(job.repository, job.commentId, 'rocket')

      // Post result as comment if needed
      if (result.shouldComment) {
        await this.postResultComment(job, result)
      }

    } catch (error) {
      console.error(`❌ Job failed: ${job.id}`, error)

      job.status = 'failed'
      job.error = error instanceof Error ? error.message : 'Unknown error'
      job.completedAt = new Date()

      // Add error reaction
      await this.addReaction(job.repository, job.commentId, 'confused')

      // Post error comment
      await this.postErrorComment(job, error)
    }
  }

  /**
   * Add reaction to comment
   */
  private async addReaction(repository: string, commentId: number, reaction: string): Promise<void> {
    try {
      const [owner, repo] = repository.split('/')
      await this.octokit.rest.reactions.createForIssueComment({
        owner,
        repo,
        comment_id: commentId,
        content: reaction as any
      })
    } catch (error) {
      console.error('Failed to add reaction:', error)
    }
  }

  /**
   * Post result comment
   */
  private async postResultComment(job: ProcessingJob, result: any): Promise<void> {
    try {
      const [owner, repo] = job.repository.split('/')

      const comment = this.formatResultComment(job, result)

      await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: job.issueNumber,
        body: comment
      })

      console.log(`📝 Posted result comment for job: ${job.id}`)
    } catch (error) {
      console.error('Failed to post result comment:', error)
    }
  }

  /**
   * Post error comment
   */
  private async postErrorComment(job: ProcessingJob, error: any): Promise<void> {
    try {
      const [owner, repo] = job.repository.split('/')

      const comment = `🤖 **NikCLI Error**

I encountered an error while processing your request:

\`\`\`
${error instanceof Error ? error.message : 'Unknown error'}
\`\`\`

Please check your request and try again. If the issue persists, please create an issue in the [NikCLI repository](https://github.com/nikomatt69/nikcli-main).

---
*Processing time: ${job.startedAt && job.completedAt ?
  ((job.completedAt.getTime() - job.startedAt.getTime()) / 1000).toFixed(2) + 's' : 'N/A'}*`

      await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: job.issueNumber,
        body: comment
      })
    } catch (postError) {
      console.error('Failed to post error comment:', postError)
    }
  }

  /**
   * Format result comment
   */
  private formatResultComment(job: ProcessingJob, result: any): string {
    const duration = job.startedAt && job.completedAt ?
      ((job.completedAt.getTime() - job.startedAt.getTime()) / 1000).toFixed(2) + 's' :
      'N/A'

    let comment = `🤖 **NikCLI Result**

Task: \`${job.mention.command}\`

`

    if (result.prUrl) {
      comment += `✅ **Pull Request Created:** ${result.prUrl}

${result.summary || 'Changes have been applied successfully.'}

`
    }

    if (result.analysis) {
      comment += `📊 **Analysis:**
${result.analysis}

`
    }

    if (result.files && result.files.length > 0) {
      comment += `📄 **Modified Files:**
${result.files.map((f: string) => `- \`${f}\``).join('\n')}

`
    }

    comment += `---
*Processing time: ${duration} | Powered by [NikCLI](https://github.com/nikomatt69/nikcli-main)*`

    return comment
  }

  /**
   * Get processing job status
   */
  getJobStatus(jobId: string): ProcessingJob | undefined {
    return this.processingJobs.get(jobId)
  }

  /**
   * Get all jobs for monitoring
   */
  getAllJobs(): ProcessingJob[] {
    return Array.from(this.processingJobs.values())
  }
}