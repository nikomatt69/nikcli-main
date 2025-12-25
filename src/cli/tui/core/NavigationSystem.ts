/**
 * Navigation System
 * Handles keyboard and mouse navigation for TUI
 */

import { type ElementManager, elementManager } from '../elements/base/ElementManager'
import { type FocusManager, focusManager } from '../elements/base/FocusManager'
import { eventBus } from './EventBus'
import { tuiState } from './TUIState'

export interface NavigationConfig {
  wrapAround?: boolean
  cycleTabs?: boolean
  mouseEnabled?: boolean
  viMode?: boolean
  keyBindings?: Record<string, () => void>
}

export class NavigationSystem {
  private config: NavigationConfig
  private keyBindings = new Map<string, () => void>()

  constructor(
    private elementManager: ElementManager,
    private focusManager: FocusManager,
    config: NavigationConfig = {}
  ) {
    this.config = {
      wrapAround: true,
      cycleTabs: true,
      mouseEnabled: true,
      viMode: false,
      ...config,
    }

    this.setupDefaultKeyBindings()
    this.setupEventHandlers()
  }

  private setupDefaultKeyBindings(): void {
    // Global navigation
    this.registerKeyBinding('escape', () => this.exitTUI())
    this.registerKeyBinding('q', () => this.exitTUI())
    this.registerKeyBinding('C-c', () => this.exitTUI())

    // Tab navigation
    this.registerKeyBinding('tab', () => this.focusManager.focusNext())
    this.registerKeyBinding('S-tab', () => this.focusManager.focusPrevious())

    // Arrow key navigation
    this.registerKeyBinding('up', () => this.focusManager.focusPrevious())
    this.registerKeyBinding('down', () => this.focusManager.focusNext())
    this.registerKeyBinding('left', () => this.focusPreviousPanel())
    this.registerKeyBinding('right', () => this.focusNextPanel())

    // Panel management
    this.registerKeyBinding('C-w', () => this.closeCurrentPanel())
    this.registerKeyBinding('C-s', () => this.splitCurrentPanel())
    this.registerKeyBinding('C-p', () => this.pinCurrentPanel())

    // Layout switching
    this.registerKeyBinding('1', () => this.switchLayout('single'))
    this.registerKeyBinding('2', () => this.switchLayout('dual'))
    this.registerKeyBinding('3', () => this.switchLayout('triple'))
    this.registerKeyBinding('4', () => this.switchLayout('quad'))
    this.registerKeyBinding('r', () => this.resetLayout())

    // Focus management
    this.registerKeyBinding('C-g', () => this.toggleGlobalFocusMode())
    this.registerKeyBinding('C-n', () => this.focusManager.focusNextInHistory())
    this.registerKeyBinding('C-p', () => this.focusManager.focusPreviousInHistory())

    // Help
    this.registerKeyBinding('h', () => this.showHelp())
    this.registerKeyBinding('?', () => this.showHelp())
  }

  private setupEventHandlers(): void {
    // Listen to terminal resize
    eventBus.on('tui:size:changed', (size: any) => {
      this.handleResize(size.width, size.height)
    })

    // Listen to layout changes
    eventBus.on('tui:layout:changed', () => {
      this.onLayoutChanged()
    })
  }

  /**
   * Handle keyboard input
   */
  handleKey(key: string): boolean {
    // Try custom key bindings first
    if (this.keyBindings.has(key)) {
      const handler = this.keyBindings.get(key)!
      handler()
      return true
    }

    // Try element input handling
    const focusedElement = this.elementManager.getFocusedElement()
    if (focusedElement) {
      return focusedElement.handleInput(key)
    }

    return false
  }

  /**
   * Handle mouse click
   */
  handleClick(x: number, y: number): boolean {
    if (!this.config.mouseEnabled) return false

    // First try to focus element at click position
    const clicked = this.focusManager.handleClick(x, y)
    if (clicked) return true

    // Then try mouse handling on focused element
    const focusedElement = this.elementManager.getFocusedElement()
    if (focusedElement) {
      return focusedElement.handleMouse({ x, y, type: 'click' })
    }

    return false
  }

  /**
   * Handle mouse wheel
   */
  handleWheel(x: number, y: number, direction: 'up' | 'down'): boolean {
    if (!this.config.mouseEnabled) return false

    const element = this.elementManager.findElementAt(x, y)
    if (element) {
      return element.handleMouse({ x, y, type: 'wheel', direction })
    }

    return false
  }

  /**
   * Register custom key binding
   */
  registerKeyBinding(key: string, handler: () => void): void {
    this.keyBindings.set(key, handler)
  }

