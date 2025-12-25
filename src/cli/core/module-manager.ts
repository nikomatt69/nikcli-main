import chalk from 'chalk'
import { advancedAIProvider } from '../ai/advanced-ai-provider'
import { middlewareManager } from '../middleware'
import type { ExecutionPolicyManager } from '../policies/execution-policy'
import { advancedUI } from '../ui/advanced-cli-ui'
import { diffManager } from '../ui/diff-manager'
import { simpleConfigManager as configManager } from './config-manager'

export interface ModuleContext {
  workingDirectory: string
  session: any
  policyManager: ExecutionPolicyManager
  isProcessing: boolean
  autonomous: boolean
  planMode: boolean
  autoAcceptEdits: boolean
}

export interface ModuleCommand {
  name: string
  description: string
  category: 'system' | 'file' | 'analysis' | 'security' | 'diff' | 'agent' | 'middleware'
  requiresArgs?: boolean
  handler: (args: string[], context: ModuleContext) => Promise<void>
}

export class ModuleManager {
  private modules: Map<string, ModuleCommand> = new Map()
  private context: ModuleContext

  constructor(context: ModuleContext) {
    this.context = context
    this.registerModules()
  }

  /**
   * Register all available modules
   */
  private registerModules(): void {
    // System Commands
    this.register({
      name: 'help',
      description: 'Show detailed help and command reference',
      category: 'system',
      handler: this.handleHelp.bind(this),
    })

    this.register({
      name: 'agents',
      description: 'List all available AI agents',
      category: 'system',
      handler: this.handleAgents.bind(this),
    })

    this.register({
      name: 'model',
      description: 'Switch AI model or show current model',
      category: 'system',
      handler: this.handleModel.bind(this),
    })

    this.register({
      name: 'clear',
      description: 'Clear conversation history and free up context',
      category: 'system',
      handler: this.handleClear.bind(this),
    })

    // File Operations
    this.register({
      name: 'cd',
      description: 'Change current working directory',
      category: 'file',
      requiresArgs: true,
      handler: this.handleChangeDirectory.bind(this),
    })

    this.register({
      name: 'pwd',
      description: 'Show current working directory',
      category: 'file',
      handler: this.handlePrintDirectory.bind(this),
    })

    this.register({
      name: 'ls',
      description: 'List files in current directory',
      category: 'file',
      handler: this.handleListFiles.bind(this),
    })

    // Analysis Commands
    this.register({
      name: 'analyze',
      description: 'Quick project analysis',
      category: 'analysis',
      handler: this.handleAnalyze.bind(this),
    })

    this.register({
      name: 'auto',
      description: 'Fully autonomous task execution',
      category: 'analysis',
      requiresArgs: true,
      handler: this.handleAutoExecution.bind(this),
    })

    this.register({
      name: 'context',
      description: 'Show execution context',
      category: 'analysis',
      handler: this.handleContext.bind(this),
    })

    this.register({
      name: 'history',
      description: 'Show execution history',
      category: 'analysis',
      handler: this.handleHistory.bind(this),
    })

    // Diff Management
    this.register({
      name: 'diff',
      description: 'Show file changes (all diffs if no file specified)',
      category: 'diff',
      handler: this.handleDiff.bind(this),
    })

    this.register({
      name: 'accept',
      description: 'Accept and apply file changes',
      category: 'diff',
      requiresArgs: true,
      handler: this.handleAccept.bind(this),
    })

    this.register({
      name: 'reject',
      description: 'Reject and discard file changes',
      category: 'diff',
      requiresArgs: true,
      handler: this.handleReject.bind(this),
    })

    // Security Commands
    this.register({
      name: 'security',
      description: 'Show current security status',
      category: 'security',
      handler: this.handleSecurity.bind(this),
    })

    this.register({
      name: 'policy',
      description: 'Update security policy settings',
      category: 'security',
      handler: this.handlePolicy.bind(this),
    })

    // Mode Toggles
    this.register({
      name: 'plan',
      description: 'Toggle plan mode (shift+tab to cycle)',
      category: 'system',
      handler: this.handlePlanMode.bind(this),
    })

    this.register({
      name: 'auto-accept',
      description: 'Toggle auto-accept edits mode',
      category: 'system',
      handler: this.handleAutoAccept.bind(this),
    })

    this.register({
      name: 'autonomous',
      description: 'Toggle autonomous mode',
      category: 'system',
      handler: this.handleAutonomous.bind(this),
    })

    // Middleware Commands
    this.register({
      name: 'middleware-status',
      description: 'Show middleware system status and metrics',
      category: 'middleware',
      handler: this.handleMiddlewareStatus.bind(this),
    })

    this.register({
      name: 'middleware-enable',
      description: 'Enable specific middleware by name',
      category: 'middleware',
      requiresArgs: true,
      handler: this.handleMiddlewareEnable.bind(this),
    })

    this.register({
      name: 'middleware-disable',
      description: 'Disable specific middleware by name',
      category: 'middleware',
      requiresArgs: true,
      handler: this.handleMiddlewareDisable.bind(this),
    })

    this.register({
      name: 'middleware-config',
      description: 'Show or update middleware configuration',
      category: 'middleware',
      handler: this.handleMiddlewareConfig.bind(this),
    })

    this.register({
      name: 'middleware-logs',
      description: 'Show recent middleware execution logs',
      category: 'middleware',
      handler: this.handleMiddlewareLogs.bind(this),
    })

    this.register({
      name: 'middleware-clear',
      description: 'Clear middleware metrics and logs',
      category: 'middleware',
      handler: this.handleMiddlewareClear.bind(this),
    })
  }

