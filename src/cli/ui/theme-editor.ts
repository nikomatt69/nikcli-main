import inquirer from 'inquirer'
import chalk from 'chalk'
import boxen from 'boxen'
import { Theme, ThemeColors, ColorGradient, themeManager } from './theme-manager'
import { colorPicker, ColorPickerResult } from './interactive-color-picker'
import { themeValidator, ValidationResult } from './theme-validator'
import { LiveThemePreview } from './live-theme-preview'

export interface EditOptions {
  mode?: 'default' | 'plan' | 'vm'
  colorKey?: keyof ThemeColors
}

export class ThemeEditor {
  private theme: Theme
  private preview?: LiveThemePreview

  constructor(themeName: string) {
    this.theme = themeManager.getTheme(themeName)
    if (!this.theme) {
      throw new Error(`Theme "${themeName}" not found`)
    }
  }

  /**
   * Start editing the theme
   */
  async start(): Promise<boolean> {
    console.clear()
    console.log(chalk.cyan.bold(`\n📝 Theme Editor: ${this.theme.name}`))
    console.log(chalk.gray(this.theme.description || 'No description'))
    console.log(chalk.gray(`Author: ${this.theme.author || 'Unknown'} | Version: ${this.theme.version || '1.0'}\n`))

    try {
      // Suspend main UI
      await this.suspendMainUI()

      while (true) {
        const { action } = await this.showMainMenu()

        if (action === 'quit') {
          break
        } else if (action === 'edit-mode') {
          await this.editMode()
        } else if (action === 'edit-color') {
          await this.editSpecificColor()
        } else if (action === 'preview') {
          await this.showPreview()
        } else if (action === 'validate') {
          await this.validateTheme()
        } else if (action === 'save') {
          await this.saveChanges()
        } else if (action === 'reset') {
          await this.resetTheme()
        }
      }

      console.log(chalk.green('\n✓ Editor closed\n'))
      return true

    } catch (error: any) {
      console.log(chalk.red(`\n✗ Error: ${error.message}\n`))
      return false
    } finally {
      // Restore main UI
      await this.restoreMainUI()
    }
  }

