import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type GridProps = BaseProps & {
  columns: number;
  rows: number;
  gap?: number;
};

export class Grid implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private columns: number;
  private rows: number;
  private gap: number;

  constructor(props: GridProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.box({ parent: props.parent, style: computeBlessedStyle(theme, props), border: props.borderStyle && props.borderStyle !== 'none' ? { type: props.borderStyle } : undefined, top: props.top, left: props.left, right: props.right, bottom: props.bottom, width: props.width, height: props.height, label: props.label });
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
    this.columns = props.columns;
    this.rows = props.rows;
    this.gap = props.gap ?? 0;
    this.layout();
  }

  private layout() {
    const children = this.el.children as Widgets.BlessedElement[];
    const cw = Math.floor((this.el.width as number) / this.columns) - this.gap;
    const ch = Math.floor((this.el.height as number) / this.rows) - this.gap;
    children.forEach((chEl, i) => {
      const r = Math.floor(i / this.columns);
      const c = i % this.columns;
      chEl.left = c * (cw + this.gap);
      chEl.top = r * (ch + this.gap);
      chEl.width = cw;
      chEl.height = ch;
    });
    this.el.screen.render();
  }
}
