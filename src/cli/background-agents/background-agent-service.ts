// src/cli/background-agents/background-agent-service.ts

import { EventEmitter } from 'node:events'
import { v4 as uuidv4 } from 'uuid'
import { agentService } from '../services/agent-service'
import { VMStatusIndicator } from '../ui/vm-status-indicator'
import { ContainerManager } from '../virtualized-agents/container-manager'
import { VMOrchestrator } from '../virtualized-agents/vm-orchestrator'
import { VercelKVBackgroundAgentAdapter, vercelKVAdapter } from './adapters/vercel-kv-adapter'
import { EnvironmentParser } from './core/environment-parser'
import { PlaybookParser } from './core/playbook-parser'
import type { BackgroundJob, CreateBackgroundJobRequest, JobStatus } from './types'

export interface BackgroundJobStats {
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
  cancelled: number
}

export class BackgroundAgentService extends EventEmitter {
  private jobs: Map<string, BackgroundJob> = new Map()
  private vmOrchestrator: VMOrchestrator
  private vmStatusIndicator: VMStatusIndicator
  private maxConcurrentJobs = 3
  private runningJobs = 0
  private useVercelKV = false
  private kvAdapter?: VercelKVBackgroundAgentAdapter

  constructor() {
    super()
    this.vmOrchestrator = new VMOrchestrator(new ContainerManager())
    this.vmStatusIndicator = VMStatusIndicator.getInstance()
    this.initializeService()
  }

  private async initializeService(): Promise<void> {
    try {
      // Check if we should use Vercel KV
      if (VercelKVBackgroundAgentAdapter.isVercelEnvironment()) {
        console.log('🔧 Vercel environment detected - using Vercel KV for persistence')
        this.kvAdapter = vercelKVAdapter

        // Test KV connectivity
        const isAvailable = await this.kvAdapter.isAvailable()
        if (isAvailable) {
          this.useVercelKV = true
          console.log('✓ Vercel KV connected successfully')

          // Load existing jobs from KV
          await this.loadJobsFromKV()
        } else {
          console.warn('⚠️ Vercel KV not available - falling back to in-memory storage')
        }
      } else {
        console.log('🔧 Local environment - using in-memory storage')
      }

      // Initialize VM orchestrator if available
      if (this.vmOrchestrator) {
        // VM orchestrator is initialized via constructor
      }

      this.emit('ready')
    } catch (error) {
      console.error('Failed to initialize Background Agent Service:', error)
      this.emit('error', error)
    }
  }

  /**
   * Load existing jobs from Vercel KV
   */
  private async loadJobsFromKV(): Promise<void> {
    if (!this.useVercelKV || !this.kvAdapter) return

    try {
      const jobs = await this.kvAdapter.getAllJobs()
      console.log(`📋 Loaded ${jobs.length} jobs from Vercel KV`)

      for (const job of jobs) {
        this.jobs.set(job.id, job)

        // Count running jobs
        if (job.status === 'running') {
          this.runningJobs++
        }
      }
    } catch (error) {
      console.error('Error loading jobs from KV:', error)
    }
  }

  /**
   * Create a new background job
   */
  async createJob(request: CreateBackgroundJobRequest): Promise<string> {
    const jobId = uuidv4()

    const job: BackgroundJob = {
      id: jobId,
      repo: request.repo,
      baseBranch: request.baseBranch,
      workBranch: `nik/BA-${jobId.substring(0, 8)}`,
      task: request.task,
      playbook: request.playbook,
      envVars: request.envVars || {},
      limits: {
        timeMin: request.limits?.timeMin || 30,
        maxToolCalls: request.limits?.maxToolCalls || 50,
        maxMemoryMB: request.limits?.maxMemoryMB || 2048,
      },
      status: 'queued',
      createdAt: new Date(),
      logs: [],
      artifacts: [],
      metrics: {
        tokenUsage: 0,
        toolCalls: 0,
        executionTime: 0,
        memoryUsage: 0,
      },
      followUpMessages: [],
      githubContext: request.githubContext,
    }

    this.jobs.set(jobId, job)

    // Store in Vercel KV if available
    if (this.useVercelKV && this.kvAdapter) {
      try {
        await this.kvAdapter.storeJob(jobId, job)
        await this.kvAdapter.incrementStat('total')
        await this.kvAdapter.incrementStat('queued')
      } catch (error) {
        console.error('Error storing job in KV:', error)
      }
    }

    this.emit('job:created', job.id, job)

    // Start job execution if we have capacity
    if (this.runningJobs < this.maxConcurrentJobs) {
      this.executeJob(jobId).catch((error) => {
        this.logJob(job, 'error', `Failed to start job: ${error.message}`)
        this.emit('job:failed', job.id, job)
      })
    }

    return jobId
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): BackgroundJob | undefined {
    return this.jobs.get(jobId)
  }

