import boxen from 'boxen'
import chalk from 'chalk'

export interface NikCLIOptions {
  agent?: string
  model?: string
  auto?: boolean
  plan?: boolean
  structuredUI?: boolean
}

export interface TodoOptions {
  list?: boolean
  add?: string
  complete?: string
}

export interface PlanOptions {
  execute?: boolean
  save?: string
}

export interface AgentOptions {
  auto?: boolean
}

export interface AutoOptions {
  planFirst?: boolean
}

export interface ConfigOptions {
  show?: boolean
  model?: string
  key?: string
}

export interface InitOptions {
  force?: boolean
}

export interface CommandResult {
  shouldExit: boolean
  shouldUpdatePrompt: boolean
}

/**
 * Render a Pro/Free plan status panel for CLI usage
 */
export function renderProPanel(options: { tier: 'free' | 'pro' | 'enterprise'; hasKey?: boolean }): void {
  const tier = options.tier
  const hasKey = Boolean(options.hasKey)

  const statusLines: string[] = []
  statusLines.push(chalk.white('Current plan: ') + chalk.green(tier))
  statusLines.push('')

  if (tier === 'free') {
    statusLines.push(chalk.cyan('Free mode (BYOK):'))
    statusLines.push(chalk.gray('• Provide your own OpenRouter key'))
    statusLines.push(chalk.gray('• Configure with: /set-key openrouter <key>'))
    statusLines.push(chalk.gray('• Or set env OPENROUTER_API_KEY'))
  } else {
    statusLines.push(chalk.cyan('Pro mode (Managed):'))
    statusLines.push(chalk.gray('• NikCLI issues and manages your OpenRouter key'))
    statusLines.push(chalk.gray('• Key is fetched after login or via /pro activate'))
  }

  statusLines.push('')
  statusLines.push(chalk.white('Key status: ') + (hasKey ? chalk.green('present') : chalk.yellow('not configured')))

  const panel = boxen(statusLines.join('\n'), {
    padding: 1,
    borderStyle: 'round',
    borderColor: tier === 'free' ? 'cyan' : 'green',
    backgroundColor: tier === 'free' ? '#001a2a' : '#001a00',
    title: 'Plan Status',
  })

  console.log(panel)
}

export interface LiveUpdate {
  type: 'status' | 'progress' | 'log' | 'error' | 'warning' | 'info' | 'step' | 'result'
  content: string
  timestamp: Date
  source?: string
  metadata?: any
  stepId?: string
}

export interface StatusIndicator {
  id: string
  title: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'warning'
  details?: string
  progress?: number
  startTime?: Date
  endTime?: Date
  subItems?: StatusIndicator[]
}
