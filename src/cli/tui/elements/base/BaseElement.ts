/**
 * Base Element for OpenTUI
 * Abstract base class for all TUI elements
 */

// OpenTUI Element interface (mock for now, will use @opentui/core later)
export interface OpenTUIElement {
  id: string
  type: string
  parent: OpenTUIElement | null
  children: OpenTUIElement[]
  props: Record<string, any>
  text?: string
  visible: boolean
  focused: boolean
  width?: number | string
  height?: number | string

  append(child: OpenTUIElement): void
  remove(child: OpenTUIElement): void
  clear(): void
  focus(): void
  blur(): void
  show(): void
  hide(): void
  update(props: Record<string, any>): void
  destroy(): void
}

export interface ElementConfig {
  id: string
  type: string
  title?: string
  text?: string
  width?: number | string
  height?: number | string
  left?: number | string
  top?: number | string
  border?: {
    type?: 'line' | 'bg' | 'none'
    fg?: string
    bg?: string
  }
  style?: {
    fg?: string
    bg?: string
    border?: {
      fg?: string
    }
    [key: string]: any
  }
  scrollable?: boolean
  focusable?: boolean
  hidden?: boolean
}

export abstract class BaseElement {
  protected element: OpenTUIElement
  protected config: ElementConfig
  protected eventBus: any
  protected theme: any
  protected isFocused = false
  protected isVisible = true
  protected parent: BaseElement | null = null
  protected children: BaseElement[] = []

  constructor(config: ElementConfig, eventBus: any, theme: any) {
    this.config = { ...config }
    this.eventBus = eventBus
    this.theme = theme
    this.element = this.createElement()
  }

  /**
   * Create OpenTUI element (to be implemented by subclasses)
   */
  protected abstract createElement(): OpenTUIElement

  /**
   * Get the OpenTUI element
   */
  getElement(): OpenTUIElement {
    return this.element
  }

  /**
   * Get element configuration
   */
  getConfig(): ElementConfig {
    return this.config
  }

  /**
   * Get element ID
   */
  getId(): string {
    return this.config.id
  }

  /**
   * Get element type
   */
  getType(): string {
    return this.config.type
  }

  /**
   * Mount element to parent
   */
  mount(parent: OpenTUIElement): void {
    if (this.parent) {
      this.unmount()
    }
    this.parent = parent as any
    parent.append(this.element)
    this.onMount()
  }

  /**
   * Unmount element from parent
   */
  unmount(): void {
    if (this.parent) {
      this.parent.unmount()
      this.parent = null
      this.onUnmount()
    }
  }

  /**
   * Called when element is mounted
   */
  protected onMount(): void {
    // To be overridden by subclasses
  }

  /**
   * Called when element is unmounted
   */
  protected onUnmount(): void {
    // To be overridden by subclasses
  }

  /**
   * Update element with new data
   */
  update(data: any): void {
    this.onUpdate(data)
  }

  /**
   * Handle update (to be implemented by subclasses)
   */
  protected abstract onUpdate(data: any): void

  /**
   * Handle keyboard input
   */
  handleInput(key: string): boolean {
    return this.onInput(key)
  }

  /**
   * Handle input (to be implemented by subclasses)
   */
  protected abstract onInput(key: string): boolean

  /**
   * Handle mouse event
   */
  handleMouse(event: any): boolean {
    return this.onMouse(event)
  }

  /**
   * Handle mouse event (to be implemented by subclasses)
   */
  protected abstract onMouse(event: any): boolean

  /**
   * Show element
   */
  show(): void {
    this.isVisible = true
    this.element.show()
  }

  /**
   * Hide element
   */
  hide(): void {
    this.isVisible = false
    this.element.hide()
  }

  /**
   * Focus element
   */
  focus(): void {
    this.isFocused = true
    this.element.focus()
    this.onFocus()
  }

  /**
   * Called when element gains focus
   */
  protected onFocus(): void {
    this.eventBus.emit('tui:element:focused', {
      id: this.config.id,
      type: this.config.type
    })
  }

  /**
   * Blur element
   */
  blur(): void {
    this.isFocused = false
    this.element.blur()
    this.onBlur()
  }

  /**
   * Called when element loses focus
   */
  protected onBlur(): void {
    this.eventBus.emit('tui:element:blurred', {
      id: this.config.id,
      type: this.config.type
    })
  }

  /**
   * Check if element is focused
   */
  isElementFocused(): boolean {
    return this.isFocused
  }

  /**
   * Check if element is visible
   */
  isElementVisible(): boolean {
    return this.isVisible
  }

  /**
   * Add child element
   */
  addChild(child: BaseElement): void {
    this.children.push(child)
    child.mount(this.element)
  }

  /**
   * Remove child element
   */
  removeChild(child: BaseElement): void {
    const index = this.children.indexOf(child)
    if (index > -1) {
      child.unmount()
      this.children.splice(index, 1)
    }
  }

  /**
   * Get all children
   */
  getChildren(): BaseElement[] {
    return [...this.children]
  }

  /**
   * Find child by ID
   */
  findChild(id: string): BaseElement | null {
    return this.children.find(child => child.getId() === id) || null
  }

  /**
   * Destroy element
   */
  destroy(): void {
    // Destroy all children first
    this.children.forEach(child => child.destroy())
    this.children = []

    // Unmount from parent
    this.unmount()

    // Clean up
    this.onDestroy()
  }

  /**
   * Called when element is destroyed
   */
  protected onDestroy(): void {
    this.eventBus.emit('tui:element:destroyed', {
      id: this.config.id,
      type: this.config.type
    })
  }

  /**
   * Update element properties
   */
  updateProps(props: Partial<ElementConfig>): void {
    this.config = { ...this.config, ...props }
    this.element.update(props as any)
  }
}
