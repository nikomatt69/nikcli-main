import inquirer from 'inquirer'
import chalk from 'chalk'

export interface HSL {
  h: number // 0-360
  s: number // 0-100
  l: number // 0-100
}

export interface RGB {
  r: number // 0-255
  g: number // 0-255
  b: number // 0-255
}

export interface ColorPickerResult {
  color: string
  isGradient: boolean
  gradient?: {
    from: string
    to: string
    angle?: number
  }
  format: 'rgb' | 'hex' | 'named'
  accessibility?: {
    contrast: number
    passes: boolean
    suggestions: string[]
  }
}

export class InteractiveColorPicker {
  private namedColors = [
    { name: 'Black', value: '#000000' },
    { name: 'White', value: '#FFFFFF' },
    { name: 'Red', value: '#FF0000' },
    { name: 'Green', value: '#00FF00' },
    { name: 'Blue', value: '#0000FF' },
    { name: 'Cyan', value: '#00FFFF' },
    { name: 'Magenta', value: '#FF00FF' },
    { name: 'Yellow', value: '#FFFF00' },
    { name: 'Orange', value: '#FFA500' },
    { name: 'Purple', value: '#800080' },
    { name: 'Pink', value: '#FFC0CB' },
    { name: 'Brown', value: '#A52A2A' },
    { name: 'Gray', value: '#808080' },
    { name: 'Silver', value: '#C0C0C0' },
    { name: 'Gold', value: '#FFD700' },
    { name: 'Navy', value: '#000080' },
    { name: 'Teal', value: '#008080' },
    { name: 'Lime', value: '#00FF00' },
    { name: 'Olive', value: '#808000' },
    { name: 'Maroon', value: '#800000' },
  ]

