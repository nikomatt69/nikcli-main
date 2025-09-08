import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type CollapsibleProps = BaseProps & {
  title: string;
  content?: string;
  defaultOpen?: boolean;
};

export class Collapsible implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: CollapsibleProps;
  private body: Widgets.BoxElement;
  private open: boolean;

  constructor(props: CollapsibleProps) {
    this.props = props;
    this.open = props.defaultOpen ?? true;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: 'line',
      label: props.title,
    }, 'collapsible');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = () => {
      this.body.destroy();
      comp.destroy();
    };
    this.baseComponent = comp;

    // Create body content
    this.body = blessed.box({
      parent: this.el,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      content: props.content || ''
    });

    // Setup keyboard shortcuts
    this.el.key(['space', 'enter'], () => this.toggle());
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  toggle() {
    this.open = !this.open;
    this.body.hidden = !this.open;
    this.el.screen.render();
  }

  // Method to set content
  setContent(content: string) {
    this.props.content = content;
    this.body.setContent(content);
    this.el.screen.render();
  }

  // Method to set title
  setTitle(title: string) {
    this.props.title = title;
    this.el.setLabel(title);
    this.el.screen.render();
  }

  // Method to open/close programmatically
  setOpen(open: boolean) {
    this.open = open;
    this.body.hidden = !open;
    this.el.screen.render();
  }

  // Method to check if open
  isOpen(): boolean {
    return this.open;
  }

  // Static method to create collapsible with specific configuration
  static create(props: CollapsibleProps): Collapsible {
    return new Collapsible(props);
  }
}


