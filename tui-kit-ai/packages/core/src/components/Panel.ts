import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type PanelProps = BaseProps & { title?: string };

export class Panel implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: PanelProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, borderStyle: props.borderStyle || 'line', label: props.title || props.label });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
  }
}
