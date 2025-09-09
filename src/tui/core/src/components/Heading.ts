import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type HeadingProps = BaseProps & { text: string; level?: 1 | 2 | 3 };

export class Heading implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: HeadingProps;

  constructor(props: HeadingProps) {
    this.props = props;
    const comp = createBoxBase<Widgets.BoxElement>({ 
      ...props, 
      borderStyle: 'none' 
    }, 'heading');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;

    const level = props.level || 1;
    const prefix = level === 1 ? '## ' : level === 2 ? '# ' : '';
    this.el.setContent(prefix + props.text);
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: any) => this.baseComponent.setVariant(variant);
  setSize = (size: any) => this.baseComponent.setSize(size);
  setState = (state: any) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: any) => this.baseComponent.update(props);

  // Method to set heading text
  setText(text: string, level?: 1 | 2 | 3) {
    const headingLevel = level || this.props.level || 1;
    const prefix = headingLevel === 1 ? '## ' : headingLevel === 2 ? '# ' : '';
    this.el.setContent(prefix + text);
    this.el.screen.render();
  }

  // Method to set heading level
  setLevel(level: 1 | 2 | 3) {
    const prefix = level === 1 ? '## ' : level === 2 ? '# ' : '';
    const text = this.props.text;
    this.el.setContent(prefix + text);
    this.el.screen.render();
  }

  // Static method to create heading with specific configuration
  static create(props: HeadingProps): Heading {
    return new Heading(props);
  }
}


