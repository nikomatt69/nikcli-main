import type { Widgets } from 'blessed'
import { CAP } from '../theming/design-tokens'
import { type BaseProps, type Component, createBoxBase } from './BaseComponent'

// Unicode frames for modern terminals, ASCII fallback for legacy
const unicodeFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const asciiFrames = ['-', '\\', '|', '/']
const frames = CAP.unicode ? unicodeFrames : asciiFrames

export type SpinnerProps = BaseProps & {
  text?: string
  intervalMs?: number
}

export class Spinner implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement
  theme: any
  destroy: () => void
  private timer?: NodeJS.Timeout
  private idx = 0
  private baseComponent: any

  constructor(props: SpinnerProps) {
    const comp = createBoxBase<Widgets.BoxElement>(
      {
        ...props,
        borderStyle: 'none',
      },
      'spinner'
    )

    this.el = comp.el
    this.theme = comp.theme
    this.destroy = () => {
      this.stop()
      comp.destroy()
    }
    this.baseComponent = comp

    // Do not auto-start to avoid background timers when unused
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: any) => this.baseComponent.setVariant(variant)
  setSize = (size: any) => this.baseComponent.setSize(size)
  setState = (state: any) => this.baseComponent.setState(state)
  getConfig = () => this.baseComponent.getConfig()
  update = (props: any) => this.baseComponent.update(props)

  start(text?: string, intervalMs = 80) {
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => {
      this.el.setContent(`${frames[(this.idx = (this.idx + 1) % frames.length)]} ${text || ''}`)
      this.el.screen.render()
    }, intervalMs)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  // Static method to create spinner with specific configuration
  static create(props: SpinnerProps): Spinner {
    return new Spinner(props)
  }
}
