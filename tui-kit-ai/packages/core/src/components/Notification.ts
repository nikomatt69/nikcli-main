import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type NotificationProps = BaseProps & { title?: string; message: string };

export class Notification implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: NotificationProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, borderStyle: 'line', label: props.title || ' Notification ' });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.el.setContent(props.message);
  }
}
