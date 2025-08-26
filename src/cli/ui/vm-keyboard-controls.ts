import { EventEmitter } from 'events';
import * as readline from 'readline';
import chalk from 'chalk';
import { VMStatusIndicator } from './vm-status-indicator';
import { CliUI } from '../utils/cli-ui';

/**
 * VMKeyboardControls - Keyboard interface for VM agent management
 * 
 * Keyboard Shortcuts:
 * - Ctrl+L: Show VM agent logs panel
 * - Ctrl+M: Return to main chat stream
 * - Ctrl+S: Show security dashboard  
 * - Ctrl+K: Emergency kill agent
 * - Ctrl+V: Toggle VM status display mode
 * - Ctrl+T: Show token usage summary
 * - F1-F12: Quick agent selection
 */
export class VMKeyboardControls extends EventEmitter {
  private static instance: VMKeyboardControls;
  private statusIndicator: VMStatusIndicator;
  private isActive = false;
  private currentMode: ControlMode = 'normal';
  private selectedAgentIndex = 0;
  private originalRawMode: boolean;
  
  // Panel states
  private currentPanel: PanelType | null = null;
  private panelContent = '';
  private autoRefresh = true;
  private refreshInterval: NodeJS.Timeout | null = null;
  
  // Key mapping
  private readonly keyMappings: KeyMappings = {
    '\u000C': 'show_logs',      // Ctrl+L
    '\u000D': 'main_chat',      // Ctrl+M (Enter in some terminals)
    '\u0013': 'security_dash',  // Ctrl+S
    '\u000B': 'kill_agent',     // Ctrl+K
    '\u0016': 'toggle_display', // Ctrl+V
    '\u0014': 'token_usage',    // Ctrl+T
    '\u001B[11~': 'select_f1',  // F1
    '\u001B[12~': 'select_f2',  // F2
    '\u001B[13~': 'select_f3',  // F3
    '\u001B[14~': 'select_f4',  // F4
    '\u001B[15~': 'select_f5',  // F5
    '\u001B[17~': 'select_f6',  // F6
    '\u001B[18~': 'select_f7',  // F7
    '\u001B[19~': 'select_f8',  // F8
    '\u001B[20~': 'select_f9',  // F9
    '\u001B[21~': 'select_f10', // F10
    '\u001B[23~': 'select_f11', // F11
    '\u001B[24~': 'select_f12', // F12
    '\u001B': 'escape',         // Escape
    'q': 'quit_panel',          // Q to quit current panel
    'r': 'refresh_panel',       // R to refresh current panel
    'h': 'show_help',           // H for help
    '\u001B[A': 'arrow_up',     // Arrow Up
    '\u001B[B': 'arrow_down',   // Arrow Down
    '\u001B[C': 'arrow_right',  // Arrow Right
    '\u001B[D': 'arrow_left'    // Arrow Left
  };

  private constructor() {
    super();
    this.statusIndicator = VMStatusIndicator.getInstance();
    this.originalRawMode = process.stdin.isRaw || false;
    this.setupKeyboardHandling();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): VMKeyboardControls {
    if (!VMKeyboardControls.instance) {
      VMKeyboardControls.instance = new VMKeyboardControls();
    }
    return VMKeyboardControls.instance;
  }

  /**
   * Activate keyboard controls
   */
  activate(): void {
    if (this.isActive) return;
    
    this.isActive = true;
    this.enableRawMode();
    
    CliUI.logInfo('⌨️ VM keyboard controls activated');
    this.showKeyboardHelp();
    this.emit('controls:activated');
  }

  /**
   * Deactivate keyboard controls
   */
  deactivate(): void {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.closePanels();
    this.disableRawMode();
    
    CliUI.logInfo('⌨️ VM keyboard controls deactivated');
    this.emit('controls:deactivated');
  }

