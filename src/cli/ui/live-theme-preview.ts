import boxen from 'boxen'
import chalk from 'chalk'
import { type Theme, themeManager } from './theme-manager'

export interface PreviewMode {
  mode: 'default' | 'plan' | 'vm'
  label: string
}

export class LiveThemePreview {
  private currentTheme: Theme
  private currentMode: PreviewMode['mode'] = 'default'
  private isActive: boolean = false

  constructor(themeName?: string) {
    this.currentTheme = themeName ? themeManager.getTheme(themeName) : themeManager.getCurrentTheme()
  }

  /**
   * Start live preview with interactive mode switcher
   */
  async startPreview(): Promise<void> {
    this.isActive = true

    while (this.isActive) {
      this.renderPreview()

      const { action } = await this.getUserInput()

      if (action === 'quit') {
        this.isActive = false
      } else if (action === 'switch-mode') {
        this.currentMode = this.getNextMode()
      } else if (action === 'refresh') {
        // Theme might have changed, reload it
        this.currentTheme = themeManager.getCurrentTheme()
      }
    }

    console.log('\n✓ Preview closed\n')
  }

  /**
   * Render the preview panel
   */
  renderPreview(): void {
    const modeColors = this.currentTheme.colors[this.currentMode]

    // Clear screen
    console.clear()

    // Header
    const header = chalk.bold.cyan('🎨 Live Theme Preview')
    console.log(header)
    console.log(chalk.gray(`Theme: ${this.currentTheme.name} | Mode: ${this.currentMode.toUpperCase()}\n`))

    // Mode switcher info
    const modes: PreviewMode[] = [
      { mode: 'default', label: 'Default' },
      { mode: 'plan', label: 'Plan' },
      { mode: 'vm', label: 'VM' },
    ]

    const modeDisplay = modes
      .map((m) => {
        if (m.mode === this.currentMode) {
          return chalk.bgBlue.white(` ${m.label} `)
        }
        return chalk.gray(m.label)
      })
      .join('  ')

    console.log(
      chalk.yellow('Press') +
        chalk.white(' [d] ') +
        chalk.yellow('for Default,') +
        chalk.white(' [p] ') +
        chalk.yellow('for Plan,') +
        chalk.white(' [v] ') +
        chalk.yellow('for VM,') +
        chalk.white(' [q] ') +
        chalk.yellow('to quit\n')
    )

    // Sample UI Panel
    this.renderSampleUIPanel(modeColors)

    // Color Palette
    this.renderColorPalette(modeColors)

    // Sample Text
    this.renderSampleText(modeColors)

    // Loading Bar Sample
    this.renderLoadingBar(modeColors)
  }

  /**
   * Render sample UI panel with theme colors
   */
  private renderSampleUIPanel(colors: any): void {
    const panelContent = [
      `${this.applyColor(colors.modeText, '█')} ${this.applyColor(colors.modeText, 'DEFAULT MODE')}`,
      '',
      this.applyColor(colors.textPrimary, 'This is primary text'),
      this.applyColor(colors.textSecondary, 'This is secondary text'),
      '',
      `Border: ${this.applyColor(colors.border, '■■■■■■■■■■')}`,
      `Accent: ${this.applyColor(colors.accent1, '■■■■■■■■■■')}`,
      '',
      `${this.applyColor(colors.success, '✓ Success: Operation completed')} `,
      `${this.applyColor(colors.warning, '⚠ Warning: Check configuration')} `,
      `${this.applyColor(colors.error, '✗ Error: Something went wrong')} `,
      `${this.applyColor(colors.info, 'ℹ Info: Processing data...')} `,
    ].join('\n')

    const borderRGB = this.parseColor(colors.border)
    const borderHex = this.rgbToHex(borderRGB)
    const boxed = boxen(panelContent, {
      padding: 1,
      borderColor: borderHex,
      borderStyle: 'round',
    })

    console.log(boxed)
    console.log('')
  }

