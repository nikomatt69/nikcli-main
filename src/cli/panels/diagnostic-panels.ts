import chalk from 'chalk'
import boxen from 'boxen'
import { ideDiagnosticIntegration } from '../integrations/ide-diagnostic-integration'

/**
 * DiagnosticPanels - Handles diagnostic panel commands
 * Extracted from lines 15471-15643 in nik-cli.ts
 */
export class DiagnosticPanels {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async handleDiagnosticPanels(args: string[]): Promise<void> {
    if (!args || args.length === 0) {
      const content = [
        '/diagnostic start [path] - Start monitoring (optional path)',
        '/diagnostic stop [path]  - Stop monitoring (or path)',
        '/diagnostic status       - Show monitoring status',
        '/diagnostic run          - Run diagnostic scan',
        '/monitor [path]          - Alias for diagnostic start',
        '/diag-status             - Alias for diagnostic status',
      ].join('\n')

      this.nikCLI.printPanel(
        boxen(content, {
          title: '🔍 IDE Diagnostics: Help',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        }),
        'general'
      )
      return
    }

    const sub = args[0].toLowerCase()
    const rest = args.slice(1)
    try {
      switch (sub) {
        case 'start': {
          const watchPath = rest[0]
          ideDiagnosticIntegration.setActive(true)
          await ideDiagnosticIntegration.startMonitoring(watchPath)
          const status = await ideDiagnosticIntegration.getMonitoringStatus()

          const lines: string[] = []
          lines.push(watchPath ? `✓ Monitoring started for: ${watchPath}` : '✓ Monitoring started for entire project')
          lines.push('')
          lines.push(`Monitoring: ${status.enabled ? 'Active' : 'Inactive'}`)
          lines.push(`Watched paths: ${status.watchedPaths.length}`)
          lines.push(`Active watchers: ${status.totalWatchers}`)
          if (status.watchedPaths.length > 0) {
            lines.push('')
            lines.push('Watched paths:')
            status.watchedPaths.forEach((p: string) => lines.push(`• ${p}`))
          }
          lines.push('')
          lines.push('Tips:')
          lines.push('• Use /diag-status to check monitoring status')
          lines.push('• Use /diagnostic stop to stop monitoring')

          this.nikCLI.printPanel(
            boxen(lines.join('\n'), {
              title: '🔍 IDE Diagnostics: Monitoring',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            })
          )
          break
        }
        case 'stop': {
          const watchPath = rest[0]
          await ideDiagnosticIntegration.stopMonitoring(watchPath)
          const content = watchPath ? `⏹️ Stopped monitoring path: ${watchPath}` : '⏹️ Stopped all monitoring'
          this.nikCLI.printPanel(
            boxen(content, {
              title: '🔍 IDE Diagnostics: Monitoring Stopped',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }
        case 'status': {
          const status = await ideDiagnosticIntegration.getMonitoringStatus()
          const quick = await ideDiagnosticIntegration.getQuickStatus()
          const lines: string[] = []
          lines.push(`Monitoring: ${status.enabled ? 'Active' : 'Inactive'}`)
          lines.push(`Watched paths: ${status.watchedPaths.length}`)
          lines.push(`Active watchers: ${status.totalWatchers}`)
          if (status.watchedPaths.length > 0) {
            lines.push('')
            lines.push('Watched paths:')
            status.watchedPaths.forEach((p: string) => lines.push(`• ${p}`))
          }
          lines.push('')
          lines.push(`Current status: ${quick}`)

          this.nikCLI.printPanel(
            boxen(lines.join('\n'), {
              title: '🔍 IDE Diagnostics: Status',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            })
          )
          break
        }
        case 'run': {
          const wasActive = (ideDiagnosticIntegration as any).isActive
          if (!wasActive) ideDiagnosticIntegration.setActive(true)
          const context = await ideDiagnosticIntegration.getWorkflowContext()

          const lines: string[] = []
          lines.push(`Errors: ${context.errors}`)
          lines.push(`Warnings: ${context.warnings}`)
          if (context.errors === 0 && context.warnings === 0) {
            lines.push('✓ No errors or warnings found')
          }
          lines.push('')
          lines.push(`Build: ${context.buildStatus}`)
          lines.push(`Tests: ${context.testStatus}`)
          lines.push(`Lint: ${context.lintStatus}`)
          lines.push('')
          lines.push(`Branch: ${context.vcsStatus.branch}`)
          if (context.vcsStatus.hasChanges) {
            lines.push(`Changes: ${context.vcsStatus.stagedFiles} staged, ${context.vcsStatus.unstagedFiles} unstaged`)
          }
          if (context.affectedFiles.length > 0) {
            lines.push('')
            lines.push('Affected files:')
            context.affectedFiles.slice(0, 10).forEach((f: string) => lines.push(`• ${f}`))
            if (context.affectedFiles.length > 10) {
              lines.push(`… and ${context.affectedFiles.length - 10} more`)
            }
          }
          if (context.recommendations.length > 0) {
            lines.push('')
            lines.push('💡 Recommendations:')
            context.recommendations.forEach((rec: string) => lines.push(`• ${rec}`))
          }

          this.nikCLI.printPanel(
            boxen(lines.join('\n'), {
              title: '📊 Diagnostic Results',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'magenta',
            })
          )

          if (!wasActive) ideDiagnosticIntegration.setActive(false)
          break
        }
        default: {
          console.log(chalk.red(`❌ Unknown diagnostic command: ${sub}`))
          const content = 'Use /diagnostic for available subcommands'
          this.nikCLI.printPanel(
            boxen(content, {
              title: '🔍 IDE Diagnostics',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            })
          )
        }
      }
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Diagnostic command failed: ${error.message}`, {
          title: '❌ Diagnostic Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }),
        'general'
      )
    }
  }
}
