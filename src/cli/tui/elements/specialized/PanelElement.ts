/**
 * Panel Element
 * Base element for all panel-type UI components
 */

import { eventBus } from '../../core/EventBus'
import { tuiState } from '../../core/TUIState'
import { BaseElement, type ElementConfig, type OpenTUIElement } from '../base/BaseElement'

export interface PanelElementConfig extends ElementConfig {
  type: 'panel'
  panelId?: string
  title?: string
  borderColor?: string
  pinned?: boolean
  closable?: boolean
  resizable?: boolean
  splittable?: boolean
  content?: string
  data?: any
}

export class PanelElement extends BaseElement {
  protected content: OpenTUIElement | null = null
  protected scrollable: OpenTUIElement | null = null
  protected titleBar: OpenTUIElement | null = null
  protected isPinned = false
  protected isClosed = false

  constructor(config: PanelElementConfig, eventBus: any, theme: any) {
    super({ ...config, type: 'panel' }, eventBus, theme)
    this.isPinned = config.pinned || false
  }

  protected createElement(): OpenTUIElement {
    // Mock OpenTUI element for now
    return {
      id: this.config.id,
      type: 'panel',
      parent: null,
      children: [],
      props: {
        width: this.config.width,
        height: this.config.height,
        border: this.config.border,
        style: this.config.style,
      },
      visible: this.config.hidden !== true,
      focused: false,

      append: (child: OpenTUIElement) => {
        child.parent = this.element
        this.element.children.push(child)
      },
      remove: (child: OpenTUIElement) => {
        const index = this.element.children.indexOf(child)
        if (index > -1) {
          this.element.children.splice(index, 1)
          child.parent = null
        }
      },
      clear: () => {
        this.element.children.forEach((child) => {
          child.parent = null
        })
        this.element.children = []
      },
      focus: () => {
        this.element.focused = true
      },
      blur: () => {
        this.element.focused = false
      },
      show: () => {
        this.element.visible = true
      },
      hide: () => {
        this.element.visible = false
      },
      update: (props: Record<string, any>) => {
        this.element.props = { ...this.element.props, ...props }
      },
      destroy: () => {
        this.content?.clear()
      },
    }
  }

  protected onMount(): void {
    // Create title bar
    this.createTitleBar()

    // Create content area
    this.createContentArea()

    // Register panel in state
    const panelId = (this.config as PanelElementConfig).panelId || this.config.id
    tuiState.registerPanel(panelId, this)
    tuiState.addPanel(panelId)

    eventBus.emit('tui:panel:mounted', {
      panelId,
      id: this.config.id,
      title: (this.config as PanelElementConfig).title,
    })
  }

  protected onUnmount(): void {
    const panelId = (this.config as PanelElementConfig).panelId || this.config.id
    tuiState.unregisterPanel(panelId)
    tuiState.removePanel(panelId)

    eventBus.emit('tui:panel:unmounted', {
      panelId,
      id: this.config.id,
    })
  }

  private createTitleBar(): void {
    // TODO: Create OpenTUI element for title bar
    const title = (this.config as PanelElementConfig).title || this.config.id

    // For now, just store the title
    if (!this.titleBar) {
      this.titleBar = {
        id: `${this.config.id}-title`,
        type: 'title',
        parent: this.element,
        children: [],
        props: { text: title },
        text: title,
        visible: true,
        focused: false,
        append: () => {},
        remove: () => {},
        clear: () => {},
        focus: () => {},
        blur: () => {},
        show: () => {},
        hide: () => {},
        update: () => {},
        destroy: () => {},
      }
      this.element.append(this.titleBar)
    }
  }

