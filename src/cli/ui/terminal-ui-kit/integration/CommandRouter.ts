/**
 * Command Router - Instrada i comandi ai componenti UI appropriati
 * Mappa ogni comando del CLI a un componente Ink specifico
 */

import React from 'react';
import { CommandPanelProps, CommandResult } from '../types';

// Import dei componenti comando
import HelpCommandPanel from '../components/commands/HelpCommandPanel';
import ModelCommandPanel from '../components/commands/ModelCommandPanel';
import AgentCommandPanel from '../components/commands/AgentCommandPanel';
import FileCommandPanel from '../components/commands/FileCommandPanel';
import VMCommandPanel from '../components/commands/VMCommandPanel';
import PlanCommandPanel from '../components/commands/PlanCommandPanel';
import ConfigCommandPanel from '../components/commands/ConfigCommandPanel';
import VisionCommandPanel from '../components/commands/VisionCommandPanel';
import TerminalCommandPanel from '../components/commands/TerminalCommandPanel';

export interface CommandMapping {
  component: React.ComponentType<CommandPanelProps>;
  category: string;
  description: string;
  requiresArgs?: boolean;
  aliases?: string[];
}

export class CommandRouter {
  private commandMappings: Map<string, CommandMapping> = new Map();

  constructor() {
    this.initializeCommandMappings();
  }

  /**
   * Inizializza la mappatura tra comandi e componenti
   */
  private initializeCommandMappings(): void {
    // Help Commands
    this.registerCommand('help', {
      component: HelpCommandPanel,
      category: 'system',
      description: 'Show help information and command documentation',
    });

    // Model Management
    this.registerCommand('model', {
      component: ModelCommandPanel,
      category: 'model',
      description: 'Switch AI models or show current model',
    });

    this.registerCommand('models', {
      component: ModelCommandPanel,
      category: 'model',
      description: 'List all available AI models',
    });

    this.registerCommand('set-key', {
      component: ModelCommandPanel,
      category: 'model',
      description: 'Set API key for AI model',
      requiresArgs: true,
    });

    // Agent Management
    this.registerCommand('agent', {
      component: AgentCommandPanel,
      category: 'agent',
      description: 'Run specific agent with task',
      requiresArgs: true,
    });

    this.registerCommand('agents', {
      component: AgentCommandPanel,
      category: 'agent',
      description: 'List all available agents',
    });

    this.registerCommand('auto', {
      component: AgentCommandPanel,
      category: 'agent',
      description: 'Autonomous multi-agent execution',
      requiresArgs: true,
    });

    this.registerCommand('create-agent', {
      component: AgentCommandPanel,
      category: 'agent',
      description: 'Create new specialized agent',
      requiresArgs: true,
    });

    this.registerCommand('launch-agent', {
      component: AgentCommandPanel,
      category: 'agent',
      description: 'Launch agent from blueprint',
      requiresArgs: true,
    });

    // File Operations
    this.registerCommand('read', {
      component: FileCommandPanel,
      category: 'file',
      description: 'Read file contents',
      requiresArgs: true,
    });

    this.registerCommand('write', {
      component: FileCommandPanel,
      category: 'file',
      description: 'Write content to file',
      requiresArgs: true,
    });

    this.registerCommand('edit', {
      component: FileCommandPanel,
      category: 'file',
      description: 'Edit file interactively',
      requiresArgs: true,
    });

    this.registerCommand('ls', {
      component: FileCommandPanel,
      category: 'file',
      description: 'List files in directory',
    });

    this.registerCommand('search', {
      component: FileCommandPanel,
      category: 'file',
      description: 'Search in files or web',
      aliases: ['grep'],
    });

    // VM Operations
    this.registerCommand('vm', {
      component: VMCommandPanel,
      category: 'vm',
      description: 'VM container management',
    });

    this.registerCommand('vm-create', {
      component: VMCommandPanel,
      category: 'vm',
      description: 'Create new VM container',
      requiresArgs: true,
    });

    this.registerCommand('vm-list', {
      component: VMCommandPanel,
      category: 'vm',
      description: 'List active containers',
    });

    this.registerCommand('vm-status', {
      component: VMCommandPanel,
      category: 'vm',
      description: 'Show VM system status',
    });

    this.registerCommand('vm-exec', {
      component: VMCommandPanel,
      category: 'vm',
      description: 'Execute command in VM',
      requiresArgs: true,
    });

    this.registerCommand('vm-stop', {
      component: VMCommandPanel,
      category: 'vm',
      description: 'Stop VM container',
      requiresArgs: true,
    });

    this.registerCommand('vm-remove', {
      component: VMCommandPanel,
      category: 'vm',
      description: 'Remove VM container',
      requiresArgs: true,
    });

    // Planning
    this.registerCommand('plan', {
      component: PlanCommandPanel,
      category: 'planning',
      description: 'Generate, execute, or manage plans',
    });

    this.registerCommand('todo', {
      component: PlanCommandPanel,
      category: 'planning',
      description: 'Manage todo lists',
      aliases: ['todos'],
    });

    // Configuration
    this.registerCommand('config', {
      component: ConfigCommandPanel,
      category: 'config',
      description: 'View and edit configuration',
    });

    this.registerCommand('debug', {
      component: ConfigCommandPanel,
      category: 'config',
      description: 'Debug configuration and API keys',
    });

    // Vision & Images
    this.registerCommand('analyze-image', {
      component: VisionCommandPanel,
      category: 'vision',
      description: 'Analyze image with AI vision',
      aliases: ['vision'],
      requiresArgs: true,
    });

    this.registerCommand('generate-image', {
      component: VisionCommandPanel,
      category: 'vision',
      description: 'Generate image with AI',
      aliases: ['create-image'],
      requiresArgs: true,
    });

    this.registerCommand('images', {
      component: VisionCommandPanel,
      category: 'vision',
      description: 'Discover and analyze images',
    });

    // Terminal Operations
    this.registerCommand('run', {
      component: TerminalCommandPanel,
      category: 'terminal',
      description: 'Execute terminal command',
      aliases: ['sh', 'bash'],
      requiresArgs: true,
    });

    this.registerCommand('install', {
      component: TerminalCommandPanel,
      category: 'terminal',
      description: 'Install packages',
      requiresArgs: true,
    });

    this.registerCommand('npm', {
      component: TerminalCommandPanel,
      category: 'terminal',
      description: 'Run npm commands',
    });

    this.registerCommand('yarn', {
      component: TerminalCommandPanel,
      category: 'terminal',
      description: 'Run yarn commands',
    });

    this.registerCommand('git', {
      component: TerminalCommandPanel,
      category: 'terminal',
      description: 'Run git commands',
    });

    this.registerCommand('docker', {
      component: TerminalCommandPanel,
      category: 'terminal',
      description: 'Run docker commands',
    });

    this.registerCommand('ps', {
      component: TerminalCommandPanel,
      category: 'terminal',
      description: 'List running processes',
    });

    this.registerCommand('kill', {
      component: TerminalCommandPanel,
      category: 'terminal',
      description: 'Kill process by PID',
      requiresArgs: true,
    });
  }

