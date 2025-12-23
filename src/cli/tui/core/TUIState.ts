/**
 * TUI State Management
 * Global state for TUI application
 */

import { eventBus } from './EventBus'

export interface TUISize {
  width: number
  height: number
}

export interface TUIFocus {
  elementId: string | null
  panelId: string | null
}

export interface TUILayout {
  mode: 'single' | 'dual' | 'triple' | 'quad' | 'custom'
  activePanel: string | null
  panels: string[]
}

export interface TUITheme {
  name: string
  colors: {
    primary: string
    secondary: string
    success: string
    warning: string
    error: string
    info: string
    muted: string
    background: string
    foreground: string
  }
}

export interface TUIStatus {
  isRunning: boolean
  isLoading: boolean
  message: string | null
}

export interface TUIState {
  // Screen
  size: TUISize

  // Focus
  focus: TUIFocus

  // Layout
  layout: TUILayout

  // Theme
  theme: TUITheme

  // Status
  status: TUIStatus

  // Panels
  panels: Map<string, any>

  // Elements
  elements: Map<string, any>
}

export class TUIStateManager {
  private state: TUIState

  constructor() {
    this.state = this.getInitialState()
  }

  private getInitialState(): TUIState {
    return {
      size: { width: 80, height: 24 },
      focus: { elementId: null, panelId: null },
      layout: { mode: 'single', activePanel: null, panels: [] },
      theme: {
        name: 'default',
        colors: {
          primary: 'cyan',
          secondary: 'blue',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          info: 'magenta',
          muted: 'gray',
          background: 'black',
          foreground: 'white'
        }
      },
      status: {
        isRunning: false,
        isLoading: false,
        message: null
      },
      panels: new Map(),
      elements: new Map()
    }
  }

  /**
   * Get current state
   */
  getState(): Readonly<TUIState> {
    return this.state
  }

  /**
   * Update screen size
   */
  updateSize(width: number, height: number): void {
    this.state.size = { width, height }
    eventBus.emit('tui:size:changed', this.state.size)
  }

  /**
   * Update focus
   */
  updateFocus(elementId: string | null, panelId: string | null = null): void {
    this.state.focus = { elementId, panelId }
    eventBus.emit('tui:focus:changed', this.state.focus)
  }

  /**
   * Update layout
   */
  updateLayout(mode: TUILayout['mode'], activePanel: string | null = null): void {
    this.state.layout.mode = mode
    this.state.layout.activePanel = activePanel
    eventBus.emit('tui:layout:changed', this.state.layout)
  }

  /**
   * Add panel to layout
   */
  addPanel(panelId: string): void {
    if (!this.state.layout.panels.includes(panelId)) {
      this.state.layout.panels.push(panelId)
      eventBus.emit('tui:panel:added', panelId)
    }
  }

  /**
   * Remove panel from layout
   */
  removePanel(panelId: string): void {
    const index = this.state.layout.panels.indexOf(panelId)
    if (index > -1) {
      this.state.layout.panels.splice(index, 1)
      if (this.state.layout.activePanel === panelId) {
        this.state.layout.activePanel = null
      }
      eventBus.emit('tui:panel:removed', panelId)
    }
  }

  /**
   * Update theme
   */
  updateTheme(theme: TUITheme): void {
    this.state.theme = theme
    eventBus.emit('tui:theme:changed', theme)
  }

  /**
   * Update status
   */
  updateStatus(status: Partial<TUIStatus>): void {
    this.state.status = { ...this.state.status, ...status }
    eventBus.emit('tui:status:changed', this.state.status)
  }

  /**
   * Register panel
   */
  registerPanel(id: string, panel: any): void {
    this.state.panels.set(id, panel)
  }

  /**
   * Unregister panel
   */
  unregisterPanel(id: string): void {
    this.state.panels.delete(id)
  }

  /**
   * Register element
   */
  registerElement(id: string, element: any): void {
    this.state.elements.set(id, element)
  }

  /**
   * Unregister element
   */
  unregisterElement(id: string): void {
    this.state.elements.delete(id)
  }

  /**
   * Get panel by ID
   */
  getPanel(id: string): any {
    return this.state.panels.get(id)
  }

  /**
   * Get element by ID
   */
  getElement(id: string): any {
    return this.state.elements.get(id)
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state = this.getInitialState()
    eventBus.emit('tui:reset', null)
  }
}

// Global state manager instance
export const tuiState = new TUIStateManager()
