import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type HeadingProps = BaseProps & { text: string; level?: 1 | 2 | 3 };

export class Heading implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: HeadingProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, borderStyle: 'none' });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    const level = props.level || 1;
    const prefix = level === 1 ? '## ' : level === 2 ? '# ' : '';
    this.el.setContent(prefix + props.text);
  }
}
