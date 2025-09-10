// src/cli/background-agents/background-agent-service.ts

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { BackgroundJob, JobStatus, JobLimits, HeadlessOptions } from './types';
import { EnvironmentParser } from './core/environment-parser';
import { PlaybookParser } from './core/playbook-parser';
import { agentService } from '../services/agent-service';
import { toolService } from '../services/tool-service';
import { memoryService } from '../services/memory-service';
import { VmOrchestrator } from '../virtualized-agents/vm-orchestrator';

export interface CreateBackgroundJobRequest {
  repo: string;
  baseBranch: string;
  task: string;
  playbook?: string;
  envVars?: Record<string, string>;
  limits?: Partial<JobLimits>;
  reviewers?: string[];
  labels?: string[];
  draft?: boolean;
}

export interface BackgroundJobStats {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
}

export class BackgroundAgentService extends EventEmitter {
  private jobs: Map<string, BackgroundJob> = new Map();
  private vmOrchestrator: VmOrchestrator;
  private maxConcurrentJobs = 3;
  private runningJobs = 0;

  constructor() {
    super();
    this.vmOrchestrator = new VmOrchestrator();
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    try {
      // Initialize VM orchestrator if available
      if (this.vmOrchestrator) {
        await this.vmOrchestrator.initialize();
      }
      this.emit('ready');
    } catch (error) {
      console.error('Failed to initialize Background Agent Service:', error);
      this.emit('error', error);
    }
  }

  /**
   * Create a new background job
   */
  async createJob(request: CreateBackgroundJobRequest): Promise<string> {
    const jobId = uuidv4();
    
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
    };

    this.jobs.set(jobId, job);
    this.emit('job:created', job);

    // Start job execution if we have capacity
    if (this.runningJobs < this.maxConcurrentJobs) {
      this.executeJob(jobId).catch(error => {
        this.logJob(job, 'error', `Failed to start job: ${error.message}`);
        this.emit('job:failed', job);
      });
    }

