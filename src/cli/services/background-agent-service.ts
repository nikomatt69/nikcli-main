import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { configManager } from '../core/config-manager';
import { AgentManager } from '../core/agent-manager';
import { UniversalAgent } from '../automation/agents/universal-agent';

/**
 * Background Agent Types
 */
export enum BackgroundAgentType {
  FILE_WATCHER = 'file-watcher',
  CODE_ANALYZER = 'code-analyzer',
  DEPENDENCY_MONITOR = 'dependency-monitor',
  SECURITY_SCANNER = 'security-scanner',
  PERFORMANCE_MONITOR = 'performance-monitor',
  DOCUMENTATION_GENERATOR = 'documentation-generator',
  TEST_RUNNER = 'test-runner',
  BUILD_MONITOR = 'build-monitor'
}

/**
 * Background Agent Status
 */
export enum BackgroundAgentStatus {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  PAUSED = 'paused',
  ERROR = 'error',
  STOPPING = 'stopping'
}

/**
 * Background Agent Configuration
 */
export interface BackgroundAgentConfig {
  id: string;
  type: BackgroundAgentType;
  name: string;
  description: string;
  enabled: boolean;
  workingDirectory: string;
  interval?: number; // in milliseconds
  triggers?: string[]; // file patterns, events, etc.
  settings?: Record<string, any>;
  autoStart?: boolean;
  maxConcurrentTasks?: number;
  timeout?: number;
}

/**
 * Background Agent Instance
 */
export interface BackgroundAgentInstance {
  id: string;
  config: BackgroundAgentConfig;
  status: BackgroundAgentStatus;
  startTime?: Date;
  lastActivity?: Date;
  taskCount: number;
  errorCount: number;
  lastError?: string;
  agent?: UniversalAgent;
  intervalId?: NodeJS.Timeout;
  eventListeners: Map<string, Function>;
}

/**
 * Background Agent Task
 */
export interface BackgroundAgentTask {
  id: string;
  agentId: string;
  type: string;
  description: string;
  data: any;
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  error?: string;
}

/**
 * Background Agent Service
 * Manages persistent background agents that run continuously
 */
export class BackgroundAgentService extends EventEmitter {
  private static instance: BackgroundAgentService;
  private agents: Map<string, BackgroundAgentInstance> = new Map();
  private taskQueue: BackgroundAgentTask[] = [];
  private isRunning = false;
  private configPath: string;
  private agentManager: AgentManager;

  private constructor(workingDirectory: string) {
    super();
    this.configPath = path.join(workingDirectory, '.nikcli', 'background-agents.json');
    this.agentManager = new AgentManager(configManager as any);
    this.setupEventHandlers();
  }

  public static getInstance(workingDirectory?: string): BackgroundAgentService {
    if (!BackgroundAgentService.instance) {
      if (!workingDirectory) {
        throw new Error('Working directory required for first initialization');
      }
      BackgroundAgentService.instance = new BackgroundAgentService(workingDirectory);
    }
    return BackgroundAgentService.instance;
  }

