import { BaseAgent } from './base-agent';
import { modelProvider, ChatMessage } from '../../ai/model-provider';
import chalk from 'chalk';
import { z } from 'zod';

const CodeAnalysisSchema = z.object({
  language: z.string(),
  complexity: z.enum(['low', 'medium', 'high']),
  issues: z.array(z.object({
    type: z.enum(['bug', 'performance', 'security', 'style', 'maintainability']),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    message: z.string(),
    line: z.number().optional(),
    suggestion: z.string().optional(),
  })),
  metrics: z.object({
    linesOfCode: z.number(),
    functions: z.number(),
    complexity: z.number(),
  }),
});

const CodeGenerationSchema = z.object({
  code: z.string(),
  language: z.string(),
  explanation: z.string(),
  dependencies: z.array(z.string()).optional(),
  usage: z.string().optional(),
  tests: z.string().optional(),
});

export class CodingAgent extends BaseAgent {
  id = 'coding';
  capabilities = ["general-coding", "refactoring", "problem-solving"];
  specialization = 'General purpose coding assistance';
  name = 'coding-agent';
  description = 'Advanced coding assistant for analysis, generation, and optimization';

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory);
  }

  protected async onInitialize(): Promise<void> {
    console.log('Coding Agent initialized');
  }

  protected async onStop(): Promise<void> {
    console.log('Coding Agent stopped');
  }

  async analyzeCode(code: string): Promise<any> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert code analyzer. Analyze the provided code and return structured information about:
        - Programming language
        - Code complexity (low/medium/high)
        - Issues found (bugs, performance, security, style, maintainability)
        - Code metrics (lines of code, functions, complexity score)
        
        For each issue, provide:
        - Type and severity
        - Clear message describing the issue  
        - Line number if applicable
        - Suggestion for improvement`,
      },
      {
        role: 'user',
        content: `Analyze this code:\n\n\`\`\`\n${code}\n\`\`\``,
      },
    ];

    try {
      return await modelProvider.generateStructured({
        messages,
        schema: CodeAnalysisSchema,
        schemaName: 'CodeAnalysis',
        schemaDescription: 'Structured code analysis with issues and metrics',
      });
    } catch (error) {
      console.log(chalk.red(`Error in code analysis: ${error}`));
      return { error: 'Code analysis failed', code };
    }
  }

  async generateCode(description: string, language = 'typescript'): Promise<any> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert ${language} developer. Generate clean, well-documented, production-ready code based on the user's description.
        
        Include:
        - Clean, readable code following best practices
        - Proper error handling
        - Type safety (for TypeScript)
        - Clear explanation of the implementation
        - Required dependencies if any
        - Usage examples
        - Basic tests if applicable`,
      },
      {
        role: 'user',
        content: `Generate ${language} code for: ${description}`,
      },
    ];

    try {
      return await modelProvider.generateStructured({
        messages,
        schema: CodeGenerationSchema,
        schemaName: 'CodeGeneration',
        schemaDescription: 'Generated code with explanation and metadata',
      });
    } catch (error) {
      console.log(chalk.red(`Error in code generation: ${error}`));
      return { error: 'Code generation failed', description };
    }
  }

  async optimizeCode(code: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert code optimizer. Improve the provided code for:
        - Performance optimization
        - Memory efficiency
        - Readability and maintainability
        - Modern language features
        - Best practices
        
        Provide the optimized code with comments explaining the improvements.`,
      },
      {
        role: 'user',
        content: `Optimize this code:\n\n\`\`\`\n${code}\n\`\`\``,
      },
    ];

    try {
      return await modelProvider.generateResponse({ messages });
    } catch (error: any) {
      return `Error in code optimization: ${error.message}`;
    }
  }

  async explainCode(code: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a code explainer. Break down the provided code into clear, understandable explanations:
        - What the code does (high-level purpose)
        - How it works (step-by-step breakdown)
        - Key concepts and patterns used
        - Potential improvements or considerations
        
        Use clear, educational language suitable for developers learning the codebase.`,
      },
      {
        role: 'user',
        content: `Explain this code:\n\n\`\`\`\n${code}\n\`\`\``,
      },
    ];

    try {
      return await modelProvider.generateResponse({ messages });
    } catch (error: any) {
      return `Error in code explanation: ${error.message}`;
    }
  }

  async debugCode(code: string, error?: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert debugger. Help identify and fix issues in the provided code:
        - Identify potential bugs and errors
        - Suggest fixes with explanations
        - Provide corrected code if needed
        - Explain debugging techniques used`,
      },
      {
        role: 'user',
        content: `Debug this code${error ? ` (Error: ${error})` : ''}:\n\n\`\`\`\n${code}\n\`\`\``,
      },
    ];

    try {
      return await modelProvider.generateResponse({ messages });
    } catch (error: any) {
      return `Error in debugging: ${error.message}`;
    }
  }

  async generateTests(code: string, framework = 'jest'): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a testing expert. Generate comprehensive tests for the provided code using ${framework}:
        - Unit tests covering main functionality
        - Edge cases and error conditions
        - Mock external dependencies if needed
        - Clear test descriptions
        - Good test structure and organization`,
      },
      {
        role: 'user',
        content: `Generate ${framework} tests for this code:\n\n\`\`\`\n${code}\n\`\`\``,
      },
    ];

    try {
      return await modelProvider.generateResponse({ messages });
    } catch (error: any) {
      return `Error in test generation: ${error.message}`;
    }
  }

  protected async onExecuteTask(task: any): Promise<any> {
    const taskData = typeof task === 'string' ? task : task.data;
    if (!taskData) {
      return {
        message: 'Coding agent ready! Available commands: analyze, generate, optimize, explain, debug, test',
        capabilities: [
          'Code analysis with issue detection',
          'Code generation from descriptions',
          'Performance optimization',
          'Code explanation and documentation',
          'Bug debugging and fixes',
          'Test generation',
        ],
      };
    }

    // Parse taskData to determine action
    const lowerTask = taskData.toLowerCase();

    if (lowerTask.includes('analyze') || lowerTask.includes('review')) {
      // Extract code from taskData (assume code is in backticks or after "analyze:")
      const codeMatch = taskData.match(/```[\s\S]*?```|analyze:\s*([\s\S]*)/i);
      if (codeMatch) {
        const code = codeMatch[0].replace(/```/g, '').trim();
        return await this.analyzeCode(code);
      }
    }

    if (lowerTask.includes('generate') || lowerTask.includes('create')) {
      const description = taskData.replace(/(generate|create)\s*/i, '');
      return await this.generateCode(description);
    }

    if (lowerTask.includes('optimize') || lowerTask.includes('improve')) {
      const codeMatch = taskData.match(/```[\s\S]*?```|optimize:\s*([\s\S]*)/i);
      if (codeMatch) {
        const code = codeMatch[0].replace(/```/g, '').trim();
        return await this.optimizeCode(code);
      }
    }

    if (lowerTask.includes('explain') || lowerTask.includes('understand')) {
      const codeMatch = taskData.match(/```[\s\S]*?```|explain:\s*([\s\S]*)/i);
      if (codeMatch) {
        const code = codeMatch[0].replace(/```/g, '').trim();
        return await this.explainCode(code);
      }
    }

    if (lowerTask.includes('debug') || lowerTask.includes('fix')) {
      const codeMatch = taskData.match(/```[\s\S]*?```|debug:\s*([\s\S]*)/i);
      if (codeMatch) {
        const code = codeMatch[0].replace(/```/g, '').trim();
        return await this.debugCode(code);
      }
    }

    if (lowerTask.includes('test') || lowerTask.includes('spec')) {
      const codeMatch = taskData.match(/```[\s\S]*?```|test:\s*([\s\S]*)/i);
      if (codeMatch) {
        const code = codeMatch[0].replace(/```/g, '').trim();
        return await this.generateTests(code);
      }
    }

    // Default: treat as a general coding question
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert coding assistant specializing in TypeScript, JavaScript, and modern web development.
        
Your capabilities include:
        - Writing clean, efficient, and well-documented code
        - Debugging and fixing code issues
        - Code review and optimization suggestions
        - Explaining complex programming concepts
        - Following best practices and modern patterns
        
Always provide clear explanations with your code solutions.`,
      },
      {
        role: 'user',
        content: taskData,
      },
    ];

    try {
      const response = await modelProvider.generateResponse({ messages });
      return { response, taskData };
    } catch (error: any) {
      return { error: error.message, taskData };
    }
  }

  // Keep legacy methods for backward compatibility
  async run(taskData: string): Promise<any> {
    return await this.onExecuteTask(taskData);
  }

  async cleanup(): Promise<void> {
    return await this.onStop();
  }
}