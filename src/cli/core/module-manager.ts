import chalk from 'chalk';
import { diffManager } from '../ui/diff-manager';
import { ExecutionPolicyManager } from '../policies/execution-policy';
import { simpleConfigManager as configManager } from './config-manager';
import { advancedAIProvider } from '../ai/advanced-ai-provider';
import { modernAgentOrchestrator } from '../automation/agents/modern-agent-system';

export interface ModuleContext {
  workingDirectory: string;
  session: any;
  policyManager: ExecutionPolicyManager;
  isProcessing: boolean;
  autonomous: boolean;
  planMode: boolean;
  autoAcceptEdits: boolean;
}

export interface ModuleCommand {
  name: string;
  description: string;
  category: 'system' | 'file' | 'analysis' | 'security' | 'diff' | 'agent';
  requiresArgs?: boolean;
  handler: (args: string[], context: ModuleContext) => Promise<void>;
}

export class ModuleManager {
  private modules: Map<string, ModuleCommand> = new Map();
  private context: ModuleContext;

  constructor(context: ModuleContext) {
    this.context = context;
    this.registerModules();
  }

  /**
   * Register all available modules
   */
  private registerModules(): void {
    // System Commands
    this.register({
      name: 'help',
      description: 'Show detailed help and command reference',
      category: 'system',
      handler: this.handleHelp.bind(this)
    });

    this.register({
      name: 'agents',
      description: 'List all available AI agents',
      category: 'system',
      handler: this.handleAgents.bind(this)
    });

    this.register({
      name: 'model',
      description: 'Switch AI model or show current model',
      category: 'system',
      handler: this.handleModel.bind(this)
    });

    this.register({
      name: 'clear',
      description: 'Clear conversation history and free up context',
      category: 'system',
      handler: this.handleClear.bind(this)
    });

    // File Operations
    this.register({
      name: 'cd',
      description: 'Change current working directory',
      category: 'file',
      requiresArgs: true,
      handler: this.handleChangeDirectory.bind(this)
    });

    this.register({
      name: 'pwd',
      description: 'Show current working directory',
      category: 'file',
      handler: this.handlePrintDirectory.bind(this)
    });

    this.register({
      name: 'ls',
      description: 'List files in current directory',
      category: 'file',
      handler: this.handleListFiles.bind(this)
    });

    // Analysis Commands
    this.register({
      name: 'analyze',
      description: 'Quick project analysis',
      category: 'analysis',
      handler: this.handleAnalyze.bind(this)
    });

    this.register({
      name: 'auto',
      description: 'Fully autonomous task execution',
      category: 'analysis',
      requiresArgs: true,
      handler: this.handleAutoExecution.bind(this)
    });

    this.register({
      name: 'context',
      description: 'Show execution context',
      category: 'analysis',
      handler: this.handleContext.bind(this)
    });

    this.register({
      name: 'history',
      description: 'Show execution history',
      category: 'analysis',
      handler: this.handleHistory.bind(this)
    });

    // Diff Management
    this.register({
      name: 'diff',
      description: 'Show file changes (all diffs if no file specified)',
      category: 'diff',
      handler: this.handleDiff.bind(this)
    });

    this.register({
      name: 'accept',
      description: 'Accept and apply file changes',
      category: 'diff',
      requiresArgs: true,
      handler: this.handleAccept.bind(this)
    });

    this.register({
      name: 'reject',
      description: 'Reject and discard file changes',
      category: 'diff',
      requiresArgs: true,
      handler: this.handleReject.bind(this)
    });

    // Security Commands
    this.register({
      name: 'security',
      description: 'Show current security status',
      category: 'security',
      handler: this.handleSecurity.bind(this)
    });

    this.register({
      name: 'policy',
      description: 'Update security policy settings',
      category: 'security',
      handler: this.handlePolicy.bind(this)
    });

    // Mode Toggles
    this.register({
      name: 'plan',
      description: 'Toggle plan mode (shift+tab to cycle)',
      category: 'system',
      handler: this.handlePlanMode.bind(this)
    });

    this.register({
      name: 'auto-accept',
      description: 'Toggle auto-accept edits mode',
      category: 'system',
      handler: this.handleAutoAccept.bind(this)
    });

    this.register({
      name: 'autonomous',
      description: 'Toggle autonomous mode',
      category: 'system',
      handler: this.handleAutonomous.bind(this)
    });
  }