  /**
   * Render color palette
   */
  private renderColorPalette(colors: any): void {
    console.log(chalk.bold.yellow('Color Palette:'))
    console.log('')

    const colorItems = [
      { label: 'Mode Text', color: colors.modeText },
      { label: 'Vertical Bar', color: colors.verticalBar },
      { label: 'Progress Bar', color: colors.progressBar },
      { label: 'Text Primary', color: colors.textPrimary },
      { label: 'Text Secondary', color: colors.textSecondary },
      { label: 'Border', color: colors.border },
      { label: 'Success', color: colors.success },
      { label: 'Warning', color: colors.warning },
      { label: 'Error', color: colors.error },
      { label: 'Info', color: colors.info },
    ]

    for (const item of colorItems) {
      const blocks = '████████████'
      const colorStr =
        typeof item.color === 'object' && 'from' in item.color
          ? `${(item.color as any).from} → ${(item.color as any).to}`
          : (item.color as string)

      console.log(`${item.label.padEnd(15)} ${this.applyColor(item.color, blocks)} ${chalk.gray(colorStr)}`)
    }

    console.log('')
  }

  /**
   * Render sample text
   */
  private renderSampleText(colors: any): void {
    console.log(chalk.bold.yellow('Sample Text Rendering:'))
    console.log('')

    console.log(this.applyColor(colors.textPrimary, 'Primary text - This is how main content appears'))
    console.log(this.applyColor(colors.textSecondary, 'Secondary text - This is how secondary content appears'))
    console.log('')
  }

  /**
   * Render loading bar sample
   */
  private renderLoadingBar(colors: any): void {
    console.log(chalk.bold.yellow('Progress Bar Sample:'))
    console.log('')

    const loadingStates = [
      { progress: 0, label: 'Starting...' },
      { progress: 25, label: 'Loading...' },
      { progress: 50, label: 'Processing...' },
      { progress: 75, label: 'Almost done...' },
      { progress: 100, label: 'Complete!' },
    ]

    for (const state of loadingStates) {
      const bar = this.renderProgressBar(20, state.progress, colors.progressBar)
      console.log(`${this.applyColor(colors.modeText, '█')} ${bar} ${state.progress}% ${state.label}`)
    }

    console.log('')
  }

  /**
   * Render a progress bar with theme colors
   */
  private renderProgressBar(width: number, progress: number, color: string | any): string {
    const filled = Math.floor((progress / 100) * width)
    const empty = width - filled

    const filledChar = '█'
    const emptyChar = '░'

    const filledColor = this.applyColor(color, filledChar.repeat(filled))
    const emptyColor = chalk.gray(emptyChar.repeat(empty))

    return filledColor + emptyColor
  }

