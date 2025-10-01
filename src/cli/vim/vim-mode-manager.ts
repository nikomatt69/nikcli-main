import { EventEmitter } from 'node:events'
import * as blessed from 'blessed'
import chalk from 'chalk'
import type * as readline from 'readline'
import { CliUI } from '../utils/cli-ui'
import { VimCommandProcessor } from './commands/vim-command-processor'
import { VimKeyHandler } from './keybindings/vim-key-handler'
import { type CursorPosition, VimMode, type VimState } from './types/vim-types'
import { VimRenderer } from './ui/vim-renderer'

export interface VimModeConfig {
  aiIntegration: boolean
  customKeybindings: Record<string, string>
  theme: 'default' | 'minimal' | 'enhanced'
  statusLine: boolean
  lineNumbers: boolean
}

export interface CliModeState {
  current: 'default' | 'plan' | 'vim'
  previous: 'default' | 'plan' | 'vim' | null
  isTransitioning: boolean
}

export interface ComponentState {
  promptSuspended: boolean
  blessedSuspended: boolean
  listenersActive: boolean
  suspendedComponents: Set<any>
  suspendedListeners: Map<string, any[]>
}

export class VimModeManager extends EventEmitter {
  private state: VimState
  private keyHandler: VimKeyHandler
  private commandProcessor: VimCommandProcessor
  private renderer: VimRenderer
  private config: VimModeConfig
  private isActive: boolean = false
  private buffer: string[] = []
  private cursorPosition: CursorPosition = { line: 0, column: 0 }
  private screen?: blessed.Widgets.Screen
  private editor?: blessed.Widgets.TextareaElement
  private statusBar?: blessed.Widgets.BoxElement

  // CLI Mode Management
  private cliModeState: CliModeState = {
    current: 'default',
    previous: null,
    isTransitioning: false,
  }

  private componentState: ComponentState = {
    promptSuspended: false,
    blessedSuspended: false,
    listenersActive: true,
    suspendedComponents: new Set(),
    suspendedListeners: new Map(),
  }

  private promptInterface?: readline.Interface
  private restoreCallback?: () => void

  constructor(config: Partial<VimModeConfig> = {}) {
    super()

    this.config = {
      aiIntegration: true,
      customKeybindings: {},
      theme: 'default',
      statusLine: true,
      lineNumbers: true,
      ...config,
    }

    this.state = {
      mode: VimMode.NORMAL,
      buffer: this.buffer,
      cursor: this.cursorPosition,
      registers: new Map(),
      history: [],
      lastCommand: null,
      isRecording: false,
      macroRegister: null,
    }

    this.keyHandler = new VimKeyHandler(this.state, this.config)
    this.commandProcessor = new VimCommandProcessor(this.state, this.config)
    this.renderer = new VimRenderer(this.state, this.config)

    this.setupEventHandlers()
  }

  async initialize(): Promise<void> {
    try {
      await this.keyHandler.initialize()
      await this.commandProcessor.initialize()
      await this.renderer.initialize()

      CliUI.logSuccess('Vim mode initialized successfully')
    } catch (error: any) {
      CliUI.logError(`Failed to initialize vim mode: ${error.message}`)
      throw error
    }
  }

  async activate(promptInterface?: readline.Interface, restoreCallback?: () => void): Promise<void> {
    if (this.isActive) {
      CliUI.logWarning('Vim mode already active')
      return
    }

    // Enter vim mode with proper CLI component management
    await this.enterVimMode(promptInterface, restoreCallback)

    this.isActive = true
    this.state.mode = VimMode.NORMAL

    // Clear screen completely and hide cursor before setting up UI
    process.stdout.write('\u001B[2J') // Clear entire screen
    process.stdout.write('\u001B[H') // Move cursor to home
    process.stdout.write('\u001B[?25l') // Hide cursor

    this.setupBlessedUI()
    await this.renderer.render()
    this.emit('activated', { pauseReadline: true })
  }

