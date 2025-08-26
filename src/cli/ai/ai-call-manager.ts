import { modelProvider, ChatMessage, GenerateOptions } from './model-provider';
import { secureTools, BatchSession } from '../tools/secure-tools-registry';
import { CommandResult } from '../tools/secure-command-tool';
import * as ragSystem from "../context/rag-system"
import chalk from 'chalk';
import ora from 'ora';
import { z } from 'zod';
import { randomBytes } from 'crypto';

/**
 * Tool call request from AI
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  reasoning?: string;
}

/**
 * Tool call result
 */
export interface ToolCallResult {
  id: string;
  name: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
}

/**
 * AI execution plan with tool calls
 */
export interface ExecutionPlan {
  id: string;
  description: string;
  toolCalls: ToolCall[];
  estimatedDuration: number;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  createdAt: Date;
}

/**
 * Schema for AI tool call planning
 */
const ExecutionPlanSchema = z.object({
  description: z.string().describe('Brief description of what this plan will accomplish'),
  toolCalls: z.array(z.object({
    id: z.string().describe('Unique identifier for this tool call'),
    name: z.string().describe('Name of the tool to call'),
    arguments: z.record(z.any()).describe('Arguments to pass to the tool'),
    reasoning: z.string().optional().describe('Why this tool call is needed')
  })),
  estimatedDuration: z.number().describe('Estimated duration in minutes'),
  riskLevel: z.enum(['low', 'medium', 'high']).describe('Risk level of this execution plan'),
  requiresApproval: z.boolean().describe('Whether this plan requires user approval')
});

/**
 * AI Call Manager with secure tool integration and batch approval
 */
export class AICallManager {
  private executionHistory: Array<{
    plan: ExecutionPlan;
    results: ToolCallResult[];
    batchSession?: BatchSession;
    completedAt: Date;
  }> = [];

  /**
   * Generate an execution plan from user request with RAG context
   */
  async generateExecutionPlan(
    userRequest: string,
    context?: {
      workingDirectory?: string;
      availableFiles?: string[];
      projectInfo?: any;
      useRAG?: boolean;
      ragQuery?: string;
    }
  ): Promise<ExecutionPlan> {
    const spinner = ora('🧠 Generating AI execution plan...').start();

    try {
      let ragContextText: string | null = null;

      // Get RAG context if requested
      if (context?.useRAG !== false) {
        spinner.text = '🔍 Searching relevant code context...';
        const query = context?.ragQuery || userRequest;

        try {
          const searchResults = await ragSystem.search(query);
          if (searchResults.documents && searchResults.documents.length > 0 && searchResults.documents[0].length > 0) {
            ragContextText = searchResults.documents[0].join("\n\n---\n\n");
            spinner.succeed(`🔍 Found ${searchResults.documents[0].length} relevant code chunks`);
          } else {
            spinner.warn('🔍 No relevant code context found');
          }
        } catch (error: any) {
          spinner.warn(`🔍 RAG search failed: ${error.message}`);
        }

        spinner.start('🧠 Generating execution plan with context...');
      }

      const systemPrompt = `You are an intelligent AI assistant that creates secure execution plans.

Available secure tools:
- readFile: Read file contents safely with path validation
- writeFile: Write file contents with user confirmation
- listDirectory: List directory contents with sandboxing
- replaceInFile: Replace content in files with confirmation
- executeCommand: Execute shell commands with security analysis and confirmation
- createBatchSession: Create batch sessions for one-time approval of multiple commands

Security Guidelines:
- Always use path validation for file operations
- Request user confirmation for write operations
- Analyze commands for security risks
- Use batch sessions for multiple related commands
- Prefer safe, read-only operations when possible

${ragContextText ? `RELEVANT CODE CONTEXT:
${ragContextText}

` : ''}Context:
${context ? `
Working Directory: ${context.workingDirectory || 'current directory'}
Available Files: ${context.availableFiles?.slice(0, 10).join(', ') || 'none listed'}${context.availableFiles && context.availableFiles.length > 10 ? ` (and ${context.availableFiles.length - 10} more)` : ''}
Project Info: ${context.projectInfo ? JSON.stringify(context.projectInfo, null, 2) : 'none'}
` : 'No additional context provided'}

User Request: ${userRequest}


Create a detailed execution plan that accomplishes the user's request safely and efficiently.
Use the relevant code context above to make informed decisions about file paths, function names, and implementation details.
Break down complex tasks into atomic tool calls.
Estimate realistic durations and assess risk levels accurately.`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userRequest }
      ];

