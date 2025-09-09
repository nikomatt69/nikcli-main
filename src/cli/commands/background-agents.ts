import chalk from 'chalk';
import { backgroundAgentService, BackgroundAgentType, BackgroundAgentStatus } from '../services/background-agent-service';
import { backgroundAgentConfigManager } from '../services/background-agent-config-manager';
import { logger } from '../utils/logger';

/**
 * Background Agents CLI Commands
 * Provides commands to manage background agents
 */
export class BackgroundAgentsCommands {
  
  /**
   * List all background agents
   */
  public static async listAgents(): Promise<void> {
    try {
      const agents = backgroundAgentService.getAgents();
      
      if (agents.length === 0) {
        console.log(chalk.yellow('No background agents configured'));
        return;
      }

      console.log(chalk.cyan.bold('\n📋 Background Agents\n'));
      console.log(chalk.gray('─'.repeat(80)));

      for (const agent of agents) {
        const statusColor = this.getStatusColor(agent.status);
        const statusIcon = this.getStatusIcon(agent.status);
        
        console.log(chalk.white.bold(`\n${statusIcon} ${agent.config.name}`));
        console.log(chalk.gray(`   ID: ${agent.id}`));
        console.log(chalk.gray(`   Type: ${agent.config.type}`));
        console.log(chalk.gray(`   Description: ${agent.config.description}`));
        console.log(`${statusColor}   Status: ${agent.status}`);
        console.log(chalk.gray(`   Enabled: ${agent.config.enabled ? 'Yes' : 'No'}`));
        console.log(chalk.gray(`   Auto Start: ${agent.config.autoStart !== false ? 'Yes' : 'No'}`));
        
        if (agent.startTime) {
          console.log(chalk.gray(`   Started: ${agent.startTime.toLocaleString()}`));
        }
        
        if (agent.lastActivity) {
          console.log(chalk.gray(`   Last Activity: ${agent.lastActivity.toLocaleString()}`));
        }
        
        console.log(chalk.gray(`   Tasks: ${agent.taskCount}`));
        console.log(chalk.gray(`   Errors: ${agent.errorCount}`));
        
        if (agent.lastError) {
          console.log(chalk.red(`   Last Error: ${agent.lastError}`));
        }
      }

      console.log(chalk.gray('\n─'.repeat(80)));
      console.log(chalk.dim(`Total: ${agents.length} agents`));

    } catch (error: any) {
      console.error(chalk.red('Failed to list background agents:'), error.message);
    }
  }

  /**
   * Show status of background agents
   */
  public static async showStatus(): Promise<void> {
    try {
      const agents = backgroundAgentService.getAgents();
      const runningAgents = backgroundAgentService.getRunningAgents();
      
      console.log(chalk.cyan.bold('\n📊 Background Agents Status\n'));
      console.log(chalk.gray('─'.repeat(50)));
      
      console.log(chalk.white(`Total Agents: ${agents.length}`));
      console.log(chalk.green(`Running: ${runningAgents.length}`));
      console.log(chalk.yellow(`Stopped: ${agents.length - runningAgents.length}`));
      
      const enabledAgents = agents.filter(a => a.config.enabled);
      console.log(chalk.blue(`Enabled: ${enabledAgents.length}`));
      
      const totalTasks = agents.reduce((sum, agent) => sum + agent.taskCount, 0);
      const totalErrors = agents.reduce((sum, agent) => sum + agent.errorCount, 0);
      
      console.log(chalk.magenta(`Total Tasks: ${totalTasks}`));
      console.log(chalk.red(`Total Errors: ${totalErrors}`));
      
      console.log(chalk.gray('─'.repeat(50)));

      // Show running agents details
      if (runningAgents.length > 0) {
        console.log(chalk.green.bold('\n🟢 Running Agents:'));
        for (const agent of runningAgents) {
          console.log(chalk.green(`  • ${agent.config.name} (${agent.config.type})`));
        }
      }

      // Show agent types summary
      const typeCounts = agents.reduce((counts, agent) => {
        counts[agent.config.type] = (counts[agent.config.type] || 0) + 1;
        return counts;
      }, {} as Record<string, number>);

      console.log(chalk.blue.bold('\n📈 Agent Types:'));
      for (const [type, count] of Object.entries(typeCounts)) {
        console.log(chalk.blue(`  • ${type}: ${count}`));
      }

    } catch (error: any) {
      console.error(chalk.red('Failed to show status:'), error.message);
    }
  }

