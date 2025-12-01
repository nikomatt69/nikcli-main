// src/cli/github-bot/task-executor.ts

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Octokit } from '@octokit/rest'
import { backgroundAgentService } from '../background-agents/background-agent-service'
import { advancedUI } from '../ui/advanced-cli-ui'
import { CommentProcessor } from './comment-processor'
import { PRReviewExecutor } from './pr-review-executor'
import type {
  CommandParseResult,
  GitHubBotConfig,
  GitHubPullRequest,
  ProcessingJob,
  RepositoryContext,
  TaskContext,
  TaskResult,
} from './types'

/**
 * Execution modes for GitHub bot tasks
 */
export type ExecutionMode = 'background-agent' | 'local-execution' | 'auto'

/**
 * Executes tasks requested via @nikcli mentions in GitHub
 * Supports both background agent execution (VM-based) and local execution with intelligent fallback
 */
export class TaskExecutor {
  private octokit: Octokit
  private config: GitHubBotConfig
  private commentProcessor: CommentProcessor
  private prReviewExecutor: PRReviewExecutor
  private workingDir: string
  private executionMode: ExecutionMode
  private useBackgroundAgents: boolean
  private slackService?: any

  constructor(octokit: Octokit, config: GitHubBotConfig, executionMode: ExecutionMode = 'auto') {
    this.octokit = octokit
    this.config = config
    this.commentProcessor = new CommentProcessor()
    this.prReviewExecutor = new PRReviewExecutor(octokit, config)
    this.workingDir = join(tmpdir(), 'nikcli-github-bot')
    this.executionMode = executionMode

    // Determine if background agents are available
    this.useBackgroundAgents = this.detectBackgroundAgentAvailability()

    // Ensure working directory exists for local execution fallback
    if (!existsSync(this.workingDir)) {
      mkdirSync(this.workingDir, { recursive: true })
    }

    // Initialize Slack service if configured
    if (process.env.SLACK_BOT_TOKEN) {
      this.initializeSlackService().catch((err) => {
        console.error('⚠︎ Failed to initialize Slack service in TaskExecutor:', err)
      })
    }

    console.log(` TaskExecutor initialized in ${this.executionMode} mode (BG agents: ${this.useBackgroundAgents})`)
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
      console.log('✓ Slack service initialized in TaskExecutor')
    } catch (error) {
      console.error('✖ Error initializing Slack service:', error)
    }
  }

  /**
   * Detect if background agent service is available
   */
  private detectBackgroundAgentAvailability(): boolean {
    try {
      // Check if backgroundAgentService is accessible
      const isAvailable =
        typeof backgroundAgentService !== 'undefined' && typeof backgroundAgentService.createJob === 'function'

      if (!isAvailable) {
        console.warn('⚠︎  Background agent service not available - will fall back to local execution')
      }

      return isAvailable
    } catch (error) {
      console.error('✖ Error detecting background agent service:', error)
      console.warn('⚠︎  Falling back to local execution mode')
      return false
    }
  }

  /**
   * Execute task from processing job
   * Intelligently routes to background agent or local execution
   */
  async executeTask(job: ProcessingJob): Promise<TaskResult> {
    advancedUI.logFunctionCall('executing')
    advancedUI.logFunctionUpdate('info', job.mention.command, '●')

    try {
      // Parse the command
      const parsedCommand = this.commentProcessor.parseCommand(job.mention)
      if (!parsedCommand) {
        throw new Error(`Invalid command: ${job.mention.command}`)
      }

      // Determine execution mode
      const shouldUseBackgroundAgent = this.shouldUseBackgroundAgent(parsedCommand)

      let result: TaskResult

      if (shouldUseBackgroundAgent) {
        advancedUI.logFunctionUpdate('info', 'Routing to background agent service', 'ℹ')
        result = await this.executeViaBackgroundAgent(job, parsedCommand)
      } else {
        advancedUI.logFunctionUpdate('info', 'Executing locally', 'ℹ')
        result = await this.executeLocally(job, parsedCommand)
      }

      // Notify Slack of completion
      await this.notifySlackCompletion(job, result)

      return result
    } catch (error: any) {
      console.error(`✖ Task execution failed:`, error)

      // Notify Slack of failure
      await this.notifySlackFailure(job, error)

      throw error
    }
  }

  /**
   * Determine if task should use background agent
   */
  private shouldUseBackgroundAgent(command: CommandParseResult): boolean {
    // Force modes
    if (this.executionMode === 'background-agent') return true
    if (this.executionMode === 'local-execution') return false

    // Auto mode: use background agents if available and task is complex
    if (!this.useBackgroundAgents) return false

    // Complex tasks benefit from VM isolation
    const complexCommands = ['add', 'refactor', 'test', 'security']
    return complexCommands.includes(command.command)
  }

  /**
   * Execute task via background agent service
   */
  private async executeViaBackgroundAgent(job: ProcessingJob, command: CommandParseResult): Promise<TaskResult> {
    console.log(`📋 Creating background job for ${job.repository}`)

    // Create background job
    const jobId = await backgroundAgentService.createJob({
      repo: job.repository,
      baseBranch: 'main', // Default, could be detected
      task: this.buildTaskDescription(command),
      limits: {
        timeMin: 15,
        maxToolCalls: 25,
        maxMemoryMB: 2048,
      },
      githubContext: {
        issueNumber: job.issueNumber,
        commentId: job.commentId,
        repository: job.repository,
        author: job.author,
        isPR: job.isPR,
        isPRReview: job.isPRReview,
        isIssue: job.isIssue,
      },
    })

    advancedUI.logFunctionUpdate('success', `Background job created: ${jobId}`, '✓')

    // Monitor job progress
    const result = await this.monitorBackgroundJob(jobId)

    return {
      success: result.status === 'succeeded',
      summary: result.task,
      files: result.files || [],
      prUrl: result.prUrl,
      shouldComment: true,
      details: {
        jobId,
        containerId: result.containerId,
        executionTime: result.metrics?.executionTime,
        tokenUsage: result.metrics?.tokenUsage,
      },
    }
  }

  /**
   * Execute task locally (original implementation)
   */
  private async executeLocally(job: ProcessingJob, parsedCommand: CommandParseResult): Promise<TaskResult> {
    // Build repository context
    const repoContext = await this.buildRepositoryContext(job.repository)

    // Setup task execution context
    const taskContext = await this.setupTaskContext(job, repoContext)

    // Execute the specific command
    const result = await this.executeCommand(parsedCommand, taskContext)

    // Create PR if changes were made
    if (result.files.length > 0) {
      const prUrl = await this.createPullRequest(taskContext, result)
      result.prUrl = prUrl
      result.shouldComment = true
    }

    advancedUI.logFunctionUpdate('success', 'Task completed successfully', '✓')
    return result
  }

  /**
   * Build task description from parsed command
   */
  private buildTaskDescription(command: CommandParseResult): string {
    let description = command.command

    if (command.target) {
      description += ` ${command.target}`
    }

    if (command.description) {
      description += `: ${command.description}`
    }

    return description
  }

  /**
   * Monitor background job until completion
   */
  private async monitorBackgroundJob(jobId: string): Promise<any> {
    console.log(`⏳︎ Monitoring background job ${jobId}`)

    return new Promise((resolve, reject) => {
      let checkInterval: NodeJS.Timeout | null = null
      let timeoutHandle: NodeJS.Timeout | null = null

      const cleanup = () => {
        if (checkInterval) clearInterval(checkInterval)
        if (timeoutHandle) clearTimeout(timeoutHandle)
      }

      checkInterval = setInterval(async () => {
        try {
          const job = backgroundAgentService.getJob(jobId)

          if (!job) {
            cleanup()
            reject(new Error(`Job ${jobId} not found`))
            return
          }

          console.log(`📊 Job ${jobId} status: ${job.status}`)

          if (job.status === 'succeeded') {
            cleanup()
            resolve({
              status: job.status,
              task: job.task,
              prUrl: job.prUrl,
              files: this.extractFilesFromLogs(job.logs),
              containerId: job.containerId,
              metrics: job.metrics,
            })
          } else if (job.status === 'failed' || job.status === 'cancelled' || job.status === 'timeout') {
            cleanup()
            reject(new Error(job.error || `Job ${job.status}`))
          }
        } catch (error) {
          cleanup()
          reject(new Error(`Failed to check job status: ${error}`))
        }
      }, 2000) // Check every 2 seconds

      // Timeout after 30 minutes
      timeoutHandle = setTimeout(
        () => {
          cleanup()
          reject(new Error('Job monitoring timeout'))
        },
        30 * 60 * 1000
      )
    })
  }

  /**
   * Extract modified files from job logs
   */
  private extractFilesFromLogs(logs: any[]): string[] {
    const files: string[] = []

    for (const log of logs) {
      const message = log.message || ''

      // Look for file modification patterns in logs
      if (message.includes('Modified:') || message.includes('Created:') || message.includes('Updated:')) {
        const match = message.match(/(?:Modified|Created|Updated):\s*(.+)/)
        if (match) {
          files.push(match[1].trim())
        }
      }
    }

    return files
  }

  /**
   * Build repository context information
   */
  private async buildRepositoryContext(repository: string): Promise<RepositoryContext> {
    const [owner, repo] = repository.split('/')

    try {
      // Get repository information
      const { data: repoData } = await this.octokit.rest.repos.get({ owner, repo })

      // Get repository languages
      const { data: languages } = await this.octokit.rest.repos.listLanguages({ owner, repo })

      // Detect project characteristics
      const hasPackageJson = await this.fileExists(owner, repo, 'package.json')
      const _hasCargoToml = await this.fileExists(owner, repo, 'Cargo.toml')
      const _hasPyProjectToml = await this.fileExists(owner, repo, 'pyproject.toml')

      let packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | undefined
      let framework: string | undefined

      if (hasPackageJson) {
        // Try to detect package manager and framework
        const packageContent = await this.getFileContent(owner, repo, 'package.json')
        try {
          const packageJson = JSON.parse(packageContent)

          // Detect package manager
          if (await this.fileExists(owner, repo, 'bun.lockb')) packageManager = 'bun'
          else if (await this.fileExists(owner, repo, 'pnpm-lock.yaml')) packageManager = 'pnpm'
          else if (await this.fileExists(owner, repo, 'yarn.lock')) packageManager = 'yarn'
          else packageManager = 'npm'

          // Detect framework
          const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
          if (deps.react) framework = 'React'
          else if (deps.vue) framework = 'Vue'
          else if (deps.angular) framework = 'Angular'
          else if (deps.svelte) framework = 'Svelte'
          else if (deps.next) framework = 'Next.js'
          else if (deps.nuxt) framework = 'Nuxt.js'
        } catch (_e) {
          // Ignore JSON parsing errors
        }
      }

      // Check for tests and CI
      const hasTests = await this.hasTestDirectory(owner, repo)
      const hasCI =
        (await this.fileExists(owner, repo, '.github/workflows')) ||
        (await this.fileExists(owner, repo, '.gitlab-ci.yml')) ||
        (await this.fileExists(owner, repo, 'Jenkinsfile'))

      return {
        owner,
        repo,
        defaultBranch: repoData.default_branch,
        clonePath: join(this.workingDir, `${owner}-${repo}-${Date.now()}`),
        languages: Object.keys(languages),
        packageManager,
        framework,
        hasTests,
        hasCI,
      }
    } catch (error) {
      console.error('Failed to build repository context:', error)
      throw new Error(`Failed to analyze repository ${repository}`)
    }
  }

  /**
   * Setup task execution context
   */
  private async setupTaskContext(job: ProcessingJob, repoContext: RepositoryContext): Promise<TaskContext> {
    // Create unique branch name
    const timestamp = Date.now()
    const tempBranch = `nikcli/${job.mention.command}-${timestamp}`

    // Clone repository
    await this.cloneRepository(repoContext, tempBranch)

    return {
      job,
      repository: repoContext,
      workingDirectory: repoContext.clonePath,
      tempBranch,
      originalPR: job.pullRequest,
    }
  }

  /**
   * Clone repository to local working directory
   */
  private async cloneRepository(repoContext: RepositoryContext, branchName: string): Promise<void> {
    const cloneUrl = `https://github.com/${repoContext.owner}/${repoContext.repo}.git`

    console.log(`📥 Cloning repository to ${repoContext.clonePath}`)

    try {
      // Clone repository
      execSync(`git clone --depth 1 -b ${repoContext.defaultBranch} ${cloneUrl} ${repoContext.clonePath}`, {
        stdio: 'pipe',
      })

      // Create and switch to new branch
      execSync(`git checkout -b ${branchName}`, {
        cwd: repoContext.clonePath,
        stdio: 'pipe',
      })

      console.log(`✓ Repository cloned and branch ${branchName} created`)
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error}`)
    }
  }

  /**
   * Execute specific command based on parsed command
   */
  private async executeCommand(command: CommandParseResult, context: TaskContext): Promise<TaskResult> {
    console.log(` Executing command: ${command.command}`)

    switch (command.command) {
      case 'fix':
        return this.executeFix(command, context)
      case 'add':
        return this.executeAdd(command, context)
      case 'optimize':
        return this.executeOptimize(command, context)
      case 'refactor':
        return this.executeRefactor(command, context)
      case 'test':
        return this.executeTest(command, context)
      case 'doc':
        return this.executeDoc(command, context)
      case 'security':
        return this.executeSecurity(command, context)
      case 'accessibility':
        return this.executeAccessibility(command, context)
      case 'analyze':
        return this.executeAnalyze(command, context)
      case 'review':
        return this.executeReview(command, context)
      default:
        throw new Error(`Unsupported command: ${command.command}`)
    }
  }

  /**
   * Execute fix command
   */
  private async executeFix(command: CommandParseResult, context: TaskContext): Promise<TaskResult> {
    const result: TaskResult = {
      success: true,
      summary: `Applied fixes to ${command.target || 'codebase'}`,
      files: [],
      shouldComment: true,
      details: {},
    }

    try {
      // Run NikCLI fix command in the repository
      const nikCliCommand = this.buildNikCLICommand('fix', command, context)
      const output = execSync(nikCliCommand, {
        cwd: context.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe',
      })

      // Parse NikCLI output to determine modified files
      result.files = this.parseModifiedFiles(output)
      result.analysis = `Fixed issues in ${result.files.length} files`

      // Run tests if requested
      if (command.options?.createTests) {
        await this.runTests(context)
        result.details!.testsRun = true
      }
    } catch (error) {
      result.success = false
      result.summary = `Failed to apply fixes: ${error}`
      throw error
    }

    return result
  }

  /**
   * Execute add command
   */
  private async executeAdd(command: CommandParseResult, context: TaskContext): Promise<TaskResult> {
    const result: TaskResult = {
      success: true,
      summary: `Added new functionality: ${command.description}`,
      files: [],
      shouldComment: true,
      details: {},
    }

    try {
      const nikCliCommand = this.buildNikCLICommand('implement', command, context)
      const output = execSync(nikCliCommand, {
        cwd: context.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe',
      })

      result.files = this.parseModifiedFiles(output)
      result.analysis = `Implemented new feature with ${result.files.length} files modified`
    } catch (error) {
      result.success = false
      result.summary = `Failed to add functionality: ${error}`
      throw error
    }

    return result
  }

  /**
   * Execute optimize command
   */
  private async executeOptimize(command: CommandParseResult, context: TaskContext): Promise<TaskResult> {
    const result: TaskResult = {
      success: true,
      summary: `Applied optimizations to ${command.target || 'codebase'}`,
      files: [],
      shouldComment: true,
      details: {},
    }

    const nikCliCommand = this.buildNikCLICommand('optimize', command, context)
    const output = execSync(nikCliCommand, {
      cwd: context.workingDirectory,
      encoding: 'utf8',
      stdio: 'pipe',
    })

    result.files = this.parseModifiedFiles(output)
    result.analysis = `Optimized performance in ${result.files.length} files`

    return result
  }

  /**
   * Execute analyze command (read-only)
   */
  private async executeAnalyze(command: CommandParseResult, context: TaskContext): Promise<TaskResult> {
    const result: TaskResult = {
      success: true,
      summary: `Code analysis completed for ${command.target || 'repository'}`,
      files: [],
      shouldComment: true,
      analysis: '',
    }

    try {
      // Run analysis without modifications
      const nikCliCommand = this.buildNikCLICommand('analyze', command, context)
      const output = execSync(nikCliCommand, {
        cwd: context.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe',
      })

      result.analysis = this.extractAnalysisReport(output)
    } catch (error) {
      result.success = false
      result.summary = `Analysis failed: ${error}`
    }

    return result
  }

  /**
   * Stub implementations for other commands
   */
  private async executeRefactor(command: CommandParseResult, context: TaskContext): Promise<TaskResult> {
    return this.executeGenericCommand('refactor', command, context)
  }

  private async executeTest(command: CommandParseResult, context: TaskContext): Promise<TaskResult> {
    return this.executeGenericCommand('test', command, context)
  }

  private async executeDoc(command: CommandParseResult, context: TaskContext): Promise<TaskResult> {
    return this.executeGenericCommand('document', command, context)
  }

  private async executeSecurity(command: CommandParseResult, context: TaskContext): Promise<TaskResult> {
    return this.executeGenericCommand('security', command, context)
  }

  private async executeAccessibility(command: CommandParseResult, context: TaskContext): Promise<TaskResult> {
    return this.executeGenericCommand('accessibility', command, context)
  }

  private async executeReview(command: CommandParseResult, context: TaskContext): Promise<TaskResult> {
    // Check if this is a PR review
    if (context.originalPR) {
      console.log('🔍 Executing advanced PR review with automated fixes')
      return await this.prReviewExecutor.reviewAndFixPR(context.job, context.repository, context.originalPR)
    }

    // Fallback to generic review
    return this.executeGenericCommand('review', command, context)
  }

  /**
   * Generic command execution
   */
  private async executeGenericCommand(
    action: string,
    command: CommandParseResult,
    context: TaskContext
  ): Promise<TaskResult> {
    const result: TaskResult = {
      success: true,
      summary: `Applied ${action} to ${command.target || 'codebase'}`,
      files: [],
      shouldComment: true,
    }

    try {
      const nikCliCommand = this.buildNikCLICommand(action, command, context)
      const output = execSync(nikCliCommand, {
        cwd: context.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe',
      })

      result.files = this.parseModifiedFiles(output)
      result.analysis = `Applied ${action} to ${result.files.length} files`
    } catch (error) {
      result.success = false
      result.summary = `${action} failed: ${error}`
      throw error
    }

    return result
  }

  /**
   * Build NikCLI command string
   */
  private buildNikCLICommand(action: string, command: CommandParseResult, _context: TaskContext): string {
    let cmd = `npx @nicomatt69/nikcli ${action}`

    if (command.target) {
      cmd += ` "${command.target}"`
    }

    if (command.description && command.description !== action) {
      cmd += ` --description "${command.description}"`
    }

    // Add common flags
    cmd += ' --auto-confirm --quiet'

    return cmd
  }

  /**
   * Parse modified files from NikCLI output
   */
  private parseModifiedFiles(output: string): string[] {
    const files: string[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      // Look for file modification patterns
      if (line.includes('Modified:') || line.includes('Created:') || line.includes('Updated:')) {
        const match = line.match(/(?:Modified|Created|Updated):\s*(.+)/)
        if (match) {
          files.push(match[1].trim())
        }
      }
    }

    return files
  }

  /**
   * Extract analysis report from output
   */
  private extractAnalysisReport(output: string): string {
    // Extract meaningful analysis content from NikCLI output
    const lines = output.split('\n')
    const analysisLines = lines.filter(
      (line) => !line.includes('Loading') && !line.includes('Initializing') && line.trim().length > 0
    )

    return analysisLines.join('\n').substring(0, 1000) // Limit length
  }

  /**
   * Create pull request with changes
   */
  private async createPullRequest(context: TaskContext, result: TaskResult): Promise<string> {
    const { job, repository, tempBranch } = context

    try {
      // Commit changes
      execSync('git add .', { cwd: context.workingDirectory, stdio: 'pipe' })

      const commitMessage = `🔌 ${job.mention.command}: ${result.summary}

Applied via @nikcli mention in #${job.issueNumber}
Requested by: @${job.author}

Files modified:
${result.files.map((f) => `- ${f}`).join('\n')}

Co-authored-by: NikCLI Bot <bot@nikcli.dev>`

      execSync(`git commit -m "${commitMessage}"`, {
        cwd: context.workingDirectory,
        stdio: 'pipe',
      })

      // Push branch
      execSync(`git push -u origin ${tempBranch}`, {
        cwd: context.workingDirectory,
        stdio: 'pipe',
      })

      // Create pull request
      const prTitle = `🔌 ${job.mention.command}: ${result.summary}`
      const prBody = `## Summary
${result.summary}

## Changes Applied
${result.files.map((f) => `- \`${f}\``).join('\n')}

${result.analysis ? `## Analysis\n${result.analysis}\n` : ''}

## Context
- Requested by: @${job.author}
- Original issue/PR: #${job.issueNumber}
- Command: \`@nikcli ${job.mention.command}\`

---
🔌 This PR was automatically created by [NikCLI Bot](https://github.com/nikomatt69/nikcli-main)`

      const { data: pr } = await this.octokit.rest.pulls.create({
        owner: repository.owner,
        repo: repository.repo,
        title: prTitle,
        body: prBody,
        head: tempBranch,
        base: repository.defaultBranch,
      })

      console.log(`✓ Pull request created: ${pr.html_url}`)
      return pr.html_url
    } catch (error) {
      console.error('Failed to create pull request:', error)
      throw error
    }
  }

  /**
   * Run tests if available
   */
  private async runTests(context: TaskContext): Promise<void> {
    const { repository } = context

    try {
      if (repository.packageManager) {
        const testCommand = `${repository.packageManager} test`
        execSync(testCommand, {
          cwd: context.workingDirectory,
          stdio: 'pipe',
        })
      }
    } catch (error) {
      console.warn('Tests failed or not available:', error)
    }
  }

  /**
   * Utility: Check if file exists in repository
   */
  private async fileExists(owner: string, repo: string, path: string): Promise<boolean> {
    try {
      await this.octokit.rest.repos.getContent({ owner, repo, path })
      return true
    } catch {
      return false
    }
  }

  /**
   * Utility: Get file content from repository
   */
  private async getFileContent(owner: string, repo: string, path: string): Promise<string> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({ owner, repo, path })
      if ('content' in data) {
        return Buffer.from(data.content, 'base64').toString('utf8')
      }
      return ''
    } catch {
      return ''
    }
  }

  /**
   * Utility: Check if repository has test directory
   */
  private async hasTestDirectory(owner: string, repo: string): Promise<boolean> {
    const testDirs = ['test', 'tests', '__tests__', 'spec', 'specs']

    for (const dir of testDirs) {
      if (await this.fileExists(owner, repo, dir)) {
        return true
      }
    }

    // Check for test files in common locations
    const testFiles = ['package.json']
    for (const file of testFiles) {
      const content = await this.getFileContent(owner, repo, file)
      if (content.includes('"test"') || content.includes('"jest"') || content.includes('"vitest"')) {
        return true
      }
    }

    return false
  }

  // ========== SLACK NOTIFICATIONS ==========

  /**
   * Notify Slack of task completion
   */
  private async notifySlackCompletion(job: ProcessingJob, result: TaskResult): Promise<void> {
    if (!this.slackService || !job.slackThreadTs || !process.env.SLACK_DEFAULT_CHANNEL) {
      return
    }

    try {
      const commandText = `${job.mention.command} ${job.mention.args.join(' ')}`.trim()

      const blocks: any[] = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*✓ Task Completed*\n\`@nikcli ${commandText}\``,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Repository*\n${job.repository}`,
            },
            {
              type: 'mrkdwn',
              text: `*Issue/PR*\n#${job.issueNumber}`,
            },
            {
              type: 'mrkdwn',
              text: `*Files Modified*\n${result.files?.length || 0}`,
            },
            {
              type: 'mrkdwn',
              text: `*Status*\n${result.success ? 'Success ✓' : 'Partial ⚠'}`,
            },
          ],
        },
      ]

      blocks.push(
        result.prUrl
          ? {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '👁️ View Results on GitHub',
                },
                url: `https://github.com/${job.repository}/issues/${job.issueNumber}`,
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '🔀 View Pull Request',
                },
                url: result.prUrl,
                style: 'primary',
              },
            ],
          }
          : {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '👁️ View Results on GitHub',
                },
                url: `https://github.com/${job.repository}/issues/${job.issueNumber}`,
              },
            ],
          }
      )

      await this.slackService.webClient.chat.postMessage({
        channel: process.env.SLACK_DEFAULT_CHANNEL,
        thread_ts: job.slackThreadTs,
        text: `✓ Task completed successfully`,
        blocks,
      })

      console.log(`✓ Notified Slack of task completion`)
    } catch (error) {
      console.error('⚠︎ Failed to notify Slack of completion:', error)
    }
  }

  /**
   * Notify Slack of task failure
   */
  private async notifySlackFailure(job: ProcessingJob, error: Error): Promise<void> {
    if (!this.slackService || !job.slackThreadTs || !process.env.SLACK_DEFAULT_CHANNEL) {
      return
    }

    try {
      const commandText = `${job.mention.command} ${job.mention.args.join(' ')}`.trim()

      await this.slackService.webClient.chat.postMessage({
        channel: process.env.SLACK_DEFAULT_CHANNEL,
        thread_ts: job.slackThreadTs,
        text: `✖ Task failed`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*✖ Task Failed*\n\`@nikcli ${commandText}\``,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Repository*\n${job.repository}`,
              },
              {
                type: 'mrkdwn',
                text: `*Issue/PR*\n#${job.issueNumber}`,
              },
              {
                type: 'mrkdwn',
                text: `*Error*\n${error.message.substring(0, 200)}`,
              },
            ],
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '👁️ View on GitHub',
                },
                url: `https://github.com/${job.repository}/issues/${job.issueNumber}`,
              },
            ],
          },
        ],
      })

      console.log(`✓ Notified Slack of task failure`)
    } catch (slackError) {
      console.error('⚠︎ Failed to notify Slack of failure:', slackError)
    }
  }
}
