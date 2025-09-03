import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type DividerProps = BaseProps & { char?: string };

export class Divider implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: DividerProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, borderStyle: 'none', height: 1 });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    const width = typeof props.width === 'number' ? props.width : 50;
    const ch = props.char || '─';
    this.el.setContent(ch.repeat(Math.max(1, width - 2)));
  }
}
