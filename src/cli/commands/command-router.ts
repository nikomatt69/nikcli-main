import chalk from 'chalk'
import boxen from 'boxen'
import { advancedUI } from '../ui/advanced-cli-ui'
import { handleBrowserCommand, handleBrowserStatus, handleBrowserExit, handleBrowserScreenshot, handleBrowserInfo } from '../chat/nik-cli-commands'

export class CommandRouter {
  private nikCLI: any // Reference to main NikCLI instance

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async dispatchSlash(command: string): Promise<void> {
    const parts = command.slice(1).split(' ')
    const cmd = parts[0]
    const args = parts.slice(1)

    try {
      switch (cmd) {
        case 'plan':
          if (args.length === 0) {
            this.nikCLI.currentMode = 'plan'
            advancedUI.logFunctionUpdate('info', chalk.green('✓ Switched to plan mode'))
            advancedUI.logFunctionUpdate(
              'info',
              chalk.dim('   Plan mode: Creates detailed plans and asks for approval before execution')
            )
            advancedUI.logFunctionUpdate(
              'info',
              chalk.dim('   Default mode: Auto-generates todos for complex tasks and executes in background')
            )
          } else {
            await this.nikCLI.generatePlan(args.join(' '), {})
          }
          break

        case 'default':
          this.nikCLI.currentMode = 'default'
          advancedUI.logFunctionUpdate('info', chalk.green('✓ Switched to default mode'))
          advancedUI.logFunctionUpdate(
            'info',
            chalk.dim('   Default mode: Auto-generates todos for complex tasks and executes in background')
          )
          break

        case 'vm':
          this.nikCLI.currentMode = 'vm'
          advancedUI.logFunctionUpdate('info', chalk.green('✓ Switched to VM mode'))
          advancedUI.logFunctionUpdate(
            'info',
            chalk.dim('   VM mode: Creates detailed plans and asks for approval before execution')
          )
          break

        // File Operations
        case 'read':
          await this.nikCLI.handleFileOperations('read', args)
          break
        case 'write':
          await this.nikCLI.handleFileOperations('write', args)
          break
        case 'edit':
          await this.nikCLI.handleFileOperations('edit', args)
          break
        case 'ls':
          await this.nikCLI.handleFileOperations('ls', args)
          break
        case 'search':
        case 'grep':
          await this.nikCLI.handleFileOperations('search', args)
          break

        // Terminal Operations
        case 'run':
        case 'sh':
        case 'bash':
          await this.nikCLI.handleTerminalOperations('run', args)
          break
        case 'install':
          await this.nikCLI.handleTerminalOperations('install', args)
          break
        case 'npm':
          await this.nikCLI.handleTerminalOperations('npm', args)
          break
        case 'yarn':
          await this.nikCLI.handleTerminalOperations('yarn', args)
          break
        case 'git':
          if (args.length === 0) {
            this.nikCLI.printPanel(
              boxen('Usage: /git <args>', {
                title: 'Git Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            return
          }
          await this.nikCLI.runCommand(`git ${args.join(' ')}`)
          break

        case 'docker':
          if (args.length === 0) {
            this.nikCLI.printPanel(
              boxen('Usage: /docker <args>', {
                title: 'Docker Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            return
          }
          await this.nikCLI.runCommand(`docker ${args.join(' ')}`)
          break

        // Snapshot Management
        case 'snapshot':
          await this.nikCLI.handleSnapshotCommand(args)
          break
        case 'snap':
          await this.nikCLI.handleSnapshotCommand(args, true)
          break
        case 'restore':
          await this.nikCLI.handleSnapshotRestore(args)
          break
        case 'snapshots':
          await this.nikCLI.handleSnapshotsList(args)
          break

        case 'ps':
          await this.nikCLI.handleTerminalOperations('ps', args)
          break

        case 'kill':
          await this.nikCLI.handleTerminalOperations('kill', args)
          break

        // Project Operations
        case 'build':
          await this.nikCLI.runCommand('npm run build')
          break

        case 'test': {
          const testPattern = args.length > 0 ? ` ${args.join(' ')}` : ''
          await this.nikCLI.runCommand(`npm test${testPattern}`)
          break
        }

        case 'lint':
          await this.nikCLI.runCommand('npm run lint')
          break

        case 'create': {
          if (args.length < 2) {
            this.nikCLI.printPanel(
              boxen('Usage: /create <type> <name>', {
                title: 'Create Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            return
          }
          const [type, name] = args
          advancedUI.logFunctionUpdate('info', chalk.blue(`Creating ${type}: ${name}`))
          // Implement creation logic based on type
          break
        }

        // Session Management
        case 'new':
        case 'sessions':
        case 'export':
        case 'stats':
        case 'history':
        case 'debug':
        case 'temp':
        case 'system':
          await this.nikCLI.handleSessionManagement(cmd, args)
          break

        // Model and Config
        case 'model':
        case 'models':
        case 'set-key':
        case 'config':
          await this.nikCLI.handleModelConfig(cmd, args)
          break

        case 'set-coin-keys': {
          await this.nikCLI.interactiveSetCoinbaseKeys()
          break
        }

        case 'set-key-bb': {
          await this.nikCLI.interactiveSetBrowserbaseKeys()
          break
        }

        case 'set-key-figma': {
          await this.nikCLI.interactiveSetFigmaKeys()
          break
        }

        case 'set-key-redis': {
          await this.nikCLI.interactiveSetRedisKeys()
          break
        }

        case 'set-nikdrive-end': {
          await this.nikCLI.setNikDriveEndpoint(args)
          break
        }

        case 'set-vector-key': {
          await this.nikCLI.interactiveSetVectorKeys()
          break
        }

        case 'redis-enable': {
          await this.nikCLI.manageRedisCache('enable')
          break
        }

        case 'redis-disable': {
          await this.nikCLI.manageRedisCache('disable')
          break
        }

        case 'redis-status': {
          await this.nikCLI.manageRedisCache('status')
          break
        }

        case 'browse': {
          await this.nikCLI.handleBrowseCommand(args)
          break
        }

        case 'web-analyze': {
          await this.nikCLI.handleWebAnalyzeCommand(args)
          break
        }

        // MCP Commands
        case 'mcp':
          await this.nikCLI.handleMcpCommands(args)
          break

        // Session Management
        case 'tokens':
          await this.nikCLI.showTokenUsage()
          break

        case 'cache':
          await this.nikCLI.manageTokenCache(args[0])
          break

        case 'config':
          await this.nikCLI.manageConfig({ show: true })
          break

        case 'status':
          await this.nikCLI.showStatus()
          break

        case 'compact':
          await this.nikCLI.compactSession()
          break

        case 'cost':
          await this.nikCLI.showCost()
          break

        case 'init':
          await this.nikCLI.handleInitProject(args.includes('--force'))
          break

        case 'models':
          await this.nikCLI.showModelsPanel()
          break

        // Advanced Features
        case 'agents':
        case 'agent':
        case 'parallel':
        case 'factory':
        case 'blueprints':
        case 'create-agent':
        case 'launch-agent':
        case 'context':
        case 'stream':
        case 'approval':
        case 'todo':
        case 'todos':
          await this.nikCLI.handleAdvancedFeatures(cmd, args)
          break

        // Documentation Commands
        case 'docs':
          await this.nikCLI.handleDocsCommand(args)
          break
        case 'doc-search':
          await this.nikCLI.handleDocSearchCommand(args)
          break
        case 'doc-add':
          await this.nikCLI.handleDocAddCommand(args)
          break
        case 'doc-stats':
          await this.nikCLI.handleDocStatsCommand(args)
          break
        case 'doc-list':
          await this.nikCLI.handleDocListCommand(args)
          break
        case 'doc-tag':
          await this.nikCLI.handleDocTagCommand(args)
          break
        case 'doc-sync':
          await this.nikCLI.handleDocSyncCommand(args)
          break
        case 'doc-load':
          await this.nikCLI.handleDocLoadCommand(args)
          break
        case 'doc-context':
          await this.nikCLI.handleDocContextCommand(args)
          break
        case 'doc-unload':
          await this.nikCLI.handleDocUnloadCommand(args)
          break
        case 'doc-suggest':
          await this.nikCLI.handleDocSuggestCommand(args)
          break

        // Memory (panelized)
        case 'memory':
          await this.nikCLI.handleMemoryPanels(args)
          break

        // Enhanced Services Commands
        case 'redis':
        case 'cache-stats':
        case 'cache-health':
        case 'cache-clear':
          await this.nikCLI.handleCacheCommands(cmd, args)
          break

        case 'profile':
          await this.nikCLI.showAuthProfile()
          break

        case 'signin':
        case 'login':
          await this.nikCLI.handleAuthSignIn()
          break

        case 'signup':
        case 'register':
          await this.nikCLI.handleAuthSignUp()
          break

        case 'supabase':
        case 'db':
        case 'auth':
        case 'session-sync':
          await this.nikCLI.handleSupabaseCommands(cmd, args)
          break

        case 'enhanced-stats':
          await this.nikCLI.showEnhancedStats()
          break

        // Git Operations
        case 'commits':
        case 'git-history':
          await this.nikCLI.showCommitHistoryPanel(args)
          break

        // IDE Diagnostics (panelized like commits)
        case 'diagnostic':
        case 'diag':
          await this.nikCLI.handleDiagnosticPanels(args)
          break
        case 'monitor':
          await this.nikCLI.handleDiagnosticPanels(['start', ...args])
          break
        case 'diag-status':
          await this.nikCLI.handleDiagnosticPanels(['status'])
          break

        // Security & Modes (panelized)
        case 'security':
          await this.nikCLI.handleSecurityPanels(args)
          break
        case 'dev-mode':
          await this.nikCLI.handleDevModePanels(args)
          break
        case 'safe-mode':
          await this.nikCLI.handleSafeModePanel()
          break
        case 'clear-approvals':
          await this.nikCLI.handleClearApprovalsPanel()
          break

        // Style Commands
        case 'style':
        case 'styles':
          await this.nikCLI.handleStyleCommands(cmd, args)
          break

        // CAD & Manufacturing Commands
        case 'cad':
        case 'gcode':
          await this.nikCLI.handleCADCommands(cmd, args)
          break

        // Figma Integration Commands
        case 'figma-config':
        case 'figma-info':
        case 'figma-export':
        case 'figma-to-code':
        case 'figma-create':
        case 'figma-tokens':
          await this.nikCLI.handleFigmaCommands(cmd, args)
          break

        // Parallel execution monitoring commands
        case 'parallel-logs':
          await this.nikCLI.showParallelLogs()
          break
        case 'parallel-status':
          await this.nikCLI.showParallelStatus()
          break

        // Help and Exit
        case 'help':
          this.nikCLI.showSlashHelp()
          break
        case 'queue':
          this.nikCLI.handleQueueCommand(args)
          break
        case 'ssh':
          await this.nikCLI.handleSSHCommand(args)
          break
        case 'tokens':
          await this.nikCLI.manageTokenCommands(args)
          break
        case 'clear':
          await this.nikCLI.clearSession()
          break
        case 'exit':
        case 'quit':
          await this.nikCLI.shutdown()
          return

        // Work Session Management
        case 'resume':
          await this.nikCLI.handleResumeCommand(args)
          break
        case 'work-sessions':
          await this.nikCLI.handleWorkSessionsList()
          break
        case 'save-session':
          await this.nikCLI.handleSaveSessionCommand(args)
          break
        case 'delete-session':
          await this.nikCLI.handleDeleteSessionCommand(args)
          break
        case 'export-session':
          await this.nikCLI.handleExportSessionCommand(args)
          break

        // Edit History (Undo/Redo)
        case 'undo':
          await this.nikCLI.handleUndoCommand(args)
          break
        case 'redo':
          await this.nikCLI.handleRedoCommand(args)
          break
        case 'edit-history':
          await this.nikCLI.handleEditHistoryCommand()
          break

        // VM Container Detailed Commands
        case 'vm-create':
        case 'vm-list':
        case 'vm-stop':
        case 'vm-remove':
        case 'vm-connect':
        case 'vm-create-pr':
        case 'vm-logs':
        case 'vm-mode':
        case 'vm-switch':
        case 'vm-dashboard':
        case 'vm-select':
        case 'vm-status':
        case 'vm-exec':
        case 'vm-ls':
        case 'vm-broadcast':
        case 'vm-health':
        case 'vm-backup':
        case 'vm-stats':
          await this.nikCLI.handleVMContainerCommands(cmd, args)
          break

        // Browser Mode Commands
        case 'browser':
          await handleBrowserCommand(args)
          break
        case 'browser-status':
          await handleBrowserStatus()
          break
        case 'browser-exit':
          await handleBrowserExit()
          break
        case 'browser-screenshot':
          await handleBrowserScreenshot()
          break
        case 'browser-info':
          await handleBrowserInfo()
          break

        // Vision & Image Commands
        case 'analyze-image':
        case 'vision':
        case 'generate-image':
        case 'images':
        case 'create-image':
          await this.nikCLI.handleVisionCommands(cmd, args)
          break

        // Memory Commands
        case 'remember':
        case 'recall':
        case 'forget':
          await this.nikCLI.handleMemoryCommands(cmd, args)
          break

        // Blueprint Commands
        case 'blueprint':
        case 'delete-blueprint':
        case 'export-blueprint':
        case 'import-blueprint':
        case 'search-blueprints': {
          const result = await this.nikCLI.slashHandler.handle(`/${cmd} ${args.join(' ')}`)
          if (result.shouldExit) {
            await this.nikCLI.shutdown()
            return
          }
          break
        }

        // Web3 Commands
        case 'web3':
        case 'blockchain':
          await this.nikCLI.handleWeb3Commands(cmd, args)
          break

        // GOAT SDK Commands
        case 'goat':
        case 'defi':
          await this.nikCLI.handleGoatCommands(cmd, args)
          break
        case 'polymarket':
          await this.nikCLI.handlePolymarketCommands(cmd, args)
          break
        case 'nikdrive':
        case 'cloud':
          await this.nikCLI.handleNikDriveCommands(cmd, args)
          break
        case 'web3-toolchain':
        case 'w3-toolchain':
          await this.nikCLI.handleWeb3ToolchainCommands(cmd, args)
          break
        case 'defi-toolchain':
          await this.nikCLI.handleDefiToolchainCommands(cmd, args)
          break

        // Miscellaneous Commands
        case 'env':
          await this.nikCLI.handleEnvCommand(args)
          break
        case 'auto':
          await this.nikCLI.handleAutoCommand(args)
          break
        case 'super-compact':
          await this.nikCLI.handleSuperCompactCommand()
          break
        case 'plan-clean':
          await this.nikCLI.handlePlanCleanCommand()
          break
        case 'todo-hide':
          await this.nikCLI.handleTodoHideCommand()
          break
        case 'todo-show':
          await this.nikCLI.handleTodoShowCommand()
          break
        case 'index':
          await this.nikCLI.handleIndexCommand(args)
          break
        case 'router':
          await this.nikCLI.handleRouterCommand(args)
          break
        case 'figma-open':
          await this.nikCLI.handleFigmaOpenCommand(args)
          break

        default: {
          const result = await this.nikCLI.slashHandler.handle(command)
          if (result.shouldExit) {
            await this.nikCLI.shutdown()
            return
          }
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`Error executing ${command}: ${error.message}`))
    }

    // Ensure output is flushed and visible before showing prompt
    console.log() // Extra newline for better separation
    this.nikCLI.renderPromptAfterOutput()
  }

  /**
   * Dispatch @agent commands through the unified command router
   */
  async dispatchAt(input: string): Promise<void> {
    const result = await this.nikCLI.slashHandler.handle(input)
    if (result.shouldExit) {
      await this.nikCLI.shutdown()
      return
    }

    // Ensure output is flushed and visible before showing prompt
    console.log() // Extra newline for better separation
    this.nikCLI.renderPromptAfterOutput()
  }
}
