import { EventEmitter } from 'node:events'
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

export class VimModeManager extends EventEmitter {
  private state: VimState
  private keyHandler: VimKeyHandler
  private commandProcessor: VimCommandProcessor
  private renderer: VimRenderer
  private config: VimModeConfig
  private isActive: boolean = false
  private buffer: string[] = []
  private cursorPosition: CursorPosition = { line: 0, column: 0 }

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

  async activate(): Promise<void> {
    if (this.isActive) {
      CliUI.logWarning('Vim mode already active')
      return
    }

    this.isActive = true
    this.state.mode = VimMode.NORMAL

    await this.renderer.render()
    this.emit('activated')

    CliUI.logInfo('Entered vim mode - Press ESC for normal mode, :q to quit')
  }

  async deactivate(): Promise<void> {
    if (!this.isActive) {
      return
    }

    this.isActive = false
    await this.renderer.clear()
    this.emit('deactivated')

    CliUI.logInfo('Exited vim mode')
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
}
