/**
 * CAD Commands for NikCLI
 * Provides slash commands to interact with the text-to-CAD AI system
 */

import chalk from 'chalk'
import { TextToCADAgent } from '../agents/text-to-cad-agent'
import { getCadService } from '../services/cad-gcode-service'

export class CADCommands {
  private cadAgent: TextToCADAgent
  private cadService = getCadService()

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

      case 'help':
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
        console.log(chalk.green('✅ CAD model generated'))
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
    console.log(chalk.blue(`🔄 Starting streaming generation: "${description}"`))
    // For now, fallback to non-streaming service call
    try {
      const result = await this.cadService.generateCAD(description)
      if (result?.model) {
        console.log(chalk.green('✅ CAD model generated'))
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
        console.log(chalk.green('✅ CAD model generated'))
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
    console.log(chalk.cyan.bold('📁 Supported CAD Export Formats:'))
    console.log('')
    console.log(chalk.blue('• STL') + chalk.gray('  - Stereolithography (3D printing)'))
    console.log(chalk.blue('• STEP') + chalk.gray(' - Standard for Exchange of Product Data'))
    console.log(chalk.blue('• DWG') + chalk.gray('  - AutoCAD Drawing format'))
    console.log(chalk.blue('• SCAD') + chalk.gray(' - OpenSCAD script export'))
    console.log(chalk.blue('• JSON') + chalk.gray(' - Internal element structure'))
    console.log('')
    console.log(chalk.gray('Usage: /cad export <format> <description>'))
  }

  /**
   * Show usage examples
   */
  private showExamples(): void {
    console.log(chalk.cyan.bold('🎨 CAD Generation Examples:'))
    console.log('')
    console.log(chalk.yellow('Basic generation:'))
    console.log(chalk.gray('  /cad generate "mechanical bracket with 4 mounting holes"'))
    console.log(chalk.gray('  /cad create "gear wheel 20 teeth, 5mm bore"'))
    console.log('')
    console.log(chalk.yellow('With dimensions:'))
    console.log(chalk.gray('  /cad generate "rectangular plate 100mm x 50mm x 5mm"'))
    console.log(chalk.gray('  /cad create "cylindrical housing 30mm diameter, 15mm height"'))
    console.log('')
    console.log(chalk.yellow('Streaming generation:'))
    console.log(chalk.gray('  /cad stream "complex assembly with motor mount"'))
    console.log('')
    console.log(chalk.yellow('Export to file:'))
    console.log(chalk.gray('  /cad export stl "simple bracket for 3D printing"'))
    console.log(chalk.gray('  /cad export step "precision machined part"'))
  }

  /**
   * Show CAD system status
   */
  private async showSystemStatus(): Promise<void> {
    console.log(chalk.cyan.bold('🔧 Text-to-CAD System Status:'))
    console.log('')

    const capabilities = this.cadAgent.getCapabilities()
    console.log(chalk.blue('Available capabilities:'))
    capabilities.forEach((cap) => {
      console.log(chalk.gray(`  ✅ ${cap}`))
    })

    console.log('')
    console.log(chalk.green('🟢 System ready for CAD generation'))
  }

  /**
   * Show CAD command help
   */
  private showCADHelp(): void {
    console.log(chalk.cyan.bold('🎨 Text-to-CAD AI Commands:'))
    console.log('')
    console.log(chalk.yellow('Generation Commands:'))
    console.log(chalk.blue('  /cad generate <description>') + chalk.gray(' - Generate CAD model'))
    console.log(chalk.blue('  /cad stream <description>') + chalk.gray('   - Generate with real-time progress'))
    console.log(chalk.blue('  /cad export <format> <desc>') + chalk.gray(' - Generate and export to file'))
    console.log('')
    console.log(chalk.yellow('Information Commands:'))
    console.log(chalk.blue('  /cad formats') + chalk.gray('                 - Show supported export formats'))
    console.log(chalk.blue('  /cad examples') + chalk.gray('                - Show usage examples'))
    console.log(chalk.blue('  /cad status') + chalk.gray('                  - Show system status'))
    console.log(chalk.blue('  /cad help') + chalk.gray('                    - Show this help'))
    console.log('')
    console.log(chalk.gray('💡 Tip: Use detailed descriptions for better results'))
    console.log(chalk.gray('Example: "aluminum bracket 50x30x5mm with 4x M6 bolt holes"'))
  }
}

export default CADCommands
