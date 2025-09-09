import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';
import { resolveTheme } from '../theming/theme';

export type ModalProps = BaseProps & {
  title?: string;
  content?: string;
  onClose?: () => void;
  width?: string | number;
  height?: string | number;
  closable?: boolean;
};

export class Modal implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: ModalProps;
  private overlay: Widgets.BoxElement;

  constructor(props: ModalProps) {
    this.props = props;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      bg: 'black',


    }, 'modal');

    this.overlay = comp.el;

    // Create modal content box
    const el = blessed.box({
      parent: this.overlay,
      width: props.width || '70%',
      height: props.height || '60%',
      top: 'center',
      left: 'center',
      border: 'line',
      label: props.title || ' Modal '
    });

    if (props.content) {
      el.setContent(props.content);
    }

    // Setup keyboard shortcuts if closable
    if (props.closable !== false) {
      this.overlay.key(['escape', 'q'], () => {
        props.onClose?.();
        this.destroy();
      });
    }

    this.el = el;
    this.theme = comp.theme;
    this.destroy = () => {
      el.destroy();
      comp.destroy();
    };
    this.baseComponent = comp;
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  // Method to set modal content
  setContent(content: string) {
    this.props.content = content;
    this.el.setContent(content);
    this.el.screen.render();
  }

  // Method to set modal title
  setTitle(title: string) {
    this.props.title = title;
    this.el.setLabel(` ${title} `);
    this.el.screen.render();
  }

  // Method to set modal dimensions
  setDimensions(width: string | number, height: string | number) {
    this.props.width = width;
    this.props.height = height;
    this.el.width = width;
    this.el.height = height;
    this.el.screen.render();
  }

  // Method to show modal
  show() {
    this.overlay.show();
    this.el.screen.render();
  }

  // Method to hide modal
  hide() {
    this.overlay.hide();
    this.el.screen.render();
  }

  // Method to close modal
  close() {
    this.props.onClose?.();
    this.destroy();
  }

  // Method to set closable state
  setClosable(closable: boolean) {
    this.props.closable = closable;

    if (closable) {
      this.overlay.key(['escape', 'q'], () => {
        this.props.onClose?.();
        this.destroy();
      });
    } else {
      this.overlay.unkey(['escape', 'q'] as any,
        () => {
          this.props.onClose?.();
          this.destroy();
        }
      );
    }
  }

  // Method to add custom key handler
  addKeyHandler(key: string | string[], handler: () => void) {
    this.overlay.key(key, handler);
  }

  // Method to remove key handler
  removeKeyHandler(key: string | string[]) {
    this.overlay.unkey(key as any, () => {
      this.props.onClose?.();
      this.destroy();
    });
  }

  // Static method to create modal with specific configuration
  static create(props: ModalProps): Modal {
    return new Modal(props);
  }
}


