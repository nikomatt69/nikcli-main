import { nanoid } from 'nanoid';
import chalk from 'chalk';

export interface AgentTodo {
  id: string;
  agentId: string;
  title: string;
  description: string;
  status: 'planning' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  updatedAt: Date;
  estimatedDuration?: number; // in minutes
  actualDuration?: number;
  dependencies?: string[]; // other todo IDs
  tags: string[];
  context?: {
    files?: string[];
    commands?: string[];
    reasoning?: string;
  };
  subtasks?: AgentTodo[];
  progress?: number; // 0-100
}

export interface AgentWorkPlan {
  id: string;
  agentId: string;
  goal: string;
  todos: AgentTodo[];
  estimatedTimeTotal: number;
  actualTimeTotal?: number;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export class AgentTodoManager {
  private todos: Map<string, AgentTodo> = new Map();
  private workPlans: Map<string, AgentWorkPlan> = new Map();
  private agentContexts: Map<string, any> = new Map();

  // Create a new work plan for an agent
  createWorkPlan(agentId: string, goal: string): AgentWorkPlan {
    const plan: AgentWorkPlan = {
      id: nanoid(),
      agentId,
      goal,
      todos: [],
      estimatedTimeTotal: 0,
      status: 'planning',
      createdAt: new Date(),
    };

    this.workPlans.set(plan.id, plan);
    return plan;
  }

  // Agent creates its own todos based on a goal
  async planTodos(agentId: string, goal: string, context?: any): Promise<AgentTodo[]> {
    console.log(chalk.blue(`🧠 Agent ${agentId} is planning todos for: ${goal}`));

    // Store agent context
    if (context) {
      this.agentContexts.set(agentId, context);
    }

    // Simulate AI planning (this would call the AI model)
    const plannedTodos = await this.generateTodosFromGoal(agentId, goal, context);

    // Add todos to the agent's collection
    plannedTodos.forEach(todo => {
      this.todos.set(todo.id, todo);
    });

    console.log(chalk.green(`📋 Agent ${agentId} created ${plannedTodos.length} todos:`));
    plannedTodos.forEach((todo, index) => {
      const priority = todo.priority === 'critical' ? '🔴' :
        todo.priority === 'high' ? '🟡' : '🟢';
      console.log(`  ${index + 1}. ${priority} ${todo.title}`);
      if (todo.description) {
        console.log(`     ${chalk.gray(todo.description)}`);
      }
    });

    return plannedTodos;
  }

  private async generateTodosFromGoal(agentId: string, goal: string, context?: any): Promise<AgentTodo[]> {
    // This would integrate with the AI model to break down goals into actionable todos
    // For now, using rule-based generation

    const baseTodos: Partial<AgentTodo>[] = [];

    // Add fallback todos for any goal that doesn't match specific patterns
    const hasSpecificPattern = goal.toLowerCase().includes('create') ||
      goal.toLowerCase().includes('build') ||
      goal.toLowerCase().includes('fix') ||
      goal.toLowerCase().includes('debug') ||
      goal.toLowerCase().includes('analyze') ||
      goal.toLowerCase().includes('review') ||
      goal.toLowerCase().includes('audit') ||
      goal.toLowerCase().includes('implement') ||
      goal.toLowerCase().includes('develop') ||
      goal.toLowerCase().includes('add') ||
      goal.toLowerCase().includes('make') ||
      goal.toLowerCase().includes('design') ||
      goal.toLowerCase().includes('crea') ||
      goal.toLowerCase().includes('implementa') ||
      goal.toLowerCase().includes('sviluppa') ||
      goal.toLowerCase().includes('aggiungi') ||
      goal.toLowerCase().includes('fai') ||
      goal.toLowerCase().includes('progetta');

    if (goal.toLowerCase().includes('create') || goal.toLowerCase().includes('build') || 
        goal.toLowerCase().includes('implement') || goal.toLowerCase().includes('develop') || 
        goal.toLowerCase().includes('add') || goal.toLowerCase().includes('make') || 
        goal.toLowerCase().includes('design') || goal.toLowerCase().includes('crea') || 
        goal.toLowerCase().includes('implementa') || goal.toLowerCase().includes('sviluppa') || 
        goal.toLowerCase().includes('aggiungi') || goal.toLowerCase().includes('progetta')) {
      baseTodos.push(
        {
          title: 'Analyze requirements',
          description: `Understand what needs to be ${goal.includes('create') ? 'created' : 'built'}`,
          priority: 'high',
          estimatedDuration: 10,
          tags: ['analysis'],
        },
        {
          title: 'Check project structure',
          description: 'Analyze current project structure and dependencies',
          priority: 'medium',
          estimatedDuration: 5,
          tags: ['analysis', 'filesystem'],
        },
        {
          title: 'Plan implementation',
          description: 'Create detailed implementation plan',
          priority: 'high',
          estimatedDuration: 15,
          tags: ['planning'],
        },
        {
          title: 'Implement solution',
          description: 'Write code and create necessary files',
          priority: 'critical',
          estimatedDuration: 30,
          tags: ['implementation', 'coding'],
        },
        {
          title: 'Test and validate',
          description: 'Run tests and validate implementation',
          priority: 'high',
          estimatedDuration: 10,
          tags: ['testing', 'validation'],
        }
      );
    }

    if (goal.toLowerCase().includes('fix') || goal.toLowerCase().includes('debug')) {
      baseTodos.push(
        {
          title: 'Identify the issue',
          description: 'Analyze error logs and identify root cause',
          priority: 'critical',
          estimatedDuration: 15,
          tags: ['debugging', 'analysis'],
        },
        {
          title: 'Create reproduction case',
          description: 'Create minimal reproduction of the issue',
          priority: 'high',
          estimatedDuration: 10,
          tags: ['debugging', 'testing'],
        },
        {
          title: 'Implement fix',
          description: 'Apply fix to resolve the issue',
          priority: 'critical',
          estimatedDuration: 20,
          tags: ['implementation', 'bugfix'],
        }
      );
    }

    if (goal.toLowerCase().includes('analyze') || goal.toLowerCase().includes('review') || goal.toLowerCase().includes('audit')) {
      baseTodos.push(
        {
          title: 'Explore project structure',
          description: 'Analyze the project structure and identify key components',
          priority: 'high',
          estimatedDuration: 10,
          tags: ['analysis', 'exploration'],
        },
        {
          title: 'Examine code files',
          description: 'Review and analyze the codebase in detail',
          priority: 'high',
          estimatedDuration: 20,
          tags: ['analysis', 'code-review'],
        },
        {
          title: 'Identify patterns and issues',
          description: 'Identify architectural patterns, potential issues, and improvement opportunities',
          priority: 'medium',
          estimatedDuration: 15,
          tags: ['analysis', 'patterns'],
        },
        {
          title: 'Generate analysis report',
          description: 'Create comprehensive analysis report with findings and recommendations',
          priority: 'medium',
          estimatedDuration: 10,
          tags: ['documentation', 'reporting'],
        }
      );
    }

    // Add generic todos if no specific pattern was matched
    if (!hasSpecificPattern) {
      baseTodos.push(
        {
          title: 'Analyze task requirements',
          description: `Understand and break down the task: ${goal}`,
          priority: 'high',
          estimatedDuration: 10,
          tags: ['analysis', 'planning'],
        },
        {
          title: 'Execute task',
          description: `Implement the requested task: ${goal}`,
          priority: 'critical',
          estimatedDuration: 30,
          tags: ['implementation', 'execution'],
        },
        {
          title: 'Verify completion',
          description: 'Verify that the task has been completed successfully',
          priority: 'medium',
          estimatedDuration: 5,
          tags: ['validation', 'testing'],
        }
      );
    }

    return baseTodos.map((todoBase, index) => ({
      id: nanoid(),
      agentId,
      title: todoBase.title!,
      description: todoBase.description!,
      status: 'planning' as const,
      priority: todoBase.priority as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      estimatedDuration: todoBase.estimatedDuration,
      tags: todoBase.tags || [],
      context: context ? { reasoning: `Generated for goal: ${goal}` } : undefined,
      progress: 0,
    }));
  }

  // Start executing todos for an agent
  async executeTodos(agentId: string): Promise<void> {
    const agentTodos = this.getAgentTodos(agentId);
    const pendingTodos = agentTodos.filter(t => t.status === 'planning');

    if (pendingTodos.length === 0) {
      console.log(chalk.yellow(`📝 Agent ${agentId} has no pending todos`));
      return;
    }

    console.log(chalk.blue(`🚀 Agent ${agentId} starting execution of ${pendingTodos.length} todos`));

    let completedCount = 0;
    let failedCount = 0;

    for (const todo of pendingTodos) {
      try {
        await this.executeTodo(todo);
        completedCount++;
      } catch (error) {
        failedCount++;
        console.log(chalk.red(`❌ Todo failed: ${todo.title}`));
      }
    }

    // Show final summary
    console.log(chalk.green.bold(`\n🎉 Execution Summary:`));
    console.log(chalk.green(`✅ Completed: ${completedCount}/${pendingTodos.length} todos`));
    if (failedCount > 0) {
      console.log(chalk.red(`❌ Failed: ${failedCount} todos`));
    }

    // Check if analysis report was generated
    const fs = await import('fs/promises');
    try {
      await fs.access('project-analysis-report.md');
      console.log(chalk.yellow(`📄 Analysis report saved: project-analysis-report.md`));
    } catch {
      // File doesn't exist, that's ok
    }

    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.cyan('📋 All background tasks completed. You can continue chatting.'));

    // Return prompt to user after background execution completes
    setTimeout(() => {
      try {
        // Avoid circular import by accessing global instance directly
        const globalThis = (global as any);
        const nikCliInstance = globalThis.__nikCLI;
        if (nikCliInstance) {
          // Ensure we are in default chat mode after todo execution
          nikCliInstance.currentMode = 'default';
        }
        if (nikCliInstance && typeof nikCliInstance.showPrompt === 'function') {
          console.log(chalk.dim('🔄 Returning to chat mode...'));
          nikCliInstance.showPrompt();
        } else {
          // More visible fallback
          console.log(chalk.cyan('\n┌─[💬 Ready for next input]'));
          console.log(chalk.cyan('└─❯ '));
          process.stdout.write('');
        }
      } catch (error) {
        // More visible fallback
        console.log(chalk.cyan('\n┌─[💬 Ready for next input]'));  
        console.log(chalk.cyan('└─❯ '));
        process.stdout.write('');
      }
    }, 1000); // Delay per assicurarsi che tutto sia completato
  }