  private createContentArea(): void {
    // TODO: Create OpenTUI element for content area
    if (!this.content) {
      this.content = {
        id: `${this.config.id}-content`,
        type: 'content',
        parent: this.element,
        children: [],
        props: {
          scrollable: this.config.scrollable !== false,
        },
        visible: true,
        focused: false,
        append: (child: OpenTUIElement) => {
          child.parent = this.content!
          this.content!.children.push(child)
        },
        remove: (child: OpenTUIElement) => {
          const index = this.content!.children.indexOf(child)
          if (index > -1) {
            this.content!.children.splice(index, 1)
            child.parent = null
          }
        },
        clear: () => {
          this.content!.children.forEach((child) => {
            child.parent = null
          })
          this.content!.children = []
        },
        focus: () => {
          this.content!.focused = true
        },
        blur: () => {
          this.content!.focused = false
        },
        show: () => {
          this.content!.visible = true
        },
        hide: () => {
          this.content!.visible = false
        },
        update: (props: Record<string, any>) => {
          this.content!.props = { ...this.content!.props, ...props }
        },
        destroy: () => {
          this.content?.clear()
        },
      }
      this.element.append(this.content)
    }
  }

  protected onUpdate(data: any): void {
    // Handle different data types
    if (data.type === 'content') {
      this.updateContent(data.content)
    } else if (data.type === 'title') {
      this.updateTitle(data.title)
    } else if (data.type === 'pin') {
      this.pin()
    } else if (data.type === 'unpin') {
      this.unpin()
    }
  }

  protected onInput(key: string): boolean {
    // Handle panel-specific keyboard input
    switch (key) {
      case 'C-w':
        if ((this.config as PanelElementConfig).closable) {
          this.close()
          return true
        }
        break

      case 'C-p':
        this.togglePin()
        return true

      case 'C-s':
        if ((this.config as PanelElementConfig).splittable) {
          this.split()
          return true
        }
        break
    }

    return false
  }

  protected onMouse(event: any): boolean {
    // Handle panel-specific mouse events
    if (event.type === 'click') {
      // Focus panel on click
      this.focus()
      return true
    } else if (event.type === 'wheel') {
      // Handle scroll wheel
      if (this.scrollable) {
        // TODO: Implement scrolling
        return true
      }
    }

    return false
  }

  /**
   * Update panel title
   */
  updateTitle(title: string): void {
    ;(this.config as PanelElementConfig).title = title
    if (this.titleBar) {
      this.titleBar.text = title
      this.titleBar.update({ text: title })
    }
  }

  /**
   * Update panel content
   */
  updateContent(content: string): void {
    ;(this.config as PanelElementConfig).content = content
    if (this.content) {
      this.content.text = content
      this.content.update({ text: content })
    }
  }

  /**
   * Render file diff
   */
  renderDiff(oldContent: string, newContent: string): void {
    const diffElement = this.createDiffElement(oldContent, newContent)
    if (this.content) {
      this.content.clear()
      this.content.append(diffElement)
    }
  }

  private createDiffElement(oldContent: string, newContent: string): OpenTUIElement {
    // TODO: Create actual diff rendering
    return {
      id: `${this.config.id}-diff`,
      type: 'diff',
      parent: this.content!,
      children: [],
      props: { oldContent, newContent },
      text: `Diff:\nOld:\n${oldContent}\n\nNew:\n${newContent}`,
      visible: true,
      focused: false,
      append: () => {},
      remove: () => {},
      clear: () => {},
      focus: () => {},
      blur: () => {},
      show: () => {},
      hide: () => {},
      update: () => {},
      destroy: () => {},
    }
  }

  /**
   * Render file content
   */
  renderFile(filePath: string, content: string): void {
    const fileElement = this.createFileElement(filePath, content)
    if (this.content) {
      this.content.clear()
      this.content.append(fileElement)
    }
  }

  private createFileElement(filePath: string, content: string): OpenTUIElement {
    return {
      id: `${this.config.id}-file`,
      type: 'file',
      parent: this.content!,
      children: [],
      props: { filePath, content },
      text: `File: ${filePath}\n\n${content}`,
      visible: true,
      focused: false,
      append: () => {},
      remove: () => {},
      clear: () => {},
      focus: () => {},
      blur: () => {},
      show: () => {},
      hide: () => {},
      update: () => {},
      destroy: () => {},
    }
  }

  /**
   * Render list
   */
  renderList(items: string[]): void {
    const listElement = this.createListElement(items)
    if (this.content) {
      this.content.clear()
      this.content.append(listElement)
    }
  }