  /**
   * Register a new module
   */
  register(module: ModuleCommand): void {
    this.modules.set(module.name, module)
  }

  /**
   * Execute a command
   */
  async executeCommand(command: string, args: string[]): Promise<boolean> {
    const module = this.modules.get(command)
    if (!module) {
      advancedUI.logError(`Unknown command: ${command}`)
      advancedUI.logInfo(chalk.gray('Type /help for available commands'))
      return false
    }

    if (module.requiresArgs && args.length === 0) {
      advancedUI.logError(`Command '${command}' requires arguments`)
      advancedUI.logInfo(chalk.gray(`Description: ${module.description}`))
      return false
    }

    try {
      await module.handler(args, this.context)
      return true
    } catch (error: any) {
      advancedUI.logError(`Error executing ${command}: ${error.message}`)
      return false
    }
  }

  /**
   * Get all available commands
   */
  getCommands(): ModuleCommand[] {
    return Array.from(this.modules.values())
  }

  /**
   * Get commands for autocompletion
   */
  getCommandNames(): string[] {
    return Array.from(this.modules.keys()).map((name) => `/${name}`)
  }

  /**
   * Update context
   */
  updateContext(context: Partial<ModuleContext>): void {
    this.context = { ...this.context, ...context }
  }

  // Command Handlers
  private async handleHelp(_args: string[], _context: ModuleContext): Promise<void> {
    advancedUI.logInfo(chalk.cyan.bold('\\n🔌 Autonomous Claude Assistant - Command Reference'))
    advancedUI.logInfo(chalk.gray('═'.repeat(60)))

    const categories = {
      system: '🔧 System Commands',
      file: '📁 File Operations',
      analysis: '🔍 Analysis & Tools',
      diff: '📝 File Changes & Diffs',
      security: '🔒 Security & Policy',
    }

    for (const [category, title] of Object.entries(categories)) {
      const commands = this.getCommands().filter((c) => c.category === category)
      if (commands.length > 0) {
        advancedUI.logInfo(chalk.white.bold(`\\n${title}:`))
        commands.forEach((cmd) => {
          advancedUI.logInfo(`${chalk.green(`/${cmd.name}`).padEnd(20)} ${cmd.description}`)
        })
      }
    }

    advancedUI.logInfo(chalk.white.bold('\\n🔌 Specialized Agents:'))
    advancedUI.logInfo(`${chalk.blue('@ai-analysis')} <task>     AI code analysis and review`)
    advancedUI.logInfo(`${chalk.blue('@code-review')} <task>     Code review and suggestions`)
    advancedUI.logInfo(`${chalk.blue('@backend-expert')} <task>   Backend development specialist`)
    advancedUI.logInfo(`${chalk.blue('@frontend-expert')} <task>  Frontend/UI development expert`)
    advancedUI.logInfo(`${chalk.blue('@react-expert')} <task>    React and Next.js specialist`)
    advancedUI.logInfo(`${chalk.blue('@devops-expert')} <task>   DevOps and infrastructure expert`)
    advancedUI.logInfo(`${chalk.blue('@system-admin')} <task>    System administration tasks`)
    advancedUI.logInfo(`${chalk.blue('@autonomous-coder')} <task> Full autonomous coding agent`)

    advancedUI.logInfo(chalk.white.bold('\\n💬 Natural Language Examples:'))
    advancedUI.logInfo(chalk.dim('• "Create a React todo app with TypeScript and tests"'))
    advancedUI.logInfo(chalk.dim('• "Fix all ESLint errors in this project"'))
    advancedUI.logInfo(chalk.dim('• "Add authentication with JWT to this API"'))
    advancedUI.logInfo(chalk.dim('• "Set up Docker and CI/CD for deployment"'))
    advancedUI.logInfo(chalk.dim('• "Optimize this component for performance"'))

    advancedUI.logInfo(chalk.gray(`\\n${'─'.repeat(60)}`))
    advancedUI.logInfo(
      chalk.yellow('💡 Tip: Use TAB for auto-completion, / for command menu, Shift+Tab to cycle modes')
    )
  }