  /**
   * Setup keyboard event handling
   */
  private setupKeyboardHandling(): void {
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      
      process.stdin.on('keypress', (str, key) => {
        if (!this.isActive) return;
        
        this.handleKeypress(str, key);
      });
    }
  }

  /**
   * Handle keypress events
   */
  private handleKeypress(str: string, key: any): void {
    try {
      // Handle special key combinations first
      if (key && key.ctrl) {
        this.handleCtrlKeys(key);
        return;
      }
      
      // Handle function keys and escape sequences
      if (str && this.keyMappings[str]) {
        this.handleCommand(this.keyMappings[str]);
        return;
      }
      
      // Handle single character commands (only in panel mode)
      if (this.currentPanel && str && this.keyMappings[str]) {
        this.handleCommand(this.keyMappings[str]);
        return;
      }
      
      // Handle regular characters in panel mode
      if (this.currentPanel) {
        this.handlePanelInput(str, key);
      }
      
    } catch (error: any) {
      CliUI.logError(`❌ Keyboard handler error: ${error.message}`);
    }
  }

  /**
   * Handle Ctrl key combinations
   */
  private handleCtrlKeys(key: any): void {
    switch (key.name) {
      case 'l':
        this.showLogsPanel();
        break;
      case 'm':
        this.returnToMainChat();
        break;
      case 's':
        this.showSecurityDashboard();
        break;
      case 'k':
        this.emergencyKillAgent();
        break;
      case 'v':
        this.toggleDisplayMode();
        break;
      case 't':
        this.showTokenUsage();
        break;
      case 'c':
        // Ctrl+C - Handle gracefully
        if (this.currentPanel) {
          this.closePanels();
        } else {
          this.emit('interrupt');
        }
        break;
    }
  }

  /**
   * Handle command execution
   */
  private handleCommand(command: string): void {
    switch (command) {
      case 'show_logs':
        this.showLogsPanel();
        break;
      case 'main_chat':
        this.returnToMainChat();
        break;
      case 'security_dash':
        this.showSecurityDashboard();
        break;
      case 'kill_agent':
        this.emergencyKillAgent();
        break;
      case 'toggle_display':
        this.toggleDisplayMode();
        break;
      case 'token_usage':
        this.showTokenUsage();
        break;
      case 'escape':
        this.closePanels();
        break;
      case 'quit_panel':
        this.closePanels();
        break;
      case 'refresh_panel':
        this.refreshCurrentPanel();
        break;
      case 'show_help':
        this.showKeyboardHelp();
        break;
      case 'arrow_up':
        this.navigateAgents(-1);
        break;
      case 'arrow_down':
        this.navigateAgents(1);
        break;
      default:
        if (command.startsWith('select_f')) {
          const fNum = parseInt(command.replace('select_f', ''));
          this.selectAgentByFunction(fNum);
        }
    }
  }

  /**
   * Show logs panel for current agent
   */
  private showLogsPanel(): void {
    const agents = this.statusIndicator.getActiveAgents();
    
    if (agents.length === 0) {
      this.showMessage('No active VM agents');
      return;
    }
    
    const selectedAgent = agents[this.selectedAgentIndex] || agents[0];
    
    this.currentPanel = 'logs';
    this.panelContent = this.statusIndicator.getAgentLogsPanel(selectedAgent.agentId);
    this.displayPanel();
    this.startAutoRefresh();
    
    this.emit('panel:opened', { type: 'logs', agentId: selectedAgent.agentId });
  }

  /**
   * Return to main chat stream
   */
  private returnToMainChat(): void {
    this.closePanels();
    this.currentMode = 'normal';
    
    console.clear();
    console.log(chalk.green('✅ Returned to main chat stream'));
    
    this.emit('mode:changed', { mode: 'normal' });
  }

  /**
   * Show security dashboard
   */
  private showSecurityDashboard(): void {
    this.currentPanel = 'security';
    this.panelContent = this.statusIndicator.getSecurityDashboard();
    this.displayPanel();
    this.startAutoRefresh();
    
    this.emit('panel:opened', { type: 'security' });
  }

  /**
   * Emergency kill selected agent
   */
  private emergencyKillAgent(): void {
    const agents = this.statusIndicator.getActiveAgents();
    
    if (agents.length === 0) {
      this.showMessage('No active VM agents to kill');
      return;
    }
    
    const selectedAgent = agents[this.selectedAgentIndex] || agents[0];
    
    // Show confirmation
    this.showConfirmation(
      `Emergency kill agent ${selectedAgent.agentId}?`,
      () => {
        this.emit('agent:emergency_kill', { agentId: selectedAgent.agentId });
        this.showMessage(`Agent ${selectedAgent.agentId} kill signal sent`);
      }
    );
  }

  /**
   * Toggle display mode
   */
  private toggleDisplayMode(): void {
    const modes = ['compact', 'detailed', 'minimal'];
    const currentMode = this.statusIndicator['displayMode'] || 'compact';
    const currentIndex = modes.indexOf(currentMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];
    
    this.statusIndicator.setDisplayMode(nextMode as any);
    this.showMessage(`Display mode: ${nextMode}`);
    
    this.emit('display:mode_changed', { mode: nextMode });
  }

  /**
   * Show token usage summary
   */
  private showTokenUsage(): void {
    this.currentPanel = 'tokens';
    
    const agents = this.statusIndicator.getActiveAgents();
    const lines = [];
    
    lines.push(chalk.cyan.bold('🎫 Token Usage Summary'));
    lines.push(chalk.gray('─'.repeat(60)));
    
    let totalUsed = 0;
    let totalBudget = 0;
    
    for (const agent of agents) {
      const usage = agent.tokenUsage;
      const percent = Math.round((usage.used / usage.budget) * 100);
      const color = percent > 90 ? chalk.red : percent > 70 ? chalk.yellow : chalk.green;
      
      lines.push(`${agent.agentId.slice(0, 12)}: ${color(`${usage.used}/${usage.budget} (${percent}%)`)}`);
      
      totalUsed += usage.used;
      totalBudget += usage.budget;
    }
    
    lines.push('');
    lines.push(chalk.white.bold('Total:'));
    const totalPercent = totalBudget > 0 ? Math.round((totalUsed / totalBudget) * 100) : 0;
    lines.push(`${totalUsed}/${totalBudget} tokens (${totalPercent}%)`);
    
    this.panelContent = lines.join('\n');
    this.displayPanel();
    
    this.emit('panel:opened', { type: 'tokens' });
  }

  /**
   * Navigate between agents
   */
  private navigateAgents(direction: number): void {
    const agents = this.statusIndicator.getActiveAgents();
    
    if (agents.length === 0) return;
    
    this.selectedAgentIndex = Math.max(0, Math.min(agents.length - 1, this.selectedAgentIndex + direction));
    
    const selectedAgent = agents[this.selectedAgentIndex];
    this.showMessage(`Selected: ${selectedAgent.agentId.slice(0, 12)}`);
    
    // Refresh current panel if showing agent-specific content
    if (this.currentPanel === 'logs') {
      this.refreshCurrentPanel();
    }
  }

  /**
   * Select agent by function key
   */
  private selectAgentByFunction(fNum: number): void {
    const agents = this.statusIndicator.getActiveAgents();
    const index = fNum - 1;
    
    if (index >= 0 && index < agents.length) {
      this.selectedAgentIndex = index;
      const selectedAgent = agents[index];
      this.showMessage(`Selected: ${selectedAgent.agentId.slice(0, 12)}`);
    }
  }

  /**
   * Display current panel
   */
  private displayPanel(): void {
    console.clear();
    console.log(this.panelContent);
    console.log('');
    console.log(chalk.dim('Controls: Q=quit, R=refresh, H=help, ↑↓=navigate, Esc=close'));
  }

  /**
   * Close all panels
   */
  private closePanels(): void {
    this.currentPanel = null;
    this.panelContent = '';
    this.stopAutoRefresh();
    
    this.emit('panel:closed');
  }

  /**
   * Refresh current panel
   */
  private refreshCurrentPanel(): void {
    if (!this.currentPanel) return;
    
    switch (this.currentPanel) {
      case 'logs':
        this.showLogsPanel();
        break;
      case 'security':
        this.showSecurityDashboard();
        break;
      case 'tokens':
        this.showTokenUsage();
        break;
    }
  }

  /**
   * Start auto refresh for panels
   */
  private startAutoRefresh(): void {
    if (!this.autoRefresh) return;
    
    this.stopAutoRefresh();
    this.refreshInterval = setInterval(() => {
      this.refreshCurrentPanel();
    }, 5000); // Refresh every 5 seconds
  }

  /**
   * Stop auto refresh
   */
  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Handle panel input
   */
  private handlePanelInput(str: string, key: any): void {
    // Panel-specific input handling can be added here
    // For now, most commands are handled by the general command system
  }

  /**
   * Show temporary message
   */
  private showMessage(message: string): void {
    console.log(chalk.blue(`📢 ${message}`));
    setTimeout(() => {
      if (this.currentPanel) {
        this.displayPanel();
      }
    }, 2000);
  }

  /**
   * Show confirmation dialog
   */
  private showConfirmation(message: string, onConfirm: () => void): void {
    console.log(chalk.yellow(`❓ ${message} [y/N]`));
    
    const originalHandler = process.stdin.listeners('keypress')[0];
    
    const confirmHandler = (str: string, key: any) => {
      if (str && str.toLowerCase() === 'y') {
        onConfirm();
      }
      
      process.stdin.removeListener('keypress', confirmHandler);
      
      if (this.currentPanel) {
        this.displayPanel();
      }
    };
    
    process.stdin.on('keypress', confirmHandler);
  }

  /**
   * Show keyboard help
   */
  private showKeyboardHelp(): void {
    const help = [
      chalk.cyan.bold('⌨️ VM Agent Keyboard Controls'),
      chalk.gray('─'.repeat(60)),
      '',
      chalk.white.bold('Global Controls:'),
      '  Ctrl+L    Show agent logs panel',
      '  Ctrl+M    Return to main chat',
      '  Ctrl+S    Security dashboard',
      '  Ctrl+K    Emergency kill agent',
      '  Ctrl+V    Toggle display mode',
      '  Ctrl+T    Token usage summary',
      '',
      chalk.white.bold('Panel Controls:'),
      '  Q         Quit current panel',
      '  R         Refresh panel',
      '  H         Show this help',
      '  ↑↓        Navigate agents',
      '  Esc       Close all panels',
      '',
      chalk.white.bold('Quick Selection:'),
      '  F1-F12    Select agent by number',
      '',
      chalk.gray('─'.repeat(60)),
      chalk.dim('Press any key to continue...')
    ].join('\n');
    
    console.log(help);
  }

  /**
   * Enable raw mode for character input
   */
  private enableRawMode(): void {
    if (process.stdin.isTTY && !process.stdin.isRaw) {
      process.stdin.setRawMode(true);
    }
  }

  /**
   * Disable raw mode
   */
  private disableRawMode(): void {
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(this.originalRawMode);
    }
  }
}

// Type definitions
export type ControlMode = 'normal' | 'panel' | 'agent_selection';
export type PanelType = 'logs' | 'security' | 'tokens' | 'help';

export interface KeyMappings {
  [key: string]: string;
}