  /**
   * Initialize the background agent service
   */
  public async initialize(): Promise<void> {
    try {
      await logger.logService('info', 'background-agent-service', 'Initializing background agent service');
      
      // Load existing configurations
      await this.loadConfigurations();
      
      // Initialize agent manager
      await this.agentManager.initialize();
      
      // Start enabled agents
      await this.startEnabledAgents();
      
      this.isRunning = true;
      
      await logger.logService('info', 'background-agent-service', 'Background agent service initialized successfully');
      
    } catch (error: any) {
      await logger.logService('error', 'background-agent-service', 'Failed to initialize background agent service', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a new background agent
   */
  public async createAgent(config: Omit<BackgroundAgentConfig, 'id'>): Promise<BackgroundAgentInstance> {
    const agentId = nanoid();
    const fullConfig: BackgroundAgentConfig = {
      id: agentId,
      ...config
    };

    const instance: BackgroundAgentInstance = {
      id: agentId,
      config: fullConfig,
      status: BackgroundAgentStatus.STOPPED,
      taskCount: 0,
      errorCount: 0,
      eventListeners: new Map()
    };

    this.agents.set(agentId, instance);
    await this.saveConfigurations();

    await logger.logService('info', 'background-agent-service', `Created background agent: ${fullConfig.name}`, { agentId, type: fullConfig.type });

    this.emit('agent-created', instance);
    return instance;
  }

  /**
   * Start a background agent
   */
  public async startAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Background agent not found: ${agentId}`);
    }

    if (instance.status === BackgroundAgentStatus.RUNNING) {
      await logger.logService('warn', 'background-agent-service', `Agent ${agentId} is already running`);
      return;
    }

    try {
      instance.status = BackgroundAgentStatus.STARTING;
      this.emit('agent-starting', instance);

      // Create UniversalAgent instance
      const agent = new UniversalAgent(instance.config.workingDirectory);
      await agent.initialize();
      instance.agent = agent;

      // Setup event listeners
      this.setupAgentEventListeners(instance);

      // Start agent-specific functionality
      await this.startAgentFunctionality(instance);

      instance.status = BackgroundAgentStatus.RUNNING;
      instance.startTime = new Date();
      instance.lastActivity = new Date();

      await logger.logService('info', 'background-agent-service', `Started background agent: ${instance.config.name}`, { agentId });

      this.emit('agent-started', instance);

    } catch (error: any) {
      instance.status = BackgroundAgentStatus.ERROR;
      instance.lastError = error.message;
      instance.errorCount++;

      await logger.logService('error', 'background-agent-service', `Failed to start background agent: ${instance.config.name}`, { 
        agentId, 
        error: error.message 
      });

      this.emit('agent-error', instance, error);
      throw error;
    }
  }

  /**
   * Stop a background agent
   */
  public async stopAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Background agent not found: ${agentId}`);
    }

    if (instance.status === BackgroundAgentStatus.STOPPED) {
      await logger.logService('warn', 'background-agent-service', `Agent ${agentId} is already stopped`);
      return;
    }

    try {
      instance.status = BackgroundAgentStatus.STOPPING;
      this.emit('agent-stopping', instance);

      // Stop agent-specific functionality
      await this.stopAgentFunctionality(instance);

      // Cleanup event listeners
      this.cleanupAgentEventListeners(instance);

      // Cleanup agent instance
      if (instance.agent) {
        await instance.agent.cleanup();
        instance.agent = undefined;
      }

      instance.status = BackgroundAgentStatus.STOPPED;
      instance.startTime = undefined;

      await logger.logService('info', 'background-agent-service', `Stopped background agent: ${instance.config.name}`, { agentId });

      this.emit('agent-stopped', instance);

    } catch (error: any) {
      instance.status = BackgroundAgentStatus.ERROR;
      instance.lastError = error.message;
      instance.errorCount++;

      await logger.logService('error', 'background-agent-service', `Failed to stop background agent: ${instance.config.name}`, { 
        agentId, 
        error: error.message 
      });

      this.emit('agent-error', instance, error);
      throw error;
    }
  }

