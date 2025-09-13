import blessed, { type Widgets } from 'blessed'
import type { ComponentSize, ComponentState, ComponentVariant } from '../theming/design-tokens'
import { type BaseProps, type Component, createBoxBase } from './BaseComponent'

export type CheckboxProps = BaseProps & {
  text?: string
  checked?: boolean
  onChange?: (checked: boolean) => void
}

export class Checkbox implements Component<Widgets.CheckboxElement> {
  el: Widgets.CheckboxElement
  theme: any
  destroy: () => void
  private baseComponent: any
  private props: CheckboxProps

  constructor(props: CheckboxProps) {
    this.props = props

    const comp = createBoxBase<Widgets.BoxElement>(
      {
        ...props,
        borderStyle: 'none',
      },
      'checkbox'
    )

    // Create checkbox element
    const el = blessed.checkbox({
      parent: comp.el,
      content: props.text,
      checked: props.checked ?? false,
      mouse: props.mouse ?? true,
      keys: props.keys ?? true,
      focusable: props.focusable ?? true,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: props.width,
      height: props.height,
      label: props.label,
      padding: props.padding as any,
    })

    if (props.onChange) {
      el.on('check', () => props.onChange!(true))
      el.on('uncheck', () => props.onChange!(false))
    }

    this.el = el
    this.theme = comp.theme
    this.destroy = () => {
      el.destroy()
      comp.destroy()
    }
    this.baseComponent = comp
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant)
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size)
  setState = (state: ComponentState) => this.baseComponent.setState(state)
  getConfig = () => this.baseComponent.getConfig()
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props)

  // Method to set checkbox text
  setText(text: string) {
    this.props.text = text
    this.el.setContent(text)
    this.el.screen.render()
  }

  // Method to set checked state
  setChecked(checked: boolean) {
    this.props.checked = checked
    this.el.checked = checked
    this.el.screen.render()
  }

  // Method to toggle checkbox
  toggle() {
    const newChecked = !this.el.checked
    this.setChecked(newChecked)
  }

  // Method to get current state
  isChecked(): boolean {
    return this.el.checked
  }

  // Static method to create checkbox with specific configuration
  static create(props: CheckboxProps): Checkbox {
    return new Checkbox(props)
  }
}
