import blessed, { type Widgets } from 'blessed'
import type { ComponentSize, ComponentState, ComponentVariant } from '../theming/design-tokens'
import { type BaseProps, type Component, createBoxBase } from './BaseComponent'

export type PromptProps = BaseProps & {
  message: string
  onSubmit: (value: string) => void
  placeholder?: string
  defaultValue?: string
  onCancel?: () => void
  // Control focus behavior to avoid double input processing
  inputOnFocus?: boolean
}

export class Prompt implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement
  theme: any
  destroy: () => void
  private baseComponent: any
  private props: PromptProps
  private input!: Widgets.TextboxElement

  constructor(props: PromptProps) {
    this.props = props

    const comp = createBoxBase<Widgets.BoxElement>(
      {
        ...props,
        width: props.width || '70%',
        height: props.height || 7,
        top: 'center',
        left: 'center',
        borderStyle: 'line',
        label: ' Prompt ',
      },
      'prompt'
    )

    this.el = comp.el
    this.theme = comp.theme
    this.destroy = () => {
      this.input.destroy()
      comp.destroy()
    }
    this.baseComponent = comp

    this.setupPromptContent()
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant)
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size)
  setState = (state: ComponentState) => this.baseComponent.setState(state)
  getConfig = () => this.baseComponent.getConfig()
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props)

  private setupPromptContent() {
    const { message, placeholder, defaultValue, onCancel } = this.props

    // Add message text
    blessed.text({
      parent: this.el,
      content: message,
      top: 1,
      left: 2,
      style: { fg: this.theme.foreground },
    })

    // Create input field
    this.input = blessed.textbox({
      parent: this.el,
      top: 3,
      left: 2,
      right: 2,
      height: 3,
      // Default false to prevent Blessed double key interpretation
      inputOnFocus: this.props.inputOnFocus ?? false,
      border: { type: 'line' },
      value: defaultValue || '',
      placeholder: placeholder || '',
    })

    // Setup event handlers
    this.input.key(['enter'], () => {
      const value = this.input.getValue() || ''
      this.props.onSubmit(value)
      this.destroy()
    })

    if (onCancel) {
      this.input.key(['escape'], () => {
        onCancel()
        this.destroy()
      })
    }

    // Focus the input
    this.input.focus()
  }

  // Method to set prompt message
  setMessage(message: string) {
    this.props.message = message
    const messageText = this.el.children?.[0] as Widgets.TextElement
    if (messageText) {
      messageText.setContent(message)
      this.el.screen.render()
    }
  }

  // Method to set input value
  setValue(value: string) {
    this.input.setValue(value)
    this.el.screen.render()
  }

  // Method to get input value
  getValue(): string {
    return this.input.getValue() || ''
  }

  // Method to set placeholder
  setPlaceholder(placeholder: string) {
    this.props.placeholder = placeholder
    // Note: Blessed TextboxElement doesn't have a 'placeholder' property
    // Placeholder is handled through the initial value
    this.el.screen.render()
  }

  // Method to set default value
  setDefaultValue(value: string) {
    this.props.defaultValue = value
    this.input.setValue(value)
    this.el.screen.render()
  }

  // Method to focus input
  focus() {
    this.input.focus()
  }

  // Method to blur input
  blur() {
    // Note: Blessed TextboxElement doesn't have a 'blur' method
    // Focus management is handled differently in Blessed
  }

  // Method to clear input
  clear() {
    this.input.setValue('')
    this.el.screen.render()
  }

  // Method to submit programmatically
  submit() {
    const value = this.getValue()
    this.props.onSubmit(value)
    this.destroy()
  }

  // Method to cancel programmatically
  cancel() {
    if (this.props.onCancel) {
      this.props.onCancel()
    }
    this.destroy()
  }

  // Method to set prompt dimensions
  setDimensions(width: string | number, height: number) {
    this.props.width = width
    this.props.height = height
    this.el.width = width
    this.el.height = height
    this.el.screen.render()
  }

  // Method to show prompt
  show() {
    this.el.show()
    this.focus()
    this.el.screen.render()
  }

  // Method to hide prompt
  hide() {
    this.el.hide()
    this.el.screen.render()
  }

  // Static method to create prompt with specific configuration
  static create(props: PromptProps): Prompt {
    return new Prompt(props)
  }

  // Static method to create simple text prompt
  static text(message: string, onSubmit: (value: string) => void): Prompt {
    return new Prompt({ message, onSubmit })
  }

  // Static method to create confirmation prompt
  static confirm(message: string, onConfirm: () => void, onCancel?: () => void): Prompt {
    return new Prompt({
      message: `${message} (y/n)`,
      onSubmit: (value) => {
        if (value.toLowerCase() === 'y' || value.toLowerCase() === 'yes') {
          onConfirm()
        } else if (onCancel) {
          onCancel()
        }
      },
      onCancel,
    })
  }
}
