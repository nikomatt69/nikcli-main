import blessed from 'blessed'
import chalk from 'chalk'
import * as path from 'node:path'
import { EventEmitter } from 'events'

/**
 * StructuredLayoutUI - 3-section UI layout for NikCLI
 *
 * Layout:
 * ┌────────────────────────────────────────────────────────────────┐
 * │ TOP BAR (fixed, 3 lines)                                       │
 * │ Build status, directory, shortcuts, version                    │
 * ├────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │ CENTER - LOGS/STREAM (scrollable, auto-scroll)                 │
 * │ All streaming output, logs, AI responses                       │
 * │                                                                 │
 * ├────────────────────────────────────────────────────────────────┤
 * │ BOTTOM - PROMPT (fixed, 3-4 lines)                             │
 * │ User input area with status                                    │
 * └────────────────────────────────────────────────────────────────┘
 */

export interface LayoutContext {
  workingDirectory: string
  currentModel?: string
  provider?: string
  buildStatus?: string
  version?: string
  contextPercentage?: number
  planMode?: boolean
  autoAcceptEdits?: boolean
  activeAgents?: number
  processingMessage?: boolean
}

export interface PromptOptions {
  placeholder?: string
  multiline?: boolean
  onSubmit?: (input: string) => void
  onCancel?: () => void
}

export class StructuredLayoutUI extends EventEmitter {
  private screen: blessed.Widgets.Screen
  private topBar: blessed.Widgets.BoxElement
  private centerLogs: blessed.Widgets.Log
  private bottomPrompt: blessed.Widgets.BoxElement
  private inputLine: blessed.Widgets.TextareaElement
  private statusLine: blessed.Widgets.BoxElement

  private context: LayoutContext
  private originalStdinRawMode?: boolean
  private isActive: boolean = false
  private logBuffer: string[] = []
  private maxLogBuffer: number = 1000
  private autoScroll: boolean = true

