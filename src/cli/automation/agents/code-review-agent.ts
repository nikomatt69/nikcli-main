import { BaseAgent } from './base-agent';
import { modelProvider, ChatMessage } from '../../ai/model-provider';

export class CodeReviewAgent extends BaseAgent {
  id = 'code-review';
  capabilities = ["code-review", "quality-analysis", "best-practices"];
  specialization = 'Code review and quality analysis';

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory);
  }

  protected async onInitialize(): Promise<void> {
    console.log('Code Review Agent initialized successfully');
  }

  protected async onExecuteTask(task: any): Promise<any> {
    const taskData = typeof task === 'string' ? task : task.data;
    console.log(`Running Code Review Agent`);
    if (taskData) {
      console.log(`Task: ${taskData}`);
    }

    // Default code to review if no taskData provided
    const codeToReview = taskData || `
function processUser(user) {
  if (user.name && user.email) {
    return user.name + " - " + user.email;
  }
  return null;
}`;

    const prompt = `Perform a comprehensive code review of the following code. Check for:
- Code quality and best practices
- Potential bugs or issues
- Security vulnerabilities
- Performance optimizations
- Type safety improvements
- Documentation needs

Code to review:
\`\`\`
${codeToReview}
\`\`\`

Provide specific suggestions for improvement.`;

    try {
      const messages: ChatMessage[] = [
        { role: 'user', content: prompt },
      ];
      const text = await modelProvider.generateResponse({
        messages,
        maxTokens: 600,
      });

      return {
        review: text,
        code: codeToReview,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('Error in code review:', error);
      return {
        error: error.message,
        code: codeToReview,
        timestamp: new Date().toISOString()
      };
    }
  }

  protected async onStop(): Promise<void> {
    console.log('Code Review Agent cleaned up');
  }

  // Keep legacy methods for backward compatibility
  async run(taskData: string): Promise<any> {
    return await this.onExecuteTask(taskData);
  }

  async cleanup(): Promise<void> {
    return await this.onStop();
  }
}
