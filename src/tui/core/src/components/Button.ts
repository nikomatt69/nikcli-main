import blessed, { type Widgets } from 'blessed'
import type { ComponentSize, ComponentState, ComponentVariant } from '../theming/design-tokens'
import { resolveTheme } from '../theming/theme'
import { getComponentTokens, mergeComponentStyles, type VariantProps } from '../utils/variants'
import { validateComponent } from '../validation/component-validator'
import { type BaseProps, type Component, computeBlessedStyle } from './BaseComponent'

// Button configuration for variants
const buttonConfig = {
  base: 'button',
  variants: {
    default: { style: 'default' },
    destructive: { style: 'destructive' },
    outline: { style: 'outline' },
    secondary: { style: 'secondary' },
    ghost: { style: 'ghost' },
    link: { style: 'link' },
    success: { style: 'success' },
    warning: { style: 'warning' },
    info: { style: 'info' },
  },
  sizes: {
    xs: { width: 8, height: 1, padding: [0, 1] },
    sm: { width: 12, height: 2, padding: [0, 2] },
    md: { width: 16, height: 3, padding: [0, 3] },
    lg: { width: 20, height: 4, padding: [0, 4] },
    xl: { width: 24, height: 5, padding: [0, 5] },
  },
  states: {
    default: { style: 'default' },
    hover: { style: 'hover' },
    focus: { style: 'focus' },
    active: { style: 'active' },
    disabled: { style: 'disabled' },
    loading: { style: 'loading' },
  },
  defaultVariants: {
    variant: 'default',
    size: 'md',
    state: 'default',
  },
}

export type ButtonProps = BaseProps &
  VariantProps<{
    text: string
    onClick?: () => void
    loading?: boolean
    loadingText?: string
    icon?: string
    iconPosition?: 'left' | 'right'
    fullWidth?: boolean
    blessedProps?: Partial<Widgets.ButtonOptions>
  }>

export class Button implements Component<Widgets.ButtonElement> {
  el: Widgets.ButtonElement
  theme: any
  destroy: () => void
  private props: ButtonProps
  private currentVariant: ComponentVariant
  private currentSize: ComponentSize
  private currentState: ComponentState
  private clickHandler?: () => void

  constructor(props: ButtonProps) {
    // Validate props using Zod schema
    const validation = validateComponent('button', props)
    if (!validation.success) {
      console.error('Invalid button props:', validation.errors?.issues)
      throw new Error(`Invalid button props: ${validation.errors?.issues.map((i) => i.message).join(', ')}`)
    }

    this.props = props
    this.currentVariant = props.variant || (buttonConfig.defaultVariants.variant! as ComponentVariant)
    this.currentSize = props.size || (buttonConfig.defaultVariants.size! as ComponentSize)
    this.currentState = props.state || (buttonConfig.defaultVariants.state! as ComponentState)

    const theme = resolveTheme(props.theme)
    const componentTokens = getComponentTokens('button', this.currentVariant, this.currentSize)

    // Merge styles based on variants
    const baseStyle = computeBlessedStyle(theme, props)
    const variantStyle = componentTokens
    const sizeStyle = buttonConfig.sizes[this.currentSize]

    const mergedStyle = mergeComponentStyles(baseStyle, variantStyle, sizeStyle, props.blessedProps?.style || {})

    // Apply size-based dimensions
    const sizeConfig = buttonConfig.sizes[this.currentSize]
    const width = props.fullWidth ? '100%' : props.width || sizeConfig.width
    const height = props.height || sizeConfig.height

    // Create button element
    const el = blessed.button({
      parent: props.parent,
      content: this.getButtonContent(),
      mouse: props.mouse ?? true,
      keys: props.keys ?? true,
      focusable: props.focusable ?? true,
      shrink: !props.fullWidth,
      border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
      style: mergedStyle,
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width,
      height,
      label: props.label,
      padding: sizeConfig.padding as any,
      ...props.blessedProps,
    })

    // Track click handler to allow proper add/remove without leaks
    this.clickHandler = props.onClick
    if (this.clickHandler && !props.disabled) {
      el.on('press', this.clickHandler)
    }

    this.el = el
    this.theme = theme
    this.destroy = () => el.destroy()
  }

  private getButtonContent(): string {
    const { text, loading, loadingText, icon, iconPosition, disabled } = this.props

    if (loading) {
      return loadingText || 'Loading...'
    }

    if (disabled) {
      return `[${text}]`
    }

    let content = text

    if (icon) {
      if (iconPosition === 'left') {
        content = `${icon} ${content}`
      } else {
        content = `${content} ${icon}`
      }
    }

    return ` ${content} `
  }