  constructor(context: LayoutContext) {
    super()
    this.context = context

    // Create the blessed screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'NikCLI',
      mouse: true,
      sendFocus: true,
      forceUnicode: false,
      input: process.stdin,
      output: process.stdout,
      terminal: 'xterm-256color',
      fullUnicode: false,
      dockBorders: true,
      ignoreDockContrast: true,
      autoPadding: true,
      warnings: false
    })

    // Store original stdin state
    this.originalStdinRawMode = process.stdin.isRaw

    this.setupLayout()
    this.setupKeyHandlers()
  }

  private setupLayout(): void {
    // TOP BAR - Fixed at top (3 lines)
    this.topBar = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: this.getTopBarContent(),
      tags: true,
      border: {
        type: 'line',
        fg: 'cyan'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        }
      }
    })

    // CENTER LOGS - Scrollable area for all output
    this.centerLogs = blessed.log({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-7', // Screen height minus top (3) and bottom (4)
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        track: {
          bg: 'grey'
        },
        style: {
          inverse: true
        }
      },
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      border: {
        type: 'line',
        fg: 'cyan'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        },
        scrollbar: {
          bg: 'blue',
          fg: 'white'
        }
      }
    })

    // BOTTOM SECTION - Fixed at bottom (4 lines total: status + input + border)
    this.bottomPrompt = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 4,
      border: {
        type: 'line',
        fg: 'cyan'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        }
      }
    })

    // Status line (inside bottom prompt)
    this.statusLine = blessed.box({
      parent: this.bottomPrompt,
      top: 0,
      left: 1,
      width: '100%-2',
      height: 1,
      content: this.getStatusLineContent(),
      tags: true,
      style: {
        fg: 'cyan',
        bg: 'black'
      }
    })

    // Input textarea (inside bottom prompt)
    this.inputLine = blessed.textarea({
      parent: this.bottomPrompt,
      top: 1,
      left: 1,
      width: '100%-2',
      height: 1,
      inputOnFocus: true,
      keys: true,
      mouse: true,
      style: {
        fg: 'white',
        bg: 'black',
        focus: {
          fg: 'white',
          bg: 'black'
        }
      }
    })

    // Auto-focus input
    this.inputLine.focus()
  }

  private setupKeyHandlers(): void {
    // Global key handlers
    this.screen.key(['C-c'], () => {
      this.emit('interrupt')
    })

    this.screen.key(['escape'], () => {
      this.emit('escape')
    })

    this.screen.key(['C-p'], () => {
      this.emit('command-palette')
    })

    this.screen.key(['tab'], () => {
      this.emit('agents-view')
    })

    // Scroll controls for center logs
    this.screen.key(['pageup'], () => {
      this.centerLogs.scroll(-10)
      this.screen.render()
    })

    this.screen.key(['pagedown'], () => {
      this.centerLogs.scroll(10)
      this.screen.render()
    })

    this.screen.key(['home'], () => {
      this.centerLogs.setScrollPerc(0)
      this.screen.render()
    })

    this.screen.key(['end'], () => {
      this.centerLogs.setScrollPerc(100)
      this.screen.render()
    })

    // Input line handlers
    this.inputLine.key(['enter'], () => {
      const input = this.inputLine.getValue()
      this.inputLine.clearValue()
      this.emit('submit', input)
      this.screen.render()
    })

    this.inputLine.key(['C-c'], () => {
      this.inputLine.clearValue()
      this.emit('cancel')
      this.screen.render()
    })

    // Mouse wheel support for scrolling
    this.centerLogs.on('wheeldown', () => {
      this.centerLogs.scroll(3)
      this.screen.render()
    })

    this.centerLogs.on('wheelup', () => {
      this.centerLogs.scroll(-3)
      this.screen.render()
    })
  }

  private getTopBarContent(): string {
    const dir = path.basename(this.context.workingDirectory || process.cwd())
    const build = this.context.buildStatus || 'OpenCode Gemini Pro 3'
    const version = this.context.version || 'v1.0.85'

    // First line: Build and directory
    const line1 = ` {bold}Build:{/bold} ${build}  {cyan}│{/cyan}  {bold}~{/bold}/${dir}`

    // Second line: Shortcuts
    const line2 = ` {grey-fg}esc{/grey-fg} interrupt  {grey-fg}tab{/grey-fg} Agents  {grey-fg}ctrl+p{/grey-fg} Commands  {grey-fg}${version}{/grey-fg}`

    return `${line1}\n${line2}`
  }

  private getStatusLineContent(): string {
    const dir = path.basename(this.context.workingDirectory || process.cwd())
    const model = this.context.currentModel || 'claude-sonnet-4.5'
    const provider = this.context.provider || 'anthropic'
    const agents = this.context.activeAgents || 0
    const contextPct = this.context.contextPercentage || 0

    const modes: string[] = []
    if (this.context.planMode) modes.push('{cyan-fg}plan{/cyan-fg}')
    if (this.context.autoAcceptEdits) modes.push('{green-fg}auto-accept{/green-fg}')
    const modeStr = modes.length > 0 ? `[${modes.join(',')}]` : ''

    const statusDot = this.context.processingMessage
      ? '{green-fg}●{/green-fg}…'
      : '{red-fg}●{/red-fg}'

    const agentStr = agents > 0 ? `{yellow-fg}👥${agents}{/yellow-fg}` : ''
    const contextStr = `{grey-fg}${contextPct}%{/grey-fg}`

    return `┌─[{cyan-fg}🎛️{/cyan-fg}:${dir}${modeStr}]─[${contextStr}]─[${statusDot}]─[${agentStr}]─[${provider}:${model}]`
  }

  /**
   * Update the context and refresh UI
   */
  public updateContext(context: Partial<LayoutContext>): void {
    this.context = { ...this.context, ...context }
    this.refreshUI()
  }

  /**
   * Append a log message to the center logs area
   */
  public log(message: string, color?: string): void {
    const coloredMessage = color ? chalk[color](message) : message

    // Add to buffer
    this.logBuffer.push(coloredMessage)
    if (this.logBuffer.length > this.maxLogBuffer) {
      this.logBuffer.shift()
    }

    // Add to visible logs
    this.centerLogs.log(coloredMessage)

    // Auto-scroll to bottom if enabled
    if (this.autoScroll) {
      this.centerLogs.setScrollPerc(100)
    }

    this.screen.render()
  }

  /**
   * Append multiple log messages
   */
  public logMultiple(messages: string[]): void {
    messages.forEach(msg => this.log(msg))
  }

  /**
   * Clear all logs
   */
  public clearLogs(): void {
    this.logBuffer = []
    this.centerLogs.setContent('')
    this.screen.render()
  }

  /**
   * Set the input prompt value
   */
  public setInput(value: string): void {
    this.inputLine.setValue(value)
    this.screen.render()
  }

  /**
   * Get the current input value
   */
  public getInput(): string {
    return this.inputLine.getValue()
  }

  /**
   * Clear the input
   */
  public clearInput(): void {
    this.inputLine.clearValue()
    this.screen.render()
  }

  /**
   * Focus the input field
   */
  public focusInput(): void {
    this.inputLine.focus()
    this.screen.render()
  }

  /**
   * Enable/disable auto-scroll
   */
  public setAutoScroll(enabled: boolean): void {
    this.autoScroll = enabled
  }

  /**
   * Refresh the entire UI
   */
  public refreshUI(): void {
    this.topBar.setContent(this.getTopBarContent())
    this.statusLine.setContent(this.getStatusLineContent())
    this.screen.render()
  }

  /**
   * Show a spinner/loading indicator
   */
  public showSpinner(message: string): void {
    this.log(`{yellow-fg}⏳{/yellow-fg} ${message}`)
  }

  /**
   * Show a success message
   */
  public showSuccess(message: string): void {
    this.log(`{green-fg}✓{/green-fg} ${message}`)
  }

  /**
   * Show an error message
   */
  public showError(message: string): void {
    this.log(`{red-fg}✗{/red-fg} ${message}`, 'red')
  }

  /**
   * Show an info message
   */
  public showInfo(message: string): void {
    this.log(`{blue-fg}ℹ{/blue-fg} ${message}`)
  }

  /**
   * Show a warning message
   */
  public showWarning(message: string): void {
    this.log(`{yellow-fg}⚠{/yellow-fg} ${message}`, 'yellow')
  }

  /**
   * Render the screen
   */
  public render(): void {
    this.screen.render()
  }

  /**
   * Activate the UI (enter raw mode, show screen)
   */
  public activate(): void {
    if (this.isActive) return

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
      process.stdin.resume()
    }

    this.isActive = true
    this.focusInput()
    this.screen.render()
  }

  /**
   * Deactivate the UI (exit raw mode, hide screen)
   */
  public deactivate(): void {
    if (!this.isActive) return

    this.isActive = false

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(this.originalStdinRawMode || false)
      if (!this.originalStdinRawMode) {
        process.stdin.pause()
      }
    }
  }

  /**
   * Destroy the UI and cleanup
   */
  public destroy(): void {
    try {
      // Remove all listeners
      this.removeAllListeners()
      this.screen.removeAllListeners('key')
      this.screen.removeAllListeners('keypress')

      // Restore terminal state
      if (this.screen.program) {
        this.screen.program.disableMouse()
        this.screen.program.showCursor()
        this.screen.program.normalBuffer()
      }

      // Destroy the screen
      this.screen.destroy()

      // Restore stdin
      this.deactivate()
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Get the blessed screen instance (for advanced usage)
   */
  public getScreen(): blessed.Widgets.Screen {
    return this.screen
  }

  /**
   * Get the center logs box (for advanced usage)
   */
  public getCenterLogs(): blessed.Widgets.Log {
    return this.centerLogs
  }

  /**
   * Get the input line (for advanced usage)
   */
  public getInputLine(): blessed.Widgets.TextareaElement {
    return this.inputLine
  }
}
