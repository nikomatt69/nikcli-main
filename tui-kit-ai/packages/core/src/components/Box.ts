import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type BoxProps = BaseProps & {
  content?: string;
};

export class Box implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: BoxProps) {
    const comp = createBoxBase<Widgets.BoxElement>(props);
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    if (props.content) this.el.setContent(props.content);
  }
}
