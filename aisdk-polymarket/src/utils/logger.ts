/**
 * Structured logger with levels
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface LoggerConfig {
  level?: LogLevel;
  prefix?: string;
  sanitize?: boolean;
}

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private sanitize: boolean;

  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? LogLevel.INFO;
    this.prefix = config.prefix ?? '@bamby/aisdk-polymarket';
    this.sanitize = config.sanitize ?? true;
  }

  /**
   * Sanitize sensitive data
   */
  private sanitizeData(data: any): any {
    if (!this.sanitize) return data;

    const sensitiveKeys = [
      'apiKey',
      'apiSecret',
      'privateKey',
      'signature',
      'secret',
      'password',
      'token',
    ];

    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeData(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Format log message
   */
  private format(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = this.prefix ? `[${this.prefix}]` : '';
    const dataStr = data ? ` ${JSON.stringify(this.sanitizeData(data))}` : '';
    return `${timestamp} ${level} ${prefix} ${message}${dataStr}`;
  }

  debug(message: string, data?: any): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(this.format('DEBUG', message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.level <= LogLevel.INFO) {
      console.info(this.format('INFO', message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.format('WARN', message, data));
    }
  }

  error(message: string, error?: any): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(this.format('ERROR', message, error));
    }
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Create child logger with prefix
   */
  child(prefix: string): Logger {
    return new Logger({
      level: this.level,
      prefix: `${this.prefix}:${prefix}`,
      sanitize: this.sanitize,
    });
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger({
  level: process.env.LOG_LEVEL
    ? LogLevel[process.env.LOG_LEVEL as keyof typeof LogLevel]
    : LogLevel.INFO,
});
