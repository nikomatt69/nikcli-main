import chalk from 'chalk';
import ora, { Ora } from 'ora';

/**
 * CLI UI utilities for enhanced user experience
 * Provides colored output and loading spinners
 */
export class CliUI {
  private static spinner: Ora | null = null;

  // Color utilities
  static success(message: string): string {
    return chalk.green(`✓ ${message}`);
  }

  static error(message: string): string {
    return chalk.red(`✗ ${message}`);
  }

  static warning(message: string): string {
    return chalk.yellow(`⚠ ${message}`);
  }

  static info(message: string): string {
    return chalk.blue(`ℹ ${message}`);
  }

  static highlight(message: string): string {
    return chalk.cyan(message);
  }

  static dim(message: string): string {
    return chalk.gray(message);
  }

  static bold(message: string): string {
    return chalk.bold(message);
  }

  // Section headers
  static section(title: string): string {
    return chalk.bold.magenta(`\n=== ${title} ===\n`);
  }

  static subsection(title: string): string {
    return chalk.bold.blue(`\n--- ${title} ---`);
  }

  // Spinner utilities
  static startSpinner(message: string): void {
    if (this.spinner) {
      this.spinner.stop();
    }
    this.spinner = ora({
      text: message,
      color: 'cyan',
      spinner: 'dots'
    }).start();
  }

  static updateSpinner(message: string): void {
    if (this.spinner) {
      this.spinner.text = message;
    }
  }

  static succeedSpinner(message?: string): void {
    if (this.spinner) {
      this.spinner.succeed(message);
      this.spinner = null;
    }
  }

  static failSpinner(message?: string): void {
    if (this.spinner) {
      this.spinner.fail(message);
      this.spinner = null;
    }
  }

  static stopSpinner(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  // Logging methods that combine colors with console output
  static logSuccess(message: string): void {
    console.log(this.success(message));
  }

  static logError(message: string): void {
    console.error(this.error(message));
  }

  static logWarning(message: string): void {
    console.warn(this.warning(message));
  }

  static logInfo(message: string): void {
    console.log(this.info(message));
  }

  static logDebug(message: string, data?: any): void {
    if (process.env.DEBUG || process.env.DEBUG_EVENTS) {
      console.log(chalk.gray('🐛'), chalk.dim(message));
      if (data) {
        console.log(chalk.dim(JSON.stringify(data, null, 2)));
      }
    }
  }

  static logSection(title: string): void {
    console.log(this.section(title));
  }

  static logSubsection(title: string): void {
    console.log(this.subsection(title));
  }

  // Progress indication for multi-step operations
  static logProgress(current: number, total: number, message: string): void {
    const percentage = Math.round((current / total) * 100);
    const progressBar = this.createProgressBar(current, total);
    console.log(`${progressBar} ${percentage}% ${this.dim(message)}`);
  }

  private static createProgressBar(current: number, total: number, width: number = 20): string {
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    const filledBar = chalk.cyan('█'.repeat(filled));
    const emptyBar = chalk.gray('░'.repeat(empty));
    return `[${filledBar}${emptyBar}]`;
  }

  // Table-like output for structured data
  static logKeyValue(key: string, value: string, indent: number = 0): void {
    const spaces = ' '.repeat(indent);
    console.log(`${spaces}${chalk.bold(key)}: ${chalk.white(value)}`);
  }

  // Error formatting with context
  static formatError(error: Error, context?: string): string {
    let message = this.error(`Error: ${error.message}`);
    if (context) {
      message += `\n${this.dim(`Context: ${context}`)}`;
    }
    if (error.stack) {
      message += `\n${this.dim(error.stack)}`;
    }
    return message;
  }

  // Command execution feedback
  static logCommandStart(command: string): void {
    console.log(this.info(`Executing: ${this.highlight(command)}`));
  }

  static logCommandSuccess(command: string, duration?: number): void {
    let message = `Command completed: ${this.highlight(command)}`;
    if (duration) {
      message += ` ${this.dim(`(${duration}ms)`)}`;
    }
    console.log(this.success(message));
  }

  static logCommandError(command: string, error: string): void {
    console.log(this.error(`Command failed: ${this.highlight(command)}`));
    console.log(this.dim(`Error: ${error}`));
  }
}

// Convenience exports for direct usage
export const { 
  success, 
  error, 
  warning, 
  info, 
  highlight, 
  dim, 
  bold,
  section,
  subsection,
  startSpinner,
  updateSpinner,
  succeedSpinner,
  failSpinner,
  stopSpinner,
  logSuccess,
  logError,
  logWarning,
  logInfo,
  logSection,
  logSubsection,
  logProgress,
  logKeyValue,
  formatError,
  logCommandStart,
  logCommandSuccess,
  logCommandError
} = CliUI;
