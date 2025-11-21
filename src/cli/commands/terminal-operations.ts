import chalk from 'chalk'
import boxen from 'boxen'
import { toolsManager } from '../tools/tools-manager'
import { formatCommand, wrapBlue } from '../utils/text-wrapper'

/**
 * TerminalOperations - Handles terminal operation commands
 * Extracted from lines ~6904-7125 in nik-cli.ts
 */
export class TerminalOperations {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async handleTerminalOperations(command: string, args: string[]): Promise<void> {
    try {
      switch (command) {
        case 'run': {
          if (args.length === 0) {
            this.nikCLI.printPanel(
              boxen('Usage: /run <command> [args...]', {
                title: 'Run Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            return
          }
          const [cmd, ...cmdArgs] = args
          const fullCommand = `${cmd} ${cmdArgs.join(' ')}`

          const approved = await this.nikCLI.askAdvancedConfirmation(
            `Execute command: ${fullCommand}`,
            `Run command in ${process.cwd()}`,
            true
          )

          if (!approved) {
            console.log(chalk.yellow('❌ Command execution cancelled'))
            break
          }
          this.nikCLI.isInteractiveMode = false
          console.log(formatCommand(fullCommand))
          const uniqueId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          this.nikCLI.createStatusIndicator(uniqueId, `Executing: ${cmd}`)

          const result = await toolsManager.runCommand(cmd, cmdArgs, { stream: true })

          const success = result.code === 0
          this.nikCLI.updateStatusIndicator(uniqueId, {
            status: success ? 'completed' : 'failed',
            details: success ? 'Command completed successfully' : `Exit code ${result.code}`,
          })
          if (success) {
            console.log(chalk.green('✓ Command completed successfully'))
          } else {
            console.log(chalk.red(`❌ Command failed with exit code ${result.code}`))
          }

          break
        }
        case 'install': {
          if (args.length === 0) {
            this.nikCLI.printPanel(
              boxen('Usage: /install <packages...>\n\nOptions: --global, --dev, --yarn, --pnpm', {
                title: 'Install Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break
          }

          const packages = args.filter((arg) => !arg.startsWith('--'))
          const isGlobal = args.includes('--global') || args.includes('-g')
          const isDev = args.includes('--dev') || args.includes('-D')
          const manager = args.includes('--yarn') ? 'yarn' : args.includes('--pnpm') ? 'pnpm' : 'npm'

          const { approvalSystem } = await import('../ui/approval-system')
          const approved = await approvalSystem.confirm(
            `Install packages: ${packages.join(', ')}`,
            `Using ${manager}${isGlobal ? ' (global)' : ''}${isDev ? ' (dev)' : ''}`,
            false
          )

          if (!approved) {
            console.log(chalk.yellow('❌ Package installation cancelled'))
            break
          }
          this.nikCLI.isInteractiveMode = false
          console.log(wrapBlue(`📦 Installing ${packages.join(', ')} with ${manager}...`))
          const installId = `install-${Date.now()}`
          this.nikCLI.createAdvancedProgressBar(installId, 'Installing packages', packages.length)

          for (let i = 0; i < packages.length; i++) {
            const pkg = packages[i]
            this.nikCLI.updateStatusIndicator(installId, { details: `Installing ${pkg}...` })

            const success = await toolsManager.installPackage(pkg, {
              global: isGlobal,
              dev: isDev,
              manager: manager as any,
            })

            if (!success) {
              this.nikCLI.addLiveUpdate({ type: 'warning', content: `Failed to install ${pkg}`, source: 'install' })
              console.log(chalk.yellow(`⚠️ Failed to install ${pkg}`))
            } else {
              this.nikCLI.addLiveUpdate({ type: 'log', content: `Installed ${pkg}`, source: 'install' })
            }

            this.nikCLI.updateAdvancedProgress(installId, i + 1, packages.length)
          }

          this.nikCLI.completeAdvancedProgress(installId, `Completed installation of ${packages.length} packages`)
          this.nikCLI.isInteractiveMode = true
          console.log(chalk.green(`✓ Package installation completed`))

          break
        }
        case 'npm':
        case 'yarn':
        case 'git':
        case 'docker': {
          await toolsManager.runCommand(command, args, { stream: true })

          break
        }
        case 'ps': {
          const processes = toolsManager.getRunningProcesses()
          if (processes.length === 0) {
            const maxHeight = this.nikCLI.getAvailablePanelHeight()
            this.nikCLI.printPanel(
              boxen('No processes currently running', {
                title: 'Processes',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
                width: Math.min(120, (process.stdout.columns || 100) - 4),
                height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
              })
            )
          } else {
            const lines: string[] = []
            processes.forEach((proc) => {
              const duration = Date.now() - proc.startTime.getTime()
              lines.push(`${chalk.cyan('PID')} ${proc.pid}: ${chalk.bold(proc.command)} ${proc.args.join(' ')}`)
              lines.push(`  Status: ${proc.status} | Duration: ${Math.round(duration / 1000)}s`)
              lines.push(`  CWD: ${proc.cwd}`)
            })
            const maxHeight = this.nikCLI.getAvailablePanelHeight()
            let content = lines.join('\n')

            if (content.split('\n').length > maxHeight) {
              const truncatedLines = content.split('\n').slice(0, maxHeight - 2)
              content = `${truncatedLines.join('\n')}\n\n⚠️  Content truncated`
            }

            this.nikCLI.printPanel(
              boxen(content, {
                title: `Processes (${processes.length})`,
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'magenta',
                width: Math.min(120, (process.stdout.columns || 100) - 4),
                height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
              })
            )
          }
          break
        }
        case 'kill': {
          if (args.length === 0) {
            this.nikCLI.printPanel(
              boxen('Usage: /kill <pid>', {
                title: 'Kill Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break
          }
          const pid = parseInt(args[0], 10)
          if (Number.isNaN(pid)) {
            console.log(chalk.red('Invalid PID'))
            break
          }
          const maxHeight = this.nikCLI.getAvailablePanelHeight()
          this.nikCLI.printPanel(
            boxen(`Attempting to kill process ${pid}…`, {
              title: '🛑 Kill Process',
              padding: 1,
              margin: 1,
              width: Math.min(120, (process.stdout.columns || 100) - 4),
              height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          const success = await toolsManager.killProcess(pid)
          this.nikCLI.printPanel(
            boxen(success ? `Process ${pid} terminated` : `Could not kill process ${pid}`, {
              title: success ? 'Kill Success' : 'Kill Failed',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: success ? 'green' : 'red',
            })
          )
          break
        }
      }
    } catch (error: any) {
      this.nikCLI.addLiveUpdate({ type: 'error', content: `Terminal operation failed: ${error.message}`, source: 'terminal' })
      console.log(chalk.red(`❌ Error: ${error.message}`))
    } finally {
      await this.nikCLI.performCommandCleanup()
    }
  }
}
