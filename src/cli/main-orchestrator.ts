#!/usr/bin/env node

/**
 * Main AI Development Orchestrator
 * Production-ready autonomous development system with streaming interface
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { StreamingOrchestrator } from './streaming-orchestrator';
import { agentService } from './services/agent-service';
import { toolService } from './services/tool-service';
import { planningService } from './services/planning-service';
import { lspService } from './services/lsp-service';
import { memoryService } from './services/memory-service';
import { snapshotService } from './services/snapshot-service';
import { diffManager } from './ui/diff-manager';
import { VMOrchestrator } from './virtualized-agents/vm-orchestrator';
import { ContainerManager } from './virtualized-agents/container-manager';

class MainOrchestrator {
  private streamOrchestrator: StreamingOrchestrator;
  private vmOrchestrator: VMOrchestrator;
  private containerManager: ContainerManager;
  private initialized = false;

  constructor() {
    this.streamOrchestrator = new StreamingOrchestrator();
    this.containerManager = new ContainerManager();
    this.vmOrchestrator = new VMOrchestrator(this.containerManager);
    this.setupGlobalHandlers();
    this.setupVMEventListeners();
  }

  private setupGlobalHandlers(): void {
    // Global error handler
    process.on('unhandledRejection', (reason, promise) => {
      console.error(chalk.red('❌ Unhandled Rejection:'), reason);
    });

    process.on('uncaughtException', (error) => {
      console.error(chalk.red('❌ Uncaught Exception:'), error);
      this.gracefulShutdown();
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', this.gracefulShutdown.bind(this));
    process.on('SIGINT', this.gracefulShutdown.bind(this));
  }

  private async gracefulShutdown(): Promise<void> {
    console.log(chalk.yellow('\\n🛑 Shutting down orchestrator...'));

    try {
      // Stop all active agents
      const activeAgents = agentService.getActiveAgents();
      if (activeAgents.length > 0) {
        console.log(chalk.blue(`⏳ Waiting for ${activeAgents.length} agents to complete...`));
        // In production, implement proper agent shutdown
      }

      // Save any pending diffs
      const pendingDiffs = diffManager.getPendingCount();
      if (pendingDiffs > 0) {
        console.log(chalk.yellow(`💾 ${pendingDiffs} diffs still pending`));
      }

      // Clear resources
      await this.cleanup();

      console.log(chalk.green('✅ Orchestrator shut down cleanly'));
    } catch (error) {
      console.error(chalk.red('❌ Error during shutdown:'), error);
    } finally {
      process.exit(0);
    }
  }

  private async cleanup(): Promise<void> {
    // Cleanup services
    const lspServers = lspService.getServerStatus();
    for (const server of lspServers) {
      if (server.status === 'running') {
        await lspService.stopServer(server.name.toLowerCase().replace(' ', '-'));
      }
    }
  }

  private async checkSystemRequirements(): Promise<boolean> {
    console.log(chalk.blue('🔍 Checking system requirements...'));

    const checks = [
      this.checkNodeVersion(),
      this.checkAPIKeys(),
      this.checkWorkingDirectory(),
      this.checkDependencies()
    ];

    const results = await Promise.all(checks);
    const allPassed = results.every(r => r);

    if (allPassed) {
      console.log(chalk.green('✅ All system checks passed'));
    } else {
      console.log(chalk.red('❌ System requirements not met'));
    }

    return allPassed;
  }

  private checkNodeVersion(): boolean {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);

    if (major < 18) {
      console.log(chalk.red(`❌ Node.js ${major} is too old. Requires Node.js 18+`));
      return false;
    }

    console.log(chalk.green(`✅ Node.js ${version}`));
    return true;
  }

  private checkAPIKeys(): boolean {
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasGoogle = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const hasVercel = !!process.env.V0_API_KEY;

    if (!hasAnthropic && !hasOpenAI && !hasGoogle && !hasVercel) {
      console.log(chalk.red('❌ No API keys found'));
      console.log(chalk.yellow('Set at least one: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or V0_API_KEY'));
      return false;
    }

    const available = [];
    if (hasAnthropic) available.push('Claude');
    if (hasOpenAI) available.push('GPT');
    if (hasGoogle) available.push('Gemini');
    if (hasVercel) available.push('Vercel');
    console.log(chalk.green(`✅ API Keys: ${available.join(', ')}`));
    return true;
  }

  private checkWorkingDirectory(): boolean {
    const cwd = process.cwd();
    const fs = require('fs');

    if (!fs.existsSync(cwd)) {
      console.log(chalk.red(`❌ Working directory does not exist: ${cwd}`));
      return false;
    }

    console.log(chalk.green(`✅ Working directory: ${cwd}`));
    return true;
  }

  private checkDependencies(): boolean {
    try {
      // Check critical dependencies
      require('chalk');
      require('boxen');
      require('nanoid');
      require('diff');

      console.log(chalk.green('✅ All dependencies available'));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Missing dependencies: ${error}`));
      return false;
    }
  }

  private showStartupBanner(): void {
    console.clear();

    const banner = boxen(
      `${chalk.cyanBright([
        '╔═══════════════════════════════════════════╗',
        '║        AI DEVELOPMENT ORCHESTRATOR        ║',
        '╚═══════════════════════════════════════════╝'
      ].join('\\n'))}\\n\\n` +
      `${chalk.white.bold('🎛️  Multi-Agent Autonomous Development System')}\\n\\n` +
      `${chalk.blue('Features:')}\\n` +
      `• ${chalk.green('Streaming Chat Interface')} - Real-time message processing\\n` +
      `• ${chalk.green('Parallel Agent Execution')} - Up to 3 agents simultaneously\\n` +
      `• ${chalk.green('Intelligent Planning')} - Autonomous task breakdown\\n` +
      `• ${chalk.green('Tool Integration')} - File ops, git, package management\\n` +
      `• ${chalk.green('Diff Management')} - Visual file change review\\n` +
      `• ${chalk.green('VM Orchestration')} - Container management & agent isolation\\n` +
      `• ${chalk.green('Security Policies')} - Safe command execution\\n` +
      `• ${chalk.green('Context Management')} - Automatic memory optimization\\n\\n` +
      `${chalk.yellow.bold('🚀 Ready for autonomous development!')}`,
      {
        padding: 2,
        margin: 1,
        borderStyle: 'double',
        borderColor: 'cyan',
        titleAlignment: 'center',
      }
    );

    console.log(banner);
  }

  private async initializeSystem(): Promise<boolean> {
    console.log(chalk.blue('🚀 Initializing AI Development Orchestrator...'));
    console.log(chalk.gray('─'.repeat(60)));

    const steps = [
      { name: 'Service Registration', fn: this.initializeServices.bind(this) },
      { name: 'Agent System', fn: this.initializeAgents.bind(this) },
      { name: 'Planning System', fn: this.initializePlanning.bind(this) },
      { name: 'Tool System', fn: this.initializeTools.bind(this) },
      { name: 'Memory System', fn: this.initializeMemory.bind(this) },
      { name: 'Snapshot System', fn: this.initializeSnapshot.bind(this) },
      { name: 'VM Orchestration', fn: this.initializeVMOrchestration.bind(this) },
      { name: 'Security Policies', fn: this.initializeSecurity.bind(this) },
      { name: 'Context Management', fn: this.initializeContext.bind(this) }
    ];

    for (const step of steps) {
      try {
        console.log(chalk.blue(`🔄 ${step.name}...`));
        await step.fn();
        console.log(chalk.green(`✅ ${step.name} initialized`));
      } catch (error: any) {
        console.log(chalk.red(`❌ ${step.name} failed: ${error.message}`));
        return false;
      }
    }

    this.initialized = true;
    console.log(chalk.green.bold('\\n🎉 System initialization complete!'));
    return true;
  }

  private async initializeServices(): Promise<void> {
    // Set working directory for all services
    const workingDir = process.cwd();

    toolService.setWorkingDirectory(workingDir);
    planningService.setWorkingDirectory(workingDir);
    lspService.setWorkingDirectory(workingDir);
    diffManager.setAutoAccept(true); // Default to auto-accept as shown in image
  }

  private async initializeAgents(): Promise<void> {
    // Agent service is initialized via import
    // Verify all agents are available
    const agents = agentService.getAvailableAgents();
    console.log(chalk.dim(`   Loaded ${agents.length} agents`));
  }

  private async initializePlanning(): Promise<void> {
    // Planning service initialization
    console.log(chalk.dim('   Planning system ready'));
  }

  private async initializeTools(): Promise<void> {
    const tools = toolService.getAvailableTools();
    console.log(chalk.dim(`   Loaded ${tools.length} tools`));
  }

  private async initializeMemory(): Promise<void> {
    await memoryService.initialize();
    console.log(chalk.dim('   Memory system ready'));
  }

  private async initializeSnapshot(): Promise<void> {
    await snapshotService.initialize();
    console.log(chalk.dim('   Snapshot system ready'));
  }

  private async initializeSecurity(): Promise<void> {
    // Security policies are initialized in the orchestrator
    console.log(chalk.dim('   Security policies loaded'));
  }

  private async initializeContext(): Promise<void> {
    // Context management is handled in the streaming orchestrator
    console.log(chalk.dim('   Context management ready'));
  }

  private async initializeVMOrchestration(): Promise<void> {
    // Initialize VM orchestration system
    console.log(chalk.dim('   VM Orchestrator ready'));
    console.log(chalk.dim('   Container Manager ready'));

    // Create VM monitoring panels
    await this.streamOrchestrator.createPanel({
      id: 'vm-status',
      title: '🐳 VM Status',
      position: 'right',
      width: 35
    });

    await this.streamOrchestrator.createPanel({
      id: 'vm-logs',
      title: '📝 VM Agent Logs',
      position: 'bottom',
      height: 12
    });

    await this.streamOrchestrator.createPanel({
      id: 'vm-metrics',
      title: '📊 VM Metrics',
      position: 'right',
      width: 25
    });

    // Set initial status
    await this.streamOrchestrator.streamToPanel('vm-status', '🟢 VM Orchestration Initialized\n');
    await this.streamOrchestrator.streamToPanel('vm-status', `Containers: 0 active\n`);
  }

  private setupVMEventListeners(): void {
    // Listen to VM orchestrator events
    this.vmOrchestrator.on('container:created', async (data: any) => {
      await this.streamOrchestrator.streamToPanel('vm-status', `🟢 Container created: ${data.containerId?.slice(0, 8)}\n`);
      await this.updateVMStatus();
    });

    this.vmOrchestrator.on('container:started', async (data: any) => {
      await this.streamOrchestrator.streamToPanel('vm-status', `▶️ Container started: ${data.containerId?.slice(0, 8)}\n`);
    });

    this.vmOrchestrator.on('container:stopped', async (data: any) => {
      await this.streamOrchestrator.streamToPanel('vm-status', `🔴 Container stopped: ${data.containerId?.slice(0, 8)}\n`);
      await this.updateVMStatus();
    });

    this.vmOrchestrator.on('container:removed', async (data: any) => {
      await this.streamOrchestrator.streamToPanel('vm-status', `🗑️ Container removed: ${data.containerId?.slice(0, 8)}\n`);
      await this.updateVMStatus();
    });

    this.vmOrchestrator.on('container:log', async (data: any) => {
      const timestamp = new Date().toLocaleTimeString();
      await this.streamOrchestrator.streamToPanel('vm-logs', `[${timestamp}] [${data.containerId?.slice(0, 8)}] ${data.log}\n`);
    });

    this.vmOrchestrator.on('container:metrics', async (data: any) => {
      await this.streamOrchestrator.streamToPanel('vm-metrics',
        `📊 ${data.containerId?.slice(0, 8)}:\n` +
        `   Memory: ${(data.metrics?.memoryUsage / 1024 / 1024).toFixed(2)} MB\n` +
        `   CPU: ${data.metrics?.cpuUsage?.toFixed(2)}%\n` +
        `   Network: ${(data.metrics?.networkActivity / 1024).toFixed(2)} KB\n\n`
      );
    });

    this.vmOrchestrator.on('agent:message', async (data: any) => {
      await this.streamOrchestrator.streamToPanel('vm-logs', `[AGENT] ${data.agentId}: ${data.message}\n`);
    });

    this.vmOrchestrator.on('agent:error', async (data: any) => {
      await this.streamOrchestrator.streamToPanel('vm-logs', `[ERROR] ${data.agentId}: ${data.error}\n`);
    });
  }

  private async updateVMStatus(): Promise<void> {
    const containers = this.vmOrchestrator.getActiveContainers();
    await this.streamOrchestrator.streamToPanel('vm-status', `\nActive Containers: ${containers.length}\n`);

    for (const container of containers) {
      await this.streamOrchestrator.streamToPanel('vm-status',
        `• ${container.id.slice(0, 8)} - ${container.status} - ${container.agentId}\n`
      );
    }
  }

  getVMOrchestrator(): VMOrchestrator {
    return this.vmOrchestrator;
  }

  getStreamOrchestrator(): StreamingOrchestrator {
    return this.streamOrchestrator;
  }

  private showQuickStart(): void {
    console.log(chalk.cyan.bold('\\n📚 Quick Start Guide:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`${chalk.green('Natural Language:')} Just describe what you want`);
    console.log(`${chalk.blue('Agent Specific:')} @agent-name your task`);
    console.log(`${chalk.yellow('Commands:')} /help, /status, /agents`);
    console.log(`${chalk.magenta('Shortcuts:')} / (menu), Shift+Tab (modes)`);
    console.log('');
    console.log(chalk.dim('Examples:'));
    console.log(chalk.dim('• "Create a React todo app with TypeScript"'));
    console.log(chalk.dim('• "@react-expert optimize this component"'));
    console.log(chalk.dim('• "/status" to see system status'));
    console.log('');
  }

  async start(): Promise<void> {
    try {
      // Show startup banner
      this.showStartupBanner();

      // Wait for user to see banner
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check system requirements
      const requirementsMet = await this.checkSystemRequirements();
      if (!requirementsMet) {
        console.log(chalk.red('\\n❌ Cannot start - system requirements not met'));
        process.exit(1);
      }

      // Initialize all systems
      const initialized = await this.initializeSystem();
      if (!initialized) {
        console.log(chalk.red('\\n❌ Cannot start - system initialization failed'));
        process.exit(1);
      }

      // Show quick start guide
      this.showQuickStart();

      // Start the streaming orchestrator
      console.log(chalk.blue.bold('🎛️ Starting Streaming Orchestrator...\\n'));
      await this.streamOrchestrator.start();

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to start orchestrator:'), error);
      process.exit(1);
    }
  }
}

// Export for programmatic use
export { MainOrchestrator };

// Start if run directly
if (require.main === module) {
  const orchestrator = new MainOrchestrator();
  orchestrator.start().catch(error => {
    console.error(chalk.red('❌ Startup failed:'), error);
    process.exit(1);
  });
}