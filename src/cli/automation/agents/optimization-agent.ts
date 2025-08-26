import { BaseAgent } from './base-agent';
import { modelProvider, ChatMessage } from '../../ai/model-provider';

export class OptimizationAgent extends BaseAgent {
  id = 'optimization';
  capabilities = ["performance-optimization", "code-analysis", "profiling"];
  specialization = 'Performance optimization and analysis';

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory);
  }

  protected async onInitialize(): Promise<void> {
    console.log('Optimization Agent initialized successfully');
  }

  protected async onExecuteTask(task: any): Promise<any> {
    const taskData = typeof task === 'string' ? task : task.data;
    console.log(`Running Optimization Agent`);
    if (taskData) {
      console.log(`Task: ${taskData}`);
    }

    // Default code to optimize if no taskData provided
    const codeToOptimize = taskData || `
function findUser(users, id) {
  for (let i = 0; i < users.length; i++) {
    if (users[i].id === id) {
      return users[i];
    }
  }
  return null;
}`;

    const prompt = `Optimize the following code for better performance, readability, and maintainability. Consider:
- Algorithm efficiency
- Memory usage
- Code readability
- Modern JavaScript/TypeScript features
- Error handling
- Type safety

Code to optimize:
\`\`\`
${codeToOptimize}
\`\`\`

Provide the optimized version with explanations of the improvements made.`;

    try {
      const messages: ChatMessage[] = [
        { role: 'user', content: prompt },
      ];
      const text = await modelProvider.generateResponse({
        messages,
        maxTokens: 600,
      });

      return {
        optimization: text,
        originalCode: codeToOptimize,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('Error in code optimization:', error);
      return {
        error: error.message,
        originalCode: codeToOptimize,
        timestamp: new Date().toISOString()
      };
    }
  }

  protected async onStop(): Promise<void> {
    console.log('Optimization Agent cleaned up');
  }

  // Keep legacy methods for backward compatibility
  async run(taskData: string): Promise<any> {
    return await this.onExecuteTask(taskData);
  }

  async cleanup(): Promise<void> {
    return await this.onStop();
  }
}
