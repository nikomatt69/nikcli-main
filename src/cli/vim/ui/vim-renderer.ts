import chalk from 'chalk'
import { CursorPosition, VimMode, type VimState } from '../types/vim-types'
import type { VimModeConfig } from '../vim-mode-manager'

interface RenderOptions {
  showLineNumbers: boolean
  showStatusLine: boolean
  showCommandLine: boolean
  theme: 'default' | 'minimal' | 'enhanced'
}

export class VimRenderer {
  private state: VimState
  private config: VimModeConfig
  private previousOutput: string = ''
  private terminalWidth: number = 80
  private terminalHeight: number = 24

  constructor(state: VimState, config: VimModeConfig) {
    this.state = state
    this.config = config
    this.updateTerminalSize()
  }

  async initialize(): Promise<void> {
    process.stdout.on('resize', () => this.updateTerminalSize())

    // Hide cursor and clear screen
    process.stdout.write('\x1B[?25l')
    process.stdout.write('\x1B[2J')
    process.stdout.write('\x1B[H')
  }

  async render(): Promise<void> {
    const output = this.buildOutput()

    if (output !== this.previousOutput) {
      this.clearScreen()
      process.stdout.write(output)
      this.previousOutput = output
    }

    this.positionCursor()
  }

  async clear(): Promise<void> {
    process.stdout.write('\x1B[2J')
    process.stdout.write('\x1B[H')
    process.stdout.write('\x1B[?25h') // Show cursor
    this.previousOutput = ''
  }

  private buildOutput(): string {
    const options: RenderOptions = {
      showLineNumbers: this.config.lineNumbers,
      showStatusLine: this.config.statusLine,
      showCommandLine: this.state.mode === VimMode.COMMAND,
      theme: this.config.theme,
    }

    let output = ''

    // Main buffer content
    output += this.renderBuffer(options)

    // Status line
    if (options.showStatusLine) {
      output += this.renderStatusLine(options)
    }

    // Command line
    if (options.showCommandLine) {
      output += this.renderCommandLine(options)
    }

    return output
  }

  private renderBuffer(options: RenderOptions): string {
    const visibleLines = this.calculateVisibleLines(options)
    const startLine = this.calculateStartLine(visibleLines.count)
    const endLine = Math.min(startLine + visibleLines.count, this.state.buffer.length)

    let output = ''

    for (let i = startLine; i < endLine; i++) {
      const line = this.state.buffer[i] || ''
      const lineNumber = i + 1
      const isCurrentLine = i === this.state.cursor.line

      let renderedLine = ''

      // Line numbers
      if (options.showLineNumbers) {
        const lineNumStr = lineNumber.toString().padStart(4, ' ')
        renderedLine += this.styleLineNumber(lineNumStr, isCurrentLine, options.theme)
        renderedLine += ' '
      }

      // Line content with syntax highlighting
      renderedLine += this.renderLineContent(line, i, options)

      // Visual mode selection
      if (this.state.mode === VimMode.VISUAL || this.state.mode === VimMode.VISUAL_LINE) {
        renderedLine = this.applyVisualSelection(renderedLine, i)
      }

      output += renderedLine + '\n'
    }

    // Fill remaining lines
    const remainingLines = visibleLines.count - (endLine - startLine)
    for (let i = 0; i < remainingLines; i++) {
      if (options.showLineNumbers) {
        output += this.styleEmptyLineNumber(options.theme) + '\n'
      } else {
        output += '~\n'
      }
    }

    return output
  }

  private renderLineContent(line: string, lineIndex: number, options: RenderOptions): string {
    const isCurrentLine = lineIndex === this.state.cursor.line

    if (options.theme === 'enhanced') {
      return this.applySyntaxHighlighting(line, isCurrentLine)
    }

    if (isCurrentLine && this.state.mode === VimMode.INSERT) {
      return chalk.bgBlue.white(line || ' ')
    }

    return line
  }

  private applySyntaxHighlighting(line: string, isCurrentLine: boolean): string {
    // Basic syntax highlighting for common patterns
    let highlighted = line

    // Keywords
    highlighted = highlighted.replace(
      /\b(function|const|let|var|if|else|for|while|return|class|interface|type)\b/g,
      chalk.blue('$1')
    )

    // Strings
    highlighted = highlighted.replace(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g, chalk.green('$1$2$1'))

    // Comments
    highlighted = highlighted.replace(/(\/\/.*$|\/\*.*?\*\/)/g, chalk.gray('$1'))

    // Numbers
    highlighted = highlighted.replace(/\b(\d+(?:\.\d+)?)\b/g, chalk.cyan('$1'))

    if (isCurrentLine && this.state.mode === VimMode.INSERT) {
      return chalk.bgBlue.white(highlighted)
    }

    return highlighted
  }

