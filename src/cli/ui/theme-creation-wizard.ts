import boxen from 'boxen'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { ColorPickerResult, colorPicker } from './interactive-color-picker'
import { LiveThemePreview } from './live-theme-preview'
import { ColorGradient, type Theme, type ThemeColors, themeManager } from './theme-manager'
import { themeValidator, type ValidationResult } from './theme-validator'

export interface WizardState {
  name: string
  description: string
  author?: string
  version: string
  tags: string[]
  colors: {
    default: Partial<ThemeColors>
    plan: Partial<ThemeColors>
    vm: Partial<ThemeColors>
  }
}

export class ThemeCreationWizard {
  private state: WizardState
  private preview?: LiveThemePreview

  constructor() {
    this.state = {
      name: '',
      description: '',
      author: 'User',
      version: '1.0',
      tags: ['custom'],
      colors: {
        default: {},
        plan: {},
        vm: {},
      },
    }
  }

  /**
   * Start the theme creation wizard
   */
  async start(): Promise<Theme | null> {
    console.clear()
    console.log(chalk.cyan.bold('\n🎨 Theme Creation Wizard'))
    console.log(chalk.gray('Create a custom theme step by step\n'))

    try {
      // Suspend main UI
      await this.suspendMainUI()

      // Step 1: Name and Description
      await this.stepNameAndDescription()

      // Step 2: Base Color Selection
      await this.stepBaseColor()

      // Step 3: Default Mode Customization
      await this.stepModeCustomization('default', 'Default Mode')

      // Step 4: Plan Mode Customization
      await this.stepModeCustomization('plan', 'Plan Mode')

      // Step 5: VM Mode Customization
      await this.stepModeCustomization('vm', 'VM Mode')

      // Step 6: Live Preview
      await this.stepLivePreview()

      // Step 7: Accessibility Check
      const validation = await this.stepAccessibilityCheck()

      // Step 8: Save Theme
      const theme = await this.stepSaveTheme(validation)

      return theme
    } catch (error) {
      console.log(chalk.red('\n✗ Wizard cancelled or error occurred'))
      return null
    } finally {
      // Restore main UI
      await this.restoreMainUI()
    }
  }

