import chalk from 'chalk'
import boxen from 'boxen'

/**
 * GitPanels - Handles git command panels
 * Extracted from lines 15089-15466 in nik-cli.ts
 */
export class GitPanels {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async showCommitHistoryPanel(args: string[]): Promise<void> {
    try {
      // Parse arguments for options like --count, --oneline, --graph, etc.
      const options = this.parseCommitHistoryArgs(args)

      console.log(chalk.blue('📋 Loading commit history...'))

      // Get commit history using git log
      const gitCommand = this.buildGitLogCommand(options)
      const { exec } = require('node:child_process')
      const { promisify } = require('node:util')
      const execAsync = promisify(exec)

      const { stdout, stderr } = await execAsync(gitCommand)

      if (stderr && !stderr.includes('warning')) {
        console.log(chalk.red(`❌ Git error: ${stderr}`))
        return
      }

      // Format the commit history for display
      const formattedHistory = this.formatCommitHistory(stdout, options)

      // Display directly in console with boxen (like /tokens command)
      const historyBox = boxen(formattedHistory, {
        title: 'Git Commit History',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'magenta',
      })

      this.nikCLI.printPanel(historyBox, 'general')
    } catch (error: any) {
      if (error.message.includes('not a git repository')) {
        console.log(chalk.yellow('⚠️  This directory is not a git repository'))
      } else {
        console.log(chalk.red(`❌ Failed to get commit history: ${error.message}`))
      }
    }
  }

  parseCommitHistoryArgs(args: string[]): any {
    const options = {
      count: 20,
      oneline: false,
      graph: false,
      all: false,
      author: null as string | null,
      since: null as string | null,
      until: null as string | null,
    }

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      switch (arg) {
        case '--count':
        case '-n':
          options.count = parseInt(args[i + 1], 10) || 20
          i++ // skip next arg
          break
        case '--oneline':
          options.oneline = true
          break
        case '--graph':
          options.graph = true
          break
        case '--all':
          options.all = true
          break
        case '--author':
          options.author = args[i + 1]
          i++ // skip next arg
          break
        case '--since':
          options.since = args[i + 1]
          i++ // skip next arg
          break
        case '--until':
          options.until = args[i + 1]
          i++ // skip next arg
          break
      }
    }

    return options
  }

  buildGitLogCommand(options: any): string {
    let command = 'git log'

    if (options.oneline) {
      command += ' --oneline'
    } else {
      command += ' --pretty=format:"%C(yellow)%h%C(reset) - %C(green)%ad%C(reset) %C(blue)(%an)%C(reset)%n  %s%n"'
      command += ' --date=relative'
    }

    if (options.graph) {
      command += ' --graph'
    }

    if (options.all) {
      command += ' --all'
    }

    if (options.author) {
      command += ` --author="${options.author}"`
    }

    if (options.since) {
      command += ` --since="${options.since}"`
    }

    if (options.until) {
      command += ` --until="${options.until}"`
    }

    command += ` -${options.count}`

    return command
  }

  formatCommitHistory(stdout: string, options: any): string {
    if (!stdout.trim()) {
      return chalk.yellow('No commits found')
    }

    // If oneline format, each line is already formatted
    if (options.oneline) {
      return stdout.trim()
    }

    // For detailed format, add some styling
    let formatted = stdout.trim()

    // Add separator between commits for better readability
    formatted = formatted.replace(/\n\n/g, `\n${chalk.gray('─'.repeat(50))}\n\n`)

    return formatted
  }
}