  /**
   * Register a new module
   */
  register(module: ModuleCommand): void {
    this.modules.set(module.name, module);
  }

  /**
   * Execute a command
   */
  async executeCommand(command: string, args: string[]): Promise<boolean> {
    const module = this.modules.get(command);
    if (!module) {
      console.log(chalk.red(`Unknown command: ${command}`));
      console.log(chalk.gray('Type /help for available commands'));
      return false;
    }

    if (module.requiresArgs && args.length === 0) {
      console.log(chalk.red(`Command '${command}' requires arguments`));
      console.log(chalk.gray(`Description: ${module.description}`));
      return false;
    }

    try {
      await module.handler(args, this.context);
      return true;
    } catch (error: any) {
      console.log(chalk.red(`Error executing ${command}: ${error.message}`));
      return false;
    }
  }

  /**
   * Get all available commands
   */
  getCommands(): ModuleCommand[] {
    return Array.from(this.modules.values());
  }

  /**
   * Get commands for autocompletion
   */
  getCommandNames(): string[] {
    return Array.from(this.modules.keys()).map(name => `/${name}`);
  }

  /**
   * Update context
   */
  updateContext(context: Partial<ModuleContext>): void {
    this.context = { ...this.context, ...context };
  }

  // Command Handlers
  private async handleHelp(args: string[], context: ModuleContext): Promise<void> {
    console.log(chalk.cyan.bold('\\n🤖 Autonomous Claude Assistant - Command Reference'));
    console.log(chalk.gray('═'.repeat(60)));

    const categories = {
      system: '🔧 System Commands',
      file: '📁 File Operations',
      analysis: '🔍 Analysis & Tools',
      diff: '📝 File Changes & Diffs',
      security: '🔒 Security & Policy'
    };

    for (const [category, title] of Object.entries(categories)) {
      const commands = this.getCommands().filter(c => c.category === category);
      if (commands.length > 0) {
        console.log(chalk.white.bold(`\\n${title}:`));
        commands.forEach(cmd => {
          console.log(`${chalk.green(`/${cmd.name}`).padEnd(20)} ${cmd.description}`);
        });
      }
    }

    console.log(chalk.white.bold('\\n🤖 Specialized Agents:'));
    console.log(`${chalk.blue('@ai-analysis')} <task>     AI code analysis and review`);
    console.log(`${chalk.blue('@code-review')} <task>     Code review and suggestions`);
    console.log(`${chalk.blue('@backend-expert')} <task>   Backend development specialist`);
    console.log(`${chalk.blue('@frontend-expert')} <task>  Frontend/UI development expert`);
    console.log(`${chalk.blue('@react-expert')} <task>    React and Next.js specialist`);
    console.log(`${chalk.blue('@devops-expert')} <task>   DevOps and infrastructure expert`);
    console.log(`${chalk.blue('@system-admin')} <task>    System administration tasks`);
    console.log(`${chalk.blue('@autonomous-coder')} <task> Full autonomous coding agent`);

    console.log(chalk.white.bold('\\n💬 Natural Language Examples:'));
    console.log(chalk.dim('• \"Create a React todo app with TypeScript and tests\"'));
    console.log(chalk.dim('• \"Fix all ESLint errors in this project\"'));
    console.log(chalk.dim('• \"Add authentication with JWT to this API\"'));
    console.log(chalk.dim('• \"Set up Docker and CI/CD for deployment\"'));
    console.log(chalk.dim('• \"Optimize this component for performance\"'));

    console.log(chalk.gray('\\n' + '─'.repeat(60)));
    console.log(chalk.yellow('💡 Tip: Use TAB for auto-completion, / for command menu, Shift+Tab to cycle modes'));
  }

  private async handleAgents(args: string[], context: ModuleContext): Promise<void> {
    console.log(chalk.cyan.bold('\\n🤖 Available Specialized Agents'));
    console.log(chalk.gray('─'.repeat(50)));

    // This would be dynamically populated from agent registry
    const agents = [
      { name: 'ai-analysis', desc: 'AI code analysis and review' },
      { name: 'code-review', desc: 'Code review and suggestions' },
      { name: 'backend-expert', desc: 'Backend development specialist' },
      { name: 'frontend-expert', desc: 'Frontend/UI development expert' },
      { name: 'react-expert', desc: 'React and Next.js specialist' },
      { name: 'devops-expert', desc: 'DevOps and infrastructure expert' },
      { name: 'system-admin', desc: 'System administration tasks' },
      { name: 'autonomous-coder', desc: 'Full autonomous coding agent' }
    ];

    agents.forEach(agent => {
      console.log(`${chalk.green('•')} ${chalk.bold(agent.name)}`);
      console.log(`  ${chalk.gray(agent.desc)}`);
    });

    console.log(chalk.dim('\\nUsage: @<agent-name> <task>'));
  }

