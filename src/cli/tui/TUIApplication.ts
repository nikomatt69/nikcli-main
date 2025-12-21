/**
 * TUIApplication
 * Main TUI application that coordinates all components
 */

import { eventBus } from './core/EventBus'
import { tuiState } from './core/TUIState'
import { elementManager } from './elements/base/ElementManager'
import { focusManager } from './elements/base/FocusManager'
import { navigationSystem } from './core/NavigationSystem'
import { layoutManager } from './layout/LayoutManager'
import { streamttyAdapter } from './integration/StreamttyAdapter'
import { themeAdapter } from './integration/ThemeAdapter'
import { PanelElement } from './elements/specialized/PanelElement'
import { StreamElement } from './elements/specialized/StreamElement'
import { DiffPanel } from './elements/panels/DiffPanel'
import { TodoPanel } from './elements/panels/TodoPanel'
import { ChatPanel } from './elements/panels/ChatPanel'

export interface TUIApplicationConfig {
  title?: string
  theme?: string
  defaultLayout?: 'single' | 'dual' | 'triple' | 'quad'
  enableMouse?: boolean
  enableKeyboard?: boolean
}

export class TUIApplication {
  private isRunning = false
  private isInitialized = false
  private config: TUIApplicationConfig
  private renderTimer: NodeJS.Timeout | null = null

  constructor(config: TUIApplicationConfig = {}) {
    this.config = {
      title: 'NikCLI - Terminal UI',
      theme: 'default',
      defaultLayout: 'single',
      enableMouse: true,
      enableKeyboard: true,
      ...config
    }
  }

  /**
   * Initialize the TUI application
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('TUIApplication already initialized')
      return
    }

    try {
      // Setup event handlers
      this.setupEventHandlers()

      // Initialize theme
      if (this.config.theme) {
        themeAdapter.setTheme(this.config.theme)
      }

      // Setup default layout
      layoutManager.applyLayout(this.config.defaultLayout || 'single')

      // Connect integrations
      streamttyAdapter.connect()

      // Register element types
      this.registerElementTypes()

      // Create default panels
      this.createDefaultPanels()

      // Mark as initialized
      this.isInitialized = true

      console.log('TUIApplication initialized successfully')
    } catch (error) {
      console.error('Failed to initialize TUIApplication:', error)
      throw error
    }
  }

  /**
   * Setup global event handlers
   */
  private setupEventHandlers(): void {
    // Handle exit
    eventBus.on('tui:exit', () => {
      this.exit()
    })

    // Handle resize
    eventBus.on('tui:resize', (size: any) => {
      tuiState.updateSize(size.width, size.height)
    })

    // Handle help
    eventBus.on('tui:help:show', () => {
      this.showHelp()
    })

    // Handle errors
    eventBus.on('tui:error', (error: any) => {
      console.error('TUI Error:', error)
    })

    // Handle panel events
    eventBus.on('tui:panel:focus', (data: any) => {
      this.focusPanel(data.panelId)
    })

    eventBus.on('tui:panel:close', (data: any) => {
      this.closePanel(data.panelId)
    })

    // Handle keyboard input
    if (this.config.enableKeyboard) {
      process.stdin.on('data', (buffer) => {
        const key = buffer.toString('utf8')
        this.handleInput(key)
      })
    }

    // Handle mouse input
    if (this.config.enableMouse) {
      process.stdin.on('data', (buffer) => {
        // TODO: Parse mouse events from buffer
        // For now, just ignore mouse input
      })
    }

    // Handle cleanup on exit
    process.on('SIGINT', () => this.exit())
    process.on('SIGTERM', () => this.exit())
    process.on('exit', () => this.cleanup())
  }

  /**
   * Register element types
   */
  private registerElementTypes(): void {
    elementManager.registerElementType('panel', () => {
      return new PanelElement(
        { id: `panel-${Date.now()}`, type: 'panel' },
        eventBus,
        themeAdapter.getTheme()
      )
    })

    elementManager.registerElementType('stream', () => {
      return new StreamElement(
        { id: `stream-${Date.now()}`, type: 'stream', source: 'streamtty' },
        eventBus,
        themeAdapter.getTheme()
      )
    })

    elementManager.registerElementType('diff-panel', () => {
      return new DiffPanel(
        { id: `diff-${Date.now()}`, type: 'panel', panelType: 'diff-panel' },
        eventBus,
        themeAdapter.getTheme()
      )
    })

    elementManager.registerElementType('todo-panel', () => {
      return new TodoPanel(
        { id: `todo-${Date.now()}`, type: 'panel', panelType: 'todo-panel' },
        eventBus,
        themeAdapter.getTheme()
      )
    })

    elementManager.registerElementType('chat-panel', () => {
      return new ChatPanel(
        { id: `chat-${Date.now()}`, type: 'panel', panelType: 'chat-panel' },
        eventBus,
        themeAdapter.getTheme()
      )
    })
  }