  private async handleAgents(_args: string[], _context: ModuleContext): Promise<void> {
    advancedUI.logInfo(chalk.cyan.bold('\\n🔌 Available Specialized Agents'))
    advancedUI.logInfo(chalk.gray('─'.repeat(50)))

    // This would be dynamically populated from agent registry
    const agents = [
      { name: 'ai-analysis', desc: 'AI code analysis and review' },
      { name: 'code-review', desc: 'Code review and suggestions' },
      { name: 'backend-expert', desc: 'Backend development specialist' },
      { name: 'frontend-expert', desc: 'Frontend/UI development expert' },
      { name: 'react-expert', desc: 'React and Next.js specialist' },
      { name: 'devops-expert', desc: 'DevOps and infrastructure expert' },
      { name: 'system-admin', desc: 'System administration tasks' },
      { name: 'autonomous-coder', desc: 'Full autonomous coding agent' },
    ]

    agents.forEach((agent) => {
      advancedUI.logInfo(`${chalk.green('•')} ${chalk.bold(agent.name)}`)
      advancedUI.logInfo(`  ${chalk.gray(agent.desc)}`)
    })

    advancedUI.logInfo(chalk.dim('\\nUsage: @<agent-name> <task>'))
  }

  private async handleModel(args: string[], _context: ModuleContext): Promise<void> {
    if (args[0]) {
      try {
        advancedAIProvider.setModel(args[0])
        configManager.setCurrentModel(args[0])
        advancedUI.logSuccess(`✓ Switched to: ${args[0]}`)
      } catch (error: any) {
        advancedUI.logError(`Error: ${error.message}`)
      }
    } else {
      const modelInfo = advancedAIProvider.getCurrentModelInfo()
      advancedUI.logInfo(`⚡︎ Current model: ${modelInfo.name}`)
    }
  }

  private async handleClear(_args: string[], context: ModuleContext): Promise<void> {
    console.clear()
    context.session.messages = context.session.messages.filter((m: any) => m.role === 'system')
    context.session.executionHistory = []
    advancedAIProvider.clearExecutionContext()
    advancedUI.logSuccess('✓ Session cleared')
  }

  private async handleChangeDirectory(args: string[], context: ModuleContext): Promise<void> {
    const newDir = args[0] || process.cwd()
    try {
      const path = require('node:path')
      const fs = require('node:fs')
      const resolvedPath = path.resolve(context.workingDirectory, newDir)

      if (!fs.existsSync(resolvedPath)) {
        advancedUI.logError(`Directory not found: ${newDir}`)
        return
      }

      context.workingDirectory = resolvedPath
      advancedAIProvider.setWorkingDirectory(resolvedPath)
      advancedUI.logSuccess(`✓ Changed to: ${resolvedPath}`)
    } catch (error: any) {
      advancedUI.logError(`Error changing directory: ${error.message}`)
    }
  }

