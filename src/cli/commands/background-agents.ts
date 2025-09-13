// src/cli/commands/background-agents.ts

import boxen from 'boxen'
import chalk from 'chalk'
import type { Command } from 'commander'
import ora from 'ora'
import { backgroundAgentService } from '../background-agents/background-agent-service'
import type { BackgroundJob, JobStatus } from '../background-agents/types'

export class BackgroundAgentsCommand {
  /**
   * Register nikctl background agent commands
   */
  static register(program: Command): void {
    const bg = program.command('bg').alias('background').description('Manage background agents and jobs')

    // Start background job
    bg.command('start')
      .description('Start a new background job')
      .requiredOption('-r, --repo <repo>', 'Repository (owner/name)')
      .option('-b, --branch <branch>', 'Base branch', 'main')
      .requiredOption('-t, --task <task>', 'Task description')
      .option('-p, --playbook <playbook>', 'Playbook name')
      .option('--time <minutes>', 'Max execution time', '30')
      .option('--tokens <count>', 'Max tool calls', '50')
      .option('--reviewers <reviewers>', 'PR reviewers (comma-separated)')
      .option('--labels <labels>', 'PR labels (comma-separated)')
      .option('--draft', 'Create draft PR')
      .option('--priority <priority>', 'Job priority (0-10)', '5')
      .action(async (options) => {
        await this.startJob(options)
      })

    // List jobs
    bg.command('list')
      .alias('ls')
      .description('List background jobs')
      .option('-s, --status <status>', 'Filter by status')
      .option('-r, --repo <repo>', 'Filter by repository')
      .option('-l, --limit <limit>', 'Limit results', '20')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        await this.listJobs(options)
      })

    // Show job details
    bg.command('show <jobId>')
      .description('Show job details')
      .option('--json', 'Output as JSON')
      .action(async (jobId, options) => {
        await this.showJob(jobId, options)
      })

    // Stream job logs
    bg.command('logs <jobId>')
      .description('Stream job logs')
      .option('-f, --follow', 'Follow logs')
      .option('--tail <lines>', 'Show last N lines', '50')
      .action(async (jobId, options) => {
        await this.streamLogs(jobId, options)
      })

    // Cancel job
    bg.command('cancel <jobId>')
      .description('Cancel a running job')
      .action(async (jobId) => {
        await this.cancelJob(jobId)
      })

    // Send follow-up message
    bg.command('followup <jobId> <message>')
      .alias('msg')
      .description('Send follow-up message to running job')
      .option('-p, --priority <priority>', 'Message priority', 'normal')
      .action(async (jobId, message, options) => {
        await this.sendFollowUp(jobId, message, options)
      })

    // Open job PR/console
    bg.command('open <jobId>')
      .description('Open job in browser')
      .option('--pr', 'Open PR instead of console')
      .action(async (jobId, options) => {
        await this.openJob(jobId, options)
      })

    // Job statistics
    bg.command('stats')
      .description('Show background agent statistics')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        await this.showStats(options)
      })

    // Retry failed job
    bg.command('retry <jobId>')
      .description('Retry a failed job')
      .action(async (jobId) => {
        await this.retryJob(jobId)
      })
  }

  /**
   * Start a new background job
   */
  private static async startJob(options: any): Promise<void> {
    const spinner = ora('Creating background job...').start()

    try {
      const jobId = await backgroundAgentService.createJob({
        repo: options.repo,
        baseBranch: options.branch,
        task: options.task,
        playbook: options.playbook,
        limits: {
          timeMin: parseInt(options.time),
          maxToolCalls: parseInt(options.tokens),
          maxMemoryMB: 2048,
        },
        reviewers: options.reviewers ? options.reviewers.split(',').map((r: string) => r.trim()) : undefined,
        labels: options.labels ? options.labels.split(',').map((l: string) => l.trim()) : undefined,
        draft: options.draft,
      })

      spinner.succeed(`Background job created: ${chalk.cyan(jobId)}`)

      // Show job details
      const job = backgroundAgentService.getJob(jobId)
      if (job) {
        this.displayJobInfo(job)
      }

      // Start log streaming
      console.log(chalk.dim('\nStreaming logs (Ctrl+C to stop)...'))
      await this.streamLogs(jobId, { follow: true, tail: '0' })
    } catch (error: any) {
      spinner.fail(`Failed to create job: ${error.message}`)
      process.exit(1)
    }
  }

  /**
   * List background jobs
   */
  private static async listJobs(options: any): Promise<void> {
    try {
      const jobs = backgroundAgentService.listJobs({
        status: options.status as JobStatus,
        limit: parseInt(options.limit),
      })

      if (options.json) {
        console.log(JSON.stringify(jobs, null, 2))
        return
      }

      if (jobs.length === 0) {
        console.log(chalk.yellow('No background jobs found'))
        return
      }

      console.log(chalk.bold('\n📋 Background Jobs\n'))

      const table = jobs.map((job) => ({
        ID: job.id.substring(0, 8),
        Repo: job.repo,
        Task: job.task.substring(0, 40) + (job.task.length > 40 ? '...' : ''),
        Status: this.formatStatus(job.status),
        Created: this.formatTime(job.createdAt),
        Duration: this.formatDuration(job),
      }))

      console.table(table)
    } catch (error: any) {
      console.error(chalk.red(`Failed to list jobs: ${error.message}`))
      process.exit(1)
    }
  }

  /**
   * Show job details
   */
  private static async showJob(jobId: string, options: any): Promise<void> {
    try {
      const job = backgroundAgentService.getJob(jobId)
      if (!job) {
        console.error(chalk.red(`Job ${jobId} not found`))
        process.exit(1)
      }

      if (options.json) {
        console.log(JSON.stringify(job, null, 2))
        return
      }

      this.displayJobDetails(job)
    } catch (error: any) {
      console.error(chalk.red(`Failed to show job: ${error.message}`))
      process.exit(1)
    }
  }

  /**
   * Stream job logs
   */
  private static async streamLogs(jobId: string, options: any): Promise<void> {
    try {
      const job = backgroundAgentService.getJob(jobId)
      if (!job) {
        console.error(chalk.red(`Job ${jobId} not found`))
        process.exit(1)
      }

      // Show recent logs
      const recentLogs = job.logs.slice(-parseInt(options.tail))
      recentLogs.forEach((log) => {
        console.log(this.formatLogEntry(log))
      })

      // Follow logs if requested
      if (options.follow) {
        backgroundAgentService.on('job:log', (logJobId: string, logEntry: any) => {
          if (logJobId === jobId) {
            console.log(this.formatLogEntry(logEntry))
          }
        })

        // Keep process alive
        process.on('SIGINT', () => {
          console.log(chalk.dim('\nStopped following logs'))
          process.exit(0)
        })
      }
    } catch (error: any) {
      console.error(chalk.red(`Failed to stream logs: ${error.message}`))
      process.exit(1)
    }
  }

  /**
   * Cancel a job
   */
  private static async cancelJob(jobId: string): Promise<void> {
    const spinner = ora('Cancelling job...').start()

    try {
      const success = await backgroundAgentService.cancelJob(jobId)

      if (success) {
        spinner.succeed(`Job ${jobId} cancelled`)
      } else {
        spinner.fail(`Failed to cancel job ${jobId} (already completed or not found)`)
      }
    } catch (error: any) {
      spinner.fail(`Failed to cancel job: ${error.message}`)
      process.exit(1)
    }
  }

  /**
   * Send follow-up message
   */
  private static async sendFollowUp(jobId: string, message: string, options: any): Promise<void> {
    const spinner = ora('Sending follow-up message...').start()

    try {
      const messageId = await backgroundAgentService.sendFollowUpMessage(jobId, message, options.priority)

      spinner.succeed(`Follow-up message sent: ${messageId}`)
    } catch (error: any) {
      spinner.fail(`Failed to send follow-up: ${error.message}`)
      process.exit(1)
    }
  }

  /**
   * Open job in browser
   */
  private static async openJob(jobId: string, options: any): Promise<void> {
    try {
      const job = backgroundAgentService.getJob(jobId)
      if (!job) {
        console.error(chalk.red(`Job ${jobId} not found`))
        process.exit(1)
      }

      let url: string

      if (options.pr && job.prUrl) {
        url = job.prUrl
      } else {
        url = `${process.env.CONSOLE_URL || 'http://localhost:3001'}/jobs/${jobId}`
      }

      const { execSync } = await import('node:child_process')
      const open = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'

      execSync(`${open} "${url}"`)
      console.log(chalk.green(`Opened ${options.pr ? 'PR' : 'console'}: ${url}`))
    } catch (error: any) {
      console.error(chalk.red(`Failed to open job: ${error.message}`))
      process.exit(1)
    }
  }

  /**
   * Show statistics
   */
  private static async showStats(options: any): Promise<void> {
    try {
      const stats = backgroundAgentService.getStats()

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2))
        return
      }

      const box = boxen(
        [
          chalk.bold('📊 Background Agent Statistics'),
          '',
          `${chalk.cyan('Total Jobs:')} ${stats.total}`,
          `${chalk.yellow('Queued:')} ${stats.queued}`,
          `${chalk.blue('Running:')} ${stats.running}`,
          `${chalk.green('Succeeded:')} ${stats.succeeded}`,
          `${chalk.red('Failed:')} ${stats.failed}`,
          `${chalk.gray('Cancelled:')} ${stats.cancelled}`,
        ].join('\n'),
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
        }
      )

      console.log(box)
    } catch (error: any) {
      console.error(chalk.red(`Failed to get stats: ${error.message}`))
      process.exit(1)
    }
  }

  /**
   * Retry a failed job
   */
  private static async retryJob(jobId: string): Promise<void> {
    const spinner = ora('Retrying job...').start()

    try {
      const job = backgroundAgentService.getJob(jobId)
      if (!job) {
        spinner.fail(`Job ${jobId} not found`)
        process.exit(1)
      }

      if (job.status !== 'failed') {
        spinner.fail(`Job ${jobId} is not in failed state`)
        process.exit(1)
      }

      // Create new job with same parameters
      const newJobId = await backgroundAgentService.createJob({
        repo: job.repo,
        baseBranch: job.baseBranch,
        task: job.task,
        playbook: job.playbook,
        envVars: job.envVars,
        limits: job.limits,
      })

      spinner.succeed(`Job retried with new ID: ${chalk.cyan(newJobId)}`)
    } catch (error: any) {
      spinner.fail(`Failed to retry job: ${error.message}`)
      process.exit(1)
    }
  }

  /**
   * Display job info
   */
  private static displayJobInfo(job: BackgroundJob): void {
    const box = boxen(
      [
        chalk.bold('🤖 Background Job Created'),
        '',
        `${chalk.cyan('ID:')} ${job.id}`,
        `${chalk.cyan('Repository:')} ${job.repo}`,
        `${chalk.cyan('Branch:')} ${job.baseBranch} → ${job.workBranch}`,
        `${chalk.cyan('Task:')} ${job.task}`,
        `${chalk.cyan('Status:')} ${this.formatStatus(job.status)}`,
        job.playbook ? `${chalk.cyan('Playbook:')} ${job.playbook}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
      }
    )

    console.log(box)
  }

  /**
   * Display detailed job information
   */
  private static displayJobDetails(job: BackgroundJob): void {
    console.log(chalk.bold(`\n🤖 Job: ${job.id}\n`))

    // Basic info
    console.log(chalk.cyan('Repository:'), job.repo)
    console.log(chalk.cyan('Branch:'), `${job.baseBranch} → ${job.workBranch}`)
    console.log(chalk.cyan('Task:'), job.task)
    console.log(chalk.cyan('Status:'), this.formatStatus(job.status))

    if (job.playbook) {
      console.log(chalk.cyan('Playbook:'), job.playbook)
    }

    // Timing
    console.log(chalk.cyan('Created:'), this.formatTime(job.createdAt))
    if (job.startedAt) {
      console.log(chalk.cyan('Started:'), this.formatTime(job.startedAt))
    }
    if (job.completedAt) {
      console.log(chalk.cyan('Completed:'), this.formatTime(job.completedAt))
      console.log(chalk.cyan('Duration:'), this.formatDuration(job))
    }

    // Metrics
    if (job.metrics.tokenUsage > 0 || job.metrics.toolCalls > 0) {
      console.log(chalk.bold('\n📊 Metrics'))
      console.log(chalk.cyan('Token Usage:'), job.metrics.tokenUsage.toLocaleString())
      console.log(chalk.cyan('Tool Calls:'), job.metrics.toolCalls)
      console.log(chalk.cyan('Memory Usage:'), `${job.metrics.memoryUsage}MB`)
    }

    // PR URL
    if (job.prUrl) {
      console.log(chalk.bold('\n🔗 Links'))
      console.log(chalk.cyan('Pull Request:'), job.prUrl)
    }

    // Error
    if (job.error) {
      console.log(chalk.bold('\n❌ Error'))
      console.log(chalk.red(job.error))
    }

    // Recent logs
    if (job.logs.length > 0) {
      console.log(chalk.bold('\n📝 Recent Logs'))
      job.logs.slice(-5).forEach((log) => {
        console.log(this.formatLogEntry(log))
      })
    }
  }

  /**
   * Format job status with colors
   */
  private static formatStatus(status: JobStatus): string {
    const colors = {
      queued: chalk.yellow,
      running: chalk.blue,
      succeeded: chalk.green,
      failed: chalk.red,
      cancelled: chalk.gray,
      timeout: chalk.magenta,
    }

    return colors[status](status.toUpperCase())
  }

  /**
   * Format timestamp
   */
  private static formatTime(date: Date): string {
    return date.toLocaleString()
  }

  /**
   * Format duration
   */
  private static formatDuration(job: BackgroundJob): string {
    if (!job.startedAt || !job.completedAt) {
      return 'N/A'
    }

    const durationMs = job.completedAt.getTime() - job.startedAt.getTime()
    const minutes = Math.floor(durationMs / 60000)
    const seconds = Math.floor((durationMs % 60000) / 1000)

    return `${minutes}m ${seconds}s`
  }

  /**
   * Format log entry
   */
  private static formatLogEntry(log: any): string {
    const timestamp = chalk.dim(log.timestamp.toISOString().substring(11, 19))
    const level = this.formatLogLevel(log.level)
    const source = chalk.dim(`[${log.source}]`)

    return `${timestamp} ${level} ${source} ${log.message}`
  }

  /**
   * Format log level with colors
   */
  private static formatLogLevel(level: string): string {
    const colors = {
      info: chalk.blue,
      warn: chalk.yellow,
      error: chalk.red,
      debug: chalk.gray,
    }

    return colors[level as keyof typeof colors]?.(level.toUpperCase().padEnd(5)) || level
  }
}