  /**
   * Get user input for mode switching
   */
  private async getUserInput(): Promise<{ action: string }> {
    const readline = require('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question('\nPress [d] Default, [p] Plan, [v] VM, [q] Quit: ', (answer: string) => {
        rl.close()

        const key = answer.toLowerCase()
        if (key === 'd' || key === 'default') {
          this.currentMode = 'default'
          resolve({ action: 'switch-mode' })
        } else if (key === 'p' || key === 'plan') {
          this.currentMode = 'plan'
          resolve({ action: 'switch-mode' })
        } else if (key === 'v' || key === 'vm') {
          this.currentMode = 'vm'
          resolve({ action: 'switch-mode' })
        } else if (key === 'q' || key === 'quit' || key === 'exit') {
          resolve({ action: 'quit' })
        } else {
          resolve({ action: 'refresh' })
        }
      })
    })
  }

  /**
   * Get next mode in cycle
   */
  private getNextMode(): PreviewMode['mode'] {
    const modes: PreviewMode['mode'][] = ['default', 'plan', 'vm']
    const currentIndex = modes.indexOf(this.currentMode)
    return modes[(currentIndex + 1) % modes.length]
  }

  /**
   * Apply theme color to text
   */
  private applyColor(color: string | any, text: string): string {
    if (typeof color === 'object' && 'from' in color) {
      // It's a gradient, use the 'from' color for preview
      const gradient = color as any
      return themeManager.applyChalk(this.currentMode, 'modeText', text, this.currentTheme.name)
    }

    // String color
    const colorStr = color as string

    if (colorStr.startsWith('rgb(')) {
      const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
      if (match) {
        const [, r, g, b] = match.map(Number)
        return chalk.rgb(r, g, b)(text)
      }
    }

    if (colorStr.startsWith('#')) {
      const hex = colorStr.slice(1)
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return chalk.rgb(r, g, b)(text)
    }

    // Try named color
    const chalkMethod = (chalk as any)[colorStr]
    if (typeof chalkMethod === 'function') {
      return chalkMethod(text)
    }

    return text
  }

  /**
   * Parse color string to RGB
   */
  private parseColor(color: string | any): { r: number; g: number; b: number } {
    if (typeof color === 'object' && 'from' in color) {
      color = (color as any).from
    }

    const colorStr = color as string

    if (colorStr.startsWith('rgb(')) {
      const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
      if (match) {
        return {
          r: parseInt(match[1]),
          g: parseInt(match[2]),
          b: parseInt(match[3]),
        }
      }
    }

    if (colorStr.startsWith('#')) {
      const hex = colorStr.slice(1)
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      }
    }

    return { r: 255, g: 255, b: 255 }
  }

  /**
   * Stop the preview
   */
  stop(): void {
    this.isActive = false
  }

  /**
   * Update theme being previewed
   */
  updateTheme(theme: Theme): void {
    this.currentTheme = theme
  }

  /**
   * Get current mode
   */
  getCurrentMode(): PreviewMode['mode'] {
    return this.currentMode
  }

  /**
   * Compare two themes side by side
   */
  static async compareThemes(theme1: Theme, theme2: Theme): Promise<void> {
    console.clear()
    console.log(chalk.bold.cyan('🎨 Theme Comparison\n'))

    const modes: PreviewMode['mode'][] = ['default', 'plan', 'vm']

    for (const mode of modes) {
      console.log(chalk.bold.yellow(`\n${mode.toUpperCase()} Mode:`))
      console.log(chalk.gray('─'.repeat(60)))

      const colors1 = theme1.colors[mode]
      const colors2 = theme2.colors[mode]

      const items = [
        { label: 'Mode Text', key: 'modeText' as const },
        { label: 'Vertical Bar', key: 'verticalBar' as const },
        { label: 'Progress Bar', key: 'progressBar' as const },
        { label: 'Text Primary', key: 'textPrimary' as const },
        { label: 'Success', key: 'success' as const },
        { label: 'Warning', key: 'warning' as const },
        { label: 'Error', key: 'error' as const },
      ]

      for (const item of items) {
        const color1 = colors1[item.key]
        const color2 = colors2[item.key]
        const colorStr1 = typeof color1 === 'object' ? color1.from : color1
        const colorStr2 = typeof color2 === 'object' ? color2.from : color2

        console.log(`${item.label.padEnd(15)} ${theme1.name.padEnd(15)} ${theme2.name}`)
        console.log(
          `${' '.repeat(15)} ${LiveThemePreview.renderColorSample(colorStr1)} ${' '.repeat(5)} ${LiveThemePreview.renderColorSample(colorStr2)}`
        )
        console.log(
          `${' '.repeat(15)} ${chalk.gray(colorStr1)} ${' '.repeat(30 - colorStr1.length)} ${chalk.gray(colorStr2)}`
        )
        console.log('')
      }
    }

    console.log('\nPress Enter to continue...')
    const readline = require('readline')
    const rl = readline.createInterface({ input: process.stdin })
    rl.question('', () => rl.close())
  }

  /**
   * Convert RGB to HEX
   */
  private rgbToHex(rgb: { r: number; g: number; b: number }): string {
    const toHex = (c: number) => c.toString(16).padStart(2, '0')
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
  }

  /**
   * Render a color sample block
   */
  private static renderColorSample(color: string): string {
    const blocks = '██████'

    if (color.startsWith('rgb(')) {
      const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
      if (match) {
        const [, r, g, b] = match.map(Number)
        return chalk.bgRgb(r, g, b).white(blocks)
      }
    }

    if (color.startsWith('#')) {
      const hex = color.slice(1)
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return chalk.bgRgb(r, g, b).white(blocks)
    }

    const chalkMethod = (chalk as any)[color]
    if (typeof chalkMethod === 'function') {
      return chalkMethod(blocks)
    }

    return blocks
  }
}

// Export singleton instance
export const liveThemePreview = new LiveThemePreview()