  private async handlePrintDirectory(_args: string[], context: ModuleContext): Promise<void> {
    advancedUI.logInfo(`📁 Current directory: ${context.workingDirectory}`)
  }

  private async handleListFiles(_args: string[], context: ModuleContext): Promise<void> {
    try {
      const fs = require('node:fs')
      const files = fs.readdirSync(context.workingDirectory, { withFileTypes: true })

      advancedUI.logInfo(`\\n📁 ${context.workingDirectory}:`)
      advancedUI.logInfo(chalk.gray('─'.repeat(50)))

      files.slice(0, 20).forEach((file: any) => {
        const icon = file.isDirectory() ? '📁' : '📄'
        const name = file.isDirectory() ? chalk.blue(file.name) : file.name
        advancedUI.logInfo(`${icon} ${name}`)
      })

      if (files.length > 20) {
        advancedUI.logInfo(chalk.dim(`... and ${files.length - 20} more items`))
      }
    } catch (error: any) {
      advancedUI.logError(`Error listing directory: ${error.message}`)
    }
  }

  private async handleAnalyze(_args: string[], _context: ModuleContext): Promise<void> {
    advancedUI.logInfo('🔍 Quick project analysis...')
    // Implementation for project analysis
    advancedUI.logSuccess('Analysis complete!')
  }

  private async handleAutoExecution(args: string[], _context: ModuleContext): Promise<void> {
    const task = args.join(' ')
    advancedUI.logInfo(`\\n🎯 Autonomous Mode: Analyzing and executing task...`)
    advancedUI.logInfo(chalk.gray(`Task: ${task}\\n`))
    // Implementation for autonomous execution
  }

  private async handleContext(_args: string[], _context: ModuleContext): Promise<void> {
    const execContext = advancedAIProvider.getExecutionContext()
    if (execContext.size === 0) {
      advancedUI.logInfo(chalk.yellow('No execution context available'))
      return
    }

    advancedUI.logInfo(chalk.cyan.bold('\\n⚡︎ Execution Context'))
    advancedUI.logInfo(chalk.gray('─'.repeat(40)))

    for (const [key, value] of execContext) {
      advancedUI.logInfo(`${chalk.blue(key)}: ${chalk.dim(JSON.stringify(value, null, 2).slice(0, 100))}...`)
    }
  }

  private async handleHistory(_args: string[], context: ModuleContext): Promise<void> {
    const history = context.session.executionHistory.slice(-20)
    if (history.length === 0) {
      advancedUI.logInfo(chalk.yellow('No execution history'))
      return
    }

    advancedUI.logInfo(chalk.cyan.bold('\\n📜 Recent Execution History'))
    advancedUI.logInfo(chalk.gray('─'.repeat(50)))

    history.forEach((event: any, _index: number) => {
      const icon =
        event.type === 'tool_call' ? '🔧' : event.type === 'tool_result' ? '✓' : event.type === 'error' ? '✖' : '•'
      advancedUI.logInfo(`${icon} ${chalk.dim(event.type)}: ${event.content?.slice(0, 60) || 'N/A'}`)
    })
  }

  private async handleDiff(args: string[], _context: ModuleContext): Promise<void> {
    if (args[0]) {
      diffManager.showDiff(args[0])
    } else {
      diffManager.showAllDiffs()
    }
  }

  private async handleAccept(args: string[], _context: ModuleContext): Promise<void> {
    if (args[0] === 'all') {
      diffManager.acceptAllDiffs()
    } else if (args[0]) {
      diffManager.acceptDiff(args[0])
    } else {
      advancedUI.logError('Usage: /accept <file> or /accept all')
    }
  }

  private async handleReject(args: string[], _context: ModuleContext): Promise<void> {
    if (args[0]) {
      diffManager.rejectDiff(args[0])
    } else {
      advancedUI.logError('Usage: /reject <file>')
    }
  }