  private async executeTodo(todo: AgentTodo): Promise<void> {
    console.log(chalk.cyan(`\n⚡ Executing: ${todo.title}`));
    console.log(chalk.gray(`   ${todo.description}`));

    // Update status
    todo.status = 'in_progress';
    todo.updatedAt = new Date();
    const startTime = Date.now();

    try {
      // Execute task with real agent integration
      await this.executeTaskWithAgent(todo);

      // Mark as completed
      todo.status = 'completed';
      todo.actualDuration = Math.round((Date.now() - startTime) / 1000 / 60);
      todo.progress = 100;

      console.log(chalk.green(`✅ Completed: ${todo.title} (${todo.actualDuration}min)`));

    } catch (error) {
      todo.status = 'failed';
      todo.progress = 50; // Partial progress
      console.log(chalk.red(`❌ Failed: ${todo.title} - ${error}`));
    }

    todo.updatedAt = new Date();
    this.todos.set(todo.id, todo);
  }

  private async executeTaskWithAgent(todo: AgentTodo): Promise<void> {
    try {
      // Import agent service dynamically to avoid circular dependencies
      const { agentService } = await import('../services/agent-service');

      // Execute task using real agent service (use autonomous-coder as universal agent)
      const result = await agentService.executeTask('autonomous-coder', `${todo.title}: ${todo.description}`);

      // Update progress with visual feedback
      const progressSteps = 10;
      for (let step = 1; step <= progressSteps; step++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        todo.progress = (step / progressSteps) * 100;

        const progressBar = '█'.repeat(Math.floor(step / 2)) + '░'.repeat(5 - Math.floor(step / 2));
        process.stdout.write(`\r   Progress: [${chalk.cyan(progressBar)}] ${Math.round(todo.progress)}%`);
      }
      console.log(); // New line after progress

      // Check execution result and display output
      if (!result || result === 'failed' || (typeof result === 'string' && result.toLowerCase().includes('error'))) {
        throw new Error(`Task execution failed: ${typeof result === 'string' ? result : 'Unknown error'}`);
      }

      // Display the agent's output/result to the user (but not raw JSON)
      if (typeof result === 'string' && result.length > 0) {
        // Check if result is JSON metadata - if so, show summary instead
        try {
          const parsed = JSON.parse(result);
          if (parsed.plan && parsed.completed) {
            console.log(chalk.cyan(`\n📋 ${todo.title} - Results:`));
            console.log(chalk.green(`✅ Task completed successfully`));
            if (parsed.plan.description) {
              console.log(chalk.white(`📄 ${parsed.plan.description}`));
            }
            console.log(chalk.gray('─'.repeat(50)));
          } else {
            // Show normal result
            console.log(chalk.cyan(`\n📋 ${todo.title} - Results:`));
            console.log(chalk.white(result));
            console.log(chalk.gray('─'.repeat(50)));
          }
        } catch {
          // Not JSON, show normal result
          console.log(chalk.cyan(`\n📋 ${todo.title} - Results:`));
          console.log(chalk.white(result));
          console.log(chalk.gray('─'.repeat(50)));
        }
      }

    } catch (error: any) {
      console.log(); // Ensure newline
      throw new Error(`Agent execution failed: ${error.message}`);
    }
  }