  /**
   * Registra un comando con il suo componente
   */
  private registerCommand(name: string, mapping: CommandMapping): void {
    this.commandMappings.set(name, mapping);
    
    // Registra anche gli alias
    if (mapping.aliases) {
      mapping.aliases.forEach(alias => {
        this.commandMappings.set(alias, mapping);
      });
    }
  }

  /**
   * Ottiene il componente per un comando
   */
  getCommandComponent(commandName: string): React.ComponentType<CommandPanelProps> | null {
    const mapping = this.commandMappings.get(commandName);
    return mapping?.component || null;
  }

  /**
   * Ottiene informazioni su un comando
   */
  getCommandInfo(commandName: string): CommandMapping | null {
    return this.commandMappings.get(commandName) || null;
  }

  /**
   * Lista tutti i comandi disponibili
   */
  listCommands(): Array<{ name: string; mapping: CommandMapping }> {
    const commands: Array<{ name: string; mapping: CommandMapping }> = [];
    const seen = new Set<React.ComponentType<CommandPanelProps>>();

    for (const [name, mapping] of this.commandMappings.entries()) {
      if (!seen.has(mapping.component)) {
        commands.push({ name, mapping });
        seen.add(mapping.component);
      }
    }

    return commands.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Lista comandi per categoria
   */
  listCommandsByCategory(): Record<string, Array<{ name: string; mapping: CommandMapping }>> {
    const commands = this.listCommands();
    const byCategory: Record<string, Array<{ name: string; mapping: CommandMapping }>> = {};

    commands.forEach(cmd => {
      const category = cmd.mapping.category;
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(cmd);
    });

    return byCategory;
  }

  /**
   * Verifica se un comando ha un componente UI
   */
  hasUIComponent(commandName: string): boolean {
    return this.commandMappings.has(commandName);
  }

  /**
   * Crea un componente comando con props
   */
  createCommandComponent(
    commandName: string, 
    args: string[], 
    context: any,
    onComplete?: (result: CommandResult) => void,
    onError?: (error: Error) => void
  ): React.ReactElement | null {
    const Component = this.getCommandComponent(commandName);
    if (!Component) return null;

    const props: CommandPanelProps = {
      title: `/${commandName}`,
      args,
      context,
      onComplete,
      onError,
    };

    return React.createElement(Component, props);
  }

  /**
   * Routing decisionale: determina se usare UI component o fallback console
   */
  shouldUseUIComponent(commandName: string, forceUI: boolean = false): boolean {
    // Se forceUI è true, usa sempre UI se disponibile
    if (forceUI) {
      return this.hasUIComponent(commandName);
    }

    // Logica per determinare quando usare UI components
    const mapping = this.commandMappings.get(commandName);
    if (!mapping) return false;

    // Comandi che beneficiano sempre dell'UI
    const alwaysUICommands = ['help', 'models', 'agents', 'config', 'vm-list', 'images', 'plan'];
    if (alwaysUICommands.includes(commandName)) return true;

    // Comandi interattivi
    const interactiveCommands = ['vm-create', 'create-agent', 'analyze-image', 'generate-image'];
    if (interactiveCommands.includes(commandName)) return true;

    // Default: usa UI se strutturata è abilitata
    return process.env.NIKCLI_STRUCTURED_UI === 'true' || 
           (global as any).__nikCLI?.structuredUIEnabled || 
           false;
  }
}

// Singleton instance
export const commandRouter = new CommandRouter();