  /**
   * Pause a background agent
   */
  public async pauseAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Background agent not found: ${agentId}`);
    }

    if (instance.status !== BackgroundAgentStatus.RUNNING) {
      throw new Error(`Cannot pause agent in status: ${instance.status}`);
    }

    instance.status = BackgroundAgentStatus.PAUSED;
    await this.stopAgentFunctionality(instance);

    await logger.logService('info', 'background-agent-service', `Paused background agent: ${instance.config.name}`, { agentId });
    this.emit('agent-paused', instance);
  }

  /**
   * Resume a background agent
   */
  public async resumeAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Background agent not found: ${agentId}`);
    }

    if (instance.status !== BackgroundAgentStatus.PAUSED) {
      throw new Error(`Cannot resume agent in status: ${instance.status}`);
    }

    instance.status = BackgroundAgentStatus.RUNNING;
    await this.startAgentFunctionality(instance);

    await logger.logService('info', 'background-agent-service', `Resumed background agent: ${instance.config.name}`, { agentId });
    this.emit('agent-resumed', instance);
  }

  /**
   * Delete a background agent
   */
  public async deleteAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Background agent not found: ${agentId}`);
    }

    // Stop agent if running
    if (instance.status === BackgroundAgentStatus.RUNNING) {
      await this.stopAgent(agentId);
    }

    this.agents.delete(agentId);
    await this.saveConfigurations();

    await logger.logService('info', 'background-agent-service', `Deleted background agent: ${instance.config.name}`, { agentId });
    this.emit('agent-deleted', instance);
  }

  /**
   * Get all background agents
   */
  public getAgents(): BackgroundAgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get a specific background agent
   */
  public getAgent(agentId: string): BackgroundAgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get agents by type
   */
  public getAgentsByType(type: BackgroundAgentType): BackgroundAgentInstance[] {
    return Array.from(this.agents.values()).filter(agent => agent.config.type === type);
  }

  /**
   * Get running agents
   */
  public getRunningAgents(): BackgroundAgentInstance[] {
    return Array.from(this.agents.values()).filter(agent => agent.status === BackgroundAgentStatus.RUNNING);
  }

  /**
   * Queue a task for a background agent
   */
  public async queueTask(agentId: string, task: Omit<BackgroundAgentTask, 'id' | 'agentId' | 'createdAt' | 'status'>): Promise<BackgroundAgentTask> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Background agent not found: ${agentId}`);
    }

    const fullTask: BackgroundAgentTask = {
      id: nanoid(),
      agentId,
      createdAt: new Date(),
      status: 'pending',
      ...task
    };

    this.taskQueue.push(fullTask);
    this.emit('task-queued', fullTask);

    await logger.logService('info', 'background-agent-service', `Queued task for agent: ${instance.config.name}`, { 
      agentId, 
      taskId: fullTask.id,
      taskType: fullTask.type 
    });

    return fullTask;
  }

  /**
   * Get task queue
   */
  public getTaskQueue(): BackgroundAgentTask[] {
    return [...this.taskQueue];
  }

  /**
   * Get tasks for a specific agent
   */
  public getTasksForAgent(agentId: string): BackgroundAgentTask[] {
    return this.taskQueue.filter(task => task.agentId === agentId);
  }

  /**
   * Start all enabled agents
   */
  public async startAllAgents(): Promise<void> {
    const enabledAgents = Array.from(this.agents.values()).filter(agent => agent.config.enabled);
    
    await logger.logService('info', 'background-agent-service', `Starting ${enabledAgents.length} enabled agents`);

    for (const agent of enabledAgents) {
      try {
        await this.startAgent(agent.id);
      } catch (error: any) {
        await logger.logService('error', 'background-agent-service', `Failed to start agent: ${agent.config.name}`, { 
          agentId: agent.id, 
          error: error.message 
        });
      }
    }
  }

  /**
   * Stop all agents
   */
  public async stopAllAgents(): Promise<void> {
    const runningAgents = this.getRunningAgents();
    
    await logger.logService('info', 'background-agent-service', `Stopping ${runningAgents.length} running agents`);

    for (const agent of runningAgents) {
      try {
        await this.stopAgent(agent.id);
      } catch (error: any) {
        await logger.logService('error', 'background-agent-service', `Failed to stop agent: ${agent.config.name}`, { 
          agentId: agent.id, 
          error: error.message 
        });
      }
    }
  }

  /**
   * Shutdown the service
   */
  public async shutdown(): Promise<void> {
    await logger.logService('info', 'background-agent-service', 'Shutting down background agent service');

    this.isRunning = false;
    await this.stopAllAgents();
    await this.saveConfigurations();

    await logger.logService('info', 'background-agent-service', 'Background agent service shut down');
  }

  // Private methods

  private setupEventHandlers(): void {
    // Handle process termination
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private async loadConfigurations(): Promise<void> {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const configs: BackgroundAgentConfig[] = JSON.parse(data);

        for (const config of configs) {
          const instance: BackgroundAgentInstance = {
            id: config.id,
            config,
            status: BackgroundAgentStatus.STOPPED,
            taskCount: 0,
            errorCount: 0,
            eventListeners: new Map()
          };

          this.agents.set(config.id, instance);
        }

        await logger.logService('info', 'background-agent-service', `Loaded ${configs.length} background agent configurations`);
      }
    } catch (error: any) {
      await logger.logService('error', 'background-agent-service', 'Failed to load configurations', { error: error.message });
    }
  }

  private async saveConfigurations(): Promise<void> {
    try {
      const configs = Array.from(this.agents.values()).map(instance => instance.config);
      
      // Ensure directory exists
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(configs, null, 2));
      
      await logger.logService('debug', 'background-agent-service', `Saved ${configs.length} background agent configurations`);
    } catch (error: any) {
      await logger.logService('error', 'background-agent-service', 'Failed to save configurations', { error: error.message });
    }
  }

  private async startEnabledAgents(): Promise<void> {
    const autoStartAgents = Array.from(this.agents.values()).filter(agent => 
      agent.config.enabled && agent.config.autoStart !== false
    );

    for (const agent of autoStartAgents) {
      try {
        await this.startAgent(agent.id);
      } catch (error: any) {
        await logger.logService('error', 'background-agent-service', `Failed to auto-start agent: ${agent.config.name}`, { 
          agentId: agent.id, 
          error: error.message 
        });
      }
    }
  }

  private setupAgentEventListeners(instance: BackgroundAgentInstance): void {
    if (!instance.agent) return;

    // Listen for agent events
    const onTaskStart = (task: any) => {
      instance.taskCount++;
      instance.lastActivity = new Date();
      this.emit('agent-task-start', instance, task);
    };

    const onTaskComplete = (task: any, result: any) => {
      instance.lastActivity = new Date();
      this.emit('agent-task-complete', instance, task, result);
    };

    const onTaskError = (task: any, error: any) => {
      instance.errorCount++;
      instance.lastError = error.message;
      this.emit('agent-task-error', instance, task, error);
    };

    instance.eventListeners.set('task-start', onTaskStart);
    instance.eventListeners.set('task-complete', onTaskComplete);
    instance.eventListeners.set('task-error', onTaskError);

    // Add listeners to agent
    instance.agent.on('task_execution_started', onTaskStart);
    instance.agent.on('task_execution_completed', onTaskComplete);
    instance.agent.on('task_execution_error', onTaskError);
  }

  private cleanupAgentEventListeners(instance: BackgroundAgentInstance): void {
    if (!instance.agent) return;

    // Remove all event listeners
    for (const [event, listener] of instance.eventListeners) {
      instance.agent.off(event, listener);
    }

    instance.eventListeners.clear();
  }

  private async startAgentFunctionality(instance: BackgroundAgentInstance): Promise<void> {
    const { type, interval = 60000 } = instance.config;

    switch (type) {
      case BackgroundAgentType.FILE_WATCHER:
        await this.startFileWatcher(instance);
        break;
      case BackgroundAgentType.CODE_ANALYZER:
        await this.startCodeAnalyzer(instance);
        break;
      case BackgroundAgentType.DEPENDENCY_MONITOR:
        await this.startDependencyMonitor(instance);
        break;
      case BackgroundAgentType.SECURITY_SCANNER:
        await this.startSecurityScanner(instance);
        break;
      case BackgroundAgentType.PERFORMANCE_MONITOR:
        await this.startPerformanceMonitor(instance);
        break;
      case BackgroundAgentType.DOCUMENTATION_GENERATOR:
        await this.startDocumentationGenerator(instance);
        break;
      case BackgroundAgentType.TEST_RUNNER:
        await this.startTestRunner(instance);
        break;
      case BackgroundAgentType.BUILD_MONITOR:
        await this.startBuildMonitor(instance);
        break;
      default:
        throw new Error(`Unknown background agent type: ${type}`);
    }

    // Start interval-based tasks if configured
    if (interval > 0) {
      instance.intervalId = setInterval(async () => {
        try {
          await this.executeIntervalTask(instance);
        } catch (error: any) {
          await logger.logService('error', 'background-agent-service', `Interval task failed for agent: ${instance.config.name}`, { 
            agentId: instance.id, 
            error: error.message 
          });
        }
      }, interval);
    }
  }

  private async stopAgentFunctionality(instance: BackgroundAgentInstance): Promise<void> {
    // Clear interval
    if (instance.intervalId) {
      clearInterval(instance.intervalId);
      instance.intervalId = undefined;
    }

    // Stop type-specific functionality
    const { type } = instance.config;

    switch (type) {
      case BackgroundAgentType.FILE_WATCHER:
        await this.stopFileWatcher(instance);
        break;
      case BackgroundAgentType.CODE_ANALYZER:
        await this.stopCodeAnalyzer(instance);
        break;
      case BackgroundAgentType.DEPENDENCY_MONITOR:
        await this.stopDependencyMonitor(instance);
        break;
      case BackgroundAgentType.SECURITY_SCANNER:
        await this.stopSecurityScanner(instance);
        break;
      case BackgroundAgentType.PERFORMANCE_MONITOR:
        await this.stopPerformanceMonitor(instance);
        break;
      case BackgroundAgentType.DOCUMENTATION_GENERATOR:
        await this.stopDocumentationGenerator(instance);
        break;
      case BackgroundAgentType.TEST_RUNNER:
        await this.stopTestRunner(instance);
        break;
      case BackgroundAgentType.BUILD_MONITOR:
        await this.stopBuildMonitor(instance);
        break;
    }
  }

  private async executeIntervalTask(instance: BackgroundAgentInstance): Promise<void> {
    if (!instance.agent || instance.status !== BackgroundAgentStatus.RUNNING) {
      return;
    }

    const { type } = instance.config;

    switch (type) {
      case BackgroundAgentType.CODE_ANALYZER:
        await this.runCodeAnalysis(instance);
        break;
      case BackgroundAgentType.DEPENDENCY_MONITOR:
        await this.checkDependencies(instance);
        break;
      case BackgroundAgentType.SECURITY_SCANNER:
        await this.runSecurityScan(instance);
        break;
      case BackgroundAgentType.PERFORMANCE_MONITOR:
        await this.runPerformanceCheck(instance);
        break;
      case BackgroundAgentType.DOCUMENTATION_GENERATOR:
        await this.updateDocumentation(instance);
        break;
      case BackgroundAgentType.TEST_RUNNER:
        await this.runTests(instance);
        break;
      case BackgroundAgentType.BUILD_MONITOR:
        await this.checkBuildStatus(instance);
        break;
    }
  }

  // Agent-specific implementation methods
  private async startFileWatcher(instance: BackgroundAgentInstance): Promise<void> {
    if (!instance.agent) return;

    const { FileWatcherAgent } = await import('../automation/agents/background-agents/file-watcher-agent');
    const fileWatcher = new FileWatcherAgent(instance, instance.agent);
    
    // Store the specific agent instance for cleanup
    (instance as any).specificAgent = fileWatcher;
    
    await fileWatcher.start();
    await logger.logService('info', 'background-agent-service', `Started file watcher for agent: ${instance.config.name}`);
  }

  private async stopFileWatcher(instance: BackgroundAgentInstance): Promise<void> {
    const fileWatcher = (instance as any).specificAgent;
    if (fileWatcher) {
      await fileWatcher.stop();
      (instance as any).specificAgent = undefined;
    }
    await logger.logService('info', 'background-agent-service', `Stopped file watcher for agent: ${instance.config.name}`);
  }

  private async startCodeAnalyzer(instance: BackgroundAgentInstance): Promise<void> {
    if (!instance.agent) return;

    const { CodeAnalyzerAgent } = await import('../automation/agents/background-agents/code-analyzer-agent');
    const codeAnalyzer = new CodeAnalyzerAgent(instance, instance.agent);
    
    // Store the specific agent instance for cleanup
    (instance as any).specificAgent = codeAnalyzer;
    
    await codeAnalyzer.start();
    await logger.logService('info', 'background-agent-service', `Started code analyzer for agent: ${instance.config.name}`);
  }

  private async stopCodeAnalyzer(instance: BackgroundAgentInstance): Promise<void> {
    const codeAnalyzer = (instance as any).specificAgent;
    if (codeAnalyzer) {
      await codeAnalyzer.stop();
      (instance as any).specificAgent = undefined;
    }
    await logger.logService('info', 'background-agent-service', `Stopped code analyzer for agent: ${instance.config.name}`);
  }

  private async startDependencyMonitor(instance: BackgroundAgentInstance): Promise<void> {
    if (!instance.agent) return;

    const { DependencyMonitorAgent } = await import('../automation/agents/background-agents/dependency-monitor-agent');
    const dependencyMonitor = new DependencyMonitorAgent(instance, instance.agent);
    
    // Store the specific agent instance for cleanup
    (instance as any).specificAgent = dependencyMonitor;
    
    await dependencyMonitor.start();
    await logger.logService('info', 'background-agent-service', `Started dependency monitor for agent: ${instance.config.name}`);
  }

  private async stopDependencyMonitor(instance: BackgroundAgentInstance): Promise<void> {
    const dependencyMonitor = (instance as any).specificAgent;
    if (dependencyMonitor) {
      await dependencyMonitor.stop();
      (instance as any).specificAgent = undefined;
    }
    await logger.logService('info', 'background-agent-service', `Stopped dependency monitor for agent: ${instance.config.name}`);
  }

  private async startSecurityScanner(instance: BackgroundAgentInstance): Promise<void> {
    if (!instance.agent) return;

    const { SecurityScannerAgent } = await import('../automation/agents/background-agents/security-scanner-agent');
    const securityScanner = new SecurityScannerAgent(instance, instance.agent);
    
    // Store the specific agent instance for cleanup
    (instance as any).specificAgent = securityScanner;
    
    await securityScanner.start();
    await logger.logService('info', 'background-agent-service', `Started security scanner for agent: ${instance.config.name}`);
  }

  private async stopSecurityScanner(instance: BackgroundAgentInstance): Promise<void> {
    const securityScanner = (instance as any).specificAgent;
    if (securityScanner) {
      await securityScanner.stop();
      (instance as any).specificAgent = undefined;
    }
    await logger.logService('info', 'background-agent-service', `Stopped security scanner for agent: ${instance.config.name}`);
  }

  private async startPerformanceMonitor(instance: BackgroundAgentInstance): Promise<void> {
    // TODO: Implement performance monitor setup
    await logger.logService('info', 'background-agent-service', `Started performance monitor for agent: ${instance.config.name}`);
  }

  private async stopPerformanceMonitor(instance: BackgroundAgentInstance): Promise<void> {
    // TODO: Implement performance monitor cleanup
    await logger.logService('info', 'background-agent-service', `Stopped performance monitor for agent: ${instance.config.name}`);
  }

  private async startDocumentationGenerator(instance: BackgroundAgentInstance): Promise<void> {
    // TODO: Implement documentation generator setup
    await logger.logService('info', 'background-agent-service', `Started documentation generator for agent: ${instance.config.name}`);
  }

  private async stopDocumentationGenerator(instance: BackgroundAgentInstance): Promise<void> {
    // TODO: Implement documentation generator cleanup
    await logger.logService('info', 'background-agent-service', `Stopped documentation generator for agent: ${instance.config.name}`);
  }

  private async startTestRunner(instance: BackgroundAgentInstance): Promise<void> {
    // TODO: Implement test runner setup
    await logger.logService('info', 'background-agent-service', `Started test runner for agent: ${instance.config.name}`);
  }

  private async stopTestRunner(instance: BackgroundAgentInstance): Promise<void> {
    // TODO: Implement test runner cleanup
    await logger.logService('info', 'background-agent-service', `Stopped test runner for agent: ${instance.config.name}`);
  }

  private async startBuildMonitor(instance: BackgroundAgentInstance): Promise<void> {
    // TODO: Implement build monitor setup
    await logger.logService('info', 'background-agent-service', `Started build monitor for agent: ${instance.config.name}`);
  }

  private async stopBuildMonitor(instance: BackgroundAgentInstance): Promise<void> {
    // TODO: Implement build monitor cleanup
    await logger.logService('info', 'background-agent-service', `Stopped build monitor for agent: ${instance.config.name}`);
  }

  // Task execution methods
  private async runCodeAnalysis(instance: BackgroundAgentInstance): Promise<void> {
    const codeAnalyzer = (instance as any).specificAgent;
    if (codeAnalyzer && typeof codeAnalyzer.analyzeFile === 'function') {
      // Queue all code files for analysis
      const { glob } = await import('globby');
      const codeFiles = await glob(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], {
        cwd: instance.config.workingDirectory,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
      });
      
      for (const file of codeFiles.slice(0, 5)) { // Limit to 5 files per interval
        await codeAnalyzer.queueFile(file);
      }
    }
    await logger.logService('debug', 'background-agent-service', `Running code analysis for agent: ${instance.config.name}`);
  }

  private async checkDependencies(instance: BackgroundAgentInstance): Promise<void> {
    const dependencyMonitor = (instance as any).specificAgent;
    if (dependencyMonitor && typeof dependencyMonitor.checkDependencies === 'function') {
      await dependencyMonitor.checkDependencies();
    }
    await logger.logService('debug', 'background-agent-service', `Checking dependencies for agent: ${instance.config.name}`);
  }

  private async runSecurityScan(instance: BackgroundAgentInstance): Promise<void> {
    const securityScanner = (instance as any).specificAgent;
    if (securityScanner && typeof securityScanner.queueFile === 'function') {
      // Queue critical files for security scan
      const { glob } = await import('globby');
      const criticalFiles = await glob(['**/*.ts', '**/*.js', '**/*.json'], {
        cwd: instance.config.workingDirectory,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
      });
      
      for (const file of criticalFiles.slice(0, 3)) { // Limit to 3 files per interval
        await securityScanner.queueFile(file);
      }
    }
    await logger.logService('debug', 'background-agent-service', `Running security scan for agent: ${instance.config.name}`);
  }

  private async runPerformanceCheck(instance: BackgroundAgentInstance): Promise<void> {
    // TODO: Implement performance check task
    await logger.logService('debug', 'background-agent-service', `Running performance check for agent: ${instance.config.name}`);
  }

  private async updateDocumentation(instance: BackgroundAgentInstance): Promise<void> {
    // TODO: Implement documentation update task
    await logger.logService('debug', 'background-agent-service', `Updating documentation for agent: ${instance.config.name}`);
  }

  private async runTests(instance: BackgroundAgentInstance): Promise<void> {
    // TODO: Implement test run task
    await logger.logService('debug', 'background-agent-service', `Running tests for agent: ${instance.config.name}`);
  }

  private async checkBuildStatus(instance: BackgroundAgentInstance): Promise<void> {
    // TODO: Implement build status check task
    await logger.logService('debug', 'background-agent-service', `Checking build status for agent: ${instance.config.name}`);
  }
}

// Export singleton instance
export const backgroundAgentService = BackgroundAgentService.getInstance();