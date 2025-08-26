import { BaseAgent } from './base-agent';
import { modelProvider, ChatMessage } from '../../ai/model-provider';
import { toolsManager, SystemInfo } from '../../tools/tools-manager';
import chalk from 'chalk';
import { z } from 'zod';

const SystemCommandSchema = z.object({
  commands: z.array(z.object({
    command: z.string(),
    description: z.string(),
    sudo: z.boolean().optional(),
    interactive: z.boolean().optional(),
    timeout: z.number().optional(),
  })),
  reasoning: z.string(),
  warnings: z.array(z.string()).optional(),
});

export class SystemAdminAgent extends BaseAgent {
  id = 'system-admin';
  capabilities = ["system-administration","server-management","monitoring"];
  specialization = 'System administration and server management';
  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory);
  }

  protected async onInitialize(): Promise<void> {
    console.log('System Admin Agent initialized');
  }

  protected async onStop(): Promise<void> {
    console.log('System Admin Agent stopped');
  }

  async analyzeSystem(): Promise<any> {
    console.log(chalk.blue('🔍 Analyzing system...'));
    
    const systemInfo = await toolsManager.getSystemInfo();
    const dependencies = await toolsManager.checkDependencies([
      'node', 'npm', 'git', 'docker', 'python3', 'curl', 'wget', 'code'
    ]);
    
    const runningProcesses = toolsManager.getRunningProcesses();
    const commandHistory = toolsManager.getCommandHistory(10);

    console.log(chalk.green('📊 System Analysis Complete:'));
    console.log(chalk.gray(`Platform: ${systemInfo.platform} (${systemInfo.arch})`));
    console.log(chalk.gray(`Node.js: ${systemInfo.nodeVersion}`));
    console.log(chalk.gray(`Memory: ${Math.round(systemInfo.memory.used / 1024 / 1024 / 1024 * 100) / 100}GB / ${Math.round(systemInfo.memory.total / 1024 / 1024 / 1024 * 100) / 100}GB`));
    console.log(chalk.gray(`CPUs: ${systemInfo.cpus}`));

    return {
      systemInfo,
      dependencies,
      runningProcesses: runningProcesses.length,
      recentCommands: commandHistory.length,
      analysis: {
        nodeInstalled: !!systemInfo.nodeVersion,
        npmInstalled: !!systemInfo.npmVersion,
        gitInstalled: !!systemInfo.gitVersion,
        dockerInstalled: !!systemInfo.dockerVersion,
        memoryUsage: (systemInfo.memory.used / systemInfo.memory.total) * 100,
      },
    };
  }

  async executeCommands(commandsDescription: string): Promise<any> {
    console.log(chalk.blue(`⚡ Planning command execution: ${commandsDescription}`));

    const systemInfo = await toolsManager.getSystemInfo();
    
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a system administrator AI. Plan and execute terminal commands safely.

Current system: ${systemInfo.platform} ${systemInfo.arch}
Node.js: ${systemInfo.nodeVersion}
Available tools: ${systemInfo.npmVersion ? 'npm' : ''} ${systemInfo.gitVersion ? 'git' : ''} ${systemInfo.dockerVersion ? 'docker' : ''}

IMPORTANT SAFETY RULES:
1. Never run destructive commands (rm -rf, dd, mkfs, etc.)
2. Always explain what each command does
3. Use sudo only when absolutely necessary
4. Provide warnings for potentially dangerous operations
5. Suggest alternatives for risky commands

Generate a structured plan with commands to execute.`,
      },
      {
        role: 'user',
        content: commandsDescription,
      },
    ];

    try {
      const plan = await modelProvider.generateStructured({
        messages,
        schema: SystemCommandSchema,
        schemaName: 'SystemCommands',
        schemaDescription: 'Structured plan for system command execution',
      });

      // Cast to any to handle unknown type
      const planResult = plan as any;
      
      console.log(chalk.blue.bold('\n📋 Command Execution Plan:'));
      console.log(chalk.gray(`Reasoning: ${planResult.reasoning || 'No reasoning provided'}`));
      
      if (planResult.warnings && planResult.warnings.length > 0) {
        console.log(chalk.yellow.bold('\n⚠️  Warnings:'));
        planResult.warnings.forEach((warning: string) => {
          console.log(chalk.yellow(`• ${warning}`));
        });
      }

      console.log(chalk.blue.bold('\nCommands to execute:'));
      (planResult.commands || []).forEach((cmd: any, index: number) => {
        console.log(`${index + 1}. ${chalk.cyan(cmd.command)}`);
        console.log(`   ${chalk.gray(cmd.description)}`);
        if (cmd.sudo) console.log(`   ${chalk.red('⚠️ Requires sudo')}`);
      });

      // Ask for confirmation
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const confirm = await new Promise<boolean>((resolve) => {
        readline.question(chalk.yellow('\nExecute these commands? (y/N): '), (answer: string) => {
          readline.close();
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
      });

      if (!confirm) {
        console.log(chalk.yellow('Command execution cancelled'));
        return { cancelled: true, plan };
      }

      // Execute commands
      const results = [];
      for (const cmd of planResult.commands || []) {
        console.log(chalk.blue(`\n🔄 Executing: ${cmd.command}`));
        
        const [command, ...args] = cmd.command.split(' ');
        const result = await toolsManager.runCommand(command, args, {
          sudo: cmd.sudo,
          interactive: cmd.interactive,
          timeout: cmd.timeout,
          stream: true,
        });

        results.push({
          command: cmd.command,
          success: result.code === 0,
          output: result.stdout + result.stderr,
          exitCode: result.code,
        });

        if (result.code !== 0) {
          console.log(chalk.red(`❌ Command failed: ${cmd.command}`));
          console.log(chalk.gray('Stopping execution due to failure'));
          break;
        } else {
          console.log(chalk.green(`✅ Command completed: ${cmd.command}`));
        }
      }

      return {
        success: results.every(r => r.success),
        plan,
        results,
        executed: results.length,
        total: (planResult.commands || []).length,
      };

    } catch (error: any) {
      console.log(chalk.red(`❌ Error planning commands: ${error.message}`));
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async installDependencies(packages: string[], options: { global?: boolean; dev?: boolean; manager?: string } = {}): Promise<any> {
    console.log(chalk.blue(`📦 Installing packages: ${packages.join(', ')}`));
    
    const results = [];
    const manager = options.manager || 'npm';

    for (const pkg of packages) {
      console.log(chalk.cyan(`Installing ${pkg} with ${manager}...`));
      
      const success = await toolsManager.installPackage(pkg, {
        global: options.global,
        dev: options.dev,
        manager: manager as any,
      });

      results.push({ package: pkg, success });
      
      if (!success) {
        console.log(chalk.yellow(`⚠️ Failed to install ${pkg}, continuing with others...`));
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(chalk.blue.bold(`\n📊 Installation Summary:`));
    console.log(chalk.green(`✅ Successful: ${successful}`));
    console.log(chalk.red(`❌ Failed: ${failed}`));

    return {
      success: failed === 0,
      results,
      summary: { successful, failed, total: packages.length },
    };
  }

  async manageProcesses(action: 'list' | 'kill', pid?: number): Promise<any> {
    if (action === 'list') {
      const processes = toolsManager.getRunningProcesses();
      
      console.log(chalk.blue.bold('\n🔄 Running Processes:'));
      if (processes.length === 0) {
        console.log(chalk.gray('No processes currently running'));
        return { processes: [] };
      }

      processes.forEach(proc => {
        const duration = Date.now() - proc.startTime.getTime();
        console.log(`PID ${chalk.cyan(proc.pid.toString())}: ${chalk.bold(proc.command)} ${proc.args.join(' ')}`);
        console.log(`   Status: ${proc.status} | Duration: ${Math.round(duration / 1000)}s`);
        console.log(`   Working Dir: ${proc.cwd}`);
      });

      return { processes };

    } else if (action === 'kill' && pid) {
      console.log(chalk.yellow(`⚠️ Attempting to kill process ${pid}...`));
      
      const success = await toolsManager.killProcess(pid);
      
      return {
        success,
        action: 'kill',
        pid,
      };
    }

    return { error: 'Invalid action or missing PID' };
  }

  async createProject(projectType: string, projectName: string): Promise<any> {
    console.log(chalk.blue(`🚀 Creating ${projectType} project: ${projectName}`));
    
    const validTypes = ['react', 'next', 'node', 'express'];
    if (!validTypes.includes(projectType)) {
      return {
        success: false,
        error: `Invalid project type. Supported: ${validTypes.join(', ')}`,
      };
    }

    const result = await toolsManager.setupProject(projectType as any, projectName);
    
    return result;
  }

  async runScript(script: string, language: 'bash' | 'python' | 'node' = 'bash'): Promise<any> {
    console.log(chalk.blue(`📝 Running ${language} script...`));
    console.log(chalk.gray(`Script:\n${script}`));
    
    const result = await toolsManager.runScript(script, { language });
    
    if (result.success) {
      console.log(chalk.green('✅ Script executed successfully'));
    } else {
      console.log(chalk.red('❌ Script execution failed'));
    }
    
    console.log(chalk.blue('Output:'));
    console.log(result.output);
    
    return result;
  }

  async monitorSystem(duration: number = 30): Promise<any> {
    console.log(chalk.blue(`👀 Monitoring system for ${duration} seconds...`));
    
    const startTime = Date.now();
    const samples = [];
    
    const interval = setInterval(async () => {
      const systemInfo = await toolsManager.getSystemInfo();
      const processes = toolsManager.getRunningProcesses();
      
      samples.push({
        timestamp: new Date(),
        memoryUsed: systemInfo.memory.used,
        processCount: processes.length,
      });
      
      console.log(chalk.cyan(`📊 Memory: ${Math.round(systemInfo.memory.used / 1024 / 1024 / 1024 * 100) / 100}GB | Processes: ${processes.length}`));
      
    }, 5000); // Sample every 5 seconds

    setTimeout(() => {
      clearInterval(interval);
      console.log(chalk.green(`✅ Monitoring complete. Collected ${samples.length} samples`));
    }, duration * 1000);

    return {
      duration,
      samplesCollected: samples.length,
      monitoringActive: true,
    };
  }

  protected async onExecuteTask(task: any): Promise<any> {
    const taskData = typeof task === 'string' ? task : task.data;
    if (!taskData) {
      return {
        message: 'System Admin Agent ready! I can execute terminal commands, manage processes, install packages, and monitor the system.',
        capabilities: [
          'Execute any terminal command safely',
          'Install packages and dependencies',
          'Manage running processes',
          'Create new projects',
          'Run scripts in multiple languages',
          'Monitor system resources',
          'Analyze system configuration',
        ],
        availableCommands: [
          'analyze system',
          'install <packages>',
          'run command: <command>',
          'create project <type> <name>',
          'run script: <script>',
          'list processes',
          'kill process <pid>',
          'monitor system',
        ],
      };
    }

    const lowerTask = taskData.toLowerCase();
    
    try {
      if (lowerTask.includes('analyze') || lowerTask.includes('system info')) {
        return await this.analyzeSystem();
      }
      
      if (lowerTask.includes('install')) {
        const packages = taskData.match(/install\s+(.+)/i)?.[1]?.split(/\s+/) || [];
        const isGlobal = lowerTask.includes('global') || lowerTask.includes('-g');
        const isDev = lowerTask.includes('dev') || lowerTask.includes('--save-dev');
        
        return await this.installDependencies(packages, { global: isGlobal, dev: isDev });
      }
      
      if (lowerTask.includes('run command') || lowerTask.includes('execute')) {
        const command = taskData.replace(/(run command|execute):\s*/i, '');
        return await this.executeCommands(command);
      }
      
      if (lowerTask.includes('create project')) {
        const match = taskData.match(/create project\s+(\w+)\s+(.+)/i);
        if (match) {
          const [, type, name] = match;
          return await this.createProject(type, name);
        }
      }
      
      if (lowerTask.includes('run script')) {
        const script = taskData.replace(/run script:\s*/i, '');
        const language = lowerTask.includes('python') ? 'python' : 
                        lowerTask.includes('node') ? 'node' : 'bash';
        return await this.runScript(script, language);
      }
      
      if (lowerTask.includes('list process') || lowerTask.includes('show process')) {
        return await this.manageProcesses('list');
      }
      
      if (lowerTask.includes('kill process')) {
        const pid = parseInt(taskData.match(/kill process\s+(\d+)/i)?.[1] || '');
        if (pid) {
          return await this.manageProcesses('kill', pid);
        }
      }
      
      if (lowerTask.includes('monitor')) {
        const duration = parseInt(taskData.match(/monitor.*?(\d+)/)?.[1] || '30');
        return await this.monitorSystem(duration);
      }

      // Default: treat as command execution
      return await this.executeCommands(taskData);
      
    } catch (error: any) {
      return {
        error: `System administration failed: ${error.message}`,
        taskData,
      };
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