import chalk from 'chalk'
import { configManager } from '../core/config-manager'

export interface ColorGradient {
  from: string
  to: string
  type?: 'linear' | 'radial'
  angle?: number
}

export interface ThemeColors {
  modeText: string | ColorGradient
  verticalBar: string | ColorGradient
  progressBar: string | ColorGradient
  accent1: string | ColorGradient
  accent2: string | ColorGradient
  accent3: string | ColorGradient
  accent4: string | ColorGradient
  accent5: string | ColorGradient
  background: string
  textPrimary: string
  textSecondary: string
  border: string
  success: string
  warning: string
  error: string
  info: string
}

export interface DynamicThemeOptions {
  timeBased: boolean
  seasonBased: boolean
  autoAdjust: boolean
  smoothTransition: boolean
}

export interface Theme {
  name: string
  description: string
  author?: string
  version: string
  tags: string[]
  colors: {
    default: ThemeColors
    plan: ThemeColors
    vm: ThemeColors
  }
  dynamic?: DynamicThemeOptions
  accessibility?: {
    highContrast: boolean
    colorblindFriendly: boolean
    reducedMotion: boolean
  }
}

export class ThemeManager {
  private currentThemeName: string = 'default'
  private themes: Map<string, Theme> = new Map()
  private gradientCache: Map<string, string> = new Map()
  private isDynamicMode: boolean = false

  constructor() {
    this.initializeDefaultThemes()
    this.addAdvancedThemes()
    this.loadThemeFromConfig()
    this.initializeDynamicThemes()
  }

  private initializeDynamicThemes(): void {
    // Check for dynamic theme options
    setInterval(() => {
      const theme = this.getCurrentTheme()
      if (theme.dynamic?.timeBased || theme.dynamic?.seasonBased) {
        this.adaptToTime()
      }
    }, 60000) // Check every minute
  }

  private adaptToTime(): void {
    const hour = new Date().getHours()
    const month = new Date().getMonth()

    // Day/night adaptation
    if (hour >= 6 && hour < 12) {
      // Morning - brighter colors
      this.adjustBrightness(1.1)
    } else if (hour >= 18 && hour < 22) {
      // Evening - warmer colors
      this.adjustHue(0.95)
    } else if (hour >= 22 || hour < 6) {
      // Night - darker, calmer colors
      this.adjustBrightness(0.8)
    }

    // Seasonal adaptation
    const season = Math.floor(month / 3) % 4
    switch (season) {
      case 0: // Spring
        this.adjustSaturation(1.2)
        break
      case 1: // Summer
        this.adjustBrightness(1.15)
        break
      case 2: // Autumn
        this.adjustHue(0.9)
        break
      case 3: // Winter
        this.adjustBrightness(0.9)
        this.adjustSaturation(0.85)
        break
    }
  }

  private adjustBrightness(factor: number): void {
    // Implementation for brightness adjustment
  }

  private adjustHue(factor: number): void {
    // Implementation for hue adjustment
  }

  private adjustSaturation(factor: number): void {
    // Implementation for saturation adjustment
  }

  /**
   * Render a gradient color (from/to) as ANSI colored text
   */
  private renderGradient(text: string, gradient: ColorGradient): string {
    const cacheKey = `${gradient.from}-${gradient.to}-${text}`
    if (this.gradientCache.has(cacheKey)) {
      return this.gradientCache.get(cacheKey)!
    }

    // Parse colors
    const fromColor = this.parseColor(gradient.from)
    const toColor = this.parseColor(gradient.to)

    // For simplicity, use midpoint color for now
    // In a full implementation, you'd create a gradient effect
    const midColor = this.mixColors(fromColor, toColor, 0.5)
    const rendered = this.applyColor(text, midColor)

    this.gradientCache.set(cacheKey, rendered)
    return rendered
  }

