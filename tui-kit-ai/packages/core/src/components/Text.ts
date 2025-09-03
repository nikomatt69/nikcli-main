import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type TextProps = BaseProps & {
  text: string;
  align?: 'left' | 'center' | 'right';
  wrap?: boolean;
};

export class Text implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: TextProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, borderStyle: 'none' });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.el.setContent(props.text);
    // alignment and wrap are not enforced due to typings; content aligns via blessed defaults
  }
}
