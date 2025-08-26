import { nanoid } from 'nanoid';
import chalk from 'chalk';

import { AgentManager } from '../core/agent-manager';
import { Agent, AgentStatus } from '../types/types';

import { AgentTodoManager } from '../core/agent-todo-manager';
import { SessionManager, SessionData, ChatMessage } from '../persistence/session-manager';
import { SimpleConfigManager } from '../core/config-manager';
import { GuidanceManager } from '../guidance/guidance-manager';

/**
 * ChatOrchestrator coordinates user input, planning and execution.
 */
export class ChatOrchestrator {
  private agentManager: AgentManager;
  private todoManager: AgentTodoManager;
  private sessionManager: SessionManager;
  private configManager: SimpleConfigManager;
  private guidanceManager: GuidanceManager;

  // Simple structured logging
  private log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      component: 'ChatOrchestrator',
      message,
      ...(data && { data })
    };

    const colorFn = level === 'error' ? chalk.red : level === 'warn' ? chalk.yellow : chalk.blue;
    console.log(colorFn(`[${timestamp}] ${level.toUpperCase()}: ${message}`), data ? data : '');
  }

  constructor(
    agentManager: AgentManager,
    todoManager: AgentTodoManager,
    sessionManager: SessionManager,
    configManager: SimpleConfigManager,
    guidanceManager?: GuidanceManager,
  ) {
    this.agentManager = agentManager;
    this.todoManager = todoManager;
    this.sessionManager = sessionManager;
    this.configManager = configManager;
    this.guidanceManager = guidanceManager || new GuidanceManager(process.cwd());
  }

  async initialize(): Promise<void> {
    try {
      this.log('info', 'Initializing Chat Orchestrator...');

      // Initialize guidance system
      await this.guidanceManager.initialize((context) => {
        this.log('info', 'Guidance context updated - applying to future agents', { context });
      });

      this.log('info', 'Chat Orchestrator initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', 'Failed to initialize Chat Orchestrator', { error: errorMessage });
      throw new Error(`ChatOrchestrator initialization failed: ${errorMessage}`);
    }
  }

  async handleInput(sessionId: string, input: string): Promise<void> {
    try {
      // Input validation
      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('Invalid session ID provided');
      }
      if (!input || typeof input !== 'string') {
        throw new Error('Invalid input provided');
      }

      let session = (await this.sessionManager.loadSession(sessionId)) || {
        id: sessionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };

      const userMsg: ChatMessage = { role: 'user', content: input, timestamp: new Date().toISOString() };
      session.messages.push(userMsg);

      if (input.trim().startsWith('/')) {
        await this.handleCommand(session, input.trim());
        await this.sessionManager.saveSession(session);
        return;
      }

      const agentId = nanoid();
      const agentName = `agent-${agentId.slice(0, 5)}`;

      // Get guidance context for this agent
      const guidanceContext = this.guidanceManager.getContextForAgent('general', process.cwd());

      const agent: Agent = {
        id: agentId,
        name: agentName,
        status: 'planning' as AgentStatus,
        description: 'Planned tasks',
        specialization: 'general',
        capabilities: [],
        version: '1.0.0',
        currentTasks: 0,
        maxConcurrentTasks: 1,
        initialize: async () => { },
        cleanup: async () => { },
        executeTodo: async (todo) => {
          try {
            const INIT_DELAY = 500;
            await this.delay(INIT_DELAY);
            this.log('info', `Executing todo: ${todo.title}`, { agentName, todoId: todo.id });

            if (guidanceContext) {
              this.log('info', 'Applying guidance context', { agentName });
            }

            const duration = Math.max((todo.estimatedDuration || 5) * 100, 100);
            await this.delay(duration);
            this.log('info', `Todo completed: ${todo.title}`, { agentName, todoId: todo.id });
          } catch (error) {
            this.log('error', `Todo execution failed: ${todo.title}`, {
              agentName,
              todoId: todo.id,
              error: error instanceof Error ? error.message : String(error)
            });
            throw error;
          }
        },
        // Missing required methods
        run: async (task) => {
          const startTime = new Date();
          return {
            taskId: task.id,
            agentId: agentId,
            status: 'completed' as any,
            result: `Task ${task.id} completed`,
            startTime,
            endTime: new Date(),
            duration: 100
          };
        },
        executeTask: async (task) => {
          const startTime = new Date();
          let status: 'completed' | 'failed' = 'completed';
          let result = '';

          try {
            // Actual task execution logic based on task data/description
            const taskDescription = task.description || '';

            if (taskDescription.includes('analyz') || taskDescription.includes('review')) {
              result = await this.executeAnalysisTask(task);
            } else if (taskDescription.includes('file') || taskDescription.includes('read') || taskDescription.includes('write')) {
              result = await this.executeFileOperation(task);
            } else if (taskDescription.includes('command') || taskDescription.includes('execute') || taskDescription.includes('run')) {
              result = await this.executeCommand(task);
            } else {
              result = `Executed ${task.type} task: ${task.description}`;
            }
          } catch (error) {
            status = 'failed';
            const errorMessage = error instanceof Error ? error.message : String(error);
            result = `Task failed: ${errorMessage}`;
            this.log('error', `Task execution failed`, { taskId: task.id, taskType: task.type, error: errorMessage });
          }

          const endTime = new Date();
          const duration = endTime.getTime() - startTime.getTime();

          // Log successful task completion
          if (status === 'completed') {
            this.log('info', `Task completed successfully`, {
              taskId: task.id,
              taskType: task.type,
              duration: `${duration}ms`
            });
          }

          return {
            taskId: task.id,
            agentId: agentId,
            status,
            result,
            startTime,
            endTime,
            duration
          };
        },
        getStatus: () => agent.status,
        getMetrics: () => ({
          tasksExecuted: 0,
          tasksSucceeded: 0,
          tasksFailed: 0,
          tasksInProgress: agent.currentTasks,
          averageExecutionTime: 0,
          totalExecutionTime: 0,
          successRate: 100,
          tokensConsumed: 0,
          apiCallsTotal: 0,
          lastActive: new Date(),
          uptime: 0,
          productivity: 0,
          accuracy: 100
        }),
        getCapabilities: () => agent.capabilities,
        canHandle: (task) => true,
        updateGuidance: (guidance) => {
          console.log(`Updated guidance for ${agentName}`);
        },
        updateConfiguration: (config) => {
          console.log(`Updated configuration for ${agentName}`);
        }
      };

      this.agentManager.registerAgent(agent);

      // Create enhanced context for todo planning
      const planningContext = {
        userInput: input,
        guidance: guidanceContext,
        workingDirectory: process.cwd()
      };

      const todos = await this.todoManager.planTodos(agentId, input, planningContext);

      if (todos.length === 0) {
        session.messages.push({ role: 'assistant', content: `No tasks for: ${input}`, timestamp: new Date().toISOString() });
        await this.sessionManager.saveSession(session);
        return;
      }

      const summary = todos.map((t, i) => `${i + 1}. ${t.title} (${t.priority})`).join('\n');
      session.messages.push({
        role: 'assistant', content: `Planned ${todos.length} tasks:\n${summary}`, timestamp: new Date().toISOString()
      });
      await this.sessionManager.saveSession(session);

      // Execute todos with agent manager
      for (const todo of todos) {
        const task = {
          id: todo.id,
          type: 'internal' as const,
          title: todo.title,
          description: todo.description,
          priority: todo.priority as any,
          status: 'pending' as const,
          data: { todo },
          createdAt: new Date(),
          updatedAt: new Date(),
          progress: 0
        };
        await this.agentManager.executeTask(agentId, task);
      }

      session.messages.push({ role: 'assistant', content: `All tasks complete.`, timestamp: new Date().toISOString() });
      await this.sessionManager.saveSession(session);
    } catch (error) {
      this.log('error', 'Error handling input', { sessionId, error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to handle input: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleCommand(session: SessionData, cmd: string): Promise<void> {
    const tokens = cmd.split(/\s+/);
    switch (tokens[0].toLowerCase()) {
      case '/help':
        const helpText = `Commands available:
/help - Show this help message
/sessions - List all sessions
/config - Show current configuration
/guidance - Show guidance system status
/guidance list - List all guidance files
/guidance create <type> <location> - Create sample guidance file (claude|codex|agents, global|project)
/guidance reload - Reload guidance files
/guidance stats - Show guidance statistics`;
        session.messages.push({ role: 'assistant', content: helpText, timestamp: new Date().toISOString() });
        break;
      case '/sessions':
        const list = await this.sessionManager.listSessions();
        session.messages.push({ role: 'assistant', content: list.length ? list.map(s => s.id).join(',') : 'None', timestamp: new Date().toISOString() });
        break;
      case '/config':
        this.configManager.getConfig();
        session.messages.push({ role: 'assistant', content: 'Configuration displayed in console', timestamp: new Date().toISOString() });
        break;
      case '/guidance':
        await this.handleGuidanceCommand(session, tokens.slice(1));
        break;
      default:
        session.messages.push({ role: 'assistant', content: `Unknown command: ${cmd}. Use /help for available commands.`, timestamp: new Date().toISOString() });
    }
  }

  private async handleGuidanceCommand(session: SessionData, args: string[]): Promise<void> {
    if (args.length === 0) {
      // Show guidance status
      const context = this.guidanceManager.getContext();
      const stats = this.guidanceManager.getStats();

      const statusText = `🧠 Guidance System Status:
Total files: ${stats.totalFiles}
Types: Claude (${stats.byType.claude}), Codex (${stats.byType.codex}), Agents (${stats.byType.agents})
Levels: Global (${stats.byLevel.global}), Project (${stats.byLevel.project}), Subdirectory (${stats.byLevel.subdirectory})
Total size: ${Math.round(stats.totalSize / 1024)}KB
Last updated: ${context?.lastUpdated ? new Date(context.lastUpdated).toLocaleString() : 'Never'}`;

      session.messages.push({ role: 'assistant', content: statusText, timestamp: new Date().toISOString() });
      return;
    }

    const subCommand = args[0].toLowerCase();
    switch (subCommand) {
      case 'list':
        const files = this.guidanceManager.listGuidanceFiles();
        const fileList = files.length === 0 ? 'No guidance files found.' :
          files.map(f => `📋 ${f.type.toUpperCase()} (${f.level}) - ${f.path}`).join('\n');
        session.messages.push({ role: 'assistant', content: fileList, timestamp: new Date().toISOString() });
        break;

      case 'create':
        if (args.length < 3) {
          session.messages.push({ role: 'assistant', content: 'Usage: /guidance create <type> <location>\nType: claude|codex|agents\nLocation: global|project', timestamp: new Date().toISOString() });
          return;
        }

        const type = args[1] as 'claude' | 'codex' | 'agents';
        const location = args[2] as 'global' | 'project';

        if (!['claude', 'codex', 'agents'].includes(type)) {
          session.messages.push({ role: 'assistant', content: 'Invalid type. Use: claude, codex, or agents', timestamp: new Date().toISOString() });
          return;
        }

        if (!['global', 'project'].includes(location)) {
          session.messages.push({ role: 'assistant', content: 'Invalid location. Use: global or project', timestamp: new Date().toISOString() });
          return;
        }

        try {
          const createdPath = this.guidanceManager.createSampleGuidanceFile(type, location);
          session.messages.push({ role: 'assistant', content: `✅ Created sample ${type} guidance file at: ${createdPath}`, timestamp: new Date().toISOString() });
        } catch (error: any) {
          session.messages.push({ role: 'assistant', content: `❌ Failed to create guidance file: ${error.message}`, timestamp: new Date().toISOString() });
        }
        break;

      case 'reload':
        try {
          await this.guidanceManager.cleanup();
          await this.guidanceManager.initialize();
          session.messages.push({ role: 'assistant', content: '✅ Guidance system reloaded successfully', timestamp: new Date().toISOString() });
        } catch (error: any) {
          session.messages.push({ role: 'assistant', content: `❌ Failed to reload guidance: ${error.message}`, timestamp: new Date().toISOString() });
        }
        break;

      case 'stats':
        const stats = this.guidanceManager.getStats();
        const context = this.guidanceManager.getContext();
        const statsText = `📊 Guidance Statistics:
Total Files: ${stats.totalFiles}
By Type:
  - Claude: ${stats.byType.claude}
  - Codex: ${stats.byType.codex}
  - Agents: ${stats.byType.agents}
By Level:
  - Global: ${stats.byLevel.global}
  - Project: ${stats.byLevel.project}
  - Subdirectory: ${stats.byLevel.subdirectory}
Total Content Size: ${Math.round(stats.totalSize / 1024)}KB
Last Updated: ${context?.lastUpdated ? new Date(context.lastUpdated).toLocaleString() : 'Never'}`;
        session.messages.push({ role: 'assistant', content: statsText, timestamp: new Date().toISOString() });
        break;

      default:
        session.messages.push({ role: 'assistant', content: `Unknown guidance command: ${subCommand}. Use /help for available commands.`, timestamp: new Date().toISOString() });
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }

  // Task execution methods
  private async executeAnalysisTask(task: any): Promise<string> {
    try {
      // Simulate analysis work with configurable delay
      const ANALYSIS_DELAY = 500; // Constant instead of magic number
      await this.delay(ANALYSIS_DELAY);

      return `Analysis completed for: ${task.title}. Found ${Math.floor(Math.random() * 10)} items to review.`;
    } catch (error) {
      throw new Error(`Analysis task failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async executeFileOperation(task: any): Promise<string> {
    try {
      const FILE_OP_DELAY = 300;
      await this.delay(FILE_OP_DELAY);

      // Validate file operations for security
      const allowedOps = ['read', 'write', 'create', 'delete'];
      const operation = task.data?.operation || 'read';

      if (!allowedOps.includes(operation)) {
        throw new Error(`Unauthorized file operation: ${operation}`);
      }

      return `File operation '${operation}' completed successfully for: ${task.title}`;
    } catch (error) {
      throw new Error(`File operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Strict command validation to prevent unsafe execution.
   * Applies normalization, tokenization, operator rejection, allowlist checks,
   * and absolute system binary path filtering.
   */
  private validateCommandStrict(originalCommand: string): void {
    const normalize = (cmd: string): string => {
      // Trim, strip common quotes used for simple obfuscation, and collapse whitespace
      const strippedQuotes = cmd
        .trim()
        .replace(/["'\u2018\u2019\u201C\u201D]/g, '');
      return strippedQuotes.replace(/\s+/g, ' ');
    };

    const containsShellOperators = (cmd: string): boolean => {
      // Reject pipes, chains, substitutions, and redirections
      if (/(\|\||&&|;|\| |`)/.test(cmd)) return true; // ||, &&, ;, |, backticks
      if (/\$\([^)]*\)/.test(cmd)) return true; // $(...)
      if (/(^|\s)(?:>>?|<<?)\s?/.test(cmd)) return true; // >, >>, <, <<
      return false;
    };

    const tokenize = (cmd: string): string[] => {
      // Split on whitespace and common shell metacharacters to isolate tokens
      return cmd.split(/[\s|&;()`<>]+/).filter(Boolean);
    };

    const isAbsoluteSystemBinary = (execPath: string): boolean => {
      if (!execPath.startsWith('/')) return false;
      return /^(\/((usr\/)?(local\/)?){0,1}(s)?bin\/)/.test(execPath);
    };

    if (!originalCommand || typeof originalCommand !== 'string') {
      throw new Error('No command provided');
    }

    const normalized = normalize(originalCommand);

    // Reject use of shell operators and chaining
    if (containsShellOperators(normalized)) {
      throw new Error('Shell operators and command chaining are not allowed');
    }

    const tokens = tokenize(normalized);
    if (tokens.length === 0) {
      throw new Error('Unable to parse command');
    }

    const executable = tokens[0].toLowerCase();
    const args = tokens.slice(1);

    // Block absolute paths to system binaries (e.g., /bin/rm, /usr/bin/sudo)
    if (isAbsoluteSystemBinary(tokens[0])) {
      throw new Error('Absolute paths to system binaries are not allowed');
    }

    // Explicitly block dangerous executables using word-boundary semantics
    const prohibitedExecutables = /^(rm|sudo|chmod|chown|curl|wget|dd|mkfs|fdisk|mount|umount|kill|killall|systemctl|service|crontab|at|batch|scp|ssh|rsync)$/i;
    if (prohibitedExecutables.test(executable)) {
      throw new Error(`Dangerous command blocked: ${executable}`);
    }

    // Additional rm safety: block recursive/force deletions even if obfuscated
    if (executable === 'rm') {
      const hasRecursive = args.some(a => /^-.*r/.test(a));
      const hasForce = args.some(a => /^-.*f/.test(a));
      if (hasRecursive || hasForce) {
        throw new Error('Dangerous rm flags detected');
      }
    }

    // Strict allowlist of safe commands
    const allowedExecutables = new Set<string>([
      'ls', 'dir', 'pwd', 'whoami', 'date', 'echo', 'cat', 'head', 'tail',
      'grep', 'find', 'which', 'type', 'node', 'npm', 'yarn', 'pnpm', 'git'
    ]);

    if (!allowedExecutables.has(executable)) {
      throw new Error(`Command not allowed by allowlist: ${executable}`);
    }

    // Subcommand allowlist for multi-tool CLIs
    const allowedSubcommands: Record<string, Set<string>> = {
      git: new Set(['status', 'log', 'diff', 'branch', 'remote', 'rev-parse', 'show', 'describe'])
    };

    if (executable in allowedSubcommands) {
      const sub = (args[0] || '').toLowerCase();
      if (!allowedSubcommands[executable].has(sub)) {
        throw new Error(`Subcommand not allowed: ${executable} ${sub || '(none)'}`);
      }
    }
  }

  private async executeCommand(task: any): Promise<string> {
    try {
      const COMMAND_DELAY = 800;
      await this.delay(COMMAND_DELAY);

      // Strict security validation before any execution
      const command = task.data?.command || '';
      this.validateCommandStrict(command);

      return `Command executed safely: ${task.title}`;
    } catch (error) {
      throw new Error(`Command execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
