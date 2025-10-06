import { LogLevel, LoggerConfig } from '../types';

export class Logger {
    private config: LoggerConfig;
    private levels: Record<LogLevel, number> = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3
    };

    constructor(config: LoggerConfig = { level: 'info', enabled: true }) {
        this.config = config;
    }

    private shouldLog(level: LogLevel): boolean {
        if (!this.config.enabled) return false;
        return this.levels[level] >= this.levels[this.config.level];
    }

    private formatMessage(level: LogLevel, message: string, meta?: any): string {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        return `${prefix} ${message}${metaStr}`;
    }

    debug(message: string, meta?: any): void {
        if (this.shouldLog('debug')) {
            console.debug(this.formatMessage('debug', message, meta));
        }
    }

    info(message: string, meta?: any): void {
        if (this.shouldLog('info')) {
            console.info(this.formatMessage('info', message, meta));
        }
    }

    warn(message: string, meta?: any): void {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message, meta));
        }
    }

    error(message: string, meta?: any): void {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message, meta));
        }
    }

    setLevel(level: LogLevel): void {
        this.config.level = level;
    }

    enable(): void {
        this.config.enabled = true;
    }

    disable(): void {
        this.config.enabled = false;
    }
}

export const createLogger = (config?: LoggerConfig): Logger => {
    return new Logger(config);
};