  // Get todos for a specific agent
  getAgentTodos(agentId: string): AgentTodo[] {
    return Array.from(this.todos.values())
      .filter(todo => todo.agentId === agentId)
      .sort((a, b) => {
        // Sort by priority, then by creation date
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.priority];
        const bPriority = priorityOrder[b.priority];

        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }

        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  // Update todo status and progress
  updateTodo(todoId: string, updates: Partial<AgentTodo>): void {
    const todo = this.todos.get(todoId);
    if (!todo) return;

    Object.assign(todo, updates, { updatedAt: new Date() });
    this.todos.set(todoId, todo);
  }

  // Get agent work statistics
  getAgentStats(agentId: string): {
    totalTodos: number;
    completed: number;
    inProgress: number;
    pending: number;
    failed: number;
    averageCompletionTime: number;
    efficiency: number;
  } {
    const todos = this.getAgentTodos(agentId);
    const completed = todos.filter(t => t.status === 'completed');

    const totalCompletionTime = completed.reduce((sum, t) => sum + (t.actualDuration || 0), 0);
    const totalEstimatedTime = completed.reduce((sum, t) => sum + (t.estimatedDuration || 0), 0);

    return {
      totalTodos: todos.length,
      completed: completed.length,
      inProgress: todos.filter(t => t.status === 'in_progress').length,
      pending: todos.filter(t => t.status === 'planning').length,
      failed: todos.filter(t => t.status === 'failed').length,
      averageCompletionTime: completed.length > 0 ? totalCompletionTime / completed.length : 0,
      efficiency: totalEstimatedTime > 0 ? (totalEstimatedTime / Math.max(totalCompletionTime, 1)) * 100 : 100,
    };
  }

  // Display agent dashboard
  showAgentDashboard(agentId: string): void {
    const todos = this.getAgentTodos(agentId);
    const stats = this.getAgentStats(agentId);

    console.log(chalk.blue.bold(`\n📊 Agent ${agentId} Dashboard`));
    console.log(chalk.gray('═'.repeat(50)));

    console.log(`📝 Total Todos: ${stats.totalTodos}`);
    console.log(`✅ Completed: ${chalk.green(stats.completed.toString())}`);
    console.log(`⚡ In Progress: ${chalk.yellow(stats.inProgress.toString())}`);
    console.log(`📋 Pending: ${chalk.cyan(stats.pending.toString())}`);
    console.log(`❌ Failed: ${chalk.red(stats.failed.toString())}`);
    console.log(`⏱️  Avg Completion: ${Math.round(stats.averageCompletionTime)}min`);
    console.log(`🎯 Efficiency: ${Math.round(stats.efficiency)}%`);

    if (todos.length > 0) {
      console.log(chalk.blue.bold('\n📋 Current Todos:'));
      todos.slice(0, 5).forEach(todo => {
        const status = todo.status === 'completed' ? '✅' :
          todo.status === 'in_progress' ? '⚡' :
            todo.status === 'failed' ? '❌' : '📋';
        const priority = todo.priority === 'critical' ? '🔴' :
          todo.priority === 'high' ? '🟡' : '🟢';

        console.log(`  ${status} ${priority} ${todo.title}`);
        if (todo.progress !== undefined && todo.progress > 0) {
          const progressBar = '█'.repeat(Math.floor(todo.progress / 10)) +
            '░'.repeat(10 - Math.floor(todo.progress / 10));
          console.log(`    Progress: [${chalk.cyan(progressBar)}] ${todo.progress}%`);
        }
      });
    }
  }

  // Clear completed todos for an agent
  clearCompleted(agentId: string): number {
    const agentTodos = this.getAgentTodos(agentId);
    const completedTodos = agentTodos.filter(t => t.status === 'completed');

    completedTodos.forEach(todo => {
      this.todos.delete(todo.id);
    });

    return completedTodos.length;
  }
}

export const agentTodoManager = new AgentTodoManager();