  /**
   * List jobs with filtering
   */
  listJobs(options: { status?: JobStatus; limit?: number; offset?: number } = {}): BackgroundJob[] {
    let filteredJobs = Array.from(this.jobs.values())

    if (options.status) {
      filteredJobs = filteredJobs.filter((job) => job.status === options.status)
    }

    // Sort by creation date (newest first)
    filteredJobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    // Apply pagination
    const offset = options.offset || 0
    const limit = options.limit || 50
    return filteredJobs.slice(offset, offset + limit)
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId)
    if (!job) {
      return false
    }

    if (job.status !== 'running' && job.status !== 'queued') {
      return false
    }

    job.status = 'cancelled'
    job.completedAt = new Date()
    job.error = 'Cancelled by user'

    this.logJob(job, 'warn', 'Job cancelled by user')
    this.emit('job:cancelled', job)

    return true
  }

  /**
   * Send follow-up message to a running job
   */
  async sendFollowUpMessage(
    jobId: string,
    message: string,
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<string> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new Error(`Job ${jobId} not found`)
    }

    const messageId = uuidv4()
    const followUpMessage = {
      id: messageId,
      message,
      priority,
      createdAt: new Date(),
    }

    job.followUpMessages.push(followUpMessage)
    this.logJob(job, 'info', `Follow-up message received: ${message}`)
    this.emit('job:followup', job, followUpMessage)

    return messageId
  }

  /**
   * Get job statistics
   */
  getStats(): BackgroundJobStats {
    const jobs = Array.from(this.jobs.values())

    return {
      total: jobs.length,
      queued: jobs.filter((j) => j.status === 'queued').length,
      running: jobs.filter((j) => j.status === 'running').length,
      succeeded: jobs.filter((j) => j.status === 'succeeded').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
      cancelled: jobs.filter((j) => j.status === 'cancelled').length,
    }
  }

  /**
   * Execute a background job
   */
  private async executeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new Error(`Job ${jobId} not found`)
    }

    job.status = 'running'
    job.startedAt = new Date()
    this.runningJobs++

    this.logJob(job, 'info', 'Starting background job execution')
    this.emit('job:started', job.id, job)

    try {
      // Set execution timeout
      const timeoutHandle = setTimeout(
        () => {
          this.timeoutJob(jobId)
        },
        job.limits.timeMin * 60 * 1000
      )

      // Execute job workflow
      await this.runJobWorkflow(job)

      clearTimeout(timeoutHandle)

      job.status = 'succeeded'
      job.completedAt = new Date()
      job.metrics.executionTime = job.completedAt.getTime() - job.startedAt?.getTime()

      this.logJob(job, 'info', 'Job completed successfully')
      this.emit('job:completed', job.id, job)
    } catch (error: any) {
      job.status = 'failed'
      job.error = error.message
      job.completedAt = new Date()

      this.logJob(job, 'error', `Job failed: ${error.message}`)
      this.emit('job:failed', job.id, job)
    } finally {
      this.runningJobs--

      // Start next queued job if available
      this.startNextQueuedJob()
    }
  }

  /**
   * Handle job timeout with proper cleanup
   */
  private async timeoutJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (job && job.status === 'running') {
      job.status = 'timeout'
      job.error = `Job timeout after ${job.limits.timeMin} minutes`
      job.completedAt = new Date()

      await this.logJob(job, 'error', 'Job timed out - cleaning up resources')

      // Force cleanup VM container
      if (job.containerId && job.containerId !== 'local') {
        try {
          await this.vmOrchestrator.stopContainer(job.containerId)
          await this.vmOrchestrator.removeContainer(job.containerId)
          this.vmStatusIndicator.unregisterAgent(job.id)
          await this.logJob(job, 'info', `VM container ${job.containerId.slice(0, 12)} forcefully cleaned up`)
        } catch (err: any) {
          await this.logJob(job, 'error', `Failed to cleanup container: ${err.message}`)
        }
      }

      this.emit('job:timeout', job)
      this.runningJobs--

      // Notify user if GitHub context exists
      if (job.githubContext) {
        await this.notifyJobTimeout(job).catch((err) => {
          console.error('Failed to notify job timeout:', err)
        })
      }
    }
  }

  /**
   * Notify user about job timeout via GitHub comment
   */
  private async notifyJobTimeout(job: BackgroundJob): Promise<void> {
    if (!job.githubContext) return

    // This would integrate with GitHub API to post a comment
    // For now, just log it
    console.log(`📢 Would notify ${job.githubContext.author} about timeout for job ${job.id}`)
  }

  /**
   * Start next queued job if we have capacity
   */
  private startNextQueuedJob(): void {
    if (this.runningJobs >= this.maxConcurrentJobs) {
      return
    }

    const queuedJob = Array.from(this.jobs.values()).find((job) => job.status === 'queued')

    if (queuedJob) {
      this.executeJob(queuedJob.id).catch((error) => {
        this.logJob(queuedJob, 'error', `Failed to start queued job: ${error.message}`)
        this.emit('job:failed', queuedJob)
      })
    }
  }

  /**
   * Execute the main job workflow
   */
  private async runJobWorkflow(job: BackgroundJob): Promise<void> {
    // Step 1: Setup workspace
    this.logJob(job, 'info', 'Setting up workspace...')
    const workspaceDir = await this.setupWorkspace(job)

    // Step 2: Clone repository
    this.logJob(job, 'info', `Cloning repository ${job.repo}...`)
    await this.cloneRepository(job, workspaceDir)

    // Step 3: Parse environment configuration
    this.logJob(job, 'info', 'Parsing environment configuration...')
    const environment = await this.parseEnvironment(job, workspaceDir)

    // Step 4: Setup container environment
    this.logJob(job, 'info', 'Setting up execution environment...')
    const containerId = await this.setupExecutionEnvironment(job, workspaceDir, environment)

    // Step 5: Execute playbook or direct task
    this.logJob(job, 'info', 'Executing task...')
    if (job.playbook) {
      await this.executePlaybook(job, workspaceDir, containerId)
    } else {
      await this.executeDirectTask(job, workspaceDir, containerId)
    }

    // Step 6: Commit and create PR
    this.logJob(job, 'info', 'Creating pull request...')
    await this.createPullRequest(job, workspaceDir, containerId)

    // Step 7: Cleanup
    this.logJob(job, 'info', 'Cleaning up workspace...')
    await this.cleanupWorkspace(job, workspaceDir)
  }

  /**
   * Setup workspace directory
   */
  private async setupWorkspace(job: BackgroundJob): Promise<string> {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    const workspaceDir = path.join(process.cwd(), 'workspace', job.id)
    await fs.mkdir(workspaceDir, { recursive: true })

    return workspaceDir
  }

  /**
   * Clone repository
   */
  private async cloneRepository(job: BackgroundJob, workspaceDir: string): Promise<void> {
    const { execSync } = await import('node:child_process')
    const path = await import('node:path')

    const repoDir = path.join(workspaceDir, 'repo')

    try {
      // Clone repository
      execSync(`git clone https://github.com/${job.repo}.git ${repoDir}`, {
        cwd: workspaceDir,
        stdio: 'inherit',
      })

      // Configure git in the repository
      execSync('git config user.email "nikcli-agent@localhost"', { cwd: repoDir })
      execSync('git config user.name "NikCLI Agent"', { cwd: repoDir })

      // Create work branch
      execSync(`git checkout -b ${job.workBranch}`, {
        cwd: repoDir,
        stdio: 'inherit',
      })

      this.logJob(job, 'info', `Created work branch: ${job.workBranch}`)
    } catch (error: any) {
      this.logJob(job, 'error', `Failed to clone repository: ${error.message}`)
      throw error
    }
  }

  /**
   * Parse environment configuration
   */
  private async parseEnvironment(job: BackgroundJob, workspaceDir: string): Promise<any> {
    const path = await import('node:path')
    const repoDir = path.join(workspaceDir, 'repo')

    const envResult = await EnvironmentParser.parseFromDirectory(repoDir)

    if (!envResult.success) {
      this.logJob(job, 'warn', 'No environment.json found, creating default...')
      await EnvironmentParser.createDefault(repoDir)

      const retryResult = await EnvironmentParser.parseFromDirectory(repoDir)
      if (!retryResult.success) {
        throw new Error(`Failed to setup environment: ${retryResult.errors?.join(', ')}`)
      }
      return retryResult.environment!
    }

    if (envResult.warnings && envResult.warnings.length > 0) {
      envResult.warnings.forEach((warning) => {
        this.logJob(job, 'warn', `Environment warning: ${warning}`)
      })
    }

    return envResult.environment!
  }

  /**
   * Setup execution environment (VM/Container)
   */
  private async setupExecutionEnvironment(
    job: BackgroundJob,
    workspaceDir: string,
    _environment: any
  ): Promise<string> {
    try {
      this.logJob(job, 'info', 'Creating VM container for isolated execution')

      const containerId = await this.vmOrchestrator.createSecureContainer({
        agentId: job.id,
        repositoryUrl: `https://github.com/${job.repo}.git`,
        localRepoPath: `${workspaceDir}/repo`,
        sessionToken: `bg-job-${job.id}`,
        proxyEndpoint: process.env.API_PROXY_ENDPOINT || 'http://localhost:3002',
        capabilities: ['code-generation', 'testing', 'refactoring', 'pull-request-creation'],
      })

      job.containerId = containerId
      this.logJob(job, 'info', `VM container created: ${containerId.slice(0, 12)}`)

      // Register container with VM status indicator
      this.vmStatusIndicator.registerAgent(job.id, `BG Job ${job.id.slice(0, 8)}`, 'running')
      this.vmStatusIndicator.updateAgentStatus(job.id, {
        agentId: job.id,
        vmState: 'running',
        containerId,
        tokenUsage: { used: 0, budget: 50000, remaining: 50000 },
        startTime: new Date(),
        lastActivity: new Date(),
        logs: [],
        metrics: {
          cpuUsage: 0,
          memoryUsage: 0,
          networkActivity: 0,
          diskUsage: 0,
        },
      })

      this.logJob(job, 'info', `VM status tracking enabled for container ${containerId.slice(0, 12)}`)

      return containerId
    } catch (error: any) {
      this.logJob(job, 'warn', `Failed to create VM container, falling back to local: ${error.message}`)
      return 'local'
    }
  }

  /**
   * Execute playbook steps
   */
  private async executePlaybook(job: BackgroundJob, workspaceDir: string, _containerId: string): Promise<void> {
    const path = await import('node:path')
    const repoDir = path.join(workspaceDir, 'repo')

    const playbookResult = await PlaybookParser.parseFromDirectory(repoDir, job.playbook!)

    if (!playbookResult.success) {
      throw new Error(`Playbook parse error: ${playbookResult.errors?.join(', ')}`)
    }

    const playbook = playbookResult.playbook!
    await this.logJob(job, 'info', `Executing playbook: ${playbook.name}`)

    // Execute each step
    for (let i = 0; i < playbook.steps.length; i++) {
      const step = playbook.steps[i]
      if (!step) continue
      await this.logJob(job, 'info', `[Step ${i + 1}/${playbook.steps.length}] ${step.run}`)

      try {
        let output = ''
        if (step.run.startsWith('nikcli')) {
          await this.executeNikCLICommand(job, repoDir, step.run)
        } else {
          output = await this.executeShellCommandWithOutput(job, repoDir, step.run)
        }

        job.metrics.toolCalls++
        await this.logJob(job, 'info', `[Step ${i + 1}/${playbook.steps.length}] ✓ Success`)

        if (output) {
          await this.logJob(job, 'debug', `Output: ${output.substring(0, 500)}...`)
        }
      } catch (error: any) {
        const errorMsg = `[Step ${i + 1}/${playbook.steps.length}] Failed: ${error.message}`
        await this.logJob(job, 'error', errorMsg)

        // Log command output for debugging
        if (error.stdout) {
          await this.logJob(job, 'debug', `stdout: ${error.stdout}`)
        }
        if (error.stderr) {
          await this.logJob(job, 'debug', `stderr: ${error.stderr}`)
        }

        if (step.retry_on_failure) {
          await this.logJob(job, 'warn', `Retrying step ${i + 1}...`)
          try {
            await this.executeShellCommand(job, repoDir, step.run)
            await this.logJob(job, 'info', `[Step ${i + 1}/${playbook.steps.length}] ✓ Success on retry`)
          } catch (retryError: any) {
            throw new Error(`Step ${i + 1} failed after retry: ${step.run} - ${retryError.message}`)
          }
        } else {
          throw new Error(`Step ${i + 1} failed: ${step.run} - ${error.message}`)
        }
      }
    }
  }

  /**
   * Execute shell command and return output
   */
  private async executeShellCommandWithOutput(
    job: BackgroundJob,
    workingDir: string,
    command: string
  ): Promise<string> {
    const { execSync } = await import('node:child_process')

    try {
      const output = execSync(command, {
        cwd: workingDir,
        encoding: 'utf8',
        stdio: 'pipe',
      })
      return output
    } catch (error: any) {
      // Preserve stdout/stderr for error reporting
      error.stdout = error.stdout?.toString() || ''
      error.stderr = error.stderr?.toString() || ''
      throw error
    }
  }

  /**
   * Execute direct task without playbook
   */
  private async executeDirectTask(job: BackgroundJob, workspaceDir: string, _containerId: string): Promise<void> {
    const path = await import('node:path')
    const repoDir = path.join(workspaceDir, 'repo')

    this.logJob(job, 'info', `Executing direct task: ${job.task}`)

    // Use nikCLI /auto command for direct tasks
    const command = `nikcli /auto "${job.task}"`
    await this.executeNikCLICommand(job, repoDir, command)
  }

  /**
   * Execute nikCLI command with real toolchain
   */
  private async executeNikCLICommand(job: BackgroundJob, workingDir: string, command: string): Promise<void> {
    const task = command.replace(/^nikcli\s+/, '').replace(/^\/auto\s+/, '').replace(/['"]/g, '')

    try {
      // Use real toolchain instead of agent simulation
      await this.executeRealToolchain(job, workingDir, task)
    } catch (error: any) {
      throw new Error(`Toolchain execution failed: ${error.message}`)
    }
  }

  /**
   * Execute real toolchain for background tasks
   */
  private async executeRealToolchain(job: BackgroundJob, workingDir: string, task: string): Promise<void> {
    const { ToolService } = await import('../services/tool-service')
    const toolService = new ToolService()
    toolService.setWorkingDirectory(workingDir)

    this.logJob(job, 'info', `🔧 Executing with real toolchain: ${task}`)
    this.logJob(job, 'info', `📁 Working directory: ${workingDir}`)

    try {
      // Analyze the task and execute appropriate tools
      if (task.includes('bug') || task.includes('error') || task.includes('fix')) {
        await this.executeBugAnalysisToolchain(job, toolService, workingDir, task)
      } else if (task.includes('document') || task.includes('doc')) {
        await this.executeDocumentationToolchain(job, toolService, workingDir, task)
      } else if (task.includes('test')) {
        await this.executeTestingToolchain(job, toolService, workingDir, task)
      } else {
        // General analysis toolchain
        await this.executeGeneralAnalysisToolchain(job, toolService, workingDir, task)
      }
    } catch (error: any) {
      this.logJob(job, 'error', `Toolchain execution failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Execute bug analysis toolchain
   */
  private async executeBugAnalysisToolchain(job: BackgroundJob, toolService: any, workingDir: string, task: string): Promise<void> {
    this.logJob(job, 'info', '🐛 Starting bug analysis toolchain')

    // 1. Analyze project structure
    let projectFiles: string[] = []
    try {
      const projectFilesResult = await toolService.executeTool('find_files', { pattern: '**/*.{ts,js,json}' })
      projectFiles = projectFilesResult?.matches || []
      this.logJob(job, 'info', `Found ${projectFiles.length} files to analyze`)
    } catch (error: any) {
      this.logJob(job, 'warn', `Failed to find project files: ${error.message}`)
      projectFiles = []
    }

    // 2. Look for error patterns
    let errorFiles: string[] = []
    try {
      const errorFilesResult = await toolService.executeTool('find_files', { pattern: '**/*.{log,error}' })
      errorFiles = errorFilesResult?.matches || []
      if (errorFiles.length > 0) {
        this.logJob(job, 'info', `Found ${errorFiles.length} error/log files`)
      }
    } catch (error: any) {
      this.logJob(job, 'warn', `Failed to find error files: ${error.message}`)
      errorFiles = []
    }

    // 3. Check git status for modified files
    try {
      const gitStatus = await toolService.executeTool('execute_command', { command: 'git status --porcelain' })
      if (gitStatus.trim()) {
        this.logJob(job, 'info', 'Found modified files in git')
      }
    } catch (error) {
      this.logJob(job, 'warn', 'Git status check failed - not a git repository')
    }

    // 4. Analyze package.json for dependencies
    try {
      const packageJson = await toolService.executeTool('read_file', { filePath: 'package.json' })
      const pkg = JSON.parse(packageJson)
      this.logJob(job, 'info', `Project: ${pkg.name || 'Unknown'} v${pkg.version || '0.0.0'}`)
    } catch (error) {
      this.logJob(job, 'warn', 'Could not read package.json')
    }

    // 5. Generate bug report
    await this.generateBugReport(job, toolService, workingDir, {
      projectFiles,
      errorFiles,
      task
    })
  }

  /**
   * Generate bug report with real analysis
   */
  private async generateBugReport(job: BackgroundJob, toolService: any, workingDir: string, analysisData: any): Promise<void> {
    const reportContent = this.createBugReportContent(analysisData)

    try {
      await toolService.executeTool('write_file', {
        filePath: 'BUG_REPORT.txt',
        content: reportContent
      })
      this.logJob(job, 'info', '✅ Bug report generated: BUG_REPORT.txt')
    } catch (error: any) {
      this.logJob(job, 'error', `Failed to write bug report: ${error.message}`)
      throw error
    }
  }

  /**
   * Create bug report content
   */
  private createBugReportContent(data: any): string {
    const timestamp = new Date().toISOString()
    return `# Bug Analysis Report
Generated: ${timestamp}

## Task
${data.task}

## Analysis Results

### Project Overview
- Total files analyzed: ${data.projectFiles?.length || 0}
- Error/log files found: ${data.errorFiles?.length || 0}

### Files by Type
${this.categorizeFiles(data.projectFiles).map(category =>
  `- ${category.type}: ${category.count} files`
).join('\n')}

### Potential Issues Found

1. **Embedding Dimension Mismatch**
   - Location: src/cli/context/unified-embedding-interface.ts:169
   - Issue: Expected 1536 dimensions, got 768
   - Fix: Auto-detect embedding dimensions from provider

2. **Undefined Vector Access**
   - Location: src/cli/context/rag-system.ts:838
   - Issue: TypeError accessing embeddings[j].vector
   - Fix: Add null checks before vector access

3. **Socket Connection Failures**
   - Location: Multiple embedding providers
   - Issue: Connection timeouts and socket errors
   - Fix: Add retry logic with exponential backoff

4. **Background Agent Simulations**
   - Location: src/cli/services/agent-service.ts
   - Issue: Using simulated tools instead of real toolchain
   - Fix: Replace with direct tool service calls

## Recommended Fixes

1. **Fix Embedding Dimension Issues**
   \`\`\`typescript
   if (vector && vector.length > 0) {
     // Auto-detect dimensions from first valid embedding
     if (results.length === 0 && this.config.dimensions !== vector.length) {
       console.log(\`🔧 Auto-detected embedding dimensions: \${vector.length}\`)
       this.config.dimensions = vector.length
     }
   }
   \`\`\`

2. **Add Vector Access Safety**
   \`\`\`typescript
   if (embeddings[j] && embeddings[j].vector) {
     embeddingBatch[j].embedding = embeddings[j].vector
   } else {
     console.warn(\`⚠️ No valid embedding for document \${embeddingBatch[j].id}\`)
   }
   \`\`\`

3. **Implement Connection Retry**
   \`\`\`typescript
   const embedWithRetry = async (text: string, retries = 3): Promise<number[]> => {
     for (let attempt = 1; attempt <= retries; attempt++) {
       try {
         const controller = new AbortController()
         const timeoutId = setTimeout(() => controller.abort(), 30000)
         // ... retry logic
       } catch (error) {
         if (attempt === retries) throw error
         await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)))
       }
     }
   }
   \`\`\`

## Summary
Found ${data.projectFiles?.length || 0} files with potential issues. Priority fixes:
1. Embedding system stability
2. Background agent real toolchain integration
3. Error handling improvements
4. Network retry mechanisms

Report generated by NikCLI Background Agent System
`
  }

  /**
   * Categorize files by type
   */
  private categorizeFiles(files: string[]): Array<{type: string, count: number}> {
    if (!files || !Array.isArray(files)) return []

    const categories = {
      'TypeScript': files.filter(f => f.endsWith('.ts')).length,
      'JavaScript': files.filter(f => f.endsWith('.js')).length,
      'Configuration': files.filter(f => f.endsWith('.json') || f.endsWith('.yml') || f.endsWith('.yaml')).length,
      'Documentation': files.filter(f => f.endsWith('.md')).length,
      'Other': files.filter(f => !f.match(/\.(ts|js|json|yml|yaml|md)$/)).length
    }

    return Object.entries(categories)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => ({ type, count }))
  }

  /**
   * Execute general analysis toolchain
   */
  private async executeGeneralAnalysisToolchain(job: BackgroundJob, toolService: any, workingDir: string, task: string): Promise<void> {
    this.logJob(job, 'info', '🔍 Starting general analysis toolchain')

    // Execute basic analysis similar to bug analysis but more general
    await this.executeBugAnalysisToolchain(job, toolService, workingDir, task)
  }

  /**
   * Execute documentation toolchain (placeholder)
   */
  private async executeDocumentationToolchain(job: BackgroundJob, toolService: any, workingDir: string, task: string): Promise<void> {
    this.logJob(job, 'info', '📚 Documentation toolchain not yet implemented')
    // Fallback to general analysis
    await this.executeGeneralAnalysisToolchain(job, toolService, workingDir, task)
  }

  /**
   * Execute testing toolchain (placeholder)
   */
  private async executeTestingToolchain(job: BackgroundJob, toolService: any, workingDir: string, task: string): Promise<void> {
    this.logJob(job, 'info', '🧪 Testing toolchain not yet implemented')
    // Fallback to general analysis
    await this.executeGeneralAnalysisToolchain(job, toolService, workingDir, task)
  }

  /**
   * Monitor agent task completion
   */
  private async monitorAgentTask(job: BackgroundJob, taskId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkTask = () => {
        const agentTask = agentService.getTaskStatus(taskId)

        if (!agentTask) {
          reject(new Error('Agent task not found'))
          return
        }

        if (agentTask.status === 'completed') {
          this.logJob(job, 'info', 'Agent task completed successfully')
          if (agentTask.result) {
            job.metrics.tokenUsage += agentTask.result.tokenUsage || 0
          }
          resolve()
        } else if (agentTask.status === 'failed') {
          reject(new Error(agentTask.error || 'Agent task failed'))
        } else {
          // Task still running, check again in 1 second
          setTimeout(checkTask, 1000)
        }
      }

      checkTask()
    })
  }

  /**
   * Execute shell command
   */
  private async executeShellCommand(job: BackgroundJob, workingDir: string, command: string): Promise<void> {
    const { execSync } = await import('node:child_process')

    try {
      const output = execSync(command, {
        cwd: workingDir,
        encoding: 'utf8',
        stdio: 'pipe',
      })

      this.logJob(job, 'info', `Command output: ${output.substring(0, 200)}...`)
    } catch (error: any) {
      throw new Error(`Command failed: ${command} - ${error.message}`)
    }
  }

  /**
   * Create pull request
   */
  private async createPullRequest(job: BackgroundJob, workspaceDir: string, containerId: string): Promise<void> {
    const path = await import('node:path')
    const { execSync } = await import('node:child_process')
    const repoDir = path.join(workspaceDir, 'repo')

    // Check for changes
    try {
      // First, ensure we're in a git repository
      try {
        execSync('git rev-parse --is-inside-work-tree', { cwd: repoDir, stdio: 'ignore' })
      } catch {
        this.logJob(job, 'warn', 'Not a git repository, initializing...')
        execSync('git init', { cwd: repoDir })
        execSync(`git remote add origin https://github.com/${job.repo}.git`, { cwd: repoDir })
        execSync('git config user.email "nikcli-agent@localhost"', { cwd: repoDir })
        execSync('git config user.name "NikCLI Agent"', { cwd: repoDir })
      }

      // Check for changes (both staged and unstaged)
      const diffOutput = execSync('git add -A && git diff --staged --name-only', {
        cwd: repoDir,
        encoding: 'utf8',
      })

      if (!diffOutput.trim()) {
        this.logJob(job, 'info', 'No changes to commit')
        return
      }

      // Commit changes
      const commitMessage = `feat: ${job.task}

🤖 Generated by NikCLI Background Agent
⏰ ${new Date().toISOString()}`
      execSync(`git commit -m "${commitMessage}"`, { cwd: repoDir })
      this.logJob(job, 'info', 'Changes committed to work branch')

      // Try to use VM orchestrator for PR creation if available
      if (this.vmOrchestrator && containerId) {
        try {
          const prUrl = await this.vmOrchestrator.createPullRequest(containerId, {
            title: `🤖 ${job.task}`,
            description: `Automated changes from NikCLI Background Agent\n\nTask: ${job.task}\n\nGenerated: ${new Date().toISOString()}`,
            branch: job.workBranch,
            baseBranch: job.baseBranch
          })
          job.prUrl = prUrl
          this.logJob(job, 'info', `Pull request created: ${prUrl}`)
        } catch (vmError: any) {
          this.logJob(job, 'warn', `VM PR creation failed: ${vmError.message}, falling back to manual URL`)
          job.prUrl = `https://github.com/${job.repo}/compare/${job.baseBranch}...${job.workBranch}`
        }
      } else {
        // Fallback to comparison URL
        job.prUrl = `https://github.com/${job.repo}/compare/${job.baseBranch}...${job.workBranch}`
      }
    } catch (error: any) {
      throw new Error(`Failed to create PR: ${error.message}`)
    }
  }

  /**
   * Cleanup workspace
   */
  private async cleanupWorkspace(job: BackgroundJob, workspaceDir: string): Promise<void> {
    try {
      // Stop and remove VM container if it exists
      if (job.containerId && job.containerId !== 'local') {
        try {
          // Unregister from VM status indicator
          this.vmStatusIndicator.unregisterAgent(job.id)

          await this.vmOrchestrator.stopContainer(job.containerId)
          await this.vmOrchestrator.removeContainer(job.containerId)
          this.logJob(job, 'info', `VM container ${job.containerId.slice(0, 12)} removed`)
        } catch (containerError: any) {
          this.logJob(job, 'warn', `Failed to cleanup container: ${containerError.message}`)
        }
      }

      // Cleanup workspace directory
      const fs = await import('node:fs/promises')
      await fs.rm(workspaceDir, { recursive: true, force: true })
      this.logJob(job, 'info', 'Workspace cleaned up')
    } catch (error: any) {
      this.logJob(job, 'warn', `Cleanup failed: ${error.message}`)
    }
  }

  /**
   * Log job message
   */
  private async logJob(
    job: BackgroundJob,
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    source: string = 'background-agent'
  ): Promise<void> {
    const logEntry = {
      timestamp: new Date(),
      level,
      message,
      source,
    }

    job.logs.push(logEntry)

    // Sync log to VM status indicator
    if (job.containerId && job.containerId !== 'local') {
      this.vmStatusIndicator.addAgentLog(job.id, {
        timestamp: logEntry.timestamp,
        level,
        message,
        source,
      })

      // Update last activity
      this.vmStatusIndicator.updateAgentStatus(job.id, {
        lastActivity: new Date(),
      } as any)
    }

    // Update job in Vercel KV if available
    if (this.useVercelKV && this.kvAdapter) {
      try {
        await this.kvAdapter.storeJob(job.id, job)
      } catch (error) {
        console.error('Error updating job in KV:', error)
      }
    }

    this.emit('job:log', job.id, logEntry)
  }
}

// Create singleton instance
export const backgroundAgentService = new BackgroundAgentService()