  /**
   * Unregister key binding
   */
  unregisterKeyBinding(key: string): void {
    this.keyBindings.delete(key)
  }

  /**
   * Focus previous panel
   */
  private focusPreviousPanel(): boolean {
    const state = tuiState.getState()
    const panels = state.layout.panels

    if (panels.length === 0) return false

    const currentPanel = state.focus.panelId
    const currentIndex = currentPanel ? panels.indexOf(currentPanel) : -1

    let prevIndex: number
    if (currentIndex === -1 || currentIndex === 0) {
      prevIndex = this.config.wrapAround ? panels.length - 1 : 0
    } else {
      prevIndex = currentIndex - 1
    }

    const prevPanelId = panels[prevIndex]
    tuiState.updateFocus(null, prevPanelId)

    // Focus first focusable element in panel
    const panelElements = this.elementManager.getElementsByType('panel').filter((el) => el.getId() === prevPanelId)

    if (panelElements.length > 0) {
      this.elementManager.setFocusedElement(panelElements[0].getId())
      return true
    }

    return false
  }

  /**
   * Focus next panel
   */
  private focusNextPanel(): boolean {
    const state = tuiState.getState()
    const panels = state.layout.panels

    if (panels.length === 0) return false

    const currentPanel = state.focus.panelId
    const currentIndex = currentPanel ? panels.indexOf(currentPanel) : -1

    let nextIndex: number
    if (currentIndex === -1 || currentIndex === panels.length - 1) {
      nextIndex = this.config.wrapAround ? 0 : currentIndex
    } else {
      nextIndex = currentIndex + 1
    }

    const nextPanelId = panels[nextIndex]
    tuiState.updateFocus(null, nextPanelId)

    // Focus first focusable element in panel
    const panelElements = this.elementManager.getElementsByType('panel').filter((el) => el.getId() === nextPanelId)

    if (panelElements.length > 0) {
      this.elementManager.setFocusedElement(panelElements[0].getId())
      return true
    }

    return false
  }

  /**
   * Close current panel
   */
  private closeCurrentPanel(): void {
    const state = tuiState.getState()
    const currentPanel = state.focus.panelId

    if (currentPanel) {
      tuiState.removePanel(currentPanel)
      eventBus.emit('tui:panel:close', { panelId: currentPanel })
    }
  }

  /**
   * Split current panel
   */
  private splitCurrentPanel(): void {
    const state = tuiState.getState()
    const currentPanel = state.focus.panelId

    if (currentPanel) {
      eventBus.emit('tui:panel:split', { panelId: currentPanel })
    }
  }

  /**
   * Pin/unpin current panel
   */
  private pinCurrentPanel(): void {
    const state = tuiState.getState()
    const currentPanel = state.focus.panelId

    if (currentPanel) {
      eventBus.emit('tui:panel:togglePin', { panelId: currentPanel })
    }
  }

  /**
   * Switch layout mode
   */
  private switchLayout(mode: 'single' | 'dual' | 'triple' | 'quad'): void {
    tuiState.updateLayout(mode)
    eventBus.emit('tui:layout:switch', { mode })
  }

  /**
   * Reset to auto-layout
   */
  private resetLayout(): void {
    tuiState.updateLayout('custom')
    eventBus.emit('tui:layout:reset', {})
  }

  /**
   * Toggle global focus mode
   */
  private toggleGlobalFocusMode(): void {
    eventBus.emit('tui:focus:toggleGlobal', {})
  }

  /**
   * Show help
   */
  private showHelp(): void {
    eventBus.emit('tui:help:show', {})
  }

  /**
   * Exit TUI
   */
  private exitTUI(): void {
    eventBus.emit('tui:exit', {})
  }

  /**
   * Handle terminal resize
   */
  private handleResize(width: number, height: number): void {
    // TODO: Implement resize handling
    // Adjust layout based on new terminal size
  }

  /**
   * Handle layout change
   */
  private onLayoutChanged(): void {
    // Auto-focus first panel if needed
    const state = tuiState.getState()
    if (!state.focus.panelId && state.layout.panels.length > 0) {
      this.focusNextPanel()
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<NavigationConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current configuration
   */
  getConfig(): NavigationConfig {
    return { ...this.config }
  }

  /**
   * Get all registered key bindings
   */
  getKeyBindings(): Record<string, () => void> {
    const bindings: Record<string, () => void> = {}
    this.keyBindings.forEach((handler, key) => {
      bindings[key] = handler
    })
    return bindings
  }
}

// Global navigation system instance
export const navigationSystem = new NavigationSystem(elementManager, focusManager)
