import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type ScrollableProps = BaseProps & { content?: string };

export class Scrollable implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: ScrollableProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, scrollable: true });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    if (props.content) this.el.setContent(props.content);
  }
}
