/**
 * Logger utility for the CLI system
 * Provides structured logging with different levels
 */

import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  source: string;
  message: string;
  data?: any;
}

export class Logger {
  private source: string;
  private static logLevel: LogLevel = 'info';
  private static logs: LogEntry[] = [];
  private static maxLogs: number = 1000;
  private static consoleOutputEnabled: boolean = true;

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Set global log level
   */
  static setLogLevel(level: LogLevel): void {
    Logger.logLevel = level;
  }

  /**
   * Enable/disable console output
   */
  static setConsoleOutput(enabled: boolean): void {
    Logger.consoleOutputEnabled = enabled;
  }

  /**
   * Get global log level
   */
  static getLogLevel(): LogLevel {
    return Logger.logLevel;
  }

  /**
   * Get all logs
   */
  static getLogs(): LogEntry[] {
    return [...Logger.logs];
  }

  /**
   * Clear all logs
   */
  static clearLogs(): void {
    Logger.logs = [];
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(Logger.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Add log entry to storage
   */
  private addLogEntry(level: LogLevel, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      source: this.source,
      message,
      data
    };

    Logger.logs.unshift(entry);

    // Limit number of stored logs
    if (Logger.logs.length > Logger.maxLogs) {
      Logger.logs = Logger.logs.slice(0, Logger.maxLogs);
    }
  }

  /**
   * Format log message for console output
   */
  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const levelColor = this.getLevelColor(level);
    const sourceColor = chalk.cyan;
    const timestampColor = chalk.gray;

    let formattedMessage = `${timestampColor(timestamp)} ${levelColor(`[${level.toUpperCase()}]`)} ${sourceColor(`[${this.source}]`)} ${message}`;

    if (data !== undefined) {
      formattedMessage += `\n${chalk.gray(JSON.stringify(data, null, 2))}`;
    }

    return formattedMessage;
  }

  /**
   * Get color for log level
   */
  private getLevelColor(level: LogLevel): (text: string) => string {
    switch (level) {
      case 'debug':
        return chalk.blue;
      case 'info':
        return chalk.green;
      case 'warn':
        return chalk.yellow;
      case 'error':
        return chalk.red;
      default:
        return chalk.white;
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: any): void {
    this.addLogEntry('debug', message, data);
    if (this.shouldLog('debug') && Logger.consoleOutputEnabled) {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  /**
   * Log info message
   */
  info(message: string, data?: any): void {
    this.addLogEntry('info', message, data);
    if (this.shouldLog('info') && Logger.consoleOutputEnabled) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any): void {
    this.addLogEntry('warn', message, data);
    if (this.shouldLog('warn') && Logger.consoleOutputEnabled) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  /**
   * Log error message
   */
  error(message: string, data?: any): void {
    this.addLogEntry('error', message, data);
    if (this.shouldLog('error') && Logger.consoleOutputEnabled) {
      console.error(this.formatMessage('error', message, data));
    }
  }

  /**
   * Create a child logger with a sub-source
   */
  child(subSource: string): Logger {
    return new Logger(`${this.source}:${subSource}`);
  }

  /**
   * Get the source of this logger
   */
  getSource(): string {
    return this.source;
  }
}

// Create default logger instance
export const logger = new Logger('CLI');

// Export log levels for external use
export const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
