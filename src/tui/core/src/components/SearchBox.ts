import blessed, { type Widgets } from 'blessed'
import type { ComponentSize, ComponentState, ComponentVariant } from '../theming/design-tokens'
import { type BaseProps, type Component, createBoxBase } from './BaseComponent'

export type SearchBoxProps = BaseProps & {
  placeholder?: string
  onChange?: (value: string) => void
  onSearch?: (value: string) => void
  value?: string
  clearable?: boolean
  searchIcon?: string
  // Avoid Blessed double-processing input by default
  inputOnFocus?: boolean
}

export class SearchBox implements Component<Widgets.TextboxElement> {
  el!: Widgets.TextboxElement
  theme: any
  destroy: () => void
  private baseComponent: any
  private props: SearchBoxProps
  private searchContainer: Widgets.BoxElement

  constructor(props: SearchBoxProps) {
    this.props = props

    const comp = createBoxBase<Widgets.BoxElement>(
      {
        ...props,
        width: props.width || '100%',
        height: props.height || 3,
        borderStyle: 'line',
        label: ' Search ',
      },
      'search-box'
    )

    this.searchContainer = comp.el
    this.theme = comp.theme
    this.destroy = () => {
      this.el.destroy()
      comp.destroy()
    }
    this.baseComponent = comp

    this.createSearchInput()
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant)
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size)
  setState = (state: ComponentState) => this.baseComponent.setState(state)
  getConfig = () => this.baseComponent.getConfig()
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props)

  private createSearchInput() {
    const { placeholder, value, searchIcon = '🔍', clearable = true } = this.props

    // Create search icon
    if (searchIcon) {
      blessed.text({
        parent: this.searchContainer,
        content: searchIcon,
        top: 1,
        left: 2,
        style: { fg: this.theme.foreground },
      })
    }

    // Create input field
    const inputLeft = searchIcon ? 4 : 2
    this.el = blessed.textbox({
      parent: this.searchContainer,
      top: 1,
      left: inputLeft,
      right: clearable ? 8 : 2,
      height: 1,
      // Default to false to prevent duplicate key handling
      inputOnFocus: this.props.inputOnFocus ?? false,
      border: { type: 'line' },
      value: value || '',
      placeholder: placeholder || 'Search...',
      style: {
        bg: this.theme.background,
        fg: this.theme.foreground,
        border: { fg: this.theme.border },
      },
    })

    // Create clear button if clearable
    if (clearable) {
      const clearButton = blessed.button({
        parent: this.searchContainer,
        content: '✕',
        top: 1,
        right: 2,
        width: 3,
        height: 1,
        style: {
          bg: this.theme.muted,
          fg: this.theme.foreground,
        },
      })

      clearButton.on('press', () => {
        this.clear()
      })
    }

    this.setupEventHandlers()
  }

  private setupEventHandlers() {
    const { onChange, onSearch } = this.props

    // Handle input changes
    if (onChange) {
      this.el.on('input', () => {
        const value = this.getValue()
        onChange(value)
      })
    }

    // Handle search (enter key)
    if (onSearch) {
      // Use Blessed's submit event; avoid duplicating with keypress
      this.el.on('submit', () => {
        const value = this.getValue()
        onSearch(value)
      })
    }
  }

  // Method to get current search value
  getValue(): string {
    return this.el.getValue() || ''
  }

  // Method to set search value
  setValue(value: string) {
    this.props.value = value
    this.el.setValue(value)
    this.el.screen.render()
  }

  // Method to clear search
  clear() {
    this.setValue('')
    this.el.focus()
  }

  // Method to set placeholder
  setPlaceholder(placeholder: string) {
    this.props.placeholder = placeholder
    // Note: Blessed TextboxElement doesn't have a 'placeholder' property
    // Placeholder is handled through the initial value
    this.el.screen.render()
  }

  // Method to focus search box
  focus() {
    this.el.focus()
  }

  // Method to blur search box
  blur() {
    // Note: Blessed TextboxElement doesn't have a 'blur' method
    // Focus management is handled differently in Blessed
  }

  // Method to set search icon
  setSearchIcon(icon: string) {
    this.props.searchIcon = icon
    // Note: Would need to recreate the search container to update icon
    // For now, just store the new value
  }

  // Method to set clearable
  setClearable(clearable: boolean) {
    this.props.clearable = clearable
    // Note: Would need to recreate the search container to update clear button
    // For now, just store the new value
  }

  // Method to trigger search
  search() {
    const value = this.getValue()
    if (this.props.onSearch) {
      this.props.onSearch(value)
    }
  }

  // Method to check if search box is empty
  isEmpty(): boolean {
    return this.getValue().trim() === ''
  }

  // Method to get search box dimensions
  getDimensions(): { width: number; height: number } {
    return {
      width: this.el.width as number,
      height: this.el.height as number,
    }
  }

  // Method to set search box dimensions
  setDimensions(width: string | number, height: number) {
    this.props.width = width
    this.props.height = height
    this.searchContainer.width = width
    this.searchContainer.height = height
    this.el.screen.render()
  }

  // Method to show search box
  show() {
    this.searchContainer.show()
    this.el.screen.render()
  }

  // Method to hide search box
  hide() {
    this.searchContainer.hide()
    this.el.screen.render()
  }

  // Static method to create search box with specific configuration
  static create(props: SearchBoxProps): SearchBox {
    return new SearchBox(props)
  }

  // Static method to create simple search box
  static simple(placeholder?: string, onSearch?: (value: string) => void): SearchBox {
    return new SearchBox({ placeholder, onSearch })
  }

  // Static method to create search box with icon
  static withIcon(icon: string, placeholder?: string, onSearch?: (value: string) => void): SearchBox {
    return new SearchBox({ searchIcon: icon, placeholder, onSearch })
  }
}
