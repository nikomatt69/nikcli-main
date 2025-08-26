import chalk from 'chalk';
import { PlanGenerator } from '../planning/plan-generator';
import { AutonomousPlanner } from '../planning/autonomous-planner';
import { ExecutionPlan, PlanTodo, PlannerContext, PlanningToolCapability } from '../planning/types';
import { nanoid } from 'nanoid';
import { ToolCapability, toolService } from './tool-service';

export interface PlanningOptions {
  showProgress: boolean;
  autoExecute: boolean;
  confirmSteps: boolean;
}

export class PlanningService {
  private planGenerator: PlanGenerator;
  private autonomousPlanner: AutonomousPlanner;
  private activePlans: Map<string, ExecutionPlan> = new Map();
  private workingDirectory: string = process.cwd();
  private availableTools: ToolCapability[] = [];

  constructor() {
    this.planGenerator = new PlanGenerator();
    this.autonomousPlanner = new AutonomousPlanner(this.workingDirectory);
    this.initializeTools();
  }

  /**
   * Initialize available tools from ToolService
   */
  private initializeTools(): void {
    this.availableTools = toolService.getAvailableTools();
  }

  /**
   * Refresh available tools from ToolService
   */
  refreshAvailableTools(): void {
    this.initializeTools();
  }

  /**
   * Convert ToolCapability to PlanningToolCapability for planning context
   */
  private convertToPlanningTools(tools: ToolCapability[]): PlanningToolCapability[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      riskLevel: this.assessToolRisk(tool),
      reversible: this.isToolReversible(tool),
      estimatedDuration: this.estimateToolDuration(tool),
      requiredArgs: this.extractRequiredArgs(tool),
      optionalArgs: this.extractOptionalArgs(tool)
    }));
  }

  /**
   * Assess risk level for a tool based on its category and name
   */
  private assessToolRisk(tool: ToolCapability): 'low' | 'medium' | 'high' {
    if (tool.category === 'command' || tool.name.includes('delete') || tool.name.includes('remove')) {
      return 'high';
    }
    if (tool.category === 'file' && (tool.name.includes('write') || tool.name.includes('modify'))) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Determine if a tool operation is reversible
   */
  private isToolReversible(tool: ToolCapability): boolean {
    const irreversibleOperations = ['delete', 'remove', 'execute', 'install'];
    return !irreversibleOperations.some(op => tool.name.toLowerCase().includes(op));
  }

  /**
   * Estimate duration for tool execution
   */
  private estimateToolDuration(tool: ToolCapability): number {
    switch (tool.category) {
      case 'command': return 10000; // 10 seconds
      case 'package': return 30000; // 30 seconds
      case 'analysis': return 5000;  // 5 seconds
      case 'git': return 3000;       // 3 seconds
      case 'file': return 1000;      // 1 second
      default: return 5000;
    }
  }

  /**
   * Extract required arguments (simplified - in production would use reflection)
   */
  private extractRequiredArgs(tool: ToolCapability): string[] {
    // This is a simplified implementation
    // In production, this would introspect the tool handler function
    if (tool.name.includes('file')) return ['filePath'];
    if (tool.name.includes('command')) return ['command'];
    if (tool.name.includes('git')) return [];
    return [];
  }

  /**
   * Extract optional arguments (simplified - in production would use reflection)
   */
  private extractOptionalArgs(tool: ToolCapability): string[] {
    // This is a simplified implementation
    // In production, this would introspect the tool handler function
    if (tool.name.includes('file')) return ['encoding', 'backup'];
    if (tool.name.includes('command')) return ['timeout', 'cwd'];
    return [];
  }

  setWorkingDirectory(dir: string): void {
    this.workingDirectory = dir;
  }

  /**
   * Create a new execution plan
   */
  async createPlan(userRequest: string, options: PlanningOptions = {
    showProgress: true,
    autoExecute: false,
    confirmSteps: true
  }): Promise<ExecutionPlan> {
    console.log(chalk.blue('🎯 Creating execution plan...'));

    const context: PlannerContext = {
      userRequest,
      availableTools: this.convertToPlanningTools(this.availableTools),
      projectPath: this.workingDirectory
    };

    const plan = await this.planGenerator.generatePlan(context);
    this.activePlans.set(plan.id, plan);

    if (options.showProgress) {
      this.displayPlan(plan);
    }

    return plan;
  }

  /**
   * Execute a plan autonomously
   */
  async executePlan(planId: string, options: PlanningOptions): Promise<void> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      console.log(chalk.red(`Plan ${planId} not found`));
      return;
    }

    console.log(chalk.green(`🚀 Executing plan: ${plan.title}`));

    try {
      // Use autonomous planner for execution with streaming
      for await (const event of this.autonomousPlanner.executePlan(plan)) {
        switch (event.type) {
          case 'plan_start':
            console.log(chalk.cyan(`📋 Starting: ${event.planId}`));
            break;
          case 'plan_created':
            console.log(chalk.blue(`🔄 ${event.result}`));
            break;
          case 'todo_start':
            console.log(chalk.green(`✅ ${event.todoId}`));
            break;
          case 'todo_progress':
            console.log(chalk.red(`🔄 ${event.progress}`));
            break;
          case 'todo_complete':
            console.log(chalk.green(`✅ Todo completed`));
            break;
          case 'plan_failed':
            console.log(chalk.red(`❌ Plan execution failed: ${event.error}`));
            break;
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Plan execution error: ${error.message}`));
      plan.status = 'failed';
    }
  }

  /**
   * Display plan details
   */
  displayPlan(plan: ExecutionPlan): void {
    console.log(chalk.cyan.bold(`\\n📋 Execution Plan: ${plan.title}`));
    console.log(chalk.gray(`Description: ${plan.description}`));
    console.log(chalk.gray(`Steps: ${plan.steps.length} • Risk: ${plan.riskAssessment.overallRisk} • Est. ${Math.round(plan.estimatedTotalDuration / 1000)}s`));
    console.log(chalk.gray('─'.repeat(60)));

    plan.steps.forEach((step, index) => {
      const statusIcon = '⏳';

      const riskColor = step.riskLevel === 'high' ? chalk.red :
        step.riskLevel === 'medium' ? chalk.yellow : chalk.green;

      console.log(`${index + 1}. ${statusIcon} ${chalk.bold(step.title)}`);
      console.log(`   ${chalk.dim(step.description)} ${riskColor(`[${step.riskLevel}]`)}`);

      if (step.dependencies && step.dependencies.length > 0) {
        console.log(`   ${chalk.dim('Dependencies:')} ${step.dependencies.join(', ')}`);
      }
    });

    console.log(chalk.gray('─'.repeat(60)));

    if (plan.riskAssessment.destructiveOperations > 0) {
      console.log(chalk.red(`⚠️  Contains ${plan.riskAssessment.destructiveOperations} destructive operations`));
    }

    if (plan.riskAssessment.fileModifications > 0) {
      console.log(chalk.yellow(`📝 Will modify ${plan.riskAssessment.fileModifications} files`));
    }
  }

  /**
   * Get all active plans
   */
  getActivePlans(): ExecutionPlan[] {
    return Array.from(this.activePlans.values());
  }

  /**
   * Update plan status
   */
  updatePlanStatus(planId: string, status: 'pending' | 'running' | 'completed' | 'failed'): void {
    const plan = this.activePlans.get(planId);
    if (plan) {
      plan.status = status;
    }
  }

  /**
   * Add todo to plan
   */
  addTodoToPlan(planId: string, todo: Omit<PlanTodo, 'id'>): void {
    const plan = this.activePlans.get(planId);
    if (plan) {
      const newTodo: PlanTodo = {
        ...todo,
        id: nanoid()
      };
      plan.todos.push(newTodo);
    }
  }

  /**
   * Update todo status
   */
  updateTodoStatus(planId: string, todoId: string, status: 'pending' | 'in_progress' | 'completed' | 'failed'): void {
    const plan = this.activePlans.get(planId);
    if (plan) {
      const todo = plan.todos.find(t => t.id === todoId);
      if (todo) {
        todo.status = status;
      }
    }
  }

  /**
   * Clear completed plans
   */
  clearCompletedPlans(): number {
    const completedCount = Array.from(this.activePlans.values())
      .filter(p => p.status === 'completed').length;

    for (const [id, plan] of this.activePlans) {
      if (plan.status === 'completed') {
        this.activePlans.delete(id);
      }
    }

    console.log(chalk.green(`🧹 Cleared ${completedCount} completed plans`));
    return completedCount;
  }

  /**
   * Get plan statistics
   */
  getStatistics(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } {
    const plans = Array.from(this.activePlans.values());
    return {
      total: plans.length,
      pending: plans.filter(p => p.status === 'pending').length,
      running: plans.filter(p => p.status === 'running').length,
      completed: plans.filter(p => p.status === 'completed').length,
      failed: plans.filter(p => p.status === 'failed').length
    };
  }
}

export const planningService = new PlanningService();