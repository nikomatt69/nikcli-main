import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { modelProvider, ChatMessage } from '../ai/model-provider';
import { approvalSystem } from '../ui/approval-system';
import { workspaceContext } from '../context/workspace-context';
import boxen from 'boxen';

export interface TodoItem {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  estimatedDuration: number; // minutes
  actualDuration?: number;
  dependencies: string[]; // other todo IDs
  tags: string[];
  commands?: string[];
  files?: string[];
  reasoning: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  complexity?: 'simple' | 'moderate' | 'complex';
  progress?: number; // 0-100
  errorMessage?: string;
  rollbackPlan?: string[];
}

export interface TodoPlan {
  id: string;
  title: string;
  description: string;
  goal: string;
  todos: TodoItem[];
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled';
  estimatedTotalDuration: number;
  actualTotalDuration?: number;
  createdAt: Date;
  approvedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  workingDirectory: string;
  context: {
    projectInfo?: any;
    selectedFiles?: string[];
    userRequirements?: string[];
  };
  riskAssessment?: {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: string[];
    mitigationStrategies: string[];
  };
  progress?: {
    completedSteps: number;
    totalSteps: number;
    percentage: number;
    currentStep?: string;
    estimatedTimeRemaining?: number;
  };
}

export interface PlanningOptions {
  maxTodos?: number;
  includeContext?: boolean;
  autoApprove?: boolean;
  showDetails?: boolean;
  saveTodoFile?: boolean;
  todoFilePath?: string;
}

