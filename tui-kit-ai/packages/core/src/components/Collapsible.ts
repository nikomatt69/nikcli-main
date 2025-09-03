import blessed, { Widgets } from 'blessed';
import { BaseProps, Component } from './BaseComponent';

export type CollapsibleProps = BaseProps & { title: string; content?: string };

export class Collapsible implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private body: Widgets.BoxElement;
  private open = true;

  constructor(props: CollapsibleProps) {
    const el = blessed.box({ parent: props.parent, border: { type: 'line' }, label: props.title });
    const body = blessed.box({ parent: el, top: 1, left: 1, right: 1, bottom: 1, content: props.content || '' });
    el.key(['space', 'enter'], () => this.toggle());
    this.el = el;
    this.body = body;
    this.theme = {};
    this.destroy = () => el.destroy();
  }

  toggle() {
    this.open = !this.open;
    this.body.hidden = !this.open;
    this.el.screen.render();
  }
}