  /**
   * Start a background agent
   */
  public static async startAgent(agentId: string): Promise<void> {
    try {
      const agent = backgroundAgentService.getAgent(agentId);
      if (!agent) {
        console.error(chalk.red(`Agent not found: ${agentId}`));
        return;
      }

      console.log(chalk.blue(`Starting agent: ${agent.config.name}...`));
      await backgroundAgentService.startAgent(agentId);
      console.log(chalk.green(`✅ Agent started: ${agent.config.name}`));

    } catch (error: any) {
      console.error(chalk.red(`Failed to start agent: ${error.message}`));
    }
  }

  /**
   * Stop a background agent
   */
  public static async stopAgent(agentId: string): Promise<void> {
    try {
      const agent = backgroundAgentService.getAgent(agentId);
      if (!agent) {
        console.error(chalk.red(`Agent not found: ${agentId}`));
        return;
      }

      console.log(chalk.blue(`Stopping agent: ${agent.config.name}...`));
      await backgroundAgentService.stopAgent(agentId);
      console.log(chalk.green(`✅ Agent stopped: ${agent.config.name}`));

    } catch (error: any) {
      console.error(chalk.red(`Failed to stop agent: ${error.message}`));
    }
  }

  /**
   * Pause a background agent
   */
  public static async pauseAgent(agentId: string): Promise<void> {
    try {
      const agent = backgroundAgentService.getAgent(agentId);
      if (!agent) {
        console.error(chalk.red(`Agent not found: ${agentId}`));
        return;
      }

      console.log(chalk.blue(`Pausing agent: ${agent.config.name}...`));
      await backgroundAgentService.pauseAgent(agentId);
      console.log(chalk.green(`✅ Agent paused: ${agent.config.name}`));

    } catch (error: any) {
      console.error(chalk.red(`Failed to pause agent: ${error.message}`));
    }
  }

  /**
   * Resume a background agent
   */
  public static async resumeAgent(agentId: string): Promise<void> {
    try {
      const agent = backgroundAgentService.getAgent(agentId);
      if (!agent) {
        console.error(chalk.red(`Agent not found: ${agentId}`));
        return;
      }

      console.log(chalk.blue(`Resuming agent: ${agent.config.name}...`));
      await backgroundAgentService.resumeAgent(agentId);
      console.log(chalk.green(`✅ Agent resumed: ${agent.config.name}`));

    } catch (error: any) {
      console.error(chalk.red(`Failed to resume agent: ${error.message}`));
    }
  }

  /**
   * Start all enabled agents
   */
  public static async startAll(): Promise<void> {
    try {
      console.log(chalk.blue('Starting all enabled background agents...'));
      await backgroundAgentService.startAllAgents();
      console.log(chalk.green('✅ All enabled agents started'));

    } catch (error: any) {
      console.error(chalk.red(`Failed to start all agents: ${error.message}`));
    }
  }

  /**
   * Stop all agents
   */
  public static async stopAll(): Promise<void> {
    try {
      console.log(chalk.blue('Stopping all background agents...'));
      await backgroundAgentService.stopAllAgents();
      console.log(chalk.green('✅ All agents stopped'));

    } catch (error: any) {
      console.error(chalk.red(`Failed to stop all agents: ${error.message}`));
    }
  }

  /**
   * Create a new background agent
   */
  public static async createAgent(
    type: BackgroundAgentType,
    name: string,
    description: string,
    options: {
      enabled?: boolean;
      autoStart?: boolean;
      interval?: number;
      settings?: Record<string, any>;
    } = {}
  ): Promise<void> {
    try {
      console.log(chalk.blue(`Creating background agent: ${name}...`));
      
      const config = backgroundAgentConfigManager.createCustomConfiguration(
        type,
        name,
        description,
        options.settings
      );

      // Apply options
      if (options.enabled !== undefined) config.enabled = options.enabled;
      if (options.autoStart !== undefined) config.autoStart = options.autoStart;
      if (options.interval !== undefined) config.interval = options.interval;

      const agent = await backgroundAgentService.createAgent(config);
      
      console.log(chalk.green(`✅ Agent created: ${agent.config.name}`));
      console.log(chalk.gray(`   ID: ${agent.id}`));
      console.log(chalk.gray(`   Type: ${agent.config.type}`));

    } catch (error: any) {
      console.error(chalk.red(`Failed to create agent: ${error.message}`));
    }
  }

