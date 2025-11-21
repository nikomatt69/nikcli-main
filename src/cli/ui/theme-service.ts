import chalk from 'chalk'
import type { ChalkInstance } from 'chalk'

export interface UITheme {
  name: string
  primary: ChalkInstance
  secondary: ChalkInstance
  success: ChalkInstance
  warning: ChalkInstance
  error: ChalkInstance
  info: ChalkInstance
  muted: ChalkInstance
  highlight: ChalkInstance
  border: {
    default: ChalkInstance
    active: ChalkInstance
    success: ChalkInstance
    error: ChalkInstance
    warning: ChalkInstance
  }
}

export type ThemePreset = 'default' | 'dracula' | 'monokai' | 'nord' | 'solarized' | 'cyberpunk'

export class ThemeService {
  private currentTheme: UITheme
  private themes: Record<string, UITheme>

  constructor() {
    this.themes = this.initializeThemes()
    this.currentTheme = this.themes.default
  }

  private initializeThemes(): Record<string, UITheme> {
    return {
      default: {
        name: 'default',
        primary: chalk.blue,
        secondary: chalk.cyan,
        success: chalk.green,
        warning: chalk.yellow,
        error: chalk.red,
        info: chalk.gray,
        muted: chalk.dim,
        highlight: chalk.yellow,
        border: {
          default: chalk.white,
          active: chalk.blue,
          success: chalk.green,
          error: chalk.red,
          warning: chalk.yellow,
        },
      },
      dracula: {
        name: 'dracula',
        primary: chalk.hex('#BD93F9'), // Purple
        secondary: chalk.hex('#8BE9FD'), // Cyan
        success: chalk.hex('#50FA7B'), // Green
        warning: chalk.hex('#FFB86C'), // Orange
        error: chalk.hex('#FF5555'), // Red
        info: chalk.hex('#6272A4'), // Comment
        muted: chalk.hex('#44475A'), // Selection
        highlight: chalk.hex('#F1FA8C'), // Yellow
        border: {
          default: chalk.hex('#6272A4'),
          active: chalk.hex('#BD93F9'),
          success: chalk.hex('#50FA7B'),
          error: chalk.hex('#FF5555'),
          warning: chalk.hex('#FFB86C'),
        },
      },
      monokai: {
        name: 'monokai',
        primary: chalk.hex('#A6E22E'), // Green
        secondary: chalk.hex('#66D9EF'), // Blue
        success: chalk.hex('#A6E22E'), // Green
        warning: chalk.hex('#FD971F'), // Orange
        error: chalk.hex('#F92672'), // Pink
        info: chalk.hex('#75715E'), // Grey
        muted: chalk.hex('#49483E'), // Dark Grey
        highlight: chalk.hex('#E6DB74'), // Yellow
        border: {
          default: chalk.hex('#75715E'),
          active: chalk.hex('#A6E22E'),
          success: chalk.hex('#A6E22E'),
          error: chalk.hex('#F92672'),
          warning: chalk.hex('#FD971F'),
        },
      },
      nord: {
        name: 'nord',
        primary: chalk.hex('#88C0D0'), // Frost Blue
        secondary: chalk.hex('#81A1C1'), // Frost Cyan
        success: chalk.hex('#A3BE8C'), // Aurora Green
        warning: chalk.hex('#EBCB8B'), // Aurora Yellow
        error: chalk.hex('#BF616A'), // Aurora Red
        info: chalk.hex('#D8DEE9'), // Snow White
        muted: chalk.hex('#4C566A'), // Polar Night
        highlight: chalk.hex('#ECEFF4'), // Snow White
        border: {
          default: chalk.hex('#4C566A'),
          active: chalk.hex('#88C0D0'),
          success: chalk.hex('#A3BE8C'),
          error: chalk.hex('#BF616A'),
          warning: chalk.hex('#EBCB8B'),
        },
      },
      solarized: {
        name: 'solarized',
        primary: chalk.hex('#268bd2'), // Blue
        secondary: chalk.hex('#2aa198'), // Cyan
        success: chalk.hex('#859900'), // Green
        warning: chalk.hex('#b58900'), // Yellow
        error: chalk.hex('#dc322f'), // Red
        info: chalk.hex('#93a1a1'), // Base1
        muted: chalk.hex('#586e75'), // Base01
        highlight: chalk.hex('#cb4b16'), // Orange
        border: {
          default: chalk.hex('#93a1a1'),
          active: chalk.hex('#268bd2'),
          success: chalk.hex('#859900'),
          error: chalk.hex('#dc322f'),
          warning: chalk.hex('#b58900'),
        },
      },
      cyberpunk: {
        name: 'cyberpunk',
        primary: chalk.hex('#00ff00'), // Neon Green
        secondary: chalk.hex('#00ffff'), // Cyan
        success: chalk.hex('#00ff00'), // Neon Green
        warning: chalk.hex('#ffff00'), // Yellow
        error: chalk.hex('#ff0099'), // Neon Pink
        info: chalk.hex('#bd00ff'), // Purple
        muted: chalk.hex('#333333'), // Dark Grey
        highlight: chalk.hex('#fff'), // White
        border: {
          default: chalk.hex('#00ffff'),
          active: chalk.hex('#ff0099'),
          success: chalk.hex('#00ff00'),
          error: chalk.hex('#ff0000'),
          warning: chalk.hex('#ffff00'),
        },
      },
    }
  }

  /**
   * Set the active theme
   */
  setTheme(name: string): void {
    const theme = this.themes[name.toLowerCase()]
    if (theme) {
      this.currentTheme = theme
    } else {
      // Fallback to default if theme not found, but log a warning in debug mode
      if (process.env.DEBUG) {
        console.warn(`Theme '${name}' not found, falling back to default.`)
      }
    }
  }

  /**
   * Get the current active theme
   */
  getTheme(): UITheme {
    return this.currentTheme
  }

  /**
   * Get the colors of the current theme
   */
  get colors(): UITheme {
    return this.currentTheme
  }

  /**
   * List available themes
   */
  listThemes(): string[] {
    return Object.keys(this.themes)
  }

  /**
   * Register a custom theme
   */
  registerTheme(name: string, theme: UITheme): void {
    this.themes[name.toLowerCase()] = theme
  }
}

// Export singleton instance
export const themeService = new ThemeService()









