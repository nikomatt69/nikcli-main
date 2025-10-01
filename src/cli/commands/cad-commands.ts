/**
 * CAD Commands for NikCLI
 * Provides slash commands to interact with the text-to-CAD AI system
 */

import boxen from 'boxen'
import chalk from 'chalk'
import { TextToCADAgent } from '../agents/text-to-cad-agent'
import { getCadService } from '../services/cad-gcode-service'

export class CADCommands {
  private cadAgent: TextToCADAgent
  private cadService = getCadService()
  private cliInstance: any
  constructor() {
    this.cadAgent = new TextToCADAgent()
  }

  /**
   * Handle /cad commands
   */
  async handleCADCommand(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.showCADHelp()
      return
    }
    const subcommand = args[0]
    const restArgs = args.slice(1)

    switch (subcommand) {
      case 'generate':
      case 'create':
      case 'design':
        await this.handleGenerate(restArgs)
        break

      case 'stream':
        await this.handleStreamGenerate(restArgs)
        break

      case 'export':
        await this.handleExport(restArgs)
        break

      case 'formats':
        this.showSupportedFormats()
        break

      case 'examples':
        this.showExamples()
        break

      case 'status':
        await this.showSystemStatus()
        break
      default:
        this.showCADHelp()
        break
    }
  }

  /**
   * Generate CAD model from description
   */
  private async handleGenerate(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /cad generate <description>'))
      console.log(chalk.gray('Example: /cad generate "mechanical bracket with 4 holes"'))
      return
    }

    const description = args.join(' ')
    console.log(chalk.blue(`🎨 Generating CAD model: "${description}"`))

    try {
      const result = await this.cadService.generateCAD(description)
      if (result?.model || result?.description) {
        console.log(chalk.green('✓ CAD model generated'))
        console.log(chalk.gray(result.model.substring(0, 1000)))
      } else {
        console.log(chalk.red('❌ CAD generation returned no data'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error: ${error.message}`))
    }
  }

  /**
   * Generate with streaming (real-time progress)
   */
  private async handleStreamGenerate(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /cad stream <description>'))
      console.log(chalk.gray('Example: /cad stream "gear assembly 1:5 ratio"'))
      return
    }

    const description = args.join(' ')
    console.log(chalk.blue(`⚡︎ Starting streaming generation: "${description}"`))
    // For now, fallback to non-streaming service call
    try {
      const result = await this.cadService.generateCAD(description)
      if (result?.model) {
        console.log(chalk.green('✓ CAD model generated'))
        console.log(chalk.gray(result.model.substring(0, 1000)))
      } else {
        console.log(chalk.red('❌ Streaming not supported via provider yet'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error: ${error.message}`))
    }
  }

  /**
   * Export generated model to specific format
   */
  private async handleExport(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.log(chalk.red('Usage: /cad export <format> <description>'))
      console.log(chalk.gray('Formats: stl, step, dwg'))
      console.log(chalk.gray('Example: /cad export stl "simple bracket"'))
      return
    }

    const format = args[0].toLowerCase()
    const description = args.slice(1).join(' ')

    if (!['stl', 'step', 'dwg', 'scad'].includes(format)) {
      console.log(chalk.red('❌ Unsupported format. Use: stl, step, dwg, or scad'))
      return
    }

    console.log(chalk.blue(`📁 Generating and exporting to ${format.toUpperCase()}: "${description}"`))

    try {
      const result = await this.cadService.generateCAD(description)
      if (result?.model) {
        console.log(chalk.green('✓ CAD model generated'))
        console.log(chalk.gray(`Format requested: ${format.toUpperCase()}`))
        console.log(chalk.gray(result.model.substring(0, 1000)))
      } else {
        console.log(chalk.red('❌ Export failed'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error: ${error.message}`))
    }
  }

  /**
   * Show supported output formats
   */
  private showSupportedFormats(): void {
    const content = [
      '📁 Supported CAD Export Formats:',
      '',
      '• STL  - Stereolithography (3D printing)',
      '• STEP - Standard for Exchange of Product Data',
      '• DWG  - AutoCAD Drawing format',
      '• SCAD - OpenSCAD script export',
      '• JSON - Internal element structure',
      '',
      'Usage: /cad export <format> <description>',
    ].join('\n')

    if (this.cliInstance?.printPanel) {
      this.cliInstance.printPanel(
        boxen(content, {
          title: '📁 CAD Export Formats',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } else {
      console.log(
        boxen(content, {
          title: '📁 CAD Export Formats',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    }
  }

  /**
   * Show usage examples
   */
  private showExamples(): void {
    const content = [
      '🎨 CAD Generation Examples:',
      '',
      'Basic generation:',
      '  /cad generate "mechanical bracket with 4 mounting holes"',
      '  /cad create "gear wheel 20 teeth, 5mm bore"',
      '',
      'With dimensions:',
      '  /cad generate "rectangular plate 100mm x 50mm x 5mm"',
      '  /cad create "cylindrical housing 30mm diameter, 15mm height"',
      '',
      'Streaming generation:',
      '  /cad stream "complex assembly with motor mount"',
      '',
      'Export to file:',
      '  /cad export stl "simple bracket for 3D printing"',
      '  /cad export step "precision machined part"',
    ].join('\n')

    if (this.cliInstance?.printPanel) {
      this.cliInstance.printPanel(
        boxen(content, {
          title: '🎨 CAD Examples',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } else {
      console.log(
        boxen(content, {
          title: '🎨 CAD Examples',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    }
  }

  /**
   * Show CAD system status
   */
  private async showSystemStatus(): Promise<void> {
    const capabilities = this.cadAgent.getCapabilities()
    const content = [
      '🔧 Text-to-CAD System Status:',
      '',
      'Available capabilities:',
      ...capabilities.map((cap) => `  ✓ ${cap}`),
      '',
      '🟢 System ready for CAD generation',
    ].join('\n')

    if (this.cliInstance?.printPanel) {
      this.cliInstance.printPanel(
        boxen(content, {
          title: '🔧 CAD System Status',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } else {
      console.log(
        boxen(content, {
          title: '🔧 CAD System Status',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    }
  }

  /**
   * Show CAD command help
   */
  private showCADHelp(): void {
    const content = [
      '🎨 Text-to-CAD AI Commands:',
      '',
      'Generation Commands:',
      '  /cad generate <description> - Generate CAD model',
      '  /cad stream <description>   - Generate with real-time progress',
      '  /cad export <format> <desc> - Generate and export to file',
      '',
      'Information Commands:',
      '  /cad formats                 - Show supported export formats',
      '  /cad examples                - Show usage examples',
      '  /cad status                  - Show system status',
      '  /cad help                    - Show this help',
      '',
      '💡 Tip: Use detailed descriptions for better results',
      'Example: "aluminum bracket 50x30x5mm with 4x M6 bolt holes"',
    ].join('\n')

    if (this.cliInstance?.printPanel) {
      this.cliInstance.printPanel(
        boxen(content, {
          title: '🎨 Text-to-CAD AI Commands',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } else {
      console.log(
        boxen(content, {
          title: '🎨 Text-to-CAD AI Commands',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    }
  }
}

export default CADCommands