  /**
   * Delete a background agent
   */
  public static async deleteAgent(agentId: string): Promise<void> {
    try {
      const agent = backgroundAgentService.getAgent(agentId);
      if (!agent) {
        console.error(chalk.red(`Agent not found: ${agentId}`));
        return;
      }

      console.log(chalk.blue(`Deleting agent: ${agent.config.name}...`));
      await backgroundAgentService.deleteAgent(agentId);
      console.log(chalk.green(`✅ Agent deleted: ${agent.config.name}`));

    } catch (error: any) {
      console.error(chalk.red(`Failed to delete agent: ${error.message}`));
    }
  }

  /**
   * Show agent details
   */
  public static async showAgent(agentId: string): Promise<void> {
    try {
      const agent = backgroundAgentService.getAgent(agentId);
      if (!agent) {
        console.error(chalk.red(`Agent not found: ${agentId}`));
        return;
      }

      console.log(chalk.cyan.bold(`\n📋 Agent Details: ${agent.config.name}\n`));
      console.log(chalk.gray('─'.repeat(60)));
      
      console.log(chalk.white.bold('Configuration:'));
      console.log(chalk.gray(`  ID: ${agent.id}`));
      console.log(chalk.gray(`  Type: ${agent.config.type}`));
      console.log(chalk.gray(`  Name: ${agent.config.name}`));
      console.log(chalk.gray(`  Description: ${agent.config.description}`));
      console.log(chalk.gray(`  Working Directory: ${agent.config.workingDirectory}`));
      console.log(chalk.gray(`  Enabled: ${agent.config.enabled}`));
      console.log(chalk.gray(`  Auto Start: ${agent.config.autoStart !== false}`));
      console.log(chalk.gray(`  Interval: ${agent.config.interval || 'Event-driven'}ms`));
      console.log(chalk.gray(`  Max Concurrent Tasks: ${agent.config.maxConcurrentTasks}`));
      console.log(chalk.gray(`  Timeout: ${agent.config.timeout}ms`));
      
      if (agent.config.triggers) {
        console.log(chalk.gray(`  Triggers: ${agent.config.triggers.join(', ')}`));
      }
      
      if (agent.config.settings) {
        console.log(chalk.white.bold('\nSettings:'));
        for (const [key, value] of Object.entries(agent.config.settings)) {
          console.log(chalk.gray(`  ${key}: ${JSON.stringify(value)}`));
        }
      }
      
      console.log(chalk.white.bold('\nStatus:'));
      const statusColor = this.getStatusColor(agent.status);
      console.log(`${statusColor}  Status: ${agent.status}`);
      console.log(chalk.gray(`  Tasks Executed: ${agent.taskCount}`));
      console.log(chalk.gray(`  Errors: ${agent.errorCount}`));
      
      if (agent.startTime) {
        console.log(chalk.gray(`  Started: ${agent.startTime.toLocaleString()}`));
      }
      
      if (agent.lastActivity) {
        console.log(chalk.gray(`  Last Activity: ${agent.lastActivity.toLocaleString()}`));
      }
      
      if (agent.lastError) {
        console.log(chalk.red(`  Last Error: ${agent.lastError}`));
      }

      console.log(chalk.gray('\n─'.repeat(60)));

    } catch (error: any) {
      console.error(chalk.red('Failed to show agent details:'), error.message);
    }
  }

