/**
 * Focus Manager
 * Manages focus navigation between TUI elements
 */

import { BaseElement } from './BaseElement'
import { elementManager } from './ElementManager'
import { eventBus } from '../../core/EventBus'
import { tuiState } from '../../core/TUIState'

export interface FocusConfig {
  wrapAround?: boolean
  cycleTabs?: boolean
  mouseEnabled?: boolean
  autoFocus?: boolean
}

export class FocusManager {
  private config: FocusConfig
  private focusHistory: string[] = []
  private currentFocusIndex = -1

  constructor(config: FocusConfig = {}) {
    this.config = {
      wrapAround: true,
      cycleTabs: true,
      mouseEnabled: true,
      autoFocus: true,
      ...config
    }

    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    // Listen to element focus events
    eventBus.on('tui:element:focused', (data: any) => {
      this.onElementFocused(data.id)
    })

    // Listen to layout changes
    eventBus.on('tui:layout:changed', () => {
      this.onLayoutChanged()
    })

    // Listen to panel changes
    eventBus.on('tui:panel:added', () => {
      this.onPanelChanged()
    })

    eventBus.on('tui:panel:removed', () => {
      this.onPanelChanged()
    })
  }

  private onElementFocused(elementId: string): void {
    // Add to focus history
    const index = this.focusHistory.indexOf(elementId)
    if (index > -1) {
      this.focusHistory.splice(index, 1)
    }
    this.focusHistory.unshift(elementId)
    this.currentFocusIndex = 0

    // Limit history size
    if (this.focusHistory.length > 50) {
      this.focusHistory.pop()
    }
  }

  private onLayoutChanged(): void {
    // Auto-focus first focusable element if no element is focused
    if (!tuiState.getState().focus.elementId && this.config.autoFocus) {
      this.focusFirst()
    }
  }

  private onPanelChanged(): void {
    // Update focus when panels change
    if (this.focusHistory.length > 0) {
      const lastFocusedId = this.focusHistory[0]
      const element = elementManager.getElement(lastFocusedId)

      if (element && element.isElementVisible() && element.getConfig().focusable !== false) {
        this.setFocus(lastFocusedId)
      } else {
        this.focusFirst()
      }
    }
  }

  /**
   * Set focus to element
   */
  setFocus(elementId: string): boolean {
    const element = elementManager.getElement(elementId)
    if (!element) {
      console.warn(`Element ${elementId} not found for focusing`)
      return false
    }

    const config = element.getConfig()
    if (config.focusable === false || !element.isElementVisible()) {
      return false
    }

    // Blur current focused element
    const currentFocused = elementManager.getFocusedElement()
    if (currentFocused) {
      currentFocused.blur()
    }

    // Focus new element
    element.focus()
    tuiState.updateFocus(elementId, elementId)

    return true
  }

  /**
   * Focus next element
   */
  focusNext(): boolean {
    const focusableElements = elementManager.getFocusableElements()
    if (focusableElements.length === 0) return false

    const currentFocused = elementManager.getFocusedElement()
    const currentIndex = currentFocused
      ? focusableElements.findIndex(el => el.getId() === currentFocused!.getId())
      : -1

    let nextIndex: number
    if (currentIndex === -1) {
      nextIndex = 0
    } else if (currentIndex === focusableElements.length - 1) {
      nextIndex = this.config.wrapAround ? 0 : currentIndex
    } else {
      nextIndex = currentIndex + 1
    }

    if (nextIndex === currentIndex) return false

    const nextElement = focusableElements[nextIndex]
    return this.setFocus(nextElement.getId())
  }

  /**
   * Focus previous element
   */
  focusPrevious(): boolean {
    const focusableElements = elementManager.getFocusableElements()
    if (focusableElements.length === 0) return false

    const currentFocused = elementManager.getFocusedElement()
    const currentIndex = currentFocused
      ? focusableElements.findIndex(el => el.getId() === currentFocused!.getId())
      : -1

    let prevIndex: number
    if (currentIndex === -1) {
      prevIndex = focusableElements.length - 1
    } else if (currentIndex === 0) {
      prevIndex = this.config.wrapAround ? focusableElements.length - 1 : 0
    } else {
      prevIndex = currentIndex - 1
    }

    if (prevIndex === currentIndex) return false

    const prevElement = focusableElements[prevIndex]
    return this.setFocus(prevElement.getId())
  }

  /**
   * Focus first focusable element
   */
  focusFirst(): boolean {
    const focusableElements = elementManager.getFocusableElements()
    if (focusableElements.length === 0) return false

    return this.setFocus(focusableElements[0].getId())
  }

  /**
   * Focus last focusable element
   */
  focusLast(): boolean {
    const focusableElements = elementManager.getFocusableElements()
    if (focusableElements.length === 0) return false

    return this.setFocus(focusableElements[focusableElements.length - 1].getId())
  }

  /**
   * Clear focus
   */
  clearFocus(): void {
    const currentFocused = elementManager.getFocusedElement()
    if (currentFocused) {
      currentFocused.blur()
      tuiState.updateFocus(null)
    }
  }

  /**
   * Get currently focused element
   */
  getFocusedElement(): BaseElement | null {
    return elementManager.getFocusedElement()
  }

  /**
   * Get focus history
   */
  getFocusHistory(): string[] {
    return [...this.focusHistory]
  }

  /**
   * Focus element from history
   */
  focusFromHistory(index: number): boolean {
    if (index < 0 || index >= this.focusHistory.length) {
      return false
    }

    const elementId = this.focusHistory[index]
    return this.setFocus(elementId)
  }

  /**
   * Focus next in history
   */
  focusNextInHistory(): boolean {
    if (this.focusHistory.length === 0) return false

    this.currentFocusIndex = Math.min(
      this.currentFocusIndex + 1,
      this.focusHistory.length - 1
    )

    return this.focusFromHistory(this.currentFocusIndex)
  }

  /**
   * Focus previous in history
   */
  focusPreviousInHistory(): boolean {
    if (this.focusHistory.length === 0) return false

    this.currentFocusIndex = Math.max(this.currentFocusIndex - 1, 0)

    return this.focusFromHistory(this.currentFocusIndex)
  }

  /**
   * Handle mouse click for focus
   */
  handleClick(x: number, y: number): boolean {
    if (!this.config.mouseEnabled) return false

    const element = elementManager.findElementAt(x, y)
    if (element) {
      const config = element.getConfig()
      if (config.focusable !== false && element.isElementVisible()) {
        return this.setFocus(element.getId())
      }
    }

    return false
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FocusConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current configuration
   */
  getConfig(): FocusConfig {
    return { ...this.config }
  }

  /**
   * Reset focus manager
   */
  reset(): void {
    this.clearFocus()
    this.focusHistory = []
    this.currentFocusIndex = -1
  }
}

// Global focus manager instance
export const focusManager = new FocusManager()