  /**
   * Main color picker entry point
   */
  async pickColor(prompt: string = 'Select a color'): Promise<ColorPickerResult> {
    const { pickerType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'pickerType',
        message: `${prompt}\nChoose picker type:`,
        choices: [
          { name: '🎨 HSL Picker (Hue, Saturation, Lightness)', value: 'hsl' },
          { name: '🌈 RGB Picker (Red, Green, Blue)', value: 'rgb' },
          { name: '🏷️ Named Colors (CSS Colors)', value: 'named' },
          { name: '↗️ Create Gradient (from → to)', value: 'gradient' },
        ],
      },
    ])

    switch (pickerType) {
      case 'hsl':
        return this.pickHSL()
      case 'rgb':
        return this.pickRGB()
      case 'named':
        return this.pickNamed()
      case 'gradient':
        return this.pickGradient()
      default:
        return this.pickRGB()
    }
  }

  /**
   * HSL Color Picker with sliders
   */
  private async pickHSL(): Promise<ColorPickerResult> {
    const { hue } = await inquirer.prompt([
      {
        type: 'number',
        name: 'hue',
        message: 'Hue (0-360°):',
        default: 180,
        validate: (val) => val >= 0 && val <= 360 || 'Hue must be 0-360',
      },
    ])

    const { saturation } = await inquirer.prompt([
      {
        type: 'number',
        name: 'saturation',
        message: 'Saturation (0-100%):',
        default: 50,
        validate: (val) => val >= 0 && val <= 100 || 'Saturation must be 0-100',
      },
    ])

    const { lightness } = await inquirer.prompt([
      {
        type: 'number',
        name: 'lightness',
        message: 'Lightness (0-100%):',
        default: 50,
        validate: (val) => val >= 0 && val <= 100 || 'Lightness must be 0-100',
      },
    ])

    const hsl: HSL = { h: hue, s: saturation, l: lightness }
    const rgb = this.hslToRgb(hsl)
    const hex = this.rgbToHex(rgb)

    // Preview
    console.log('\nPreview:')
    console.log(chalk.bgRgb(rgb.r, rgb.g, rgb.b).white(`   Sample Text   `))
    console.log(`HSL: hsl(${hue}, ${saturation}%, ${lightness}%)`)
    console.log(`RGB: rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`)
    console.log(`HEX: ${hex}\n`)

    // Check accessibility
    const accessibility = this.checkAccessibility(hex)

    return {
      color: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      isGradient: false,
      format: 'rgb',
      accessibility,
    }
  }

  /**
   * RGB Color Picker with numeric inputs
   */
  private async pickRGB(): Promise<ColorPickerResult> {
    const { red } = await inquirer.prompt([
      {
        type: 'number',
        name: 'red',
        message: 'Red (0-255):',
        default: 255,
        validate: (val) => val >= 0 && val <= 255 || 'Red must be 0-255',
      },
    ])

    const { green } = await inquirer.prompt([
      {
        type: 'number',
        name: 'green',
        message: 'Green (0-255):',
        default: 0,
        validate: (val) => val >= 0 && val <= 255 || 'Green must be 0-255',
      },
    ])

    const { blue } = await inquirer.prompt([
      {
        type: 'number',
        name: 'blue',
        message: 'Blue (0-255):',
        default: 0,
        validate: (val) => val >= 0 && val <= 255 || 'Blue must be 0-255',
      },
    ])

    const rgb: RGB = { r: red, g: green, b: blue }
    const hex = this.rgbToHex(rgb)

    // Preview
    console.log('\nPreview:')
    console.log(chalk.bgRgb(rgb.r, rgb.g, rgb.b).white(`   Sample Text   `))
    console.log(`RGB: rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`)
    console.log(`HEX: ${hex}\n`)

    // Check accessibility
    const accessibility = this.checkAccessibility(hex)

    return {
      color: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      isGradient: false,
      format: 'rgb',
      accessibility,
    }
  }

  /**
   * Named Colors Picker
   */
  private async pickNamed(): Promise<ColorPickerResult> {
    const { selectedColor } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedColor',
        message: 'Select a named color:',
        choices: this.namedColors.map((c) => ({
          name: `${c.name.padEnd(10)} ${c.value}`,
          value: c.value,
        })),
      },
    ])

    const colorName = this.namedColors.find((c) => c.value === selectedColor)?.name || 'Custom'
    const rgb = this.hexToRgb(selectedColor)

    // Preview
    console.log('\nPreview:')
    console.log(chalk.bgRgb(rgb.r, rgb.g, rgb.b).white(`   Sample Text   `))
    console.log(`Color: ${colorName}`)
    console.log(`HEX: ${selectedColor}\n`)

    // Check accessibility
    const accessibility = this.checkAccessibility(selectedColor)

    return {
      color: selectedColor,
      isGradient: false,
      format: 'hex',
      accessibility,
    }
  }

  /**
   * Gradient Builder
   */
  async pickGradient(): Promise<ColorPickerResult> {
    console.log('\n📝 Gradient Builder\n')

    // Pick start color
    const { startColor } = await inquirer.prompt([
      {
        type: 'list',
        name: 'startColor',
        message: 'Select start color:',
        choices: [
          ...this.namedColors.map((c) => ({ name: c.name, value: c.value })),
          { name: 'Custom RGB...', value: 'custom-rgb' },
          { name: 'Custom HSL...', value: 'custom-hsl' },
        ],
      },
    ])

    let startColorValue: string
    if (startColor === 'custom-rgb') {
      const startRGB = await this.pickRGB()
      startColorValue = startRGB.color
    } else if (startColor === 'custom-hsl') {
      const startHSL = await this.pickHSL()
      startColorValue = startHSL.color
    } else {
      startColorValue = startColor
    }

    // Pick end color
    const { endColor } = await inquirer.prompt([
      {
        type: 'list',
        name: 'endColor',
        message: 'Select end color:',
        choices: [
          ...this.namedColors.map((c) => ({ name: c.name, value: c.value })),
          { name: 'Custom RGB...', value: 'custom-rgb' },
          { name: 'Custom HSL...', value: 'custom-hsl' },
        ],
      },
    ])

    let endColorValue: string
    if (endColor === 'custom-rgb') {
      const endRGB = await this.pickRGB()
      endColorValue = endRGB.color
    } else if (endColor === 'custom-hsl') {
      const endHSL = await this.pickHSL()
      endColorValue = endHSL.color
    } else {
      endColorValue = endColor
    }

    // Pick angle
    const { angle } = await inquirer.prompt([
      {
        type: 'number',
        name: 'angle',
        message: 'Gradient angle (0-360°):',
        default: 45,
        validate: (val) => val >= 0 && val <= 360 || 'Angle must be 0-360',
      },
    ])

    // Preview gradient
    console.log('\nPreview:')
    const gradientPreview = this.renderGradientPreview(startColorValue, endColorValue)
    console.log(gradientPreview)
    console.log(`From: ${startColorValue}`)
    console.log(`To: ${endColorValue}`)
    console.log(`Angle: ${angle}°\n`)

    return {
      color: startColorValue,
      isGradient: true,
      gradient: {
        from: startColorValue,
        to: endColorValue,
        angle,
      },
      format: 'rgb',
    }
  }

  /**
   * Render gradient preview (simplified with midpoint)
   */
  private renderGradientPreview(from: string, to: string): string {
    // Get RGB values
    const fromRGB = this.parseColor(from)
    const toRGB = this.parseColor(to)

    // Mix colors for preview
    const midR = Math.round((fromRGB.r + toRGB.r) / 2)
    const midG = Math.round((fromRGB.g + toRGB.g) / 2)
    const midB = Math.round((fromRGB.b + toRGB.b) / 2)

    // Create gradient effect
    const blocks = ['█', '▓', '▒', '░', '▒', '▓']
    let result = '  '

    for (let i = 0; i < blocks.length; i++) {
      const t = i / (blocks.length - 1)
      const r = Math.round(fromRGB.r * (1 - t) + midR * t)
      const g = Math.round(fromRGB.g * (1 - t) + midG * t)
      const b = Math.round(fromRGB.b * (1 - t) + midB * t)
      result += chalk.rgb(r, g, b)(blocks[i])
    }

    return result
  }

  /**
   * Check accessibility and contrast ratio
   */
  private checkAccessibility(color: string): ColorPickerResult['accessibility'] {
    // Parse color to RGB
    const rgb = this.parseColor(color)

    // Calculate contrast with white and black
    const contrastWhite = this.calculateContrast(rgb, { r: 255, g: 255, b: 255 })
    const contrastBlack = this.calculateContrast(rgb, { r: 0, g: 0, b: 0 })
    const bestContrast = Math.max(contrastWhite, contrastBlack)

    const passes = bestContrast >= 4.5
    const suggestions: string[] = []

    if (!passes) {
      suggestions.push('Low contrast detected. Consider adjusting brightness.')
      if (bestContrast < 3) {
        suggestions.push('Very low contrast. Color may be hard to read.')
      }
    } else if (bestContrast >= 7) {
      suggestions.push('Excellent contrast! WCAG AAA compliant.')
    } else if (bestContrast >= 4.5) {
      suggestions.push('Good contrast. WCAG AA compliant.')
    }

    return {
      contrast: parseFloat(bestContrast.toFixed(2)),
      passes,
      suggestions,
    }
  }

  /**
   * Calculate contrast ratio between two colors
   */
  private calculateContrast(color1: RGB, color2: RGB): number {
    const lum1 = this.getLuminance(color1)
    const lum2 = this.getLuminance(color2)
    const brightest = Math.max(lum1, lum2)
    const darkest = Math.min(lum1, lum2)
    return (brightest + 0.05) / (darkest + 0.05)
  }

  /**
   * Get relative luminance of a color
   */
  private getLuminance(color: RGB): number {
    const { r, g, b } = color
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c = c / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
  }

  /**
   * Convert HSL to RGB
   */
  private hslToRgb(hsl: HSL): RGB {
    const { h, s, l } = hsl
    const c = (1 - Math.abs(2 * l / 100 - 1)) * (s / 100)
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l / 100 - c / 2

    let r = 0, g = 0, b = 0

    if (h >= 0 && h < 60) {
      r = c; g = x; b = 0
    } else if (h >= 60 && h < 120) {
      r = x; g = c; b = 0
    } else if (h >= 120 && h < 180) {
      r = 0; g = c; b = x
    } else if (h >= 180 && h < 240) {
      r = 0; g = x; b = c
    } else if (h >= 240 && h < 300) {
      r = x; g = 0; b = c
    } else {
      r = c; g = 0; b = x
    }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    }
  }

  /**
   * Convert RGB to HEX
   */
  private rgbToHex(rgb: RGB): string {
    const toHex = (c: number) => c.toString(16).padStart(2, '0')
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
  }

  /**
   * Convert HEX to RGB
   */
  private hexToRgb(hex: string): RGB {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 }
  }

  /**
   * Parse color string to RGB
   */
  private parseColor(color: string): RGB {
    // RGB format: rgb(r, g, b)
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1]),
        g: parseInt(rgbMatch[2]),
        b: parseInt(rgbMatch[3]),
      }
    }

    // HEX format
    return this.hexToRgb(color)
  }
}

// Export singleton instance
export const colorPicker = new InteractiveColorPicker()
