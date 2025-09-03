import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type ParagraphProps = BaseProps & { text: string; wrap?: boolean };

export class Paragraph implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: ParagraphProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, borderStyle: 'none' });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.el.setContent(props.text);
  }
}