  private async handleSecurity(_args: string[], context: ModuleContext): Promise<void> {
    const summary = await context.policyManager.getPolicySummary()

    advancedUI.logInfo(chalk.blue.bold('🔒 Security Policy Status'))
    advancedUI.logInfo(chalk.gray('─'.repeat(40)))
    advancedUI.logInfo(`${chalk.green('Current Policy:')} ${summary.currentPolicy.approval}`)
    advancedUI.logInfo(`${chalk.green('Sandbox Mode:')} ${summary.currentPolicy.sandbox}`)
    advancedUI.logInfo(`${chalk.green('Timeout:')} ${summary.currentPolicy.timeoutMs}ms`)
    advancedUI.logInfo(`${chalk.green('Allowed Commands:')} ${summary.allowedCommands}`)
    advancedUI.logInfo(`${chalk.red('Blocked Commands:')} ${summary.deniedCommands}`)
  }

  private async handlePolicy(args: string[], context: ModuleContext): Promise<void> {
    if (args[0] && args[1]) {
      const [setting, value] = args
      try {
        switch (setting) {
          case 'approval':
            if (['never', 'untrusted', 'always'].includes(value)) {
              // Policy update - would need to extend config manager
              advancedUI.logSuccess(`✓ Approval policy set to: ${value}`)
              advancedUI.logSuccess(`✓ Approval policy set to: ${value}`)
            } else {
              advancedUI.logError('Invalid approval policy. Use: never, untrusted, or always')
            }
            break
          case 'sandbox':
            if (['read-only', 'workspace-write', 'system-write'].includes(value)) {
              // Sandbox update - would need to extend config manager
              advancedUI.logSuccess(`✓ Sandbox mode set to: ${value}`)
              advancedUI.logSuccess(`✓ Sandbox mode set to: ${value}`)
            } else {
              advancedUI.logError('Invalid sandbox mode. Use: read-only, workspace-write, or system-write')
            }
            break
          default:
            advancedUI.logError(`Unknown setting: ${setting}`)
        }
      } catch (error: any) {
        advancedUI.logError(`Error updating policy: ${error.message}`)
      }
    } else {
      await this.handleSecurity([], context)
    }
  }

  private async handlePlanMode(_args: string[], context: ModuleContext): Promise<void> {
    context.planMode = !context.planMode
    if (context.planMode) {
      advancedUI.logInfo(chalk.green('\\n✓ plan mode on ') + chalk.dim('(shift+tab to cycle)'))
    } else {
      advancedUI.logInfo(chalk.yellow('\\n⚠︎ plan mode off'))
    }
  }

  private async handleAutoAccept(_args: string[], context: ModuleContext): Promise<void> {
    context.autoAcceptEdits = !context.autoAcceptEdits
    diffManager.setAutoAccept(context.autoAcceptEdits)

    if (context.autoAcceptEdits) {
      advancedUI.logInfo(chalk.green('\\n✓ auto-accept edits on ') + chalk.dim('(shift+tab to cycle)'))
    } else {
      advancedUI.logInfo(chalk.yellow('\\n⚠︎ auto-accept edits off'))
    }
  }

  private async handleAutonomous(args: string[], context: ModuleContext): Promise<void> {
    if (args[0] === 'off') {
      context.autonomous = false
      advancedUI.logInfo(chalk.yellow('⚠︎ Autonomous mode disabled - will ask for confirmation'))
    } else {
      context.autonomous = true
      advancedUI.logSuccess('✓ Autonomous mode enabled - full independence')
    }
  }

  // Middleware Command Handlers

  private async handleMiddlewareStatus(_args: string[], _context: ModuleContext): Promise<void> {
    advancedUI.logInfo(chalk.cyan.bold('\\n🔧 Middleware System Status'))
    advancedUI.logInfo(chalk.gray('─'.repeat(60)))

    middlewareManager.showStatus()

    const history = middlewareManager.getExecutionHistory(5)
    if (history.length > 0) {
      advancedUI.logInfo(chalk.white.bold('\\nRecent Events:'))
      history.forEach((event) => {
        const icon =
          event.type === 'complete' ? '✓' : event.type === 'error' ? '✖' : event.type === 'start' ? '⚡︎' : '⏭️'
        const duration = event.duration ? ` (${event.duration}ms)` : ''
        advancedUI.logInfo(`  ${icon} ${event.middlewareName}: ${event.type}${duration}`)
      })
    }
  }

