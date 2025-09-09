import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type NotificationProps = BaseProps & {
  title?: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  autoClose?: boolean;
};

export class Notification implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: NotificationProps;
  private timer?: NodeJS.Timeout;

  constructor(props: NotificationProps) {
    this.props = props;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: 'line',
      label: props.title || ' Notification '
    }, 'notification');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = () => {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      comp.destroy();
    };
    this.baseComponent = comp;

    this.el.setContent(props.message);
    this.applyTypeStyling();

    // Auto-close if enabled
    if (props.autoClose !== false && props.duration) {
      this.timer = setTimeout(() => {
        this.close();
      }, props.duration);
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

  // Method to set notification message
  setMessage(message: string) {
    this.props.message = message;
    this.el.setContent(message);
    this.el.screen.render();
  }

  // Method to set notification title
  setTitle(title: string) {
    this.props.title = title;
    this.el.setLabel(` ${title} `);
    this.el.screen.render();
  }

  // Method to set notification type
  setType(type: 'info' | 'success' | 'warning' | 'error') {
    this.props.type = type;
    this.applyTypeStyling();
  }

  // Method to set duration
  setDuration(duration: number) {
    this.props.duration = duration;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    if (this.props.autoClose !== false && duration) {
      this.timer = setTimeout(() => {
        this.close();
      }, duration);
    }
  }

  // Method to enable/disable auto close
  setAutoClose(autoClose: boolean) {
    this.props.autoClose = autoClose;

    if (autoClose && this.props.duration) {
      this.setDuration(this.props.duration);
    } else if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  // Method to close notification
  close() {
    this.destroy();
  }

  // Method to show notification
  show() {
    this.el.show();
    this.el.screen.render();
  }

  // Method to hide notification
  hide() {
    this.el.hide();
    this.el.screen.render();
  }

  // Method to get notification type
  getType(): 'info' | 'success' | 'warning' | 'error' {
    return this.props.type || 'info';
  }

  // Method to get notification message
  getMessage(): string {
    return this.props.message;
  }

  // Static method to create notification with specific configuration
  static create(props: NotificationProps): Notification {
    return new Notification(props);
  }

  // Static method to create info notification
  static info(message: string, title?: string): Notification {
    return new Notification({ message, title, type: 'info' });
  }

  // Static method to create success notification
  static success(message: string, title?: string): Notification {
    return new Notification({ message, title, type: 'success' });
  }

  // Static method to create warning notification
  static warning(message: string, title?: string): Notification {
    return new Notification({ message, title, type: 'warning' });
  }

  // Static method to create error notification
  static error(message: string, title?: string): Notification {
    return new Notification({ message, title, type: 'error' });
  }
}