  /**
   * Show main editing menu
   */
  private async showMainMenu(): Promise<{ action: string }> {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '🎨 Edit a specific color', value: 'edit-color' },
          { name: '📱 Edit a mode (default/plan/vm)', value: 'edit-mode' },
          { name: '👁️ Preview theme', value: 'preview' },
          { name: '♿ Validate accessibility', value: 'validate' },
          { name: '💾 Save changes', value: 'save' },
          { name: '↩️ Reset to original', value: 'reset' },
          { name: '❌ Quit', value: 'quit' },
        ],
      },
    ])

    return { action }
  }

  /**
   * Edit a specific color
   */
  private async editSpecificColor(): Promise<void> {
    console.log(chalk.yellow('\n🎨 Edit Specific Color\n'))

    // Select mode
    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'Select mode:',
        choices: [
          { name: 'Default Mode', value: 'default' },
          { name: 'Plan Mode', value: 'plan' },
          { name: 'VM Mode', value: 'vm' },
        ],
      },
    ])

    // Select color property
    const colorProperties = [
      { key: 'modeText', label: 'Mode Text Color' },
      { key: 'verticalBar', label: 'Vertical Bar Color' },
      { key: 'progressBar', label: 'Progress Bar Color' },
      { key: 'accent1', label: 'Accent Color 1' },
      { key: 'accent2', label: 'Accent Color 2' },
      { key: 'accent3', label: 'Accent Color 3' },
      { key: 'accent4', label: 'Accent Color 4' },
      { key: 'accent5', label: 'Accent Color 5' },
      { key: 'background', label: 'Background Color' },
      { key: 'textPrimary', label: 'Primary Text Color' },
      { key: 'textSecondary', label: 'Secondary Text Color' },
      { key: 'border', label: 'Border Color' },
      { key: 'success', label: 'Success Color' },
      { key: 'warning', label: 'Warning Color' },
      { key: 'error', label: 'Error Color' },
      { key: 'info', label: 'Info Color' },
    ]

    const { colorKey } = await inquirer.prompt([
      {
        type: 'list',
        name: 'colorKey',
        message: 'Select color to edit:',
        choices: colorProperties.map((p) => ({
          name: p.label,
          value: p.key,
        })),
      },
    ])

    const currentValue = this.theme.colors[mode][colorKey as keyof ThemeColors]
    const currentStr = this.formatColorValue(currentValue)

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: `${colorProperties.find(p => p.key === colorKey)?.label}:`,
        choices: [
          { name: `Keep: ${currentStr}`, value: 'keep' },
          { name: 'Pick new color', value: 'pick' },
          { name: 'Reset to default', value: 'reset' },
        ],
      },
    ])

    if (action === 'keep') {
      console.log(chalk.gray('No changes made\n'))
      return
    } else if (action === 'reset') {
      // Reset to a default value
      const defaultColor = this.getDefaultColor(mode, colorKey as keyof ThemeColors)
      this.theme.colors[mode][colorKey as keyof ThemeColors] = defaultColor
      console.log(chalk.green(`\n✓ Reset to default: ${this.formatColorValue(defaultColor)}\n`))
    } else if (action === 'pick') {
      const colorResult = await colorPicker.pickColor('Pick new color')
      this.theme.colors[mode][colorKey as keyof ThemeColors] = colorResult.isGradient
        ? colorResult.gradient!
        : colorResult.color

      console.log(chalk.green(`\n✓ Color updated: ${this.formatColorValue(this.theme.colors[mode][colorKey as keyof ThemeColors])}\n`))
    }

    // Ask if user wants to preview
    const { preview } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'preview',
        message: 'Preview changes?',
        default: true,
      },
    ])

    if (preview) {
      await this.showPreview(mode)
    }
  }

  /**
   * Edit an entire mode
   */
  private async editMode(): Promise<void> {
    console.log(chalk.yellow('\n📱 Edit Mode\n'))

    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'Select mode to edit:',
        choices: [
          { name: 'Default Mode', value: 'default' },
          { name: 'Plan Mode', value: 'plan' },
          { name: 'VM Mode', value: 'vm' },
        ],
      },
    ])

    const modeColors = this.theme.colors[mode]

    console.log(chalk.gray(`\nEditing ${mode} mode colors:\n`))

    // Show current colors
    const colorList = Object.entries(modeColors).map(([key, value]) => {
      return `${key.padEnd(15)} ${this.formatColorValue(value as any)}`
    }).join('\n')

    console.log(boxen(chalk.gray(colorList), {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'gray',
    }))

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Edit all colors', value: 'edit-all' },
          { name: 'Edit specific colors', value: 'edit-some' },
          { name: 'Apply gradient theme', value: 'gradient-theme' },
          { name: 'Reset mode to defaults', value: 'reset' },
        ],
      },
    ])

    if (action === 'reset') {
      this.resetMode(mode)
      console.log(chalk.green(`\n✓ ${mode} mode reset to defaults\n`))
    } else if (action === 'gradient-theme') {
      await this.applyGradientTheme(mode)
    } else if (action === 'edit-all' || action === 'edit-some') {
      await this.editModeColors(mode, action === 'edit-all')
    }

    const { preview } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'preview',
        message: 'Preview changes?',
        default: true,
      },
    ])

    if (preview) {
      await this.showPreview(mode)
    }
  }

  /**
   * Edit colors for a mode
   */
  private async editModeColors(mode: 'default' | 'plan' | 'vm', editAll: boolean): Promise<void> {
    const modeColors = this.theme.colors[mode]
    const colorKeys = Object.keys(modeColors) as (keyof ThemeColors)[]

    for (const colorKey of colorKeys) {
      if (!editAll) {
        const { skip } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'skip',
            message: `Edit ${colorKey}?`,
            default: false,
          },
        ])
        if (skip) continue
      }

      const currentValue = modeColors[colorKey]
      const colorResult = await colorPicker.pickColor(`Pick ${colorKey}`)
      modeColors[colorKey] = colorResult.isGradient
        ? colorResult.gradient as any
        : colorResult.color
    }
  }

  /**
   * Apply gradient theme to mode
   */
  private async applyGradientTheme(mode: 'default' | 'plan' | 'vm'): Promise<void> {
    console.log(chalk.yellow('\n↗️ Apply Gradient Theme\n'))

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Choose gradient style:',
        choices: [
          { name: 'Blue to Cyan (Cool)', value: 'cool' },
          { name: 'Orange to Red (Warm)', value: 'warm' },
          { name: 'Green to Teal (Nature)', value: 'nature' },
          { name: 'Purple to Pink (Neon)', value: 'neon' },
          { name: 'Custom gradient', value: 'custom' },
        ],
      },
    ])

    let fromColor: string
    let toColor: string

    switch (action) {
      case 'cool':
        fromColor = 'rgb(0, 123, 255)'
        toColor = 'rgb(0, 255, 255)'
        break
      case 'warm':
        fromColor = 'rgb(255, 140, 0)'
        toColor = 'rgb(255, 69, 0)'
        break
      case 'nature':
        fromColor = 'rgb(34, 139, 34)'
        toColor = 'rgb(50, 205, 50)'
        break
      case 'neon':
        fromColor = 'rgb(255, 20, 147)'
        toColor = 'rgb(0, 255, 255)'
        break
      case 'custom':
        const result = await colorPicker.pickGradient()
        fromColor = result.gradient!.from
        toColor = result.gradient!.to
        break
      default:
        fromColor = 'blue'
        toColor = 'cyan'
    }

    // Apply gradient to main colors
    const gradient: ColorGradient = { from: fromColor, to: toColor, angle: 45 }
    this.theme.colors[mode].modeText = gradient
    this.theme.colors[mode].verticalBar = gradient
    this.theme.colors[mode].progressBar = gradient

    console.log(chalk.green(`\n✓ Gradient theme applied to ${mode} mode\n`))
  }

  /**
   * Show theme preview
   */
  private async showPreview(mode?: 'default' | 'plan' | 'vm'): Promise<void> {
    console.log(chalk.yellow('\n👁️ Theme Preview\n'))

    const previewMode = mode || 'default'
    const preview = new LiveThemePreview(this.theme.name)
    preview.updateTheme(this.theme)
    preview.getCurrentMode = () => previewMode

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Preview mode:',
        choices: [
          { name: 'Interactive preview (switch modes)', value: 'interactive' },
          { name: `Preview ${mode || 'default'} mode only`, value: 'static' },
        ],
      },
    ])

    if (action === 'interactive') {
      await preview.startPreview()
    } else {
      // Static preview
      preview.renderPreview()
      const readline = require('readline')
      const rl = readline.createInterface({ input: process.stdin })
      await new Promise<void>((resolve) => {
        rl.question('\nPress Enter to continue...', () => {
          rl.close()
          resolve()
        })
      })
    }
  }

  /**
   * Validate theme
   */
  private async validateTheme(): Promise<void> {
    console.log(chalk.yellow('\n♿ Accessibility Validation\n'))

    const validation = themeValidator.validateTheme(this.theme)

    console.log(chalk.bold(`Completeness: ${validation.completeness}%`))
    console.log(chalk.bold(`Accessibility Score: ${validation.accessibility.score}/100\n`))

    if (validation.accessibility.passesWCAG_AA) {
      console.log(chalk.green('✓ WCAG AA Compliant'))
    } else {
      console.log(chalk.red('✗ Does not meet WCAG AA standards'))
    }

    if (validation.accessibility.passesWCAG_AAA) {
      console.log(chalk.green('✓ WCAG AAA Compliant'))
    } else {
      console.log(chalk.yellow('○ Does not meet WCAG AAA standards'))
    }

    if (validation.issues.length > 0) {
      console.log(chalk.yellow('\nIssues:'))
      for (const issue of validation.issues.slice(0, 10)) {
        const icon = issue.type === 'error' ? '✗' : issue.type === 'warning' ? '⚠' : 'ℹ'
        console.log(`  ${icon} ${issue.message}`)
        if (issue.suggestion) {
          console.log(chalk.gray(`    ${issue.suggestion}`))
        }
      }
      if (validation.issues.length > 10) {
        console.log(chalk.gray(`  ... and ${validation.issues.length - 10} more`))
      }
    } else {
      console.log(chalk.green('\n✓ No issues found'))
    }

    const suggestions = themeValidator.getImprovementSuggestions(this.theme)
    if (suggestions.length > 0) {
      console.log(chalk.cyan('\nSuggestions:'))
      for (const suggestion of suggestions) {
        console.log(`  • ${suggestion}`)
      }
    }

    const readline = require('readline')
    const rl = readline.createInterface({ input: process.stdin })
    await new Promise<void>((resolve) => {
      rl.question('\nPress Enter to continue...', () => {
        rl.close()
        resolve()
      })
    })
  }

  /**
   * Save changes
   */
  private async saveChanges(): Promise<void> {
    console.log(chalk.yellow('\n💾 Save Changes\n'))

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Save options:',
        choices: [
          { name: 'Overwrite current theme', value: 'overwrite' },
          { name: 'Save as new theme', value: 'save-as' },
          { name: 'Export to JSON', value: 'export' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ])

    if (action === 'cancel') {
      console.log(chalk.gray('Save cancelled\n'))
      return
    }

    if (action === 'export') {
      const json = JSON.stringify(this.theme, null, 2)
      console.log(chalk.green('\n✓ Theme exported to JSON'))
      console.log(json)
    } else if (action === 'save-as') {
      const { newName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'newName',
          message: 'New theme name:',
          validate: (val) => {
            if (!val.trim()) return 'Name is required'
            if (themeManager.themeExists(val)) return 'Theme name already exists'
            return true
          },
        },
      ])

      this.theme.name = newName
      themeManager.createCustomTheme(newName, this.theme.description, this.theme.colors)
      console.log(chalk.green(`\n✓ Theme saved as "${newName}"`))
    } else if (action === 'overwrite') {
      // For built-in themes, we can't overwrite, so save as new
      const { saveAsNew } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'saveAsNew',
          message: 'This is a built-in theme. Save as new theme instead?',
          default: true,
        },
      ])

      if (saveAsNew) {
        const { newName } = await inquirer.prompt([
          {
            type: 'input',
            name: 'newName',
            message: 'New theme name:',
            validate: (val) => {
              if (!val.trim()) return 'Name is required'
              if (themeManager.themeExists(val)) return 'Theme name already exists'
              return true
            },
          },
        ])

        this.theme.name = newName
        themeManager.createCustomTheme(newName, this.theme.description, this.theme.colors)
        console.log(chalk.green(`\n✓ Theme saved as "${newName}"`))
      }
    }
  }

  /**
   * Reset theme to original
   */
  private async resetTheme(): Promise<void> {
    console.log(chalk.yellow('\n↩️ Reset Theme\n'))

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Reset all changes and reload original theme?',
        default: false,
      },
    ])

    if (confirm) {
      this.theme = themeManager.getTheme(this.theme.name)
      console.log(chalk.green('\n✓ Theme reset to original\n'))
    } else {
      console.log(chalk.gray('Reset cancelled\n'))
    }
  }

  /**
   * Reset a mode to defaults
   */
  private resetMode(mode: 'default' | 'plan' | 'vm'): void {
    const originalTheme = themeManager.getTheme(this.theme.name)
    if (originalTheme) {
      this.theme.colors[mode] = { ...originalTheme.colors[mode] }
    }
  }

  /**
   * Get default color for a property
   */
  private getDefaultColor(mode: 'default' | 'plan' | 'vm', colorKey: keyof ThemeColors): string {
    const defaults: Record<string, string> = {
      modeText: mode === 'plan' ? 'yellow' : mode === 'vm' ? 'magenta' : 'blue',
      verticalBar: mode === 'plan' ? 'yellow' : mode === 'vm' ? 'magenta' : 'blue',
      progressBar: mode === 'plan' ? 'yellow' : mode === 'vm' ? 'magenta' : 'blue',
      accent1: mode === 'plan' ? 'yellow' : mode === 'vm' ? 'magenta' : 'blue',
      accent2: 'rgb(100, 100, 100)',
      accent3: 'rgb(150, 150, 150)',
      accent4: 'rgb(80, 80, 80)',
      accent5: 'rgb(120, 120, 120)',
      background: '#1a1a1a',
      textPrimary: 'white',
      textSecondary: 'rgb(200, 200, 200)',
      border: 'rgb(100, 100, 100)',
      success: 'green',
      warning: 'yellow',
      error: 'red',
      info: 'blue',
    }

    return defaults[colorKey] || 'blue'
  }

  /**
   * Format color value for display
   */
  private formatColorValue(value: string | ColorGradient): string {
    if (typeof value === 'object' && 'from' in value) {
      const g = value as ColorGradient
      return `${g.from} → ${g.to} (${g.angle || 0}°)`
    }
    return value as string
  }

  /**
   * Suspend main UI
   */
  private async suspendMainUI(): Promise<void> {
    try {
      const { inputQueue } = await import('../core/input-queue')
      inputQueue.enableBypass()
    } catch {}

    try {
      const { advancedUI } = await import('./advanced-cli-ui')
      advancedUI.stopInteractiveMode?.()
    } catch {}

    try {
      const nik = (global as any).__nikCLI
      if (nik?.suspendPrompt) {
        nik.suspendPrompt()
      }
    } catch {}
  }

  /**
   * Restore main UI
   */
  private async restoreMainUI(): Promise<void> {
    try {
      const { inputQueue } = await import('../core/input-queue')
      inputQueue.disableBypass()
    } catch {}

    try {
      const { advancedUI } = await import('./advanced-cli-ui')
      advancedUI.startInteractiveMode?.()
    } catch {}

    try {
      const nik = (global as any).__nikCLI
      if (nik?.resumePromptAndRender) {
        nik.resumePromptAndRender()
      }
    } catch {}
  }
}

// Export singleton instance
export const themeEditor = new ThemeEditor('')