  private setupBlessedUI(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'NikCLI Vim Mode',
      dockBorders: true,
      ignoreLocked: ['C-c'],
      mouse: false,
      sendFocus: false,
      fullUnicode: true,
      autoPadding: true,
      warnings: false,
    })

    this.editor = blessed.textarea({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-2' as any,
      inputOnFocus: true,
      mouse: false,
      keys: true,
      vi: true,
      style: {
        bg: 'black',
        fg: 'white',
        focus: {
          bg: 'black',
          fg: 'cyan',
        },
      },
      border: {
        type: 'line',
        fg: 'cyan' as any,
      },
      content: this.buffer.join('\n'),
    })

    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 2,
      mouse: false,
      style: {
        bg: 'blue',
        fg: 'white',
      },
      content: this.getStatusText(),
    })

    this.setupKeyHandlers()
    this.disableMouseEvents()

    this.editor.focus()
    this.screen.render()
  }

  private setupKeyHandlers(): void {
    if (!this.screen || !this.editor) return

    // Capture all input to prevent interference with readline
    this.screen.grabKeys = true
    this.screen.key(['C-c'], () => {
      this.deactivate()
    })

    this.screen.key(['escape'], () => {
      this.state.mode = VimMode.NORMAL
      this.updateStatus()
    })

    this.screen.key(['i'], () => {
      if (this.state.mode === VimMode.NORMAL) {
        this.state.mode = VimMode.INSERT
        this.updateStatus()
      }
    })

    this.screen.key(['v'], () => {
      if (this.state.mode === VimMode.NORMAL) {
        this.state.mode = VimMode.VISUAL
        this.updateStatus()
      }
    })

    this.screen.key([':', 'enter'], () => {
      if (this.state.mode === VimMode.NORMAL) {
        this.state.mode = VimMode.COMMAND
        this.updateStatus()
      }
    })

    this.editor?.on('submit', (content: string) => {
      this.buffer = content.split('\n')
      this.state.buffer = this.buffer
      this.emit('bufferChanged', this.buffer)
    })
  }

  private getStatusText(): string {
    const mode = this.state.mode.toUpperCase()
    const position = `${this.cursorPosition.line + 1}:${this.cursorPosition.column + 1}`
    return ` ${mode} | ${position} | ${this.buffer.length} lines | KEYBOARD ONLY | :q to quit, Ctrl+C to exit`
  }

  private disableMouseEvents(): void {
    if (!this.screen) return

    // Remove all mouse event listeners
    this.screen.removeAllListeners('mouse')
    this.screen.removeAllListeners('click')
    this.screen.removeAllListeners('wheelup')
    this.screen.removeAllListeners('wheeldown')

    if (this.editor) {
      this.editor.removeAllListeners('mouse')
      this.editor.removeAllListeners('click')
    }

    if (this.statusBar) {
      this.statusBar.removeAllListeners('mouse')
      this.statusBar.removeAllListeners('click')
    }
  }

  private updateStatus(): void {
    if (this.statusBar) {
      this.statusBar.setContent(this.getStatusText())
      this.screen?.render()
    }
  }

  async deactivate(): Promise<void> {
    if (!this.isActive) {
      return
    }

    this.isActive = false

    if (this.screen) {
      this.screen.destroy()
      this.screen = undefined
      this.editor = undefined
      this.statusBar = undefined
    }

    // Clear screen and restore cursor before exiting
    process.stdout.write('\u001B[2J') // Clear entire screen
    process.stdout.write('\u001B[H') // Move cursor to home
    process.stdout.write('\u001B[?25h') // Show cursor

    await this.renderer.clear()

    // Exit vim mode with proper CLI component restoration
    await this.exitVimMode()

    this.emit('deactivated', { resumeReadline: true })

    // Give a moment for screen to clear then show exit message
    setTimeout(() => {
      console.log(chalk.green('✓ Exited vim mode'))
    }, 50)
  }

  async processKey(key: string): Promise<boolean> {
    if (!this.isActive) {
      return false
    }

    const handled = await this.keyHandler.handleKey(key)

    if (handled) {
      await this.renderer.render()
      this.emit('stateChanged', this.state)
    }

    return handled
  }

  async executeCommand(command: string): Promise<boolean> {
    if (!this.isActive) {
      return false
    }

    const result = await this.commandProcessor.execute(command)

    if (result.success) {
      await this.renderer.render()
      this.emit('commandExecuted', command, result)
    }

    return result.success
  }

  loadBuffer(content: string): void {
    this.buffer = content.split('\n')
    this.state.buffer = this.buffer
    this.cursorPosition = { line: 0, column: 0 }
    this.state.cursor = this.cursorPosition
  }

  getBuffer(): string {
    return this.buffer.join('\n')
  }

  getCurrentMode(): VimMode {
    return this.state.mode
  }

  setMode(mode: VimMode): void {
    const previousMode = this.state.mode
    this.state.mode = mode
    this.emit('modeChanged', mode, previousMode)
  }

  getState(): Readonly<VimState> {
    return { ...this.state }
  }

  updateConfig(config: Partial<VimModeConfig>): void {
    this.config = { ...this.config, ...config }
    this.keyHandler.updateConfig(this.config)
    this.commandProcessor.updateConfig(this.config)
    this.renderer.updateConfig(this.config)
  }

  private setupEventHandlers(): void {
    this.keyHandler.on('modeChange', (mode: VimMode) => {
      this.setMode(mode)
    })

    this.keyHandler.on('cursorMove', (position: CursorPosition) => {
      this.cursorPosition = position
      this.state.cursor = position
    })

    this.commandProcessor.on('bufferChange', (content: string[]) => {
      this.buffer = content
      this.state.buffer = content
    })

    this.commandProcessor.on('quit', () => {
      this.deactivate()
    })

    this.commandProcessor.on('aiRequest', async (prompt: string) => {
      if (this.config.aiIntegration) {
        this.emit('aiRequest', prompt)
      }
    })
  }

  async handleAIResponse(response: string): Promise<void> {
    if (!this.isActive || !this.config.aiIntegration) {
      return
    }

    await this.commandProcessor.insertAIResponse(response)
    await this.renderer.render()
  }

  destroy(): void {
    this.deactivate()
    this.keyHandler.removeAllListeners()
    this.commandProcessor.removeAllListeners()
    this.renderer.destroy()
    this.removeAllListeners()
  }

  // ============== CLI MODE MANAGEMENT ==============

  /**
   * Enter vim mode with proper CLI component suspension
   */
  private async enterVimMode(promptInterface?: readline.Interface, restoreCallback?: () => void): Promise<void> {
    if (this.cliModeState.current === 'vim') {
      return
    }

    this.cliModeState.isTransitioning = true
    this.cliModeState.previous = this.cliModeState.current
    this.cliModeState.current = 'vim'

    this.promptInterface = promptInterface
    this.restoreCallback = restoreCallback

    // Suspend ALL CLI components ONLY when entering vim
    this.suspendAllCliComponents()

    this.emit('cliModeChange', this.cliModeState.previous, 'vim')
    this.cliModeState.isTransitioning = false
  }

  /**
   * Exit vim mode and restore CLI components
   */
  private async exitVimMode(): Promise<void> {
    if (this.cliModeState.current !== 'vim') {
      return
    }

    this.cliModeState.isTransitioning = true

    // Restore ALL CLI components
    this.restoreAllCliComponents()

    // Return to previous mode
    const previousMode = this.cliModeState.previous || 'default'
    this.cliModeState.current = previousMode
    this.cliModeState.previous = null

    this.promptInterface = undefined
    this.restoreCallback = undefined

    this.emit('cliModeChange', 'vim', previousMode)
    this.cliModeState.isTransitioning = false
  }

  /**
   * Suspend all CLI components (blessed + prompt + listeners)
   */
  private suspendAllCliComponents(): void {
    // Suspend blessed components from other CLI modes
    this.suspendBlessedComponents()

    // Suspend prompt interface
    if (this.promptInterface) {
      this.suspendPromptInterface()
    }

    // Deactivate all non-vim listeners
    this.deactivateListeners()
  }

  /**
   * Restore all CLI components
   */
  private restoreAllCliComponents(): void {
    // Restore blessed components
    this.restoreBlessedComponents()

    // Restore prompt interface
    this.restorePromptInterface()

    // Reactivate listeners based on current mode
    this.reactivateListeners()
  }

  /**
   * Suspend blessed components from other CLI modes
   */
  private suspendBlessedComponents(): void {
    if (this.componentState.blessedSuspended) return

    // Find and suspend blessed components from plan mode, chat UI, etc.
    const globalComponents = [
      (global as any).screen,
      (global as any).progressBar,
      (global as any).statusLine,
      (global as any).chatInterface,
      (global as any).planInterface,
      (global as any).advancedCliUI,
    ]

    globalComponents.forEach((component) => {
      if (component && typeof component.hide === 'function') {
        try {
          this.componentState.suspendedComponents.add(component)
          component.hide()
        } catch (error) {
          // Silently handle component suspension errors
        }
      }
    })

    this.componentState.blessedSuspended = true
  }

  /**
   * Restore blessed components
   */
  private restoreBlessedComponents(): void {
    if (!this.componentState.blessedSuspended) return

    this.componentState.suspendedComponents.forEach((component) => {
      try {
        if (component && typeof component.show === 'function') {
          component.show()
        }
      } catch (error) {
        // Silently handle component restoration errors
      }
    })

    this.componentState.suspendedComponents.clear()
    this.componentState.blessedSuspended = false
  }

  /**
   * Suspend prompt interface ONLY when vim is active
   */
  private suspendPromptInterface(): void {
    if (this.componentState.promptSuspended || !this.promptInterface) return

    try {
      // Pause the prompt interface
      if (typeof this.promptInterface.pause === 'function') {
        this.promptInterface.pause()
      }

      // Clear current prompt line
      if (typeof this.promptInterface.write === 'function') {
        this.promptInterface.write('\x1b[2K\r') // Clear line and return to start
      }

      this.componentState.promptSuspended = true
    } catch (error) {
      console.error(chalk.red('Error suspending prompt:'), error)
    }
  }

  /**
   * Restore prompt interface when exiting vim
   */
  private restorePromptInterface(): void {
    if (!this.componentState.promptSuspended || !this.promptInterface) return

    try {
      // Resume the prompt interface
      if (typeof this.promptInterface.resume === 'function') {
        this.promptInterface.resume()
      }

      // Execute restore callback if provided
      if (this.restoreCallback) {
        this.restoreCallback()
      }

      this.componentState.promptSuspended = false
    } catch (error) {
      console.error(chalk.red('Error restoring prompt:'), error)
    }
  }

  /**
   * Deactivate listeners during vim mode
   */
  private deactivateListeners(): void {
    if (!this.componentState.listenersActive) return

    // Store and remove process listeners
    const processEvents = ['SIGINT', 'SIGTERM', 'uncaughtException']
    processEvents.forEach((event) => {
      const listeners = process.listeners(event as any)
      if (listeners.length > 0) {
        this.componentState.suspendedListeners.set(`process_${event}`, [...listeners])
        process.removeAllListeners(event as any)
      }
    })

    // Store and remove readline listeners
    if (this.promptInterface) {
      const readlineEvents = ['line', 'keypress', 'close', 'SIGINT']
      readlineEvents.forEach((event) => {
        const listeners = this.promptInterface!.listeners(event)
        if (listeners.length > 0) {
          this.componentState.suspendedListeners.set(`readline_${event}`, [...listeners])
          this.promptInterface!.removeAllListeners(event)
        }
      })
    }

    this.componentState.listenersActive = false
  }

  /**
   * Reactivate listeners based on current CLI mode
   */
  private reactivateListeners(): void {
    if (this.componentState.listenersActive) return

    // Restore all suspended listeners
    this.componentState.suspendedListeners.forEach((listeners, key) => {
      if (key.startsWith('process_')) {
        const event = key.replace('process_', '')
        listeners.forEach((listener) => {
          process.on(event as any, listener)
        })
      } else if (key.startsWith('readline_')) {
        const event = key.replace('readline_', '')
        if (this.promptInterface) {
          listeners.forEach((listener) => {
            this.promptInterface!.on(event, listener)
          })
        }
      }
    })

    this.componentState.suspendedListeners.clear()
    this.componentState.listenersActive = true
  }

  /**
   * Get current CLI mode
   */
  public getCurrentCliMode(): string {
    return this.cliModeState.current
  }

  /**
   * Check if vim mode is active
   */
  public isVimModeActive(): boolean {
    return this.cliModeState.current === 'vim' && this.isActive
  }

  /**
   * Force CLI mode transition (emergency)
   */
  public forceCliModeTo(mode: 'default' | 'plan' | 'vim'): void {
    if (this.cliModeState.isTransitioning) {
      console.log(chalk.yellow('⚠️ CLI mode transition already in progress'))
      return
    }

    const previousMode = this.cliModeState.current
    this.cliModeState.previous = previousMode
    this.cliModeState.current = mode

    if (previousMode === 'vim' && mode !== 'vim') {
      this.exitVimMode()
    }

    this.emit('cliModeChange', previousMode, mode)
  }

  /**
   * Ensure CLI mode consistency
   */
  public ensureCliModeConsistency(): void {
    // Clean up stale vim mode if no vim processes
    if (this.cliModeState.current === 'vim' && !this.isActive) {
      console.log(chalk.yellow('🔧 Cleaning up stale vim mode'))
      this.forceCliModeTo('default')
    }

    // Ensure components are in correct state for current mode
    if (this.cliModeState.current !== 'vim') {
      if (this.componentState.blessedSuspended) {
        this.restoreBlessedComponents()
      }
      if (!this.componentState.listenersActive) {
        this.reactivateListeners()
      }
    }
  }

  /**
   * Setup mode-specific behavior based on CLI mode
   */
  public setupModeSpecificBehavior(mode: 'default' | 'plan' | 'vim'): void {
    this.cliModeState.current = mode

    switch (mode) {
      case 'vim':
        // Vim mode: suspended CLI, vim UI active
        break
      case 'plan':
        // Plan mode: streaming interface, progress tracking
        this.ensureListenersForPlanMode()
        break
      case 'default':
        // Default mode: full CLI interface
        this.ensureListenersForDefaultMode()
        break
    }
  }

  /**
   * Ensure listeners are configured for plan mode
   */
  private ensureListenersForPlanMode(): void {
    if (this.componentState.listenersActive && this.cliModeState.current === 'plan') {
      this.emit('planModeReady')
    }
  }

  /**
   * Ensure listeners are configured for default mode
   */
  private ensureListenersForDefaultMode(): void {
    if (this.componentState.listenersActive && this.cliModeState.current === 'default') {
      this.emit('defaultModeReady')
    }
  }
}