  /**
   * Create default panels
   */
  private createDefaultPanels(): void {
    // Create main stream panel
    const streamPanel = elementManager.createElement(
      'stream',
      {
        id: 'main-stream',
        type: 'stream',
        source: 'streamtty',
        title: 'Output',
        width: '100%',
        height: '70%'
      },
      eventBus,
      themeAdapter.getTheme()
    )
    elementManager.registerElement(streamPanel)

    // Create chat panel
    const chatPanel = elementManager.createElement(
      'chat-panel',
      {
        id: 'chat-panel',
        type: 'chat-panel',
        title: 'AI Chat',
        width: '100%',
        height: '30%',
        pinned: true
      },
      eventBus,
      themeAdapter.getTheme()
    )
    elementManager.registerElement(chatPanel)

    // Create todo panel
    const todoPanel = elementManager.createElement(
      'todo-panel',
      {
        id: 'todo-panel',
        type: 'todo-panel',
        title: 'Todos',
        width: '50%',
        height: '30%',
        pinned: true
      },
      eventBus,
      themeAdapter.getTheme()
    )
    elementManager.registerElement(todoPanel)
  }

  /**
   * Start the TUI application
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    if (this.isRunning) {
      console.warn('TUIApplication already running')
      return
    }

    this.isRunning = true
    tuiState.updateStatus({ isRunning: true })

    // Start render loop
    this.startRenderLoop()

    console.log('TUIApplication started')
    eventBus.emit('tui:started', {})

    // Keep the process running
    return new Promise(() => {
      // Never resolve, keep running until exit
    })
  }

  /**
   * Start render loop
   */
  private startRenderLoop(): void {
    const render = () => {
      if (!this.isRunning) return

      try {
        // Update all elements
        elementManager.updateAll()

        // Trigger render
        eventBus.emit('tui:render', {})

      } catch (error) {
        console.error('Error in render loop:', error)
      }

      // Schedule next frame (60 FPS)
      this.renderTimer = setTimeout(render, 16)
    }

    render()
  }

  /**
   * Stop render loop
   */
  private stopRenderLoop(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer)
      this.renderTimer = null
    }
  }

  /**
   * Handle keyboard input
   */
  private handleInput(key: string): void {
    if (!this.isRunning) return

    // Handle special keys
    const normalizedKey = this.normalizeKey(key)

    // Try navigation system first
    const handled = navigationSystem.handleKey(normalizedKey)
    if (!handled) {
      // Try focused element
      const focusedElement = elementManager.getFocusedElement()
      if (focusedElement) {
        focusedElement.handleInput(normalizedKey)
      }
    }
  }

  /**
   * Normalize key input
   */
  private normalizeKey(key: string): string {
    // Convert special key sequences
    if (key === '\r' || key === '\n') {
      return 'enter'
    } else if (key === '\x1b[A') {
      return 'up'
    } else if (key === '\x1b[B') {
      return 'down'
    } else if (key === '\x1b[C') {
      return 'right'
    } else if (key === '\x1b[D') {
      return 'left'
    } else if (key === '\x1b') {
      return 'escape'
    } else if (key === '\t') {
      return 'tab'
    }

    return key
  }

  /**
   * Show help
   */
  private showHelp(): void {
    const help = `
NikCLI TUI - Help

Global Navigation:
  ESC, q, Ctrl+C     Exit TUI
  Tab                Next element
  h, ?               Show this help

Panel Management:
  Ctrl+W             Close current panel
  Ctrl+S             Split current panel
  Ctrl+P             Pin/unpin panel

Layout:
  1                  Single layout
  2                  Dual layout
  3                  Triple layout
  4                  Quad layout
  r                  Reset layout

Focus:
  Ctrl+G             Global focus mode
  Ctrl+N             Next in history
  Ctrl+P             Previous in history

Press any key to close this help.
`

    console.log(help)

    // Wait for key press to close help
    process.stdin.once('data', () => {
      // Help closed, continue
    })
  }

  /**
   * Focus panel
   */
  private focusPanel(panelId: string): void {
    const panel = tuiState.getPanel(panelId)
    if (panel) {
      elementManager.setFocusedElement(panel.getId())
    }
  }

  /**
   * Close panel
   */
  private closePanel(panelId: string): void {
    tuiState.removePanel(panelId)
    elementManager.unregisterElement(panelId)
  }

  /**
   * Exit the application
   */
  async exit(): Promise<void> {
    if (!this.isRunning) return

    console.log('Exiting TUI...')

    this.isRunning = false
    this.stopRenderLoop()
    this.cleanup()

    process.exit(0)
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Destroy all elements
    elementManager.destroyAll()

    // Clear event bus
    eventBus.clear()

    // Update state
    tuiState.updateStatus({ isRunning: false })

    console.log('TUIApplication cleaned up')
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean
    isInitialized: boolean
    elementCount: number
    theme: string
  } {
    return {
      isRunning: this.isRunning,
      isInitialized: this.isInitialized,
      elementCount: elementManager.getElementCount(),
      theme: themeAdapter.getTheme().name
    }
  }

  /**
   * Get element manager
   */
  getElementManager(): typeof elementManager {
    return elementManager
  }

  /**
   * Get navigation system
   */
  getNavigationSystem(): typeof navigationSystem {
    return navigationSystem
  }

  /**
   * Get layout manager
   */
  getLayoutManager(): typeof layoutManager {
    return layoutManager
  }

  /**
   * Get streamtty adapter
   */
  getStreamttyAdapter(): typeof streamttyAdapter {
    return streamttyAdapter
  }

  /**
   * Get theme adapter
   */
  getThemeAdapter(): typeof themeAdapter {
    return themeAdapter
  }
}

// Global application instance
export const tuiApplication = new TUIApplication()
