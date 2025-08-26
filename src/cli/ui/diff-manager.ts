import chalk from 'chalk';
import boxen from 'boxen';
import { diffLines, Change } from 'diff';
import * as fs from 'fs';
import * as path from 'path';
import { advancedUI } from './advanced-cli-ui';

export interface FileDiff {
  filePath: string;
  oldContent: string;
  newContent: string;
  changes: Change[];
  status: 'pending' | 'accepted' | 'rejected';
}

export interface DiffViewerOptions {
  showLineNumbers: boolean;
  contextLines: number;
  colorized: boolean;
}

export class DiffManager {
  private pendingDiffs: Map<string, FileDiff> = new Map();
  private autoAccept: boolean = false;

  /**
   * Set auto-accept mode
   */
  setAutoAccept(enabled: boolean): void {
    this.autoAccept = enabled;
  }

  /**
   * Add a file diff for review
   */
  addFileDiff(filePath: string, oldContent: string, newContent: string): void {
    const changes = diffLines(oldContent, newContent);

    const fileDiff: FileDiff = {
      filePath,
      oldContent,
      newContent,
      changes,
      status: this.autoAccept ? 'accepted' : 'pending'
    };

    this.pendingDiffs.set(filePath, fileDiff);

    // Show diff in structured UI when interactive and not auto-accept; guard and swallow UI errors
    if (!this.autoAccept && process.stdout.isTTY && typeof advancedUI?.showFileDiff === 'function') {
      void Promise.resolve(advancedUI.showFileDiff(filePath, oldContent, newContent))
        .catch((err: any) => {
          console.log(chalk.yellow(`⚠ Advanced UI failed for ${filePath}: ${err?.message ?? String(err)}`));
        });
    }
    if (this.autoAccept) {
      this.applyDiff(filePath);
    }
  }

  /**
   * Display diff for a specific file
   */
  showDiff(filePath: string, options: DiffViewerOptions = {
    showLineNumbers: true,
    contextLines: 3,
    colorized: true
  }): void {
    const diff = this.pendingDiffs.get(filePath);
    if (!diff) {
      console.log(chalk.red(`No diff found for ${filePath}`));
      return;
    }

    console.log(boxen(
      `${chalk.blue.bold('File Diff:')} ${chalk.cyan(filePath)}\\n` +
      `${chalk.gray('Status:')} ${this.getStatusColor(diff.status)}`,
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'blue'
      }
    ));

    this.renderDiff(diff, options);
  }

  /**
   * Show all pending diffs
   */
  showAllDiffs(options?: DiffViewerOptions): void {
    const pendingFiles = Array.from(this.pendingDiffs.values())
      .filter(d => d.status === 'pending');

    if (pendingFiles.length === 0) {
      console.log(chalk.yellow('No pending diffs to review'));
      return;
    }

    console.log(chalk.cyan.bold(`\\n📋 ${pendingFiles.length} Pending File Changes:`));
    console.log(chalk.gray('─'.repeat(60)));

    pendingFiles.forEach((diff, index) => {
      const changeCount = diff.changes.filter(c => c.added || c.removed).length;
      console.log(`${index + 1}. ${chalk.blue(diff.filePath)} ${chalk.dim(`(${changeCount} changes)`)}`);
    });

    console.log('\\n' + chalk.yellow('Use /diff <file> to review individual changes'));
    console.log(chalk.green('Use /accept <file> to approve changes'));
    console.log(chalk.red('Use /reject <file> to discard changes'));
    console.log(chalk.blue('Use /accept-all to approve all pending changes\\n'));
  }

  /**
   * Accept a diff and apply changes
   */
  acceptDiff(filePath: string): boolean {
    const diff = this.pendingDiffs.get(filePath);
    if (!diff) return false;

    diff.status = 'accepted';
    return this.applyDiff(filePath);
  }

  /**
   * Reject a diff
   */
  rejectDiff(filePath: string): boolean {
    const diff = this.pendingDiffs.get(filePath);
    if (!diff) return false;

    diff.status = 'rejected';
    console.log(chalk.red(`✖ Rejected changes to ${filePath}`));
    return true;
  }

  /**
   * Accept all pending diffs
   */
  acceptAllDiffs(): number {
    let applied = 0;

    for (const [filePath, diff] of this.pendingDiffs) {
      if (diff.status === 'pending') {
        if (this.acceptDiff(filePath)) {
          applied++;
        }
      }
    }

    console.log(chalk.green(`✅ Applied ${applied} file changes`));
    return applied;
  }

  /**
   * Get pending diff count
   */
  getPendingCount(): number {
    return Array.from(this.pendingDiffs.values())
      .filter(d => d.status === 'pending').length;
  }

  /**
   * Clear all diffs
   */
  clearDiffs(): void {
    this.pendingDiffs.clear();
  }

  /**
   * Apply diff to filesystem
   */
  private applyDiff(filePath: string): boolean {
    const diff = this.pendingDiffs.get(filePath);
    if (!diff) return false;

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write new content
      fs.writeFileSync(filePath, diff.newContent, 'utf8');

      console.log(chalk.green(`✅ Applied changes to ${filePath}`));
      return true;
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to apply changes to ${filePath}: ${error.message}`));
      return false;
    }
  }

  /**
   * Render diff with syntax highlighting
   */
  private renderDiff(diff: FileDiff, options: DiffViewerOptions): void {
    let lineNumber = 1;
    let contextCount = 0;

    for (const change of diff.changes) {
      const lines = change.value.split('\\n').filter(line => line !== '');

      for (const line of lines) {
        let prefix = ' ';
        let color = chalk.dim;
        let lineNumColor = chalk.dim;

        if (change.added) {
          prefix = '+';
          color = chalk.green;
          lineNumColor = chalk.green;
        } else if (change.removed) {
          prefix = '-';
          color = chalk.red;
          lineNumColor = chalk.red;
        } else {
          // Context line
          if (options.contextLines > 0) {
            contextCount++;
            if (contextCount > options.contextLines) {
              continue; // Skip excessive context
            }
          }
        }

        if (options.showLineNumbers) {
          const lineNum = lineNumColor(String(lineNumber).padStart(4, ' '));
          console.log(`${lineNum} ${prefix} ${color(line)}`);
        } else {
          console.log(`${prefix} ${color(line)}`);
        }

        if (!change.removed) {
          lineNumber++;
        }
      }
    }
  }

  /**
   * Get status color
   */
  private getStatusColor(status: string): string {
    switch (status) {
      case 'pending': return chalk.yellow('Pending');
      case 'accepted': return chalk.green('Accepted');
      case 'rejected': return chalk.red('Rejected');
      default: return chalk.gray('Unknown');
    }
  }
}

export const diffManager = new DiffManager();