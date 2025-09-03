import blessed, { Widgets } from 'blessed';
import { BaseProps, Component } from './BaseComponent';

export type AvatarProps = BaseProps & { initials: string };

export class Avatar implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: AvatarProps) {
    const el = blessed.box({ parent: props.parent, width: 5, height: 3, border: { type: 'line' }, content: ` ${props.initials} ` });
    this.el = el;
    this.theme = {};
    this.destroy = () => el.destroy();
  }
}
