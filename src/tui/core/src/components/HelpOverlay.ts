import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type HelpOverlayProps = BaseProps & {
  content: string;
  onClose?: () => void;
  title?: string;
  width?: string | number;
  height?: string | number;
};

export class HelpOverlay implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: HelpOverlayProps;
  private overlay: Widgets.BoxElement;

  constructor(props: HelpOverlayProps) {
    this.props = props;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      bg: 'black',
    }, 'help-overlay');

    this.overlay = comp.el;

    // Create help content box
    const el = blessed.box({
      parent: this.overlay,
      width: props.width || '80%',
      height: props.height || '80%',
      top: 'center',
      left: 'center',
      border: { type: 'line' },
      content: props.content,
      scrollable: true,
      alwaysScroll: true,
      label: props.title || ' Help '
    });

    // Setup keyboard shortcuts
    this.overlay.key(['escape', 'q'], () => {
      props.onClose?.();
      this.destroy();
    });

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

  // Method to set help content
  setContent(content: string) {
    this.props.content = content;
    this.el.setContent(content);
    this.el.screen.render();
  }

  // Method to set help title
  setTitle(title: string) {
    this.props.title = title;
    this.el.setLabel(` ${title} `);
    this.el.screen.render();
  }

  // Method to show overlay
  show() {
    this.overlay.show();
    this.el.screen.render();
  }

  // Method to hide overlay
  hide() {
    this.overlay.hide();
    this.el.screen.render();
  }

  // Method to close overlay
  close() {
    this.props.onClose?.();
    this.destroy();
  }

  // Static method to create help overlay with specific configuration
  static create(props: HelpOverlayProps): HelpOverlay {
    return new HelpOverlay(props);
  }
}