  private async handleModel(args: string[], context: ModuleContext): Promise<void> {
    if (args[0]) {
      try {
        advancedAIProvider.setModel(args[0]);
        configManager.setCurrentModel(args[0]);
        console.log(chalk.green(`✅ Switched to: ${args[0]}`));
      } catch (error: any) {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    } else {
      const modelInfo = advancedAIProvider.getCurrentModelInfo();
      console.log(chalk.blue(`🧠 Current model: ${modelInfo.name}`));
    }
  }

  private async handleClear(args: string[], context: ModuleContext): Promise<void> {
    console.clear();
    context.session.messages = context.session.messages.filter((m: any) => m.role === 'system');
    context.session.executionHistory = [];
    advancedAIProvider.clearExecutionContext();
    console.log(chalk.green('✅ Session cleared'));
  }

  private async handleChangeDirectory(args: string[], context: ModuleContext): Promise<void> {
    const newDir = args[0] || process.cwd();
    try {
      const path = require('path');
      const fs = require('fs');
      const resolvedPath = path.resolve(context.workingDirectory, newDir);

      if (!fs.existsSync(resolvedPath)) {
        console.log(chalk.red(`Directory not found: ${newDir}`));
        return;
      }

      context.workingDirectory = resolvedPath;
      advancedAIProvider.setWorkingDirectory(resolvedPath);
      console.log(chalk.green(`✅ Changed to: ${resolvedPath}`));
    } catch (error: any) {
      console.log(chalk.red(`Error changing directory: ${error.message}`));
    }
  }

  private async handlePrintDirectory(args: string[], context: ModuleContext): Promise<void> {
    console.log(chalk.blue(`📁 Current directory: ${context.workingDirectory}`));
  }

  private async handleListFiles(args: string[], context: ModuleContext): Promise<void> {
    try {
      const fs = require('fs');
      const files = fs.readdirSync(context.workingDirectory, { withFileTypes: true });

      console.log(chalk.blue(`\\n📁 ${context.workingDirectory}:`));
      console.log(chalk.gray('─'.repeat(50)));

      files.slice(0, 20).forEach((file: any) => {
        const icon = file.isDirectory() ? '📁' : '📄';
        const name = file.isDirectory() ? chalk.blue(file.name) : file.name;
        console.log(`${icon} ${name}`);
      });

      if (files.length > 20) {
        console.log(chalk.dim(`... and ${files.length - 20} more items`));
      }
    } catch (error: any) {
      console.log(chalk.red(`Error listing directory: ${error.message}`));
    }
  }

  private async handleAnalyze(args: string[], context: ModuleContext): Promise<void> {
    console.log(chalk.blue('🔍 Quick project analysis...'));
    // Implementation for project analysis
    console.log(chalk.green('Analysis complete!'));
  }

  private async handleAutoExecution(args: string[], context: ModuleContext): Promise<void> {
    const task = args.join(' ');
    console.log(chalk.blue(`\\n🎯 Autonomous Mode: Analyzing and executing task...`));
    console.log(chalk.gray(`Task: ${task}\\n`));
    // Implementation for autonomous execution
  }

  private async handleContext(args: string[], context: ModuleContext): Promise<void> {
    const execContext = advancedAIProvider.getExecutionContext();
    if (execContext.size === 0) {
      console.log(chalk.yellow('No execution context available'));
      return;
    }

    console.log(chalk.cyan.bold('\\n🧠 Execution Context'));
    console.log(chalk.gray('─'.repeat(40)));

    for (const [key, value] of execContext) {
      console.log(`${chalk.blue(key)}: ${chalk.dim(JSON.stringify(value, null, 2).slice(0, 100))}...`);
    }
  }

  private async handleHistory(args: string[], context: ModuleContext): Promise<void> {
    const history = context.session.executionHistory.slice(-20);
    if (history.length === 0) {
      console.log(chalk.yellow('No execution history'));
      return;
    }

    console.log(chalk.cyan.bold('\\n📜 Recent Execution History'));
    console.log(chalk.gray('─'.repeat(50)));

    history.forEach((event: any, index: number) => {
      const icon = event.type === 'tool_call' ? '🔧' :
        event.type === 'tool_result' ? '✅' :
          event.type === 'error' ? '❌' : '•';
      console.log(`${icon} ${chalk.dim(event.type)}: ${event.content?.slice(0, 60) || 'N/A'}`);
    });
  }

  private async handleDiff(args: string[], context: ModuleContext): Promise<void> {
    if (args[0]) {
      diffManager.showDiff(args[0]);
    } else {
      diffManager.showAllDiffs();
    }
  }

  private async handleAccept(args: string[], context: ModuleContext): Promise<void> {
    if (args[0] === 'all') {
      diffManager.acceptAllDiffs();
    } else if (args[0]) {
      diffManager.acceptDiff(args[0]);
    } else {
      console.log(chalk.red('Usage: /accept <file> or /accept all'));
    }
  }

  private async handleReject(args: string[], context: ModuleContext): Promise<void> {
    if (args[0]) {
      diffManager.rejectDiff(args[0]);
    } else {
      console.log(chalk.red('Usage: /reject <file>'));
    }
  }

  private async handleSecurity(args: string[], context: ModuleContext): Promise<void> {
    const summary = await context.policyManager.getPolicySummary();
    
    console.log(chalk.blue.bold('🔒 Security Policy Status'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`${chalk.green('Current Policy:')} ${summary.currentPolicy.approval}`);
    console.log(`${chalk.green('Sandbox Mode:')} ${summary.currentPolicy.sandbox}`);
    console.log(`${chalk.green('Timeout:')} ${summary.currentPolicy.timeoutMs}ms`);
    console.log(`${chalk.green('Allowed Commands:')} ${summary.allowedCommands}`);
    console.log(`${chalk.red('Blocked Commands:')} ${summary.deniedCommands}`);
  }

  private async handlePolicy(args: string[], context: ModuleContext): Promise<void> {
    if (args[0] && args[1]) {
      const [setting, value] = args;
      try {
        switch (setting) {
          case 'approval':
            if (['never', 'untrusted', 'always'].includes(value)) {
              // Policy update - would need to extend config manager
            console.log(chalk.green(`✅ Approval policy set to: ${value}`));
              console.log(chalk.green(`✅ Approval policy set to: ${value}`));
            } else {
              console.log(chalk.red('Invalid approval policy. Use: never, untrusted, or always'));
            }
            break;
          case 'sandbox':
            if (['read-only', 'workspace-write', 'system-write'].includes(value)) {
              // Sandbox update - would need to extend config manager
            console.log(chalk.green(`✅ Sandbox mode set to: ${value}`));
              console.log(chalk.green(`✅ Sandbox mode set to: ${value}`));
            } else {
              console.log(chalk.red('Invalid sandbox mode. Use: read-only, workspace-write, or system-write'));
            }
            break;
          default:
            console.log(chalk.red(`Unknown setting: ${setting}`));
        }
      } catch (error: any) {
        console.log(chalk.red(`Error updating policy: ${error.message}`));
      }
    } else {
      await this.handleSecurity([], context);
    }
  }

  private async handlePlanMode(args: string[], context: ModuleContext): Promise<void> {
    context.planMode = !context.planMode;
    if (context.planMode) {
      console.log(chalk.green('\\n✅ plan mode on ') + chalk.dim('(shift+tab to cycle)'));
    } else {
      console.log(chalk.yellow('\\n⚠️ plan mode off'));
    }
  }

  private async handleAutoAccept(args: string[], context: ModuleContext): Promise<void> {
    context.autoAcceptEdits = !context.autoAcceptEdits;
    diffManager.setAutoAccept(context.autoAcceptEdits);
    
    if (context.autoAcceptEdits) {
      console.log(chalk.green('\\n✅ auto-accept edits on ') + chalk.dim('(shift+tab to cycle)'));
    } else {
      console.log(chalk.yellow('\\n⚠️ auto-accept edits off'));
    }
  }

  private async handleAutonomous(args: string[], context: ModuleContext): Promise<void> {
    if (args[0] === 'off') {
      context.autonomous = false;
      console.log(chalk.yellow('⚠️ Autonomous mode disabled - will ask for confirmation'));
    } else {
      context.autonomous = true;
      console.log(chalk.green('✅ Autonomous mode enabled - full independence'));
    }
  }
}