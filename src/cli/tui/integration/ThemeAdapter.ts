/**
 * ThemeAdapter
 * Maps ThemeService themes to OpenTUI styles
 */

// Mock ThemeService types (will be replaced with actual imports)
export interface ThemeColors {
  primary: string
  secondary: string
  success: string
  warning: string
  error: string
  info: string
  muted: string
  background: string
  foreground: string
  border: string
  highlight: string
  selection: string
}

export interface Theme {
  name: string
  colors: ThemeColors
}

export interface ThemeService {
  getTheme(name?: string): Theme
  getThemes(): string[]
  setTheme(name: string): void
  onThemeChange(callback: (theme: Theme) => void): void
}

// Mock themeService (will be replaced with actual import)
const themeService: ThemeService = {
  getTheme(name?: string): Theme {
    const themes: Record<string, Theme> = {
      default: {
        name: 'default',
        colors: {
          primary: 'cyan',
          secondary: 'blue',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'magenta',
          muted: 'gray',
          background: 'black',
          foreground: 'white',
          border: 'cyan',
          highlight: 'cyan',
          selection: 'blue'
        }
      },
      dracula: {
        name: 'dracula',
        colors: {
          primary: 'purple',
          secondary: 'cyan',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
          muted: 'gray',
          background: 'black',
          foreground: 'white',
          border: 'purple',
          highlight: 'purple',
          selection: 'blue'
        }
      },
      monokai: {
        name: 'monokai',
        colors: {
          primary: 'yellow',
          secondary: 'blue',
          success: 'green',
          warning: 'orange',
          error: 'red',
          info: 'cyan',
          muted: 'gray',
          background: 'black',
          foreground: 'white',
          border: 'yellow',
          highlight: 'yellow',
          selection: 'blue'
        }
      }
    }

    return themes[name || 'default'] || themes.default
  },

  getThemes(): string[] {
    return ['default', 'dracula', 'monokai']
  },

  setTheme(name: string): void {
    // Mock implementation
    console.log(`Theme changed to: ${name}`)
  },

  onThemeChange(callback: (theme: Theme) => void): void {
    // Mock implementation
    console.log('Theme change callback registered')
  }
}

export class ThemeAdapter {
  private currentTheme: Theme
  private themeCallbacks: Array<(theme: Theme) => void> = []

  constructor() {
    this.currentTheme = themeService.getTheme()
    this.setupThemeIntegration()
  }

  private setupThemeIntegration(): void {
    // Listen to theme changes from ThemeService
    themeService.onThemeChange((theme: Theme) => {
      this.onThemeChanged(theme)
    })
  }

  /**
   * Handle theme change
   */
  private onThemeChanged(theme: Theme): void {
    this.currentTheme = theme

    // Notify all callbacks
    this.themeCallbacks.forEach(callback => {
      try {
        callback(theme)
      } catch (error) {
        console.error('Error in theme change callback:', error)
      }
    })
  }

  /**
   * Get current theme
   */
  getTheme(): Theme {
    return this.currentTheme
  }

  /**
   * Set theme
   */
  setTheme(name: string): void {
    themeService.setTheme(name)
  }

  /**
   * Get all available themes
   */
  getAvailableThemes(): string[] {
    return themeService.getThemes()
  }

  /**
   * Convert ThemeService colors to OpenTUI styles
   */
  toOpenTUIStyles(theme?: Theme): Record<string, any> {
    const colors = (theme || this.currentTheme).colors

    return {
      // Base styles
      base: {
        fg: colors.foreground,
        bg: colors.background
      },

      // Panel styles
      panel: {
        border: {
          fg: colors.border
        },
        title: {
          fg: colors.primary,
          bold: true
        }
      },

      // Button styles
      button: {
        fg: colors.foreground,
        bg: colors.background,
        focus: {
          fg: colors.highlight,
          bg: colors.selection
        }
      },

      // Input styles
      input: {
        fg: colors.foreground,
        bg: colors.background,
        focus: {
          fg: colors.highlight,
          border: {
            fg: colors.highlight
          }
        }
      },

      // Text styles
      text: {
        primary: {
          fg: colors.primary
        },
        secondary: {
          fg: colors.secondary
        },
        success: {
          fg: colors.success
        },
        warning: {
          fg: colors.warning
        },
        error: {
          fg: colors.error
        },
        info: {
          fg: colors.info
        },
        muted: {
          fg: colors.muted
        }
      },

      // Highlight styles
      highlight: {
        fg: colors.highlight,
        bg: colors.selection
      },

      // Selection styles
      selection: {
        bg: colors.selection
      }
    }
  }

  /**
   * Get color for specific purpose
   */
  getColor(purpose: keyof ThemeColors): string {
    return this.currentTheme.colors[purpose]
  }

  /**
   * Get color with fallback
   */
  getColorWithFallback(purpose: keyof ThemeColors, fallback: string): string {
    return this.currentTheme.colors[purpose] || fallback
  }

  /**
   * Register theme change callback
   */
  onThemeChange(callback: (theme: Theme) => void): void {
    this.themeCallbacks.push(callback)
  }

  /**
   * Unregister theme change callback
   */
  offThemeChange(callback: (theme: Theme) => void): void {
    const index = this.themeCallbacks.indexOf(callback)
    if (index > -1) {
      this.themeCallbacks.splice(index, 1)
    }
  }

  /**
   * Get ThemeService instance
   */
  getThemeService(): ThemeService {
    return themeService
  }

  /**
   * Check if theme exists
   */
  hasTheme(name: string): boolean {
    return this.getAvailableThemes().includes(name)
  }

  /**
   * Get next theme in cycle
   */
  getNextTheme(): string {
    const themes = this.getAvailableThemes()
    const currentIndex = themes.indexOf(this.currentTheme.name)
    const nextIndex = (currentIndex + 1) % themes.length
    return themes[nextIndex]
  }

  /**
   * Cycle to next theme
   */
  cycleToNextTheme(): void {
    const nextTheme = this.getNextTheme()
    this.setTheme(nextTheme)
  }
}

// Global theme adapter instance
export const themeAdapter = new ThemeAdapter()
