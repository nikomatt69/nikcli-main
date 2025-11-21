import chalk from 'chalk'
import boxen from 'boxen'
import { advancedUI } from '../ui/advanced-cli-ui'
import { vmSelector } from '../core/vm-selector'

/**
 * VMMode - Handles virtual machine mode execution
 * Extracted from lines 3804-3969 in nik-cli.ts
 */
export class VMMode {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async handleVMMode(input: string): Promise<void> {
    advancedUI.logFunctionUpdate('info', chalk.blue('🐳 VM Mode: Targeted OS-like VM communication...'))

    try {
      // Get VM orchestrator instance from slash handler
      const vmOrchestrator = this.nikCLI.slashHandler.getVMOrchestrator?.()
      if (!vmOrchestrator) {
        this.nikCLI.printPanel(
          boxen(['VM Orchestrator not available', '', 'Use /vm-init to initialize VM system'].join('\n'), {
            title: 'VM Error',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          })
        )
        return
      }

      // Check for available VMs
      const containers = this.nikCLI.slashHandler.getActiveVMContainers?.() || []
      if (containers.length === 0) {
        advancedUI.logFunctionUpdate('info', chalk.yellow('⚠️ No active VM containers'))
        advancedUI.logFunctionUpdate('info', chalk.gray('Use /vm-create <repo-url|os> to create one'))
        advancedUI.logFunctionUpdate('info', chalk.gray('Use /default to exit VM mode'))
        return
      }

      // Get currently selected VM or prompt for selection
      let selectedVM = vmSelector.getSelectedVM()

      if (!selectedVM) {
        advancedUI.logFunctionUpdate('info', chalk.cyan('🎯 No VM selected. Choose a VM to chat with:'))
        selectedVM = await vmSelector.selectVM({ interactive: true, sortBy: 'activity' })

        if (!selectedVM) {
          advancedUI.logFunctionUpdate('info', chalk.gray('VM mode cancelled'))
          return
        }
      }

      // Show current VM context with enhanced info
      advancedUI.logFunctionUpdate('info', chalk.green(` Chatting with VM: ${chalk.bold(selectedVM.name)}`))
      advancedUI.logFunctionUpdate('info', chalk.gray(` Container: ${selectedVM.containerId.slice(0, 12)}`))

      if (selectedVM.systemInfo) {
        advancedUI.logFunctionUpdate(
          'info',
          chalk.gray(` System: ${selectedVM.systemInfo.os} ${selectedVM.systemInfo.arch}`)
        )
        advancedUI.logFunctionUpdate('info', chalk.gray(`⚡︎ Working Dir: ${selectedVM.systemInfo.workingDirectory}`))
      }

      if (selectedVM.repositoryUrl) {
        advancedUI.logFunctionUpdate('info', chalk.gray(` Repository: ${selectedVM.repositoryUrl.split('/').pop()}`))
      }

      // Show chat history count
      const chatHistory = vmSelector.getChatHistory(selectedVM.id)
      advancedUI.logFunctionUpdate('info', chalk.gray(` Chat History: ${chatHistory.length} messages`))

      advancedUI.logFunctionUpdate(
        'info',
        chalk.gray(` Message: ${input.substring(0, 80)}${input.length > 80 ? '...' : ''}`)
      )
      advancedUI.logFunctionUpdate('info', chalk.white('─'.repeat(50)))
      console.log()

      try {
        // Send message to the selected VM agent through the communication bridge
        advancedUI.logFunctionUpdate(
          'info',
          chalk.blue(` Sending to VM Agent ${selectedVM.containerId.slice(0, 8)}...`)
        )

        // Use real communication through VMOrchestrator bridge
        if (vmOrchestrator.sendMessageToAgent) {
          const response = await vmOrchestrator.sendMessageToAgent(selectedVM.agentId, input)

          if (response.success) {
            advancedUI.logFunctionUpdate(
              'info',
              chalk.green(`✓ VM Response received (${response.metadata?.responseTime}ms)`)
            )
            console.log()
            advancedUI.logFunctionUpdate('info', chalk.cyan(` ${selectedVM.name}:`))
            console.log(chalk.white(`┌${'─'.repeat(58)}┐`))

            // Format response with proper line breaks
            const responseLines = (response.data || '').split('\n')
            responseLines.forEach((line: string) => {
              const truncatedLine = line.length > 56 ? `${line.substring(0, 53)}...` : line
              advancedUI.logFunctionUpdate('info', chalk.white(`│ ${truncatedLine.padEnd(56)} │`))
            })

            advancedUI.logFunctionUpdate('info', chalk.white(`└${'─'.repeat(58)}┘`))

            // Add to chat history
            await vmSelector.addChatMessage(selectedVM.id, 'user', input)
            await vmSelector.addChatMessage(selectedVM.id, 'vm', response.data || '')

            // Show quick actions
            advancedUI.logFunctionUpdate('info', chalk.cyan(''))
            this.nikCLI.printPanel(
              boxen('Quick actions: /vm-status | /vm-exec | /vm-switch | /vm-ls', {
                title: 'VM Quick Actions',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan',
              })
            )
          } else {
            this.nikCLI.printPanel(
              boxen([`VM Agent error: ${response.error}`, '', 'Try /vm-dashboard to check VM health'].join('\n'), {
                title: 'VM Agent Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
          }
        } else {
          this.nikCLI.printPanel(
            boxen(
              ['❌ VM Bridge not initialized', '', 'VM communication system requires proper initialization'].join('\n'),
              {
                title: 'VM Bridge Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              }
            )
          )
        }

        // Show quick VM info
        advancedUI.logFunctionUpdate('info', chalk.cyan(''))
        console.log(
          chalk.cyan(
            `📊 VM Info: ${selectedVM.containerId.slice(0, 12)} | Repository: ${selectedVM.repositoryUrl || 'N/A'}`
          )
        )

        // Show bridge statistics
        if (vmOrchestrator.getBridgeStats) {
          const stats = vmOrchestrator.getBridgeStats()
          advancedUI.logFunctionUpdate(
            'info',
            chalk.gray(
              ` Bridge Stats: ${stats.totalMessagesRouted} messages | ${Math.round(stats.averageResponseTime)}ms avg`
            )
          )
        }
      } catch (error: any) {
        advancedUI.logFunctionUpdate('error', `VM communication error: ${error.message}`)
      }
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `VM Mode error: ${error.message}`)
      advancedUI.logFunctionUpdate('info', 'Use /default to exit VM mode')
      advancedUI.logFunctionUpdate('info', 'Use /vm-switch to select different VM')
    }
    // VM mode output complete - prompt render handled by caller
  }
}