      try {
        const planData = await modelProvider.generateStructured<z.infer<typeof ExecutionPlanSchema>>({
          messages,
          schema: ExecutionPlanSchema,
          schemaName: 'ExecutionPlan',
          schemaDescription: 'Structured plan for secure tool execution',
          temperature: 0.1, // Low temperature for consistent planning
        });

        const plan: ExecutionPlan = {
          id: `plan_${Date.now()}_${randomBytes(6).toString('base64url')}`,
          description: planData.description,
          toolCalls: planData.toolCalls.map(tc => ({ ...tc, id: tc.id || "", name: tc.name || "", arguments: tc.arguments || {} })),
          estimatedDuration: planData.estimatedDuration,
          riskLevel: planData.riskLevel,
          requiresApproval: planData.requiresApproval,
          createdAt: new Date(),
        };

        console.log(chalk.green(`✅ Execution plan generated: ${plan.description}`));
        console.log(chalk.gray(`   Tool calls: ${plan.toolCalls.length}`));
        console.log(chalk.gray(`   Risk level: ${plan.riskLevel}`));
        console.log(chalk.gray(`   Requires approval: ${plan.requiresApproval ? 'Yes' : 'No'}`));

        return plan;

      } catch (error: any) {
        console.log(chalk.red(`❌ Failed to generate execution plan: ${error.message}`));
        throw new Error(`Failed to generate execution plan: ${error.message}`);
      }
    } catch (error: any) {
      spinner.fail(chalk.red(`Error generating execution plan: ${error.message}`));
      throw error;
    }
  }
  /**
   * Execute a plan using secure tools with batch approval if needed
   */
  async executePlan(
    plan: ExecutionPlan,
    options: {
      skipApproval?: boolean;
      useBatchSession?: boolean;
      sessionDuration?: number;
    } = {}
  ): Promise<ToolCallResult[]> {
    console.log(chalk.blue.bold(`
🚀 Executing Plan: ${plan.description}`));
    console.log(chalk.gray(`Plan ID: ${plan.id}`));
    console.log(chalk.gray(`Tool calls: ${plan.toolCalls.length}`));

    if (plan.requiresApproval && !options.skipApproval) {
      console.log(chalk.yellow.bold('\n⚠️ This plan requires your approval to proceed.'));
      plan.toolCalls.forEach((toolCall, index) => {
        console.log(`  ${index + 1}. ${toolCall.name}: ${toolCall.reasoning || ''}`);
        console.log(`     Arguments: ${JSON.stringify(toolCall.arguments)}`);
      });

      const inquirer = await import('inquirer');
      const { confirm } = await inquirer.default.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Do you want to execute this plan?',
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.red.bold('Execution cancelled by user.'));
        return [];
      }
    }

    const results: ToolCallResult[] = [];
    let batchSession: BatchSession | undefined;

    try {
      // If using batch session and plan requires approval, create batch session
      if (options.useBatchSession && plan.requiresApproval && plan.toolCalls.some(tc => tc.name === 'executeCommand')) {
        const commands = plan.toolCalls
          .filter(tc => tc.name === 'executeCommand')
          .map(tc => tc.arguments.command as string);

        if (commands.length > 0) {
          console.log(chalk.blue('\n🔐 Creating batch session for command execution...'));

          const batchResult = await secureTools.createBatchSession(commands, {
            sessionDuration: options.sessionDuration,
            onProgress: (command, index, total) => {
              console.log(chalk.blue(`[${index}/${total}] Executing: ${command}`));
            },
            onComplete: (results) => {
              console.log(chalk.green(`✅ Batch execution completed: ${results.length} commands`));
            },
            onError: (error, command, index) => {
              console.log(chalk.red(`❌ Batch execution failed at command ${index + 1}: ${command}`));
              console.log(chalk.red(`Error: ${error.message}`));
            }
          });

          if (batchResult.success && batchResult.data) {
            batchSession = batchResult.data;

            // Start async execution
            await secureTools.executeBatchAsync(batchSession.id);
          }
        }
      }

      // Execute tool calls
      for (let i = 0; i < plan.toolCalls.length; i++) {
        const toolCall = plan.toolCalls[i];
        const startTime = Date.now();

        console.log(chalk.blue(`\n[${i + 1}/${plan.toolCalls.length}] ${toolCall.name}`));
        if (toolCall.reasoning) {
          console.log(chalk.gray(`   Reasoning: ${toolCall.reasoning}`));
        }

        try {
          let result: any;

          // Execute tool call based on name
          switch (toolCall.name) {
            case 'readFile':
              const readResult = await secureTools.readFile(toolCall.arguments.filePath);
              result = readResult.data;
              break;

            case 'writeFile':
              const writeResult = await secureTools.writeFile(
                toolCall.arguments.filePath,
                toolCall.arguments.content,
                {
                  skipConfirmation: options.skipApproval,
                  createDirectories: toolCall.arguments.createDirectories
                }
              );
              result = writeResult.data;
              break;

            case 'listDirectory':
              const listResult = await secureTools.listDirectory(
                toolCall.arguments.directoryPath,
                {
                  recursive: toolCall.arguments.recursive,
                  includeHidden: toolCall.arguments.includeHidden,
                  pattern: toolCall.arguments.pattern ? new RegExp(toolCall.arguments.pattern) : undefined
                }
              );
              result = listResult.data;
              break;

            case 'replaceInFile':
              const replaceResult = await secureTools.replaceInFile(
                toolCall.arguments.filePath,
                toolCall.arguments.replacements,
                {
                  skipConfirmation: options.skipApproval,
                  createBackup: toolCall.arguments.createBackup
                }
              );
              result = replaceResult.data;
              break;

            case 'executeCommand':
              // If we have a batch session, skip individual execution
              if (batchSession) {
                result = { message: 'Command queued in batch session', batchSessionId: batchSession.id };
              } else {
                const commandResult = await secureTools.executeCommand(
                  toolCall.arguments.command,
                  {
                    cwd: toolCall.arguments.cwd,
                    timeout: toolCall.arguments.timeout,
                    env: toolCall.arguments.env,
                    skipConfirmation: options.skipApproval,
                    allowDangerous: toolCall.arguments.allowDangerous
                  }
                );
                result = commandResult.data;
              }
              break;

            default:
              throw new Error(`Unknown tool: ${toolCall.name}`);
          }

          const executionTime = Date.now() - startTime;

          results.push({
            id: toolCall.id,
            name: toolCall.name,
            success: true,
            result,
            executionTime
          });

          console.log(chalk.green(`✅ [${i + 1}/${plan.toolCalls.length}] Completed (${executionTime}ms)`));

        } catch (error: any) {
          const executionTime = Date.now() - startTime;

          results.push({
            id: toolCall.id,
            name: toolCall.name,
            success: false,
            error: error.message,
            executionTime
          });

          console.log(chalk.red(`❌ [${i + 1}/${plan.toolCalls.length}] Failed: ${error.message}`));

          // Stop execution on first failure unless continuing
          if (plan.riskLevel === 'high') {
            console.log(chalk.red('🛑 Stopping execution due to high-risk failure'));
            break;
          }
        }
      }

      // Add to execution history
      this.executionHistory.push({
        plan,
        results,
        batchSession,
        completedAt: new Date()
      });

      console.log(chalk.green.bold(`\n✅ Plan execution completed`));
      console.log(chalk.gray(`Successful: ${results.filter(r => r.success).length}/${results.length}`));
      console.log(chalk.gray(`Failed: ${results.filter(r => !r.success).length}/${results.length}`));

      return results;

    } catch (error: any) {
      console.log(chalk.red.bold(`\n❌ Plan execution failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Execute user request end-to-end with planning and execution
   */
  async executeUserRequest(
    userRequest: string,
    context?: Parameters<typeof this.generateExecutionPlan>[1],
    options?: Parameters<typeof this.executePlan>[1]
  ): Promise<{
    plan: ExecutionPlan;
    results: ToolCallResult[];
  }> {
    console.log(chalk.blue.bold('\n🎯 Processing User Request'));
    console.log(chalk.gray(`Request: ${userRequest}`));

    // Generate execution plan
    const plan = await this.generateExecutionPlan(userRequest, context);

    // Execute plan
    const results = await this.executePlan(plan, options);

    return { plan, results };
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit?: number): Array<{
    plan: ExecutionPlan;
    results: ToolCallResult[];
    batchSession?: BatchSession;
    completedAt: Date;
  }> {
    const history = this.executionHistory.slice().reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(): {
    totalPlans: number;
    successfulPlans: number;
    failedPlans: number;
    totalToolCalls: number;
    successfulToolCalls: number;
    averageExecutionTime: number;
    mostUsedTools: Array<{ name: string; count: number }>;
  } {
    const history = this.executionHistory;
    const totalPlans = history.length;
    const successfulPlans = history.filter(h => h.results.every(r => r.success)).length;
    const failedPlans = totalPlans - successfulPlans;

    const allResults = history.flatMap(h => h.results);
    const totalToolCalls = allResults.length;
    const successfulToolCalls = allResults.filter(r => r.success).length;
    const averageExecutionTime = totalToolCalls > 0
      ? allResults.reduce((sum, r) => sum + r.executionTime, 0) / totalToolCalls
      : 0;

    const toolCounts = new Map<string, number>();
    allResults.forEach(r => {
      toolCounts.set(r.name, (toolCounts.get(r.name) || 0) + 1);
    });

    const mostUsedTools = Array.from(toolCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalPlans,
      successfulPlans,
      failedPlans,
      totalToolCalls,
      successfulToolCalls,
      averageExecutionTime,
      mostUsedTools
    };
  }

  /**
   * Print execution statistics
   */
  printExecutionStats(): void {
    const stats = this.getExecutionStats();

    console.log(chalk.blue.bold('\n📊 AI Call Manager Statistics'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.white(`Total Plans: ${stats.totalPlans}`));
    console.log(chalk.green(`Successful Plans: ${stats.successfulPlans}`));
    console.log(chalk.red(`Failed Plans: ${stats.failedPlans}`));
    console.log(chalk.white(`Total Tool Calls: ${stats.totalToolCalls}`));
    console.log(chalk.green(`Successful Tool Calls: ${stats.successfulToolCalls}`));
    console.log(chalk.blue(`Average Execution Time: ${Math.round(stats.averageExecutionTime)}ms`));

    if (stats.mostUsedTools.length > 0) {
      console.log(chalk.blue('\n🔧 Most Used Tools:'));
      stats.mostUsedTools.forEach(tool => {
        console.log(chalk.gray(`  • ${tool.name}: ${tool.count} calls`));
      });
    }
  }
}

// Export singleton instance
export const aiCallManager = new AICallManager();