    return jobId;
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): BackgroundJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * List jobs with filtering
   */
  listJobs(options: { 
    status?: JobStatus; 
    limit?: number; 
    offset?: number 
  } = {}): BackgroundJob[] {
    let filteredJobs = Array.from(this.jobs.values());

    if (options.status) {
      filteredJobs = filteredJobs.filter(job => job.status === options.status);
    }

    // Sort by creation date (newest first)
    filteredJobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    return filteredJobs.slice(offset, offset + limit);
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    if (job.status !== 'running' && job.status !== 'queued') {
      return false;
    }

    job.status = 'cancelled';
    job.completedAt = new Date();
    job.error = 'Cancelled by user';

    this.logJob(job, 'warn', 'Job cancelled by user');
    this.emit('job:cancelled', job);

    return true;
  }

  /**
   * Send follow-up message to a running job
   */
  async sendFollowUpMessage(jobId: string, message: string, priority: 'low' | 'normal' | 'high' = 'normal'): Promise<string> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const messageId = uuidv4();
    const followUpMessage = {
      id: messageId,
      message,
      priority,
      createdAt: new Date(),
    };

    job.followUpMessages.push(followUpMessage);
    this.logJob(job, 'info', `Follow-up message received: ${message}`);
    this.emit('job:followup', job, followUpMessage);

    return messageId;
  }

  /**
   * Get job statistics
   */
  getStats(): BackgroundJobStats {
    const jobs = Array.from(this.jobs.values());
    
    return {
      total: jobs.length,
      queued: jobs.filter(j => j.status === 'queued').length,
      running: jobs.filter(j => j.status === 'running').length,
      succeeded: jobs.filter(j => j.status === 'succeeded').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length,
    };
  }

  /**
   * Execute a background job
   */
  private async executeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.status = 'running';
    job.startedAt = new Date();
    this.runningJobs++;

    this.logJob(job, 'info', 'Starting background job execution');
    this.emit('job:started', job);

    try {
      // Set execution timeout
      const timeoutHandle = setTimeout(() => {
        this.timeoutJob(jobId);
      }, job.limits.timeMin * 60 * 1000);

      // Execute job workflow
      await this.runJobWorkflow(job);

      clearTimeout(timeoutHandle);
      
      job.status = 'succeeded';
      job.completedAt = new Date();
      job.metrics.executionTime = job.completedAt.getTime() - job.startedAt!.getTime();
      
      this.logJob(job, 'info', 'Job completed successfully');
      this.emit('job:completed', job);

    } catch (error: any) {
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = new Date();
      
      this.logJob(job, 'error', `Job failed: ${error.message}`);
      this.emit('job:failed', job);
    } finally {
      this.runningJobs--;
      
      // Start next queued job if available
      this.startNextQueuedJob();
    }
  }

  /**
   * Handle job timeout
   */
  private timeoutJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'running') {
      job.status = 'timeout';
      job.error = `Job timeout after ${job.limits.timeMin} minutes`;
      job.completedAt = new Date();
      
      this.logJob(job, 'error', 'Job timed out');
      this.emit('job:timeout', job);
      
      this.runningJobs--;
    }
  }

  /**
   * Start next queued job if we have capacity
   */
  private startNextQueuedJob(): void {
    if (this.runningJobs >= this.maxConcurrentJobs) {
      return;
    }

    const queuedJob = Array.from(this.jobs.values())
      .find(job => job.status === 'queued');

    if (queuedJob) {
      this.executeJob(queuedJob.id).catch(error => {
        this.logJob(queuedJob, 'error', `Failed to start queued job: ${error.message}`);
        this.emit('job:failed', queuedJob);
      });
    }
  }

  /**
   * Execute the main job workflow
   */
  private async runJobWorkflow(job: BackgroundJob): Promise<void> {
    // Step 1: Setup workspace
    this.logJob(job, 'info', 'Setting up workspace...');
    const workspaceDir = await this.setupWorkspace(job);

    // Step 2: Clone repository
    this.logJob(job, 'info', `Cloning repository ${job.repo}...`);
    await this.cloneRepository(job, workspaceDir);

    // Step 3: Parse environment configuration
    this.logJob(job, 'info', 'Parsing environment configuration...');
    const environment = await this.parseEnvironment(job, workspaceDir);

    // Step 4: Setup container environment
    this.logJob(job, 'info', 'Setting up execution environment...');
    const containerId = await this.setupExecutionEnvironment(job, workspaceDir, environment);

    // Step 5: Execute playbook or direct task
    this.logJob(job, 'info', 'Executing task...');
    if (job.playbook) {
      await this.executePlaybook(job, workspaceDir, containerId);
    } else {
      await this.executeDirectTask(job, workspaceDir, containerId);
    }

    // Step 6: Commit and create PR
    this.logJob(job, 'info', 'Creating pull request...');
    await this.createPullRequest(job, workspaceDir, containerId);

    // Step 7: Cleanup
    this.logJob(job, 'info', 'Cleaning up workspace...');
    await this.cleanupWorkspace(job, workspaceDir);
  }

  /**
   * Setup workspace directory
   */
  private async setupWorkspace(job: BackgroundJob): Promise<string> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const workspaceDir = path.join(process.cwd(), 'workspace', job.id);
    await fs.mkdir(workspaceDir, { recursive: true });
    
    return workspaceDir;
  }

  /**
   * Clone repository
   */
  private async cloneRepository(job: BackgroundJob, workspaceDir: string): Promise<void> {
    const { execSync } = await import('child_process');
    const path = await import('path');
    
    const repoDir = path.join(workspaceDir, 'repo');
    
    // Clone repository
    execSync(`git clone https://github.com/${job.repo}.git ${repoDir}`, {
      cwd: workspaceDir,
      stdio: 'inherit'
    });

    // Create work branch
    execSync(`git checkout -b ${job.workBranch}`, {
      cwd: repoDir,
      stdio: 'inherit'
    });

    this.logJob(job, 'info', `Created work branch: ${job.workBranch}`);
  }

  /**
   * Parse environment configuration
   */
  private async parseEnvironment(job: BackgroundJob, workspaceDir: string): Promise<any> {
    const path = await import('path');
    const repoDir = path.join(workspaceDir, 'repo');
    
    const envResult = await EnvironmentParser.parseFromDirectory(repoDir);
    
    if (!envResult.success) {
      this.logJob(job, 'warn', 'No environment.json found, creating default...');
      await EnvironmentParser.createDefault(repoDir);
      
      const retryResult = await EnvironmentParser.parseFromDirectory(repoDir);
      if (!retryResult.success) {
        throw new Error(`Failed to setup environment: ${retryResult.errors?.join(', ')}`);
      }
      return retryResult.environment!;
    }

    if (envResult.warnings && envResult.warnings.length > 0) {
      envResult.warnings.forEach(warning => {
        this.logJob(job, 'warn', `Environment warning: ${warning}`);
      });
    }

    return envResult.environment!;
  }

  /**
   * Setup execution environment (VM/Container)
   */
  private async setupExecutionEnvironment(job: BackgroundJob, workspaceDir: string, environment: any): Promise<string> {
    // For now, use local execution
    // In production, this would setup a proper container/VM
    this.logJob(job, 'info', 'Using local execution environment');
    return 'local';
  }

  /**
   * Execute playbook steps
   */
  private async executePlaybook(job: BackgroundJob, workspaceDir: string, containerId: string): Promise<void> {
    const path = await import('path');
    const repoDir = path.join(workspaceDir, 'repo');
    
    const playbookResult = await PlaybookParser.parseFromDirectory(repoDir, job.playbook!);
    
    if (!playbookResult.success) {
      throw new Error(`Playbook parse error: ${playbookResult.errors?.join(', ')}`);
    }

    const playbook = playbookResult.playbook!;
    this.logJob(job, 'info', `Executing playbook: ${playbook.name}`);

    // Execute each step
    for (let i = 0; i < playbook.steps.length; i++) {
      const step = playbook.steps[i];
      this.logJob(job, 'info', `Executing step ${i + 1}: ${step.run}`);
      
      try {
        if (step.run.startsWith('nikcli')) {
          await this.executeNikCLICommand(job, repoDir, step.run);
        } else {
          await this.executeShellCommand(job, repoDir, step.run);
        }
        
        job.metrics.toolCalls++;
        
      } catch (error: any) {
        if (step.retry_on_failure) {
          this.logJob(job, 'warn', `Step failed, retrying: ${error.message}`);
          await this.executeShellCommand(job, repoDir, step.run);
        } else {
          throw new Error(`Step failed: ${step.run} - ${error.message}`);
        }
      }
    }
  }

  /**
   * Execute direct task without playbook
   */
  private async executeDirectTask(job: BackgroundJob, workspaceDir: string, containerId: string): Promise<void> {
    const path = await import('path');
    const repoDir = path.join(workspaceDir, 'repo');
    
    this.logJob(job, 'info', `Executing direct task: ${job.task}`);
    
    // Use nikCLI /auto command for direct tasks
    const command = `nikcli /auto "${job.task}"`;
    await this.executeNikCLICommand(job, repoDir, command);
  }

  /**
   * Execute nikCLI command
   */
  private async executeNikCLICommand(job: BackgroundJob, workingDir: string, command: string): Promise<void> {
    // Integration with existing agent service
    const agentType = 'universal-agent';
    const task = command.replace(/^nikcli\s+/, '').replace(/^\/auto\s+/, '');
    
    try {
      // Use existing agent service to execute the task
      const taskId = await agentService.executeTask(agentType, task.replace(/['"]/g, ''));
      
      // Monitor task completion
      await this.monitorAgentTask(job, taskId);
      
    } catch (error: any) {
      throw new Error(`NikCLI command failed: ${error.message}`);
    }
  }

  /**
   * Monitor agent task completion
   */
  private async monitorAgentTask(job: BackgroundJob, taskId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkTask = () => {
        const agentTask = agentService.getTaskStatus(taskId);
        
        if (!agentTask) {
          reject(new Error('Agent task not found'));
          return;
        }

        if (agentTask.status === 'completed') {
          this.logJob(job, 'info', 'Agent task completed successfully');
          if (agentTask.result) {
            job.metrics.tokenUsage += agentTask.result.tokenUsage || 0;
          }
          resolve();
        } else if (agentTask.status === 'failed') {
          reject(new Error(agentTask.error || 'Agent task failed'));
        } else {
          // Task still running, check again in 1 second
          setTimeout(checkTask, 1000);
        }
      };

      checkTask();
    });
  }

  /**
   * Execute shell command
   */
  private async executeShellCommand(job: BackgroundJob, workingDir: string, command: string): Promise<void> {
    const { execSync } = await import('child_process');
    
    try {
      const output = execSync(command, {
        cwd: workingDir,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      this.logJob(job, 'info', `Command output: ${output.substring(0, 200)}...`);
    } catch (error: any) {
      throw new Error(`Command failed: ${command} - ${error.message}`);
    }
  }

  /**
   * Create pull request
   */
  private async createPullRequest(job: BackgroundJob, workspaceDir: string, containerId: string): Promise<void> {
    const path = await import('path');
    const { execSync } = await import('child_process');
    const repoDir = path.join(workspaceDir, 'repo');

    // Check for changes
    try {
      const diffOutput = execSync('git diff --name-only', {
        cwd: repoDir,
        encoding: 'utf8'
      });

      if (!diffOutput.trim()) {
        this.logJob(job, 'info', 'No changes to commit');
        return;
      }

      // Commit changes
      execSync('git add -A', { cwd: repoDir });
      
      const commitMessage = `feat: ${job.task} (nikCLI background agent)`;
      execSync(`git commit -m "${commitMessage}"`, { cwd: repoDir });

      // Push branch (in production, this would use GitHub API)
      this.logJob(job, 'info', 'Changes committed to work branch');
      job.prUrl = `https://github.com/${job.repo}/compare/${job.baseBranch}...${job.workBranch}`;
      
    } catch (error: any) {
      throw new Error(`Failed to create PR: ${error.message}`);
    }
  }

  /**
   * Cleanup workspace
   */
  private async cleanupWorkspace(job: BackgroundJob, workspaceDir: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      await fs.rm(workspaceDir, { recursive: true, force: true });
      this.logJob(job, 'info', 'Workspace cleaned up');
    } catch (error: any) {
      this.logJob(job, 'warn', `Cleanup failed: ${error.message}`);
    }
  }

  /**
   * Log job message
   */
  private logJob(
    job: BackgroundJob, 
    level: 'info' | 'warn' | 'error' | 'debug', 
    message: string, 
    source: string = 'background-agent'
  ): void {
    const logEntry = {
      timestamp: new Date(),
      level,
      message,
      source,
    };
    
    job.logs.push(logEntry);
    this.emit('job:log', job.id, logEntry);
  }
}

// Create singleton instance
export const backgroundAgentService = new BackgroundAgentService();