  private renderStatusLine(options: RenderOptions): string {
    const mode = this.getModeDisplay()
    const position = `${this.state.cursor.line + 1}:${this.state.cursor.column + 1}`
    const bufferInfo = `${this.state.buffer.length} lines`
    const filename = '[No Name]' // TODO: get actual filename

    let statusLine = ''

    if (options.theme === 'enhanced') {
      statusLine += chalk.bgGray.white.bold(` ${mode} `)
      statusLine += chalk.bgBlue.white(` ${filename} `)
      statusLine += chalk.bgGray.white(` ${position} `)
      statusLine += chalk.bgGray.white(` ${bufferInfo} `)
    } else if (options.theme === 'minimal') {
      statusLine += `${mode} | ${position}`
    } else {
      statusLine += chalk.inverse(`${mode} | ${filename} | ${position} | ${bufferInfo}`)
    }

    // Pad to terminal width
    const statusLength = this.stripAnsiCodes(statusLine).length
    const padding = ' '.repeat(Math.max(0, this.terminalWidth - statusLength))
    statusLine += padding

    return '\n' + statusLine + '\n'
  }

  private renderCommandLine(options: RenderOptions): string {
    const commandBuffer = this.getCommandBuffer()

    let commandLine = ':'
    if (options.theme === 'enhanced') {
      commandLine = chalk.yellow(':') + chalk.white(commandBuffer)
    } else {
      commandLine += commandBuffer
    }

    return commandLine
  }

  private getModeDisplay(): string {
    switch (this.state.mode) {
      case VimMode.NORMAL:
        return 'NORMAL'
      case VimMode.INSERT:
        return 'INSERT'
      case VimMode.VISUAL:
        return 'VISUAL'
      case VimMode.VISUAL_LINE:
        return 'V-LINE'
      case VimMode.COMMAND:
        return 'COMMAND'
      case VimMode.REPLACE:
        return 'REPLACE'
      default:
        return 'UNKNOWN'
    }
  }

  private styleLineNumber(lineNum: string, isCurrentLine: boolean, theme: string): string {
    if (theme === 'enhanced') {
      return isCurrentLine ? chalk.yellow.bold(lineNum) : chalk.gray(lineNum)
    } else if (theme === 'minimal') {
      return isCurrentLine ? lineNum : chalk.gray(lineNum)
    } else {
      return chalk.gray(lineNum)
    }
  }

  private styleEmptyLineNumber(theme: string): string {
    if (theme === 'enhanced') {
      return chalk.gray('   ~')
    } else {
      return '   ~'
    }
  }

  private applyVisualSelection(line: string, lineIndex: number): string {
    // TODO: Implement visual selection highlighting
    return line
  }

  private calculateVisibleLines(options: RenderOptions): { count: number; offset: number } {
    let usedLines = 0

    if (options.showStatusLine) usedLines += 2 // Status line + border
    if (options.showCommandLine) usedLines += 1 // Command line

    const availableLines = this.terminalHeight - usedLines
    return { count: Math.max(1, availableLines), offset: usedLines }
  }

  private calculateStartLine(visibleLineCount: number): number {
    const currentLine = this.state.cursor.line
    const halfScreen = Math.floor(visibleLineCount / 2)

    // Keep cursor centered when possible
    let startLine = Math.max(0, currentLine - halfScreen)

    // Don't scroll past the end
    if (startLine + visibleLineCount > this.state.buffer.length) {
      startLine = Math.max(0, this.state.buffer.length - visibleLineCount)
    }

    return startLine
  }

  private positionCursor(): void {
    const visibleLines = this.calculateVisibleLines({
      showLineNumbers: this.config.lineNumbers,
      showStatusLine: this.config.statusLine,
      showCommandLine: this.state.mode === VimMode.COMMAND,
      theme: this.config.theme,
    })

    const startLine = this.calculateStartLine(visibleLines.count)
    const screenLine = this.state.cursor.line - startLine + 1

    let screenColumn = this.state.cursor.column + 1
    if (this.config.lineNumbers) {
      screenColumn += 5 // Line number width + space
    }

    // Move cursor to position
    process.stdout.write(`\x1B[${screenLine};${screenColumn}H`)
  }

  private clearScreen(): void {
    process.stdout.write('\x1B[2J')
    process.stdout.write('\x1B[H')
  }

  private updateTerminalSize(): void {
    this.terminalWidth = process.stdout.columns || 80
    this.terminalHeight = process.stdout.rows || 24
  }

  private stripAnsiCodes(str: string): string {
    return str.replace(/\x1B\[[0-9;]*[JKmsu]/g, '')
  }

  private getCommandBuffer(): string {
    // TODO: Get command buffer from command processor
    return ''
  }

  updateConfig(config: VimModeConfig): void {
    this.config = config
  }

  destroy(): void {
    process.stdout.write('\x1B[?25h') // Show cursor
    process.stdout.removeAllListeners('resize')
  }
}
