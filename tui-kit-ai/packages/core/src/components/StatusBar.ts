import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type StatusBarItem = { text: string };
export type StatusBarProps = BaseProps & { items: StatusBarItem[] };

export class StatusBar implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: StatusBarProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, borderStyle: 'none', height: 1 });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.renderItems(props.items);
  }

  renderItems(items: StatusBarItem[]) {
    this.el.setContent(items.map(i => i.text).join('  |  '));
    this.el.screen.render();
  }
}
