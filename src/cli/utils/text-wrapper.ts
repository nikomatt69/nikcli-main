import chalk from 'chalk'

/**
 * Text wrapping utilities for proper CLI output formatting
 */
export class TextWrapper {
  private static defaultWidth = 80

  /**
   * Get terminal width or fall back to default
   */
  static getTerminalWidth(): number {
    return process.stdout.columns || this.defaultWidth
  }

  /**
   * Wrap long blue text with proper line breaks and indentation
   */
  static wrapBlueText(text: string, indent: string = '  ', maxWidth?: number): string {
    const terminalWidth = maxWidth || 80
    const availableWidth = terminalWidth - indent.length - 4 // Account for colors and padding

    if (text.length <= availableWidth) {
      return chalk.blue(text)
    }

    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word

      if (testLine.length <= availableWidth) {
        currentLine = testLine
      } else {
        if (currentLine) {
          lines.push(currentLine)
          currentLine = word
        } else {
          // Word is too long, break it
          lines.push(word.substring(0, availableWidth))
          currentLine = word.substring(availableWidth)
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine)
    }

    // Apply blue color to each line and add indentation
    return lines
      .map((line, index) => {
        const prefix = index === 0 ? '' : indent
        return prefix + chalk.blue(line)
      })
      .join('\n')
  }

  /**
   * Wrap cyan text with proper line breaks
   */
  static wrapCyanText(text: string, indent: string = '  ', maxWidth?: number): string {
    const terminalWidth = maxWidth || this.getTerminalWidth()
    const availableWidth = terminalWidth - indent.length - 4

    if (text.length <= availableWidth) {
      return chalk.cyan(text)
    }

    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word

      if (testLine.length <= availableWidth) {
        currentLine = testLine
      } else {
        if (currentLine) {
          lines.push(currentLine)
          currentLine = word
        } else {
          lines.push(word.substring(0, availableWidth))
          currentLine = word.substring(availableWidth)
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine)
    }

    return lines
      .map((line, index) => {
        const prefix = index === 0 ? '' : indent
        return prefix + chalk.cyan(line)
      })
      .join('\n')
  }

  /**
   * Wrap any colored text with proper line breaks
   */
  static wrapColoredText(
    text: string,
    colorFn: (text: string) => string,
    indent: string = '  ',
    maxWidth?: number
  ): string {
    const terminalWidth = maxWidth || this.getTerminalWidth()
    const availableWidth = terminalWidth - indent.length - 4

    if (text.length <= availableWidth) {
      return colorFn(text)
    }

    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word

      if (testLine.length <= availableWidth) {
        currentLine = testLine
      } else {
        if (currentLine) {
          lines.push(currentLine)
          currentLine = word
        } else {
          lines.push(word.substring(0, availableWidth))
          currentLine = word.substring(availableWidth)
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine)
    }

    return lines
      .map((line, index) => {
        const prefix = index === 0 ? '' : indent
        return prefix + colorFn(line)
      })
      .join('\n')
  }

  /**
   * Smart format for status messages with icons and wrapping
   */
  static formatStatus(icon: string, message: string, details?: string): string {
    const fullText = details ? `${message} - ${details}` : message
    return `${icon} ${TextWrapper.wrapBlueText(fullText)}`
  }

  /**
   * Format command execution messages with proper wrapping
   */
  static formatCommand(command: string, args?: string[]): string {
    const fullCommand = args ? `${command} ${args.join(' ')}` : command
    return TextWrapper.wrapBlueText(`⚡ Running: ${fullCommand}`)
  }

  /**
   * Format file operation messages with proper wrapping
   */
  static formatFileOperation(operation: string, filePath: string, details?: string): string {
    const message = details ? `${operation} ${filePath} - ${details}` : `${operation} ${filePath}`
    return TextWrapper.wrapBlueText(message)
  }

  /**
   * Format progress messages with proper wrapping
   */
  static formatProgress(current: number, total: number, operation?: string): string {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0
    const baseMessage = `📊 Progress: ${current}/${total} (${percentage}%)`
    const fullMessage = operation ? `${baseMessage} - ${operation}` : baseMessage
    return TextWrapper.wrapBlueText(fullMessage)
  }

  /**
   * Format agent messages with proper wrapping
   */
  static formatAgent(agentType: string, action: string, task?: string): string {
    const baseMessage = `🤖 Agent ${agentType} ${action}`
    const fullMessage = task ? `${baseMessage}: ${task}` : baseMessage

    // Truncate very long tasks to prevent excessive wrapping
    const truncatedMessage = fullMessage.length > 150 ? fullMessage.substring(0, 147) + '...' : fullMessage

    return TextWrapper.wrapBlueText(truncatedMessage)
  }

  /**
   * Format search/find operations with proper wrapping
   */
  static formatSearch(query: string, location: string, results?: number): string {
    const baseMessage = `🔍 Searching for "${query}" in ${location}`
    const fullMessage = results !== undefined ? `${baseMessage} (${results} results)` : baseMessage

    return TextWrapper.wrapBlueText(fullMessage)
  }
}

// Export convenient wrapper functions
export const wrapBlue = TextWrapper.wrapBlueText
export const wrapCyan = TextWrapper.wrapCyanText
export const formatStatus = TextWrapper.formatStatus
export const formatCommand = TextWrapper.formatCommand
export const formatFileOp = TextWrapper.formatFileOperation
export const formatProgress = TextWrapper.formatProgress
export const formatAgent = TextWrapper.formatAgent
export const formatSearch = TextWrapper.formatSearch