  /**
   * Parse color string or gradient to RGB values
   */
  private parseColor(color: string | ColorGradient): { r: number; g: number; b: number } {
    // If it's a ColorGradient, use the 'from' color
    if (typeof color !== 'string') {
      color = color.from
    }

    const colorStr = color

    // Handle RGB format
    const rgbMatch = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1]),
        g: parseInt(rgbMatch[2]),
        b: parseInt(rgbMatch[3]),
      }
    }

    // Handle hex format
    if (colorStr.startsWith('#')) {
      const hex = colorStr.slice(1)
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return { r, g, b }
    }

    // Handle named colors - return default
    return { r: 255, g: 255, b: 255 }
  }

  /**
   * Mix two colors together
   */
  private mixColors(
    color1: { r: number; g: number; b: number },
    color2: { r: number; g: number; b: number },
    factor: number
  ): { r: number; g: number; b: number } {
    return {
      r: Math.round(color1.r * (1 - factor) + color2.r * factor),
      g: Math.round(color1.g * (1 - factor) + color2.g * factor),
      b: Math.round(color1.b * (1 - factor) + color2.b * factor),
    }
  }

  /**
   * Apply color to text using chalk
   */
  private applyColor(text: string, color: { r: number; g: number; b: number }): string {
    return chalk.rgb(color.r, color.g, color.b)(text)
  }

  /**
   * Generate a random sophisticated theme
   */
  public generateRandomTheme(name: string): Theme {
    const hue = Math.random() * 360
    const saturation = 0.6 + Math.random() * 0.3
    const lightness = 0.4 + Math.random() * 0.2

    const baseColor = this.hslToRgb(hue, saturation, lightness)
    const accentColor1 = this.hslToRgb(hue + 30, saturation, lightness + 0.1)
    const accentColor2 = this.hslToRgb(hue + 60, saturation - 0.1, lightness - 0.1)

    const theme: Theme = {
      name,
      description: `Auto-generated theme with hue ${Math.round(hue)}°`,
      author: 'NikCLI Generator',
      version: '1.0',
      tags: ['generated', 'random'],
      colors: {
        default: {
          modeText: this.rgbToString(baseColor),
          verticalBar: this.rgbToString(accentColor1),
          progressBar: this.rgbToString(baseColor),
          accent1: this.rgbToString(accentColor1),
          accent2: this.rgbToString(accentColor2),
          accent3: this.rgbToString(this.mixColors(baseColor, accentColor1, 0.5)),
          accent4: this.rgbToString(this.mixColors(baseColor, accentColor2, 0.5)),
          accent5: this.rgbToString(this.mixColors(accentColor1, accentColor2, 0.5)),
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: this.rgbToString(baseColor),
        },
        plan: {
          modeText: 'yellow',
          verticalBar: 'rgb(255, 215, 0)',
          progressBar: 'yellow',
          accent1: 'yellow',
          accent2: 'rgb(255, 215, 0)',
          accent3: 'rgb(255, 165, 0)',
          accent4: 'rgb(255, 193, 7)',
          accent5: 'rgb(255, 213, 79)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        vm: {
          modeText: 'magenta',
          verticalBar: 'rgb(199, 21, 133)',
          progressBar: 'magenta',
          accent1: 'magenta',
          accent2: 'rgb(255, 20, 147)',
          accent3: 'rgb(199, 21, 133)',
          accent4: 'rgb(218, 112, 214)',
          accent5: 'rgb(221, 160, 221)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'magenta',
        },
      },
      accessibility: {
        highContrast: false,
        colorblindFriendly: true,
        reducedMotion: false,
      },
    }

    return theme
  }

  /**
   * Convert HSL to RGB
   */
  private hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    h /= 360
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => {
      const k = (n + h * 12) % 12
      return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    }
    return {
      r: Math.round(f(0) * 255),
      g: Math.round(f(8) * 255),
      b: Math.round(f(4) * 255),
    }
  }

  /**
   * Convert RGB to string
   */
  private rgbToString(rgb: { r: number; g: number; b: number }): string {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
  }

  /**
   * Validate color accessibility
   */
  public validateAccessibility(theme: Theme): { score: number; issues: string[]; suggestions: string[] } {
    const issues: string[] = []
    const suggestions: string[] = []

    // Check contrast ratios
    const contrast = this.calculateContrast(theme.colors.default.textPrimary, theme.colors.default.background)
    if (contrast < 4.5) {
      issues.push('Low contrast between text and background')
      suggestions.push('Increase contrast ratio to at least 4.5:1 for accessibility')
    }

    // Check colorblind friendliness
    if (!theme.accessibility?.colorblindFriendly) {
      suggestions.push('Consider adding colorblind-friendly alternatives')
    }

    // Check for sufficient color differentiation
    const colors = Object.values(theme.colors.default).filter((c) => typeof c === 'string') as string[]
    const uniqueColors = new Set(colors)
    if (uniqueColors.size < 3) {
      issues.push('Insufficient color differentiation')
      suggestions.push('Add more distinct colors for better visual hierarchy')
    }

    const score = Math.max(0, 100 - issues.length * 20)
    return { score, issues, suggestions }
  }

  /**
   * Calculate contrast ratio between two colors
   */
  private calculateContrast(color1: string, color2: string): number {
    // Simplified contrast calculation
    // In production, use WCAG formula
    return 5.0 // Placeholder
  }

  /**
   * Get theme preview data
   */
  public getThemePreview(themeName: string): { colors: any; modes: string[]; tags: string[]; score?: number } {
    const theme = this.getTheme(themeName)
    const validation = this.validateAccessibility(theme)

    return {
      colors: theme.colors,
      modes: Object.keys(theme.colors),
      tags: theme.tags,
      score: validation.score,
    }
  }

  private initializeDefaultThemes(): void {
    // Default Theme (original colors) - Enhanced
    this.themes.set('default', {
      name: 'default',
      description: 'Default NikCLI theme with blue accents and smooth gradients',
      author: 'NikCLI Team',
      version: '2.0',
      tags: ['default', 'classic', 'blue'],
      colors: {
        default: {
          modeText: { from: 'cyan', to: 'blue', type: 'linear', angle: 45 },
          verticalBar: { from: 'blue', to: 'cyan', type: 'linear', angle: 90 },
          progressBar: { from: 'blue', to: 'cyan', type: 'linear', angle: 0 },
          accent1: 'blue',
          accent2: 'cyan',
          accent3: { from: 'blue', to: 'cyan', type: 'linear', angle: 45 },
          accent4: 'rgb(100, 149, 237)',
          accent5: 'rgb(135, 206, 235)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        plan: {
          modeText: { from: 'yellow', to: 'rgb(255, 215, 0)', type: 'linear', angle: 30 },
          verticalBar: { from: 'yellow', to: 'rgb(255, 165, 0)', type: 'linear', angle: 90 },
          progressBar: { from: 'yellow', to: 'rgb(255, 215, 0)', type: 'linear', angle: 0 },
          accent1: 'yellow',
          accent2: 'rgb(255, 215, 0)',
          accent3: { from: 'yellow', to: 'rgb(255, 165, 0)', type: 'linear', angle: 45 },
          accent4: 'rgb(255, 193, 7)',
          accent5: 'rgb(255, 213, 79)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        vm: {
          modeText: { from: 'magenta', to: 'rgb(255, 20, 147)', type: 'linear', angle: 45 },
          verticalBar: { from: 'magenta', to: 'rgb(199, 21, 133)', type: 'linear', angle: 90 },
          progressBar: { from: 'magenta', to: 'rgb(255, 20, 147)', type: 'linear', angle: 0 },
          accent1: 'magenta',
          accent2: 'rgb(255, 20, 147)',
          accent3: { from: 'magenta', to: 'rgb(199, 21, 133)', type: 'linear', angle: 45 },
          accent4: 'rgb(218, 112, 214)',
          accent5: 'rgb(221, 160, 221)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
      },
      accessibility: {
        highContrast: false,
        colorblindFriendly: true,
        reducedMotion: false,
      },
    })

    // Ocean Theme
    this.themes.set('ocean', {
      name: 'ocean',
      description: 'Ocean blue theme with teal accents',
      author: 'NikCLI Team',
      version: '2.0',
      tags: ['ocean', 'blue', 'teal'],
      colors: {
        default: {
          modeText: 'cyan',
          verticalBar: 'rgb(0, 191, 255)',
          progressBar: 'rgb(0, 191, 255)',
          accent1: 'rgb(0, 191, 255)',
          accent2: 'rgb(32, 178, 170)',
          accent3: 'rgb(240, 248, 255)',
          accent4: 'rgb(135, 206, 250)',
          accent5: 'rgb(176, 224, 230)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        plan: {
          modeText: 'yellow',
          verticalBar: 'rgb(255, 215, 0)',
          progressBar: 'rgb(255, 215, 0)',
          accent1: 'rgb(255, 215, 0)',
          accent2: 'rgb(255, 165, 0)',
          accent3: 'white',
          accent4: 'rgb(255, 193, 7)',
          accent5: 'rgb(255, 213, 79)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        vm: {
          modeText: 'rgb(255, 20, 147)',
          verticalBar: 'rgb(255, 20, 147)',
          progressBar: 'rgb(255, 20, 147)',
          accent1: 'rgb(255, 20, 147)',
          accent2: 'rgb(199, 21, 133)',
          accent3: 'rgb(255, 240, 245)',
          accent4: 'rgb(218, 112, 214)',
          accent5: 'rgb(221, 160, 221)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
      },
      accessibility: {
        highContrast: false,
        colorblindFriendly: true,
        reducedMotion: false,
      },
    })

    // Sunset Theme
    this.themes.set('sunset', {
      name: 'sunset',
      description: 'Warm sunset theme with orange and red',
      author: 'NikCLI Team',
      version: '2.0',
      tags: ['sunset', 'orange', 'red', 'warm'],
      colors: {
        default: {
          modeText: 'rgb(255, 140, 0)',
          verticalBar: 'rgb(255, 69, 0)',
          progressBar: 'rgb(255, 140, 0)',
          accent1: 'rgb(255, 69, 0)',
          accent2: 'rgb(255, 140, 0)',
          accent3: 'rgb(255, 228, 196)',
          accent4: 'rgb(255, 99, 71)',
          accent5: 'rgb(255, 160, 122)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        plan: {
          modeText: 'yellow',
          verticalBar: 'rgb(255, 215, 0)',
          progressBar: 'rgb(255, 215, 0)',
          accent1: 'rgb(255, 215, 0)',
          accent2: 'rgb(255, 165, 0)',
          accent3: 'white',
          accent4: 'rgb(255, 193, 7)',
          accent5: 'rgb(255, 213, 79)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        vm: {
          modeText: 'rgb(148, 0, 211)',
          verticalBar: 'rgb(138, 43, 226)',
          progressBar: 'rgb(148, 0, 211)',
          accent1: 'rgb(138, 43, 226)',
          accent2: 'rgb(148, 0, 211)',
          accent3: 'rgb(230, 230, 250)',
          accent4: 'rgb(186, 85, 211)',
          accent5: 'rgb(221, 160, 221)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
      },
      accessibility: {
        highContrast: false,
        colorblindFriendly: true,
        reducedMotion: false,
      },
    })

    // Forest Theme
    this.themes.set('forest', {
      name: 'forest',
      description: 'Nature green theme',
      author: 'NikCLI Team',
      version: '2.0',
      tags: ['forest', 'green', 'nature'],
      colors: {
        default: {
          modeText: 'rgb(34, 139, 34)',
          verticalBar: 'rgb(0, 128, 0)',
          progressBar: 'rgb(34, 139, 34)',
          accent1: 'rgb(0, 128, 0)',
          accent2: 'rgb(50, 205, 50)',
          accent3: 'rgb(240, 255, 240)',
          accent4: 'rgb(144, 238, 144)',
          accent5: 'rgb(152, 251, 152)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        plan: {
          modeText: 'yellow',
          verticalBar: 'rgb(255, 215, 0)',
          progressBar: 'rgb(255, 215, 0)',
          accent1: 'rgb(255, 215, 0)',
          accent2: 'rgb(255, 165, 0)',
          accent3: 'white',
          accent4: 'rgb(255, 193, 7)',
          accent5: 'rgb(255, 213, 79)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        vm: {
          modeText: 'rgb(75, 0, 130)',
          verticalBar: 'rgb(106, 90, 205)',
          progressBar: 'rgb(75, 0, 130)',
          accent1: 'rgb(106, 90, 205)',
          accent2: 'rgb(72, 61, 139)',
          accent3: 'rgb(230, 230, 250)',
          accent4: 'rgb(123, 104, 238)',
          accent5: 'rgb(147, 112, 219)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
      },
      accessibility: {
        highContrast: false,
        colorblindFriendly: true,
        reducedMotion: false,
      },
    })

    // Cyberpunk Theme
    this.themes.set('cyberpunk', {
      name: 'cyberpunk',
      description: 'Neon cyberpunk theme with magenta and cyan',
      author: 'NikCLI Team',
      version: '2.0',
      tags: ['cyberpunk', 'neon', 'magenta', 'cyan'],
      colors: {
        default: {
          modeText: 'rgb(255, 20, 147)',
          verticalBar: 'rgb(0, 255, 255)',
          progressBar: 'rgb(255, 20, 147)',
          accent1: 'rgb(0, 255, 255)',
          accent2: 'rgb(255, 20, 147)',
          accent3: 'rgb(240, 248, 255)',
          accent4: 'rgb(0, 191, 255)',
          accent5: 'rgb(50, 205, 50)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        plan: {
          modeText: 'rgb(255, 215, 0)',
          verticalBar: 'rgb(255, 215, 0)',
          progressBar: 'rgb(255, 215, 0)',
          accent1: 'rgb(255, 215, 0)',
          accent2: 'rgb(255, 165, 0)',
          accent3: 'white',
          accent4: 'rgb(255, 193, 7)',
          accent5: 'rgb(255, 213, 79)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        vm: {
          modeText: 'rgb(0, 191, 255)',
          verticalBar: 'rgb(0, 191, 255)',
          progressBar: 'rgb(0, 191, 255)',
          accent1: 'rgb(0, 191, 255)',
          accent2: 'rgb(30, 144, 255)',
          accent3: 'rgb(240, 248, 255)',
          accent4: 'rgb(135, 206, 250)',
          accent5: 'rgb(176, 196, 222)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
      },
      accessibility: {
        highContrast: false,
        colorblindFriendly: true,
        reducedMotion: false,
      },
    })

    // Monokai Theme
    this.themes.set('monokai', {
      name: 'monokai',
      description: 'Classic Monokai color scheme',
      author: 'NikCLI Team',
      version: '2.0',
      tags: ['monokai', 'classic', 'green'],
      colors: {
        default: {
          modeText: 'rgb(166, 226, 46)',
          verticalBar: 'rgb(102, 217, 239)',
          progressBar: 'rgb(166, 226, 46)',
          accent1: 'rgb(102, 217, 239)',
          accent2: 'rgb(166, 226, 46)',
          accent3: 'rgb(248, 248, 242)',
          accent4: 'rgb(253, 151, 31)',
          accent5: 'rgb(174, 129, 255)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        plan: {
          modeText: 'rgb(255, 215, 0)',
          verticalBar: 'rgb(255, 215, 0)',
          progressBar: 'rgb(255, 215, 0)',
          accent1: 'rgb(255, 215, 0)',
          accent2: 'rgb(255, 165, 0)',
          accent3: 'white',
          accent4: 'rgb(255, 193, 7)',
          accent5: 'rgb(255, 213, 79)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        vm: {
          modeText: 'rgb(249, 38, 114)',
          verticalBar: 'rgb(249, 38, 114)',
          progressBar: 'rgb(249, 38, 114)',
          accent1: 'rgb(249, 38, 114)',
          accent2: 'rgb(255, 99, 132)',
          accent3: 'rgb(248, 248, 242)',
          accent4: 'rgb(255, 99, 132)',
          accent5: 'rgb(174, 129, 255)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
      },
      accessibility: {
        highContrast: false,
        colorblindFriendly: true,
        reducedMotion: false,
      },
    })

    // Nord Theme
    this.themes.set('nord', {
      name: 'nord',
      description: 'Polar night Nord color scheme',
      author: 'NikCLI Team',
      version: '2.0',
      tags: ['nord', 'polar', 'night'],
      colors: {
        default: {
          modeText: 'rgb(163, 190, 140)',
          verticalBar: 'rgb(136, 192, 208)',
          progressBar: 'rgb(163, 190, 140)',
          accent1: 'rgb(136, 192, 208)',
          accent2: 'rgb(163, 190, 140)',
          accent3: 'rgb(216, 222, 233)',
          accent4: 'rgb(208, 135, 112)',
          accent5: 'rgb(235, 203, 139)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        plan: {
          modeText: 'yellow',
          verticalBar: 'rgb(255, 215, 0)',
          progressBar: 'rgb(255, 215, 0)',
          accent1: 'rgb(255, 215, 0)',
          accent2: 'rgb(255, 165, 0)',
          accent3: 'white',
          accent4: 'rgb(255, 193, 7)',
          accent5: 'rgb(255, 213, 79)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
        vm: {
          modeText: 'rgb(180, 142, 173)',
          verticalBar: 'rgb(180, 142, 173)',
          progressBar: 'rgb(180, 142, 173)',
          accent1: 'rgb(180, 142, 173)',
          accent2: 'rgb(191, 97, 106)',
          accent3: 'rgb(216, 222, 233)',
          accent4: 'rgb(191, 97, 106)',
          accent5: 'rgb(208, 135, 112)',
          background: '#1a1a1a',
          textPrimary: 'white',
          textSecondary: 'rgb(200, 200, 200)',
          border: 'rgb(100, 100, 100)',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'blue',
        },
      },
      accessibility: {
        highContrast: false,
        colorblindFriendly: true,
        reducedMotion: false,
      },
    })
  }

  private loadThemeFromConfig(): void {
    try {
      const uiConfig = configManager.get('ui') as any
      const themeName = uiConfig?.theme?.active as string
      if (themeName && this.themes.has(themeName)) {
        this.currentThemeName = themeName
      }
    } catch (error) {
      // Use default theme if config fails
      console.warn('Failed to load theme from config:', error)
    }
  }

  public getTheme(name?: string): Theme {
    const themeName = name || this.currentThemeName
    const theme = this.themes.get(themeName)
    if (!theme) {
      console.warn(`Theme '${themeName}' not found, using default`)
      return this.themes.get('default')!
    }
    return theme
  }

  public getCurrentTheme(): Theme {
    return this.getTheme(this.currentThemeName)
  }

  public themeExists(name: string): boolean {
    return this.themes.has(name)
  }

  public setTheme(name: string): boolean {
    if (!this.themes.has(name)) {
      return false
    }

    this.currentThemeName = name
    // Get current ui config
    const uiConfig = (configManager.get('ui') as any) || { theme: { active: 'default', customThemes: {} } }
    // Update theme.active
    uiConfig.theme.active = name
    // Save back to config manager
    configManager.set('ui', uiConfig)
    return true
  }

  public listThemes(): Theme[] {
    return Array.from(this.themes.values())
  }

  public getColor(
    mode: 'default' | 'plan' | 'vm',
    colorType: keyof ThemeColors,
    themeName?: string
  ): string | ColorGradient {
    const theme = this.getTheme(themeName)
    return theme.colors[mode][colorType]
  }

  public applyChalk(
    mode: 'default' | 'plan' | 'vm',
    colorType: keyof ThemeColors,
    text: string,
    themeName?: string
  ): string {
    const colorValue = this.getColor(mode, colorType, themeName)

    // If it's a ColorGradient, render the gradient
    if (typeof colorValue === 'object' && 'from' in colorValue && 'to' in colorValue) {
      return this.renderGradient(text, colorValue as ColorGradient)
    }

    // Otherwise, it's a string color
    const colorStr = colorValue as string

    // Parse color value and apply to chalk
    if (colorStr.startsWith('rgb(')) {
      const rgbMatch = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
      if (rgbMatch) {
        const [, r, g, b] = rgbMatch.map(Number)
        return chalk.rgb(r, g, b)(text)
      }
    }

    // Try to use chalk method directly
    const chalkMethod = (chalk as any)[colorStr]
    if (typeof chalkMethod === 'function') {
      return chalkMethod(text)
    }

    // Fallback to default color
    return chalk.white(text)
  }

  public getModeDisplay(mode: 'default' | 'plan' | 'vm', themeName?: string): string {
    const modeText = mode.toUpperCase()
    return this.applyChalk(mode, 'modeText', modeText, themeName)
  }

  public getVerticalBar(mode: 'default' | 'plan' | 'vm', themeName?: string): string {
    return this.applyChalk(mode, 'verticalBar', '█', themeName)
  }

  public getProgressBar(mode: 'default' | 'plan' | 'vm', loadingBar: string, themeName?: string): string {
    return this.applyChalk(mode, 'progressBar', loadingBar, themeName)
  }

  public createCustomTheme(name: string, description: string, colors: Theme['colors']): boolean {
    if (this.themes.has(name)) {
      return false
    }

    this.themes.set(name, {
      name,
      description,
      author: 'User',
      version: '1.0',
      tags: ['custom'],
      colors,
      accessibility: {
        highContrast: false,
        colorblindFriendly: true,
        reducedMotion: false,
      },
    })

    return true
  }

  public deleteTheme(name: string): boolean {
    if (name === 'default' || name === 'ocean' || name === 'sunset' || name === 'forest') {
      return false // Cannot delete built-in themes
    }

    return this.themes.delete(name)
  }

  public exportTheme(name: string): string | null {
    const theme = this.getTheme(name)
    if (!theme) {
      return null
    }

    return JSON.stringify(theme, null, 2)
  }

  public importTheme(themeJson: string): boolean {
    try {
      const theme: Theme = JSON.parse(themeJson)

      if (!theme.name || !theme.colors) {
        return false
      }

      this.themes.set(theme.name, theme)
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Create Aurora theme with dynamic gradients
   */
  private createAuroraTheme(): Theme {
    return {
      name: 'aurora',
      description: 'Dynamic aurora borealis-inspired theme with animated gradients',
      author: 'NikCLI Design Team',
      version: '2.0',
      tags: ['aurora', 'dynamic', 'gradient', 'nature'],
      dynamic: {
        timeBased: true,
        seasonBased: true,
        autoAdjust: true,
        smoothTransition: true,
      },
      colors: {
        default: {
          modeText: { from: 'rgb(0, 255, 149)', to: 'rgb(57, 255, 20)', type: 'linear', angle: 45 },
          verticalBar: { from: 'rgb(0, 191, 255)', to: 'rgb(30, 144, 255)', type: 'linear', angle: 90 },
          progressBar: { from: 'rgb(0, 255, 149)', to: 'rgb(57, 255, 20)', type: 'linear', angle: 0 },
          accent1: 'rgb(0, 255, 149)',
          accent2: 'rgb(57, 255, 20)',
          accent3: { from: 'rgb(0, 191, 255)', to: 'rgb(30, 144, 255)', type: 'linear', angle: 45 },
          accent4: 'rgb(50, 205, 50)',
          accent5: 'rgb(32, 178, 170)',
          background: '#0a0e1a',
          textPrimary: 'rgb(240, 248, 255)',
          textSecondary: 'rgb(176, 196, 222)',
          border: 'rgb(70, 130, 180)',
          success: 'rgb(50, 205, 50)',
          warning: 'rgb(255, 215, 0)',
          error: 'rgb(220, 20, 60)',
          info: 'rgb(0, 191, 255)',
        },
        plan: {
          modeText: { from: 'rgb(255, 215, 0)', to: 'rgb(255, 193, 7)', type: 'linear', angle: 30 },
          verticalBar: { from: 'rgb(255, 215, 0)', to: 'rgb(255, 165, 0)', type: 'linear', angle: 90 },
          progressBar: { from: 'rgb(255, 215, 0)', to: 'rgb(255, 193, 7)', type: 'linear', angle: 0 },
          accent1: 'rgb(255, 215, 0)',
          accent2: 'rgb(255, 193, 7)',
          accent3: { from: 'rgb(255, 215, 0)', to: 'rgb(255, 165, 0)', type: 'linear', angle: 45 },
          accent4: 'rgb(255, 193, 7)',
          accent5: 'rgb(255, 213, 79)',
          background: '#0a0e1a',
          textPrimary: 'rgb(240, 248, 255)',
          textSecondary: 'rgb(176, 196, 222)',
          border: 'rgb(70, 130, 180)',
          success: 'rgb(50, 205, 50)',
          warning: 'rgb(255, 215, 0)',
          error: 'rgb(220, 20, 60)',
          info: 'rgb(0, 191, 255)',
        },
        vm: {
          modeText: { from: 'rgb(148, 0, 211)', to: 'rgb(138, 43, 226)', type: 'linear', angle: 45 },
          verticalBar: { from: 'rgb(138, 43, 226)', to: 'rgb(106, 90, 205)', type: 'linear', angle: 90 },
          progressBar: { from: 'rgb(148, 0, 211)', to: 'rgb(138, 43, 226)', type: 'linear', angle: 0 },
          accent1: 'rgb(148, 0, 211)',
          accent2: 'rgb(138, 43, 226)',
          accent3: { from: 'rgb(138, 43, 226)', to: 'rgb(106, 90, 205)', type: 'linear', angle: 45 },
          accent4: 'rgb(147, 112, 219)',
          accent5: 'rgb(186, 85, 211)',
          background: '#0a0e1a',
          textPrimary: 'rgb(240, 248, 255)',
          textSecondary: 'rgb(176, 196, 222)',
          border: 'rgb(70, 130, 180)',
          success: 'rgb(50, 205, 50)',
          warning: 'rgb(255, 215, 0)',
          error: 'rgb(220, 20, 60)',
          info: 'rgb(148, 0, 211)',
        },
      },
      accessibility: {
        highContrast: true,
        colorblindFriendly: true,
        reducedMotion: false,
      },
    }
  }

  /**
   * Create Matrix theme with digital rain effect
   */
  private createMatrixTheme(): Theme {
    return {
      name: 'matrix',
      description: 'Classic Matrix digital rain theme with green gradients',
      author: 'NikCLI Design Team',
      version: '2.0',
      tags: ['matrix', 'cyberpunk', 'green', 'digital'],
      colors: {
        default: {
          modeText: { from: 'rgb(0, 255, 0)', to: 'rgb(57, 255, 20)', type: 'linear', angle: 90 },
          verticalBar: { from: 'rgb(0, 200, 0)', to: 'rgb(0, 255, 0)', type: 'linear', angle: 0 },
          progressBar: { from: 'rgb(0, 255, 0)', to: 'rgb(57, 255, 20)', type: 'linear', angle: 45 },
          accent1: 'rgb(0, 255, 0)',
          accent2: 'rgb(57, 255, 20)',
          accent3: { from: 'rgb(0, 200, 0)', to: 'rgb(0, 255, 0)', type: 'linear', angle: 45 },
          accent4: 'rgb(124, 252, 0)',
          accent5: 'rgb(50, 205, 50)',
          background: '#000000',
          textPrimary: 'rgb(0, 255, 0)',
          textSecondary: 'rgb(57, 255, 20)',
          border: 'rgb(0, 200, 0)',
          success: 'rgb(0, 255, 0)',
          warning: 'rgb(255, 215, 0)',
          error: 'rgb(220, 20, 60)',
          info: 'rgb(0, 255, 0)',
        },
        plan: {
          modeText: { from: 'rgb(255, 215, 0)', to: 'rgb(255, 193, 7)', type: 'linear', angle: 30 },
          verticalBar: { from: 'rgb(255, 215, 0)', to: 'rgb(255, 165, 0)', type: 'linear', angle: 90 },
          progressBar: { from: 'rgb(255, 215, 0)', to: 'rgb(255, 193, 7)', type: 'linear', angle: 0 },
          accent1: 'rgb(255, 215, 0)',
          accent2: 'rgb(255, 193, 7)',
          accent3: { from: 'rgb(255, 215, 0)', to: 'rgb(255, 165, 0)', type: 'linear', angle: 45 },
          accent4: 'rgb(255, 193, 7)',
          accent5: 'rgb(255, 213, 79)',
          background: '#000000',
          textPrimary: 'rgb(255, 215, 0)',
          textSecondary: 'rgb(255, 193, 7)',
          border: 'rgb(255, 165, 0)',
          success: 'rgb(0, 255, 0)',
          warning: 'rgb(255, 215, 0)',
          error: 'rgb(220, 20, 60)',
          info: 'rgb(0, 255, 0)',
        },
        vm: {
          modeText: { from: 'rgb(255, 20, 147)', to: 'rgb(199, 21, 133)', type: 'linear', angle: 45 },
          verticalBar: { from: 'rgb(255, 20, 147)', to: 'rgb(218, 112, 214)', type: 'linear', angle: 90 },
          progressBar: { from: 'rgb(255, 20, 147)', to: 'rgb(199, 21, 133)', type: 'linear', angle: 0 },
          accent1: 'rgb(255, 20, 147)',
          accent2: 'rgb(199, 21, 133)',
          accent3: { from: 'rgb(255, 20, 147)', to: 'rgb(218, 112, 214)', type: 'linear', angle: 45 },
          accent4: 'rgb(218, 112, 214)',
          accent5: 'rgb(221, 160, 221)',
          background: '#000000',
          textPrimary: 'rgb(255, 20, 147)',
          textSecondary: 'rgb(199, 21, 133)',
          border: 'rgb(218, 112, 214)',
          success: 'rgb(0, 255, 0)',
          warning: 'rgb(255, 215, 0)',
          error: 'rgb(220, 20, 60)',
          info: 'rgb(255, 20, 147)',
        },
      },
      accessibility: {
        highContrast: true,
        colorblindFriendly: false,
        reducedMotion: false,
      },
    }
  }

  /**
   * Create High Contrast theme for accessibility
   */
  private createHighContrastTheme(): Theme {
    return {
      name: 'high-contrast',
      description: 'High contrast theme for visual accessibility (WCAG AAA compliant)',
      author: 'NikCLI Accessibility Team',
      version: '2.0',
      tags: ['accessibility', 'high-contrast', 'wcag'],
      colors: {
        default: {
          modeText: 'rgb(255, 255, 255)',
          verticalBar: 'rgb(255, 255, 0)',
          progressBar: 'rgb(255, 255, 0)',
          accent1: 'rgb(255, 255, 0)',
          accent2: 'rgb(0, 255, 255)',
          accent3: 'rgb(255, 255, 0)',
          accent4: 'rgb(255, 255, 255)',
          accent5: 'rgb(0, 255, 255)',
          background: '#000000',
          textPrimary: 'rgb(255, 255, 255)',
          textSecondary: 'rgb(255, 255, 255)',
          border: 'rgb(255, 255, 0)',
          success: 'rgb(0, 255, 0)',
          warning: 'rgb(255, 255, 0)',
          error: 'rgb(255, 0, 0)',
          info: 'rgb(0, 255, 255)',
        },
        plan: {
          modeText: 'rgb(255, 255, 0)',
          verticalBar: 'rgb(255, 255, 0)',
          progressBar: 'rgb(255, 255, 0)',
          accent1: 'rgb(255, 255, 0)',
          accent2: 'rgb(255, 255, 255)',
          accent3: 'rgb(255, 255, 0)',
          accent4: 'rgb(255, 255, 255)',
          accent5: 'rgb(255, 255, 0)',
          background: '#000000',
          textPrimary: 'rgb(255, 255, 0)',
          textSecondary: 'rgb(255, 255, 255)',
          border: 'rgb(255, 255, 0)',
          success: 'rgb(0, 255, 0)',
          warning: 'rgb(255, 255, 0)',
          error: 'rgb(255, 0, 0)',
          info: 'rgb(0, 255, 255)',
        },
        vm: {
          modeText: 'rgb(255, 0, 255)',
          verticalBar: 'rgb(255, 0, 255)',
          progressBar: 'rgb(255, 0, 255)',
          accent1: 'rgb(255, 0, 255)',
          accent2: 'rgb(255, 255, 0)',
          accent3: 'rgb(255, 0, 255)',
          accent4: 'rgb(255, 255, 0)',
          accent5: 'rgb(255, 0, 255)',
          background: '#000000',
          textPrimary: 'rgb(255, 0, 255)',
          textSecondary: 'rgb(255, 255, 255)',
          border: 'rgb(255, 0, 255)',
          success: 'rgb(0, 255, 0)',
          warning: 'rgb(255, 255, 0)',
          error: 'rgb(255, 0, 0)',
          info: 'rgb(0, 255, 255)',
        },
      },
      accessibility: {
        highContrast: true,
        colorblindFriendly: true,
        reducedMotion: true,
      },
    }
  }

  /**
   * Add sophisticated themes to the collection
   */
  private addAdvancedThemes(): void {
    this.themes.set('aurora', this.createAuroraTheme())
    this.themes.set('matrix', this.createMatrixTheme())
    this.themes.set('high-contrast', this.createHighContrastTheme())
  }
}

// Export singleton instance
export const themeManager = new ThemeManager()
