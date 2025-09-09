import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type DividerProps = BaseProps & { 
  // Schema fields
  orientation?: 'horizontal' | 'vertical';
  text?: string;
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  // Back-compat
  char?: string; 
};

export class Divider implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: DividerProps;

  constructor(props: DividerProps) {
    this.props = props;
    const comp = createBoxBase<Widgets.BoxElement>({ 
      ...props, 
      borderStyle: 'none', 
      height: 1 
    }, 'divider');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;

    this.renderContent();
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: any) => this.baseComponent.setVariant(variant);
  setSize = (size: any) => this.baseComponent.setSize(size);
  setState = (state: any) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: any) => this.baseComponent.update(props);

  private renderContent() {
    const width = (this.el.width as number) || 50;
    const height = (this.el.height as number) || 1;
    const orientation = this.getOrientation();
    const ch = this.props.char || (orientation === 'vertical' ? '│' : '─');
    const txt = this.props.text;

    if (orientation === 'vertical') {
      const lines: string[] = [];
      for (let i = 0; i < Math.max(1, height - 2); i++) lines.push(ch);
      this.el.setContent(lines.join('\n'));
    } else {
      let line = ch.repeat(Math.max(1, width - 2));
      if (txt) {
        const mid = Math.max(0, Math.floor((line.length - txt.length) / 2));
        line = line.slice(0, mid) + txt + line.slice(mid + txt.length);
      }
      this.el.setContent(line);
    }
    this.el.screen.render();
  }

  private getOrientation(): 'horizontal' | 'vertical' {
    if (this.props.orientation) return this.props.orientation;
    // default to horizontal
    return 'horizontal';
  }

  setChar(char: string) {
    this.props.char = char;
    this.renderContent();
  }

  // Static method to create divider with specific configuration
  static create(props: DividerProps): Divider {
    return new Divider(props);
  }
}