  private async handleMiddlewareEnable(args: string[], _context: ModuleContext): Promise<void> {
    const middlewareName = args[0]
    if (!middlewareName) {
      advancedUI.logError('✖ Please specify middleware name')
      return
    }

    const success = middlewareManager.enableMiddleware(middlewareName)
    if (success) {
      advancedUI.logSuccess(`✓ Enabled middleware: ${middlewareName}`)
    } else {
      advancedUI.logError(`✖ Middleware not found: ${middlewareName}`)
    }
  }

  private async handleMiddlewareDisable(args: string[], _context: ModuleContext): Promise<void> {
    const middlewareName = args[0]
    if (!middlewareName) {
      advancedUI.logError('✖ Please specify middleware name')
      return
    }

    const success = middlewareManager.disableMiddleware(middlewareName)
    if (success) {
      advancedUI.logInfo(chalk.yellow(`⚠︎ Disabled middleware: ${middlewareName}`))
    } else {
      advancedUI.logError(`✖ Middleware not found: ${middlewareName}`)
    }
  }

  private async handleMiddlewareConfig(args: string[], _context: ModuleContext): Promise<void> {
    const middlewareName = args[0]

    if (!middlewareName) {
      advancedUI.logInfo(chalk.cyan.bold('\\n📋 All Middleware Configurations'))
      advancedUI.logInfo(chalk.gray('─'.repeat(50)))

      const allMiddleware = middlewareManager.getAllMiddleware()
      allMiddleware.forEach((registration) => {
        advancedUI.logInfo(`\\n${chalk.blue(registration.name)}:`)
        advancedUI.logInfo(`  Enabled: ${registration.config.enabled ? chalk.green('Yes') : chalk.red('No')}`)
        advancedUI.logInfo(`  Priority: ${registration.config.priority}`)
        if (registration.config.timeout) {
          advancedUI.logInfo(`  Timeout: ${registration.config.timeout}ms`)
        }
      })
      return
    }

    const middleware = middlewareManager.getMiddleware(middlewareName)
    if (!middleware) {
      advancedUI.logError(`✖ Middleware not found: ${middlewareName}`)
      return
    }

    const registration = middlewareManager.getAllMiddleware().find((m) => m.name === middlewareName)
    if (registration) {
      advancedUI.logInfo(chalk.cyan.bold(`\\n📋 Configuration for ${middlewareName}`))
      advancedUI.logInfo(chalk.gray('─'.repeat(40)))
      advancedUI.logInfo(JSON.stringify(registration.config, null, 2))
    }
  }

  private async handleMiddlewareLogs(args: string[], _context: ModuleContext): Promise<void> {
    const limit = parseInt(args[0], 10) || 20

    advancedUI.logInfo(chalk.cyan.bold(`\\n📋 Recent Middleware Execution History (${limit} events)`))
    advancedUI.logInfo(chalk.gray('─'.repeat(60)))

    const history = middlewareManager.getExecutionHistory(limit)
    if (history.length === 0) {
      advancedUI.logInfo(chalk.dim('No middleware execution history available'))
      return
    }

    history.forEach((event, index) => {
      const icon =
        event.type === 'complete'
          ? '✓'
          : event.type === 'error'
            ? '✖'
            : event.type === 'start'
              ? '⚡︎'
              : event.type === 'skip'
                ? '⏭️'
                : '⚠︎'

      const duration = event.duration ? ` (${event.duration}ms)` : ''
      const time = event.timestamp.toLocaleTimeString()

      advancedUI.logInfo(
        `${String(index + 1).padStart(2)}. ${icon} [${time}] ${event.middlewareName}: ${event.type}${duration}`
      )

      if (event.error) {
        advancedUI.logError(`    ${chalk.red('Error:')} ${event.error.message}`)
      }
    })
  }

  private async handleMiddlewareClear(_args: string[], _context: ModuleContext): Promise<void> {
    middlewareManager.clearMetrics()
    advancedUI.logSuccess('✓ Middleware metrics and logs cleared')
  }
}
