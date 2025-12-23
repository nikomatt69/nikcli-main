import chalk from 'chalk'
import { themeManager } from '../ui/theme-manager'

export interface LogColors {
  info: string
  warn: string
  error: string
  debug: string
  success: string
  timestamp: string
  level: string
}

export interface LoggerConfig {
  colors: LogColors
  showTimestamp: boolean
  showLevel: boolean
  showIcons: boolean
}

export class ThemeAwareLogger {
  private logger: any
  private config: LoggerConfig

  constructor(logger: any, config?: Partial<LoggerConfig>) {
    this.logger = logger
    this.config = {
      colors: {
        info: 'blue',
        warn: 'yellow',
        error: 'red',
        debug: 'gray',
        success: 'green',
        timestamp: 'dim',
        level: 'dim',
        ...config?.colors
      },
      showTimestamp: config?.showTimestamp ?? true,
      showLevel: config?.showLevel ?? true,
      showIcons: config?.showIcons ?? true,
      ...config
    }
  }

  private getLogColor(level: string): string {
    const theme = themeManager.getCurrentTheme()
    const mode = 'default' as 'default' | 'plan' | 'vm'

    // Map log levels to theme colors
    const colorMap: Record<string, keyof typeof theme.colors.default> = {
      info: 'accent1',
      warn: 'accent1',
      error: 'accent1',
      debug: 'accent3',
      success: 'accent2',
    }

    const colorKey = colorMap[level.toLowerCase()] || 'modeText'
    const colorValue = theme.colors[mode][colorKey]

    // If it's a ColorGradient, use the 'from' color
    if (typeof colorValue === 'object' && 'from' in colorValue) {
      return colorValue.from
    }

    return colorValue as string
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toLocaleTimeString()
    const iconMap: Record<string, string> = {
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      debug: '🐛',
      success: '✅',
    }

    const icon = this.config.showIcons ? `${iconMap[level.toLowerCase()] || '📝'} ` : ''
    const levelText = this.config.showLevel ? `[${level.toUpperCase()}] ` : ''
    const timestampText = this.config.showTimestamp ? `${chalk.dim(`[${timestamp}]`)} ` : ''

    // Get color from theme
    const themeColor = this.getLogColor(level)
    const colorMethod = this.getChalkMethod(themeColor)

    return `${timestampText}${colorMethod(levelText + icon + message)}`
  }

  private getChalkMethod(colorName: string): (text: string) => string {
    const [r, g, b] = colorName.match(/\d+/g)?.map(Number) || []

    if (r !== undefined && g !== undefined && b !== undefined) {
      return chalk.rgb(r, g, b)
    }

    // Try to use chalk method directly
    const chalkMethod = (chalk as any)[colorName]
    if (typeof chalkMethod === 'function') {
      return chalkMethod
    }

    // Fallback
    return chalk.white
  }

  private applyThemeToArgs(args: any[]): string[] {
    return args.map(arg => {
      if (typeof arg === 'string') {
        return this.getChalkMethod(this.getLogColor('info'))(arg)
      }
      return arg
    })
  }

  info(message: string, ...args: any[]): void {
    const formatted = this.formatMessage('info', message)
    const themedArgs = this.applyThemeToArgs(args)
    this.logger.info ? this.logger.info(formatted, ...themedArgs) : console.log(formatted, ...themedArgs)
  }

  warn(message: string, ...args: any[]): void {
    const formatted = this.formatMessage('warn', message)
    const themedArgs = this.applyThemeToArgs(args)
    this.logger.warn ? this.logger.warn(formatted, ...themedArgs) : console.warn(formatted, ...themedArgs)
  }

  error(message: string, ...args: any[]): void {
    const formatted = this.formatMessage('error', message)
    const themedArgs = this.applyThemeToArgs(args)
    this.logger.error ? this.logger.error(formatted, ...themedArgs) : console.error(formatted, ...themedArgs)
  }

  debug(message: string, ...args: any[]): void {
    const formatted = this.formatMessage('debug', message)
    const themedArgs = this.applyThemeToArgs(args)
    this.logger.debug ? this.logger.debug(formatted, ...themedArgs) : console.debug(formatted, ...themedArgs)
  }

  success(message: string, ...args: any[]): void {
    const formatted = this.formatMessage('success', message)
    const themedArgs = this.applyThemeToArgs(args)
    // If logger doesn't have success, use info
    if (this.logger.success) {
      this.logger.success(formatted, ...themedArgs)
    } else if (this.logger.info) {
      this.logger.info(formatted, ...themedArgs)
    } else {
      console.log(formatted, ...themedArgs)
    }
  }

  log(message: string, ...args: any[]): void {
    const formatted = this.formatMessage('info', message)
    const themedArgs = this.applyThemeToArgs(args)
    this.logger.log ? this.logger.log(formatted, ...themedArgs) : console.log(formatted, ...themedArgs)
  }

  // Proxy other methods to underlying logger
  child(bindings: any): ThemeAwareLogger {
    const childLogger = this.logger.child ? this.logger.child(bindings) : this.logger
    return new ThemeAwareLogger(childLogger, this.config)
  }

  getLevel(): string | undefined {
    return this.logger.level || this.logger.getLevel?.()
  }

  setLevel(level: string): void {
    if (this.logger.setLevel) {
      this.logger.setLevel(level)
    }
  }

  // Direct passthrough for methods not themed
  trace?(message: string, ...args: any[]): void {
    if (this.logger.trace) this.logger.trace(message, ...args)
  }

  fatal?(message: string, ...args: any[]): void {
    if (this.logger.fatal) this.logger.fatal(message, ...args)
  }
}

// Factory function to wrap existing loggers
export function createThemeAwareLogger(logger: any, config?: Partial<LoggerConfig>): ThemeAwareLogger {
  return new ThemeAwareLogger(logger, config)
}

// Singleton instance for global use
let globalThemeLogger: ThemeAwareLogger | null = null

export function getGlobalThemeLogger(): ThemeAwareLogger {
  if (!globalThemeLogger) {
    // Default to console if no logger provided
    globalThemeLogger = new ThemeAwareLogger(console)
  }
  return globalThemeLogger
}

export function setGlobalThemeLogger(logger: ThemeAwareLogger): void {
  globalThemeLogger = logger
}
