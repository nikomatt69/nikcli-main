import type { ColorGradient, Theme, ThemeColors } from './theme-manager'

export interface ValidationIssue {
  type: 'error' | 'warning' | 'info'
  field: string
  message: string
  suggestion?: string
}

export interface AccessibilityReport {
  score: number // 0-100
  contrastIssues: ValidationIssue[]
  colorblindIssues: ValidationIssue[]
  suggestions: string[]
  passesWCAG_AA: boolean
  passesWCAG_AAA: boolean
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  accessibility: AccessibilityReport
  completeness: number // 0-100
  colorStats: {
    uniqueColors: number
    totalColors: number
    gradientsUsed: number
  }
}

export class ThemeValidator {
  private namedColors = [
    'black',
    'white',
    'red',
    'green',
    'blue',
    'cyan',
    'magenta',
    'yellow',
    'orange',
    'purple',
    'pink',
    'brown',
    'gray',
    'silver',
    'gold',
    'navy',
    'teal',
    'lime',
    'olive',
    'maroon',
  ]

  /**
   * Validate a complete theme
   */
  validateTheme(theme: Theme): ValidationResult {
    const issues: ValidationIssue[] = []

    // Validate theme structure
    issues.push(...this.validateThemeStructure(theme))

    // Validate colors for each mode
    issues.push(...this.validateColors(theme))

    // Validate metadata
    issues.push(...this.validateMetadata(theme))

    // Generate accessibility report
    const accessibility = this.generateAccessibilityReport(theme)

    // Calculate completeness
    const completeness = this.calculateCompleteness(theme)

    // Calculate color statistics
    const colorStats = this.analyzeColors(theme)

    const valid = issues.filter((i) => i.type === 'error').length === 0

    return {
      valid,
      issues,
      accessibility,
      completeness,
      colorStats,
    }
  }

  /**
   * Validate theme structure
   */
  private validateThemeStructure(theme: Theme): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    // Check required fields
    if (!theme.name) {
      issues.push({
        type: 'error',
        field: 'name',
        message: 'Theme name is required',
        suggestion: 'Add a unique theme name',
      })
    }

    if (!theme.description) {
      issues.push({
        type: 'warning',
        field: 'description',
        message: 'Theme description is missing',
        suggestion: 'Add a descriptive description for your theme',
      })
    }

    if (!theme.colors) {
      issues.push({
        type: 'error',
        field: 'colors',
        message: 'Theme colors are required',
      })
      return issues
    }

    // Check all modes are present
    const requiredModes = ['default', 'plan', 'vm']
    for (const mode of requiredModes) {
      if (!theme.colors[mode as keyof typeof theme.colors]) {
        issues.push({
          type: 'error',
          field: `colors.${mode}`,
          message: `Colors for ${mode} mode are missing`,
          suggestion: `Define colors for ${mode} mode`,
        })
      }
    }

