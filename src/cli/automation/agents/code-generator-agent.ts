import { BaseAgent } from './base-agent';
import { modelProvider, ChatMessage } from '../../ai/model-provider';

export class CodeGeneratorAgent extends BaseAgent {
  id = 'code-generator';
  capabilities = ["code-generation", "template-creation", "scaffolding"];
  specialization = 'Code generation and template creation';
  name = 'code-generator';
  description = 'Code generation and template creation';

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory);
  }

  protected async onInitialize(): Promise<void> {
    console.log('Code Generator Agent initialized successfully');
  }

  protected async onExecuteTask(task: any): Promise<any> {
    const taskData = typeof task === 'string' ? task : task.data;
    console.log(`Running Code Generator Agent`);
    if (taskData) {
      console.log(`Task: ${taskData}`);
    }

    // Default taskData if none provided
    const generationTask = taskData || 'Create a TypeScript function that validates email addresses';
    const prompt = `Generate clean, well-documented TypeScript code for the following requirement:\n\n${generationTask}\n\nInclude proper types, error handling, and JSDoc comments.`;

    try {
      const messages: ChatMessage[] = [
        { role: 'user', content: prompt },
      ];
      const text = await modelProvider.generateResponse({
        messages,
        maxTokens: 800,
      });

      return {
        generatedCode: text,
        task: generationTask,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('Error in code generation:', error);
      return {
        error: error.message,
        task: generationTask,
        timestamp: new Date().toISOString()
      };
    }
  }

  protected async onStop(): Promise<void> {
    console.log('Code Generator Agent cleaned up');
  }

  // Keep legacy methods for backward compatibility
  async run(taskData: string): Promise<any> {
    return await this.onExecuteTask(taskData);
  }

  async cleanup(): Promise<void> {
    return await this.onStop();
  }
}
