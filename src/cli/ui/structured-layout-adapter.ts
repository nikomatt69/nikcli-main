import { StructuredLayoutUI, type LayoutContext } from './structured-layout-ui'
import type { StreamttyService } from '../services/streamtty-service'
import chalk from 'chalk'
import { EventEmitter } from 'events'

/**
 * StructuredLayoutAdapter - Integrates StreamttyService with StructuredLayoutUI
 *
 * This adapter:
 * 1. Captures output from StreamttyService
 * 2. Routes it to the center logs panel
 * 3. Manages the interaction between streaming output and the fixed prompt
 */

interface AdapterOptions {
  captureStdout?: boolean
  captureStderr?: boolean
  formatMarkdown?: boolean
}

export class StructuredLayoutAdapter extends EventEmitter {
  private layout: StructuredLayoutUI
  private originalStdoutWrite: typeof process.stdout.write
  private originalStderrWrite: typeof process.stderr.write
  private isCapturing: boolean = false
  private options: AdapterOptions

  constructor(context: LayoutContext, options: AdapterOptions = {}) {
    super()

    this.options = {
      captureStdout: true,
      captureStderr: true,
      formatMarkdown: true,
      ...options
    }

    this.layout = new StructuredLayoutUI(context)

    // Store original write functions
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout)
    this.originalStderrWrite = process.stderr.write.bind(process.stderr)

    // Forward events from layout
    this.layout.on('submit', (input: string) => this.emit('submit', input))
    this.layout.on('cancel', () => this.emit('cancel'))
    this.layout.on('interrupt', () => this.emit('interrupt'))
    this.layout.on('escape', () => this.emit('escape'))
    this.layout.on('command-palette', () => this.emit('command-palette'))
    this.layout.on('agents-view', () => this.emit('agents-view'))
  }

  /**
   * Start capturing stdout/stderr and routing to layout
   */
  public startCapture(): void {
    if (this.isCapturing) return

    // Intercept stdout
    if (this.options.captureStdout) {
      process.stdout.write = ((chunk: any, encoding?: any, callback?: any): boolean => {
        const text = chunk.toString()

        // Don't capture blessed's own output (control sequences)
        if (!text.includes('\x1b[?1049h') && !text.includes('\x1b[?25')) {
          this.layout.log(this.cleanAnsiCodes(text))
        }

        // Also write to original stdout for debugging (optional)
        // this.originalStdoutWrite(chunk, encoding, callback)

        if (typeof callback === 'function') callback()
        return true
      }) as typeof process.stdout.write
    }

    // Intercept stderr
    if (this.options.captureStderr) {
      process.stderr.write = ((chunk: any, encoding?: any, callback?: any): boolean => {
        const text = chunk.toString()

        // Route errors to layout with red color
        if (!text.includes('\x1b[?1049h') && !text.includes('\x1b[?25')) {
          this.layout.showError(this.cleanAnsiCodes(text))
        }

        if (typeof callback === 'function') callback()
        return true
      }) as typeof process.stderr.write
    }

    this.isCapturing = true
  }

  /**
   * Stop capturing and restore original stdout/stderr
   */
  public stopCapture(): void {
    if (!this.isCapturing) return

    process.stdout.write = this.originalStdoutWrite
    process.stderr.write = this.originalStderrWrite
    this.isCapturing = false
  }

  /**
   * Clean ANSI codes from text (keep only basic colors)
   */
  private cleanAnsiCodes(text: string): string {
    // Remove cursor movement and screen manipulation codes
    return text
      .replace(/\x1b\[\?1049h/g, '') // Alternate screen
      .replace(/\x1b\[\?1049l/g, '')
      .replace(/\x1b\[\?25[hl]/g, '') // Cursor visibility
      .replace(/\x1b\[H/g, '') // Cursor home
      .replace(/\x1b\[2J/g, '') // Clear screen
      .replace(/\x1b\[K/g, '') // Clear line
      .replace(/\x1b\[\d+A/g, '') // Cursor up
      .replace(/\x1b\[\d+B/g, '') // Cursor down
      .replace(/\x1b\[\d+C/g, '') // Cursor forward
      .replace(/\x1b\[\d+D/g, '') // Cursor back
      .replace(/\x1b\[\d+;\d+H/g, '') // Cursor position
  }

  /**
   * Integrate with StreamttyService
   */
  public integrateStreamtty(streamttyService: StreamttyService): void {
    // Whenever streamtty renders something, capture it and route to layout
    // This would require modifications to streamtty-service.ts to emit events
    // For now, the stdout capture should handle this
  }

  /**
   * Log a message to the center panel
   */
  public log(message: string, color?: string): void {
    this.layout.log(message, color)
  }

  /**
   * Log multiple messages
   */
  public logMultiple(messages: string[]): void {
    this.layout.logMultiple(messages)
  }

  /**
   * Show a spinner/loading indicator
   */
  public showSpinner(message: string): void {
    this.layout.showSpinner(message)
  }

  /**
   * Show a success message
   */
  public showSuccess(message: string): void {
    this.layout.showSuccess(message)
  }

  /**
   * Show an error message
   */
  public showError(message: string): void {
    this.layout.showError(message)
  }

  /**
   * Show an info message
   */
  public showInfo(message: string): void {
    this.layout.showInfo(message)
  }

  /**
   * Show a warning message
   */
  public showWarning(message: string): void {
    this.layout.showWarning(message)
  }

  /**
   * Update the layout context
   */
  public updateContext(context: Partial<LayoutContext>): void {
    this.layout.updateContext(context)
  }

  /**
   * Clear all logs
   */
  public clearLogs(): void {
    this.layout.clearLogs()
  }

  /**
   * Set input value
   */
  public setInput(value: string): void {
    this.layout.setInput(value)
  }

  /**
   * Get input value
   */
  public getInput(): string {
    return this.layout.getInput()
  }

  /**
   * Clear input
   */
  public clearInput(): void {
    this.layout.clearInput()
  }

  /**
   * Focus the input
   */
  public focusInput(): void {
    this.layout.focusInput()
  }

  /**
   * Enable/disable auto-scroll
   */
  public setAutoScroll(enabled: boolean): void {
    this.layout.setAutoScroll(enabled)
  }

  /**
   * Activate the UI
   */
  public activate(): void {
    this.layout.activate()
    this.startCapture()
  }

  /**
   * Deactivate the UI
   */
  public deactivate(): void {
    this.stopCapture()
    this.layout.deactivate()
  }

  /**
   * Destroy the adapter and cleanup
   */
  public destroy(): void {
    this.stopCapture()
    this.layout.destroy()
    this.removeAllListeners()
  }

  /**
   * Get the underlying layout instance
   */
  public getLayout(): StructuredLayoutUI {
    return this.layout
  }

  /**
   * Render the screen
   */
  public render(): void {
    this.layout.render()
  }
}

/**
 * Helper function to create and initialize the structured layout
 */
export function createStructuredLayout(context: LayoutContext, options?: AdapterOptions): StructuredLayoutAdapter {
  const adapter = new StructuredLayoutAdapter(context, options)
  return adapter
}
