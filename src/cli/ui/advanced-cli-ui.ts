import chalk from 'chalk';
import boxen from '../ui/tui-bridge';
import ora, { Ora } from 'ora';
import cliProgress from 'cli-progress';
import * as readline from 'readline';
import { highlight } from 'cli-highlight';
import * as path from 'path';

export interface StatusIndicator {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'warning';
  details?: string;
  progress?: number; // 0-100
  startTime?: Date;
  endTime?: Date;
  subItems?: StatusIndicator[];
}

export interface LiveUpdate {
  type: 'status' | 'progress' | 'log' | 'error' | 'warning' | 'info';
  content: string;
  timestamp: Date;
  source?: string;
}

export interface UITheme {
  primary: any;
  secondary: any;
  success: any;
  warning: any;
  error: any;
  info: any;
  muted: any;
}

export interface StructuredPanel {
  id: string;
  title: string;
  content: string;
  type: 'diff' | 'file' | 'list' | 'status' | 'chat' | 'todos' | 'agents' | 'git';
  language?: string;
  filePath?: string;
  visible: boolean;
  width?: number;
  borderColor?: string;
  pinned?: boolean;
  priority?: number;
  // For panels that should remain visible across operations
}

export interface BackgroundAgentInfo {
  id: string;
  name: string;
  status: 'idle' | 'working' | 'completed' | 'error';
  currentTask?: string;
  progress?: number;
  startTime?: Date;
  lastUpdate?: Date;
}

export class AdvancedCliUI {
  private indicators: Map<string, StatusIndicator> = new Map();
  private liveUpdates: LiveUpdate[] = [];
  public backgroundAgents: Map<string, BackgroundAgentInfo> = new Map();
  private spinners: Map<string, Ora> = new Map();
  private progressBars: Map<string, cliProgress.SingleBar> = new Map();
  private theme: UITheme;
  private isInteractiveMode: boolean = false;
  private panels: Map<string, StructuredPanel> = new Map();
  private layoutMode: 'single' | 'dual' | 'triple' = 'dual';
  private renderTimer: NodeJS.Timeout | null = null;
  private vscodeStreamEnabled: boolean = false;

  constructor() {
    this.theme = {
      primary: chalk.blue,
      secondary: chalk.cyan,
      success: chalk.green,
      warning: chalk.yellow,
      error: chalk.red,
      info: chalk.gray,
      muted: chalk.dim,
    };
    // Enable VS Code structured event stream when requested
    const flag = process.env.NIKCLI_VSCODE_STREAM || process.env.NIKCLI_EXT_JSON;
    this.vscodeStreamEnabled = !!flag && !['0', 'false', 'False', 'OFF'].includes(flag);
  }

  /** Emit a structured event consumable by VS Code webview */
  private emitEvent(event: any): void {
    if (!this.vscodeStreamEnabled) return;
    try {
      const payload = typeof event === 'string' ? event : JSON.stringify(event);
      console.log(`NIKCLI_EVENT:${payload}`);
    } catch { /* ignore */ }
  }

  /**
   * Start interactive mode with live updates
   */
  startInteractiveMode(): void {
    this.isInteractiveMode = true;
    this.emitEvent({ type: 'ui', action: 'start' });
  }

  /**
   * Stop interactive mode
   */
  stopInteractiveMode(): void {
    this.isInteractiveMode = false;
    this.cleanup();
    this.emitEvent({ type: 'ui', action: 'stop' });
  }

  /**
   * Show application header
   */


  /**
   * Create a new status indicator
   */
  createIndicator(id: string, title: string, details?: string): StatusIndicator {
    const indicator: StatusIndicator = {
      id,
      title,
      status: 'pending',
      details,
      startTime: new Date(),
      subItems: [],
    };

    this.indicators.set(id, indicator);

    this.emitEvent({ type: 'indicator', action: 'create', data: indicator });

    if (this.isInteractiveMode) {
      this.refreshDisplay();
    } else {
      this.logInfo(`📋 ${title}`, details);
    }

    return indicator;
  }

  /**
   * Update status indicator
   */
  updateIndicator(
    id: string,
    updates: Partial<StatusIndicator>
  ): void {
    const indicator = this.indicators.get(id);
    if (!indicator) return;

    Object.assign(indicator, updates);
    this.emitEvent({ type: 'indicator', action: 'update', data: indicator });

    if (updates.status === 'completed' || updates.status === 'failed') {
      indicator.endTime = new Date();
    }

    if (this.isInteractiveMode) {
      this.refreshDisplay();
    } else {
      this.logStatusUpdate(indicator);
    }
  }

  /**
   * Start a spinner for long-running tasks
   */
  startSpinner(id: string, text: string): void {
    if (this.isInteractiveMode) {
      this.updateIndicator(id, { status: 'running' });
      return;
    }

    const spinner = ora({
      text,
      spinner: 'dots',
      color: 'cyan',
    }).start();

    this.spinners.set(id, spinner);
    this.emitEvent({ type: 'spinner', action: 'start', data: { id, text } });
  }