  /**
   * Step 1: Name and Description
   */
  private async stepNameAndDescription(): Promise<void> {
    console.log(chalk.yellow('\n📝 Step 1: Theme Information'))
    console.log(chalk.gray('Define basic information about your theme\n'))

    const { name } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Theme name:',
        validate: (val) => {
          if (!val.trim()) return 'Theme name is required'
          if (themeManager.themeExists(val)) return 'Theme name already exists'
          return true
        },
      },
    ])

    const { description } = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'Description:',
        default: 'My custom theme',
      },
    ])

    const { author } = await inquirer.prompt([
      {
        type: 'input',
        name: 'author',
        message: 'Author:',
        default: 'User',
      },
    ])

    this.state.name = name
    this.state.description = description
    this.state.author = author

    console.log(chalk.green(`\n✓ Theme "${name}" created\n`))
  }

  /**
   * Step 2: Base Color Selection
   */
  private async stepBaseColor(): Promise<void> {
    console.log(chalk.yellow('\n🎨 Step 2: Base Color Selection'))
    console.log(chalk.gray('Pick a base color to start with\n'))

    const baseColorResult = await colorPicker.pickColor('Select base color for your theme')

    // Set base color for all modes
    const baseColor = baseColorResult.color

    this.state.colors.default.modeText = baseColor
    this.state.colors.default.verticalBar = baseColor
    this.state.colors.default.progressBar = baseColor
    this.state.colors.default.accent1 = baseColor

    this.state.colors.plan.modeText = 'yellow'
    this.state.colors.plan.verticalBar = 'yellow'
    this.state.colors.plan.progressBar = 'yellow'
    this.state.colors.plan.accent1 = 'yellow'

    this.state.colors.vm.modeText = 'magenta'
    this.state.colors.vm.verticalBar = 'magenta'
    this.state.colors.vm.progressBar = 'magenta'
    this.state.colors.vm.accent1 = 'magenta'

    console.log(chalk.green(`\n✓ Base color selected: ${baseColor}\n`))
  }

  /**
   * Step 3-5: Mode Customization
   */
  private async stepModeCustomization(mode: 'default' | 'plan' | 'vm', modeName: string): Promise<void> {
    console.log(
      chalk.yellow(
        `\n${mode === 'default' ? '🔵' : mode === 'plan' ? '🟡' : '🟣'} Step ${mode === 'default' ? '3' : mode === 'plan' ? '4' : '5'}: ${modeName} Customization`
      )
    )
    console.log(chalk.gray(`Customize colors for ${modeName}\n`))

    const modeColors = this.state.colors[mode]

    // Color properties to customize
    const colorProperties = [
      { key: 'modeText', label: 'Mode Text Color', required: true },
      { key: 'verticalBar', label: 'Vertical Bar Color', required: true },
      { key: 'progressBar', label: 'Progress Bar Color', required: true },
      { key: 'accent1', label: 'Accent Color 1', required: true },
      { key: 'accent2', label: 'Accent Color 2', required: false },
      { key: 'accent3', label: 'Accent Color 3', required: false },
      { key: 'accent4', label: 'Accent Color 4', required: false },
      { key: 'accent5', label: 'Accent Color 5', required: false },
      { key: 'background', label: 'Background Color', required: true },
      { key: 'textPrimary', label: 'Primary Text Color', required: true },
      { key: 'textSecondary', label: 'Secondary Text Color', required: false },
      { key: 'border', label: 'Border Color', required: false },
      { key: 'success', label: 'Success Color', required: false },
      { key: 'warning', label: 'Warning Color', required: false },
      { key: 'error', label: 'Error Color', required: false },
      { key: 'info', label: 'Info Color', required: false },
    ]

    const { customize } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'customize',
        message: `Customize ${modeName} colors?`,
        default: true,
      },
    ])

    if (!customize) {
      console.log(chalk.gray(`Skipping ${modeName} customization\n`))
      return
    }

    for (const prop of colorProperties) {
      const currentValue = modeColors[prop.key as keyof ThemeColors]

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: `${prop.label}:`,
          choices: [
            { name: `Keep: ${currentValue || '(default)'}`, value: 'keep' },
            { name: 'Pick new color', value: 'pick' },
            ...(prop.required ? [] : [{ name: 'Skip', value: 'skip' }]),
          ],
        },
      ])

      if (action === 'keep') {
        // Keep current value
      } else if (action === 'pick') {
        const colorResult = await colorPicker.pickColor(`Pick ${prop.label}`)
        modeColors[prop.key as keyof ThemeColors] = colorResult.isGradient
          ? (colorResult.gradient as any)
          : colorResult.color

        // Show accessibility info if available
        if (colorResult.accessibility) {
          const acc = colorResult.accessibility
          if (acc.passes) {
            console.log(chalk.green(`  ✓ Contrast: ${acc.contrast}:1 (Good)`))
          } else {
            console.log(chalk.yellow(`  ⚠ Contrast: ${acc.contrast}:1 (Low)`))
            if (acc.suggestions.length > 0) {
              console.log(chalk.gray(`  ${acc.suggestions[0]}`))
            }
          }
        }
      } else if (action === 'skip') {
        // Skip optional property
      }
    }

    console.log(chalk.green(`\n✓ ${modeName} colors configured\n`))
  }

  /**
   * Step 6: Live Preview
   */
  private async stepLivePreview(): Promise<void> {
    console.log(chalk.yellow('\n👁️ Step 6: Live Preview'))
    console.log(chalk.gray('Preview your theme in real-time\n'))

    // Create temporary theme for preview
    const tempTheme = this.buildTheme()
    this.preview = new LiveThemePreview()
    this.preview.updateTheme(tempTheme)

    const { preview } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'preview',
        message: 'Start live preview? (recommended)',
        default: true,
      },
    ])

    if (preview) {
      console.log(chalk.gray('\nStarting preview...'))
      await this.preview.startPreview()
    }

    console.log(chalk.green('\n✓ Preview completed\n'))
  }

  /**
   * Step 7: Accessibility Check
   */
  private async stepAccessibilityCheck(): Promise<ValidationResult> {
    console.log(chalk.yellow('\n♿ Step 7: Accessibility Check'))
    console.log(chalk.gray('Validating theme accessibility and compliance\n'))

    const theme = this.buildTheme()
    const validation = themeValidator.validateTheme(theme)

    // Display results
    console.log(chalk.bold(`Accessibility Score: ${validation.accessibility.score}/100`))

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

    // Show issues
    if (validation.issues.length > 0) {
      console.log(chalk.yellow('\nIssues found:'))
      for (const issue of validation.issues.slice(0, 5)) {
        const icon = issue.type === 'error' ? '✗' : issue.type === 'warning' ? '⚠' : 'ℹ'
        console.log(`  ${icon} ${issue.message}`)
        if (issue.suggestion) {
          console.log(chalk.gray(`    ${issue.suggestion}`))
        }
      }
      if (validation.issues.length > 5) {
        console.log(chalk.gray(`  ... and ${validation.issues.length - 5} more`))
      }
    } else {
      console.log(chalk.green('\n✓ No issues found'))
    }

    // Show suggestions
    const suggestions = themeValidator.getImprovementSuggestions(theme)
    if (suggestions.length > 0) {
      console.log(chalk.cyan('\nSuggestions:'))
      for (const suggestion of suggestions) {
        console.log(`  • ${suggestion}`)
      }
    }

    const { continue: cont } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: '\nContinue with these colors?',
        default: validation.accessibility.score >= 60,
      },
    ])

    if (!cont) {
      throw new Error('User cancelled due to accessibility issues')
    }

    console.log(chalk.green('\n✓ Accessibility check passed\n'))
    return validation
  }

  /**
   * Step 8: Save Theme
   */
  private async stepSaveTheme(validation: ValidationResult): Promise<Theme> {
    console.log(chalk.yellow('\n💾 Step 8: Save Theme'))
    console.log(chalk.gray('Save your custom theme\n'))

    const theme = this.buildTheme()

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'How would you like to save?',
        choices: [
          { name: 'Save theme to NikCLI', value: 'save' },
          { name: 'Export to JSON only', value: 'export' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ])

    if (action === 'cancel') {
      throw new Error('User cancelled')
    }

    if (action === 'save') {
      const success = themeManager.createCustomTheme(this.state.name, this.state.description, theme.colors)

      if (success) {
        console.log(chalk.green(`\n✓ Theme "${this.state.name}" saved successfully!`))
        console.log(chalk.gray(`Use /theme set ${this.state.name} to apply it`))
      } else {
        throw new Error('Failed to save theme')
      }
    } else if (action === 'export') {
      const json = themeManager.exportTheme(this.state.name)
      if (json) {
        console.log(chalk.green('\n✓ Theme exported to JSON'))
        console.log(chalk.gray('\nJSON Output:'))
        console.log(json)
      }
    }

    return theme
  }

  /**
   * Build complete theme from wizard state
   */
  private buildTheme(): Theme {
    // Ensure all required colors are set with defaults
    const defaultColors = this.getCompleteColors('default')
    const planColors = this.getCompleteColors('plan')
    const vmColors = this.getCompleteColors('vm')

    return {
      name: this.state.name,
      description: this.state.description,
      author: this.state.author,
      version: this.state.version,
      tags: this.state.tags,
      colors: {
        default: defaultColors,
        plan: planColors,
        vm: vmColors,
      },
      accessibility: {
        highContrast: false,
        colorblindFriendly: true,
        reducedMotion: false,
      },
    }
  }

  /**
   * Complete colors with defaults
   */
  private getCompleteColors(mode: 'default' | 'plan' | 'vm'): ThemeColors {
    const colors = this.state.colors[mode]
    const baseColor = colors.modeText || (mode === 'plan' ? 'yellow' : mode === 'vm' ? 'magenta' : 'blue')

    return {
      modeText: colors.modeText || baseColor,
      verticalBar: colors.verticalBar || baseColor,
      progressBar: colors.progressBar || baseColor,
      accent1: colors.accent1 || baseColor,
      accent2: colors.accent2 || 'rgb(100, 100, 100)',
      accent3: colors.accent3 || 'rgb(150, 150, 150)',
      accent4: colors.accent4 || 'rgb(80, 80, 80)',
      accent5: colors.accent5 || 'rgb(120, 120, 120)',
      background: colors.background || '#1a1a1a',
      textPrimary: colors.textPrimary || 'white',
      textSecondary: colors.textSecondary || 'rgb(200, 200, 200)',
      border: colors.border || 'rgb(100, 100, 100)',
      success: colors.success || 'green',
      warning: colors.warning || 'yellow',
      error: colors.error || 'red',
      info: colors.info || 'blue',
    }
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
export const themeCreationWizard = new ThemeCreationWizard()