export class EnhancedPlanningSystem {
  private activePlans: Map<string, TodoPlan> = new Map();
  private workingDirectory: string;
  private planHistory: TodoPlan[] = [];
  private executionStats: {
    totalPlans: number;
    successfulPlans: number;
    failedPlans: number;
    averageExecutionTime: number;
  } = {
      totalPlans: 0,
      successfulPlans: 0,
      failedPlans: 0,
      averageExecutionTime: 0,
    };

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
  }

  /**
   * Dynamic preflight per-todo: warn on missing resources and adapt todo metadata
   */
  private async preflightTodoResources(todo: TodoItem): Promise<void> {
    try {
      if (todo.files && todo.files.length > 0) {
        const verified: string[] = [];
        const missing: string[] = [];

        for (const f of todo.files) {
          try {
            const p = path.resolve(this.workingDirectory, f);
            const stat = await fs.stat(p);
            if (stat && (stat.isFile() || stat.isDirectory())) {
              verified.push(f);
            } else {
              missing.push(f);
            }
          } catch {
            missing.push(f);
          }
        }

        if (missing.length > 0) {
          console.log(chalk.yellow(`⚠️ Missing resources for this todo: ${missing.join(', ')}`));
          todo.files = verified;
          todo.tags = Array.from(new Set([...(todo.tags || []), 'adaptive']));
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * If the goal explicitly requests read-only analysis (e.g., mentions only grep/read),
   * filter out todos that create/modify files or execute commands, and keep only analysis/read tasks.
   */
  private applyReadOnlyConstraints(goal: string, todos: TodoItem[]): TodoItem[] {
    const lower = (goal || '').toLowerCase();
    const readOnlyRequested = lower.includes('solo grep') || lower.includes('solo read') ||
      (lower.includes('grep') && lower.includes('read') && (lower.includes('solo') || lower.includes('only')));

    if (!readOnlyRequested) return todos;

    // Whitelist categories and tags for read-only analysis
    const allowedCategories = new Set(['planning', 'analysis', 'testing', 'documentation']);
    const allowedTags = new Set(['grep', 'readfile', 'analysis', 'search', 'inspect']);

    // Filter todos: no commands, no files to modify, category/tag must be analysis-oriented
    let filtered = todos.filter(t => {
      const hasCommands = (t.commands && t.commands.length > 0);
      const hasFiles = (t.files && t.files.length > 0);
      const categoryOk = allowedCategories.has(t.category);
      const tagsOk = (t.tags || []).some(tag => allowedTags.has(tag));
      return !hasCommands && !hasFiles && (categoryOk || tagsOk);
    });

    // If everything got filtered, fall back to minimal read-only plan derived from original
    if (filtered.length === 0) {
      filtered = todos.map(t => ({
        ...t,
        commands: [],
        files: [],
        category: allowedCategories.has(t.category) ? t.category : 'analysis',
        tags: Array.from(new Set([...(t.tags || []), 'grep', 'readfile', 'analysis'])),
      }));
    }

    // Clean up dependencies: remove links to tasks that no longer exist
    const validIds = new Set(filtered.map(t => t.id));
    filtered = filtered.map(t => ({
      ...t,
      dependencies: (t.dependencies || []).filter(depId => validIds.has(depId))
    }));

    return filtered;
  }

  /**
   * Generate a comprehensive plan with enhanced analysis
   */
  async generatePlan(
    goal: string,
    options: PlanningOptions = {}
  ): Promise<TodoPlan> {
    const {
      maxTodos = 20,
      includeContext = true,
      showDetails = true,
      saveTodoFile = true,
      todoFilePath = 'todo.md'
    } = options;

    console.log(chalk.blue.bold(`\n🎯 Enhanced Planning Mode: ${goal}`));
    console.log(chalk.gray('═'.repeat(80)));

    // Get enhanced project context
    let projectContext = '';
    if (includeContext) {
      console.log(chalk.gray('📁 Analyzing project context...'));
      const context = workspaceContext.getContextForAgent('planner', 15);
      projectContext = context.projectSummary;
    }

    // Generate AI-powered plan with enhanced analysis
    console.log(chalk.gray('🧠 Generating comprehensive AI plan...'));
    let todos = await this.generateTodosWithAI(goal, projectContext, maxTodos);

    // Enforce read-only constraints if requested by the goal (no commands, no file writes)
    todos = this.applyReadOnlyConstraints(goal, todos);

    // Perform risk assessment
    const riskAssessment = this.performRiskAssessment(todos);

    // Create enhanced plan object
    const plan: TodoPlan = {
      id: nanoid(),
      title: this.extractPlanTitle(goal),
      description: goal,
      goal,
      todos,
      status: 'draft',
      estimatedTotalDuration: todos.reduce((sum, todo) => sum + todo.estimatedDuration, 0),
      createdAt: new Date(),
      workingDirectory: this.workingDirectory,
      context: {
        projectInfo: includeContext ? projectContext : undefined,
        userRequirements: [goal],
      },
      riskAssessment,
      progress: {
        completedSteps: 0,
        totalSteps: todos.length,
        percentage: 0,
      },
    };

    this.activePlans.set(plan.id, plan);
    this.planHistory.push(plan);

    // Show enhanced plan details
    if (showDetails) {
      this.displayEnhancedPlan(plan);
      await this.renderEnhancedTodosUI(plan);
    }

    // Save enhanced todo.md file
    if (saveTodoFile) {
      await this.saveEnhancedTodoFile(plan, todoFilePath);
    }

    return plan;
  }

  /**
   * Enhanced plan approval with detailed analysis
   */
  async requestPlanApproval(planId: string): Promise<boolean> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Build details for approval system
    const categories = Array.from(new Set(plan.todos.map(t => t.category).filter(Boolean)));
    const priorities: Record<string, number> = {};
    plan.todos.forEach(t => { priorities[t.priority] = (priorities[t.priority] || 0) + 1; });
    const dependencies = plan.todos.reduce((sum, t) => sum + (t.dependencies?.length || 0), 0);
    const affectedFiles = plan.todos.flatMap(t => t.files || []);
    const commands = plan.todos.flatMap(t => t.commands || []);
    const riskLevel = this.assessPlanRisk(plan);

    const approval = await approvalSystem.requestPlanApproval(
      plan.title,
      plan.description || plan.goal || '',
      {
        totalSteps: plan.todos.length,
        estimatedDuration: plan.estimatedTotalDuration,
        riskLevel,
        categories,
        priorities,
        dependencies,
        affectedFiles,
        commands,
      },
      {
        showBreakdown: true,
        allowModification: false,
        showTimeline: true,
      }
    );

    if (approval.approved) {
      plan.status = 'approved';
      plan.approvedAt = new Date();
      return true;
    }

    return false;
  }

  /**
   * Enhanced plan execution with progress tracking
   */
  async executePlan(planId: string): Promise<void> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    if (plan.status !== 'approved') {
      const approved = await this.requestPlanApproval(planId);
      if (!approved) {
        return;
      }
    }

    console.log(chalk.blue.bold(`\n🚀 Enhanced Plan Execution: ${plan.title}`));
    console.log(chalk.gray('═'.repeat(80)));

    plan.status = 'executing';
    plan.startedAt = new Date();

    try {
      // Execute todos with enhanced progress tracking
      const executionOrder = this.resolveDependencyOrder(plan.todos);
      let completedCount = 0;
      let failedCount = 0;

      for (const todo of executionOrder) {
        // Allow user interruption to cancel execution
        try {
          const nik = (global as any).__nikCLI;
          if (nik && nik.shouldInterrupt) {
            console.log(chalk.yellow('🛑 Execution interrupted by user'));
            plan.status = 'failed';
            return;
          }
        } catch { /* ignore */ }

        console.log(chalk.cyan(`\n📋 [${completedCount + 1}/${plan.todos.length}] ${todo.title}`));
        console.log(chalk.gray(`   ${todo.description}`));

        // Show risk level for current step
        if (todo.riskLevel) {
          const riskColor = this.getRiskColor(todo.riskLevel);
          console.log(chalk.gray(`   Risk Level: ${riskColor(todo.riskLevel.toUpperCase())}`));
        }

        todo.status = 'in_progress';
        todo.startedAt = new Date();

        try {
          // Execute the todo with per-step timeout based on estimate (min 2m, max 15m)
          const estimatedMs = (typeof todo.estimatedDuration === 'number' ? todo.estimatedDuration : 30) * 60000;
          const stepTimeoutMs = Math.max(120000, Math.min(900000, estimatedMs));

          const startTime = Date.now();
          await Promise.race([
            this.executeEnhancedTodo(todo, plan),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Todo execution timeout')), stepTimeoutMs))
          ]);
          const duration = Date.now() - startTime;

          todo.status = 'completed';
          todo.completedAt = new Date();
          todo.actualDuration = Math.round(duration / 60000);
          todo.progress = 100;

          console.log(chalk.green(`   ✅ Completed in ${Math.round(duration / 1000)}s`));
          completedCount++;

          // Update plan progress
          this.updatePlanProgress(plan, completedCount);

        } catch (error: any) {
          todo.status = 'failed';
          todo.errorMessage = error.message;
          failedCount++;

          console.log(chalk.red(`   ❌ Failed: ${error.message}`));

          // Show rollback options if available
          if (todo.rollbackPlan && todo.rollbackPlan.length > 0) {
            console.log(chalk.yellow(`   🔄 Rollback plan available: ${todo.rollbackPlan.length} steps`));
          }

          // Enhanced error recovery
          const shouldContinue = await this.handleExecutionError(todo, plan, completedCount);
          if (!shouldContinue) {
            console.log(chalk.yellow('🛑 Plan execution stopped by user'));
            plan.status = 'failed';
            return;
          }
        }

        // Show enhanced progress
        this.displayEnhancedProgress(plan, completedCount, failedCount);
      }

      // Plan completed
      plan.status = failedCount === 0 ? 'completed' : 'failed';
      plan.completedAt = new Date();
      plan.actualTotalDuration = plan.todos.reduce((sum, todo) => sum + (todo.actualDuration || 0), 0);

      // Update execution stats
      this.updateExecutionStats(plan);

      // Show enhanced completion summary
      this.displayEnhancedCompletionSummary(plan, completedCount, failedCount);

      // Update final todo.md
      await this.updateTodoFile(plan);

    } catch (error: any) {
      plan.status = 'failed';
      console.log(chalk.red(`\n❌ Enhanced plan execution failed: ${error.message}`));
    } finally {
      // Always return to default mode after plan execution
      try {
        const nik = (global as any).__nikCLI;
        if (nik) {
          nik.currentMode = 'default';
          if (typeof nik.renderPromptAfterOutput === 'function') {
            nik.renderPromptAfterOutput();
          } else if (typeof nik.showPrompt === 'function') {
            nik.showPrompt();
          }
        }
        const orchestrator = (global as any).__streamingOrchestrator;
        if (orchestrator && orchestrator.context) {
          orchestrator.context.planMode = false;
          orchestrator.context.autoAcceptEdits = false;
        }
      } catch { /* ignore cleanup errors */ }
    }
  }

  /**
   * Generate todos using AI
   */
  private async generateTodosWithAI(goal: string, context: string, maxTodos: number): Promise<TodoItem[]> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert project planner. Create a detailed, actionable plan to accomplish the given goal.

Generate a JSON array of todo items with the following structure:
{
  "todos": [
    {
      "title": "Clear, actionable title",
      "description": "Detailed description of what needs to be done",
      "priority": "low|medium|high|critical",
      "category": "planning|setup|implementation|testing|documentation|deployment",
      "estimatedDuration": 30, // minutes
      "dependencies": [], // IDs of other todos that must be completed first
      "tags": ["tag1", "tag2"], // relevant tags
      "commands": ["command1", "command2"], // shell commands if needed
      "files": ["file1.ts", "file2.js"], // files that will be created/modified
      "reasoning": "Why this todo is necessary and how it fits in the overall plan"
    }
  ]
}

Guidelines:
1. Break down complex tasks into manageable todos (5-60 minutes each)
2. Consider dependencies between tasks
3. Include setup, implementation, testing, and documentation
4. Be specific about files and commands
5. Estimate realistic durations
6. Use appropriate priorities
7. Maximum ${maxTodos} todos

Project Context:
${context}

Generate a comprehensive plan that is practical and executable.`
      },
      {
        role: 'user',
        content: `Create a detailed plan to: ${goal}`
      }
    ];

    let lastModelOutput = '';
    try {
      const response = await modelProvider.generateResponse({ messages });
      lastModelOutput = response || '';

      // Prefer fenced JSON blocks if present, otherwise fall back to broad match
      const raw = lastModelOutput.trim();
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      let jsonString: string | undefined = fenceMatch ? fenceMatch[1].trim() : undefined;
      if (!jsonString) {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonString = jsonMatch[0];
      }
      if (!jsonString) {
        throw new Error('AI did not return valid JSON plan');
      }

      const planData = JSON.parse(jsonString);

      // Convert to TodoItem format
      const todos: TodoItem[] = planData.todos.map((todoData: any, index: number) => ({
        id: nanoid(),
        title: todoData.title || `Task ${index + 1}`,
        description: todoData.description || '',
        status: 'pending' as const,
        priority: todoData.priority || 'medium',
        category: todoData.category || 'implementation',
        estimatedDuration: todoData.estimatedDuration || 30,
        dependencies: todoData.dependencies || [],
        tags: todoData.tags || [],
        // Normalize commands/files fields to arrays of strings
        commands: Array.isArray(todoData.commands) ? todoData.commands.filter((c: any) => typeof c === 'string') : [],
        files: Array.isArray(todoData.files) ? todoData.files.filter((f: any) => typeof f === 'string') : [],
        reasoning: todoData.reasoning || '',
        createdAt: new Date(),
      }));

      console.log(chalk.green(`✅ Generated ${todos.length} todos`));
      return todos;

    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to generate AI plan: ${error.message}`));
      if (lastModelOutput) {
        const preview = lastModelOutput.replace(/```/g, '```').slice(0, 400);
        console.log(chalk.gray(`↪ Raw AI output (truncated):\n${preview}${lastModelOutput.length > 400 ? '…' : ''}`));
      }

      // Fallback: create a simple todo
      return [{
        id: nanoid(),
        title: 'Execute Task',
        description: goal,
        status: 'pending',
        priority: 'medium',
        category: 'implementation',
        estimatedDuration: 60,
        dependencies: [],
        tags: ['manual'],
        reasoning: 'Fallback todo when AI planning fails',
        createdAt: new Date(),
      }];
    }
  }

  /**
   * Display plan in formatted view
   */
  private displayPlan(plan: TodoPlan): void {
    console.log(boxen(
      `${chalk.blue.bold(plan.title)}\\n\\n` +
      `${chalk.gray('Goal:')} ${plan.goal}\\n` +
      `${chalk.gray('Todos:')} ${plan.todos.length}\\n` +
      `${chalk.gray('Estimated Duration:')} ${Math.round(plan.estimatedTotalDuration)} minutes\\n` +
      `${chalk.gray('Status:')} ${this.getStatusColor(plan.status)(plan.status.toUpperCase())}`,
      {
        padding: 1,
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'blue',
      }
    ));

    console.log(chalk.blue.bold('\\n📋 Todo Items:'));
    console.log(chalk.gray('─'.repeat(60)));

    plan.todos.forEach((todo, index) => {
      const priorityIcon = this.getPriorityIcon(todo.priority);
      const statusIcon = this.getStatusIcon(todo.status);
      const categoryColor = this.getCategoryColor(todo.category);

      console.log(`${index + 1}. ${statusIcon} ${priorityIcon} ${chalk.bold(todo.title)}`);
      console.log(`   ${chalk.gray(todo.description)}`);
      console.log(`   ${categoryColor(todo.category)} | ${chalk.gray(todo.estimatedDuration + 'min')} | ${chalk.gray(todo.tags.join(', '))}`);

      if (todo.dependencies.length > 0) {
        console.log(`   ${chalk.yellow('Dependencies:')} ${todo.dependencies.join(', ')}`);
      }

      if (todo.files && todo.files.length > 0) {
        console.log(`   ${chalk.blue('Files:')} ${todo.files.join(', ')}`);
      }

      console.log();
    });
  }

  /**
   * Display plan summary
   */
  private displayPlanSummary(plan: TodoPlan): void {
    const stats = {
      byPriority: this.groupBy(plan.todos, 'priority'),
      byCategory: this.groupBy(plan.todos, 'category'),
      totalFiles: new Set(plan.todos.flatMap(t => t.files || [])).size,
      totalCommands: plan.todos.reduce((sum, t) => sum + (t.commands?.length || 0), 0),
    };

    console.log(chalk.cyan('📊 Plan Statistics:'));
    console.log(`  • Total Todos: ${plan.todos.length}`);
    console.log(`  • Estimated Duration: ${Math.round(plan.estimatedTotalDuration)} minutes`);
    console.log(`  • Files to modify: ${stats.totalFiles}`);
    console.log(`  • Commands to run: ${stats.totalCommands}`);

    console.log(chalk.cyan('\\n🎯 Priority Distribution:'));
    Object.entries(stats.byPriority).forEach(([priority, todos]) => {
      const icon = this.getPriorityIcon(priority as any);
      console.log(`  ${icon} ${priority}: ${(todos as any[]).length} todos`);
    });

    console.log(chalk.cyan('\n📁 Category Distribution:'));
    Object.entries(stats.byCategory).forEach(([category, todos]) => {
      const color = this.getCategoryColor(category);
      console.log(`  • ${color(category)}: ${(todos as any[]).length} todos`);
    });
  }

  /**
   * Save plan to todo.md file
   */
  private async saveTodoFile(plan: TodoPlan, filename: string = 'todo.md'): Promise<void> {
    const todoPath = path.join(this.workingDirectory, filename);

    let content = `# Todo Plan: ${plan.title}\n\n`;
    content += `**Goal:** ${plan.goal}\n\n`;
    content += `**Status:** ${plan.status.toUpperCase()}\n`;
    content += `**Created:** ${plan.createdAt.toISOString()}\n`;
    content += `**Estimated Duration:** ${Math.round(plan.estimatedTotalDuration)} minutes\n\n`;

    if (plan.context.projectInfo) {
      content += `## Project Context\n\n`;
      const projectInfoBlock = typeof plan.context.projectInfo === 'string'
        ? plan.context.projectInfo
        : JSON.stringify(plan.context.projectInfo, null, 2);
      const fenceLang = typeof plan.context.projectInfo === 'string' ? '' : 'json';
      content += `\`\`\`${fenceLang}\n${projectInfoBlock}\n\`\`\`\n\n`;
    }

    content += `## Todo Items (${plan.todos.length})\n\n`;

    plan.todos.forEach((todo, index) => {
      const statusEmoji = this.getStatusEmoji(todo.status);
      const priorityEmoji = this.getPriorityEmoji(todo.priority);

      content += `### ${index + 1}. ${statusEmoji} ${todo.title} ${priorityEmoji}\n\n`;
      content += `**Description:** ${todo.description}\n\n`;
      content += `**Category:** ${todo.category} | **Priority:** ${todo.priority} | **Duration:** ${todo.estimatedDuration}min\n\n`;

      if (todo.reasoning) {
        content += `**Reasoning:** ${todo.reasoning}\n\n`;
      }

      if (todo.dependencies.length > 0) {
        content += `**Dependencies:** ${todo.dependencies.join(', ')}\n\n`;
      }

      if (todo.files && todo.files.length > 0) {
        content += `**Files:** \`${todo.files.join('\`, \`')}\`\n\n`;
      }

      if (todo.commands && todo.commands.length > 0) {
        content += `**Commands:**\n`;
        todo.commands.forEach(cmd => {
          content += `- \`${cmd}\`\n`;
        });
        content += '\n';
      }

      if (todo.tags.length > 0) {
        content += `**Tags:** ${todo.tags.map(tag => `#${tag}`).join(' ')}\n\n`;
      }

      if (todo.status === 'completed' && todo.completedAt) {
        content += `**Completed:** ${todo.completedAt.toISOString()}\n`;
        if (todo.actualDuration) {
          content += `**Actual Duration:** ${todo.actualDuration}min\n`;
        }
        content += '\n';
      }

      content += '---\n\n';
    });

    // Add statistics
    content += `## Statistics\n\n`;
    content += `- **Total Todos:** ${plan.todos.length}\n`;
    content += `- **Completed:** ${plan.todos.filter(t => t.status === 'completed').length}\n`;
    content += `- **In Progress:** ${plan.todos.filter(t => t.status === 'in_progress').length}\n`;
    content += `- **Pending:** ${plan.todos.filter(t => t.status === 'pending').length}\n`;
    content += `- **Failed:** ${plan.todos.filter(t => t.status === 'failed').length}\n`;

    if (plan.actualTotalDuration) {
      content += `- **Actual Duration:** ${plan.actualTotalDuration}min\n`;
      content += `- **Estimated vs Actual:** ${Math.round((plan.actualTotalDuration / plan.estimatedTotalDuration) * 100)}%\n`;
    }

    content += `\n---\n*Generated by NikCLI on ${new Date().toISOString()}*\n`;

    await fs.writeFile(todoPath, content, 'utf8');
    console.log(chalk.green(`📄 Todo file saved: ${todoPath}`));
  }

  /**
   * Update existing todo.md file
   */
  private async updateTodoFile(plan: TodoPlan, filename: string = 'todo.md'): Promise<void> {
    await this.saveTodoFile(plan, filename);
  }

  /**
   * Execute a single todo using real agent system
   */
  private async executeTodo(todo: TodoItem, plan: TodoPlan): Promise<void> {
    console.log(chalk.blue(`🚀 Starting: ${todo.title}`));
    console.log(chalk.gray(`   ${todo.description}`));

    // Enforce read-only execution if requested by plan goal
    const lowerGoal = (plan.goal || '').toLowerCase();
    const readOnlyRequested = lowerGoal.includes('solo grep') || lowerGoal.includes('solo read') ||
      (lowerGoal.includes('grep') && lowerGoal.includes('read') && (lowerGoal.includes('solo') || lowerGoal.includes('only')));
    if (readOnlyRequested && ((todo.commands && todo.commands.length > 0) || (todo.files && todo.files.length > 0))) {
      console.log(chalk.yellow('⚠️ Read-only mode: skipping commands/file modifications for this todo'));
      // Mark as skipped but not failed to continue flow
      todo.status = 'skipped';
      todo.completedAt = new Date();
      plan.progress!.completedSteps += 1;
      plan.progress!.percentage = Math.round((plan.progress!.completedSteps / plan.progress!.totalSteps) * 100);
      return;
    }

    // Dynamic preflight: ensure referenced resources exist; adapt instead of failing
    await this.preflightTodoResources(todo);

    let originalEmit: any;
    try {
      // Import agent service for real execution
      const { agentService } = await import('../services/agent-service');
      
      // Setup event listeners to bridge agent events to UI
      originalEmit = agentService.emit.bind(agentService);
      const eventHandler = (event: string, ...args: any[]) => {
        // Route events through the NikCLI UI system if available
        try {
          // Avoid circular import by accessing global instance directly
          const globalThis = (global as any);
          const nikCliInstance = globalThis.__nikCLI;
          if (nikCliInstance && typeof nikCliInstance.routeEventToUI === 'function') {
            // Map agent service events to UI events
            if (event === 'task_progress') {
              nikCliInstance.routeEventToUI('agent_progress', {
                task: todo.title,
                progress: args[1]?.progress || 0,
                description: args[1]?.description || ''
              });
            } else if (event === 'tool_use') {
              nikCliInstance.routeEventToUI('agent_tool', {
                task: todo.title,
                tool: args[1]?.tool || 'unknown',
                description: args[1]?.description || ''
              });
            } else if (event === 'task_result') {
              nikCliInstance.routeEventToUI('agent_result', {
                task: todo.title,
                result: args[1]?.data || 'completed'
              });
            }
          }
        } catch (uiError) {
          // If UI routing fails, fall back to console output
          if (event === 'task_progress') {
            console.log(chalk.cyan(`   📊 Progress: ${args[1]?.progress || 0}% - ${args[1]?.description || ''}`));
          } else if (event === 'tool_use') {
            console.log(chalk.magenta(`   🔧 Tool: ${args[1]?.tool || 'unknown'} - ${args[1]?.description || ''}`));
          }
        }
        
        // Call original emit to maintain existing functionality
        return originalEmit(event, ...args);
      };
      
      // Temporarily override emit to capture events
      agentService.emit = eventHandler;

      // Execute task using autonomous-coder and get taskId
      const taskId = await agentService.executeTask('autonomous-coder', `${todo.title}: ${todo.description}`);

      // Poll for completion with timeout (per-todo)
      const maxWaitMs = Math.min(Math.max(((todo?.estimatedDuration || 5) * 60 * 1000), 2 * 60 * 1000), 15 * 60 * 1000);
      const start = Date.now();
      let result: any = undefined;
      while (Date.now() - start < maxWaitMs) {
        const status = agentService.getTaskStatus(taskId);
        if (status?.status === 'completed') {
          result = status.result || 'Task completed successfully';
          break;
        }
        if (status?.status === 'failed') {
          throw new Error(status.error || 'Task execution failed');
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (result === undefined) {
        throw new Error('Todo execution timeout');
      }

      console.log(chalk.green(`✅ Completed: ${todo.title}`));

    } catch (error: any) {
      console.log(chalk.red(`❌ Failed: ${todo.title} - ${error.message}`));
      throw error;
    } finally {
      try {
        // Restore original emit even on errors/timeouts
        const { agentService } = await import('../services/agent-service');
        if (originalEmit) {
          agentService.emit = originalEmit;
        }
      } catch { /* ignore */ }
    }
  }

  /**
   * Resolve todo execution order based on dependencies
   */
  private resolveDependencyOrder(todos: TodoItem[]): TodoItem[] {
    const resolved: TodoItem[] = [];
    const remaining = [...todos];
    const todoMap = new Map(todos.map(todo => [todo.id, todo]));

    while (remaining.length > 0) {
      const canExecute = remaining.filter(todo =>
        todo.dependencies.every(depId =>
          resolved.some(resolvedTodo => resolvedTodo.id === depId)
        )
      );

      if (canExecute.length === 0) {
        // Break circular dependencies by taking the first remaining todo
        const next = remaining.shift()!;
        resolved.push(next);
      } else {
        // Execute todos with satisfied dependencies
        canExecute.forEach(todo => {
          const index = remaining.indexOf(todo);
          remaining.splice(index, 1);
          resolved.push(todo);
        });
      }
    }

    return resolved;
  }

  /**
   * Assess plan risk level
   */
  private assessPlanRisk(plan: TodoPlan): 'low' | 'medium' | 'high' | 'critical' {
    const criticalCount = plan.todos.filter(t => t.priority === 'critical').length;
    const highCount = plan.todos.filter(t => t.priority === 'high').length;
    const hasFileOperations = plan.todos.some(t => t.files && t.files.length > 0);
    const hasCommands = plan.todos.some(t => t.commands && t.commands.length > 0);

    if (criticalCount > 0) return 'critical';
    if (highCount > 3 || (highCount > 0 && hasCommands)) return 'high';
    if (hasFileOperations || hasCommands) return 'medium';
    return 'low';
  }

  /**
   * Perform comprehensive risk assessment
   */
  private performRiskAssessment(todos: TodoItem[]): TodoPlan['riskAssessment'] {
    const riskFactors: string[] = [];
    const mitigationStrategies: string[] = [];

    // Analyze destructive operations
    const destructiveOps = todos.filter(t =>
      t.commands?.some(cmd => cmd.includes('rm') || cmd.includes('del') || cmd.includes('sudo'))
    );
    if (destructiveOps.length > 0) {
      riskFactors.push(`Contains ${destructiveOps.length} destructive operations`);
      mitigationStrategies.push('Review all destructive commands before execution');
    }

    // Analyze file modifications
    const fileModifications = todos.filter(t => t.files && t.files.length > 0);
    if (fileModifications.length > 10) {
      riskFactors.push(`Large number of file modifications (${fileModifications.length})`);
      mitigationStrategies.push('Ensure backups are available before execution');
    }

    // Analyze dependencies
    const complexDependencies = todos.filter(t => t.dependencies.length > 3);
    if (complexDependencies.length > 0) {
      riskFactors.push(`Complex dependency chains detected`);
      mitigationStrategies.push('Execute in dependency order with validation');
    }

    // Analyze critical priorities
    const criticalTodos = todos.filter(t => t.priority === 'critical');
    if (criticalTodos.length > 0) {
      riskFactors.push(`Contains ${criticalTodos.length} critical priority tasks`);
      mitigationStrategies.push('Extra attention required for critical tasks');
    }

    // Determine overall risk level
    let overallRisk: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (destructiveOps.length > 0 || criticalTodos.length > 2) {
      overallRisk = 'critical';
    } else if (destructiveOps.length > 0 || fileModifications.length > 15) {
      overallRisk = 'high';
    } else if (fileModifications.length > 5 || complexDependencies.length > 0) {
      overallRisk = 'medium';
    }

    return {
      overallRisk,
      riskFactors,
      mitigationStrategies,
    };
  }

  /**
 * Enhanced todo execution with better error handling
 */
  private async executeEnhancedTodo(todo: TodoItem, plan: TodoPlan): Promise<void> {
    // Validate dependencies
    if (todo.dependencies.length > 0) {
      const dependencyStatus = todo.dependencies.map(depId => {
        const depTodo = plan.todos.find(t => t.id === depId);
        return depTodo?.status === 'completed';
      });

      if (dependencyStatus.some(status => !status)) {
        throw new Error('Dependencies not satisfied');
      }
    }

    // Use the real executeTodo method
    await this.executeTodo(todo, plan);
  }

  /**
   * Handle execution errors with recovery options
   */
  private async handleExecutionError(todo: TodoItem, plan: TodoPlan, completedCount: number): Promise<boolean> {
    const { approvalSystem } = await import('../ui/approval-system');

    console.log(chalk.yellow('\n   ⚠️  Execution Error Recovery Options:'));
    console.log(chalk.gray('   1. Continue with remaining todos'));
    console.log(chalk.gray('   2. Retry this todo'));
    console.log(chalk.gray('   3. Skip this todo and continue'));
    console.log(chalk.gray('   4. Stop execution'));

    const shouldContinue = await approvalSystem.quickApproval(
      'Continue Execution?',
      `Todo "${todo.title}" failed. Continue with remaining todos?`,
      'medium'
    );

    return shouldContinue;
  }

  /**
   * Update plan progress
   */
  private updatePlanProgress(plan: TodoPlan, completedCount: number): void {
    if (plan.progress) {
      plan.progress.completedSteps = completedCount;
      plan.progress.percentage = Math.round((completedCount / plan.progress.totalSteps) * 100);

      // Estimate remaining time
      const completedTodos = plan.todos.filter(t => t.status === 'completed');
      const avgTimePerTodo = completedTodos.length > 0
        ? completedTodos.reduce((sum, t) => sum + (t.actualDuration || 0), 0) / completedTodos.length
        : 0;

      const remainingTodos = plan.todos.length - completedCount;
      plan.progress.estimatedTimeRemaining = Math.round(avgTimePerTodo * remainingTodos);
    }
  }

  /**
   * Display enhanced progress
   */
  private displayEnhancedProgress(plan: TodoPlan, completedCount: number, failedCount: number): void {
    const progress = plan.progress?.percentage || 0;
    const total = plan.todos.length;

    console.log(chalk.blue(`   📊 Progress: ${progress}% (${completedCount}/${total})`));

    if (failedCount > 0) {
      console.log(chalk.red(`   ❌ Failed: ${failedCount}`));
    }

    if (plan.progress?.estimatedTimeRemaining) {
      console.log(chalk.gray(`   ⏱️  Estimated time remaining: ${plan.progress.estimatedTimeRemaining} minutes`));
    }
  }

  /**
   * Display enhanced completion summary
   */
  private displayEnhancedCompletionSummary(plan: TodoPlan, completedCount: number, failedCount: number): void {
    console.log(chalk.green.bold(`\n🎉 Enhanced Plan Execution Summary`));
    console.log(chalk.gray('═'.repeat(80)));

    console.log(chalk.cyan(`📋 Plan: ${plan.title}`));
    console.log(chalk.cyan(`✅ Completed: ${completedCount}/${plan.todos.length} todos`));

    if (failedCount > 0) {
      console.log(chalk.red(`❌ Failed: ${failedCount} todos`));
    }

    if (plan.actualTotalDuration) {
      console.log(chalk.cyan(`⏱️  Total execution time: ${plan.actualTotalDuration} minutes`));
      const efficiency = Math.round((plan.estimatedTotalDuration / plan.actualTotalDuration) * 100);
      console.log(chalk.cyan(`📈 Efficiency: ${efficiency}% (estimated vs actual)`));
    }

    // Show statistics
    this.displayExecutionStatistics();
  }

  /**
   * Display execution statistics
   */
  private displayExecutionStatistics(): void {
    console.log(chalk.blue.bold('\n📊 Execution Statistics:'));
    console.log(chalk.gray(`Total Plans: ${this.executionStats.totalPlans}`));
    console.log(chalk.green(`Successful: ${this.executionStats.successfulPlans}`));
    console.log(chalk.red(`Failed: ${this.executionStats.failedPlans}`));
    console.log(chalk.cyan(`Success Rate: ${this.executionStats.totalPlans > 0 ? Math.round((this.executionStats.successfulPlans / this.executionStats.totalPlans) * 100) : 0}%`));
  }

  /**
   * Update execution statistics
   */
  private updateExecutionStats(plan: TodoPlan): void {
    this.executionStats.totalPlans++;

    if (plan.status === 'completed') {
      this.executionStats.successfulPlans++;
    } else {
      this.executionStats.failedPlans++;
    }

    if (plan.actualTotalDuration) {
      const totalTime = this.executionStats.averageExecutionTime * (this.executionStats.totalPlans - 1) + plan.actualTotalDuration;
      this.executionStats.averageExecutionTime = totalTime / this.executionStats.totalPlans;
    }
  }

  /**
   * Calculate priority distribution
   */
  private calculatePriorityDistribution(todos: TodoItem[]): Record<string, number> {
    return todos.reduce((acc, todo) => {
      acc[todo.priority] = (acc[todo.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Get risk color
   */
  private getRiskColor(risk: string): any {
    switch (risk) {
      case 'critical': return chalk.red.bold;
      case 'high': return chalk.red;
      case 'medium': return chalk.yellow;
      case 'low': return chalk.green;
      default: return chalk.gray;
    }
  }

  // Utility methods
  private extractPlanTitle(goal: string): string {
    return goal.length > 50 ? goal.substring(0, 47) + '...' : goal;
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const group = String(item[key]);
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  private getStatusColor(status: string): any {
    switch (status) {
      case 'completed': return chalk.green;
      case 'executing': case 'in_progress': return chalk.blue;
      case 'approved': return chalk.cyan;
      case 'failed': return chalk.red;
      case 'cancelled': return chalk.yellow;
      default: return chalk.gray;
    }
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return '✅';
      case 'in_progress': return '🔄';
      case 'failed': return '❌';
      case 'skipped': return '⏭️';
      default: return '⏳';
    }
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'completed': return '✅';
      case 'in_progress': return '🔄';
      case 'failed': return '❌';
      case 'skipped': return '⏭️';
      default: return '⏳';
    }
  }

  private getPriorityIcon(priority: string): string {
    switch (priority) {
      case 'critical': return '🔴';
      case 'high': return '🟡';
      case 'medium': return '🟢';
      case 'low': return '🔵';
      default: return '⚪';
    }
  }

  private getPriorityEmoji(priority: string): string {
    switch (priority) {
      case 'critical': return '🔥';
      case 'high': return '⚡';
      case 'medium': return '📋';
      case 'low': return '📝';
      default: return '📄';
    }
  }

  private getCategoryColor(category: string): any {
    switch (category) {
      case 'planning': return chalk.cyan;
      case 'setup': return chalk.blue;
      case 'implementation': return chalk.green;
      case 'testing': return chalk.yellow;
      case 'documentation': return chalk.magenta;
      case 'deployment': return chalk.red;
      default: return chalk.gray;
    }
  }

  /**
   * Get all active plans
   */
  getActivePlans(): TodoPlan[] {
    return Array.from(this.activePlans.values());
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): TodoPlan | undefined {
    return this.activePlans.get(planId);
  }

  /**
   * Display enhanced plan in formatted view
   */
  private displayEnhancedPlan(plan: TodoPlan): void {
    console.log(boxen(
      `${chalk.blue.bold(plan.title)}\n\n` +
      `${chalk.gray('Goal:')} ${plan.goal}\n` +
      `${chalk.gray('Todos:')} ${plan.todos.length}\n` +
      `${chalk.gray('Estimated Duration:')} ${Math.round(plan.estimatedTotalDuration)} minutes\n` +
      `${chalk.gray('Status:')} ${this.getStatusColor(plan.status)(plan.status.toUpperCase())}`,
      {
        padding: 1,
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'blue',
      }
    ));

    console.log(chalk.blue.bold('\n📋 Todo Items:'));
    console.log(chalk.gray('─'.repeat(60)));

    plan.todos.forEach((todo, index) => {
      const priorityIcon = this.getPriorityIcon(todo.priority);
      const statusIcon = this.getStatusIcon(todo.status);
      const categoryColor = this.getCategoryColor(todo.category);

      console.log(`${index + 1}. ${statusIcon} ${priorityIcon} ${chalk.bold(todo.title)}`);
      console.log(`   ${chalk.gray(todo.description)}`);
      console.log(`   ${categoryColor(todo.category)} | ${chalk.gray(todo.estimatedDuration + 'min')} | ${chalk.gray(todo.tags.join(', '))}`);

      if (todo.dependencies.length > 0) {
        console.log(`   ${chalk.yellow('Dependencies:')} ${todo.dependencies.join(', ')}`);
      }

      if (todo.files && todo.files.length > 0) {
        console.log(`   ${chalk.blue('Files:')} ${todo.files.join(', ')}`);
      }

      console.log();
    });
  }

  /**
   * Display enhanced plan summary
   */
  private displayEnhancedPlanSummary(plan: TodoPlan): void {
    const stats = {
      byPriority: this.groupBy(plan.todos, 'priority'),
      byCategory: this.groupBy(plan.todos, 'category'),
      totalFiles: new Set(plan.todos.flatMap(t => t.files || [])).size,
      totalCommands: plan.todos.reduce((sum, t) => sum + (t.commands?.length || 0), 0),
    };

    console.log(chalk.cyan('📊 Enhanced Plan Statistics:'));
    console.log(`  • Total Todos: ${plan.todos.length}`);
    console.log(`  • Estimated Duration: ${Math.round(plan.estimatedTotalDuration)} minutes`);
    console.log(`  • Files to modify: ${stats.totalFiles}`);
    console.log(`  • Commands to run: ${stats.totalCommands}`);

    console.log(chalk.cyan('\n🎯 Priority Distribution:'));
    Object.entries(stats.byPriority).forEach(([priority, todos]) => {
      const icon = this.getPriorityIcon(priority as any);
      console.log(`  ${icon} ${priority}: ${(todos as any[]).length} todos`);
    });

    console.log(chalk.cyan('\n📁 Category Distribution:'));
    Object.entries(stats.byCategory).forEach(([category, todos]) => {
      const color = this.getCategoryColor(category);
      console.log(`  • ${color(category)}: ${(todos as any[]).length} todos`);
    });
  }

  /**
   * Display risk assessment
   */
  private displayRiskAssessment(riskAssessment: TodoPlan['riskAssessment']): void {
    if (!riskAssessment) return;

    console.log(chalk.blue.bold('\n⚠️  Risk Assessment:'));
    const riskColor = this.getRiskColor(riskAssessment.overallRisk);
    console.log(`  Overall Risk: ${riskColor(riskAssessment.overallRisk.toUpperCase())}`);

    if (riskAssessment.riskFactors.length > 0) {
      console.log(chalk.yellow('\n  Risk Factors:'));
      riskAssessment.riskFactors.forEach(factor => {
        console.log(`    • ${factor}`);
      });
    }

    if (riskAssessment.mitigationStrategies.length > 0) {
      console.log(chalk.green('\n  Mitigation Strategies:'));
      riskAssessment.mitigationStrategies.forEach(strategy => {
        console.log(`    • ${strategy}`);
      });
    }
  }

  /**
   * Display execution timeline
   */
  private displayExecutionTimeline(plan: TodoPlan): void {
    console.log(chalk.blue.bold('\n⏱️  Execution Timeline:'));
    const duration = plan.estimatedTotalDuration;
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;

    if (hours > 0) {
      console.log(`  Estimated completion time: ${hours}h ${minutes}m`);
    } else {
      console.log(`  Estimated completion time: ${minutes} minutes`);
    }

    // Show progress milestones
    const milestones = [
      { percentage: 25, description: 'Initial setup and analysis' },
      { percentage: 50, description: 'Core implementation' },
      { percentage: 75, description: 'Testing and validation' },
      { percentage: 100, description: 'Finalization and cleanup' }
    ];

    console.log(chalk.gray('  Progress milestones:'));
    milestones.forEach(milestone => {
      const timeAtMilestone = Math.round((duration * milestone.percentage) / 100);
      console.log(`    ${milestone.percentage}% (${timeAtMilestone}m): ${milestone.description}`);
    });
  }

  /**
   * Render enhanced todos UI
   */
  private async renderEnhancedTodosUI(plan: TodoPlan): Promise<void> {
    try {
      const mod: any = await import('../ui/advanced-cli-ui');
      const ui: any = mod?.advancedUI ?? mod?.default?.advancedUI ?? mod?.default ?? mod;
      const todoItems = plan.todos.map(t => ({
        content: t.title || t.description || 'Untitled',
        status: t.status,
        priority: t.priority,
        category: t.category,
      }));
      ui?.showTodos?.(todoItems, plan.title);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      const code = (e as any)?.code;
      const isModuleNotFound =
        code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module/.test(msg);
      if (!isModuleNotFound) {
        console.debug(chalk.gray(`Enhanced UI not shown: ${msg}`));
      }
    }
  }

  /**
   * Save enhanced todo file
   */
  private async saveEnhancedTodoFile(plan: TodoPlan, filename: string = 'todo.md'): Promise<void> {
    await this.saveTodoFile(plan, filename);
  }

  /**
   * Show plan status
   */
  showPlanStatus(planId?: string): void {
    if (planId) {
      const plan = this.activePlans.get(planId);
      if (plan) {
        this.displayEnhancedPlan(plan);
      } else {
        console.log(chalk.red(`Plan ${planId} not found`));
      }
    } else {
      const plans = this.getActivePlans();
      if (plans.length === 0) {
        console.log(chalk.gray('No active plans'));
      } else {
        console.log(chalk.blue.bold('Active Plans:'));
        plans.forEach(plan => {
          const statusColor = this.getStatusColor(plan.status);
          console.log(`  ${statusColor(plan.status.toUpperCase())} ${plan.title} (${plan.todos.length} todos)`);
        });
      }
    }
  }
}

// Export singleton instance
export const enhancedPlanning = new EnhancedPlanningSystem();
