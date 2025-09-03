import blessed, { Widgets } from 'blessed';
import { BaseProps, Component } from './BaseComponent';

export type BadgeProps = BaseProps & { text: string };

export class Badge implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: BadgeProps) {
    const el = blessed.box({ parent: props.parent, height: 1, width: 'shrink', content: ` ${props.text} ` });
    this.el = el;
    this.theme = {};
    this.destroy = () => el.destroy();
  }
}
