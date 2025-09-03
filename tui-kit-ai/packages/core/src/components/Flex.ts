import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type FlexProps = BaseProps & {
  direction?: 'row' | 'column';
  gap?: number;
};

export class Flex implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private direction: 'row' | 'column';
  private gap: number;

  constructor(props: FlexProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.box({ parent: props.parent, style: computeBlessedStyle(theme, props), border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined, top: props.top, left: props.left, right: props.right, bottom: props.bottom, width: props.width, height: props.height, label: props.label });
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
    this.direction = props.direction || 'row';
    this.gap = props.gap ?? 0;
    this.layout();
  }

  private layout() {
    const children = this.el.children as Widgets.BlessedElement[];
    let offset = 0;
    children.forEach((ch) => {
      if (this.direction === 'row') {
        ch.left = offset;
        ch.top = 0;
        offset += (typeof ch.width === 'number' ? ch.width : 10) + this.gap;
      } else {
        ch.top = offset;
        ch.left = 0;
        offset += (typeof ch.height === 'number' ? ch.height : 1) + this.gap;
      }
    });
    this.el.screen.render();
  }
}
