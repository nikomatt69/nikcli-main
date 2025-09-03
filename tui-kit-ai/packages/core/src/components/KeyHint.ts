import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type KeyHintProps = BaseProps & { hints: { key: string; label: string }[] };

export class KeyHint implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: KeyHintProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, borderStyle: 'none', height: 1 });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.el.setContent(props.hints.map(h => `[${h.key}] ${h.label}`).join('   '));
  }
}
