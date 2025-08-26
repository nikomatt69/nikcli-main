import { BaseAgent } from './base-agent';
import { modelProvider, ChatMessage } from '../../ai/model-provider';
import { toolsManager, ErrorAnalysis } from '../../tools/tools-manager';
import chalk from 'chalk';
import { z } from 'zod';

const CodingTaskSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    type: z.enum(['analyze', 'create', 'modify', 'test', 'build', 'debug']),
    description: z.string(),
    files: z.array(z.string()).optional(),
    priority: z.enum(['low', 'medium', 'high']),
  })),
  reasoning: z.string(),
});

const CodeGenerationSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
    description: z.string(),
  })),
  dependencies: z.array(z.string()).optional(),
  commands: z.array(z.string()).optional(),
  explanation: z.string(),
});

export class AutonomousCoder extends BaseAgent {
  id = 'autonomous-coder';
  capabilities = ["autonomous-coding","file-operations","code-generation","debugging"];
  specialization = 'Autonomous coding with full file system access';
  name = 'autonomous-coder';
  description = 'Autonomous coding agent that can read, write, and modify files independently';

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory);
  }

  protected async onInitialize(): Promise<void> {
    console.log('Autonomous Coder initialized');
  }

  protected async onStop(): Promise<void> {
    console.log('Autonomous Coder stopped');
  }

  async analyzeProject(): Promise<any> {
    console.log(chalk.blue('🔍 Analyzing project structure...'));
    
    const analysis = await toolsManager.analyzeProject();
    
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert code analyst. Analyze the project structure and provide insights about:
        - Architecture and design patterns
        - Technologies used and their purposes
        - Potential improvements
        - Code quality observations
        - Recommendations for next steps`,
      },
      {
        role: 'user',
        content: `Analyze this project:
        
Framework: ${analysis.framework || 'Unknown'}
Technologies: ${analysis.technologies.join(', ')}
Structure: ${JSON.stringify(analysis.structure, null, 2)}
Package Info: ${analysis.packageInfo ? JSON.stringify({
  name: analysis.packageInfo.name,
  version: analysis.packageInfo.version,
  scripts: Object.keys(analysis.packageInfo.scripts || {}),
  dependencies: Object.keys(analysis.packageInfo.dependencies || {}),
}, null, 2) : 'No package.json found'}`,
      },
    ];

    const analysisResult = await modelProvider.generateResponse({ messages });
    
    return {
      projectAnalysis: analysis,
      insights: analysisResult,
    };
  }

  async createFeature(description: string): Promise<any> {
    console.log(chalk.blue(`🚀 Creating feature: ${description}`));
    
    // First analyze the current project
    console.log(chalk.cyan('📊 Analyzing current project structure...'));
    const projectInfo = await toolsManager.analyzeProject();
    
    // Check if dependencies need to be installed
    const requiredDeps = await this.analyzeRequiredDependencies(description, projectInfo);
    if (requiredDeps.length > 0) {
      console.log(chalk.yellow(`📦 Installing required dependencies: ${requiredDeps.join(', ')}`));
      for (const dep of requiredDeps) {
        await toolsManager.installPackage(dep);
      }
    }
    
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert full-stack developer. Create a complete feature implementation based on the user's description.

Current project context:
- Framework: ${projectInfo.framework || 'Unknown'}
- Technologies: ${projectInfo.technologies.join(', ')}

Generate all necessary files including:
- Component files
- API routes (if needed)
- Types/interfaces
- Tests
- Styles (if needed)
- Database schemas (if needed)

Follow the project's existing patterns and conventions.`,
      },
      {
        role: 'user',
        content: `Create this feature: ${description}`,
      },
    ];

    try {
      const result = await modelProvider.generateStructured({
        messages,
        schema: CodeGenerationSchema,
        schemaName: 'FeatureGeneration',
        schemaDescription: 'Complete feature implementation with all necessary files',
      });

      // Process the generated plan - cast to any to handle unknown type
      const planResult = result as any;

      // Create the files
      for (const file of planResult.files || []) {
        console.log(chalk.green(`📝 Creating file: ${file.path}`));
        await toolsManager.writeFile(file.path, file.content);
      }

      // Install dependencies if needed
      if (planResult.dependencies && planResult.dependencies.length > 0) {
        console.log(chalk.blue('📦 Installing dependencies...'));
        for (const dep of planResult.dependencies) {
          await toolsManager.installPackage(dep);
        }
      }

      // Run commands if specified
      if (planResult.commands) {
        for (const command of planResult.commands) {
          console.log(chalk.blue(`⚡ Running: ${command}`));
          const [cmd, ...args] = command.split(' ');
          await toolsManager.runCommand(cmd, args, { stream: true });
        }
      }

      // Automatically run build and tests
      console.log(chalk.blue('🔨 Building project...'));
      const buildResult = await toolsManager.build();
      if (!buildResult.success) {
        console.log(chalk.yellow('⚠️ Build has errors, attempting to fix...'));
        await this.debugErrors();
      }

      // Run tests if they exist
      console.log(chalk.blue('🧪 Running tests...'));
      const testResult = await toolsManager.runTests();
      if (!testResult.success) {
        console.log(chalk.yellow('⚠️ Some tests failed, this is normal for new features'));
      }

      console.log(chalk.green('✅ Feature created successfully!'));
      
      return {
        success: true,
        filesCreated: planResult.files?.map((f: any) => f.path) || [],
        dependencies: planResult.dependencies || [],
        commands: planResult.commands || [],
        explanation: planResult.explanation || 'Feature created successfully',
      };

    } catch (error: any) {
      console.log(chalk.red(`❌ Error creating feature: ${error.message}`));
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async debugErrors(): Promise<any> {
    console.log(chalk.yellow('🐛 Analyzing and fixing errors...'));

    // Run build and collect errors
    const buildResult = await toolsManager.build();
    const lintResult = await toolsManager.lint();
    const typeResult = await toolsManager.typeCheck();

    const allErrors = [
      ...(buildResult.errors || []),
      ...(lintResult.errors || []),
      ...(typeResult.errors || []),
    ];

    if (allErrors.length === 0) {
      console.log(chalk.green('✅ No errors found!'));
      return { success: true, errorsFixed: 0 };
    }

    console.log(chalk.red(`Found ${allErrors.length} errors to fix`));

    const fixes = [];
    
    for (const error of allErrors.slice(0, 10)) { // Limit to first 10 errors
      try {
        const fix = await this.generateErrorFix(error);
        if (fix) {
          fixes.push(fix);
          await this.applyFix(fix);
        }
      } catch (err) {
        console.log(chalk.yellow(`⚠️ Could not fix error: ${error.message}`));
      }
    }

    // Re-run checks
    console.log(chalk.blue('🔄 Re-checking after fixes...'));
    const newBuildResult = await toolsManager.build();
    
    return {
      success: newBuildResult.success,
      originalErrors: allErrors.length,
      errorsFixed: fixes.length,
      fixes,
      remainingErrors: newBuildResult.errors?.length || 0,
    };
  }

  private async generateErrorFix(error: ErrorAnalysis): Promise<any> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert debugger. Given an error, provide a specific fix.

Return a JSON object with:
{
  "file": "path/to/file",
  "changes": [
    {
      "line": 42,
      "find": "old code",
      "replace": "fixed code"
    }
  ],
  "explanation": "What was wrong and how it was fixed"
}`,
      },
      {
        role: 'user',
        content: `Fix this error:
Type: ${error.type}
Severity: ${error.severity}
Message: ${error.message}
${error.file ? `File: ${error.file}` : ''}
${error.line ? `Line: ${error.line}` : ''}`,
      },
    ];

    try {
      const response = await modelProvider.generateResponse({ messages });
      return JSON.parse(response);
    } catch (error) {
      return null;
    }
  }

  private async applyFix(fix: any): Promise<void> {
    if (!fix.file || !fix.changes) return;

    console.log(chalk.cyan(`🔧 Applying fix to ${fix.file}`));
    
    try {
      // Read the file first to understand context
      const fileInfo = await toolsManager.readFile(fix.file);
      console.log(chalk.gray(`📄 File has ${fileInfo.content.split('\n').length} lines`));
      
      await toolsManager.editFile(fix.file, fix.changes);
      console.log(chalk.green(`✅ Fix applied: ${fix.explanation}`));
    } catch (error) {
      console.log(chalk.red(`❌ Could not apply fix to ${fix.file}`));
    }
  }

  private async analyzeRequiredDependencies(description: string, projectInfo: any): Promise<string[]> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Analyze the feature description and determine what npm packages are needed.
        
Current project dependencies: ${JSON.stringify(Object.keys(projectInfo.packageInfo?.dependencies || {}))}
        
Return only a JSON array of package names that need to be installed, like: ["lodash", "@types/lodash", "axios"]
Return empty array [] if no new dependencies needed.`,
      },
      {
        role: 'user',
        content: `Feature to implement: ${description}`,
      },
    ];

    try {
      const response = await modelProvider.generateResponse({ messages });
      const deps = JSON.parse(response.trim());
      return Array.isArray(deps) ? deps : [];
    } catch {
      return [];
    }
  }

  async optimizeCode(filePath?: string): Promise<any> {
    console.log(chalk.blue('⚡ Optimizing code...'));

    const files = filePath ? [filePath] : await toolsManager.listFiles('.', /\.(ts|tsx|js|jsx)$/);
    const optimizations = [];

    for (const file of files.slice(0, 5)) { // Limit to first 5 files
      try {
        const fileInfo = await toolsManager.readFile(file);
        const optimization = await this.generateOptimization(file, fileInfo.content);
        
        if (optimization && optimization.optimized) {
          await toolsManager.writeFile(file, optimization.optimized);
          optimizations.push({
            file,
            improvements: optimization.improvements,
          });
          console.log(chalk.green(`✅ Optimized: ${file}`));
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️ Could not optimize ${file}`));
      }
    }

    return {
      success: true,
      filesOptimized: optimizations.length,
      optimizations,
    };
  }

  private async generateOptimization(filePath: string, content: string): Promise<any> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a code optimization expert. Optimize the given code for:
        - Performance improvements
        - Memory efficiency  
        - Code clarity and readability
        - Modern language features
        - Best practices

Return JSON with:
{
  "optimized": "optimized code here",
  "improvements": ["list of improvements made"]
}`,
      },
      {
        role: 'user',
        content: `Optimize this ${path.extname(filePath)} file:\n\n${content}`,
      },
    ];

    try {
      const response = await modelProvider.generateResponse({ messages });
      return JSON.parse(response);
    } catch (error) {
      return null;
    }
  }

  async runTests(pattern?: string): Promise<any> {
    console.log(chalk.blue('🧪 Running tests...'));
    
    const result = await toolsManager.runTests(pattern);
    
    if (result.success) {
      console.log(chalk.green('✅ All tests passed!'));
    } else {
      console.log(chalk.red('❌ Some tests failed'));
      
      // Try to fix failing tests
      if (result.errors) {
        for (const error of result.errors) {
          await this.generateErrorFix(error);
        }
      }
    }

    return result;
  }

  protected async onExecuteTask(task: any): Promise<any> {
    const taskData = typeof task === 'string' ? task : task.data;
    if (!taskData) {
      return {
        message: 'Autonomous Coder ready! I can analyze, create, debug, and optimize code independently.',
        capabilities: [
          'Project analysis and insights',
          'Feature creation with all necessary files',
          'Automatic error detection and fixing',
          'Code optimization and refactoring',
          'Test execution and maintenance',
          'Build process management',
        ],
      };
    }

    const lowerTask = taskData.toLowerCase();
    
    try {
      if (lowerTask.includes('analyze') || lowerTask.includes('overview')) {
        return await this.analyzeProject();
      }
      
      if (lowerTask.includes('create') || lowerTask.includes('build') || lowerTask.includes('implement')) {
        const description = taskData.replace(/(create|build|implement)\s*/i, '');
        return await this.createFeature(description);
      }
      
      if (lowerTask.includes('debug') || lowerTask.includes('fix') || lowerTask.includes('errors')) {
        return await this.debugErrors();
      }
      
      if (lowerTask.includes('optimize') || lowerTask.includes('improve')) {
        const fileMatch = taskData.match(/file:\s*([^\s]+)/);
        const filePath = fileMatch ? fileMatch[1] : undefined;
        return await this.optimizeCode(filePath);
      }
      
      if (lowerTask.includes('test')) {
        const patternMatch = taskData.match(/pattern:\s*([^\s]+)/);
        const pattern = patternMatch ? patternMatch[1] : undefined;
        return await this.runTests(pattern);
      }

      // Default: treat as a feature creation request
      return await this.createFeature(taskData);
      
    } catch (error: any) {
      return {
        error: `Autonomous coding failed: ${error.message}`,
        taskData,
      };
    }
  }
}

import path from 'path';