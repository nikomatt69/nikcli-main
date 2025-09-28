import blessed, { type Widgets } from 'blessed'
import type { ComponentSize, ComponentState, ComponentVariant } from '../theming/design-tokens'
import { type BaseProps, type Component, createBoxBase } from './BaseComponent'

export type StatusBarItem = {
  text: string
  color?: string
  icon?: string
  clickable?: boolean
  onClick?: () => void
}

export type StatusBarProps = BaseProps & {
  items: StatusBarItem[]
  separator?: string
  showIcons?: boolean
  itemSpacing?: number
}

export class StatusBar implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement
  theme: any
  destroy: () => void
  private baseComponent: any
  private props: StatusBarProps
  private items: StatusBarItem[]
  private itemElements: Widgets.TextElement[] = []

  constructor(props: StatusBarProps) {
    this.props = props
    this.items = props.items

    const comp = createBoxBase<Widgets.BoxElement>(
      {
        ...props,
        borderStyle: 'none',
        height: 1,
      },
      'status-bar'
    )

    this.el = comp.el
    this.theme = comp.theme
    this.destroy = comp.destroy
    this.baseComponent = comp

    this.renderItems()
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant)
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size)
  setState = (state: ComponentState) => this.baseComponent.setState(state)
  getConfig = () => this.baseComponent.getConfig()
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props)

  private renderItems() {
    // Clear existing item elements
    this.itemElements.forEach((el) => el.destroy())
    this.itemElements = []

    const { separator = '  |  ', showIcons = false, itemSpacing = 2 } = this.props
    let currentLeft = 0

    this.items.forEach((item, _index) => {
      let content = ''

      if (showIcons && item.icon) {
        content += `${item.icon} `
      }

      content += item.text

      const itemElement = blessed.text({
        parent: this.el,
        content,
        top: 0,
        left: currentLeft,
        height: 1,
        style: {
          fg: item.color || this.theme.foreground,
        },
      })

      // Make item clickable if specified
      if (item.clickable && item.onClick) {
        itemElement.enableMouse()
        itemElement.on('click', item.onClick)

        // Add hover effect
        itemElement.on('mouseover', () => {
          itemElement.style.fg = this.theme.accent
          this.el.screen.render()
        })

        itemElement.on('mouseout', () => {
          itemElement.style.fg = item.color || this.theme.foreground
          this.el.screen.render()
        })
      }

      this.itemElements.push(itemElement)
      currentLeft += content.length + separator.length
    })

    this.el.screen.render()
  }

  // Method to set status bar items
  setItems(items: StatusBarItem[]) {
    this.items = items
    this.renderItems()
  }

  // Method to add item
  addItem(item: StatusBarItem) {
    this.items.push(item)
    this.renderItems()
  }

  // Method to remove item by index
  removeItem(index: number) {
    if (index >= 0 && index < this.items.length) {
      this.items.splice(index, 1)
      this.renderItems()
    }
  }

  // Method to update item
  updateItem(index: number, item: StatusBarItem) {
    if (index >= 0 && index < this.items.length) {
      this.items[index] = item
      this.renderItems()
    }
  }

  // Method to set item text
  setItemText(index: number, text: string) {
    if (index >= 0 && index < this.items.length) {
      this.items[index].text = text
      this.renderItems()
    }
  }

  // Method to set item color
  setItemColor(index: number, color: string) {
    if (index >= 0 && index < this.items.length) {
      this.items[index].color = color
      const itemEl = this.itemElements[index]
      if (itemEl) {
        itemEl.style = itemEl.style || {}
        itemEl.style.fg = color
        this.el.screen.render()
      } else {
        // If element not present yet, fallback to full render
        this.renderItems()
      }
    }
  }

  // Method to set item icon
  setItemIcon(index: number, icon: string) {
    if (index >= 0 && index < this.items.length) {
      this.items[index].icon = icon
      this.renderItems()
    }
  }

  // Method to set item clickable
  setItemClickable(index: number, clickable: boolean, onClick?: () => void) {
    if (index >= 0 && index < this.items.length) {
      this.items[index].clickable = clickable
      if (onClick) {
        this.items[index].onClick = onClick
      }
      this.renderItems()
    }
  }

  // Method to set separator
  setSeparator(separator: string) {
    this.props.separator = separator
    this.renderItems()
  }

  // Method to set show icons
  setShowIcons(show: boolean) {
    this.props.showIcons = show
    this.renderItems()
  }

  // Method to set item spacing
  setItemSpacing(spacing: number) {
    this.props.itemSpacing = spacing
    this.renderItems()
  }

  // Method to clear all items
  clearItems() {
    this.items = []
    this.renderItems()
  }

  // Method to get item count
  getItemCount(): number {
    return this.items.length
  }

  // Method to get item by index
  getItem(index: number): StatusBarItem | undefined {
    return this.items[index]
  }

  // Method to get all items
  getAllItems(): StatusBarItem[] {
    return [...this.items]
  }

  // Method to find item by text
  findItemByText(text: string): StatusBarItem | undefined {
    return this.items.find((item) => item.text === text)
  }

  // Method to get status bar width
  getStatusBarWidth(): number {
    return this.el.width as number
  }

  // Method to set status bar width
  setStatusBarWidth(width: number) {
    this.el.width = width
    this.renderItems()
  }

  // Static method to create status bar with specific configuration
  static create(props: StatusBarProps): StatusBar {
    return new StatusBar(props)
  }

  // Static method to create simple status bar
  static simple(items: string[]): StatusBar {
    const statusItems = items.map((text) => ({ text }))
    return new StatusBar({ items: statusItems })
  }

  // Static method to create status bar with icons
  static withIcons(items: (StatusBarItem & { icon: string })[]): StatusBar {
    return new StatusBar({ items, showIcons: true })
  }
}
