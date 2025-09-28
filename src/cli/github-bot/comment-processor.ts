// src/cli/github-bot/comment-processor.ts

import type { CommandParseResult, NikCLICommand, NikCLIMention } from './types'

/**
 * Processes GitHub comments to extract @nikcli mentions and parse commands
 */
export class CommentProcessor {
  private readonly mentionRegex = /@nikcli\s+([^\n\r]*)/gi
  private readonly fileRegex = /`([^`]+\.(ts|js|tsx|jsx|py|rs|go|java|cpp|c|h|css|html|json|yaml|yml|md|txt))`/gi
  private readonly lineNumberRegex = /(?:line|L)(\d+)/gi
  private readonly codeBlockRegex = /```[\s\S]*?```/g

  /**
   * Extract @nikcli mention from comment text
   */
  extractNikCLIMention(commentText: string): NikCLIMention | null {
    const matches = Array.from(commentText.matchAll(this.mentionRegex))

    if (matches.length === 0) {
      return null
    }

    // Use the first @nikcli mention found
    const match = matches[0]
    const commandText = match[1].trim()

    if (!commandText) {
      return null
    }

    // Parse command and arguments
    const args = this.parseCommandArgs(commandText)
    const command = args[0]?.toLowerCase() || ''

    // Extract context from full comment
    const context = this.extractContext(commentText)

    return {
      command,
      fullText: commentText,
      args: args.slice(1), // Remove command from args
      context,
    }
  }

  /**
   * Parse command line arguments from command text
   */
  private parseCommandArgs(commandText: string): string[] {
    const args: string[] = []
    let current = ''
    let inQuotes = false
    let quoteChar = ''

    for (let i = 0; i < commandText.length; i++) {
      const char = commandText[i]

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true
        quoteChar = char
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false
        quoteChar = ''
      } else if (char === ' ' && !inQuotes) {
        if (current.trim()) {
          args.push(current.trim())
          current = ''
        }
      } else {
        current += char
      }
    }

    if (current.trim()) {
      args.push(current.trim())
    }

    return args
  }

  /**
   * Extract context information from comment
   */
  private extractContext(commentText: string): { files?: string[]; lineNumbers?: number[]; codeBlocks?: string[] } {
    const context: { files?: string[]; lineNumbers?: number[]; codeBlocks?: string[] } = {}

    // Extract mentioned files
    const fileMatches = Array.from(commentText.matchAll(this.fileRegex))
    if (fileMatches.length > 0) {
      context.files = fileMatches.map((match) => match[1])
    }

    // Extract line numbers
    const lineMatches = Array.from(commentText.matchAll(this.lineNumberRegex))
    if (lineMatches.length > 0) {
      context.lineNumbers = lineMatches.map((match) => parseInt(match[1], 10)).filter((n) => !Number.isNaN(n))
    }

    // Extract code blocks
    const codeMatches = Array.from(commentText.matchAll(this.codeBlockRegex))
    if (codeMatches.length > 0) {
      context.codeBlocks = codeMatches.map((match) => match[0])
    }

    return context
  }

  /**
   * Parse structured command with validation
   */
  parseCommand(mention: NikCLIMention): CommandParseResult | null {
    const command = this.validateCommand(mention.command)
    if (!command) {
      return null
    }

    // Extract target from arguments or context
    let target: string | undefined
    let description = ''
    const options: any = {}

    // Parse arguments based on command type
    switch (command) {
      case 'fix':
        target = this.extractTarget(mention.args, mention.context)
        description = this.extractDescription(mention.args, 'Fix issues in')
        options.createTests = mention.args.includes('--tests')
        break

      case 'add':
        description = this.extractDescription(mention.args, 'Add new functionality')
        options.createTests = mention.args.includes('--tests')
        options.updateDocs = mention.args.includes('--docs')
        break

      case 'optimize':
        target = this.extractTarget(mention.args, mention.context)
        description = this.extractDescription(mention.args, 'Optimize performance')
        break

      case 'refactor':
        target = this.extractTarget(mention.args, mention.context)
        description = this.extractDescription(mention.args, 'Refactor code')
        options.preserveFormatting = mention.args.includes('--preserve-format')
        break

      case 'test':
        target = this.extractTarget(mention.args, mention.context)
        description = this.extractDescription(mention.args, 'Add/fix tests for')
        break

      case 'doc':
        target = this.extractTarget(mention.args, mention.context)
        description = this.extractDescription(mention.args, 'Add/update documentation')
        break

      case 'security':
        target = this.extractTarget(mention.args, mention.context)
        description = this.extractDescription(mention.args, 'Improve security')
        break

      case 'accessibility':
        target = this.extractTarget(mention.args, mention.context)
        description = this.extractDescription(mention.args, 'Improve accessibility')
        break

      case 'analyze':
        target = this.extractTarget(mention.args, mention.context)
        description = this.extractDescription(mention.args, 'Analyze code')
        break

      case 'review':
        target = this.extractTarget(mention.args, mention.context)
        description = this.extractDescription(mention.args, 'Review code')
        options.includeComments = true
        break

      default:
        description = mention.args.join(' ') || `Execute ${command} command`
    }

    return {
      command,
      target,
      description,
      options,
    }
  }

  /**
   * Validate command name
   */
  private validateCommand(commandStr: string): NikCLICommand | null {
    const validCommands: NikCLICommand[] = [
      'fix',
      'add',
      'optimize',
      'refactor',
      'test',
      'doc',
      'security',
      'accessibility',
      'analyze',
      'review',
    ]

    const normalized = commandStr.toLowerCase().trim()

    // Direct match
    if (validCommands.includes(normalized as NikCLICommand)) {
      return normalized as NikCLICommand
    }

    // Common aliases
    const aliases: Record<string, NikCLICommand> = {
      repair: 'fix',
      solve: 'fix',
      create: 'add',
      implement: 'add',
      improve: 'optimize',
      enhance: 'optimize',
      restructure: 'refactor',
      reorganize: 'refactor',
      testing: 'test',
      tests: 'test',
      documentation: 'doc',
      docs: 'doc',
      secure: 'security',
      a11y: 'accessibility',
      accessibility: 'accessibility',
      check: 'analyze',
      inspect: 'analyze',
      audit: 'review',
    }

    return aliases[normalized] || null
  }

  /**
   * Extract target file/component from arguments or context
   */
  private extractTarget(
    args: string[],
    context?: { files?: string[]; lineNumbers?: number[]; codeBlocks?: string[] }
  ): string | undefined {
    // Look for file paths in arguments
    for (const arg of args) {
      if (arg.includes('/') || arg.includes('.')) {
        return arg
      }
    }

    // Use first mentioned file from context
    if (context?.files && context.files.length > 0) {
      return context.files[0]
    }

    return undefined
  }

  /**
   * Extract description from arguments
   */
  private extractDescription(args: string[], defaultPrefix: string): string {
    // Filter out flags and known patterns
    const descriptionWords = args.filter((arg) => !arg.startsWith('--') && !arg.includes('/') && !arg.includes('.'))

    if (descriptionWords.length > 0) {
      return descriptionWords.join(' ')
    }

    return defaultPrefix
  }

  /**
   * Check if comment contains @nikcli mention
   */
  hasNikCLIMention(commentText: string): boolean {
    return this.mentionRegex.test(commentText)
  }

  /**
   * Extract all @nikcli mentions from text
   */
  extractAllMentions(commentText: string): NikCLIMention[] {
    const mentions: NikCLIMention[] = []
    const matches = Array.from(commentText.matchAll(this.mentionRegex))

    for (const match of matches) {
      const commandText = match[1].trim()
      if (commandText) {
        const args = this.parseCommandArgs(commandText)
        const command = args[0]?.toLowerCase() || ''
        const context = this.extractContext(commentText)

        mentions.push({
          command,
          fullText: commentText,
          args: args.slice(1),
          context,
        })
      }
    }

    return mentions
  }

  /**
   * Generate usage help text
   */
  getUsageHelp(): string {
    return `🔌 **NikCLI Usage Help**

**Available Commands:**
• \`@nikcli fix [target]\` - Fix issues/errors in code
• \`@nikcli add <description>\` - Add new functionality
• \`@nikcli optimize [target]\` - Improve performance
• \`@nikcli refactor [target]\` - Restructure code
• \`@nikcli test [target]\` - Add/fix tests
• \`@nikcli doc [target]\` - Add/update documentation
• \`@nikcli security [target]\` - Improve security
• \`@nikcli accessibility [target]\` - Improve A11y
• \`@nikcli analyze [target]\` - Analyze code
• \`@nikcli review [target]\` - Code review

**Options:**
• \`--tests\` - Include test creation
• \`--docs\` - Update documentation
• \`--preserve-format\` - Keep code formatting

**Examples:**
• \`@nikcli fix src/components/Button.tsx\`
• \`@nikcli add user authentication with JWT\`
• \`@nikcli optimize database queries --tests\`
• \`@nikcli review --docs\`

**Context Detection:**
NikCLI automatically detects:
• File paths in \`backticks\`
• Line numbers (line 42, L42)
• Code blocks in comments

Mention files or line numbers in your comment for better targeting!`
  }
}
