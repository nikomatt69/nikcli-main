import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type ToastProps = BaseProps & {
  text: string;
  durationMs?: number;
  type?: 'info' | 'success' | 'warning' | 'error';
  position?: 'top' | 'bottom' | 'center';
  closable?: boolean;
  onClose?: () => void;
};

export class Toast implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: ToastProps;
  private timer?: NodeJS.Timeout;

  constructor(props: ToastProps) {
    this.props = props;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      bottom: props.position === 'bottom' ? 1 : undefined,
      top: props.position === 'top' ? 1 : undefined,
      left: 'center',
      width: 'shrink',
      height: 3,
      borderStyle: 'line',
      label: ` ${props.type || 'info'} `,
    }, 'toast');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = () => {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      comp.destroy();
    };
    this.baseComponent = comp;

    this.el.setContent(` ${props.text} `);
    this.applyTypeStyling();

    // Auto-close if duration is specified
    const duration = props.durationMs ?? 2000;
    if (duration > 0) {
      this.timer = setTimeout(() => this.destroy(), duration);
    }

    // Setup close handler if closable
    if (props.closable !== false) {
      this.el.key(['escape', 'q', 'enter', 'space'], () => {
        this.close();
      });
    }
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private applyTypeStyling() {
    const { type } = this.props;

    switch (type) {
      case 'success':
        this.el.style.border = { fg: 'green' };
        this.el.style.fg = 'green';
        break;
      case 'warning':
        this.el.style.border = { fg: 'yellow' };
        this.el.style.fg = 'yellow';
        break;
      case 'error':
        this.el.style.border = { fg: 'red' };
        this.el.style.fg = 'red';
        break;
      case 'info':
      default:
        this.el.style.border = { fg: 'blue' };
        this.el.style.fg = 'blue';
        break;
    }

    this.el.screen.render();
  }

  // Method to set toast text
  setText(text: string) {
    this.props.text = text;
    this.el.setContent(` ${text} `);
    this.el.screen.render();
  }

  // Method to set toast type
  setType(type: 'info' | 'success' | 'warning' | 'error') {
    this.props.type = type;
    this.el.setLabel(` ${type} `);
    this.applyTypeStyling();
  }

  // Method to set duration
  setDuration(durationMs: number) {
    this.props.durationMs = durationMs;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    if (durationMs > 0) {
      this.timer = setTimeout(() => this.destroy(), durationMs);
    }
  }

  // Method to set position
  setPosition(position: 'top' | 'bottom' | 'center') {
    this.props.position = position;

    if (position === 'top') {
      this.el.top = 1;
      this.el.bottom = undefined as any;
    } else if (position === 'bottom') {
      this.el.bottom = 1;
      this.el.top = undefined as any;
    } else {
      this.el.top = 'center';
      this.el.bottom = undefined as any;
    }

    this.el.screen.render();
  }

  // Method to set closable
  setClosable(closable: boolean) {
    this.props.closable = closable;

    if (closable) {
      this.el.key(['escape', 'q', 'enter', 'space'], () => {
        this.close();
      });
    } else {
      this.el.unkey(['escape', 'q', 'enter', 'space'] as any, () => {
        this.close();
      });
    }
  }

  // Method to close toast
  close() {
    if (this.props.onClose) {
      this.props.onClose();
    }
    this.destroy();
  }

  // Method to show toast
  show() {
    this.el.show();
    this.el.screen.render();
  }

  // Method to hide toast
  hide() {
    this.el.hide();
    this.el.screen.render();
  }

  // Method to pause auto-close
  pause() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  // Method to resume auto-close
  resume() {
    if (!this.timer && this.props.durationMs && this.props.durationMs > 0) {
      this.timer = setTimeout(() => this.destroy(), this.props.durationMs);
    }
  }

  // Method to get toast text
  getText(): string {
    return this.props.text;
  }

  // Method to get toast type
  getType(): 'info' | 'success' | 'warning' | 'error' {
    return this.props.type || 'info';
  }

  // Method to get remaining duration
  getRemainingDuration(): number {
    if (!this.timer || !this.props.durationMs) return 0;
    // Note: This is a simplified implementation
    // In a real scenario, you'd track the start time
    return this.props.durationMs;
  }

  // Static method to create toast with specific configuration
  static create(props: ToastProps): Toast {
    return new Toast(props);
  }

  // Static method to create info toast
  static info(text: string, durationMs?: number): Toast {
    return new Toast({ text, type: 'info', durationMs });
  }

  // Static method to create success toast
  static success(text: string, durationMs?: number): Toast {
    return new Toast({ text, type: 'success', durationMs });
  }

  // Static method to create warning toast
  static warning(text: string, durationMs?: number): Toast {
    return new Toast({ text, type: 'warning', durationMs });
  }

  // Static method to create error toast
  static error(text: string, durationMs?: number): Toast {
    return new Toast({ text, type: 'error', durationMs });
  }

  // Static method to create persistent toast
  static persistent(text: string, type?: 'info' | 'success' | 'warning' | 'error'): Toast {
    return new Toast({ text, type, durationMs: 0, closable: true });
  }
}


