import { BaseAgent } from './base-agent';
import { modelProvider, ChatMessage } from '../../ai/model-provider';
import { toolsManager } from '../../tools/tools-manager';
import chalk from 'chalk';

export class ReactAgent extends BaseAgent {
  id = 'react';
  capabilities = ["react", "tsx", "frontend", "components", "nextjs", "typescript"];
  specialization = 'React and frontend development';
  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory);
  }

  protected async onInitialize(): Promise<void> {
    console.log('React Agent initialized');
  }

  protected async onStop(): Promise<void> {
    console.log('React Agent stopped');
  }

  protected async onExecuteTask(task: any): Promise<any> {
    const taskData = typeof task === 'string' ? task : task.data;
    if (!taskData) {
      return {
        message: 'React Expert ready! I can help with components, hooks, state management, and Next.js',
        specialties: [
          'React components and TSX with automatic file creation',
          'TypeScript',
          'Custom hooks and state management setup',
          'Next.js routing and SSR/SSG with project analysis',
          'Performance optimization with code review',
          'TypeScript integration with automatic type checking',
          'Testing with React Testing Library setup',
          'Automatic dependency installation and project setup',
        ],
      };
    }

    try {
      // First analyze the project structure
      console.log(chalk.cyan('📊 Analyzing React/Next.js project...'));
      const projectInfo = await toolsManager.analyzeProject();

      // Check if it's a React/Next.js project
      const isReactProject = projectInfo.framework === 'React' || projectInfo.framework === 'Next.js' ||
        projectInfo.technologies.some(tech => tech.includes('React') || tech.includes('Next'));

      if (!isReactProject) {
        console.log(chalk.yellow('⚠️ This doesn\'t appear to be a React project. Setting up React environment...'));

        // Install React dependencies if needed
        const reactDeps = ['react', '@types/react'];
        if (projectInfo.framework !== 'Next.js') {
          reactDeps.push('react-dom', '@types/react-dom');
        }

        for (const dep of reactDeps) {
          await toolsManager.installPackage(dep);
        }
      }

      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are a React/Next.js expert developer who can create files, install dependencies, and set up complete React solutions.

Current Project Context:
- Framework: ${projectInfo.framework || 'Generic'}
- Technologies: ${projectInfo.technologies.join(', ')}
- Has React: ${isReactProject ? 'Yes' : 'Newly added'}

You have access to tools to:
- Create and modify files automatically
- Install npm packages
- Run build commands
- Set up project structure

When creating React components or features:
1. Determine what files need to be created
2. Check if additional dependencies are needed
3. Create the files with proper TypeScript types
4. Follow modern React patterns (hooks, functional components)
5. Include proper imports and exports
6. Add basic tests if appropriate

Always provide complete, working solutions with:
- Clean, type-safe code
- Modern React patterns
- Performance considerations
- Accessibility best practices
- Proper file structure`,
        },
        {
          role: 'user',
          content: taskData,
        },
      ];

      const response = await modelProvider.generateResponse({ messages });

      // Try to extract and create files if the AI suggests them
      await this.processReactResponse(response, taskData);

      return {
        response,
        taskData,
        agent: 'React Expert',
        projectAnalyzed: true,
        frameworkDetected: projectInfo.framework,
      };

    } catch (error: any) {
      return { error: error.message, taskData, agent: 'React Expert' };
    }
  }

  private async processReactResponse(response: string, originalTask: string): Promise<void> {
    // Look for file creation suggestions in the response
    const fileMatches = response.match(/```[\w]*\n([\s\S]*?)\n```/g);

    if (fileMatches && originalTask.toLowerCase().includes('create')) {
      console.log(chalk.blue('🚀 Creating React files based on response...'));

      for (let i = 0; i < fileMatches.length; i++) {
        const codeBlock = fileMatches[i];
        const code = codeBlock.replace(/```[\w]*\n/, '').replace(/\n```$/, '');

        // Try to determine filename from context or use generic names
        let filename = this.extractFilename(response, codeBlock) || `component-${i + 1}.tsx`;

        // Ensure it's in the right directory
        if (!filename.includes('/')) {
          filename = `src/components/${filename}`;
        }

        try {
          await toolsManager.writeFile(filename, code);
          console.log(chalk.green(`✅ Created React file: ${filename}`));
        } catch (error) {
          console.log(chalk.yellow(`⚠️ Could not create file: ${filename}`));
        }
      }

      // Run type checking after creating files
      console.log(chalk.blue('🔍 Running TypeScript type check...'));
      const typeResult = await toolsManager.typeCheck();
      if (!typeResult.success) {
        console.log(chalk.yellow('⚠️ Type errors detected, this is normal for new components'));
      }
    }
  }

  private extractFilename(response: string, codeBlock: string): string | null {
    // Look for filename mentions near the code block
    const lines = response.split('\n');
    const codeIndex = lines.findIndex(line => line.includes(codeBlock.split('\n')[0]));

    // Check a few lines before the code block for filename hints
    for (let i = Math.max(0, codeIndex - 5); i < codeIndex; i++) {
      const line = lines[i];
      const filenameMatch = line.match(/([a-zA-Z][a-zA-Z0-9-_]*\.(tsx?|jsx?))/);
      if (filenameMatch) {
        return filenameMatch[1];
      }
    }

    // Look for component names in the code
    const componentMatch = codeBlock.match(/(?:export\s+(?:default\s+)?(?:function|const)\s+|class\s+)([A-Z][a-zA-Z0-9]*)/);
    if (componentMatch) {
      return `${componentMatch[1]}.tsx`;
    }

    return null;
  }

  // Keep legacy methods for backward compatibility
  async run(taskData: string): Promise<any> {
    return await this.onExecuteTask(taskData);
  }

  async cleanup(): Promise<void> {
    return await this.onStop();
  }
}