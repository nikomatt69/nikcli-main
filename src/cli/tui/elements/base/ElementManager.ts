/**
 * Element Manager
 * Manages lifecycle and registry of all TUI elements
 */

import { BaseElement } from './BaseElement'
import { eventBus } from '../../core/EventBus'
import { tuiState } from '../../core/TUIState'

export class ElementManager {
  private elements = new Map<string, BaseElement>()
  private elementTypes = new Map<string, () => BaseElement>()

  /**
   * Register element type
   */
  registerElementType(
    type: string,
    factory: () => BaseElement
  ): void {
    this.elementTypes.set(type, factory)
  }

  /**
   * Create element by type
   */
  createElement(
    type: string,
    config: any,
    eventBus: any,
    theme: any
  ): BaseElement {
    const factory = this.elementTypes.get(type)
    if (!factory) {
      throw new Error(`Unknown element type: ${type}`)
    }

    const element = factory()
    ;(element as any).config = config
    ;(element as any).eventBus = eventBus
    ;(element as any).theme = theme

    return element
  }

  /**
   * Register element
   */
  registerElement(element: BaseElement): void {
    const id = element.getId()
    if (this.elements.has(id)) {
      console.warn(`Element with ID ${id} already registered, replacing...`)
      this.unregisterElement(id)
    }

    this.elements.set(id, element)
    tuiState.registerElement(id, element)

    eventBus.emit('tui:element:registered', {
      id,
      type: element.getType()
    })
  }

  /**
   * Unregister element
   */
  unregisterElement(id: string): void {
    const element = this.elements.get(id)
    if (!element) return

    element.destroy()
    this.elements.delete(id)
    tuiState.unregisterElement(id)

    eventBus.emit('tui:element:unregistered', { id })
  }

  /**
   * Get element by ID
   */
  getElement(id: string): BaseElement | undefined {
    return this.elements.get(id)
  }

  /**
   * Get all elements
   */
  getAllElements(): BaseElement[] {
    return Array.from(this.elements.values())
  }

  /**
   * Get elements by type
   */
  getElementsByType(type: string): BaseElement[] {
    return this.getAllElements().filter(el => el.getType() === type)
  }

  /**
   * Get focusable elements
   */
  getFocusableElements(): BaseElement[] {
    return this.getAllElements().filter(el => {
      const config = el.getConfig()
      return config.focusable !== false && el.isElementVisible()
    })
  }

  /**
   * Find element at position (x, y)
   */
  findElementAt(x: number, y: number): BaseElement | null {
    // Find the topmost element at the given position
    const elements = this.getAllElements()
      .filter(el => el.isElementVisible())
      .sort((a, b) => {
        // Z-index sorting (later elements are on top)
        const aIndex = this.getElementZIndex(a.getId())
        const bIndex = this.getElementZIndex(b.getId())
        return bIndex - aIndex
      })

    for (const element of elements) {
      if (this.isElementAtPosition(element, x, y)) {
        return element
      }
    }

    return null
  }

  /**
   * Check if element is at position
   */
  private isElementAtPosition(element: BaseElement, x: number, y: number): boolean {
    const config = element.getConfig()
    const el = element.getElement()

    // TODO: Implement proper position checking based on element geometry
    // For now, return true if element has focus
    return element.isElementFocused()
  }

  /**
   * Get element z-index (for layering)
   */
  private getElementZIndex(id: string): number {
    // TODO: Implement proper z-index management
    // For now, use hash of ID
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Destroy all elements
   */
  destroyAll(): void {
    this.elements.forEach(element => element.destroy())
    this.elements.clear()
    tuiState.reset()
  }

  /**
   * Update all elements (render loop)
   */
  updateAll(): void {
    this.elements.forEach(element => {
      if (element.isElementVisible()) {
        // Trigger update if needed
        // This will be called from the main render loop
      }
    })
  }

  /**
   * Handle global key event
   */
  handleKey(key: string): boolean {
    const focusedElement = this.getFocusedElement()
    if (focusedElement) {
      return focusedElement.handleInput(key)
    }
    return false
  }

  /**
   * Get focused element
   */
  getFocusedElement(): BaseElement | null {
    const state = tuiState.getState()
    if (state.focus.elementId) {
      return this.getElement(state.focus.elementId) || null
    }
    return null
  }

  /**
   * Set focused element
   */
  setFocusedElement(id: string | null): void {
    const currentFocused = this.getFocusedElement()
    if (currentFocused) {
      currentFocused.blur()
    }

    if (id) {
      const element = this.getElement(id)
      if (element) {
        element.focus()
        tuiState.updateFocus(id)
      }
    } else {
      tuiState.updateFocus(null)
    }
  }

  /**
   * Focus next element
   */
  focusNext(): void {
    const focusableElements = this.getFocusableElements()
    if (focusableElements.length === 0) return

    const currentFocused = this.getFocusedElement()
    const currentIndex = currentFocused
      ? focusableElements.findIndex(el => el.getId() === currentFocused.getId())
      : -1

    const nextIndex = (currentIndex + 1) % focusableElements.length
    const nextElement = focusableElements[nextIndex]

    this.setFocusedElement(nextElement.getId())
  }

  /**
   * Focus previous element
   */
  focusPrevious(): void {
    const focusableElements = this.getFocusableElements()
    if (focusableElements.length === 0) return

    const currentFocused = this.getFocusedElement()
    const currentIndex = currentFocused
      ? focusableElements.findIndex(el => el.getId() === currentFocused.getId())
      : -1

    const prevIndex = currentIndex <= 0
      ? focusableElements.length - 1
      : currentIndex - 1
    const prevElement = focusableElements[prevIndex]

    this.setFocusedElement(prevElement.getId())
  }

  /**
   * Get element count
   */
  getElementCount(): number {
    return this.elements.size
  }

  /**
   * Check if element exists
   */
  hasElement(id: string): boolean {
    return this.elements.has(id)
  }
}

// Global element manager instance
export const elementManager = new ElementManager()
