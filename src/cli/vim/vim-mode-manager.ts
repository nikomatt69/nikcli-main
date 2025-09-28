import { EventEmitter } from 'node:events'
import blessed from 'blessed'
import chalk from 'chalk'
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
    private screen?: blessed.Widgets.Screen
    private editor?: blessed.Widgets.TextareaElement
    private statusBar?: blessed.Widgets.BoxElement

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

        // Clear screen completely and hide cursor before setting up UI
        process.stdout.write('\u001B[2J')    // Clear entire screen
        process.stdout.write('\u001B[H')     // Move cursor to home
        process.stdout.write('\u001B[?25l')  // Hide cursor

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
            warnings: false
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
                    fg: 'cyan'
                }
            },
            border: {
                type: 'line',
                fg: 'cyan' as any
            },
            content: this.buffer.join('\n')
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
                fg: 'white'
            },
            content: this.getStatusText()
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
        process.stdout.write('\u001B[2J')    // Clear entire screen
        process.stdout.write('\u001B[H')     // Move cursor to home
        process.stdout.write('\u001B[?25h')  // Show cursor

        await this.renderer.clear()
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
}