  /**
   * Show task queue
   */
  public static async showQueue(): Promise<void> {
    try {
      const queue = backgroundAgentService.getTaskQueue();
      
      if (queue.length === 0) {
        console.log(chalk.yellow('No tasks in queue'));
        return;
      }

      console.log(chalk.cyan.bold('\n📋 Task Queue\n'));
      console.log(chalk.gray('─'.repeat(80)));

      for (const task of queue) {
        const statusColor = this.getTaskStatusColor(task.status);
        const statusIcon = this.getTaskStatusIcon(task.status);
        
        console.log(chalk.white.bold(`\n${statusIcon} ${task.type}`));
        console.log(chalk.gray(`   ID: ${task.id}`));
        console.log(chalk.gray(`   Agent: ${task.agentId}`));
        console.log(chalk.gray(`   Description: ${task.description}`));
        console.log(`${statusColor}   Status: ${task.status}`);
        console.log(chalk.gray(`   Priority: ${task.priority}`));
        console.log(chalk.gray(`   Created: ${task.createdAt.toLocaleString()}`));
        
        if (task.startedAt) {
          console.log(chalk.gray(`   Started: ${task.startedAt.toLocaleString()}`));
        }
        
        if (task.completedAt) {
          console.log(chalk.gray(`   Completed: ${task.completedAt.toLocaleString()}`));
        }
        
        if (task.error) {
          console.log(chalk.red(`   Error: ${task.error}`));
        }
      }

      console.log(chalk.gray('\n─'.repeat(80)));
      console.log(chalk.dim(`Total: ${queue.length} tasks`));

    } catch (error: any) {
      console.error(chalk.red('Failed to show task queue:'), error.message);
    }
  }

  /**
   * Initialize default agents
   */
  public static async initializeDefaults(): Promise<void> {
    try {
      console.log(chalk.blue('Initializing default background agents...'));
      
      const defaultConfigs = await backgroundAgentConfigManager.createDefaultConfigurations();
      
      for (const config of defaultConfigs) {
        try {
          await backgroundAgentService.createAgent(config);
          console.log(chalk.green(`✅ Created: ${config.name}`));
        } catch (error: any) {
          console.log(chalk.yellow(`⚠️ Failed to create ${config.name}: ${error.message}`));
        }
      }
      
      console.log(chalk.green(`✅ Initialized ${defaultConfigs.length} default agents`));

    } catch (error: any) {
      console.error(chalk.red(`Failed to initialize defaults: ${error.message}`));
    }
  }

  // Helper methods

  private static getStatusColor(status: BackgroundAgentStatus): string {
    switch (status) {
      case BackgroundAgentStatus.RUNNING:
        return chalk.green('🟢');
      case BackgroundAgentStatus.STOPPED:
        return chalk.gray('⚫');
      case BackgroundAgentStatus.STARTING:
        return chalk.yellow('🟡');
      case BackgroundAgentStatus.STOPPING:
        return chalk.yellow('🟡');
      case BackgroundAgentStatus.PAUSED:
        return chalk.blue('🔵');
      case BackgroundAgentStatus.ERROR:
        return chalk.red('🔴');
      default:
        return chalk.gray('⚪');
    }
  }

  private static getStatusIcon(status: BackgroundAgentStatus): string {
    switch (status) {
      case BackgroundAgentStatus.RUNNING:
        return '🟢';
      case BackgroundAgentStatus.STOPPED:
        return '⚫';
      case BackgroundAgentStatus.STARTING:
        return '🟡';
      case BackgroundAgentStatus.STOPPING:
        return '🟡';
      case BackgroundAgentStatus.PAUSED:
        return '🔵';
      case BackgroundAgentStatus.ERROR:
        return '🔴';
      default:
        return '⚪';
    }
  }

  private static getTaskStatusColor(status: string): string {
    switch (status) {
      case 'completed':
        return chalk.green('✅');
      case 'running':
        return chalk.blue('🔄');
      case 'pending':
        return chalk.yellow('⏳');
      case 'failed':
        return chalk.red('❌');
      case 'cancelled':
        return chalk.gray('⏹️');
      default:
        return chalk.gray('❓');
    }
  }

  private static getTaskStatusIcon(status: string): string {
    switch (status) {
      case 'completed':
        return '✅';
      case 'running':
        return '🔄';
      case 'pending':
        return '⏳';
      case 'failed':
        return '❌';
      case 'cancelled':
        return '⏹️';
      default:
        return '❓';
    }
  }
}