  // Method to update button variant
  setVariant(variant: ComponentVariant) {
    this.currentVariant = variant
    const componentTokens = getComponentTokens('button', variant, this.currentSize)
    this.updateButtonStyle(componentTokens)
  }

  // Method to update button size
  setSize(size: ComponentSize) {
    this.currentSize = size
    const componentTokens = getComponentTokens('button', this.currentVariant, size)
    const sizeConfig = buttonConfig.sizes[size]

    this.el.width = sizeConfig.width
    this.el.height = sizeConfig.height
    // Note: ButtonElement doesn't support padding property
    // Padding is handled through the style object instead

    this.updateButtonStyle(componentTokens)
  }

  // Method to update button state
  setState(state: ComponentState) {
    this.currentState = state
    const stateConfig = buttonConfig.states[state]
    this.updateButtonStyle(stateConfig)
  }

  // Method to update button text
  setText(text: string) {
    this.props.text = text
    this.el.setContent(this.getButtonContent())
    this.el.screen.render()
  }

  // Method to set loading state
  setLoading(loading: boolean, loadingText?: string) {
    this.props.loading = loading
    if (loadingText) {
      this.props.loadingText = loadingText
    }
    this.el.setContent(this.getButtonContent())
    this.el.screen.render()
  }

  // Method to enable/disable button
  setDisabled(disabled: boolean) {
    this.props.disabled = disabled
    this.el.setContent(this.getButtonContent())

    if (this.clickHandler) {
      // Ensure we remove previous handler when disabling
      this.el.off('press', this.clickHandler)
    }
    if (!disabled && this.clickHandler) {
      // Reattach when enabling
      this.el.on('press', this.clickHandler)
    }

    this.el.screen.render()
  }

  // Method to update button icon
  setIcon(icon: string, position?: 'left' | 'right') {
    this.props.icon = icon
    if (position) {
      this.props.iconPosition = position
    }
    this.el.setContent(this.getButtonContent())
    this.el.screen.render()
  }

  // Private method to update button style
  private updateButtonStyle(styleOverrides: Record<string, any>) {
    const theme = resolveTheme(this.props.theme)
    const baseStyle = computeBlessedStyle(theme, this.props)
    const variantStyle = getComponentTokens('button', this.currentVariant, this.currentSize)

    const mergedStyle = mergeComponentStyles(baseStyle, variantStyle, styleOverrides)

    this.el.style = mergedStyle
    this.el.screen.render()
  }

  // Method to get current button configuration
  getConfig() {
    return {
      theme: this.theme,
      variant: this.currentVariant,
      size: this.currentSize,
      state: this.currentState,
      disabled: this.props.disabled,
      loading: this.props.loading,
      fullWidth: this.props.fullWidth,
    }
  }

  // Method to update button properties
  update(props: Partial<ButtonProps>) {
    Object.assign(this.props, props)

    if (props.variant) this.setVariant(props.variant)
    if (props.size) this.setSize(props.size)
    if (props.state) this.setState(props.state)
    if (props.text) this.setText(props.text)
    if (props.disabled !== undefined) this.setDisabled(props.disabled)
    if (props.loading !== undefined) this.setLoading(props.loading)
    if (props.icon) this.setIcon(props.icon, props.iconPosition)
    // Update click handler if changed
    if (props.onClick !== undefined) {
      if (this.clickHandler) {
        this.el.off('press', this.clickHandler)
      }
      this.clickHandler = props.onClick || undefined
      if (!this.props.disabled && this.clickHandler) {
        this.el.on('press', this.clickHandler)
      }
    }

    this.el.screen.render()
  }

  // Static method to create button with specific configuration
  static create(props: ButtonProps): Button {
    return new Button(props)
  }

  // Static method to create button group
  static createGroup(
    buttons: ButtonProps[],
    options?: {
      direction?: 'horizontal' | 'vertical'
      spacing?: number
    }
  ): Button[] {
    const { direction = 'horizontal', spacing = 1 } = options || {}
    const buttonInstances: Button[] = []

    buttons.forEach((buttonProps, index) => {
      const button = new Button(buttonProps)

      if (index > 0) {
        if (direction === 'horizontal') {
          button.el.left = (buttonInstances[index - 1].el.left as any) + buttonInstances[index - 1].el.width + spacing
        } else {
          button.el.top = (buttonInstances[index - 1].el.top as any) + buttonInstances[index - 1].el.height + spacing
        }
      }

      buttonInstances.push(button)
    })

    return buttonInstances
  }
}