  /**
   * Update spinner text
   */
  updateSpinner(id: string, text: string): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.text = text;
    }

    this.updateIndicator(id, { details: text });
    this.emitEvent({ type: 'spinner', action: 'update', data: { id, text } });
  }

  /**
   * Stop spinner with result
   */
  stopSpinner(id: string, success: boolean, finalText?: string): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      if (success) {
        spinner.succeed(finalText);
      } else {
        spinner.fail(finalText);
      }
      this.spinners.delete(id);
    }

    this.updateIndicator(id, {
      status: success ? 'completed' : 'failed',
      details: finalText,
    });
    this.emitEvent({ type: 'spinner', action: 'stop', data: { id, success, finalText } });
  }

  /**
   * Create progress bar
   */
  createProgressBar(id: string, title: string, total: number): void {
    if (this.isInteractiveMode) {
      this.createIndicator(id, title);
      this.updateIndicator(id, { progress: 0 });
      this.emitEvent({ type: 'progress', action: 'create', data: { id, title, total } });
      return;
    }

    const progressBar = new cliProgress.SingleBar({
      format: `${chalk.cyan(title)} |${chalk.cyan('{bar}')}| {percentage}% | {value}/{total} | ETA: {eta}s`,
      barCompleteChar: '█',
      barIncompleteChar: '░',
    });

    progressBar.start(total, 0);
    this.progressBars.set(id, progressBar);
    this.emitEvent({ type: 'progress', action: 'create', data: { id, title, total } });
  }

  /**
   * Update progress bar
   */
  updateProgress(id: string, current: number, total?: number): void {
    const progressBar = this.progressBars.get(id);
    if (progressBar) {
      progressBar.update(current);
    }

    const progress = total ? Math.round((current / total) * 100) : current;
    this.updateIndicator(id, { progress });
    this.emitEvent({ type: 'progress', action: 'update', data: { id, current, total, progress } });
  }

  /**
   * Complete progress bar
   */
  completeProgress(id: string, message?: string): void {
    const progressBar = this.progressBars.get(id);
    if (progressBar) {
      progressBar.stop();
      this.progressBars.delete(id);
    }

    this.updateIndicator(id, {
      status: 'completed',
      progress: 100,
      details: message,
    });
    this.emitEvent({ type: 'progress', action: 'complete', data: { id, message } });
  }

  /**
   * Add live update
   */
  addLiveUpdate(update: Omit<LiveUpdate, 'timestamp'>): void {
    const liveUpdate: LiveUpdate = {
      ...update,
      timestamp: new Date(),
    };

    this.liveUpdates.push(liveUpdate);

    // Keep only recent updates
    if (this.liveUpdates.length > 50) {
      this.liveUpdates = this.liveUpdates.slice(-50);
    }

    if (this.isInteractiveMode) {
      this.refreshDisplay();
    } else {
      this.printLiveUpdate(liveUpdate);
    }

    // Stream as structured log event
    this.emitEvent({ type: 'log', level: update.type, message: update.content, source: update.source, timestamp: liveUpdate.timestamp });
  }

  /**
   * Log different types of messages
   */
  logInfo(message: string, details?: string): void {
    this.addLiveUpdate({
      type: 'info',
      content: message,
      source: details,
    });
  }

  logSuccess(message: string, details?: string): void {
    this.addLiveUpdate({
      type: 'log',
      content: `✅ ${message}`,
      source: details,
    });
  }

  logWarning(message: string, details?: string): void {
    this.addLiveUpdate({
      type: 'warning',
      content: `⚠️ ${message}`,
      source: details,
    });
  }

  logError(message: string, details?: string): void {
    this.addLiveUpdate({
      type: 'error',
      content: `❌ ${message}`,
      source: details,
    });
  }

  /**
   * Show execution summary
   */
  showExecutionSummary(): void {
    const indicators = Array.from(this.indicators.values());
    const completed = indicators.filter(i => i.status === 'completed').length;
    const failed = indicators.filter(i => i.status === 'failed').length;
    const warnings = indicators.filter(i => i.status === 'warning').length;

    const summary = boxen(
      `${chalk.bold('Execution Summary')}\\n\\n` +
      `${chalk.green('✅ Completed:')} ${completed}\\n` +
      `${chalk.red('❌ Failed:')} ${failed}\\n` +
      `${chalk.yellow('⚠️ Warnings:')} ${warnings}\\n` +
      `${chalk.blue('📊 Total:')} ${indicators.length}\\n\\n` +
      `${chalk.gray('Overall Status:')} ${this.getOverallStatusText()}`,
      {
        padding: 1,
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: failed > 0 ? 'red' : completed === indicators.length ? 'green' : 'yellow',
      }
    );

    console.log(summary);
  }

  /**
   * Show detailed status of all indicators
   */
  showDetailedStatus(): void {
    console.log(chalk.blue.bold('\\n📊 Detailed Status Report'));
    console.log(chalk.gray('═'.repeat(80)));

    const indicators = Array.from(this.indicators.values());

    if (indicators.length === 0) {
      console.log(chalk.gray('No active tasks'));
      return;
    }

    indicators.forEach(indicator => {
      this.printIndicatorDetails(indicator);
    });
  }

  /**
   * Ask user for confirmation (non-blocking in chat mode)
   */
  async askConfirmation(
    question: string,
    details?: string,
    defaultValue: boolean = false
  ): Promise<boolean> {
    // In chat mode, just return default to avoid blocking
    // Log the question for user awareness but don't block execution
    const icon = defaultValue ? '✅' : '❓';
    console.log(`${icon} ${chalk.cyan(question)} ${chalk.yellow.bold(`(auto-${defaultValue ? 'approved' : 'rejected'})`)}`);

    if (details) {
      console.log(chalk.gray(`   ${details}`));
    }
    console.log(chalk.gray(`   → Using default value: ${defaultValue}`));

    // Auto-approve to prevent blocking in chat mode
    return defaultValue;
  }

  /**
   * Show multi-choice selection (simple readline, no panels)
   */
  async showSelection<T>(
    title: string,
    choices: { value: T; label: string; description?: string }[],
    defaultIndex: number = 0
  ): Promise<T> {
    console.log(chalk.cyan.bold(`\\n${title}`));
    console.log(chalk.gray('─'.repeat(50)));

    choices.forEach((choice, index) => {
      const indicator = index === defaultIndex ? chalk.green('→') : ' ';
      console.log(`${indicator} ${index + 1}. ${chalk.bold(choice.label)}`);
      if (choice.description) {
        console.log(`   ${chalk.gray(choice.description)}`);
      }
    });

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const prompt = `\nSelect option (1-${choices.length}, default ${defaultIndex + 1}): `;
      rl.question(prompt, (answer) => {
        rl.close();

        let selection = defaultIndex;
        const num = parseInt(answer.trim());
        if (!isNaN(num) && num >= 1 && num <= choices.length) {
          selection = num - 1;
        }

        console.log(chalk.green(`✓ Selected: ${choices[selection].label}`));
        resolve(choices[selection].value);
      });
    });
  }

  /**
   * Show real-time file watching
   */
  startFileWatcher(pattern: string): string {
    const watcherId = `watch-${Date.now()}`;

    this.createIndicator(watcherId, `Watching files: ${pattern}`);
    this.updateIndicator(watcherId, { status: 'running' });

    this.logInfo(`👀 Started watching: ${pattern}`);

    return watcherId;
  }

  /**
   * Report file change
   */
  reportFileChange(watcherId: string, filePath: string, changeType: 'created' | 'modified' | 'deleted'): void {
    const emoji = changeType === 'created' ? '📄' :
      changeType === 'modified' ? '✏️' : '🗑️';

    this.addLiveUpdate({
      type: 'info',
      content: `${emoji} ${changeType}: ${filePath}`,
      source: 'file-watcher',
    });
  }

  /**
   * Refresh display in interactive mode
   */
  private refreshDisplay(): void {
    if (!this.isInteractiveMode) return;

    // Move cursor to top and clear
    process.stdout.write('\x1B[2J\x1B[H');


    this.showActiveIndicators();
    this.showRecentUpdates();
  }

  /**
   * Show active indicators
   */
  private showActiveIndicators(): void {
    const indicators = Array.from(this.indicators.values());

    if (indicators.length === 0) return;

    console.log(chalk.blue.bold('📊 Active Tasks:'));
    console.log(chalk.gray('─'.repeat(60)));

    indicators.forEach(indicator => {
      this.printIndicatorLine(indicator);
    });

    console.log();
  }

  /**
   * Show recent updates
   */
  private showRecentUpdates(): void {
    const recentUpdates = this.liveUpdates.slice(-10);

    if (recentUpdates.length === 0) return;

    console.log(chalk.blue.bold('📝 Recent Updates:'));
    console.log(chalk.gray('─'.repeat(60)));

    recentUpdates.forEach(update => {
      this.printLiveUpdate(update);
    });
  }

  /**
   * Print indicator line
   */
  private printIndicatorLine(indicator: StatusIndicator): void {
    const statusIcon = this.getStatusIcon(indicator.status);
    const statusColor = this.getStatusColor(indicator.status);
    const duration = this.getDuration(indicator);

    let line = `${statusIcon} ${chalk.bold(indicator.title)}`;

    if (indicator.progress !== undefined) {
      const progressBar = this.createProgressBarString(indicator.progress);
      line += ` ${progressBar}`;
    }

    if (duration) {
      line += ` ${chalk.gray(`(${duration})`)}`;
    }

    console.log(line);

    if (indicator.details) {
      console.log(`   ${chalk.gray(indicator.details)}`);
    }
  }

  /**
   * Print indicator details
   */
  private printIndicatorDetails(indicator: StatusIndicator): void {
    const statusIcon = this.getStatusIcon(indicator.status);
    const statusColor = this.getStatusColor(indicator.status);
    const duration = this.getDuration(indicator);

    console.log(`\\n${statusIcon} ${chalk.bold(indicator.title)}`);
    console.log(`   Status: ${statusColor(indicator.status.toUpperCase())}`);

    if (indicator.details) {
      console.log(`   Details: ${indicator.details}`);
    }

    if (indicator.progress !== undefined) {
      console.log(`   Progress: ${indicator.progress}%`);
    }

    if (duration) {
      console.log(`   Duration: ${duration}`);
    }

    if (indicator.subItems && indicator.subItems.length > 0) {
      console.log(`   Sub-tasks: ${indicator.subItems.length}`);
      indicator.subItems.forEach(subItem => {
        const subIcon = this.getStatusIcon(subItem.status);
        console.log(`     ${subIcon} ${subItem.title}`);
      });
    }
  }

  /**
   * Print live update
   */
  private printLiveUpdate(update: LiveUpdate): void {
    const timeStr = update.timestamp.toLocaleTimeString();
    const typeColor = this.getUpdateTypeColor(update.type);
    const sourceStr = update.source ? chalk.gray(`[${update.source}]`) : '';

    const line = `${chalk.gray(timeStr)} ${sourceStr} ${typeColor(update.content)}`;
    console.log(line);
  }

  /**
   * Log status update in non-interactive mode
   */
  private logStatusUpdate(indicator: StatusIndicator): void {
    const statusIcon = this.getStatusIcon(indicator.status);
    const statusColor = this.getStatusColor(indicator.status);

    console.log(`${statusIcon} ${statusColor(indicator.title)}`);

    if (indicator.details) {
      console.log(`   ${chalk.gray(indicator.details)}`);
    }
  }

  /**
   * Utility methods
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'warning': return '⚠️';
      default: return '📋';
    }
  }

  private getStatusColor(status: string): any {
    switch (status) {
      case 'pending': return chalk.gray;
      case 'running': return chalk.blue;
      case 'completed': return chalk.green;
      case 'failed': return chalk.red;
      case 'warning': return chalk.yellow;
      default: return chalk.gray;
    }
  }

  private getUpdateTypeColor(type: string): any {
    switch (type) {
      case 'error': return chalk.red;
      case 'warning': return chalk.yellow;
      case 'info': return chalk.blue;
      case 'log': return chalk.green;
      default: return chalk.white;
    }
  }

  private createProgressBarString(progress: number, width: number = 20): string {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;

    const bar = chalk.cyan('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    return `[${bar}] ${progress}%`;
  }

  private getDuration(indicator: StatusIndicator): string | null {
    if (!indicator.startTime) return null;

    const endTime = indicator.endTime || new Date();
    const duration = endTime.getTime() - indicator.startTime.getTime();

    const seconds = Math.round(duration / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    }
  }

  private getOverallStatus(): string {
    const indicators = Array.from(this.indicators.values());

    if (indicators.length === 0) return chalk.gray('Idle');

    const hasRunning = indicators.some(i => i.status === 'running');
    const hasFailed = indicators.some(i => i.status === 'failed');
    const hasWarning = indicators.some(i => i.status === 'warning');

    if (hasRunning) return chalk.blue('Running');
    if (hasFailed) return chalk.red('Failed');
    if (hasWarning) return chalk.yellow('Warning');

    return chalk.green('Ready');
  }

  private getOverallStatusText(): string {
    const indicators = Array.from(this.indicators.values());

    if (indicators.length === 0) return chalk.gray('No tasks');

    const completed = indicators.filter(i => i.status === 'completed').length;
    const failed = indicators.filter(i => i.status === 'failed').length;

    if (failed > 0) {
      return chalk.red('Some tasks failed');
    } else if (completed === indicators.length) {
      return chalk.green('All tasks completed successfully');
    } else {
      return chalk.blue('Tasks in progress');
    }
  }

  /**
   * Show file diff in structured panel
   */
  showFileDiff(filePath: string, oldContent: string, newContent: string): void {
    const diffContent = this.generateDiffContent(oldContent, newContent);

    this.panels.set('diff', {
      id: 'diff',
      title: `📝 ${path.basename(filePath)}`,
      content: diffContent,
      type: 'diff',
      filePath,
      visible: true,
      borderColor: 'yellow'
    });


    this.autoLayout();

    // Emit raw contents for accurate rendering in VS Code
    this.emitEvent({ type: 'panel', panel: 'diff', filePath, oldContent, newContent });
  }

  /**
   * Show enhanced Todos panel with real items and additional metadata
   */
  showTodos(
    todos: Array<{
      content?: string;
      title?: string;
      status?: string;
      priority?: string;
      category?: string;
      progress?: number;
    }>,
    title: string = 'Update Todos'
  ): void {
    const lines: string[] = [];

    for (const t of todos) {
      const text = (t.title || t.content || '').trim();
      if (!text) continue;

      // Enhanced status icons
      const statusIcon = t.status === 'completed' ? '✅' :
        t.status === 'in_progress' ? '🔄' :
          t.status === 'failed' ? '❌' :
            t.status === 'skipped' ? '⏭️' : '⏳';

      // Priority indicators
      const priorityIcon = t.priority === 'critical' ? '🔴' :
        t.priority === 'high' ? '🟡' :
          t.priority === 'medium' ? '🟢' :
            t.priority === 'low' ? '🔵' : '';

      // Category color coding
      const categoryColor = t.category === 'planning' ? this.theme.primary :
        t.category === 'implementation' ? this.theme.success :
          t.category === 'testing' ? this.theme.warning :
            t.category === 'documentation' ? this.theme.secondary :
              this.theme.info;

      // Progress bar for in-progress items
      let progressBar = '';
      if (t.status === 'in_progress' && t.progress !== undefined) {
        const progress = Math.min(100, Math.max(0, t.progress));
        const filled = Math.round((progress / 100) * 20);
        const empty = 20 - filled;
        progressBar = ` [${'█'.repeat(filled)}${'░'.repeat(empty)}] ${progress}%`;
      }

      // Styling based on status
      let styled = text;
      if (t.status === 'completed') {
        styled = this.theme.success.strikethrough(text);
      } else if (t.status === 'failed') {
        styled = this.theme.error(text);
      } else if (t.status === 'in_progress') {
        styled = this.theme.primary(text);
      } else {
        styled = this.theme.info(text);
      }

      // Build the line with all information
      let line = `${statusIcon} ${priorityIcon} ${styled}`;

      // Add category if available
      if (t.category) {
        line += ` ${categoryColor(`[${t.category}]`)}`;
      }

      // Add progress bar
      if (progressBar) {
        line += ` ${this.theme.muted(progressBar)}`;
      }

      lines.push(line);
    }

    const content = lines.join('\n');

    this.panels.set('todos', {
      id: 'todos',
      title: `📋 ${title}`,
      content,
      type: 'todos',
      visible: true,
      borderColor: 'cyan',
      pinned: true,
      priority: 100,
    });

    this.autoLayout();
    this.emitEvent({ type: 'panel', panel: 'todos', title, items: todos });
  }

  /**
   * Parse a markdown Todo file (todo.md) and render as Todos panel
   */
  showTodosFromMarkdown(markdown: string, title: string = 'Todo Plan'): void {
    try {
      const items: Array<{ content: string; status?: string }> = [];
      const lines = markdown.split(/\r?\n/);
      let inTodos = false;
      let currentTitle: string | null = null;
      let currentStatus: string | undefined = undefined;

      const flush = () => {
        if (currentTitle) {
          items.push({ content: currentTitle.trim(), status: currentStatus });
        }
        currentTitle = null;
        currentStatus = undefined;
      };

      for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith('## ')) {
          const isTodoHeader = /#+\s*Todo Items/i.test(line);
          if (!inTodos && isTodoHeader) {
            inTodos = true;
            continue;
          }
          if (inTodos && !isTodoHeader) {
            // end of todo section
            break;
          }
        }
        if (!inTodos) continue;

        const mTitle = line.match(/^###\s*\d+\.\s*(.+)$/);
        if (mTitle) {
          flush();
          currentTitle = mTitle[1];
          continue;
        }
        const mStatus = line.match(/^Status:\s*(.+)$/i);
        if (mStatus) {
          const s = mStatus[1].toLowerCase();
          if (s.includes('complete') || s.includes('done') || s.includes('✅')) currentStatus = 'completed';
          else if (s.includes('progress')) currentStatus = 'in_progress';
          else if (s.includes('pending') || s.includes('todo')) currentStatus = 'pending';
          else currentStatus = undefined;
          continue;
        }
      }
      flush();
      if (items.length > 0) {
        this.showTodos(items, title);
      } else {
        this.showFileContent('todo.md', markdown);
      }
    } catch {
      this.showFileContent('todo.md', markdown);
    }
  }

  /**
   * Show file content with syntax highlighting
   */
  showFileContent(filePath: string, content: string, highlightLines?: number[]): void {
    const language = this.detectLanguage(filePath);
    const formattedContent = this.formatCodeContent(content, language, highlightLines);

    this.panels.set('file', {
      id: 'file',
      title: `📄 ${path.basename(filePath)}`,
      content: formattedContent,
      type: 'file',
      language,
      filePath,
      visible: true,
      borderColor: 'green'
    });

    this.showCodingLayout();

    this.emitEvent({ type: 'panel', panel: 'file', filePath, content, language, highlightLines });
  }

  /**
   * Show file list (grep/find results)
   */
  showFileList(files: string[], title: string = '📁 Files'): void {
    const listContent = files.map((file, index) => {
      const icon = this.getFileIcon(path.extname(file));
      return `${icon} ${file}`;
    }).join('\n');

    this.panels.set('list', {
      id: 'list',
      title,
      content: listContent,
      type: 'list',
      visible: true,
      borderColor: 'magenta'
    });

    this.autoLayout();

    this.emitEvent({ type: 'panel', panel: 'list', title, files });
  }

  /**
   * Show coding layout (file content + status)
   */
  showCodingLayout(): void {
    this.hidePanel('diff');
    this.hidePanel('list');
    this.layoutMode = 'single';
    this.renderStructuredLayout();
  }

  /**
   * Show diff layout (diff + status)  
   */
  showDiffLayout(): void {
    this.hidePanel('file');
    this.hidePanel('list');
    this.layoutMode = 'dual';
    this.renderStructuredLayout();
  }

  /**
   * Show search layout (list + file + status)
   */
  showSearchLayout(): void {
    this.layoutMode = 'triple';
    this.renderStructuredLayout();
  }

  /**
   * Auto-layout based on current visible panels
   */
  autoLayout(): void {
    const visiblePanels = this.getRenderablePanels();
    const count = visiblePanels.length;
    if (count <= 1) this.layoutMode = 'single';
    else if (count === 2) this.layoutMode = 'dual';
    else this.layoutMode = 'triple';

    this.scheduleRender();
  }

  /**
   * Show grep results in structured format
   */
  showGrepResults(pattern: string, matches: any[]): void {
    const grepContent = matches.map(match => {
      const fileName = chalk.blue(match.file || match.filePath);
      const lineNum = chalk.yellow(`${match.lineNumber || match.line}`);
      const line = (match.content || match.match || '').replace(
        new RegExp(pattern, 'gi'),
        chalk.bgYellow.black('$&')
      );
      return `${fileName}:${lineNum}: ${line}`;
    }).join('\n');

    this.panels.set('list', {
      id: 'list',
      title: `🔍 Grep: ${pattern}`,
      content: grepContent,
      type: 'list',
      visible: true,
      borderColor: 'cyan'
    });

    this.showSearchLayout();

    this.emitEvent({ type: 'panel', panel: 'grep', pattern, matches });
  }

  /**
   * Hide panel
   */
  hidePanel(panelId: string): void {
    const panel = this.panels.get(panelId);
    if (panel) {
      panel.visible = false;
      this.adjustLayout();
      this.emitEvent({ type: 'panel', panel: panel.type, action: 'hide', id: panelId });
    }
  }

  /**
   * Clear all panels
   */
  clearPanels(): void {
    this.panels.clear();
    this.layoutMode = 'single';
    this.emitEvent({ type: 'panel', panel: 'all', action: 'clear' });
  }

  /**
   * Create a new panel
   */
  createPanel(panelConfig: StructuredPanel): void {
    // Apply default border color per panel type if not provided
    const color = panelConfig.borderColor || this.getDefaultBorderColor(panelConfig.type);
    const defaultPinned = (panelConfig.type === 'status' || panelConfig.type === 'todos' || panelConfig.type === 'agents');
    const withDefaults: StructuredPanel = { pinned: panelConfig.id === 'todos' ? true : defaultPinned, priority: panelConfig.id === 'todos' ? 100 : 0, ...panelConfig, borderColor: color };
    this.panels.set(withDefaults.id, withDefaults);

    // Recompute layout and render
    this.autoLayout();
    if (!this.isInteractiveMode) {
      console.log(chalk.green(`✅ Panel '${withDefaults.title}' created`));
    }
    this.emitEvent({ type: 'panel', panel: withDefaults.type, action: 'create', config: withDefaults });
  }

  private getDefaultBorderColor(type: StructuredPanel['type']): string {
    switch (type) {
      case 'diff': return 'yellow';
      case 'file': return 'green';
      case 'list': return 'magenta';
      case 'git': return 'blue';
      case 'todos': return 'cyan';
      case 'agents': return 'blue';
      case 'status': return 'green';
      case 'chat': return 'white';
      default: return 'white';
    }
  }
  /**
   * Show persistent todos (disabled in simple mode)
   */


  /**
   * Render structured layout with panels
   */
  private renderStructuredLayout(): void {
    if (!this.isInteractiveMode) {
      this.renderSimpleLayout();
      return;
    }

    console.clear();


    const visiblePanels = this.getRenderablePanels();

    if (visiblePanels.length === 0) {
      this.showActiveIndicators();
      return;
    }

    // Promote layout based on visible panel count
    if (visiblePanels.length >= 3) {
      this.renderTripleLayout(visiblePanels);
      return;
    }
    if (this.layoutMode === 'single' || visiblePanels.length === 1) {
      this.renderSinglePanel(visiblePanels[0]);
    } else if (this.layoutMode === 'dual' || visiblePanels.length === 2) {
      this.renderDualLayout(visiblePanels);
    } else {
      this.renderTripleLayout(visiblePanels);
    }

    this.showActiveIndicators();
  }

  private scheduleRender(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.renderTimer = setTimeout(() => {
      this.renderStructuredLayout();
    }, 16);
  }

  private getRenderablePanels(): StructuredPanel[] {
    const visible = Array.from(this.panels.values()).filter(p => p.visible);
    const pinned = visible.filter(p => p.pinned);
    const others = visible.filter(p => !p.pinned);
    const sortByPriority = (a: StructuredPanel, b: StructuredPanel) => (b.priority || 0) - (a.priority || 0);
    pinned.sort(sortByPriority);
    others.sort(sortByPriority);
    const maxPanels = 3;
    const remaining = Math.max(0, maxPanels - pinned.length);
    const selectedOthers = remaining > 0 ? others.slice(0, remaining) : [];
    return [...pinned.slice(0, maxPanels), ...selectedOthers].slice(0, maxPanels);
  }

  private renderSimpleLayout(): void {
    const visiblePanels = this.getRenderablePanels();

    visiblePanels.forEach(panel => {
      console.log(boxen(
        this.formatPanelContent(panel),
        {
          title: panel.title,
          titleAlignment: 'left',
          padding: 1,
          borderStyle: 'round',
          borderColor: panel.borderColor || 'white'
        }
      ));
    });
  }

  private renderSinglePanel(panel: StructuredPanel): void {
    const terminalWidth = process.stdout || 80;

    console.log(boxen(
      this.formatPanelContent(panel),
      {
        title: panel.title,
        titleAlignment: 'left',
        padding: 1,
        borderStyle: 'round',
        borderColor: panel.borderColor || 'white',
        width: Math.min((process.stdout.columns || 80) - 4, 120)
      }
    ));
  }

  private renderDualLayout(panels: StructuredPanel[]): void {
    const panelWidth = Math.floor((80 - 6) / 2);

    panels.slice(0, 2).forEach(panel => {
      console.log(boxen(
        this.formatPanelContent(panel),
        {
          title: panel.title,
          titleAlignment: 'left',
          padding: 1,
          borderStyle: 'round',
          borderColor: panel.borderColor || 'white',
          width: Math.max(panelWidth, 30),
          margin: { left: 1, right: 1 }
        }
      ));
    });
  }

  private renderTripleLayout(panels: StructuredPanel[]): void {
    const terminalWidth = 80;
    const panelWidth = Math.floor((terminalWidth - 8) / 3);

    panels.slice(0, 3).forEach(panel => {
      console.log(boxen(
        this.formatPanelContent(panel),
        {
          title: panel.title,
          titleAlignment: 'left',
          padding: 1,
          borderStyle: 'round',
          borderColor: panel.borderColor || 'white',
          width: Math.max(panelWidth, 25),
          margin: { left: 1, right: 1 }
        }
      ));
    });
  }

  private formatPanelContent(panel: StructuredPanel): string {
    switch (panel.type) {
      case 'diff':
        return this.formatDiffContent(panel.content);
      case 'file':
        return panel.content; // Already formatted in showFileContent
      case 'list':
        return this.formatListContent(panel.content);
      case 'git':
        return this.formatGitContent(panel.content);
      default:
        return panel.content;
    }
  }

  private formatDiffContent(content: string): string {
    return content.split('\n').map(line => {
      if (line.startsWith('+')) {
        return chalk.green(line);
      } else if (line.startsWith('-')) {
        return chalk.red(line);
      } else if (line.startsWith('@@')) {
        return chalk.cyan(line);
      } else {
        return chalk.gray(line);
      }
    }).join('\n');
  }

  private formatCodeContent(content: string, language?: string, highlightLines?: number[]): string {
    try {
      let formatted = language ? highlight(content, { language }) : content;

      if (highlightLines && highlightLines.length > 0) {
        const lines = formatted.split('\n');
        formatted = lines.map((line, index) => {
          const lineNum = (index + 1).toString().padStart(4, ' ');
          const isHighlighted = highlightLines.includes(index + 1);

          if (isHighlighted) {
            return chalk.bgYellow.black(`${lineNum}`) + ` ${line}`;
          } else {
            return chalk.gray(`${lineNum}`) + ` ${line}`;
          }
        }).join('\n');
      }

      return formatted;
    } catch (error) {
      return content;
    }
  }

  private formatListContent(content: string): string {
    const highlightNumbers = (s: string) => s.replace(/(\b\d[\d,.]*\b)/g, (_m, g1) => chalk.yellow(g1));
    return content.split('\n').map(line => {
      const colored = highlightNumbers(line);
      if (colored.trim()) {
        return colored.startsWith('•') ? colored : `${chalk.blue('•')} ${colored}`;
      }
      return colored;
    }).join('\n');
  }

  private formatGitContent(content: string): string {
    return content.split('\n').map(line => {
      // Colorize commit hashes (7+ character hex strings)
      if (/^[a-f0-9]{7,}/.test(line.trim())) {
        return chalk.yellow(line);
      }
      // Colorize commit messages (lines starting with spaces)
      else if (line.startsWith('  ')) {
        return chalk.white(line);
      }
      // Colorize author and date information
      else if (line.includes('(') && line.includes(')')) {
        return chalk.blue(line);
      }
      // Colorize separators
      else if (line.includes('─')) {
        return chalk.gray(line);
      }
      // Default formatting
      return line;
    }).join('\n');
  }

  private generateDiffContent(oldContent: string, newContent: string): string {
    const lines1 = oldContent.split('\n');
    const lines2 = newContent.split('\n');

    let diff = '';
    const maxLines = Math.max(lines1.length, lines2.length);

    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i] || '';
      const line2 = lines2[i] || '';

      if (line1 !== line2) {
        if (line1) diff += `-${line1}\n`;
        if (line2) diff += `+${line2}\n`;
      } else if (line1) {
        diff += ` ${line1}\n`;
      }
    }

    return diff;
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();

    // Special filenames
    if (basename === 'dockerfile') return 'dockerfile';
    if (basename === 'makefile') return 'makefile';
    if (basename === 'rakefile') return 'ruby';
    if (basename === 'gemfile') return 'ruby';
    if (basename === 'package.json') return 'json';
    if (basename === 'composer.json') return 'json';
    if (basename === 'tsconfig.json') return 'json';
    if (basename.endsWith('.config.js')) return 'javascript';
    if (basename.endsWith('.config.ts')) return 'typescript';

    const languageMap: Record<string, string> = {
      // JavaScript family
      '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
      '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
      '.vue': 'vue', '.svelte': 'svelte',

      // Web technologies
      '.html': 'html', '.htm': 'html', '.xhtml': 'html',
      '.css': 'css', '.scss': 'scss', '.sass': 'sass', '.less': 'less', '.styl': 'stylus',

      // Backend languages
      '.py': 'python', '.pyx': 'python', '.pyi': 'python', '.pyw': 'python',
      '.java': 'java', '.scala': 'scala', '.kt': 'kotlin', '.kts': 'kotlin',
      '.rb': 'ruby', '.rbx': 'ruby', '.gemspec': 'ruby',
      '.php': 'php', '.phtml': 'php', '.php3': 'php', '.php4': 'php', '.php5': 'php',
      '.go': 'go', '.rs': 'rust', '.swift': 'swift',
      '.cs': 'csharp', '.vb': 'vbnet', '.fs': 'fsharp',

      // Systems programming
      '.c': 'c', '.h': 'c',
      '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hxx': 'cpp',
      '.m': 'objectivec', '.mm': 'objectivec',

      // Shell and scripting
      '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash', '.fish': 'bash',
      '.ps1': 'powershell', '.psm1': 'powershell',
      '.bat': 'batch', '.cmd': 'batch',

      // Data formats
      '.json': 'json', '.jsonc': 'json', '.json5': 'json',
      '.xml': 'xml', '.xsd': 'xml', '.xsl': 'xml',
      '.yaml': 'yaml', '.yml': 'yaml',
      '.toml': 'toml', '.ini': 'ini', '.conf': 'ini', '.cfg': 'ini',
      '.env': 'bash', '.properties': 'properties',

      // Documentation
      '.md': 'markdown', '.markdown': 'markdown', '.mdown': 'markdown',
      '.rst': 'rst', '.tex': 'latex',

      // Database
      '.sql': 'sql', '.mysql': 'sql', '.pgsql': 'sql', '.sqlite': 'sql',

      // Other languages
      '.r': 'r', '.R': 'r', '.rmd': 'r',
      '.lua': 'lua', '.pl': 'perl', '.pm': 'perl',
      '.dart': 'dart', '.elm': 'elm', '.ex': 'elixir', '.exs': 'elixir',
      '.clj': 'clojure', '.cljs': 'clojure', '.cljc': 'clojure',
      '.hs': 'haskell', '.lhs': 'haskell',
      '.ml': 'ocaml', '.mli': 'ocaml',
      '.jl': 'julia',

      // Config and DevOps
      '.dockerfile': 'dockerfile',
      '.dockerignore': 'gitignore',
      '.gitignore': 'gitignore',
      '.gitattributes': 'gitattributes',
      '.editorconfig': 'editorconfig',
      '.prettierrc': 'json',
      '.eslintrc': 'json',

      // Templates
      '.hbs': 'handlebars', '.handlebars': 'handlebars',
      '.mustache': 'mustache',
      '.jinja': 'jinja2', '.j2': 'jinja2',
      '.ejs': 'ejs', '.erb': 'erb'
    };

    return languageMap[ext] || 'text';
  }

  private getFileIcon(ext: string): string {
    const iconMap: Record<string, string> = {
      // JavaScript ecosystem
      '.js': '📄', '.jsx': '⚛️', '.ts': '📘', '.tsx': '⚛️',
      '.vue': '💚', '.svelte': '🧡', '.mjs': '📄', '.cjs': '📄',

      // Web technologies
      '.html': '🌐', '.htm': '🌐', '.css': '🎨', '.scss': '🎨', '.sass': '🎨', '.less': '🎨',

      // Backend languages
      '.py': '🐍', '.java': '☕', '.scala': '🔴', '.kt': '🟣',
      '.rb': '💎', '.php': '🐘', '.go': '🐹', '.rs': '🦀', '.swift': '🦉',
      '.cs': '🔷', '.vb': '🔵', '.fs': '🔸',

      // Systems programming
      '.c': '⚙️', '.h': '⚙️', '.cpp': '⚙️', '.hpp': '⚙️',
      '.m': '🍎', '.mm': '🍎',

      // Shell and config
      '.sh': '📜', '.bash': '📜', '.zsh': '📜', '.fish': '🐠',
      '.ps1': '💙', '.bat': '⚫', '.cmd': '⚫',

      // Data formats
      '.json': '📋', '.xml': '📄', '.yaml': '⚙️', '.yml': '⚙️',
      '.toml': '📝', '.ini': '⚙️', '.env': '🔑',

      // Documentation
      '.md': '📝', '.rst': '📄', '.tex': '📄',

      // Database
      '.sql': '🗃️',

      // Other languages
      '.r': '📊', '.lua': '🌙', '.pl': '🐪', '.dart': '🎯',
      '.elm': '🌳', '.ex': '💧', '.clj': '🔵', '.hs': '🎩',
      '.ml': '🐪', '.jl': '🟢',

      // DevOps
      '.dockerfile': '🐳', '.dockerignore': '🐳',
      '.gitignore': '📋', '.gitattributes': '📋',

      // Templates
      '.hbs': '🔧', '.mustache': '👨', '.ejs': '📄', '.erb': '💎'
    };
    return iconMap[ext.toLowerCase()] || '📄';
  }

  private adjustLayout(): void {
    const visiblePanels = Array.from(this.panels.values()).filter(p => p.visible);

    if (visiblePanels.length <= 1) {
      this.layoutMode = 'single';
    } else if (visiblePanels.length === 2) {
      this.layoutMode = 'dual';
    } else {
      this.layoutMode = 'triple';
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Stop all spinners
    this.spinners.forEach(spinner => spinner.stop());
    this.spinners.clear();

    // Stop all progress bars
    this.progressBars.forEach(bar => bar.stop());
    this.progressBars.clear();

    // Clear panels
    this.panels.clear();
  }

  /**
   * Background Agents Management
   */

  /**
   * Register or update a background agent
   */
  updateBackgroundAgent(agentInfo: BackgroundAgentInfo): void {
    agentInfo.lastUpdate = new Date();
    this.backgroundAgents.set(agentInfo.id, agentInfo);

    // Update the agents panel
    this.updateAgentsPanel();
  }

  /**
   * Show background agents activity in real-time
   */
  showBackgroundAgentsActivity(agents: BackgroundAgentInfo[]): void {
    agents.forEach(agent => this.updateBackgroundAgent(agent));
  }

  /**
   * Get agent status icon
   */
  private getAgentStatusIcon(status: string): string {
    switch (status) {
      case 'idle': return '⏸️';
      case 'working': return '🔄';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '🤖';
    }
  }

  /**
   * Update the agents panel
   */
  private updateAgentsPanel(): void {
    const agents = Array.from(this.backgroundAgents.values());

    if (agents.length === 0) {
      this.panels.delete('agents');
      this.emitEvent({ type: 'panel', panel: 'agents', action: 'hide' });
      return;
    }

    const content = agents.map(agent => {
      const statusIcon = this.getAgentStatusIcon(agent.status);
      const progressBar = agent.progress ?
        `${'█'.repeat(Math.floor(agent.progress / 10))}${'░'.repeat(10 - Math.floor(agent.progress / 10))} ${agent.progress}%` :
        '';

      const timeInfo = agent.startTime ?
        ` (${this.formatDuration(Date.now() - agent.startTime.getTime())})` : '';

      let line = `${statusIcon} ${chalk.cyan(agent.name)}${timeInfo}`;

      if (agent.currentTask) {
        line += `\n    Task: ${agent.currentTask}`;
      }

      if (progressBar) {
        line += `\n    Progress: [${progressBar}]`;
      }

      return line;
    }).join('\n\n');

    this.panels.set('agents', {
      id: 'agents',
      title: '🤖 Background Agents',
      content,
      type: 'agents',
      visible: true,
      borderColor: 'blue'
    });

    this.autoLayout();
    this.emitEvent({ type: 'panel', panel: 'agents', action: 'update', agents });
  }

  /**
   * Format duration for display
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * Clear completed background agents
   */
  clearCompletedAgents(): void {
    for (const [id, agent] of this.backgroundAgents.entries()) {
      if (agent.status === 'completed' || agent.status === 'error') {
        this.backgroundAgents.delete(id);
      }
    }
    this.updateAgentsPanel();
  }

  /**
   * Get background agents status summary
   */
  getAgentsStatusSummary(): { total: number; working: number; idle: number; completed: number; errors: number } {
    const agents = Array.from(this.backgroundAgents.values());

    return {
      total: agents.length,
      working: agents.filter(a => a.status === 'working').length,
      idle: agents.filter(a => a.status === 'idle').length,
      completed: agents.filter(a => a.status === 'completed').length,
      errors: agents.filter(a => a.status === 'error').length
    };
  }
}

// Export singleton instance
export const advancedUI = new AdvancedCliUI();
