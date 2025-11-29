// src/cli/github-bot/webhook-handler.ts

import crypto from 'node:crypto'
import { Octokit } from '@octokit/rest'
import { CommentProcessor } from './comment-processor'
import { TaskExecutor } from './task-executor'
import type { GitHubBotConfig, GitHubPullRequest, GitHubWebhookEvent, ProcessingJob } from './types'

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
  private slackService?: any
  private cacheService?: any

  constructor(config: GitHubBotConfig) {
    this.config = config
    this.octokit = new Octokit({
      auth: config.githubToken,
      userAgent: 'nikCLI-bot/1.4.0',
    })

    this.commentProcessor = new CommentProcessor()
    this.taskExecutor = new TaskExecutor(this.octokit, config)

    // Initialize Slack if configured
    if (process.env.SLACK_BOT_TOKEN) {
      this.initializeSlackService().catch(err => {
        console.error('⚠︎ Failed to initialize Slack service:', err)
      })
    }

    // Initialize cache service if available
    this.initializeCacheService().catch(err => {
      console.error('⚠︎ Failed to initialize cache service:', err)
    })
  }

  private async initializeSlackService(): Promise<void> {
    try {
      const { EnhancedSlackService } = await import('../integrations/slack/slack-service')
      this.slackService = new EnhancedSlackService({
        token: process.env.SLACK_BOT_TOKEN!,
        signingSecret: process.env.SLACK_SIGNING_SECRET!,
        botToken: process.env.SLACK_BOT_TOKEN!,
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
      })
      console.log('✓ Slack service initialized')
    } catch (error) {
      console.error('✖ Error initializing Slack service:', error)
    }
  }

  private async initializeCacheService(): Promise<void> {
    try {
      const { cacheService } = await import('../services/cache-service')
      this.cacheService = cacheService
      console.log('✓ Cache service initialized')
    } catch (error) {
      console.error('✖ Error initializing cache service:', error)
    }
  }

  /**
   * Verify GitHub webhook signature with replay attack prevention
   */
  private verifySignature(payload: string, signature: string, timestamp?: string): boolean {
    // Validate timestamp (reject requests older than 5 minutes to prevent replay attacks)
    if (timestamp) {
      const requestTime = parseInt(timestamp)
      const now = Math.floor(Date.now() / 1000)
      if (Math.abs(now - requestTime) > 300) {
        console.error('✖ Webhook timestamp too old or from future')
        return false
      }
    }

    // Validate signature exists
    if (!signature) {
      console.error('✖ Missing webhook signature')
      return false
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(payload, 'utf8')
      .digest('hex')

    const expectedBuffer = Buffer.from(`sha256=${expectedSignature}`)
    const actualBuffer = Buffer.from(signature)

    return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  }

  /**
   * Handle GitHub webhook request
   */
  async handleWebhook(req: any, res: any): Promise<void> {
    const signature = req.headers['x-hub-signature-256'] as string
    const event = req.headers['x-github-event'] as string
    const timestamp = req.headers['x-hub-signature-timestamp'] as string
    // Prefer raw body for signature verification when available
    const payload = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body)

    // Verify webhook signature with timestamp
    if (!this.verifySignature(payload, signature, timestamp)) {
      console.error('✖ Invalid webhook signature or timestamp')
      res.status(401).json({ error: 'Invalid signature or timestamp' })
      return
    }

    console.log(`📥 Received GitHub webhook: ${event}`)

    try {
      await this.processWebhookEvent(event, req.body)
      res.status(200).json({ success: true })
    } catch (error) {
      console.error('✖ Webhook processing error:', error)
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
      // If @nikcli is present but without a valid command, reply with usage help
      if (this.commentProcessor.hasNikCLIMention(comment.body)) {
        await this.postUsageHelp(repository.full_name, issue.number)
      } else {
        console.log('ℹ️ No @nikcli mention found')
      }
      return
    }

    console.log('🔌 @nikcli mentioned! Processing request...')

    // Security validation
    if (!(await this.validateAccess(repository.full_name, comment.user.login))) {
      console.warn(`✖ Access denied for ${comment.user.login} in ${repository.full_name}`)
      await this.postSecurityError(repository.full_name, issue.number, comment.id)
      return
    }

    // Rate limiting check
    if (this.cacheService && !(await this.checkRateLimit(comment.user.login))) {
      console.warn(`✖ Rate limit exceeded for ${comment.user.login}`)
      await this.postRateLimitError(repository.full_name, issue.number, comment.id)
      return
    }

    // Notify Slack about GitHub mention
    let slackThreadTs: string | undefined
    if (this.slackService && process.env.SLACK_DEFAULT_CHANNEL) {
      try {
        slackThreadTs = await this.slackService.notifyGitHubMention(
          process.env.SLACK_DEFAULT_CHANNEL,
          {
            repository: repository.full_name,
            issueNumber: issue.number,
            commentUrl: comment.html_url,
            author: comment.user.login,
            command: `${mention.command} ${mention.args.join(' ')}`.trim(),
          },
        )
        console.log(`✓ Notified Slack about GitHub mention (thread: ${slackThreadTs})`)
      } catch (error) {
        console.error('⚠︎ Failed to notify Slack:', error)
      }
    }

    // Check if this is a comment on a PR (issue.pull_request exists)
    const isPR = !!issue.pull_request
    let pullRequest = null

    if (isPR) {
      // Fetch full PR details
      try {
        const [owner, repo] = repository.full_name.split('/')
        const { data: prData } = await this.octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: issue.number,
        })
        pullRequest = prData
      } catch (error) {
        console.error('Failed to fetch PR details:', error)
      }
    }

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
      author: comment.user.login,
      isPR,
      pullRequest: pullRequest as GitHubPullRequest,
      slackThreadTs, // Link to Slack thread
    } as ProcessingJob

    this.processingJobs.set(jobId, job)

    // Add reaction to show we received the request
    await this.addReactionToIssueComment(repository.full_name, comment.id, '+1')

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
    if (!mention) {
      if (this.commentProcessor.hasNikCLIMention(comment.body)) {
        await this.postUsageHelp(repository.full_name, pullRequest.number)
      }
      return
    }

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
      isPR: true,
      // Mark as PR review comment to use correct reactions API
      // (expanded type in types.ts to include isPRReview)
      isPRReview: true,
      pullRequest: pullRequest,
    }

    this.processingJobs.set(jobId, job)
    await this.addReactionToPRReviewComment(repository.full_name, comment.id, '+1')
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
    if (!mention) {
      if (this.commentProcessor.hasNikCLIMention(issue.body)) {
        await this.postUsageHelp(repository.full_name, issue.number)
      }
      return
    }

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
      isIssue: true,
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

      console.log(`⚡︎ Processing job: ${job.id}`)
      console.log(`📋 Task: ${job.mention.command}`)

      // Update reaction to processing
      if (job.isPRReview) {
        await this.addReactionToPRReviewComment(job.repository, job.commentId, 'eyes')
      } else {
        await this.addReactionToIssueComment(job.repository, job.commentId, 'eyes')
      }

      // Post initial status comment
      const statusCommentId = await this.postStatusComment(job, 'started')

      // Execute the requested task
      const result = await this.taskExecutor.executeTask(job)

      // Update status comment with progress
      if (result.details?.jobId) {
        await this.updateStatusComment(job, statusCommentId, 'running', result.details.jobId)
      }

      job.status = 'completed'
      job.completedAt = new Date()
      job.result = result

      console.log(`✓ Job completed: ${job.id}`)

      // Add success reaction
      if (job.isPRReview) {
        await this.addReactionToPRReviewComment(job.repository, job.commentId, 'rocket')
      } else {
        await this.addReactionToIssueComment(job.repository, job.commentId, 'rocket')
      }

      // Post result as comment if needed
      if (result.shouldComment) {
        await this.postResultComment(job, result)
      }

      // Update final status
      if (statusCommentId) {
        await this.updateStatusComment(job, statusCommentId, 'completed', result.details?.jobId)
      }
    } catch (error) {
      console.error(`✖ Job failed: ${job.id}`, error)

      job.status = 'failed'
      job.error = error instanceof Error ? error.message : 'Unknown error'
      job.completedAt = new Date()

      // Add error reaction
      if (job.isPRReview) {
        await this.addReactionToPRReviewComment(job.repository, job.commentId, 'confused')
      } else {
        await this.addReactionToIssueComment(job.repository, job.commentId, 'confused')
      }

      // Post error comment
      await this.postErrorComment(job, error)
    }
  }

  /**
   * Post status comment
   */
  private async postStatusComment(job: ProcessingJob, status: string): Promise<number | null> {
    try {
      const [owner, repo] = job.repository.split('/')

      const comment = this.formatStatusComment(job, status)

      const response = await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: job.issueNumber,
        body: comment,
      })

      return response.data.id
    } catch (error) {
      console.error('Failed to post status comment:', error)
      return null
    }
  }

  /**
   * Update status comment
   */
  private async updateStatusComment(
    job: ProcessingJob,
    commentId: number | null,
    status: string,
    jobId?: string
  ): Promise<void> {
    if (!commentId) return

    try {
      const [owner, repo] = job.repository.split('/')

      const comment = this.formatStatusComment(job, status, jobId)

      await this.octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: commentId,
        body: comment,
      })
    } catch (error) {
      console.error('Failed to update status comment:', error)
    }
  }

  /**
   * Format status comment
   */
  private formatStatusComment(job: ProcessingJob, status: string, jobId?: string): string {
    const statusEmoji = {
      started: '⚡',
      running: '🔌',
      completed: '✓',
      failed: '✖',
    }

    const emoji = statusEmoji[status as keyof typeof statusEmoji] || '⚙️'

    let comment = `${emoji} **NikCLI Status Update**\n\n`
    comment += `**Task:** \`${job.mention.command}\`\n`
    comment += `**Status:** ${status}\n`

    if (jobId) {
      comment += `**Job ID:** \`${jobId}\`\n`
    }

    if (status === 'running') {
      comment += `\n_Processing in isolated VM environment..._\n`
    }

    comment += `\n---\n_Updated: ${new Date().toISOString()}_`

    return comment
  }

  /**
   * Add reaction to comment
   */
  private async addReactionToIssueComment(repository: string, commentId: number, reaction: string): Promise<void> {
    try {
      const [owner, repo] = repository.split('/')
      await this.octokit.rest.reactions.createForIssueComment({
        owner,
        repo,
        comment_id: commentId,
        content: reaction as any,
      })
    } catch (error) {
      console.error('Failed to add reaction:', error)
    }
  }

  /**
   * Add reaction to PR review comment
   */
  private async addReactionToPRReviewComment(repository: string, commentId: number, reaction: string): Promise<void> {
    try {
      const [owner, repo] = repository.split('/')
      await this.octokit.rest.reactions.createForPullRequestReviewComment({
        owner,
        repo,
        comment_id: commentId,
        content: reaction as any,
      })
    } catch (error) {
      console.error('Failed to add reaction to PR review comment:', error)
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
        body: comment,
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

      const comment = `🔌 **NikCLI Error**

I encountered an error while processing your request:

\`\`\`
${error instanceof Error ? error.message : 'Unknown error'}
\`\`\`

Please check your request and try again. If the issue persists, please create an issue in the [NikCLI repository](https://github.com/nikomatt69/nikcli-main).

---
*Processing time: ${job.startedAt && job.completedAt
          ? `${((job.completedAt.getTime() - job.startedAt.getTime()) / 1000).toFixed(2)}s`
          : 'N/A'
        }*`

      await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: job.issueNumber,
        body: comment,
      })
    } catch (postError) {
      console.error('Failed to post error comment:', postError)
    }
  }

  /**
   * Post usage help comment when @nikcli mention is empty or invalid
   */
  private async postUsageHelp(repository: string, issueNumber: number): Promise<void> {
    try {
      const [owner, repo] = repository.split('/')
      const help = this.commentProcessor.getUsageHelp()
      await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: help,
      })
    } catch (error) {
      console.error('Failed to post usage help:', error)
    }
  }

  /**
   * Format result comment
   */
  private formatResultComment(job: ProcessingJob, result: any): string {
    const duration =
      job.startedAt && job.completedAt
        ? `${((job.completedAt.getTime() - job.startedAt.getTime()) / 1000).toFixed(2)}s`
        : 'N/A'

    let comment = `🔌 **NikCLI Result**

Task: \`${job.mention.command}\`

`

    if (result.prUrl) {
      comment += `✓ **Pull Request Created:** ${result.prUrl}

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

  // ========== SECURITY & RATE LIMITING ==========

  /**
   * Validate repository and user access
   */
  private async validateAccess(repo: string, author: string): Promise<boolean> {
    const allowedRepos = (process.env.ALLOWED_GITHUB_REPOS || '').split(',').filter(Boolean)

    // No whitelist = allow all
    if (allowedRepos.length === 0) {
      return true
    }

    // Check exact match or wildcard
    const isAllowed = allowedRepos.some((pattern) => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'))
        return regex.test(repo)
      }
      return pattern === repo
    })

    if (!isAllowed) {
      console.warn(`✖ Repository ${repo} not in whitelist`)
      return false
    }

    // Check org membership if required
    if (process.env.GITHUB_REQUIRE_ORG_MEMBERSHIP === 'true') {
      const [owner] = repo.split('/')
      return await this.checkOrgMembership(owner, author)
    }

    return true
  }

  /**
   * Check if user is member of organization
   */
  private async checkOrgMembership(org: string, username: string): Promise<boolean> {
    try {
      await this.octokit.rest.orgs.checkMembershipForUser({
        org,
        username,
      })
      console.log(`✓ ${username} is member of ${org}`)
      return true
    } catch (error) {
      console.warn(`✖ ${username} is not member of ${org}`)
      return false
    }
  }

  /**
   * Check rate limit for user
   */
  private async checkRateLimit(username: string): Promise<boolean> {
    if (!this.cacheService) {
      return true // No cache service = no rate limiting
    }

    const rateLimitKey = `ratelimit:github:${username}`
    const limit = parseInt(process.env.GITHUB_RATE_LIMIT_PER_USER || '10', 10)
    const ttl = 3600 // 1 hour

    try {
      const count = await this.cacheService.increment(rateLimitKey, ttl)

      if (count > limit) {
        console.warn(`✖ Rate limit exceeded for ${username}: ${count}/${limit}`)
        return false
      }

      console.log(`✓ Rate limit OK for ${username}: ${count}/${limit}`)
      return true
    } catch (error) {
      console.error('⚠︎ Rate limit check failed:', error)
      return true // Fail open
    }
  }

  /**
   * Post security error message
   */
  private async postSecurityError(repo: string, issueNumber: number, commentId: number): Promise<void> {
    try {
      const [owner, repoName] = repo.split('/')
      await this.octokit.rest.issues.createComment({
        owner,
        repo: repoName,
        issue_number: issueNumber,
        body: `✖ **Access Denied**

This repository or organization is not authorized to use @nikcli.

If you believe this is an error, please contact your administrator.`,
      })

      // Add negative reaction
      await this.octokit.rest.reactions.createForIssueComment({
        owner,
        repo: repoName,
        comment_id: commentId,
        content: '-1',
      })
    } catch (error) {
      console.error('Error posting security error:', error)
    }
  }

  /**
   * Post rate limit error message
   */
  private async postRateLimitError(repo: string, issueNumber: number, commentId: number): Promise<void> {
    try {
      const [owner, repoName] = repo.split('/')
      const limit = process.env.GITHUB_RATE_LIMIT_PER_USER || '10'

      await this.octokit.rest.issues.createComment({
        owner,
        repo: repoName,
        issue_number: issueNumber,
        body: `⚠︎ **Rate Limit Exceeded**

You have exceeded the rate limit of ${limit} requests per hour.

Please try again later.`,
      })

      // Add reaction
      await this.octokit.rest.reactions.createForIssueComment({
        owner,
        repo: repoName,
        comment_id: commentId,
        content: 'confused',
      })
    } catch (error) {
      console.error('Error posting rate limit error:', error)
    }
  }
}