    return issues
  }

  /**
   * Validate all colors in the theme
   */
  private validateColors(theme: Theme): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    if (!theme.colors) return issues

    for (const mode of ['default', 'plan', 'vm'] as const) {
      const modeColors = theme.colors[mode]
      if (!modeColors) continue

      // Check all required color properties
      const requiredColors: (keyof ThemeColors)[] = [
        'modeText',
        'verticalBar',
        'progressBar',
        'accent1',
        'accent2',
        'accent3',
        'accent4',
        'accent5',
        'background',
        'textPrimary',
        'textSecondary',
        'border',
        'success',
        'warning',
        'error',
        'info',
      ]

      for (const colorKey of requiredColors) {
        const colorValue = modeColors[colorKey]
        if (!colorValue) {
          issues.push({
            type: 'error',
            field: `colors.${mode}.${colorKey}`,
            message: `Color ${colorKey} is missing in ${mode} mode`,
            suggestion: `Define a value for ${colorKey}`,
          })
          continue
        }

        // Validate color format
        const colorIssues = this.validateColorFormat(colorValue as any, `${mode}.${colorKey}`)
        issues.push(...colorIssues)
      }
    }

    return issues
  }

  /**
   * Validate a single color format
   */
  private validateColorFormat(color: string | ColorGradient, fieldName: string): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    // If it's a gradient
    if (typeof color === 'object' && 'from' in color && 'to' in color) {
      const gradient = color as ColorGradient

      if (!gradient.from) {
        issues.push({
          type: 'error',
          field: fieldName,
          message: 'Gradient "from" color is missing',
        })
      } else if (!this.isValidColor(gradient.from)) {
        issues.push({
          type: 'error',
          field: fieldName,
          message: `Invalid gradient "from" color: ${gradient.from}`,
          suggestion: 'Use RGB (rgb(r,g,b)), HEX (#RRGGBB), or named color',
        })
      }

      if (!gradient.to) {
        issues.push({
          type: 'error',
          field: fieldName,
          message: 'Gradient "to" color is missing',
        })
      } else if (!this.isValidColor(gradient.to)) {
        issues.push({
          type: 'error',
          field: fieldName,
          message: `Invalid gradient "to" color: ${gradient.to}`,
          suggestion: 'Use RGB (rgb(r,g,b)), HEX (#RRGGBB), or named color',
        })
      }

      if (gradient.angle !== undefined && (gradient.angle < 0 || gradient.angle > 360)) {
        issues.push({
          type: 'warning',
          field: fieldName,
          message: `Gradient angle ${gradient.angle} is outside 0-360 range`,
          suggestion: 'Use angle between 0 and 360 degrees',
        })
      }

      return issues
    }

    // If it's a string color
    const colorStr = color as string
    if (!this.isValidColor(colorStr)) {
      issues.push({
        type: 'error',
        field: fieldName,
        message: `Invalid color format: ${colorStr}`,
        suggestion: 'Use RGB (rgb(r,g,b)), HEX (#RRGGBB), or named color',
      })
    }

    return issues
  }

  /**
   * Check if a color string is valid
   */
  private isValidColor(color: string): boolean {
    // RGB format: rgb(r, g, b)
    const rgbRegex = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/
    if (rgbRegex.test(color)) return true

    // HEX format: #RRGGBB or #RGB
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
    if (hexRegex.test(color)) return true

    // Named color
    if (this.namedColors.includes(color.toLowerCase())) return true

    // Try RGB without spaces
    const rgbNoSpace = /^rgb\(\d+,\d+,\d+\)$/
    if (rgbNoSpace.test(color)) return true

    return false
  }

  /**
   * Validate theme metadata
   */
  private validateMetadata(theme: Theme): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    if (!theme.version) {
      issues.push({
        type: 'info',
        field: 'version',
        message: 'Theme version is not specified',
        suggestion: 'Add a version number (e.g., "1.0")',
      })
    }

    if (!theme.author) {
      issues.push({
        type: 'info',
        field: 'author',
        message: 'Theme author is not specified',
        suggestion: 'Add author information',
      })
    }

    if (!theme.tags || theme.tags.length === 0) {
      issues.push({
        type: 'info',
        field: 'tags',
        message: 'Theme has no tags',
        suggestion: 'Add tags for better categorization',
      })
    }

    return issues
  }

  /**
   * Generate comprehensive accessibility report
   */
  private generateAccessibilityReport(theme: Theme): AccessibilityReport {
    const contrastIssues: ValidationIssue[] = []
    const colorblindIssues: ValidationIssue[] = []
    const suggestions: string[] = []

    if (!theme.colors) {
      return {
        score: 0,
        contrastIssues: [],
        colorblindIssues: [],
        suggestions: ['No colors defined'],
        passesWCAG_AA: false,
        passesWCAG_AAA: false,
      }
    }

    // Check contrast ratios for each mode
    for (const mode of ['default', 'plan', 'vm'] as const) {
      const modeColors = theme.colors[mode]
      if (!modeColors) continue

      // Check contrast between text and background
      const textContrast = this.checkContrast(modeColors.textPrimary, modeColors.background)

      if (textContrast.ratio < 4.5) {
        contrastIssues.push({
          type: 'warning',
          field: `colors.${mode}.textPrimary`,
          message: `Low contrast (${textContrast.ratio.toFixed(2)}:1) between text and background`,
          suggestion: 'Increase contrast to at least 4.5:1 for WCAG AA compliance',
        })
      }

      if (textContrast.ratio < 7) {
        colorblindIssues.push({
          type: 'info',
          field: `colors.${mode}.textPrimary`,
          message: `Text contrast (${textContrast.ratio.toFixed(2)}:1) could be higher`,
          suggestion: 'Aim for 7:1 contrast ratio for WCAG AAA compliance',
        })
      }

      // Check contrast for other important elements
      const importantElements = [
        { name: 'modeText', color: modeColors.modeText, bg: modeColors.background },
        { name: 'border', color: modeColors.border, bg: modeColors.background },
      ]

      for (const elem of importantElements) {
        const contrast = this.checkContrast(elem.color, elem.bg)
        if (contrast.ratio < 3) {
          contrastIssues.push({
            type: 'warning',
            field: `colors.${mode}.${elem.name}`,
            message: `Low contrast (${contrast.ratio.toFixed(2)}:1) for ${elem.name}`,
            suggestion: 'Increase contrast for better visibility',
          })
        }
      }
    }

    // Generate suggestions
    if (contrastIssues.length === 0) {
      suggestions.push('✓ All colors meet WCAG AA contrast requirements')
    } else {
      suggestions.push(`Found ${contrastIssues.length} contrast issues`)
    }

    if (colorblindIssues.length === 0) {
      suggestions.push('✓ Color choices appear colorblind-friendly')
    } else {
      suggestions.push(`Consider alternatives for ${colorblindIssues.length} color combinations`)
    }

    // Check color diversity
    const colorStats = this.analyzeColors(theme)
    if (colorStats.uniqueColors < 3) {
      suggestions.push('Consider using more distinct colors for better visual hierarchy')
    }

    // Calculate score
    let score = 100
    score -= contrastIssues.length * 15
    score -= colorblindIssues.length * 5
    if (colorStats.uniqueColors < 5) score -= 10
    score = Math.max(0, score)

    const passesWCAG_AA = contrastIssues.filter((i) => i.type === 'error').length === 0
    const passesWCAG_AAA = score >= 90

    return {
      score,
      contrastIssues,
      colorblindIssues,
      suggestions,
      passesWCAG_AA,
      passesWCAG_AAA,
    }
  }

  /**
   * Check contrast ratio between two colors
   */
  private checkContrast(
    color1: string | ColorGradient,
    color2: string | ColorGradient
  ): { ratio: number; passes: boolean } {
    const rgb1 = this.getRGB(color1)
    const rgb2 = this.getRGB(color2)

    const ratio = this.calculateContrastRatio(rgb1, rgb2)
    const passes = ratio >= 4.5

    return { ratio, passes }
  }

  /**
   * Calculate relative luminance and contrast ratio
   */
  private calculateContrastRatio(
    rgb1: { r: number; g: number; b: number },
    rgb2: { r: number; g: number; b: number }
  ): number {
    const lum1 = this.getLuminance(rgb1)
    const lum2 = this.getLuminance(rgb2)
    const brightest = Math.max(lum1, lum2)
    const darkest = Math.min(lum1, lum2)
    return (brightest + 0.05) / (darkest + 0.05)
  }

  /**
   * Get relative luminance
   */
  private getLuminance(rgb: { r: number; g: number; b: number }): number {
    const { r, g, b } = rgb
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c = c / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
  }

  /**
   * Get RGB values from color (handles gradients by using 'from' color)
   */
  private getRGB(color: string | ColorGradient): { r: number; g: number; b: number } {
    if (typeof color === 'object' && 'from' in color) {
      color = (color as ColorGradient).from
    }

    // RGB format
    const rgbMatch = (color as string).match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1]),
        g: parseInt(rgbMatch[2]),
        b: parseInt(rgbMatch[3]),
      }
    }

    // HEX format
    if ((color as string).startsWith('#')) {
      const hex = (color as string).slice(1)
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return { r, g, b }
    }

    // Named color (fallback to black)
    return { r: 0, g: 0, b: 0 }
  }

  /**
   * Calculate theme completeness
   */
  private calculateCompleteness(theme: Theme): number {
    let score = 0
    let total = 0

    // Basic structure (40%)
    total += 40
    if (theme.name) score += 10
    if (theme.description) score += 10
    if (theme.version) score += 10
    if (theme.author) score += 10

    // Colors (60%)
    if (theme.colors) {
      for (const mode of ['default', 'plan', 'vm'] as const) {
        total += 20
        const modeColors = theme.colors[mode]
        if (modeColors) {
          const colorCount = Object.keys(modeColors).length
          score += (colorCount / 16) * 20
        }
      }
    }

    return Math.round((score / total) * 100)
  }

  /**
   * Analyze color usage statistics
   */
  private analyzeColors(theme: Theme): { uniqueColors: number; totalColors: number; gradientsUsed: number } {
    const colors = new Set<string>()
    let totalColors = 0
    let gradientsUsed = 0

    if (!theme.colors) {
      return { uniqueColors: 0, totalColors: 0, gradientsUsed: 0 }
    }

    for (const mode of ['default', 'plan', 'vm'] as const) {
      const modeColors = theme.colors[mode]
      if (!modeColors) continue

      for (const color of Object.values(modeColors)) {
        totalColors++
        if (typeof color === 'object' && 'from' in color) {
          gradientsUsed++
          colors.add((color as ColorGradient).from)
          colors.add((color as ColorGradient).to)
        } else {
          colors.add(color as string)
        }
      }
    }

    return {
      uniqueColors: colors.size,
      totalColors,
      gradientsUsed,
    }
  }

  /**
   * Get suggestions for improving the theme
   */
  getImprovementSuggestions(theme: Theme): string[] {
    const suggestions: string[] = []
    const validation = this.validateTheme(theme)

    // Accessibility suggestions
    if (!validation.accessibility.passesWCAG_AA) {
      suggestions.push('Improve color contrast to meet WCAG AA standards (4.5:1 minimum)')
    }

    if (!validation.accessibility.passesWCAG_AAA) {
      suggestions.push('Consider higher contrast ratios for WCAG AAA compliance (7:1)')
    }

    // Color diversity
    if (validation.colorStats.uniqueColors < 5) {
      suggestions.push('Use more distinct colors for better visual hierarchy')
    }

    // Gradients
    if (validation.colorStats.gradientsUsed === 0) {
      suggestions.push('Consider using gradients for more visual appeal')
    }

    // Completeness
    if (validation.completeness < 80) {
      suggestions.push('Complete all color properties for a fully polished theme')
    }

    // Mode consistency
    const defaultColors = theme.colors?.default
    const planColors = theme.colors?.plan
    const vmColors = theme.colors?.vm

    if (defaultColors && planColors && vmColors) {
      const commonColors = Object.keys(defaultColors).filter(
        (key) =>
          defaultColors[key as keyof typeof defaultColors] === planColors[key as keyof typeof planColors] &&
          defaultColors[key as keyof typeof defaultColors] === vmColors[key as keyof typeof vmColors]
      ).length

      if (commonColors > 5) {
        suggestions.push('Consider differentiating colors more between modes')
      }
    }

    return suggestions
  }
}

// Export singleton instance
export const themeValidator = new ThemeValidator()