  private createListElement(items: string[]): OpenTUIElement {
    return {
      id: `${this.config.id}-list`,
      type: 'list',
      parent: this.content!,
      children: [],
      props: { items },
      text: items.map((item, i) => `${i + 1}. ${item}`).join('\n'),
      visible: true,
      focused: false,
      append: () => {},
      remove: () => {},
      clear: () => {},
      focus: () => {},
      blur: () => {},
      show: () => {},
      hide: () => {},
      update: () => {},
      destroy: () => {},
    }
  }

  /**
   * Render todos
   */
  renderTodos(todos: Array<{ id: string; text: string; completed: boolean }>): void {
    const todoElement = this.createTodoElement(todos)
    if (this.content) {
      this.content.clear()
      this.content.append(todoElement)
    }
  }

  private createTodoElement(todos: Array<{ id: string; text: string; completed: boolean }>): OpenTUIElement {
    return {
      id: `${this.config.id}-todos`,
      type: 'todos',
      parent: this.content!,
      children: [],
      props: { todos },
      text: todos.map((todo) => `${todo.completed ? '✓' : '○'} ${todo.text}`).join('\n'),
      visible: true,
      focused: false,
      append: () => {},
      remove: () => {},
      clear: () => {},
      focus: () => {},
      blur: () => {},
      show: () => {},
      hide: () => {},
      update: () => {},
      destroy: () => {},
    }
  }

  /**
   * Render agents
   */
  renderAgents(agents: Array<{ id: string; name: string; status: string }>): void {
    const agentElement = this.createAgentElement(agents)
    if (this.content) {
      this.content.clear()
      this.content.append(agentElement)
    }
  }

  private createAgentElement(agents: Array<{ id: string; name: string; status: string }>): OpenTUIElement {
    return {
      id: `${this.config.id}-agents`,
      type: 'agents',
      parent: this.content!,
      children: [],
      props: { agents },
      text: agents.map((agent) => `${agent.name} (${agent.status})`).join('\n'),
      visible: true,
      focused: false,
      append: () => {},
      remove: () => {},
      clear: () => {},
      focus: () => {},
      blur: () => {},
      show: () => {},
      hide: () => {},
      update: () => {},
      destroy: () => {},
    }
  }

  /**
   * Pin panel
   */
  pin(): void {
    this.isPinned = true
    ;(this.config as PanelElementConfig).pinned = true
    eventBus.emit('tui:panel:pinned', {
      panelId: (this.config as PanelElementConfig).panelId || this.config.id,
    })
  }

  /**
   * Unpin panel
   */
  unpin(): void {
    this.isPinned = false
    ;(this.config as PanelElementConfig).pinned = false
    eventBus.emit('tui:panel:unpinned', {
      panelId: (this.config as PanelElementConfig).panelId || this.config.id,
    })
  }

  /**
   * Toggle pin state
   */
  togglePin(): void {
    if (this.isPinned) {
      this.unpin()
    } else {
      this.pin()
    }
  }

  /**
   * Close panel
   */
  close(): void {
    if (!(this.config as PanelElementConfig).closable) return

    this.isClosed = true
    this.hide()
    eventBus.emit('tui:panel:closed', {
      panelId: (this.config as PanelElementConfig).panelId || this.config.id,
    })
  }

  /**
   * Split panel
   */
  split(direction: 'horizontal' | 'vertical' = 'vertical'): PanelElement | null {
    if (!(this.config as PanelElementConfig).splittable) return null

    eventBus.emit('tui:panel:split', {
      panelId: (this.config as PanelElementConfig).panelId || this.config.id,
      direction,
    })

    // TODO: Return new PanelElement instance
    return null
  }

  /**
   * Resize panel
   */
  resize(percent: number): void {
    // TODO: Implement resize logic
    eventBus.emit('tui:panel:resized', {
      panelId: (this.config as PanelElementConfig).panelId || this.config.id,
      percent,
    })
  }

  /**
   * Check if panel is pinned
   */
  isPanelPinned(): boolean {
    return this.isPinned
  }

  /**
   * Check if panel is closed
   */
  isPanelClosed(): boolean {
    return this.isClosed
  }

  protected onDestroy(): void {
    super.onDestroy()
    // Clean up child elements
    this.titleBar = null
    this.content = null
    this.scrollable = null
  }
}
